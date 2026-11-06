/** Jejak audit: riwayat perubahan data oleh karyawan. */
import { api, query } from '../api.js';
import * as ui from '../ui.js';
import { card, empty, esc, loading, table } from '../ui.js';

const STEP = 100;
const CAP = 300;

const ACTION_LABEL = {
  login: 'Masuk',
  'password.change': 'Ganti password',
  'user.create': 'Buat akun',
  'user.update': 'Ubah akun',
  'user.reset_password': 'Reset password',
  'user.toggle': 'Aktif/nonaktif akun',
  'material.create': 'Buat material',
  'material.update': 'Ubah material',
  'material.toggle': 'Aktif/nonaktif material',
  'price.create': 'Tambah harga',
  'price.revise': 'Revisi harga',
  'vehicle.create': 'Tambah kendaraan',
  'vehicle.update': 'Ubah kendaraan',
  'vehicle.toggle': 'Aktif/nonaktif kendaraan',
  'fuel_price.create': 'Harga BBM baru',
  'settings.update': 'Ubah pengaturan',
  'mitra.create': 'Buat mitra',
  'mitra.update': 'Ubah mitra',
  'mitra.toggle': 'Aktif/nonaktif mitra',
  'visit.create': 'Catat kunjungan',
  'offer.create': 'Buat penawaran',
  'offer.update': 'Ubah penawaran',
  'offer.send': 'Kirim penawaran',
  'pickup.create': 'Buat pengambilan',
  'pickup.update': 'Ubah pengambilan',
  'pickup.complete': 'Selesai pengambilan',
  'pickup.cancel': 'Batal pengambilan',
  'receipt.create': 'Buat kwitansi',
  'receipt.update': 'Ubah kwitansi',
  'receipt.issue': 'Terbitkan kwitansi',
  'receipt.void': 'Batal kwitansi',
};

const ENTITY_LABEL = {
  user: 'Pengguna', mitra: 'Mitra', pickup: 'Pengambilan', receipt: 'Kwitansi',
  offer: 'Penawaran', material: 'Material', price: 'Harga', vehicle: 'Kendaraan',
  fuel_price: 'Harga BBM', setting: 'Pengaturan', attachment: 'Lampiran',
};

const ENTITY_ROUTE = { mitra: '/mitras', pickup: '/pengambilan' };

function actionLabel(key) {
  if (ACTION_LABEL[key]) return ACTION_LABEL[key];
  const parts = String(key).replace(/[._]/g, ' ').split(' ').filter(Boolean);
  if (!parts.length) return key;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function entityLabel(e) {
  return ENTITY_LABEL[e] || e || '—';
}

function metaText(meta) {
  if (meta === null || meta === undefined || meta === '') return '';
  if (typeof meta === 'string' || typeof meta === 'number' || typeof meta === 'boolean') return String(meta);
  if (Array.isArray(meta)) return meta.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  const parts = [];
  for (const [k, v] of Object.entries(meta)) {
    const val = v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    parts.push(`${k}: ${val}`);
  }
  return parts.join(' · ');
}

function entityCell(row) {
  const route = ENTITY_ROUTE[row.entity];
  const idLabel = row.entity_id != null ? `#${row.entity_id}` : '';
  if (route && row.entity_id != null) {
    return `<a class="lk" href="#${route}/${row.entity_id}">${esc(entityLabel(row.entity))}</a> <span class="sm muted mono">${esc(idLabel)}</span>`;
  }
  return `<span>${esc(entityLabel(row.entity))}</span>${idLabel ? ` <span class="sm muted mono">${esc(idLabel)}</span>` : ''}`;
}

export default async function render(page, ctx) {
  if (!ctx.can('audit.view')) {
    page.innerHTML = card({ body: `<p class="lead">Hanya admin/pemilik yang dapat membuka halaman ini.</p><a class="btn pri" href="#/">Kembali ke dashboard</a>` });
    return;
  }
  page.innerHTML = loading('Memuat jejak audit…');

  const users = (ctx.bootstrap && ctx.bootstrap.users) || [];
  const entities = Object.keys(ENTITY_LABEL);
  const state = { limit: STEP, user_id: '', entity: '', q: '' };
  let rows = [];

  function columns() {
    return [
      { label: 'Waktu', render: (r) => `<span class="nowrap">${ui.tglJam(r.created_at)}</span>` },
      { label: 'Siapa', render: (r) => (r.user_name ? esc(r.user_name) : '<span class="muted sm">sistem</span>') },
      { label: 'Aksi', render: (r) => `<div class="nm">${esc(actionLabel(r.action))}</div><div class="sm muted mono">${esc(r.action)}</div>` },
      { label: 'Entitas', render: (r) => entityCell(r) },
      { label: 'Detail', render: (r) => { const t = metaText(r.meta); return t ? `<span class="sm">${esc(t.length > 160 ? `${t.slice(0, 160)}…` : t)}</span>` : '<span class="muted sm">—</span>'; } },
    ];
  }

  function paint() {
    const q = state.q.trim().toLowerCase();
    const shown = q ? rows.filter((r) => String(r.action).toLowerCase().includes(q) || actionLabel(r.action).toLowerCase().includes(q)) : rows;
    document.getElementById('audit-body').innerHTML = shown.length
      ? table({ columns: columns(), rows: shown, emptyText: 'Tidak ada entri yang cocok.' })
      : empty(rows.length ? 'Tidak ada entri yang cocok dengan filter aksi.' : 'Belum ada aktivitas tercatat.');
    const info = document.getElementById('audit-info');
    if (info) info.textContent = rows.length
      ? `${ui.angka(rows.length)} entri dimuat${q ? ` · ${ui.angka(shown.length)} ditampilkan` : ''}${rows.length >= state.limit && state.limit < CAP ? ' · masih mungkin lebih banyak' : ''}`
      : 'Belum ada entri.';
    const more = document.getElementById('audit-more');
    if (more) {
      more.hidden = rows.length < state.limit;
      more.disabled = state.limit >= CAP;
    }
  }

  async function load() {
    document.getElementById('audit-body').innerHTML = loading();
    const params = { limit: state.limit };
    if (state.user_id) params.user_id = state.user_id;
    if (state.entity) params.entity = state.entity;
    const res = await api.get(`/api/reference/audit${query(params)}`);
    rows = res.audit || [];
    paint();
  }

  const filterBar = ui.filters(`
    ${ui.selectBox({ name: 'user', label: 'Karyawan', all: 'Semua karyawan', options: users.map((u) => ({ value: u.id, label: u.name })) })}
    ${ui.selectBox({ name: 'entity', label: 'Entitas', all: 'Semua entitas', options: entities.map((e) => ({ value: e, label: ENTITY_LABEL[e] })) })}
    ${ui.inputBox({ name: 'q', placeholder: 'Saring aksi (dari entri termuat)…' })}`);

  page.innerHTML = card({
    title: 'Jejak audit',
    sub: 'Setiap perubahan data tercatat permanen',
    body: `${filterBar}<div id="audit-body"></div>`,
    foot: `<div class="row"><span id="audit-info" class="sm muted"></span>
      <div class="end"><button type="button" id="audit-more" class="btn sm" hidden>Muat lebih banyak</button></div></div>`,
  });

  const root = page.querySelector('.card');
  ui.on(root, 'change', '[data-filter=user]', (ev, el) => { state.user_id = el.value; load(); });
  ui.on(root, 'change', '[data-filter=entity]', (ev, el) => { state.entity = el.value; load(); });
  ui.on(root, 'input', '[data-filter=q]', (ev, el) => { state.q = el.value; paint(); });
  ui.on(root, 'click', '#audit-more', () => {
    if (state.limit < CAP) { state.limit = Math.min(CAP, state.limit + STEP); load(); }
  });

  await load();
}
