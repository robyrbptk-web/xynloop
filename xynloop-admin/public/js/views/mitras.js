/** Registry mitra: daftar, penyaring, dan pembuatan calon/mitra. */
import { api } from '../api.js';
import { hBars } from '../charts.js';
import * as ui from '../ui.js';

const STATUS = ['prospek', 'penawaran', 'negosiasi', 'aktif', 'tidak_respon', 'ditolak', 'nonaktif'];
const STATUS_LABEL = {
  prospek: 'Prospek', penawaran: 'Penawaran', negosiasi: 'Negosiasi', aktif: 'Mitra aktif',
  tidak_respon: 'Tidak respon', ditolak: 'Ditolak', nonaktif: 'Nonaktif',
};
const CATEGORY = [
  { value: 'kertas', label: 'Kertas' },
  { value: 'jelantah', label: 'Jelantah' },
  { value: 'campur', label: 'Campur' },
];
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const SORTS = [
  { value: 'updated', label: 'Ubah terbaru' },
  { value: 'name', label: 'Nama' },
  { value: 'result', label: 'Hasil terbanyak' },
  { value: 'amount', label: 'Nilai tertinggi' },
];
const BATU_HARI = 21;

function num(v) {
  return ui.angka(Math.round(Number(v) || 0));
}

/** Umur (hari) sejak tanggal lokal; null bila kosong. */
function selisihHari(value) {
  if (!value) return null;
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function categoryBadge(cat) {
  return ui.badge(cat, (CATEGORY.find((c) => c.value === cat) || {}).label || cat);
}

function waBtn(phone) {
  const link = ui.waLink(phone);
  if (!link) return '';
  return `<a class="btn xs" href="${link}" target="_blank" rel="noopener" title="WhatsApp">WA</a>`;
}

function createFields(ctx) {
  const purchasing = (ctx.bootstrap?.users || []).filter((u) => u.role === 'purchasing');
  const fields = [
    { name: 'name', label: 'Nama mitra', required: true, placeholder: 'Nama usaha / perorangan', col: 1 },
    { name: 'category', label: 'Kategori', type: 'select', options: CATEGORY, value: 'kertas' },
    { name: 'contact_person', label: 'Narahubung', placeholder: 'Nama yang dihubungi' },
    { name: 'phone', label: 'Nomor telepon', type: 'tel', placeholder: '0812…', inputmode: 'numeric' },
    { name: 'area', label: 'Area / wilayah', placeholder: 'Mis. Pontianak Kota' },
    { name: 'address', label: 'Alamat', col: 1, placeholder: 'Alamat lengkap' },
    { name: 'expected_paper_kg', label: 'Perkiraan kertas (kg/ambil)', type: 'number', min: 0, step: 'any' },
    { name: 'expected_oil_l', label: 'Perkiraan jelantah (l/ambil)', type: 'number', min: 0, step: 'any' },
    { name: 'schedule_day', label: 'Hari pengambilan', type: 'select', options: HARI.map((h) => ({ value: h, label: h })) },
    { name: 'schedule_time', label: 'Jam pengambilan', type: 'time' },
    { name: 'quality_note', label: 'Catatan kualitas', col: 1, placeholder: 'Mis. kertas bersih, terpisah plastik' },
    { name: 'notes', label: 'Catatan', type: 'textarea', col: 1 },
  ];
  if (ctx.isManager()) {
    fields.splice(2, 0, {
      name: 'source_user_id',
      label: 'Karyawan penemu',
      type: 'select',
      placeholder: 'Tentukan karyawan',
      options: purchasing.map((u) => ({ value: u.id, label: u.name })),
      hint: 'Atribusi penemuan ke karyawan purchasing.',
    });
  }
  return fields;
}

async function openCreate(ctx, { defaultCategory = 'kertas', onDone } = {}) {
  ui.formDialog({
    title: 'Mitra baru',
    subtitle: 'Catat calon mitra baru. Status awal akan menjadi prospek.',
    size: 'wide',
    fields: createFields(ctx).map((f) => (f.name === 'category' ? { ...f, value: defaultCategory } : f)),
    okLabel: 'Simpan',
    onSubmit: async (vals) => {
      const res = await api.post('/api/mitras', vals);
      ui.toast('Mitra baru berhasil tercatat.', 'ok');
      if (onDone) onDone(res.mitra);
      else ctx.go(`/mitras/${res.mitra.id}`);
    },
  });
}

export default async function render(page, ctx) {
  page.innerHTML = ui.loading('Memuat data mitra…');
  const manager = ctx.isManager();
  const purchasing = (ctx.bootstrap?.users || []).filter((u) => u.role === 'purchasing');
  const areas = ctx.bootstrap?.areas || [];

  const p = ctx.params.q;
  const state = {
    q: p.get('q') || '',
    status: p.get('status') || '',
    category: p.get('category') || '',
    source_user_id: p.get('source_user_id') || '',
    area: p.get('area') || '',
    mine: p.get('mine') === '1',
    need_pickup: p.get('need_pickup') === '1',
    include_inactive: p.get('include_inactive') === '1',
    sort: p.get('sort') || 'updated',
  };

  ctx.setTopbarActions(
    ctx.can('mitras.manage') ? '<button type="button" class="btn sm pri" data-act="new">+ Mitra baru</button>' : '',
  );

  function buildQuery() {
    const usp = new URLSearchParams();
    if (state.q) usp.set('q', state.q);
    if (state.status) usp.set('status', state.status);
    if (state.category) usp.set('category', state.category);
    if (state.source_user_id) usp.set('source_user_id', state.source_user_id);
    if (state.area) usp.set('area', state.area);
    if (state.mine) usp.set('mine', '1');
    if (state.need_pickup) usp.set('need_pickup', '1');
    if (state.include_inactive || state.status === 'nonaktif') usp.set('include_inactive', '1');
    usp.set('sort', state.sort);
    return usp;
  }

  function filtersHtml() {
    return ui.filters(`
      ${ui.inputBox({ name: 'q', placeholder: 'Cari nama, telepon, alamat…', value: state.q })}
      ${ui.selectBox({ name: 'status', label: 'Status', options: STATUS.map((s) => ({ value: s, label: STATUS_LABEL[s] })), value: state.status })}
      ${ui.selectBox({ name: 'category', label: 'Kategori', options: CATEGORY, value: state.category })}
      ${manager ? ui.selectBox({ name: 'source_user_id', label: 'Penemu', options: purchasing.map((u) => ({ value: u.id, label: u.name })), value: state.source_user_id }) : ''}
      ${ui.selectBox({ name: 'area', label: 'Area', options: areas.map((a) => ({ value: a, label: a })), value: state.area })}
      ${ui.selectBox({ name: 'sort', label: 'Urutkan', options: SORTS, value: state.sort, all: false })}
      <div class="fld"><label class="chk"><input type="checkbox" data-filter="mine" ${state.mine ? 'checked' : ''}><span>Hanya saya</span></label></div>
      <div class="fld"><label class="chk"><input type="checkbox" data-filter="need_pickup" ${state.need_pickup ? 'checked' : ''}><span>Perlu dijadwalkan</span></label></div>
      <div class="fld"><label class="chk"><input type="checkbox" data-filter="include_inactive" ${state.include_inactive ? 'checked' : ''}><span>Sertakan arsip</span></label></div>
      <div class="fld"><button type="button" class="btn sm" data-act="reset-filter">Atur ulang</button></div>
    `);
  }

  function rowHtml(m) {
    const hariTerlewat = m.status === 'aktif' ? selisihHari(m.last_pickup) : null;
    const terlewat = hariTerlewat !== null && hariTerlewat > BATU_HARI;
    const tanpa = m.status === 'aktif' && hariTerlewat === null && (Number(m.pickup_count) || 0) === 0;
    const lastCell = m.last_pickup
      ? `${ui.tglPendek(m.last_pickup)}<div class="sm ${terlewat ? '' : 'muted'}">${ui.umur(m.last_pickup)}</div>`
      : '<span class="muted sm">belum ada</span>';
    return `<tr class="clk" data-id="${m.id}">
      <td class="mono">${ui.esc(m.code || '')}</td>
      <td>
        <div class="nm">${ui.esc(m.name)}</div>
        <div class="sm">${categoryBadge(m.category)}${m.contact_person ? ` · ${ui.esc(m.contact_person)}` : ''}</div>
        <div class="sm muted">${m.phone ? `${ui.esc(m.phone)}` : 'tanpa telepon'}</div>
      </td>
      <td>${m.area ? ui.esc(m.area) : '<span class="muted sm">—</span>'}</td>
      <td>${ui.badge(m.status)}${terlewat ? '<div class="sm" style="color:var(--red)">lewat &gt;21 hari</div>' : ''}${tanpa ? '<div class="sm muted">belum pernah diambil</div>' : ''}</td>
      <td class="sm">${m.source_user_name ? ui.esc(m.source_user_name) : '<span class="muted">—</span>'}</td>
      <td class="num">${num(m.paper_kg)}<div class="sm muted">${num(m.oil_liters)} l</div></td>
      <td class="num">${m.lifetime_amount ? ui.rp(m.lifetime_amount) : '<span class="muted">—</span>'}</td>
      <td class="num">${num(m.pickup_count)}</td>
      <td>${lastCell}</td>
      <td class="c">${m.phone ? waBtn(m.phone) : ''}</td>
    </tr>`;
  }

  function tableHtml(mitras) {
    if (!mitras.length) {
      return ui.empty(
        'Tidak ada mitra yang cocok.',
        ctx.can('mitras.manage') ? '<button type="button" class="btn pri sm" data-act="new" style="margin-top:10px">+ Mitra baru</button>' : '',
      );
    }
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Kode</th><th>Mitra</th><th>Area</th><th>Status</th><th>Penemu</th>
      <th class="num">Kertas</th><th class="num">Nilai</th><th class="num">Pengambilan</th><th>Terakhir</th><th class="c">Kontak</th>
    </tr></thead><tbody>${mitras.map(rowHtml).join('')}</tbody></table></div>`;
  }

  function kpiStripHtml(kpi) {
    if (!kpi) return '';
    const by = (s) => (kpi.pipeline.find((x) => x.status === s) || { total: 0 });
    const proses = by('penawaran').total + by('negosiasi').total;
    const mati = by('tidak_respon').total + by('ditolak').total;
    const users = (kpi.by_user || []).slice(0, 6).map((u) => ({
      label: u.name,
      value: u.aktif,
      sub: `${u.prospek} mitra tercatat`,
    }));
    const areaTop = (kpi.areas || []).slice(0, 5);
    return `
      <div class="grid g4">
        ${ui.kpi({ label: 'Prospek', value: num(by('prospek').total), hint: 'calon baru' })}
        ${ui.kpi({ label: 'Sedang diproses', value: num(proses), hint: 'penawaran & negosiasi', tone: 'amber' })}
        ${ui.kpi({ label: 'Mitra aktif', value: num(by('aktif').total), hint: `${num(kpi.totals.mitra)} total mitra`, tone: 'green' })}
        ${ui.kpi({ label: 'Macet / ditolak', value: num(mati), hint: 'tidak respon & menolak', tone: 'red' })}
      </div>
      <div class="grid g2" style="margin-top:14px">
        ${ui.card({ title: 'Konversi per karyawan', sub: 'mitra aktif dari yang ditemukan', body: users.length ? hBars({ rows: users }) : '<p class="muted sm">Belum ada data.</p>' })}
        ${ui.card({
    title: 'Sebaran wilayah',
    body: areaTop.length
      ? ui.list(areaTop.map((a) => ({ title: ui.esc(a.area), meta: `${num(a.n)} mitra`, right: ui.pill(`${num(a.aktif)} aktif`, 'green') })))
      : '<p class="muted sm">Belum ada data wilayah.</p>',
  })}
      </div>`;
  }

  let rows = [];
  let alive = true;

  async function loadList() {
    const body = document.getElementById('mitra-list-body');
    body.innerHTML = ui.loading();
    try {
      const res = await api.get(`/api/mitras?${buildQuery().toString()}`);
      rows = res.mitras || [];
      body.innerHTML = tableHtml(rows);
      const countEl = document.getElementById('mitra-count');
      if (countEl) countEl.textContent = `${num(rows.length)} mitra`;
    } catch (err) {
      body.innerHTML = `<p class="muted">${ui.esc(err.message || 'Data gagal dimuat.')}</p>`;
    }
  }

  async function loadKpi() {
    if (!manager) return;
    const el = document.getElementById('mitra-kpi');
    if (!el) return;
    try {
      const kpi = await api.get('/api/mitras/pipeline');
      kpi.totals = { mitra: kpi.pipeline.reduce((a, x) => a + (x.total || 0), 0) };
      el.innerHTML = kpiStripHtml(kpi);
    } catch {
      el.innerHTML = '';
    }
  }

  function mountShell() {
    page.innerHTML = `
      ${manager ? '<div id="mitra-kpi" style="margin-bottom:16px">' + ui.loading('Memuat ringkasan pipeline…') + '</div>' : ''}
      ${ui.card({
      title: 'Data mitra',
      sub: '<span id="mitra-count">memuat…</span>',
      actions: ctx.can('mitras.manage') ? '<button type="button" class="btn sm pri" data-act="new">+ Mitra baru</button>' : '',
      flush: true,
      body: `<div style="padding:15px 15px 0">${filtersHtml()}</div><div id="mitra-list-body" style="padding:0 15px 15px">${ui.loading()}</div>`,
    })}`;
    return Promise.all([loadList(), loadKpi()]);
  }

  await mountShell();

  ui.on(page, 'input', '[data-filter=q]', (ev, el) => {
    if (!alive) return;
    state.q = el.value.trim();
    loadList();
  });
  ui.on(page, 'change', '[data-filter]', (ev, el) => {
    if (!alive) return;
    const key = el.dataset.filter;
    if (key === 'q') return;
    state[key] = el.type === 'checkbox' ? el.checked : el.value;
    loadList();
  });

  ui.on(page, 'click', '[data-act]', (ev, el) => {
    if (!alive) return;
    const act = el.dataset.act;
    if (act === 'new') openCreate(ctx);
    else if (act === 'reset-filter') {
      Object.assign(state, { q: '', status: '', category: '', source_user_id: '', area: '', mine: false, need_pickup: false, include_inactive: false, sort: 'updated' });
      mountShell();
    }
  });

  ui.on(page, 'click', 'tr.clk', (ev, tr) => {
    if (!alive) return;
    const id = tr.dataset.id;
    if (id) ctx.go(`/mitras/${id}`);
  });

  return () => { alive = false; };
}
