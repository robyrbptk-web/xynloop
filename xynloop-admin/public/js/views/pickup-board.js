/** Papan Penjemputan: siapa berangkat ke mana hari ini, dengan mobil dan kru apa. */
import { api, query } from '../api.js';
import * as ui from '../ui.js';

const STATUSES = ['terjadwal', 'dalam_perjalanan', 'menimbang', 'selesai', 'batal'];

function quickStep(p) {
  if (p.status === 'terjadwal') return { to: 'dalam_perjalanan', label: 'Berangkat' };
  if (p.status === 'dalam_perjalanan') return { to: 'menimbang', label: 'Timbang' };
  if (p.status === 'menimbang') return p.item_lines > 0 ? { to: 'selesai', label: 'Selesai' } : null;
  return null;
}

function tick(p, manager) {
  const q = quickStep(p);
  const weighed = p.item_lines > 0;
  const line = [];
  if (weighed) line.push(ui.berat(p.paper_kg, 'kg'));
  if (p.oil_liters > 0) line.push(ui.berat(p.oil_liters, 'l'));
  return `<div class="tick" data-act="open" data-id="${p.id}" role="button" tabindex="0">
    <div class="t">${ui.esc(p.mitra_name)}</div>
    <div class="m mono">${ui.esc(p.code || '—')}</div>
    <div class="m">${p.mitra_area ? ui.esc(p.mitra_area) : 'tanpa wilayah'}${p.scheduled_at ? ` · ${ui.jam(p.scheduled_at)}` : ''}</div>
    <div class="who">${ui.esc(p.crew_names || 'kru belum ditunjuk')}</div>
    ${p.plates ? `<div class="who mono">${ui.esc(p.plates)}</div>` : ''}
    ${line.length ? `<div class="row2">${ui.pill(line.join(' / '), weighed ? 'green' : 'grey')}${weighed && manager ? ` <span class="muted sm">${ui.rp(p.amount)}</span>` : ''}</div>` : ''}
    ${q ? `<div class="row2"><button type="button" class="btn xs lime" data-act="status" data-id="${p.id}" data-to="${q.to}">${q.label}</button></div>` : ''}
  </div>`;
}

export default async function render(page, ctx) {
  const manager = ctx.isManager();
  const canManage = ctx.can('pickups.manage');
  const canCosts = ctx.can('reports.costs');
  let date = ctx.params.q.get('date') || ui.tanggalIso(new Date());
  let scope = manager && ctx.params.q.get('scope') === 'all' ? 'all' : 'today';
  let mitrasCache = null;

  ctx.setTopbarActions('');
  page.innerHTML = `
    <div id="pbf"></div>
    <div id="pbb" style="margin-top:12px">${ui.loading('Memuat papan penjemputan…')}</div>
    <div id="pbs" style="margin-top:14px"></div>`;

  function filters() {
    return ui.filters(`
      <div class="fld"><label>Tanggal</label>
        <input type="date" data-filter="date" value="${ui.esc(date)}"></div>
      ${manager ? `<div class="fld"><label>Lingkup</label>
        <div class="btn-group">
          <button type="button" class="btn sm ${scope === 'today' ? 'on' : ''}" data-act="scope" data-scope="today">Hari ini</button>
          <button type="button" class="btn sm ${scope === 'all' ? 'on' : ''}" data-act="scope" data-scope="all">Semua</button>
        </div></div>` : ''}
      <div class="fld"><label>&nbsp;</label>
        <span class="muted sm">${scope === 'all' ? 'Seluruh tanggal, dikelompokkan per status' : ui.hariNama(date) + ', ' + ui.tgl(date)}</span></div>
      <div class="fld end"><label>&nbsp;</label>
        ${canManage ? '<button type="button" class="btn pri sm" data-act="new">+ Pengambilan</button>' : ''}</div>`);
  }

  function column(status, items) {
    return `<div class="col">
      <div class="ch">${ui.badge(status)} ${ui.LABEL[status] || status}<span class="n">${items.length}</span></div>
      <div class="cb">${items.length ? items.map((p) => tick(p, manager)).join('') : '<p class="muted sm ctr">Tidak ada.</p>'}</div>
    </div>`;
  }

  async function ensureMitras() {
    if (mitrasCache) return mitrasCache;
    const qs = manager ? { include_inactive: 1 } : { include_inactive: 1, mine: 1 };
    const res = await api.get('/api/mitras' + query(qs));
    mitrasCache = (res.mitras || []).filter((m) => m.status !== 'nonaktif');
    return mitrasCache;
  }

  async function openCreate() {
    let mitras = [];
    try {
      mitras = await ensureMitras();
    } catch (err) {
      return ui.toastError(err);
    }
    if (!mitras.length) return ui.toast('Belum ada mitra aktif untuk dijadwalkan.', 'warn');
    const options = mitras.map((m) => ({
      value: m.id,
      label: `${m.name}${m.area ? ` — ${m.area}` : ''}`,
    }));
    const leadOpts = (ctx.bootstrap.users || [])
      .filter((u) => u.role === 'crew' || u.role === 'purchasing')
      .map((u) => ({ value: u.id, label: u.name }));
    ui.formDialog({
      title: 'Pengambilan baru',
      subtitle: 'Jadwalkan penjemputan. Kru dan armada ditambahkan di halaman berikutnya.',
      okLabel: 'Buat & buka detail',
      size: 'wide',
      fields: [
        { name: 'mitra_id', label: 'Mitra tujuan', type: 'select', required: true, options, placeholder: 'Pilih mitra…', col: 1 },
        { name: 'date', label: 'Tanggal', type: 'date', required: true, value: date },
        { name: 'time', label: 'Jam dijadwalkan', type: 'time', hint: 'Opsional, untuk urutan di papan.' },
        { name: 'lead_user_id', label: 'Penanggung jawab', type: 'select', options: leadOpts, placeholder: 'Belakangkan' },
        { name: 'notes', label: 'Catatan', type: 'textarea', col: 1, placeholder: 'Alamat darurat, kontak, permintaan khusus…' },
      ],
      onSubmit: async (v) => {
        const body = { mitra_id: Number(v.mitra_id), date: v.date };
        if (v.time) body.scheduled_at = `${v.date} ${v.time}`;
        if (v.notes) body.notes = v.notes;
        if (v.lead_user_id) body.lead_user_id = Number(v.lead_user_id);
        const res = await api.post('/api/pickups', body);
        ui.toast('Pengambilan dijadwalkan.');
        ctx.go('/pengambilan/' + res.pickup.id);
      },
    });
  }

  async function setStatus(id, to, current) {
    const label = ui.LABEL[to] || to;
    const ok = await ui.confirmDialog({
      title: 'Ubah status',
      message: `Tandai pengambilan ini menjadi “${label}”?`,
      okLabel: 'Ya, ubah',
    });
    if (!ok) return;
    try {
      await api.post(`/api/pickups/${id}/status`, { status: to });
      ui.toast(`Status diperbarui: ${label}.`);
      ctx.refresh();
    } catch (err) {
      if (to === 'batal') return openCancel(id, current);
      ui.toastError(err);
    }
  }

  function openCancel(id) {
    ui.formDialog({
      title: 'Batalkan pengambilan',
      subtitle: 'Alasan pembatalan tersimpan pada riwayat.',
      okLabel: 'Batalkan pengambilan',
      size: 'thin',
      fields: [{ name: 'reason', label: 'Alasan', type: 'textarea', required: true, placeholder: 'Mis. mitra tidak dapat dihubungi.' }],
      onSubmit: async (v) => {
        await api.post(`/api/pickups/${id}/status`, { status: 'batal', reason: v.reason });
        ui.toast('Pengambilan dibatalkan.');
        ctx.refresh();
      },
    });
  }

  async function load() {
    const boardEl = page.querySelector('#pbb');
    const sumEl = page.querySelector('#pbs');
    try {
      const tasks = [
        scope === 'all'
          ? api.get('/api/pickups' + query({ limit: 400 }))
          : api.get('/api/pickups/board' + query({ date })),
        api.get('/api/pickups' + query({ date })),
      ];
      const [listRes, dayRes] = await Promise.all(tasks);
      const pickups = listRes.pickups || [];
      const groups = STATUSES.map((s) => ({ status: s, items: pickups.filter((p) => p.status === s) }));
      boardEl.innerHTML = `<div class="board">${groups.map((g) => column(g.status, g.items)).join('')}</div>`;

      const t = dayRes.totals || { paper_kg: 0, oil_liters: 0, amount: 0, runs: 0, fuel_cost: 0 };
      const stats = [
        { label: 'Pengambilan', value: ui.angka(t.runs) },
        { label: 'Kertas', value: ui.berat(t.paper_kg, 'kg') },
        { label: 'Jelantah', value: ui.berat(t.oil_liters, 'l') },
        { label: 'Nilai pembelian', value: ui.rp(t.amount) },
      ];
      if (canCosts) stats.push({ label: 'Biaya BBM', value: ui.rp(t.fuel_cost) });
      sumEl.innerHTML = ui.card({
        title: scope === 'all' ? `Ringkasan ${ui.tgl(date)}` : 'Ringkasan hari ini',
        body: ui.statRow(stats),
      });
    } catch (err) {
      boardEl.innerHTML = ui.empty('Papan tidak dapat dimuat.');
      ui.toastError(err);
    }
  }

  page.querySelector('#pbf').innerHTML = filters();

  function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el || !page.contains(el)) return;
    const act = el.dataset.act;
    if (act === 'open') return ctx.go('/pengambilan/' + el.dataset.id);
    if (act === 'new') return openCreate();
    if (act === 'scope') {
      scope = el.dataset.scope;
      page.querySelector('#pbf').innerHTML = filters();
      return load();
    }
    if (act === 'status') return setStatus(el.dataset.id, el.dataset.to);
  }
  function onChange(ev) {
    const el = ev.target.closest('[data-filter="date"]');
    if (!el) return;
    if (el.value) date = el.value;
    if (scope === 'all') scope = 'today';
    page.querySelector('#pbf').innerHTML = filters();
    load();
  }
  page.addEventListener('click', onClick);
  page.addEventListener('change', onChange);

  await load();
  const timer = setInterval(load, 45000);
  return () => {
    clearInterval(timer);
    page.removeEventListener('click', onClick);
    page.removeEventListener('change', onChange);
  };
}
