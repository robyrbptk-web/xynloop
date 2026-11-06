/** Surat penawaran: daftar, alur buat dua langkah, kirim, dan lembar tanggapan. */
import { api } from '../api.js';
import * as ui from '../ui.js';
import { card, esc, filters, loading } from '../ui.js';

const HARI_OPTS = ui.HARI.map((h) => ({ value: h, label: h }));
const KATEGORI_OPTS = [
  { value: 'kertas', label: 'Kertas bekas' },
  { value: 'jelantah', label: 'Minyak jelantah' },
  { value: 'campur', label: 'Kertas & jelantah' },
];
const STATUS_OPTS = [
  { value: 'draf', label: 'Draf' },
  { value: 'terkirim', label: 'Terkirim' },
  { value: 'diterima', label: 'Diterima' },
  { value: 'ditolak', label: 'Ditolak' },
  { value: 'kadaluarsa', label: 'Kadaluarsa' },
];
const KATEGORI_LABEL = { kertas: 'Kertas', jelantah: 'Jelantah', campur: 'Campuran' };

let mitraOpts = [];
async function ensureMitraOptions() {
  if (mitraOpts.length) return mitraOpts;
  try {
    const d = await api.get('/api/mitras?limit=500&sort=name');
    mitraOpts = (d.mitras || []).map((m) => ({ value: m.id, label: m.name }));
  } catch { /* tetap bisa memakai pratinjau lewat nomor surat */ }
  return mitraOpts;
}

function tanggapanPill(o) {
  if (o.response_choice === 'bersedia') return ui.pill('BERSEDIA', 'green');
  if (o.response_choice === 'tidak') return ui.pill('TIDAK BERSEDIA', 'red');
  return ui.pill('belum menjawab', 'grey');
}

function listRow(o) {
  return `<tr class="clk" data-id="${o.id}">
    <td><div class="nm mono">${esc(o.number || '—')}</div><div class="sm muted">${esc(ui.tgl(o.issued_at))}</div></td>
    <td><div class="nm">${esc(o.mitra_name)}</div><div class="sm muted">${esc(o.mitra_code || '')}</div></td>
    <td><div>${ui.badge(o.category, KATEGORI_LABEL[o.category] || o.category)}</div><div class="sm muted">${esc(ui.hariNama(o.start_date) || '')}</div></td>
    <td class="sm">${esc(o.schedule_day || '—')}${o.schedule_time ? ` · ${esc(o.schedule_time)}` : ''}${o.start_date ? `<div class="muted">mulai ${esc(ui.tglPendek(o.start_date))}</div>` : ''}</td>
    <td>${ui.badge(o.status)}</td>
    <td>${tanggapanPill(o)}</td>
    <td class="c"><button class="btn xs" type="button" data-print="${o.id}" title="Cetak surat + lembar tanggapan">Cetak</button></td>
  </tr>`;
}

function listHtml(rows) {
  if (!rows.length) return ui.empty('Belum ada surat penawaran untuk saringan ini.');
  return `<div class="tbl-wrap"><table class="tbl">
    <thead><tr>
      <th>Nomor / Tanggal</th><th>Mitra</th><th>Perihal</th><th>Jadwal pengambilan</th>
      <th>Status</th><th>Tanggapan</th><th class="c">Cetak</th>
    </tr></thead><tbody>${rows.map(listRow).join('')}</tbody></table></div>`;
}

function field(label, value) {
  return `<div><div class="muted sm">${esc(label)}</div><div>${value || '<span class="muted">—</span>'}</div></div>`;
}

function detailBody(o, mitra, photos) {
  const jadwal = `${esc(o.schedule_day || '—')}${o.schedule_time ? ` · ${esc(o.schedule_time)}` : ''}`
    + (o.start_date ? ` <span class="sm muted">(mulai ${esc(ui.tgl(o.start_date))})</span>` : '');
  const jawaban = o.response_choice
    ? `<div>${tanggapanPill(o)}</div>
       ${o.response_name ? field('Nama penanggap', esc(o.response_name)) : ''}
       ${o.response_phone ? field('No. WhatsApp', esc(o.response_phone)) : ''}
       ${o.response_date ? field('Tanggal tanggapan', esc(ui.tgl(o.response_date))) : ''}`
    : '<span class="muted">Mitra belum mengisi lembar tanggapan.</span>';

  return `<div class="grid g3" style="gap:12px">
    ${field('Nomor surat', `<span class="mono">${esc(o.number || '—')}</span>`)}
    ${field('Tanggal surat', esc(ui.tgl(o.issued_at)))}
    ${field('Status', ui.badge(o.status))}
    ${field('Mitra', `${esc(o.mitra_name)} <span class="sm muted">${esc(o.mitra_code || '')}</span>`)}
    ${field('Alamat mitra', esc(mitra?.address || o.mitra_address))}
    ${field('Kontak', mitra?.phone ? `<a class="lk" href="${ui.waLink(mitra.phone)}" target="_blank" rel="noopener">${esc(mitra.phone)}</a>` : '')}
    ${field('Perihal / kategori', ui.badge(o.category, KATEGORI_LABEL[o.category] || o.category))}
    ${field('Jadwal rutin', jadwal)}
    ${field('Penandatangan', `${esc(o.signed_by_name || '')}${o.signed_by_title ? ` <span class="sm muted">· ${esc(o.signed_by_title)}</span>` : ''}`)}
    ${o.sent_at ? field('Dikirim', `${esc(ui.tglJam(o.sent_at))}${o.sent_via ? ` · ${esc(o.sent_via === 'whatsapp' ? 'WhatsApp' : o.sent_via)}` : ''}`) : ''}
  </div>
  <h4 class="mt12">Lembar tanggapan</h4>
  <div class="grid g3">${field('Keputusan', jawaban)}</div>
  <h4 class="mt12">Foto lembar tanggapan</h4>
  <div data-photos>${ui.gallery(photos, { add: false })}</div>`;
}

function detailFooter(o, ctx) {
  const manage = ctx.can('offers.manage');
  const b = ['<button class="btn pri" type="button" data-d="print">Cetak surat + lembar tanggapan</button>'];
  if (manage && o.status === 'draf') b.push('<button class="btn lime" type="button" data-d="send">Kirim ke mitra</button>');
  if (manage && o.status !== 'draf') b.push('<button class="btn" type="button" data-d="response">Isi / perbarui tanggapan</button>');
  if (ctx.isManager() && o.status === 'draf') b.push('<button class="btn danger" type="button" data-d="delete">Hapus</button>');
  b.push('<span class="end"></span><button class="btn ghost" type="button" data-close>Tutup</button>');
  return b.join('');
}

/* ------------------------------- aksi surat ------------------------------- */

async function openDetail(id, ctx) {
  let d;
  try {
    d = await api.get(`/api/offers/${id}`);
  } catch (err) {
    ui.toastError(err);
    return;
  }
  const handle = ui.openDialog({
    title: `Surat penawaran ${d.offer.number || ''}`,
    size: 'wide',
    body: detailBody(d.offer, d.mitra, d.photos),
    footer: detailFooter(d.offer, ctx),
  });
  const close = () => { handle.close(); loadList(ctx); };

  const sendDialog = () => ui.formDialog({
    title: 'Kirim surat penawaran',
    subtitle: `Surat ${d.offer.number} akan ditandai terkirim.`,
    size: 'thin',
    fields: [{
      name: 'via', label: 'Cara pengiriman', type: 'select', blank: false, required: true,
      value: 'whatsapp',
      options: [{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'langsung', label: 'Serah langsung' }],
    }],
    note: 'Mitra berstatus Prospek otomatis naik menjadi Penawaran.',
    okLabel: 'Tandai terkirim',
    onSubmit: async (v) => {
      await api.post(`/api/offers/${id}/send`, { via: v.via });
      ui.toast('Surat penawaran ditandai terkirim.', 'ok');
      close();
    },
  });

  const responseDialog = () => ui.formDialog({
    title: 'Lembar tanggapan mitra',
    subtitle: `Tanggapan atas surat ${d.offer.number}.`,
    size: '',
    values: {
      name: d.offer.response_name || d.mitra?.contact_person || '',
      address: d.offer.response_address || d.mitra?.address || '',
      phone: d.offer.response_phone || d.mitra?.phone || '',
      choice: d.offer.response_choice || '',
      date: d.offer.response_date || ui.tanggalIso(),
    },
    fields: [
      { name: 'name', label: 'Nama penanggap', required: true },
      { name: 'phone', label: 'No. WhatsApp', type: 'tel' },
      { name: 'address', label: 'Alamat', type: 'textarea', rows: 2, col: 1 },
      {
        name: 'choice', label: 'Keputusan mitra', type: 'radio', required: true, col: 1,
        options: [{ value: 'bersedia', label: 'BERSEDIA menjadi mitra tetap' }, { value: 'tidak', label: 'TIDAK BERSEDIA' }],
      },
      { name: 'date', label: 'Tanggal tanggapan', type: 'date', required: true },
      { name: 'photos', type: 'photos', label: 'Foto lembar bertanda tangan', buttonLabel: 'Ambil foto lembar' },
    ],
    okLabel: 'Simpan tanggapan',
    onSubmit: async (v) => {
      const res = await api.post(`/api/offers/${id}/response`, {
        name: v.name, address: v.address, phone: v.phone, choice: v.choice, date: v.date, photos: v.photos,
      });
      loadList(ctx);
      handle.close();
      if (v.choice === 'bersedia') {
        ui.toast('Tanggapan disimpan. Mitra otomatis menjadi mitra aktif.', 'ok', 4800);
        setTimeout(async () => {
          const lanjut = await ui.confirmDialog({
            title: 'Mitra kini aktif',
            message: res.next_hint || 'Mitra sudah aktif. Jadwalkan pengambilan pertamanya sekarang?',
            okLabel: 'Buka papan pengambilan',
          });
          if (lanjut) ctx.go('/papan');
        }, 260);
      } else {
        ui.toast('Tanggapan disimpan: mitra tidak bersedia. Status mitra menjadi Ditolak.', 'warn');
      }
    },
  });

  const deleteDialog = async () => {
    const ok = await ui.confirmDialog({
      title: 'Hapus surat draf',
      message: `Surat penawaran ${d.offer.number} (draf) akan dihapus permanen dan tidak dapat dikembalikan.`,
      okLabel: 'Hapus surat',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/offers/${id}`);
      ui.toast('Surat draf dihapus.', 'ok');
      close();
    } catch (err) {
      ui.toastError(err);
    }
  };

  ui.on(handle.el, 'click', '[data-d]', (ev, b) => {
    const k = b.dataset.d;
    if (k === 'print') window.open(`/api/print/offer/${id}`, '_blank');
    else if (k === 'send') sendDialog();
    else if (k === 'response') responseDialog();
    else if (k === 'delete') deleteDialog();
  });
}

/* ------------------------------ alur pembuatan ---------------------------- */

function friendlyStart(day, startDate) {
  if (!startDate) return 'Tanggal mulai rutin akan dihitung otomatis saat surat disimpan.';
  return `Pengambilan rutin setiap ${day || 'Jumat'} mulai ${ui.tgl(startDate)}.`;
}

function step2Create(preview, issuedAt, ctx) {
  const def = preview.defaults || {};
  const clauses = Array.isArray(preview.clauses) && preview.clauses.length
    ? `Ketentuan tercetak: ${preview.clauses.join(' ')}`
    : '';
  const note = [
    friendlyStart(def.schedule_day, preview.start_date),
    preview.subject ? `Perihal surat: ${preview.subject}.` : '',
    clauses,
  ].filter(Boolean).join(' ');

  ui.formDialog({
    title: 'Rincian surat penawaran',
    subtitle: `Mitra: ${preview.mitra?.name || ''}`,
    size: '',
    note,
    values: {
      number: preview.number,
      category: def.category,
      schedule_day: def.schedule_day,
      schedule_time: def.schedule_time,
      start_date: preview.start_date,
      signed_by_name: def.signed_by_name,
      signed_by_title: def.signed_by_title,
    },
    fields: [
      { name: 'number', label: 'Nomor surat', type: 'static' },
      { name: 'category', label: 'Kategori material', type: 'select', options: KATEGORI_OPTS, blank: false },
      { name: 'schedule_day', label: 'Hari pengambilan rutin', type: 'select', options: HARI_OPTS, blank: false },
      { name: 'schedule_time', label: 'Waktu pengambilan', placeholder: 'mis. 10.00 WIB' },
      { name: 'start_date', label: 'Tanggal mulai rutin', type: 'date', hint: 'Diubah bila perlu; kosongkan untuk hitung otomatis.' },
      { name: 'signed_by_name', label: 'Penandatangan surat' },
      { name: 'signed_by_title', label: 'Jabatan penandatangan' },
    ],
    okLabel: 'Buat surat draf',
    onSubmit: async (v) => {
      const res = await api.post('/api/offers', {
        mitra_id: preview.mitra.id,
        number: v.number || preview.number,
        issued_at: issuedAt,
        category: v.category,
        schedule_day: v.schedule_day,
        schedule_time: v.schedule_time || '',
        start_date: v.start_date || '',
        signed_by_name: v.signed_by_name || '',
        signed_by_title: v.signed_by_title || '',
      });
      ui.toast(`Surat penawaran ${res.offer.number} dibuat sebagai draf.`, 'ok');
      await loadList(ctx);
      if (ctx.can('offers.manage')) openDetail(res.offer.id, ctx);
    },
  });
}

function openCreate(ctx, presetMitraId) {
  ui.formDialog({
    title: 'Buat surat penawaran',
    subtitle: 'Pilih mitra dan tanggal surat untuk memuat nomor serta ketentuan otomatis.',
    size: 'thin',
    values: { mitra_id: presetMitraId || '', issued_at: ui.tanggalIso() },
    fields: [
      { name: 'mitra_id', label: 'Mitra tujuan', type: 'select', options: mitraOpts, required: true, col: 1 },
      { name: 'issued_at', label: 'Tanggal surat', type: 'date', required: true, col: 1 },
    ],
    okLabel: 'Lanjutkan',
    onSubmit: async (v) => {
      let preview;
      try {
        preview = await api.get(`/api/offers/preview${api.query({ mitra_id: v.mitra_id, date: v.issued_at })}`);
      } catch (err) {
        ui.toastError(err);
        return false;
      }
      setTimeout(() => step2Create(preview, v.issued_at, ctx), 60);
    },
  });
}

/* ---------------------------------- list ---------------------------------- */

let state = null;

function filterBar() {
  return filters(`
    ${ui.selectBox({ name: 'status', label: 'Status', options: STATUS_OPTS, value: state.status })}
    ${ui.selectBox({ name: 'mitra_id', label: 'Mitra', options: mitraOpts, value: state.mitra_id })}
    ${ui.dateBox({ name: 'from', label: 'Dari tanggal', value: state.from })}
    ${ui.dateBox({ name: 'to', label: 'Sampai tanggal', value: state.to })}
    ${ui.inputBox({ name: 'q', label: 'Cari', placeholder: 'Nomor surat atau mitra…', value: state.q })}
  `);
}

async function loadList(ctx) {
  const box = document.getElementById('off-body');
  const tot = document.getElementById('off-total');
  if (box) box.innerHTML = loading();
  const qs = api.query({
    status: state.status, mitra_id: state.mitra_id, from: state.from, to: state.to, q: state.q,
  });
  let d;
  try {
    d = await api.get(`/api/offers${qs}`);
  } catch (err) {
    if (box) box.innerHTML = `<div class="notebox">${esc(err.message || 'Surat penawaran tidak dapat dimuat.')}</div>`;
    return;
  }
  if (box) box.innerHTML = listHtml(d.offers);
  if (tot) {
    const parts = (d.counts || []).map((c) => `${ui.LABEL[c.status] || c.status}: ${ui.angka(c.n)}`);
    tot.textContent = parts.length ? parts.join(' · ') : `Ditampilkan ${d.offers.length} surat`;
  }
}

export default async function render(page, ctx) {
  const q = ctx.params.q || new URLSearchParams();
  state = {
    status: q.get('status') || '', mitra_id: q.get('mitra_id') || '',
    from: q.get('from') || '', to: q.get('to') || '', q: q.get('q') || '',
  };
  await ensureMitraOptions();

  page.innerHTML = card({
    title: 'Surat penawaran',
    sub: 'Ajakan kemitraan tetap & lembar tanggapan',
    actions: ctx.can('offers.manage')
      ? '<button class="btn pri sm" type="button" data-act="off-create">+ Buat surat</button>'
      : '',
    body: `${filterBar()}<div class="muted sm mb12" id="off-total"></div><div id="off-body">${loading()}</div>`,
  });

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
  ui.on(page, 'click', '[data-act="off-create"]', () => openCreate(ctx));
  ui.on(page, 'click', '[data-print]', (ev, b) => {
    ev.stopPropagation();
    window.open(`/api/print/offer/${b.dataset.print}`, '_blank');
  });
  ui.on(page, 'click', 'tr.clk', (ev, tr) => {
    if (ev.target.closest('[data-print]')) return;
    if (tr.dataset.id) openDetail(Number(tr.dataset.id), ctx);
  });

  // Tautan pra-pilihan mitra dari tampilan lain: #/penawaran?mitra_id=12
  if (ctx.can('offers.manage') && q.get('mitra_id') && !q.get('status')) {
    openCreate(ctx, Number(q.get('mitra_id')));
  }

  return () => clearTimeout(timer);
}
