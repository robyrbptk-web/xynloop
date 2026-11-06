/** Harga: katalog material dan daftar harga pembelian. */
import { api } from '../api.js';
import * as ui from '../ui.js';
import { card, empty, esc, loading, table, umur } from '../ui.js';

const CATEGORIES = [
  { value: 'kertas', label: 'Kertas' },
  { value: 'jelantah', label: 'Minyak jelantah' },
];
const UNIT_FOR = { kertas: 'kg', jelantah: 'liter' };
const catLabel = (c) => (c === 'jelantah' ? 'Jelantah' : 'Kertas');

function materialFields(m) {
  return [
    { name: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'KR1', value: m ? m.code : '', hint: '1-6 karakter: huruf kapital dan angka.' },
    { name: 'name', label: 'Nama material', type: 'text', required: true, placeholder: 'mis. Kardus / Dus (OCC)', value: m ? m.name : '' },
    { name: 'category', label: 'Kategori', type: 'radio', required: true, options: CATEGORIES, value: m ? m.category : 'kertas', col: 1, hint: 'Kertas otomatis dijual per kg; minyak jelantah otomatis per liter. Satuan ditentukan oleh sistem.' },
    { name: 'default_price', label: 'Harga dasar (Rp)', type: 'money', required: true, value: m ? m.default_price : '', hint: 'Angka bulat Rupiah per kg (kertas) atau per liter (jelantah).' },
    { name: 'sort', label: 'Urutan tampil', type: 'number', min: 0, value: m ? m.sort : 0 },
    { name: 'notes', label: 'Catatan', type: 'textarea', rows: 2, col: 1, value: m ? m.notes || '' : '' },
  ];
}

export default async function render(page, ctx) {
  if (!ctx.can('prices.manage')) {
    page.innerHTML = card({ body: `<p class="lead">Hanya admin/pemilik yang dapat membuka halaman ini.</p><a class="btn pri" href="#/">Kembali ke dashboard</a>` });
    return;
  }
  page.innerHTML = loading('Memuat katalog material…');

  const today = (ctx.bootstrap && ctx.bootstrap.now ? String(ctx.bootstrap.now).slice(0, 10) : '') || ui.tanggalIso(new Date());
  const canWrite = ctx.can('prices.manage');
  let materials = [];

  ctx.setTopbarActions(canWrite ? '<button type="button" class="btn sm pri" data-act="mat-new">+ Tambah material</button>' : '');

  function columns() {
    const cols = [
      { label: 'Kode', render: (m) => `<span class="mono">${esc(m.code)}</span>` },
      { label: 'Nama', render: (m) => `<div class="nm">${esc(m.name)}</div>${m.notes ? `<div class="sm muted">${esc(m.notes)}</div>` : ''}` },
      { label: 'Kategori', render: (m) => ui.badge(m.category, catLabel(m.category)) },
      { label: 'Satuan', render: (m) => `<span class="sm">${esc(m.unit)}</span>` },
      { label: 'Harga hari ini', align: 'right', render: (m) => ui.rp(m.price) },
      { label: 'Urutan', align: 'center', render: (m) => ui.angka(m.sort) },
      { label: 'Status', align: 'center', render: (m) => ui.badge(m.is_active ? 'aktif' : 'nonaktif', m.is_active ? 'Aktif' : 'Nonaktif') },
    ];
    if (canWrite) {
      cols.push({
        label: '',
        align: 'right',
        render: (m) => `<div class="row" style="gap:6px;justify-content:flex-end">
          <button type="button" class="btn xs pri" data-act="price-edit" data-id="${m.id}">Ubah harga</button>
          <button type="button" class="btn xs" data-act="hist" data-id="${m.id}">Riwayat</button>
          <button type="button" class="btn xs" data-act="mat-edit" data-id="${m.id}">Edit</button>
          ${m.is_active
            ? `<button type="button" class="btn xs danger" data-act="mat-toggle" data-id="${m.id}">Nonaktifkan</button>`
            : `<button type="button" class="btn xs lime" data-act="mat-toggle" data-id="${m.id}">Aktifkan</button>`}
        </div>`,
      });
    } else {
      cols.push({ label: '', align: 'right', render: (m) => `<button type="button" class="btn xs" data-act="hist" data-id="${m.id}">Riwayat</button>` });
    }
    return cols;
  }

  function paint() {
    document.getElementById('mat-body').innerHTML = materials.length
      ? table({ columns: columns(), rows: materials, emptyText: 'Belum ada material.' })
      : empty('Belum ada material terdaftar.', canWrite ? '<button type="button" class="btn pri sm" data-act="mat-new">+ Tambah material</button>' : '');
    const total = materials.reduce((s, m) => s + (Number(m.price) || 0), 0);
    document.getElementById('mat-count').textContent = `${ui.angka(materials.length)} material · nilai katalog hari ini ${ui.rp(total)}`;
  }

  page.innerHTML = card({
    title: 'Katalog material & harga',
    actions: canWrite ? '<button type="button" class="btn sm pri" data-act="mat-new">+ Tambah material</button>' : '',
    body: '<div id="mat-body"></div>',
    foot: '<span id="mat-count" class="sm muted"></span>',
  });
  paint();

  async function reloadMaterials() {
    const r = await api.get('/api/reference/materials');
    materials = r.materials || [];
    paint();
  }

  async function loadHistory(m) {
    const d = ui.openDialog({ title: `Riwayat harga — ${m.name}`, size: 'wide', body: ui.loading('Memuat riwayat…') });
    try {
      const r = await api.get(`/api/reference/prices?material_id=${m.id}`);
      const rows = (r.prices || []).filter((p) => Number(p.material_id) === Number(m.id));
      d.body.innerHTML = `<div class="notebox">Satuan: <b>${esc(m.unit)}</b>. Harga tersimpan per tanggal efektif; tanggal terbaru berlaku sejak saat itu.</div>`
        + (rows.length
          ? table({
            columns: [
              { label: 'Berlaku sejak', render: (p) => `${ui.tgl(p.effective_from)}<div class="sm muted">${umur(p.effective_from)}</div>` },
              { label: 'Harga', align: 'right', render: (p) => `${ui.rp(p.price)} / ${esc(p.unit || m.unit)}` },
              { label: 'Diubah oleh', render: (p) => esc(p.created_by_name || 'Sistem') },
              { label: 'Catatan', render: (p) => (p.note ? `<span class="sm">${esc(p.note)}</span>` : '<span class="muted sm">—</span>') },
            ],
            rows,
            emptyText: 'Belum ada riwayat harga.',
          })
          : '<p class="muted sm">Belum ada riwayat harga untuk material ini.</p>');
    } catch (err) {
      d.body.innerHTML = `<p class="muted">${esc(err.message || 'Riwayat tidak dapat dimuat.')}</p>`;
      ui.toastError(err);
    }
  }

  async function onAct(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const id = Number(el.dataset.id);
    const m = materials.find((x) => x.id === id);

    if (act === 'hist') {
      if (m) loadHistory(m);
      return;
    }

    if (act === 'price-edit' && m) {
      ui.formDialog({
        title: `Ubah harga hari ini — ${m.name}`,
        subtitle: `Satuan ${m.unit}. Menyimpan pada tanggal efektif yang dipilih.`,
        fields: [
          { name: 'material', label: 'Material', type: 'static', value: `${m.code} — ${m.name}`, col: 1 },
          { name: 'price', label: 'Harga', type: 'money', required: true, value: m.price, hint: `Rupiah per ${m.unit}, angka bulat.` },
          { name: 'effective_from', label: 'Berlaku sejak', type: 'date', required: true, value: today },
          { name: 'note', label: 'Catatan', type: 'text', col: 1, placeholder: 'mis. penyesuaian harga pasar' },
        ],
        okLabel: 'Simpan harga',
        onSubmit: async (val) => {
          const body = { material_id: m.id, price: val.price, effective_from: val.effective_from, note: val.note || null };
          const res = await api.post('/api/reference/prices', body);
          await ctx.reloadBootstrap();
          await reloadMaterials();
          if (res && res.replaced) ui.toast(res.note || 'Entri harga tanggal ini sudah ada, jadi diperbarui (bukan diduplikasi).', 'ok');
          else ui.toast('Harga baru tersimpan.', 'ok');
        },
      });
      return;
    }

    if (act === 'mat-new' || act === 'mat-edit') {
      const edit = act === 'mat-edit';
      ui.formDialog({
        title: edit ? `Edit material — ${m.code}` : 'Tambah material',
        fields: materialFields(edit ? m : null),
        okLabel: edit ? 'Simpan' : 'Tambah',
        size: 'wide',
        onSubmit: async (val) => {
          const unit = UNIT_FOR[val.category];
          if (edit) {
            const body = { code: val.code, name: val.name, category: val.category, unit, default_price: val.default_price, sort: val.sort, notes: val.notes || null };
            await api.put(`/api/reference/materials/${m.id}`, body);
            ui.toast('Material diperbarui.', 'ok');
          } else {
            const body = { code: val.code, name: val.name, category: val.category, unit, default_price: val.default_price, sort: val.sort, notes: val.notes || null };
            await api.post('/api/reference/materials', body);
            ui.toast('Material ditambahkan beserta harga awalnya.', 'ok');
          }
          await ctx.reloadBootstrap();
          await reloadMaterials();
        },
      });
      return;
    }

    if (act === 'mat-toggle' && m) {
      const msg = m.is_active
        ? `Nonaktifkan ${m.name}? Material berhenti muncul pada penimbangan baru; riwayat tetap tersimpan.`
        : `Aktifkan kembali ${m.name}?`;
      if (!(await ui.confirmDialog({ title: m.is_active ? 'Nonaktifkan material' : 'Aktifkan material', message: msg, danger: m.is_active, okLabel: m.is_active ? 'Nonaktifkan' : 'Aktifkan' }))) return;
      try {
        await api.post(`/api/reference/materials/${m.id}/toggle`);
        await ctx.reloadBootstrap();
        await reloadMaterials();
        ui.toast('Status material diperbarui.', 'ok');
      } catch (err) {
        ui.toastError(err);
      }
    }
  }

  document.addEventListener('click', onAct);
  await reloadMaterials();
  return () => document.removeEventListener('click', onAct);
}
