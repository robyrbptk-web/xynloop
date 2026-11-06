/** Profil satu mitra: header, ringkasan seumur hidup, atribusi penemu, dan tab. */
import { api } from '../api.js';
import { collectPhotos } from '../media.js';
import { currentPosition } from '../geo.js';
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
const VISIT_TYPE = {
  survey: 'Survei', penawaran: 'Penawaran', follow_up: 'Tindak lanjut',
  negosiasi: 'Negosiasi', pengambilan: 'Pengambilan', lainnya: 'Lainnya',
};
const OUTCOME = {
  lanjut: { label: 'Lanjut', tone: 'green' },
  berhasil: { label: 'Berhasil', tone: 'green' },
  tunda: { label: 'Ditunda', tone: 'amber' },
  tidak_berminat: { label: 'Tidak berminat', tone: 'red' },
  belum_sampai: { label: 'Belum sampai', tone: 'amber' },
  lainnya: { label: 'Lainnya', tone: 'grey' },
};
const TABS = [
  { id: 'pengambilan', label: 'Pengambilan' },
  { id: 'kunjungan', label: 'Kunjungan' },
  { id: 'dokumen', label: 'Dokumen' },
  { id: 'foto', label: 'Foto' },
];

function kategoriLabel(c) {
  return (CATEGORY.find((x) => x.value === c) || {}).label || c;
}

function mapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
}

function digits(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

export default async function render(page, ctx) {
  const id = ctx.params.id;
  if (!id || !/^\d+$/.test(String(id))) {
    page.innerHTML = ui.empty('Mitra tidak ditemukan.', '<a class="btn pri" href="#/mitras">Kembali ke daftar</a>');
    return;
  }
  page.innerHTML = ui.loading('Memuat profil mitra…');

  const manager = ctx.isManager();
  const canSeePhotos = ctx.can('attachments.view_all') || manager;
  let D = null;
  let activeTab = 'pengambilan';

  function editFields() {
    const m = D.mitra;
    const purchasing = (ctx.bootstrap?.users || []).filter((u) => u.role === 'purchasing');
    const crew = (ctx.bootstrap?.users || []).filter((u) => u.role === 'crew');
    const fields = [
      { name: 'name', label: 'Nama mitra', required: true, col: 1 },
      { name: 'category', label: 'Kategori', type: 'select', options: CATEGORY },
      { name: 'status', label: 'Status', type: 'select', options: STATUS.map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
      { name: 'contact_person', label: 'Narahubung' },
      { name: 'phone', label: 'Nomor telepon', type: 'tel', inputmode: 'numeric' },
      { name: 'area', label: 'Area / wilayah' },
      { name: 'expected_paper_kg', label: 'Perkiraan kertas (kg)', type: 'number', min: 0, step: 'any' },
      { name: 'expected_oil_l', label: 'Perkiraan jelantah (l)', type: 'number', min: 0, step: 'any' },
      { name: 'schedule_day', label: 'Hari pengambilan', type: 'select', options: HARI.map((h) => ({ value: h, label: h })) },
      { name: 'schedule_time', label: 'Jam pengambilan', type: 'time' },
      { name: 'crew_user_id', label: 'Kru penjemput tetap', type: 'select', options: crew.map((u) => ({ value: u.id, label: u.name })) },
      { name: 'address', label: 'Alamat', col: 1 },
      { name: 'quality_note', label: 'Catatan kualitas', col: 1 },
      { name: 'notes', label: 'Catatan', type: 'textarea', col: 1 },
      { name: 'lat', label: 'Lintang (GPS)', type: 'number', step: 'any' },
      { name: 'lng', label: 'Bujur (GPS)', type: 'number', step: 'any' },
    ];
    if (manager) {
      fields.splice(2, 0, {
        name: 'source_user_id', label: 'Karyawan penemu', type: 'select',
        placeholder: 'Belum ditentukan', options: purchasing.map((u) => ({ value: u.id, label: u.name })),
      });
    }
    const values = {
      name: m.name, category: m.category, status: m.status, contact_person: m.contact_person || '',
      phone: m.phone || '', area: m.area || '', expected_paper_kg: m.expected_paper_kg || 0,
      expected_oil_l: m.expected_oil_l || 0, schedule_day: m.schedule_day || '', schedule_time: m.schedule_time || '',
      crew_user_id: m.crew_user_id || '', address: m.address || '', quality_note: m.quality_note || '',
      notes: m.notes || '', lat: m.lat ?? '', lng: m.lng ?? '',
    };
    if (manager) values.source_user_id = m.source_user_id || '';
    return { fields, values };
  }

  function openEdit() {
    const { fields, values } = editFields();
    ui.formDialog({
      title: 'Ubah data mitra',
      subtitle: D.mitra.name,
      size: 'wide',
      fields,
      values,
      okLabel: 'Simpan perubahan',
      onSubmit: async (vals) => {
        await api.put(`/api/mitras/${id}`, vals);
        ui.toast('Perubahan tersimpan.', 'ok');
        await load();
      },
    });
  }

  function openStatus() {
    ui.formDialog({
      title: 'Ubah status mitra',
      subtitle: `Status saat ini: ${STATUS_LABEL[D.mitra.status] || D.mitra.status}`,
      size: 'thin',
      fields: [
        { name: 'status', label: 'Status baru', type: 'select', blank: false, options: STATUS.map((s) => ({ value: s, label: STATUS_LABEL[s] })), value: D.mitra.status },
      ],
      note: 'Perubahan status tercatat pada jejak audit.',
      okLabel: 'Simpan status',
      onSubmit: async (vals) => {
        if (vals.status === D.mitra.status) {
          ui.toast('Status belum berubah.', 'warn');
          return false;
        }
        await api.post(`/api/mitras/${id}/status`, { status: vals.status });
        ui.toast('Status mitra diperbarui.', 'ok');
        await load();
      },
    });
  }

  async function doArchive() {
    const ok = await ui.confirmDialog({
      title: 'Arsipkan mitra',
      message: `Arsipkan "${D.mitra.name}"? Mitra terarsip tidak muncul di daftar biasa dan tidak dapat dijadwalkan mengambil.`,
      okLabel: 'Ya, arsipkan',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/api/mitras/${id}/archive`);
      ui.toast('Mitra diarsipkan.', 'ok');
      await load();
    } catch (err) {
      ui.toast(err.message || 'Gagal mengarsipkan.', 'bad');
    }
  }

  function openVisitDialog() {
    const today = ui.tanggalIso();
    const dlg = ui.formDialog({
      title: 'Catat kunjungan',
      subtitle: D.mitra.name,
      size: 'wide',
      fields: [
        { name: 'visit_type', label: 'Jenis kunjungan', type: 'select', blank: false, options: Object.entries(VISIT_TYPE).map(([value, label]) => ({ value, label })), value: 'survey' },
        { name: 'outcome', label: 'Hasil', type: 'select', blank: false, options: Object.entries(OUTCOME).map(([value, o]) => ({ value, label: o.label })), value: 'lanjut' },
        { name: 'visited_at', label: 'Tanggal kunjungan', type: 'date', value: today },
        { name: 'next_action_at', label: 'Rencana tindak lanjut', type: 'date' },
        { name: 'notes', label: 'Catatan', type: 'textarea', col: 1, placeholder: 'Apa yang terjadi di lapangan?' },
        { name: 'lat', label: 'Lintang (GPS)', type: 'number', step: 'any' },
        { name: 'lng', label: 'Bujur (GPS)', type: 'number', step: 'any' },
        { name: 'photos', label: 'Foto bukti', type: 'photos' },
      ],
      okLabel: 'Simpan kunjungan',
      onSubmit: async (vals) => {
        await api.post(`/api/mitras/${id}/visits`, vals);
        ui.toast('Kunjungan tercatat.', 'ok');
        activeTab = 'kunjungan';
        await load();
      },
    });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn sm lime';
    btn.textContent = 'Pakai lokasi saya';
    const latBox = dlg.form.querySelector('[data-field="lat"]');
    if (latBox) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.appendChild(btn);
      latBox.appendChild(hint);
    }
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Mencari sinyal…';
      try {
        const pos = await currentPosition();
        const la = dlg.form.querySelector('#fld_lat');
        const ln = dlg.form.querySelector('#fld_lng');
        if (la) la.value = pos.lat;
        if (ln) ln.value = pos.lng;
        ui.toast(`Lokasi terkunci (akurasi ±${pos.accuracy} m).`, 'ok');
      } catch (err) {
        ui.toast(err.message || 'Lokasi tidak terbaca.', 'warn');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Pakai lokasi saya';
      }
    });
  }

  async function addPhoto() {
    try {
      const { photos } = await collectPhotos();
      if (!photos.length) {
        ui.toast('Tidak ada foto dipilih.', 'warn');
        return;
      }
      await api.post(`/api/mitras/${id}/photos`, { photos });
      ui.toast('Foto ditambahkan.', 'ok');
      await load();
    } catch (err) {
      ui.toast(err.message || 'Gagal menyimpan foto.', 'bad');
    }
  }

  /* --------------------------------- bagian -------------------------------- */

  function headerHtml() {
    const m = D.mitra;
    const phone = digits(m.phone);
    const acts = [
      ctx.can('mitras.manage') ? '<button type="button" class="btn sm" data-act="edit">Edit</button>' : '',
      ctx.can('mitras.manage') ? '<button type="button" class="btn sm" data-act="status">Ubah status</button>' : '',
      manager ? '<button type="button" class="btn sm danger" data-act="archive">Arsipkan</button>' : '',
    ].filter(Boolean);
    const actions = [
      ...acts,
      ctx.can('pickups.manage') ? '<a class="btn sm" href="#/papan">Buat pengambilan</a>' : '',
      ctx.can('offers.manage') ? `<a class="btn sm pri" href="#/penawaran?mitra_id=${m.id}">Buat penawaran</a>` : '',
    ].filter(Boolean).join('');
    const kontak = [
      phone ? `<a class="btn xs" href="${ui.waLink(m.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : '',
      phone ? `<a class="btn xs" href="tel:${phone}">Telepon</a>` : '',
    ].filter(Boolean);
    return ui.card({
      body: `<div class="row wrap" style="align-items:flex-start">
        <div style="flex:1;min-width:220px">
          <h3 style="margin:0;font-size:18px">${ui.esc(m.name)} <span class="mono muted" style="font-size:13px">${ui.esc(m.code || '')}</span></h3>
          <div class="row" style="margin-top:8px;flex-wrap:wrap">
            ${ui.badge(m.status)}${ui.badge(m.category, kategoriLabel(m.category))}
            ${m.area ? ui.pill(m.area, 'grey') : ''}
          </div>
          <div class="stack" style="margin-top:12px;gap:4px;font-size:13px">
            ${m.contact_person ? `<div><span class="muted">Narahubung:</span> ${ui.esc(m.contact_person)}</div>` : ''}
            ${m.phone ? `<div><span class="muted">Telepon:</span> ${ui.esc(m.phone)}</div>` : ''}
            ${m.address ? `<div><span class="muted">Alamat:</span> ${ui.esc(m.address)}</div>` : ''}
            ${m.schedule_day ? `<div><span class="muted">Jadwal:</span> ${ui.esc(m.schedule_day)}${m.schedule_time ? ` ${ui.esc(m.schedule_time)}` : ''}</div>` : ''}
            ${m.expected_paper_kg || m.expected_oil_l ? `<div><span class="muted">Perkiraan:</span> ${ui.berat(m.expected_paper_kg || 0)}${m.expected_oil_l ? ` / ${ui.berat(m.expected_oil_l, 'l')}` : ''} per pengambilan</div>` : ''}
            ${m.quality_note ? `<div class="muted sm">${ui.esc(m.quality_note)}</div>` : ''}
            ${m.lat && m.lng ? `<div class="row" style="margin-top:6px"><span class="mono sm muted">${ui.esc(m.lat)}, ${ui.esc(m.lng)}</span><a class="btn xs" href="${mapsUrl(m.lat, m.lng)}" target="_blank" rel="noopener">Buka di Google Maps</a></div>` : ''}
          </div>
        </div>
        <div class="end row" style="flex-wrap:wrap;gap:8px">${kontak.join('')}</div>
      </div>
      ${actions ? `<div class="sep"></div><div class="row end" style="flex-wrap:wrap">${actions}</div>` : ''}`,
    });
  }

  function summaryHtml() {
    const l = D.lifetime || {};
    const runs = Number(l.runs) || 0;
    const avg = runs ? (Number(l.amount) || 0) / runs : 0;
    const month = l.month || {};
    return ui.card({
      title: 'Ringkasan seumur hidup',
      body: ui.statRow([
        { label: 'Total kertas', value: ui.berat(l.paper_kg || 0) },
        { label: 'Total jelantah', value: ui.berat(l.oil_liters || 0, 'l') },
        { label: 'Total nilai', value: ui.rp(l.amount || 0) },
        { label: 'Jumlah pengambilan', value: ui.angka(runs) },
        { label: 'Rata-rata / pengambilan', value: ui.rp(avg) },
        { label: 'Nilai bulan ini', value: ui.rp(month.amount || 0) },
      ]),
    });
  }

  function finderHtml() {
    const m = D.mitra;
    const f = D.finder;
    const body = f
      ? `<div class="row wrap" style="justify-content:space-between">
          <div>
            <div style="font-size:15px;font-weight:650">${ui.esc(f.name)}</div>
            <div class="sm muted">${ui.esc(ui.LABEL[f.role] || f.role || 'Karyawan')}${f.phone ? ` · ${ui.esc(f.phone)}` : ''}</div>
          </div>
          <a class="lk" href="#/laporan">Lihat atribusi di laporan</a>
        </div>`
      : `<p class="muted sm">Penemu belum dicatat. ${manager ? 'Isi lewat tombol Edit.' : 'Hubungi admin untuk menentukan penanggung jawab.'}</p>`;
    return ui.card({
      title: 'Ditemukan oleh',
      sub: 'karyawan purchasing yang mengawali mitra ini',
      body: `<div class="notebox">Atribusi penemuan menentukan pencatatan kinerja akuisisi.</div>${body}`,
    });
  }

  function tabsHtml() {
    return ui.tabs(TABS, activeTab);
  }

  function pickupTab() {
    const rows = D.pickups || [];
    if (!rows.length) return ui.empty('Belum ada pengambilan untuk mitra ini.');
    const body = rows.map((p) => `<tr class="clk" data-goto="/pengambilan/${p.id}">
      <td>${ui.tgl(p.date)}${p.scheduled_at ? `<div class="sm muted">${ui.jam(p.scheduled_at)}</div>` : ''}</td>
      <td class="mono sm">${ui.esc(p.code || '')}</td>
      <td>${ui.badge(p.status)}</td>
      <td class="num">${p.paper_kg ? ui.berat(p.paper_kg) : '<span class="muted">—</span>'}</td>
      <td class="num">${p.oil_liters ? ui.berat(p.oil_liters, 'l') : '<span class="muted">—</span>'}</td>
      <td class="num">${p.amount ? ui.rp(p.amount) : '—'}</td>
      <td class="sm">${ui.esc(p.crew_names || '—')}</td>
      <td class="c"><span class="lk sm">Detail</span></td>
    </tr>`).join('');
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Tanggal</th><th>Kode</th><th>Status</th><th class="num">Kertas</th><th class="num">Jelantah</th><th class="num">Nilai</th><th>Tim</th><th class="c"></th>
    </tr></thead><tbody>${body}</tbody></table></div>
    <p class="muted sm" style="margin-top:10px">Buka baris untuk melihat timbangan dan kwitansi terkait.</p>`;
  }

  function visitPhotosFor(visitId) {
    return (D.visit_photos || []).filter((a) => {
      if (Number(a.owner_id) !== Number(visitId)) return false;
      if (canSeePhotos) return true;
      return Number(a.taken_by) === Number(ctx.me?.id);
    });
  }

  function visitTab() {
    const rows = D.visits || [];
    const log = rows.length
      ? rows.map((v) => {
        const o = OUTCOME[v.outcome] || { label: v.outcome || '—', tone: 'grey' };
        const photos = visitPhotosFor(v.id);
        return `<div class="li">
          <span class="dot ${o.tone}"></span>
          <div class="bd1">
            <div class="t1">${ui.esc(VISIT_TYPE[v.visit_type] || v.visit_type || 'Kunjungan')} · ${ui.pill(o.label, o.tone)}</div>
            <div class="m1">${ui.tglJam(v.visited_at)} · ${ui.esc(v.user_name || 'karyawan')}${v.next_action_at ? ` · <span class="${new Date(String(v.next_action_at).replace(' ', 'T')) < new Date() ? '' : 'muted'}">tindak lanjut ${ui.tgl(v.next_action_at)}</span>` : ''}</div>
            ${v.notes ? `<div class="m1" style="margin-top:4px">${ui.esc(v.notes)}</div>` : ''}
            ${v.lat && v.lng ? `<a class="lk sm" href="${mapsUrl(v.lat, v.lng)}" target="_blank" rel="noopener">lihat titik lokasi</a>` : ''}
            ${photos.length ? `<div style="margin-top:8px">${ui.gallery(photos, { add: false })}</div>` : ''}
          </div>
        </div>`;
      }).join('')
      : '<p class="muted sm">Belum ada kunjungan tercatat.</p>';
    const actions = ctx.can('visits.manage') ? '<button type="button" class="btn sm pri" data-act="new-visit">+ Catat kunjungan</button>' : '';
    return ui.card({ title: 'Log kunjungan', sub: 'terbaru lebih dulu', actions, body: log });
  }

  function docTab() {
    const offers = D.offers || [];
    const receipts = D.receipts || [];
    const offerRows = offers.length
      ? offers.map((o) => `<tr>
          <td class="mono sm">${ui.esc(o.number || '')}</td>
          <td>${ui.tgl(o.issued_at)}</td>
          <td>${ui.badge(o.category, kategoriLabel(o.category))}</td>
          <td>${ui.badge(o.status)}</td>
          <td class="c"><a class="btn xs" data-print="/api/print/offer/${o.id}" href="/api/print/offer/${o.id}" target="_blank" rel="noopener">Cetak</a></td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="muted sm">Belum ada surat penawaran.</td></tr>`;
    const receiptRows = receipts.length
      ? receipts.map((rc) => `<tr>
          <td class="mono sm">${ui.esc(rc.number || '')}</td>
          <td>${ui.tgl(rc.issued_at)}</td>
          <td class="num">${ui.rp(rc.total)}</td>
          <td class="sm">${ui.esc(rc.method === 'transfer' ? 'Transfer' : 'Tunai')}</td>
          <td>${ui.badge(rc.status)}</td>
          <td class="c"><a class="btn xs" data-print="/api/print/receipt/${rc.id}" href="/api/print/receipt/${rc.id}" target="_blank" rel="noopener">Cetak</a></td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="muted sm">Belum ada kwitansi.</td></tr>`;
    return `<div class="stack">
      ${ui.card({ title: 'Surat penawaran', flush: true, body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nomor</th><th>Tanggal</th><th>Kategori</th><th>Status</th><th class="c">Cetak</th></tr></thead><tbody>${offerRows}</tbody></table></div>` })}
      ${ui.card({ title: 'Kwitansi', flush: true, body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nomor</th><th>Tanggal</th><th class="num">Nilai</th><th>Metode</th><th>Status</th><th class="c">Cetak</th></tr></thead><tbody>${receiptRows}</tbody></table></div>` })}
    </div>`;
  }

  function photoTab() {
    const photos = canSeePhotos
      ? (D.photos || [])
      : (D.photos || []).filter((p) => Number(p.taken_by) === Number(ctx.me?.id));
    return ui.card({ title: 'Foto dokumen / lokasi', body: ui.gallery(photos, { add: true }) });
  }

  function tabBody() {
    if (activeTab === 'kunjungan') return visitTab();
    if (activeTab === 'dokumen') return docTab();
    if (activeTab === 'foto') return photoTab();
    return pickupTab();
  }

  function cleanGallery(root) {
    // Tidak ada endpoint penghapusan foto mitra; sembunyikan tombol hapus yang mati.
    root.querySelectorAll('[data-del-photo]').forEach((b) => b.remove());
  }

  function renderAll() {
    page.innerHTML = `
      <div class="stack">
        ${headerHtml()}
        <div class="grid g2">${summaryHtml()}${finderHtml()}</div>
        <div>
          ${tabsHtml()}
          <div id="m-tab">${tabBody()}</div>
        </div>
        <div class="row"><a class="btn sm ghost" href="#/mitras">&larr; Kembali ke daftar mitra</a></div>
      </div>`;
    cleanGallery(page);
  }

  function repaintTab() {
    const body = document.getElementById('m-tab');
    if (!body) {
      renderAll();
      return;
    }
    body.innerHTML = tabBody();
    cleanGallery(body);
    page.querySelectorAll('.tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === activeTab));
  }

  async function load() {
    D = await api.get(`/api/mitras/${id}`);
    ctx.setTopbarActions(ctx.can('mitras.manage') ? '<button type="button" class="btn sm pri" data-act="edit">Edit mitra</button>' : '');
    renderAll();
  }

  let alive = true;

  try {
    await load();
  } catch (err) {
    page.innerHTML = ui.empty(err.message || 'Mitra tidak dapat dimuat.', '<a class="btn pri" href="#/mitras">Kembali ke daftar</a>');
    return;
  }

  ui.on(page, 'click', '[data-tab]', (ev, el) => {
    if (!alive) return;
    activeTab = el.dataset.tab;
    repaintTab();
  });

  ui.on(page, 'click', '[data-goto]', (ev, el) => {
    if (!alive) return;
    ctx.go(el.dataset.goto);
  });

  ui.on(page, 'click', '[data-act]', async (ev, el) => {
    if (!alive) return;
    const act = el.dataset.act;
    try {
      if (act === 'edit') openEdit();
      else if (act === 'status') openStatus();
      else if (act === 'archive') await doArchive();
      else if (act === 'new-visit') openVisitDialog();
      else if (act === 'add-photo') await addPhoto();
    } catch (err) {
      ui.toast(err.message || 'Terjadi kesalahan.', 'bad');
    }
  });

  return () => { alive = false; };
}
