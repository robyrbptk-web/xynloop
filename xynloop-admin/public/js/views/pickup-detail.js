/** Detail Pengambilan: aplikasi lapangan satu run — timbang, foto, tim, BBM, rute, kwitansi. */
import { api, query } from '../api.js';
import * as ui from '../ui.js';
import { collectPhotos } from '../media.js';
import { startTracking, stopTracking, isTracking, geoSupported } from '../geo.js';

const STEP = ['terjadwal', 'dalam_perjalanan', 'menimbang', 'selesai'];
const STATUS_TONE = { terjadwal: 'blue', dalam_perjalanan: 'amber', menimbang: 'purple', selesai: 'green' };
const ACTION_LABEL = {
  terjadwal: 'Jadwalkan ulang', dalam_perjalanan: 'Tandai berangkat',
  menimbang: 'Mulai menimbang', selesai: 'Tandai selesai', batal: 'Batalkan',
};
const CREW_ROLE = { kordinator: 'Koordinator', driver: 'Pengemudi', kru: 'Kru', penimbang: 'Penimbang' };
const CREW_ROLES = ['kordinator', 'driver', 'kru', 'penimbang'];

function unitOf(cat) { return cat === 'jelantah' ? 'l' : 'kg'; }

function nextStatuses(status, lines, isMgr) {
  if (status === 'terjadwal') return ['dalam_perjalanan', 'batal'];
  if (status === 'dalam_perjalanan') return ['menimbang', 'batal'];
  if (status === 'menimbang') return (lines > 0 ? ['selesai'] : []).concat(['batal']);
  if (status === 'selesai') return isMgr ? ['terjadwal', 'batal'] : [];
  if (status === 'batal') return isMgr ? ['terjadwal'] : [];
  return [];
}

function stepper(status, cancelReason) {
  if (status === 'batal') {
    return `<div class="row wrap">${ui.badge('batal')}<span class="muted sm">${ui.esc(cancelReason || 'Dibatalkan')}</span></div>`;
  }
  const idx = STEP.indexOf(status);
  return `<div class="row wrap">${STEP.map((s, i) => {
    const tone = i < idx ? 'green' : i === idx ? STATUS_TONE[s] : 'grey';
    const dim = i > idx ? ' style="opacity:.55"' : '';
    return `<span${dim}>${ui.pill(ui.LABEL[s], tone)}</span>`;
  }).join('<span class="muted">›</span>')}</div>`;
}

function photoGrid(photos) {
  if (!photos || !photos.length) return '<p class="muted sm">Belum ada foto untuk baris ini.</p>';
  return `<div class="gal">${photos.map((p) => {
    const src = ui.photoSrc(p);
    return `<figure><img loading="lazy" src="${ui.esc(src)}" alt="" data-full="${ui.esc(src)}">
      <figcaption>${ui.esc(p.caption || '')}${p.taken_by_name ? ` — ${ui.esc(p.taken_by_name)}` : ''}</figcaption></figure>`;
  }).join('')}</div>`;
}

function boundsOf(pts) {
  let minLat = 90; let maxLat = -90; let minLng = 180; let maxLng = -180;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

function drawRoute(canvas, pts) {
  const parent = canvas.parentElement;
  const w = Math.max(240, parent.clientWidth || 320);
  const h = parent.clientHeight || 420;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const { minLat, maxLat, minLng, maxLng } = boundsOf(pts);
  const midLat = (minLat + maxLat) / 2;
  const lngScale = Math.cos((midLat * Math.PI) / 180) || 1;
  const spanLat = (maxLat - minLat) || 0.0008;
  const spanLng = (maxLng - minLng) || 0.0008;
  const widthM = spanLng * 111320 * lngScale;
  const heightM = spanLat * 111320;
  const pad = 26;
  const scale = Math.min((w - 2 * pad) / widthM, (h - 2 * pad) / heightM);
  const drawW = widthM * scale; const drawH = heightM * scale;
  const ox = pad + (w - 2 * pad - drawW) / 2;
  const oy = pad + (h - 2 * pad - drawH) / 2;
  const X = (lng) => ox + (lng - minLng) * 111320 * lngScale * scale;
  const Y = (lat) => oy + (maxLat - lat) * 111320 * scale;

  g.strokeStyle = 'rgba(62,155,58,.25)'; g.lineWidth = 6; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  pts.forEach((p, i) => { const x = X(p.lng); const y = Y(p.lat); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.stroke();
  g.strokeStyle = '#3e9b3a'; g.lineWidth = 2.4;
  g.beginPath();
  pts.forEach((p, i) => { const x = X(p.lng); const y = Y(p.lat); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.stroke();
  pts.forEach((p) => { g.beginPath(); g.arc(X(p.lng), Y(p.lat), 2.6, 0, Math.PI * 2); g.fillStyle = '#167d6b'; g.fill(); });
  const mark = (p, fill) => {
    g.beginPath(); g.arc(X(p.lng), Y(p.lat), 6, 0, Math.PI * 2);
    g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
  };
  mark(pts[0], '#3e9b3a');
  if (pts.length > 1) mark(pts[pts.length - 1], '#c98a13');
}

export default async function render(page, ctx) {
  const id = ctx.params.id;
  const isMgr = ctx.isManager();
  const canCosts = ctx.can('reports.costs');
  const canReceipt = ctx.can('receipts.manage');
  let data = null;
  let trackingSent = 0;
  let trackingLast = null;
  let trackingErrShown = false;

  page.innerHTML = ui.loading('Memuat pengambilan…');

  const usersById = Object.fromEntries(((ctx.bootstrap && ctx.bootstrap.users) || []).map((u) => [u.id, u]));
  const materials = (ctx.bootstrap && ctx.bootstrap.materials) || [];
  const vehiclesRef = (ctx.bootstrap && ctx.bootstrap.vehicles) || [];

  const getPickup = () => data.pickup;
  const editable = () => isMgr || getPickup().status !== 'selesai';

  /* -------------------------------- bagian 1: kepala -------------------------------- */
  function headerCard() {
    const p = getPickup();
    const acts = nextStatuses(p.status, data.totals.lines, isMgr).map((to) =>
      `<button type="button" class="btn sm ${to === 'batal' ? 'danger' : 'pri'}" data-act="status" data-to="${to}">${ACTION_LABEL[to]}</button>`).join('');
    const editBtn = editable()
      ? '<button type="button" class="btn sm" data-act="edit-head">Ubah jadwal</button>' : '';
    const note = p.status === 'menimbang' && data.totals.lines === 0
      ? '<div class="notebox">Catat minimal satu hasil timbangan untuk menyelesaikan pengambilan.</div>' : '';
    return ui.card({
      title: p.code || 'Pengambilan',
      sub: p.status_label,
      actions: `${editBtn}<span class="row">${acts}</span>`,
      body: `<div class="stack">
        ${stepper(p.status, p.cancel_reason)}
        ${note}
        <div class="grid g3">
          <div><div class="sm muted">Mitra</div><div class="nm"><a class="lk" href="#/mitras/${p.mitra_id}">${ui.esc(p.mitra_name)}</a></div>
            <div class="sm">${ui.esc(p.mitra_area || 'tanpa wilayah')}${p.lead_name ? ` · penanggung jawab ${ui.esc(p.lead_name)}` : ''}</div></div>
          <div><div class="sm muted">Tanggal &amp; jadwal</div><div class="nm">${ui.tgl(p.date)}</div>
            <div class="sm">${p.scheduled_at ? `${ui.jam(p.scheduled_at)} WIB` : 'tanpa jam'}${p.arrived_at ? ` · tiba ${ui.jam(p.arrived_at)}` : ''}${p.completed_at ? ` · selesai ${ui.jam(p.completed_at)}` : ''}</div></div>
          <div><div class="sm muted">Alamat</div><div class="sm">${ui.esc(p.mitra_address || '—')}</div>
            ${p.mitra_phone ? `<a class="btn xs" href="${ui.waLink(p.mitra_phone)}" target="_blank" rel="noopener">Hubungi</a>` : ''}</div>
        </div>
        ${p.notes ? `<div class="notebox">${ui.esc(p.notes)}</div>` : ''}
      </div>`,
    });
  }

  /* -------------------------------- bagian 2: timbangan -------------------------------- */
  function itemsCard() {
    const t = data.totals;
    const photoCount = {};
    for (const ph of data.item_photos || []) photoCount[ph.owner_id] = (photoCount[ph.owner_id] || 0) + 1;
    const cols = [
      { label: 'No', align: 'center', render: (r) => r.line_no },
      { label: 'Bahan', render: (r) => `<div class="nm">${ui.esc(r.material_name)}</div><div class="sm">${ui.badge(r.category)}</div>` },
      { label: 'Penuh', align: 'right', render: (r) => ui.berat(r.gross_weight, unitOf(r.category)) },
      { label: 'Kosong', align: 'right', render: (r) => ui.berat(r.tare_weight, unitOf(r.category)) },
      { label: 'Minus', align: 'right', render: (r) => (r.minus_pct ? ui.pct(r.minus_pct) : '—') },
      { label: 'Bersih', align: 'right', render: (r) => `<b>${ui.berat(r.net_weight, unitOf(r.category))}</b>` },
      { label: 'Harga', align: 'right', render: (r) => `${ui.rp(r.unit_price)}<div class="sm muted">/ ${unitOf(r.category)}</div>` },
      { label: 'Jumlah', align: 'right', render: (r) => `<b>${ui.rp(r.amount)}</b>` },
      { label: 'Penimbang', render: (r) => `<span class="sm">${ui.esc(usersById[r.weighed_by] || '—')}</span>${r.mitra_witness ? '<div class="sm muted">disaksikan mitra</div>' : ''}${r.note ? `<div class="sm">${ui.esc(r.note)}</div>` : ''}` },
      {
        label: 'Foto',
        align: 'center',
        render: (r) => photoCount[r.id]
          ? `<button type="button" class="btn xs ghost" data-act="row-view" data-id="${r.id}">${photoCount[r.id]} foto</button>`
          : '<span class="muted sm">—</span>',
      },
    ];
    if (editable()) {
      cols.push({
        label: '',
        align: 'right',
        render: (r) => `<div class="row" style="justify-content:flex-end">
          <button type="button" class="btn xs" data-act="row-photo" data-id="${r.id}" title="Tambah foto">+&#128247;</button>
          <button type="button" class="btn xs" data-act="item-edit" data-id="${r.id}">Ubah</button>
          <button type="button" class="btn xs danger" data-act="item-del" data-id="${r.id}">Hapus</button></div>`,
      });
    }
    const addBtn = editable() ? '<button type="button" class="btn sm pri" data-act="item-add">+ Tambah baris</button>' : '';
    const recount = isMgr && data.pickup.cost_source === 'auto'
      ? '<button type="button" class="btn sm" data-act="recount">Hitung ulang</button>' : '';
    const foot = `<div class="row wrap spread">
      <div style="flex:1;min-width:220px">
        ${ui.statRow([
      { label: 'Kertas', value: ui.berat(t.paper_kg, 'kg') },
      { label: 'Jelantah', value: ui.berat(t.oil_liters, 'l') },
      { label: 'Nilai', value: ui.rp(t.total_amount) },
    ])}
      </div>
      <div class="row">${recount}${addBtn}</div></div>`;
    return ui.card({
      title: 'Hasil timbangan',
      sub: `${t.lines} baris`,
      flush: true,
      body: t.items.length
        ? ui.table({ columns: cols, rows: t.items, emptyText: 'Belum ada timbangan.' })
        : ui.empty('Belum ada hasil timbangan.', editable() ? '<button type="button" class="btn pri sm" data-act="item-add">+ Tambah baris pertama</button>' : ''),
      foot,
    });
  }

  /* -------------------------------- bagian 3: foto -------------------------------- */
  function photosCard() {
    const body = ui.gallery(data.photos, { add: editable(), label: 'Ambil / pilih foto' });
    return ui.card({ title: 'Foto bukti pembelian', sub: `${(data.photos || []).length} foto`, body });
  }

  /* -------------------------------- bagian 4: tim & kendaraan -------------------------------- */
  function crewCard() {
    const addBtn = editable() ? '<button type="button" class="btn sm" data-act="crew-add">+ Tambah kru</button>' : '';
    const rows = (data.crew || []).map((c) => `<div class="li">
      <span class="dot"></span>
      <div class="bd1"><div class="t1">${ui.esc(c.name)}</div>
        <div class="m1">${ui.pill(CREW_ROLE[c.role_in_run] || c.role_in_run, 'grey')}${c.phone ? ` · <a class="lk" href="${ui.waLink(c.phone)}" target="_blank" rel="noopener">${ui.esc(c.phone)}</a>` : ''}</div></div>
      ${editable() ? `<div class="end r"><button type="button" class="btn xs danger" data-act="crew-del" data-id="${c.user_id}">Keluarkan</button></div>` : ''}
    </div>`).join('');
    return ui.card({
      title: 'Tim',
      sub: `${(data.crew || []).length} orang`,
      actions: addBtn,
      body: rows || '<p class="muted sm">Kru belum ditunjuk.</p>',
    });
  }

  function vehiclesCard() {
    const addBtn = editable() ? '<button type="button" class="btn sm" data-act="veh-add">+ Tambah armada</button>' : '';
    const cols = [
      { label: 'Plat', render: (v) => `<div class="nm mono">${ui.esc(v.plate)}</div><div class="sm muted">${ui.esc(v.name)} · ${ui.LABEL[v.type] || v.type}</div>` },
      { label: 'KM awal', align: 'right', render: (v) => (v.km_start != null ? ui.angka(v.km_start) : '—') },
      { label: 'KM akhir', align: 'right', render: (v) => (v.km_end != null ? ui.angka(v.km_end) : '—') },
      { label: 'Jarak', align: 'right', render: (v) => (v.km_start != null && v.km_end != null ? ui.berat(v.km_end - v.km_start, 'km') : '<span class="muted sm">otomatis</span>') },
    ];
    if (canCosts) {
      cols.push({ label: 'Liter', align: 'right', render: (v) => (v.liters_manual != null ? ui.angka(v.liters_manual, 1) : '<span class="muted sm">otomatis</span>') });
      cols.push({ label: 'Biaya', align: 'right', render: (v) => (v.cost_manual != null ? ui.rp(v.cost_manual) : '<span class="muted sm">otomatis</span>') });
    }
    if (editable()) {
      cols.push({
        label: '',
        align: 'right',
        render: (v) => `<div class="row" style="justify-content:flex-end">
          <button type="button" class="btn xs" data-act="veh-edit" data-id="${v.vehicle_id}">Ubah</button>
          <button type="button" class="btn xs danger" data-act="veh-del" data-id="${v.vehicle_id}">Lepas</button></div>`,
      });
    }
    return ui.card({
      title: 'Kendaraan',
      sub: `${(data.vehicles || []).length} unit`,
      actions: addBtn,
      flush: true,
      body: (data.vehicles || []).length
        ? ui.table({ columns: cols, rows: data.vehicles })
        : ui.empty('Belum ada armada pada penugasan ini.'),
    });
  }

  /* -------------------------------- bagian 5: BBM -------------------------------- */
  function fuelCard() {
    if (!canCosts || !data.fuel) return '';
    const f = data.fuel;
    const p = getPickup();
    const qty = (data.totals.paper_kg || 0) + (data.totals.oil_liters || 0);
    const perKg = qty > 0 && f.fuel_cost ? Math.round(f.fuel_cost / qty) : 0;
    const ratio = data.totals.total_amount > 0 && f.fuel_cost ? Math.round((f.fuel_cost / data.totals.total_amount) * 1000) / 10 : 0;
    const srcNote = f.km_source === 'odometer'
      ? 'Jarak diambil dari selisih KM spido (odometer) tiap armada.'
      : f.km_source === 'manual'
        ? 'Jarak dan biaya diisi manual oleh admin.'
        : 'Jarak dihitung dari titik GPS karena KM akhir belum diisi.';
    const vcols = [
      { label: 'Armada', render: (v) => `<span class="nm mono">${ui.esc(v.plate)}</span>` },
      { label: 'Jarak', align: 'right', render: (v) => ui.berat(v.distance_km, 'km') },
      { label: 'Konsumsi', align: 'right', render: (v) => `${ui.angka(v.consumption_km_per_l, 1)} km/l` },
      { label: 'Liter', align: 'right', render: (v) => (v.override ? `<b>${ui.angka(v.liters, 1)}</b>` : ui.angka(v.liters, 1)) },
      { label: 'Harga/l', align: 'right', render: (v) => ui.rp(v.price_per_liter) },
      { label: 'Biaya', align: 'right', render: (v) => `<b>${ui.rp(v.cost)}</b>` },
    ];
    const stats = [
      { label: 'Total jarak', value: ui.berat(f.distance_km, 'km') },
      { label: 'Total BBM', value: ui.berat(f.fuel_liters, 'l') },
      { label: 'Biaya BBM', value: ui.rp(f.fuel_cost) },
      { label: 'BBM per kg/l', value: perKg ? ui.rp(perKg) : '—' },
    ];
    if (ratio) stats.push({ label: 'BBM terhadap nilai', value: `${ui.angka(ratio, 1)}%` });
    return ui.card({
      title: 'Biaya BBM',
      sub: srcNote,
      flush: true,
      body: `${(f.vehicles || []).length ? ui.table({ columns: vcols, rows: f.vehicles }) : '<p class="muted sm" style="padding:12px">Belum ada armada untuk menghitung BBM.</p>'}`,
      foot: `${f.gps_distance_km ? `<div class="sm muted" style="margin-bottom:8px">Jejak GPS: ${ui.berat(f.gps_distance_km, 'km')}.</div>` : ''}${ui.statRow(stats)}`,
    });
  }

  /* -------------------------------- bagian 6: rute -------------------------------- */
  function routeCard() {
    const pts = data.tracking || [];
    if (!pts.length) {
      return ui.card({ title: 'Rute GPS', body: '<p class="muted sm">Belum ada titik GPS untuk pengambilan ini. Titik muncul saat kru mengaktifkan pelacakan di lapangan.</p>' });
    }
    const first = pts[0]; const last = pts[pts.length - 1];
    const list = pts.slice(-40).reverse().map((pt) => `<div class="li"><span class="dot"></span>
      <div class="bd1"><div class="t1">${ui.jam(pt.recorded_at)} <span class="muted sm">${ui.umur(pt.recorded_at)}</span></div>
      <div class="m1 mono">${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}${pt.speed != null ? ` · ${Math.round(pt.speed)} km/j` : ''}</div></div>
      ${usersById[pt.user_id] ? `<div class="end r sm muted">${ui.esc(usersById[pt.user_id])}</div>` : ''}</div>`).join('');
    return ui.card({
      title: 'Rute GPS',
      sub: `${pts.length} titik · ${ui.jam(first.recorded_at)}–${ui.jam(last.recorded_at)}`,
      actions: `<a class="btn sm" href="https://www.google.com/maps?q=${last.lat},${last.lng}" target="_blank" rel="noopener">Buka di Google Maps</a>`,
      body: `<div class="grid g2">
        <div class="mapbox"><canvas id="rute-canvas"></canvas></div>
        <div style="max-height:420px;overflow:auto">${list}</div>
      </div>`,
    });
  }

  /* -------------------------------- bagian 7: kwitansi -------------------------------- */
  function receiptCard() {
    const rc = data.receipt;
    if (rc) {
      const acts = [`<a class="btn sm" href="/api/print/receipt/${rc.id}" target="_blank" rel="noopener">Cetak</a>`];
      if (rc.status === 'draf') acts.push('<button type="button" class="btn sm pri" data-act="rcpt-status" data-id="' + rc.id + '" data-to="terbit">Terbitkan</button>');
      if (rc.status === 'terbit') acts.push('<button type="button" class="btn sm pri" data-act="rcpt-status" data-id="' + rc.id + '" data-to="lunas">Tandai lunas</button>');
      if (isMgr && rc.status !== 'batal') acts.push('<button type="button" class="btn sm danger" data-act="rcpt-status" data-id="' + rc.id + '" data-to="batal">Batalkan</button>');
      if (rc.status !== 'batal' && !(rc.status === 'lunas' && !isMgr)) acts.push('<button type="button" class="btn sm" data-act="rcpt-edit" data-id="' + rc.id + '">Ubah</button>');
      return ui.card({
        title: 'Kwitansi',
        sub: rc.number,
        actions: `<span class="row">${acts.join('')}</span>`,
        body: `<div class="grid g4">
          <div><div class="sm muted">Status</div>${ui.badge(rc.status)}</div>
          <div><div class="sm muted">Nominal</div><div class="nm">${ui.rp(rc.total)}</div></div>
          <div><div class="sm muted">Cara bayar</div><div class="nm">${rc.method === 'transfer' ? 'Transfer' : 'Tunai'}</div></div>
          <div><div class="sm muted">Tanggal</div><div class="nm">${ui.tgl(rc.issued_at)}</div></div>
        </div>
        <div class="sm muted" style="margin-top:8px">Penerima: ${ui.esc(rc.seller_name || '—')}${rc.staff_name ? ` · petugas ${ui.esc(rc.staff_name)}` : ''} · <a class="lk" href="#/kwitansi">Daftar kwitansi</a></div>`,
      });
    }
    if (!canReceipt || data.totals.lines === 0 || data.pickup.status === 'batal') return '';
    return ui.card({
      title: 'Kwitansi',
      body: `<p class="muted sm">Belum ada kwitansi untuk pengambilan ini.</p>
        <button type="button" class="btn pri sm" data-act="rcpt-new">Buat kwitansi</button>`,
    });
  }

  /* -------------------------------- bagian 8: lokasi kru -------------------------------- */
  function trackCard() {
    const p = getPickup();
    const active = ['dalam_perjalanan', 'menimbang'].includes(p.status);
    if (isMgr || !active) return '';
    if (!geoSupported()) {
      return ui.card({ title: 'Lokasi saya', body: '<p class="muted sm">Perangkat ini tidak mendukung GPS. Aktifkan lokasi pada browser untuk mengirim titik.</p>' });
    }
    return ui.card({
      title: 'Lokasi saya',
      sub: 'dikirim otomatis selama penjemputan berjalan',
      actions: '<button type="button" class="btn sm pri" id="track-btn" data-act="track">Mulai lacak</button>',
      body: '<div id="track-status" class="muted sm">Pelacakan belum aktif.</div>',
    });
  }

  function paint() {
    page.innerHTML = [
      headerCard(),
      itemsCard(),
      photosCard(),
      `<div class="grid g2" style="margin-top:14px">${crewCard()}${vehiclesCard()}</div>`,
      fuelCard() ? `<div style="margin-top:14px">${fuelCard()}</div>` : '',
      `<div style="margin-top:14px">${routeCard()}</div>`,
      receiptCard() ? `<div style="margin-top:14px">${receiptCard()}</div>` : '',
      trackCard() ? `<div style="margin-top:14px">${trackCard()}</div>` : '',
    ].filter(Boolean).join('');
    page.querySelectorAll('[data-del-photo]').forEach((b) => b.remove());
    const canvas = page.querySelector('#rute-canvas');
    if (canvas && (data.tracking || []).length) requestAnimationFrame(() => drawRoute(canvas, data.tracking));
    syncTrackButton();
  }

  async function reload() {
    data = await api.get(`/api/pickups/${id}`);
    paint();
  }

  /* -------------------------------- aksi -------------------------------- */
  function itemDialog(row) {
    const matOpts = materials.map((m) => ({
      value: m.id,
      label: `${m.name} — ${ui.rp(m.price)}/${unitOf(m.category)}`,
    }));
    const isEdit = !!row;
    ui.formDialog({
      title: isEdit ? 'Ubah hasil timbangan' : 'Tambah hasil timbangan',
      size: 'wide',
      okLabel: isEdit ? 'Simpan perubahan' : 'Simpan baris',
      fields: [
        { name: 'material_id', label: 'Bahan', type: 'select', required: true, options: matOpts, value: row ? row.material_id : (materials[0] && materials[0].id), col: 1 },
        { name: 'gross_weight', label: 'Timbangan penuh', type: 'number', step: '0.01', min: 0, required: true, value: row ? row.gross_weight : '' },
        { name: 'tare_weight', label: 'Timbangan kosong', type: 'number', step: '0.01', min: 0, value: row ? row.tare_weight : 0 },
        { name: 'minus_pct', label: 'Minus (%)', type: 'number', step: '0.1', min: 0, max: 100, value: row ? row.minus_pct : 0 },
        { name: 'unit_price', label: 'Harga satuan', type: 'money', value: row ? row.unit_price : '', hint: 'Kosongkan untuk memakai harga berjalan.' },
        { name: 'note', label: 'Catatan', type: 'text', value: row ? row.note : '', col: 1 },
        { name: 'mitra_witness', label: 'Disaksikan mitra', type: 'checkbox', boxLabel: 'Disaksikan perwakilan mitra', value: row ? !!row.mitra_witness : true },
        { name: 'foto', label: 'Foto timbangan', type: 'photos', capture: true, buttonLabel: 'Ambil foto timbangan' },
      ],
      note: 'Bersih = (penuh − kosong) × (1 − minus%). Nilai = bersih × harga satuan.',
      onSubmit: async (v) => {
        const body = {
          material_id: Number(v.material_id),
          gross_weight: Number(v.gross_weight) || 0,
          tare_weight: Number(v.tare_weight) || 0,
          minus_pct: Number(v.minus_pct) || 0,
          mitra_witness: v.mitra_witness ? 1 : 0,
        };
        if (v.unit_price != null && v.unit_price !== '') body.unit_price = Number(v.unit_price);
        if (v.note) body.note = v.note;
        if (v.foto && v.foto[0]) body.photo = v.foto[0];
        if (isEdit) await api.put(`/api/pickups/${id}/items/${row.id}`, body);
        else await api.post(`/api/pickups/${id}/items`, body);
        ui.toast(isEdit ? 'Baris diperbarui.' : 'Baris ditambahkan.');
        await reload();
      },
    });
  }

  function headDialog() {
    const p = getPickup();
    ui.formDialog({
      title: 'Ubah jadwal pengambilan',
      size: 'wide',
      fields: [
        { name: 'mitra_id', label: 'Mitra tujuan', type: 'select', required: true, value: p.mitra_id, options: allMitraOptions(), col: 1 },
        { name: 'date', label: 'Tanggal', type: 'date', required: true, value: p.date },
        { name: 'time', label: 'Jam dijadwalkan', type: 'time', value: p.scheduled_at ? String(p.scheduled_at).slice(11, 16) : '' },
        { name: 'lead_user_id', label: 'Penanggung jawab', type: 'select', value: p.lead_user_id || '', options: leadOptions() },
        { name: 'notes', label: 'Catatan', type: 'textarea', value: p.notes || '', col: 1 },
      ],
      onSubmit: async (v) => {
        const body = { mitra_id: Number(v.mitra_id), date: v.date, notes: v.notes || '' };
        body.scheduled_at = v.time ? `${v.date} ${v.time}` : '';
        body.lead_user_id = v.lead_user_id ? Number(v.lead_user_id) : null;
        await api.put(`/api/pickups/${id}`, body);
        ui.toast('Jadwal diperbarui.');
        await reload();
      },
    });
  }

  function allMitraOptions() {
    // Diisi saat pertama kali dibutuhkan (lihat mitrasCache di bawah).
    return mitrasCache.map((m) => ({ value: m.id, label: `${m.name}${m.area ? ` — ${m.area}` : ''}` }));
  }
  function leadOptions() {
    return (ctx.bootstrap.users || [])
      .filter((u) => u.role === 'crew' || u.role === 'purchasing' || u.role === 'admin')
      .map((u) => ({ value: u.id, label: u.name }));
  }

  function crewDialog() {
    const current = new Set((data.crew || []).map((c) => c.user_id));
    const opts = (ctx.bootstrap.users || [])
      .filter((u) => u.is_active !== 0 && !current.has(u.id) && (u.role === 'crew' || u.role === 'purchasing' || u.role === 'admin'))
      .map((u) => ({ value: u.id, label: `${u.name} (${ui.LABEL[u.role] || u.role})` }));
    if (!opts.length) return ui.toast('Semua pengguna aktif sudah masuk tim ini.', 'warn');
    ui.formDialog({
      title: 'Tambah kru',
      size: 'thin',
      fields: [
        { name: 'user_id', label: 'Anggota', type: 'select', required: true, options: opts, col: 1 },
        { name: 'role_in_run', label: 'Peran pada run ini', type: 'select', required: true, value: 'kru', options: CREW_ROLES.map((r) => ({ value: r, label: CREW_ROLE[r] })), col: 1 },
      ],
      onSubmit: async (v) => {
        await api.post(`/api/pickups/${id}/crew`, { user_id: Number(v.user_id), role_in_run: v.role_in_run });
        ui.toast('Kru ditambahkan.');
        await reload();
      },
    });
  }

  function vehicleDialog(row) {
    const isEdit = !!row;
    const vehOpts = isEdit
      ? [{ value: row.vehicle_id, label: `${row.plate} — ${row.name}` }]
      : vehiclesRef.map((x) => ({ value: x.id, label: `${x.plate} — ${x.name}` }));
    const fields = isEdit ? [{ name: 'plate', label: 'Armada', type: 'static', value: `${row.plate} — ${row.name}`, col: 1 }] : [];
    if (!isEdit) fields.push({ name: 'vehicle_id', label: 'Armada', type: 'select', required: true, options: vehOpts, col: 1 });
    fields.push(
      { name: 'km_start', label: 'KM awal', type: 'number', step: '0.1', min: 0, value: row ? row.km_start : '' },
      { name: 'km_end', label: 'KM akhir', type: 'number', step: '0.1', min: 0, value: row ? row.km_end : '' },
    );
    if (isEdit && canCosts) {
      fields.push(
        { name: 'liters', label: 'Liter (opsional)', type: 'number', step: '0.1', min: 0, value: row ? row.liters_manual : '', hint: 'Isi untuk menimpa hitungan otomatis.' },
        { name: 'cost', label: 'Biaya (opsional)', type: 'money', value: row ? row.cost_manual : '', hint: 'Isi untuk menimpa hitungan otomatis.' },
      );
    }
    ui.formDialog({
      title: isEdit ? 'Ubah data armada' : 'Tambah armada',
      size: 'wide',
      fields,
      onSubmit: async (v) => {
        if (!isEdit) {
          const body = { vehicle_id: Number(v.vehicle_id) };
          if (v.km_start != null && v.km_start !== '') body.km_start = Number(v.km_start);
          if (v.km_end != null && v.km_end !== '') body.km_end = Number(v.km_end);
          await api.post(`/api/pickups/${id}/vehicles`, body);
        } else {
          const body = {
            km_start: v.km_start === '' ? null : Number(v.km_start),
            km_end: v.km_end === '' ? null : Number(v.km_end),
          };
          if (canCosts) {
            body.liters = v.liters === '' ? null : Number(v.liters);
            body.cost = v.cost === '' || v.cost == null ? null : Number(v.cost);
          }
          await api.put(`/api/pickups/${id}/vehicles/${row.vehicle_id}`, body);
        }
        try { await api.post(`/api/pickups/${id}/recount`); } catch { /* hitung ulang opsional */ }
        ui.toast('Data armada tersimpan.');
        await reload();
      },
    });
  }

  async function receiptNew() {
    let pv;
    try {
      pv = await api.get('/api/receipts/preview' + query({ pickup_id: id }));
    } catch (err) {
      return ui.toastError(err);
    }
    if (pv.exists) {
      await reload();
      return ui.toast('Kwitansi sudah ada untuk pengambilan ini.', 'warn');
    }
    const snap = pv.snapshot || {};
    const val = {
      number: pv.suggested_number || '',
      issued_at: data.pickup.date,
      method: 'tunai',
      seller_name: (pv.default_seller && pv.default_seller.name) || '',
      seller_address: (pv.default_seller && pv.default_seller.address) || '',
      seller_phone: (pv.default_seller && pv.default_seller.phone) || '',
      staff_name: (pv.staff && pv.staff.name) || '',
      staff_title: (pv.staff && pv.staff.title) || '',
    };
    ui.formDialog({
      title: 'Buat kwitansi',
      subtitle: `Total ${ui.rp(snap.total || 0)} · ${ui.angka(snap.lines ? snap.lines.length : 0)} baris timbangan`,
      size: 'wide',
      values: val,
      okLabel: 'Simpan kwitansi',
      fields: [
        { name: 'number', label: 'Nomor kwitansi', type: 'text' },
        { name: 'issued_at', label: 'Tanggal terbit', type: 'date' },
        { name: 'seller_name', label: 'Diterima oleh', type: 'text' },
        { name: 'seller_phone', label: 'Telepon penerima', type: 'tel' },
        { name: 'seller_address', label: 'Alamat penerima', type: 'text', col: 1 },
        { name: 'method', label: 'Cara bayar', type: 'radio', options: [{ value: 'tunai', label: 'Tunai' }, { value: 'transfer', label: 'Transfer' }] },
        { name: 'staff_name', label: 'Petugas', type: 'text' },
        { name: 'staff_title', label: 'Jabatan petugas', type: 'text' },
      ],
      onSubmit: async (v) => {
        const body = { pickup_id: Number(id) };
        for (const k of ['number', 'issued_at', 'method', 'seller_name', 'seller_address', 'seller_phone', 'staff_name', 'staff_title']) {
          if (v[k]) body[k] = v[k];
        }
        await api.post('/api/receipts', body);
        ui.toast('Kwitansi dibuat.');
        await reload();
      },
    });
  }

  function receiptEdit(rc) {
    ui.formDialog({
      title: 'Ubah kwitansi',
      size: 'wide',
      values: rc,
      fields: [
        { name: 'number', label: 'Nomor', type: 'text', value: rc.number },
        { name: 'method', label: 'Cara bayar', type: 'radio', value: rc.method, options: [{ value: 'tunai', label: 'Tunai' }, { value: 'transfer', label: 'Transfer' }] },
        { name: 'seller_name', label: 'Diterima oleh', type: 'text', value: rc.seller_name },
        { name: 'seller_phone', label: 'Telepon penerima', type: 'tel', value: rc.seller_phone },
        { name: 'seller_address', label: 'Alamat penerima', type: 'text', value: rc.seller_address, col: 1 },
        { name: 'staff_name', label: 'Petugas', type: 'text', value: rc.staff_name },
        { name: 'staff_title', label: 'Jabatan petugas', type: 'text', value: rc.staff_title },
      ],
      onSubmit: async (v) => {
        await api.put(`/api/receipts/${rc.id}`, {
          number: v.number, method: v.method, seller_name: v.seller_name,
          seller_phone: v.seller_phone, seller_address: v.seller_address,
          staff_name: v.staff_name, staff_title: v.staff_title,
        });
        ui.toast('Kwitansi diperbarui.');
        await reload();
      },
    });
  }

  async function changeStatus(to) {
    if (to === 'batal') return cancelDialog();
    const ok = await ui.confirmDialog({
      title: 'Ubah status',
      message: `Ubah menjadi “${ACTION_LABEL[to]}” (${ui.LABEL[to] || to})?`,
      okLabel: 'Ya, lanjutkan',
    });
    if (!ok) return;
    try {
      await api.post(`/api/pickups/${id}/status`, { status: to });
      ui.toast('Status diperbarui.');
      await reload();
    } catch (err) {
      ui.toastError(err);
    }
  }

  function cancelDialog() {
    ui.formDialog({
      title: 'Batalkan pengambilan',
      size: 'thin',
      okLabel: 'Batalkan pengambilan',
      fields: [{ name: 'reason', label: 'Alasan pembatalan', type: 'textarea', required: true, placeholder: 'Mis. mitra libur / tidak dapat dihubungi.' }],
      onSubmit: async (v) => {
        await api.post(`/api/pickups/${id}/status`, { status: 'batal', reason: v.reason });
        ui.toast('Pengambilan dibatalkan.');
        await reload();
      },
    });
  }

  function rowPhotoViewer(itemId) {
    const photos = (data.item_photos || []).filter((p) => p.owner_id === itemId);
    ui.openDialog({ title: 'Foto timbangan', size: 'wide', body: photoGrid(photos) });
  }

  function rowPhotoAdd(itemId) {
    ui.formDialog({
      title: 'Tambah foto timbangan',
      size: 'thin',
      okLabel: 'Simpan foto',
      fields: [{ name: 'foto', label: 'Foto', type: 'photos', capture: true, buttonLabel: 'Ambil / pilih foto' }],
      onSubmit: async (v) => {
        if (!v.foto || !v.foto.length) { ui.toast('Pilih foto terlebih dahulu.', 'warn'); return false; }
        await api.post(`/api/pickups/${id}/items/${itemId}/photo`, { photo: v.foto[0] });
        ui.toast('Foto tersimpan.');
        await reload();
      },
    });
  }

  async function addPickupPhotos() {
    const btn = page.querySelector('[data-act="add-photo"]');
    if (btn) btn.disabled = true;
    try {
      const { photos, gagal } = await collectPhotos({ capture: true });
      if (!photos.length) { ui.toast('Tidak ada foto dipilih.', 'warn'); return; }
      if (gagal) ui.toast('Beberapa berkas terlalu besar dan dilewati.', 'warn');
      await api.post(`/api/pickups/${id}/photos`, { photos });
      ui.toast('Foto tersimpan.');
      await reload();
    } catch (err) {
      ui.toastError(err);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function recount() {
    try {
      await api.post(`/api/pickups/${id}/recount`);
      ui.toast('Biaya dan total dihitung ulang.');
      await reload();
    } catch (err) {
      ui.toastError(err);
    }
  }

  /* -------------------------------- pelacakan -------------------------------- */
  function syncTrackButton() {
    const btn = page.querySelector('#track-btn');
    const st = page.querySelector('#track-status');
    if (!btn || !st) return;
    const on = isTracking();
    btn.textContent = on ? 'Berhenti lacak' : 'Mulai lacak';
    btn.classList.toggle('pri', !on);
    btn.classList.toggle('danger', on);
    st.innerHTML = on
      ? `Melacak aktif · ${trackingSent} titik terkirim${trackingLast ? ` · terakhir ${ui.jam(trackingLast.at || trackingLast.recorded_at || new Date())}` : ''}`
      : 'Pelacakan belum aktif.';
  }
  function toggleTrack() {
    if (isTracking()) { stopTracking(); syncTrackButton(); return; }
    trackingSent = 0; trackingLast = null; trackingErrShown = false;
    startTracking({
      intervalMs: 60000,
      onPoint: (pt) => { trackingSent += 1; trackingLast = pt; syncTrackButton(); },
      onError: (err) => { if (!trackingErrShown) { trackingErrShown = true; ui.toast(err.message || 'Gagal membaca GPS.', 'warn'); } syncTrackButton(); },
    });
    syncTrackButton();
  }

  /* -------------------------------- delegasi -------------------------------- */
  async function handle(act, el) {
    switch (act) {
      case 'status': return changeStatus(el.dataset.to);
      case 'edit-head': return headDialog();
      case 'recount': return recount();
      case 'item-add': return itemDialog(null);
      case 'item-edit': return itemDialog((data.totals.items || []).find((x) => String(x.id) === el.dataset.id));
      case 'item-del': {
        if (!await ui.confirmDialog({ title: 'Hapus baris', message: 'Baris timbangan dan fotonya akan dihapus.', okLabel: 'Hapus', danger: true })) return;
        try { await api.del(`/api/pickups/${id}/items/${el.dataset.id}`); ui.toast('Baris dihapus.'); await reload(); } catch (err) { ui.toastError(err); }
        return;
      }
      case 'row-view': return rowPhotoViewer(Number(el.dataset.id));
      case 'row-photo': return rowPhotoAdd(Number(el.dataset.id));
      case 'add-photo': return addPickupPhotos();
      case 'crew-add': return crewDialog();
      case 'crew-del': {
        if (!await ui.confirmDialog({ title: 'Keluarkan kru', message: 'Keluarkan anggota dari tim ini?', okLabel: 'Keluarkan', danger: true })) return;
        try { await api.del(`/api/pickups/${id}/crew/${el.dataset.id}`); ui.toast('Kru dikeluarkan.'); await reload(); } catch (err) { ui.toastError(err); }
        return;
      }
      case 'veh-add': return vehicleDialog(null);
      case 'veh-edit': return vehicleDialog((data.vehicles || []).find((x) => String(x.vehicle_id) === el.dataset.id));
      case 'veh-del': {
        if (!await ui.confirmDialog({ title: 'Lepas armada', message: 'Armada ini akan dilepas dari penugasan.', okLabel: 'Lepas', danger: true })) return;
        try { await api.del(`/api/pickups/${id}/vehicles/${el.dataset.id}`); ui.toast('Armada dilepas.'); await reload(); } catch (err) { ui.toastError(err); }
        return;
      }
      case 'rcpt-new': return receiptNew();
      case 'rcpt-edit': return receiptEdit((data.receipt && String(data.receipt.id) === el.dataset.id) ? data.receipt : null);
      case 'rcpt-status': {
        const to = el.dataset.to;
        if (!await ui.confirmDialog({ title: 'Status kwitansi', message: `Ubah kwitansi menjadi “${ui.LABEL[to] || to}”?`, okLabel: 'Ya', danger: to === 'batal' })) return;
        try { await api.post(`/api/receipts/${el.dataset.id}/status`, { status: to }); ui.toast('Status kwitansi diperbarui.'); await reload(); } catch (err) { ui.toastError(err); }
        return;
      }
      case 'track': return toggleTrack();
      default: return undefined;
    }
  }
  function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el || !page.contains(el)) return;
    handle(el.dataset.act, el, ev);
  }

  // muat opsi mitra sekali (untuk dialog ubah jadwal)
  let mitrasCache = [];
  try {
    const res = await api.get('/api/mitras' + query(isMgr ? { include_inactive: 1 } : { include_inactive: 1, mine: 1 }));
    mitrasCache = (res.mitras || []).filter((m) => m.status !== 'nonaktif');
  } catch { mitrasCache = []; }

  try {
    await reload();
  } catch (err) {
    page.innerHTML = ui.card({ title: 'Tidak dapat memuat', body: `<p class="muted">${ui.esc(err.message || 'Terjadi kesalahan.')}</p><a class="btn pri" href="#/papan">Kembali ke papan</a>` });
    return () => {};
  }
  page.addEventListener('click', onClick);

  return () => {
    stopTracking();
    page.removeEventListener('click', onClick);
  };
}
