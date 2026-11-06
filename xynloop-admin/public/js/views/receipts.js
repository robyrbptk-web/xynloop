/** Kwitansi: daftar, penyaring, dan panel detail dengan aksi cetak/status/edit. */
import { api } from '../api.js';
import * as ui from '../ui.js';
import { card, esc, filters, loading } from '../ui.js';

const STATUS_OPTS = [
  { value: 'draf', label: 'Draf' },
  { value: 'terbit', label: 'Terbit' },
  { value: 'lunas', label: 'Lunas' },
  { value: 'batal', label: 'Batal' },
];
const METODE_OPTS = [
  { value: 'tunai', label: 'Tunai' },
  { value: 'transfer', label: 'Transfer' },
];

let mitraOpts = [];
async function ensureMitraOptions() {
  if (mitraOpts.length) return mitraOpts;
  try {
    const d = await api.get('/api/mitras?limit=500&sort=name');
    mitraOpts = (d.mitras || []).map((m) => ({ value: m.id, label: m.name }));
  } catch { /* daftar tetap dapat difilter lewat pencarian */ }
  return mitraOpts;
}

function metodePill(method) {
  return method === 'transfer' ? ui.pill('Transfer', 'blue') : ui.pill('Tunai', 'grey');
}

function listRow(r) {
  return `<tr class="clk" data-id="${r.id}">
    <td><div class="nm mono">${esc(r.number || '—')}</div></td>
    <td>${esc(ui.tgl(r.issued_at))}</td>
    <td><div class="nm">${esc(r.seller_name || r.mitra_name)}</div><div class="sm muted">${esc(r.mitra_name)}</div></td>
    <td class="num">${ui.berat(r.paper_kg)}<div class="sm muted">${ui.berat(r.oil_liters, 'l')}</div></td>
    <td class="num">${ui.rp(r.total)}</td>
    <td>${metodePill(r.method)}</td>
    <td>${ui.badge(r.status)}</td>
    <td class="c">${r.pickup_id
      ? `<a class="lk" href="#/pengambilan/${r.pickup_id}" data-stop title="Lihat pengambilan ${esc(r.pickup_code || '')}">${esc(r.pickup_code || 'run')}</a>`
      : '<span class="muted">—</span>'}</td>
  </tr>`;
}

function listHtml(rows) {
  if (!rows.length) return ui.empty('Belum ada kwitansi untuk saringan ini.');
  return `<div class="tbl-wrap"><table class="tbl">
    <thead><tr>
      <th>Nomor</th><th>Tanggal</th><th>Dibayarkan kepada</th><th class="num">Hasil (kg/l)</th>
      <th class="num">Total</th><th>Metode</th><th>Status</th><th class="c">Pengambilan</th>
    </tr></thead>
    <tbody>${rows.map(listRow).join('')}</tbody></table></div>`;
}

/* ------------------------------ detail panel ------------------------------ */

function field(label, value) {
  return `<div><div class="muted sm">${esc(label)}</div><div>${value || '<span class="muted">—</span>'}</div></div>`;
}

function snapshotTable(snap) {
  const lines = (snap && snap.lines) || [];
  if (!lines.length) return '<p class="muted sm">Tidak ada baris rincian.</p>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th class="c" style="width:34px">No</th><th>Jenis</th><th class="num">Jumlah</th>
      <th class="num">Harga</th><th class="num">Nilai</th>
    </tr></thead><tbody>${lines.map((l) => `<tr>
      <td class="c">${esc(l.no)}</td>
      <td><div class="nm">${esc(l.name)}</div>${l.tare_weight || l.minus_pct
        ? `<div class="sm muted">${l.gross_weight ? `kotor ${ui.angka(l.gross_weight)} · ` : ''}${l.tare_weight ? `tare ${ui.angka(l.tare_weight)} · ` : ''}${l.minus_pct ? `minus ${ui.angka(l.minus_pct)}%` : ''}</div>`
        : ''}</td>
      <td class="num">${ui.berat(l.qty, l.unit === 'liter' ? 'l' : 'kg')}</td>
      <td class="num">${ui.rp(l.unit_price)}</td>
      <td class="num">${ui.rp(l.amount)}</td>
    </tr>`).join('')}
      <tr class="total-row"><td colspan="2" class="c">TOTAL</td>
        <td class="num">${ui.angka((snap.paper_kg || 0) + (snap.oil_liters || 0))}</td>
        <td></td><td class="num">${ui.rp(snap.total)}</td></tr>
    </tbody></table></div>`;
}

function detailBody(rc, snap, photos) {
  const meta = `<div class="grid g3" style="gap:12px">
    ${field('No. Kwitansi', `<span class="mono">${esc(rc.number || '—')}</span>`)}
    ${field('Hari/Tanggal', esc(`${ui.hariNama(rc.issued_at)}, ${ui.tgl(rc.issued_at)}`))}
    ${field('Status', ui.badge(rc.status) + (rc.status === 'batal' && rc.void_reason ? ` <span class="sm muted">${esc(rc.void_reason)}</span>` : ''))}
    ${field('Dibayarkan kepada', esc(rc.seller_name || rc.mitra_name))}
    ${field('Alamat', esc(rc.seller_address))}
    ${field('No. Telp/WhatsApp', rc.seller_phone ? `<a class="lk" href="${ui.waLink(rc.seller_phone)}" target="_blank" rel="noopener">${esc(rc.seller_phone)}</a>` : '')}
    ${field('Metode Pembayaran', metodePill(rc.method) + (rc.method === 'transfer' && rc.paid_at ? ` <span class="sm muted">dibayar ${esc(ui.tgl(rc.paid_at))}</span>` : ''))}
    ${field('Petugas penandatangan', `${esc(rc.staff_name || '')}${rc.staff_title ? ` <span class="sm muted">· ${esc(rc.staff_title)}</span>` : ''}`)}
    ${field('Pengambilan', rc.pickup_id ? `<a class="lk" href="#/pengambilan/${rc.pickup_id}">${esc(rc.pickup_code || 'lihat run')}</a>` : '')}
  </div>
  <p class="muted sm mt12">Terbilang dan kop perusahaan dicetak otomatis pada dokumen PDF.</p>`;

  const totals = `<div class="stats mt12">
    <div class="st"><b>${ui.berat(rc.paper_kg ?? snap?.paper_kg ?? 0)}</b><span>Kertas</span></div>
    <div class="st"><b>${ui.berat(rc.oil_liters ?? snap?.oil_liters ?? 0, 'l')}</b><span>Jelantah</span></div>
    <div class="st"><b>${ui.rp(rc.total)}</b><span>Total pembayaran</span></div>
  </div>`;

  return `${meta}${totals}
    <h4 class="mt12">Rincian hasil timbangan</h4>
    ${snapshotTable(snap)}
    <h4 class="mt12">Foto bukti bayar</h4>
    <div data-photos>${ui.gallery(photos, { add: false })}</div>`;
}

function detailFooter(rc, ctx) {
  const manage = ctx.can('receipts.manage');
  const mgr = ctx.isManager();
  const btns = [`<button class="btn pri" type="button" data-d="print">Cetak / Simpan PDF</button>`];
  if (manage) {
    if (rc.status === 'draf') {
      btns.push(`<button class="btn" type="button" data-d="terbit">Terbitkan</button>`);
      btns.push(`<button class="btn" type="button" data-d="edit">Edit</button>`);
    } else if (rc.status === 'terbit') {
      btns.push(`<button class="btn lime" type="button" data-d="lunas">Tandai lunas</button>`);
    }
    if (rc.status !== 'batal') {
      btns.push(`<button class="btn" type="button" data-d="addphoto">+ Foto bukti bayar</button>`);
      if (mgr) btns.push(`<button class="btn danger" type="button" data-d="batal">Batalkan</button>`);
    }
  }
  btns.push(`<span class="end"></span><button class="btn ghost" type="button" data-close>Tutup</button>`);
  return btns.join('');
}

async function refreshPhotos(handle, id) {
  const box = handle.body.querySelector('[data-photos]');
  if (!box) return;
  try {
    const p = await api.get(`/api/receipts/${id}`);
    box.innerHTML = ui.gallery(p.photos, { add: false });
  } catch { /* biarkan */ }
}

async function openDetail(id, ctx) {
  let data;
  try {
    data = await api.get(`/api/receipts/${id}`);
  } catch (err) {
    ui.toastError(err);
    return;
  }
  const rc = data.receipt;
  const handle = ui.openDialog({
    title: `Kwitansi ${rc.number || ''}`,
    size: 'wide',
    body: detailBody(rc, data.snapshot, data.photos),
    footer: detailFooter(rc, ctx),
  });

  const postStatus = async (status, reason) => {
    try {
      await api.post(`/api/receipts/${id}/status`, reason ? { status, reason } : { status });
      ui.toast(`Status kwitansi diubah menjadi ${ui.LABEL[status] || status}.`, 'ok');
      handle.close();
      await loadList(ctx);
    } catch (err) {
      ui.toastError(err);
    }
  };

  const editDialog = () => ui.formDialog({
    title: 'Ubah kwitansi',
    subtitle: 'Perubahan hanya pada isian kwitansi; hasil timbangan mengikuti rincian beku.',
    size: '',
    values: {
      number: rc.number, seller_name: rc.seller_name, seller_address: rc.seller_address,
      seller_phone: rc.seller_phone, method: rc.method, staff_name: rc.staff_name, staff_title: rc.staff_title,
    },
    fields: [
      { name: 'number', label: 'Nomor kwitansi', required: true, col: 1 },
      { name: 'method', label: 'Metode pembayaran', type: 'select', options: METODE_OPTS, blank: false },
      { name: 'seller_name', label: 'Dibayarkan kepada', required: true },
      { name: 'seller_phone', label: 'No. telp/WhatsApp', type: 'tel' },
      { name: 'staff_name', label: 'Petugas penandatangan' },
      { name: 'staff_title', label: 'Jabatan petugas' },
      { name: 'seller_address', label: 'Alamat', type: 'textarea', rows: 2, col: 1 },
    ],
    okLabel: 'Simpan perubahan',
    onSubmit: async (v) => {
      await api.put(`/api/receipts/${id}`, v);
      ui.toast('Kwitansi diperbarui.', 'ok');
      handle.close();
      await loadList(ctx);
    },
  });

  const batalDialog = () => ui.formDialog({
    title: 'Batalkan kwitansi',
    subtitle: `Kwitansi ${rc.number} akan ditandai batal.`,
    size: 'thin',
    fields: [{ name: 'reason', label: 'Alasan pembatalan', type: 'textarea', required: true, rows: 3 }],
    okLabel: 'Batal kan kwitansi',
    onSubmit: async (v) => postStatus('batal', v.reason),
  });

  const photoDialog = () => ui.formDialog({
    title: 'Tambah foto bukti bayar',
    subtitle: 'Foto disimpan bersama kwitansi dan ikut tercetak pada PDF.',
    size: '',
    fields: [{ name: 'photos', type: 'photos', label: 'Foto bukti', buttonLabel: 'Ambil / pilih foto' }],
    okLabel: 'Unggah foto',
    onSubmit: async (v) => {
      if (!v.photos || !v.photos.length) { ui.toast('Pilih foto terlebih dahulu.', 'warn'); return false; }
      await api.post(`/api/receipts/${id}/photos`, { photos: v.photos });
      ui.toast('Foto bukti bayar tersimpan.', 'ok');
      await refreshPhotos(handle, id);
    },
  });

  ui.on(handle.el, 'click', '[data-d]', (ev, b) => {
    const k = b.dataset.d;
    if (k === 'print') window.open(`/api/print/receipt/${id}`, '_blank');
    else if (k === 'terbit') postStatus('terbit');
    else if (k === 'lunas') postStatus('lunas');
    else if (k === 'edit') editDialog();
    else if (k === 'batal') batalDialog();
    else if (k === 'addphoto') photoDialog();
  });
}

/* --------------------------------- list ---------------------------------- */

function filterBar(state) {
  return filters(`
    ${ui.selectBox({ name: 'status', label: 'Status', options: STATUS_OPTS, value: state.status })}
    ${ui.selectBox({ name: 'method', label: 'Metode', options: METODE_OPTS, value: state.method })}
    ${ui.selectBox({ name: 'mitra_id', label: 'Mitra', options: mitraOpts, value: state.mitra_id })}
    ${ui.dateBox({ name: 'from', label: 'Dari tanggal', value: state.from })}
    ${ui.dateBox({ name: 'to', label: 'Sampai tanggal', value: state.to })}
    ${ui.inputBox({ name: 'q', label: 'Cari', placeholder: 'Nomor, mitra, penerima…', value: state.q })}
  `);
}

let state = null;

async function loadList(ctx) {
  const box = document.getElementById('rc-body');
  const tot = document.getElementById('rc-total');
  if (box) box.innerHTML = loading();
  const qs = api.query({
    status: state.status, method: state.method, mitra_id: state.mitra_id,
    from: state.from, to: state.to, q: state.q,
  });
  let d;
  try {
    d = await api.get(`/api/receipts${qs}`);
  } catch (err) {
    if (box) box.innerHTML = `<div class="notebox">${esc(err.message || 'Kwitansi tidak dapat dimuat.')}</div>`;
    return;
  }
  if (box) box.innerHTML = listHtml(d.receipts);
  if (tot) tot.textContent = `Ditampilkan ${d.receipts.length} kwitansi · nilai ${ui.rp(d.total_shown || 0)}`;
}

export default async function render(page, ctx) {
  const q = ctx.params.q || new URLSearchParams();
  state = {
    status: q.get('status') || '', method: q.get('method') || '', mitra_id: q.get('mitra_id') || '',
    from: q.get('from') || '', to: q.get('to') || '', q: q.get('q') || '',
  };
  ctx.setTopbarActions('');

  await ensureMitraOptions();

  page.innerHTML = `
    ${card({
      title: 'Kwitansi pembelian',
      sub: 'Pembayaran mitra kertas & jelantah',
      actions: '<button class="btn sm" type="button" data-act="rc-refresh">Muat ulang</button>',
      body: `${filterBar(state)}
        <div class="muted sm mb12" id="rc-total"></div>
        <div id="rc-body">${loading()}</div>`,
    })}`;

  if (q.get('pickup_id')) {
    ui.toast('Pembuatan kwitansi dilakukan dari halaman detail pengambilan.', 'warn', 5000);
  }

  await loadList(ctx);

  let timer = null;
  ui.on(page, 'change', '[data-filter]', (ev, el) => {
    state[el.dataset.filter] = el.value;
    loadList(ctx);
  });
  ui.on(page, 'input', '[data-filter="q"]', (ev, el) => {
    state.q = el.value;
    clearTimeout(timer);
    timer = setTimeout(() => loadList(ctx), 400);
  });
  ui.on(page, 'click', 'tr.clk', (ev, tr) => {
    if (ev.target.closest('[data-stop]')) return;
    if (tr.dataset.id) openDetail(Number(tr.dataset.id), ctx);
  });
  ui.on(page, 'click', '[data-act="rc-refresh"]', () => loadList(ctx));

  return () => clearTimeout(timer);
}
