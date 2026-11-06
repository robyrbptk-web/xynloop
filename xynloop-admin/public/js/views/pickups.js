/** Riwayat Pengambilan: daftar seluruh penjemputan dengan penyaring dan total. */
import { api, query } from '../api.js';
import * as ui from '../ui.js';

const STATUSES = ['terjadwal', 'dalam_perjalanan', 'menimbang', 'selesai', 'batal'];
const LIMITS = [{ value: '100', label: '100 teratas' }, { value: '150', label: '150 teratas' }, { value: '300', label: '300 teratas' }, { value: '400', label: '400 teratas' }];

export default async function render(page, ctx) {
  const manager = ctx.isManager();
  const canCosts = ctx.can('reports.costs');
  const canExport = ctx.can('reports.view_all');

  const state = {
    q: ctx.params.q.get('q') || '',
    status: ctx.params.q.get('status') || '',
    mitra_id: ctx.params.q.get('mitra_id') || '',
    from: ctx.params.q.get('from') || '',
    to: ctx.params.q.get('to') || '',
    date: ctx.params.q.get('date') || '',
    limit: ctx.params.q.get('limit') || '150',
    scope: manager ? (ctx.params.q.get('scope') || 'all') : 'all',
  };

  let mitraList = [];

  ctx.setTopbarActions(canExport
    ? '<button type="button" class="btn sm" data-act="export">Ekspor CSV</button>'
    : '');

  page.innerHTML = `<div id="pfilters">${ui.loading('Menyiapkan penyaring…')}</div>
    <div id="ptable">${ui.loading('Memuat riwayat pengambilan…')}</div>`;

  function filterBar() {
    const mitraOpts = [{ value: '', label: 'Semua mitra' }]
      .concat(mitraList.map((m) => ({ value: m.id, label: m.name })));
    return ui.filters(`
      ${ui.inputBox({ name: 'q', label: 'Cari', placeholder: 'Mitra, kode, wilayah…', value: state.q })}
      ${ui.selectBox({ name: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: ui.LABEL[s] })), value: state.status, all: 'Semua status' })}
      ${ui.selectBox({ name: 'mitra_id', label: 'Mitra', options: mitraOpts.slice(1), value: state.mitra_id, all: 'Semua mitra' })}
      ${ui.dateBox({ name: 'from', label: 'Dari tanggal', value: state.from })}
      ${ui.dateBox({ name: 'to', label: 'Sampai tanggal', value: state.to })}
      ${manager ? ui.selectBox({ name: 'scope', label: 'Lingkup', options: [{ value: 'all', label: 'Semua tim' }, { value: 'mine', label: 'Hanya saya' }], value: state.scope, all: '' }) : ''}
      ${ui.selectBox({ name: 'limit', label: 'Jumlah', options: LIMITS, value: state.limit, all: '' })}
      <div class="fld"><label>&nbsp;</label><button type="button" class="btn sm" data-act="reset">Atur ulang</button></div>`);
  }

  function readInputs() {
    const f = page.querySelector('#pfilters');
    const val = (n) => {
      const el = f.querySelector(`[data-filter="${n}"]`);
      return el ? String(el.value).trim() : '';
    };
    state.q = val('q');
    state.status = val('status');
    state.mitra_id = val('mitra_id');
    state.from = val('from');
    state.to = val('to');
    state.limit = val('limit') || '150';
    if (manager) state.scope = val('scope') || 'all';
  }

  function apiParams() {
    const p = { limit: state.limit };
    if (state.q) p.q = state.q;
    if (state.status) p.status = state.status;
    if (state.mitra_id) p.mitra_id = state.mitra_id;
    if (state.from) p.from = state.from;
    if (state.to) p.to = state.to;
    if (state.date && !state.from && !state.to) p.date = state.date;
    if (manager && state.scope === 'mine') p.mine = 1;
    return p;
  }

  const columns = [
    { label: 'Kode', render: (r) => `<div class="nm mono">${ui.esc(r.code || '—')}</div><div class="sm muted">${ui.tglPendek(r.date)}</div>` },
    { label: 'Mitra', render: (r) => `${ui.esc(r.mitra_name)}${r.mitra_area ? `<div class="sm muted">${ui.esc(r.mitra_area)}</div>` : ''}` },
    { label: 'Status', render: (r) => ui.badge(r.status) + (r.cancel_reason && r.status === 'batal' ? `<div class="sm muted">${ui.esc(r.cancel_reason)}</div>` : '') },
    { label: 'Kertas', align: 'right', render: (r) => r.item_lines ? ui.berat(r.paper_kg, 'kg') : '<span class="muted sm">—</span>' },
    { label: 'Jelantah', align: 'right', render: (r) => r.oil_liters ? ui.berat(r.oil_liters, 'l') : '<span class="muted sm">—</span>' },
    { label: 'Nilai', align: 'right', render: (r) => r.amount ? ui.rp(r.amount) : '<span class="muted sm">—</span>' },
    { label: 'Armada', render: (r) => r.vehicle_count ? `<span class="sm">${r.vehicle_count} mobil</span>${r.plates ? `<div class="sm muted mono">${ui.esc(r.plates)}</div>` : ''}` : '<span class="muted sm">—</span>' },
    { label: 'Kru', render: (r) => `<span class="sm">${ui.esc(r.crew_names || '—')}</span>` },
    { label: 'Kwitansi', render: (r) => r.receipt_status ? ui.badge(r.receipt_status, `Kwitansi ${ui.LABEL[r.receipt_status] || r.receipt_status}`) : '<span class="muted sm">tanpa</span>' },
  ];

  async function load() {
    const box = page.querySelector('#ptable');
    try {
      const res = await api.get('/api/pickups' + query(apiParams()));
      const rows = res.pickups || [];
      const t = res.totals || { paper_kg: 0, oil_liters: 0, amount: 0, runs: 0, fuel_cost: 0 };
      const stats = [
        { label: 'Pengambilan', value: ui.angka(t.runs) },
        { label: 'Total kertas', value: ui.berat(t.paper_kg, 'kg') },
        { label: 'Total jelantah', value: ui.berat(t.oil_liters, 'l') },
        { label: 'Nilai pembelian', value: ui.rp(t.amount) },
      ];
      if (canCosts) stats.push({ label: 'Total biaya BBM', value: ui.rp(t.fuel_cost) });
      const emptyHtml = ui.empty(
        'Tidak ada pengambilan sesuai penyaring.',
        '<button type="button" class="btn pri sm" data-act="reset">Atur ulang penyaring</button>',
      );
      box.innerHTML = ui.card({
        title: 'Hasil',
        sub: res.scope === 'mine' ? 'hanya tim Anda' : 'seluruh tim',
        flush: true,
        body: rows.length
          ? ui.table({ columns, rows, onRow: (r) => `/pengambilan/${r.id}`, emptyText: 'Tidak ada data.' })
          : emptyHtml,
        foot: rows.length ? ui.statRow(stats) : '',
      });
      box._rows = rows;
    } catch (err) {
      box.innerHTML = ui.empty('Data tidak dapat dimuat.');
      ui.toastError(err);
    }
  }

  async function ensureMitraOptions() {
    try {
      const res = await api.get('/api/mitras' + query({ limit: 500 }));
      mitraList = res.mitras || [];
    } catch {
      mitraList = [];
    }
  }

  function resetFilters() {
    state.q = ''; state.status = ''; state.mitra_id = ''; state.from = ''; state.to = '';
    state.date = ''; state.limit = '150';
    if (manager) state.scope = 'all';
    page.querySelector('#pfilters').innerHTML = filterBar();
    load();
  }

  function doExport() {
    const p = { type: 'pickups' };
    if (state.from) p.from = state.from;
    if (state.to) p.to = state.to;
    window.open('/api/reports/export' + query(p), '_blank', 'noopener');
  }

  function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (el && page.contains(el)) {
      if (el.dataset.act === 'reset') return resetFilters();
      if (el.dataset.act === 'export') return doExport();
    }
    const tr = ev.target.closest('tr.clk');
    if (tr) {
      const rows = page.querySelector('#ptable')._rows || [];
      const row = rows[Number(tr.dataset.idx)];
      if (row) ctx.go('/pengambilan/' + row.id);
    }
  }
  function onChange(ev) {
    if (!ev.target.closest('#pfilters [data-filter]')) return;
    readInputs();
    load();
  }

  await ensureMitraOptions();
  page.querySelector('#pfilters').innerHTML = filterBar();
  page.addEventListener('click', onClick);
  page.addEventListener('change', onChange);
  await load();

  return () => {
    page.removeEventListener('click', onClick);
    page.removeEventListener('change', onChange);
  };
}
