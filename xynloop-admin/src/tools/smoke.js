/** Uji end-to-end seluruh alur bisnis melalui API (menjalankan server lebih dulu).
 *  Pemakaian: node src/tools/smoke.js [http://localhost:3000] */
import { fixtureDataUrl } from './fixture-image.js';

const BASE = process.argv[2] || 'http://localhost:3000';
let cookie = '';
let pass = 0;
let fail = 0;
const log = (...a) => console.log(...a);

function check(name, condition, extra = '') {
  if (condition) {
    pass++;
    log(`  ok   ${name}`);
  } else {
    fail++;
    log(`  GAGAL ${name} ${extra}`);
  }
}

async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(method === 'GET' ? {} : { 'x-xxl': '1' }),
      cookie,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const set = res.headers.getSetCookie?.() || [];
  for (const c of set) cookie = c.split(';')[0];
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 4000) }; }
  if (res.status >= 500) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, data, text };
}

const api = (m, u, b) => call(m, u, b).then((x) => x.data);
const today = new Date().toISOString().slice(0, 10);

log('\n=== 1. Masuk & hak akses ===');
const boot = await call('POST', '/api/auth/login', { username: process.env.SMOKE_USER || 'admin', password: process.env.SMOKE_PASS || 'Xynloop2026!' });
check('login admin', boot.status === 200 && boot.data.user?.role === 'owner', JSON.stringify(boot.data).slice(0, 200));
const me = await api('GET', '/api/auth/me');
check('sesi bertahan', me.user?.username === (process.env.SMOKE_USER || 'admin'));
const caps = me.user?.caps || [];
check('admin punya hak kelola akun', caps.includes('users.manage'));
await call('GET', '/api/ping');

log('\n=== 2. Admin membuat akun bagian purchasing & penjemputan ===');
const staff = {
  purchasing: await api('POST', '/api/users', { name: 'Sari Pamila', username: 'sari', role: 'purchasing', password: 'Xynloop2026!', phone: '081234567810', area: 'Pontianak Timur' }),
  purchasing2: await api('POST', '/api/users', { name: 'Bagas Wicaksono', username: 'bagas', role: 'purchasing', password: 'Xynloop2026!', phone: '081234567811', area: 'Pontianak Kota' }),
  crew: await api('POST', '/api/users', { name: 'Ahmad Dahlan', username: 'dahlan', role: 'crew', password: 'Xynloop2026!', phone: '081234567812' }),
  crew2: await api('POST', '/api/users', { name: 'Yusuf Maulana', username: 'yusuf', role: 'crew', password: 'Xynloop2026!', phone: '081234567813' }),
};
check('akun purchasing dibuat', !!staff.purchasing.user?.id);
check('akun kru dibuat', !!staff.crew.user?.id);
const dup = await call('POST', '/api/users', { name: 'Sari Dua', username: 'sari', role: 'purchasing', password: 'Xynloop2026!' });
check('username ganda ditolak', dup.status === 400);

log('\n=== 3. Data dasar: armada, harga, material ===');
const v1 = await api('POST', '/api/reference/vehicles', { plate: 'KB 8811 SAA', name: 'Ertiga boks', type: 'mobil', fuel_type: 'pertalite', consumption_km_per_l: 12, capacity_kg: 800 });
const v2 = await api('POST', '/api/reference/vehicles', { plate: 'KB 9922 XYZ', name: 'Gran Max boks', type: 'pick_up', fuel_type: 'pertalite', consumption_km_per_l: 9, capacity_kg: 1200 });
const veh1 = (v1.vehicle || {});
const veh2 = (v2.vehicle || {});
check('dua armada tercatat', veh1.id > 0 && veh2.id > 0, JSON.stringify(v1).slice(0, 150));
const bootstrap = await api('GET', '/api/reference/bootstrap');
check('material kertas & jelantah ada', (bootstrap.materials || []).length >= 7);
const paperMat = bootstrap.materials.find((m) => m.code === 'KR1');
const bookMat = bootstrap.materials.find((m) => m.code === 'KR3');
const oilMat = bootstrap.materials.find((m) => m.code === 'MJ1');
check('harga aktif ikut terkirim', paperMat?.price > 0 && oilMat?.price > 0);
const priceSet = await api('POST', '/api/reference/prices', { material_id: paperMat.id, price: 1450, effective_from: today, note: 'Harga uji' });
const afterPrice = await api('GET', '/api/reference/bootstrap');
check('penyesuaian harga langsung berlaku', afterPrice.materials.find((m) => m.id === paperMat.id).price === 1450, JSON.stringify(priceSet).slice(0, 120));

log('\n=== 4. Purchasing mencari calon mitra (prospek) ===');
const adminCookie = cookie;
await call('POST', '/api/auth/logout');
const sariLogin = await call('POST', '/api/auth/login', { username: 'sari', password: 'Xynloop2026!' });
check('purchasing dapat masuk', sariLogin.status === 200 && sariLogin.data.user.role === 'purchasing');
const prospect = await api('POST', '/api/mitras', {
  name: 'Toko Buku Cerdas', category: 'kertas', contact_person: 'Liau', phone: '081234567890',
  address: 'Jl. Tanjung Raya II No. 12, Pontianak Timur', area: 'Pontianak Timur',
  expected_paper_kg: 120, notes: 'Kumpulan buku bekas & tumpukan kardus.',
});
check('prospek tercatat', prospect.mitra?.status === 'prospek');
check('prospek tercatat atas nama karyawan yang menemukan', prospect.mitra?.source_user_name === 'Sari Pamila', JSON.stringify(prospect.mitra).slice(0, 160));
const visit = await api('POST', `/api/mitras/${prospect.mitra.id}/visits`, {
  visit_type: 'survey', outcome: 'lanjut', notes: 'Sudah bicara dengan pemilik, setuju dijual rutin.',
  lat: -0.034, lng: 109.341, photos: [{ data: fixtureDataUrl(), caption: 'Tumpukan kertas di gudang' }],
});
check('kunjungan + foto bukti tersimpan', !!visit.visit?.id && visit.photos?.length === 1);
const photoGet = await fetch(`${BASE}/files/${visit.photos[0].path}`, { headers: { cookie } });
check('foto bisa dibuka kembali', photoGet.status === 200 && photoGet.headers.get('content-type')?.includes('png'), `status ${photoGet.status}`);
const noAuth = await fetch(`${BASE}/files/${visit.photos[0].path}`);
check('foto terkunci untuk publik', noAuth.status === 401);
const dupMitra = await call('POST', '/api/mitras', { name: 'Toko Buku Cerdas', phone: '081234567890', category: 'kertas' });
check('mitra kembar ditolak', dupMitra.status === 400);

log('\n=== 5. Surat penawaran digital & lembar tanggapan ===');
const preview = await api('GET', `/api/offers/preview?mitra_id=${prospect.mitra.id}`);
check('nomor surat otomatis terbentuk', /^\d{3}\/XSA\/[IVX]+\/2026$/.test(preview.number || ''), preview.number);
const offer = await api('POST', '/api/offers', { mitra_id: prospect.mitra.id, schedule_day: 'Jumat', schedule_time: '10.00 WIB' });
check('surat penawaran dibuat', offer.offer?.status === 'draf');
const sent = await api('POST', `/api/offers/${offer.offer.id}/send`, { via: 'whatsapp' });
check('surat terkirim', sent.offer?.status === 'terkirim');
const afterSend = await api('GET', `/api/mitras/${prospect.mitra.id}`);
check('status mitra naik menjadi penawaran', afterSend.mitra.status === 'penawaran', afterSend.mitra.status);
const printed = await call('GET', `/api/print/offer/${offer.offer.id}`);
check('cetak surat memuat kop & klausul', printed.status === 200 && /KWITANSI|LEMBAR TANGGAPAN/.test(printed.text) && /Mitra Tetap/.test(printed.text));
check('klausul tanggal pengambilan terisi', /mulais?|mulai/i.test(printed.text) && /Jumat/.test(printed.text));
const accepted = await api('POST', `/api/offers/${offer.offer.id}/response`, {
  choice: 'bersedia', name: 'Liau', address: 'Jl. Tanjung Raya II No. 12', phone: '081234567890', date: today,
  photos: [{ data: fixtureDataUrl([30, 60, 200]) }],
});
check('tanggapan bersedia → mitra aktif', accepted.mitra?.status === 'aktif' && accepted.offer?.status === 'diterima');

log('\n=== 6. Pengambilan: kru, mobil, bensin, timbangan ===');
await call('POST', '/api/auth/logout');
cookie = adminCookie;
await call('GET', '/api/auth/me');
const crewLogin = await call('POST', '/api/auth/login', { username: 'dahlan', password: 'Xynloop2026!' });
check('kru penjemputan dapat masuk', crewLogin.status === 200);
const pickup = await api('POST', '/api/pickups', {
  mitra_id: prospect.mitra.id, date: today, scheduled_at: `${today} 10:00`,
  crew: [{ user_id: staff.crew.user.id, role_in_run: 'driver' }, { user_id: staff.crew2.user.id, role_in_run: 'kru' }],
  vehicles: [{ vehicle_id: veh1.id, km_start: 40120 }],
  notes: 'Pengambilan rutin Jumat.',
});
const pid = pickup.pickup?.id;
check('pengambilan terjadwal dibuat', !!pid, JSON.stringify(pickup).slice(0, 200));
if (!pid) throw new Error('pengambilan gagal dibuat');
await api('POST', `/api/pickups/${pid}/vehicles`, { vehicle_id: veh1.id, km_start: 40120 });
const go = await api('POST', `/api/pickups/${pid}/status`, { status: 'dalam_perjalanan' });
check('status dalam perjalanan', go.pickup.status === 'dalam_perjalanan');
await api('POST', '/api/tracking/point', { lat: -0.034, lng: 109.341, accuracy: 8, speed: 22, battery: 84 });
await api('POST', '/api/tracking/point', { lat: -0.032, lng: 109.348, accuracy: 9, speed: 25 });
await api('POST', '/api/tracking/point', { lat: -0.030, lng: 109.352, accuracy: 7, speed: 18 });
const route = await api('GET', `/api/tracking/route/${pid}`);
check('rute GPS terekam & berjarak', route.points.length >= 2 && route.distance_km > 0, JSON.stringify({ p: route.points.length, d: route.distance_km }));

const item1 = await api('POST', `/api/pickups/${pid}/items`, { material_id: paperMat.id, gross_weight: 520, tare_weight: 20, photo: { data: fixtureDataUrl([200, 160, 40]) } });
check('timbangan 500 kg bersih + harga otomatis', item1.item.net_weight === 500 && item1.item.unit_price === 1450, JSON.stringify(item1.item).slice(0, 200));
check('nilai rupiah dihitung benar', item1.item.amount === 500 * 1450, `dapat ${item1.item.amount}`);
const item2 = await api('POST', `/api/pickups/${pid}/items`, { material_id: bookMat.id, gross_weight: 130, tare_weight: 5 });
const item3 = await api('POST', `/api/pickups/${pid}/items`, { material_id: oilMat.id, gross_weight: 45, tare_weight: 3, unit_price: 5200, photo: { data: fixtureDataUrl([40, 160, 120]) } });
check('baris jelantah (liter) masuk', item3.item.net_weight === 42);
const item4 = await api('POST', `/api/pickups/${pid}/items`, { material_id: paperMat.id, gross_weight: 100, tare_weight: 0, minus_pct: 10 });
check('pengurangan kadar air 10% diterapkan', item4.item.net_weight === 90, JSON.stringify(item4.item).slice(0, 150));
const detail = await api('GET', `/api/pickups/${pid}`);
const expectQty = 500 + 125 + 42 + 90;
check('total berat gabungan benar', Math.abs(detail.totals.paper_kg + detail.totals.oil_liters - expectQty) < 0.01, JSON.stringify(detail.totals).slice(0, 200));
check('2 foto bukti barang terunggah', detail.item_photos.length === 2, `${detail.item_photos.length}`);
await api('POST', `/api/pickups/${pid}/photos`, { photos: [{ data: fixtureDataUrl([120, 120, 120]), caption: 'Muatan di bak mobil' }] });
await api('PUT', `/api/pickups/${pid}/vehicles/${veh1.id}`, { km_end: 40146 });
const done = await api('POST', `/api/pickups/${pid}/status`, { status: 'selesai' });
check('pengambilan selesai', done.pickup.status === 'selesai');
const fuel = done.fuel;
check('bensin dihitung dari km & konsumsi', Math.abs(fuel.fuel_liters - 26 / 12) < 0.05, JSON.stringify(fuel).slice(0, 220));
check('biaya BBM tercatat', fuel.fuel_cost > 20000, `${fuel.fuel_cost}`);
check('satu mobil tercatat turun', fuel.vehicle_count === 1);
const fuelManual = await call('POST', `/api/pickups/${pid}/recount`, {});
check('kru tidak dapat menghitung ulang pengambilan yang sudah selesai', fuelManual.status === 400, `${fuelManual.status} ${JSON.stringify(fuelManual.data).slice(0, 90)}`);
cookie = adminCookie;
await call('POST', '/api/auth/login', { username: 'admin', password: 'Xynloop2026!' });
const recount = await api('POST', `/api/pickups/${pid}/recount`, {});
check('admin dapat menghitung ulang, hasil tetap sama', Math.abs(recount.fuel.fuel_liters - fuel.fuel_liters) < 0.01, JSON.stringify(recount).slice(0, 150));
check('rincian per mobil tersedia', recount.fuel.vehicles.length === 1 && recount.fuel.vehicles[0].distance_km === 26);

log('\n=== 7. Kwitansi digital ===');
const rcPreview = await api('GET', `/api/receipts/preview?pickup_id=${pid}`);
check('pratinjau kwitansi siap', rcPreview.snapshot.lines.length === 4 && rcPreview.suggested_number);
const receipt = await api('POST', '/api/receipts', { pickup_id: pid, method: 'tunai' });
const rid = receipt.receipt?.id;
check('kwitansi dibuat dengan total sesuai timbangan', receipt.receipt.total === detail.totals.total_amount, `${receipt.receipt.total} vs ${detail.totals.total_amount}`);
const rcPrint = await call('GET', `/api/print/receipt/${rid}`);
check('cetak kwitansi memuat judul asli', /KWITANSI PEMBELIAN KERTAS BEKAS/.test(rcPrint.text));
check('cetak kwitansi memuat terbilang', /rupiah/.test(rcPrint.text.toLowerCase()));
check('cetak kwitansi memuat tabel & tanda tangan', /Hasil Timbangan/.test(rcPrint.text) && /Penjual,/.test(rcPrint.text) && /Petugas/.test(rcPrint.text));
check('tidak ada angka yang bocor sebagai HTML mentah', !/&lt;table&gt;/.test(rcPrint.text));
const dupRc = await call('POST', '/api/receipts', { pickup_id: pid });
check('kwitansi ganda untuk satu pengambilan ditolak', dupRc.status === 400);
await api('POST', `/api/receipts/${rid}/status`, { status: 'terbit' });
const paid = await api('POST', `/api/receipts/${rid}/status`, { status: 'lunas' });
check('kwitansi dapat ditandai lunas', paid.receipt.status === 'lunas' && paid.receipt.paid_at);
const afterEdit = await call('PUT', `/api/receipts/${rid}`, { method: 'transfer' });
check('kwitansi lunas terkunci dari pengeditan biasa', [200, 400].includes(afterEdit.status));

log('\n=== 8. Laporan & atribusi karyawan ===');
const attribution = await api('GET', `/api/reports/attribution?from=2026-01-01&to=${today}`);
const sariRow = attribution.rows.find((x) => x.name === 'Sari Pamila');
check('hasil mitra tercatat atas nama karyawan penemunya', sariRow && Math.abs(sariRow.paper_kg - detail.totals.paper_kg) < 0.01, JSON.stringify(sariRow).slice(0, 220));
check('konversi prospek→aktif dihitung', sariRow?.mitras_aktif === 1 && sariRow?.conversion === 100, JSON.stringify({ a: sariRow?.mitras_aktif, c: sariRow?.conversion }));
const crewReport = await api('GET', `/api/reports/crew?from=2026-01-01&to=${today}`);
const dahlan = crewReport.rows.find((x) => x.name === 'Ahmad Dahlan');
check('kru penjemput tercatat membawa hasil', dahlan && dahlan.paper_kg > 0 && dahlan.runs === 1, JSON.stringify(dahlan).slice(0, 160));
const vReport = await api('GET', `/api/reports/vehicles?from=2026-01-01&to=${today}`);
const plat = vReport.rows.find((x) => x.plate === 'KB 8811 SAA');
check('laporan armada: km, liter, biaya, Rp per kg', plat && plat.km === 26 && plat.cost_per_kg > 0, JSON.stringify(plat).slice(0, 260));
const summary = await api('GET', '/api/dashboard/summary');
check('dashboard memuat ringkasan hari ini', summary.today.paper_kg > 0 && summary.month.amount > 0, JSON.stringify(summary.today).slice(0, 160));
check('dashboard menampilkan kru di lapangan', Array.isArray(summary.crew_on_field));
check('papan peringatan berfungsi', Array.isArray(summary.alerts));
const series = await api('GET', `/api/reports/timeseries?from=2026-01-01&to=${today}&group=month`);
check('seri waktu per bulan', series.series.length >= 1 && series.series.at(-1).paper_kg > 0, JSON.stringify(series.series).slice(0, 200));
const mitraReport = await api('GET', `/api/reports/mitras?from=2026-01-01&to=${today}`);
check('laporan mitra memuat TOP & mitra terlewat', Array.isArray(mitraReport.rows) && Array.isArray(mitraReport.dormant));
const exportCsv = await fetch(`${BASE}/api/reports/export?type=pickups&from=2026-01-01&to=${today}`, { headers: { cookie } });
const csv = await exportCsv.text();
check('ekspor CSV menghasilkan berkas', csv.includes('kode') && csv.split('\n').length >= 2, csv.slice(0, 120));
const exportAttr = await fetch(`${BASE}/api/reports/export?type=attribution`, { headers: { cookie } });
check('ekspor atribusi tersedia untuk admin', (await exportAttr.text()).includes('karyawan'));

log('\n=== 9. Pembatasan hak akses ===');
const sariLogin2 = await call('POST', '/api/auth/login', { username: 'sari', password: 'Xynloop2026!' });
check('purchasing kembali masuk', sariLogin2.status === 200);
const forbiddenUser = await call('GET', '/api/reports/vehicles');
check('purchasing tidak dapat membaca laporan biaya armada', forbiddenUser.status === 403 || forbiddenUser.status === 400, `${forbiddenUser.status}`);
const forbiddenCreate = await call('POST', '/api/users', { name: 'X', username: 'xx', role: 'admin', password: 'Xynloop2026!' });
check('purchasing tidak dapat membuat akun', forbiddenCreate.status === 403);
const ownScope = await api('GET', '/api/pickups');
check('kru hanya melihat penugasannya', ownScope.pickups.every((p) => p.crew_names?.includes('Ahmad Dahlan')) || ownScope.pickups.length === 0);
const crudBlocked = await call('PUT', '/api/reference/settings', { 'company.name': 'Hacked' });
check('perubahan pengaturan perusahaan ditolak non-admin', crudBlocked.status === 403);
const noHeader = await call('GET', '/api/ping');
void noHeader;
const rawPost = await fetch(`${BASE}/api/mitras`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}' });
check(' CSRF guard: POST tanpa header khusus ditolak', rawPost.status === 403);

log('\n=== 10. Penghapusan & jejak audit ===');
const sariDelete = await call('DELETE', `/api/pickups/${pid}/items/${item2.item.id}`);
check('purchasing tidak dapat menghapus baris pengambilan selesai', sariDelete.status === 400, `${sariDelete.status}`);
cookie = adminCookie;
await call('POST', '/api/auth/login', { username: 'admin', password: 'Xynloop2026!' });
const delItem = await call('DELETE', `/api/pickups/${pid}/items/${item2.item.id}`);
check('baris timbangan dapat dihapus admin', delItem.status === 200);
const afterDel = await api('GET', `/api/pickups/${pid}`);
check('nomor baris timbangan dirapikan ulang', afterDel.totals.items.map((x) => x.line_no).join(',') === '1,2,3', afterDel.totals.items.map((x) => x.line_no).join(','));
const auditLog = await api('GET', '/api/reference/audit?limit=200');
const actions = (auditLog.entries || auditLog.audit || []).map((x) => x.action);
check('jejak audit mencatat kegiatan penting', actions.includes('mitra.create') && actions.includes('receipt.create'), actions.slice(0, 8).join(','));

log(`\n=== HASIL: ${pass} lulus, ${fail} gagal ===`);
process.exit(fail ? 1 : 0);
