/**
 * Data demo XYNLOOP — supaya dashboard, laporan, dan cetak dokumen bisa dinilai
 * dengan angka nyata, bukan tabel kosong.
 *
 *   npm run seed:demo     isi data demo (lewati bila sudah ada)
 *   npm run reset:demo    hapus data demo lalu isi ulang dari nol
 *
 * Hanya untuk lingkungan uji. Data demo diberi penanda "data demo" pada kolom notes
 * agar mudah dibedakan dari data operasional asli.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { all, get, round2, run, tx, currentPrice, nextDocNumber, nextMitraCode, nextPickupCode, setting } from './index.js';
import { config } from '../config.js';
import { hashPassword } from '../lib/auth.js';
import { computeItem, pickupTotals, syncPickupCosts } from '../lib/calc.js';
import { removeImage, saveImage } from '../lib/uploads.js';
import { fixtureDataUrl } from '../tools/fixture-image.js';
import { migrate } from './migrate.js';

const DEMO_PASSWORD = 'Xynloop2026!';
const DEMO_MARK = 'data demo';
const HISTORY_DAYS = 62;
const DEPOT = [-0.0402, 109.3465];
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const PURCHASERS = [
  ['Rina Kartika', 'rina', 'Pontianak Kota', '0812-5678-9001'],
  ['Yusuf Maulana', 'yusuf', 'Pontianak Timur', '0813-5678-9002'],
  ['Dewi Lestari', 'dewi', 'Kubu Raya', '0812-3456-7788'],
];
const CREWMATES = [
  ['Agus Prasetyo', 'agus', 'Pontianak Kota', '0852-1111-2222'],
  ['Bambang Sutrisno', 'bambang', 'Pontianak Timur', '0852-2222-3333'],
  ['Joko Susilo', 'joko', 'Pontianak Barat', '0852-3333-4444'],
  ['Hendra Wijaya', 'hendra', 'Pontianak Utara', '0852-4444-5555'],
  ['Slamet Riyadi', 'slamet', 'Pontianak Selatan', '0852-5555-6666'],
  ['Tri Waluyo', 'tri', 'Kubu Raya', '0852-6666-7777'],
];
const VEHICLES = [
  ['KB 8410 AB', 'Trukbox 1', 'truk', 'bio', 7, 6000, 42180],
  ['KB 9327 CD', 'Engkel 2', 'pick_up', 'pertalite', 11, 1800, 61240],
  ['KB 1255 EF', 'Gran Max 3', 'mobil', 'pertalite', 13, 600, 88930],
  ['KB 6702 GH', 'Truk 4', 'truk', 'solar', 8, 8000, 119500],
  ['KB 3388 JK', 'L300 5', 'pick_up', 'pertalite', 12, 1500, 74310],
];

/** [nama, kategori, status, wilayah, kontak, telepon] */
const MITRAS = [
  ['Bank Sampah Hijau Lestari', 'kertas', 'aktif', 'Pontianak Timur', 'Ibu Sari', '0813-4411-2201'],
  ['Percetakan Garuda Press', 'kertas', 'aktif', 'Pontianak Kota', 'Liang', '0812-5522-1103'],
  ['Gudang Kertas Siantan Jaya', 'kertas', 'aktif', 'Pontianak Utara', 'Pak Darsim', '0813-5588-2214'],
  ['Toko Buku Yasin', 'kertas', 'aktif', 'Pontianak Barat', 'H. Yasin', '0812-5611-7788'],
  ['Pemulung Makmur Bersama', 'kertas', 'aktif', 'Kubu Raya', 'Rusdi', '0812-3399-1122'],
  ['Bank Sampah Melati Indah', 'campur', 'aktif', 'Pontianak Selatan', 'Bu Aminah', '0813-7788-4411'],
  ['RM Padminau Kapuas', 'jelantah', 'aktif', 'Pontianak Kota', 'Chef Ade', '0812-5544-3311'],
  ['Pabrik Kerupuk Lidah Kucing', 'jelantah', 'aktif', 'Pontianak Timur', 'Pak Gunawan', '0813-5522-9988'],
  ['Warteg Bu Ijah', 'jelantah', 'aktif', 'Pontianak Barat', 'Ijah', '0812-8877-1122'],
  ['Kantin PT Agro Kalimantan', 'jelantah', 'aktif', 'Kubu Raya', 'Pak Sukir', '0813-6655-2233'],
  ['Restoran Sederhana Ahmad', 'campur', 'aktif', 'Pontianak Kota', 'Ahmad', '0812-5566-7788'],
  ['Hotel Garuda Impian', 'campur', 'aktif', 'Pontianak Selatan', 'Bu Vina', '0813-5599-0011'],
  ['Pasar Flamboyan Paguyuban Dagang', 'campur', 'aktif', 'Pontianak Barat', 'Pak Topan', '0812-5533-4455'],
  ['Toko Bangunan Sabang Jawa', 'kertas', 'aktif', 'Pontianak Utara', 'Lianto', '0813-5577-6644'],
  ['Kopdit Sinar Harapan', 'kertas', 'negosiasi', 'Pontianak Kota', 'Bu Ros', '0812-5588-1212'],
  ['Percetakan Mitra Cetak', 'kertas', 'negosiasi', 'Pontianak Timur', 'Andre', '0813-5544-8877'],
  ['Depot Air Minum Setia Tirta', 'jelantah', 'negosiasi', 'Pontianak Selatan', 'Pak Nasir', '0812-5511-3344'],
  ['Warung Gorengan Mbok Nah', 'jelantah', 'penawaran', 'Pontianak Barat', 'Nah', '0813-5522-6677'],
  ['Toko Buku Tjhang Hong', 'kertas', 'penawaran', 'Pontianak Kota', 'Mei Ling', '0812-5533-9900'],
  ['Usaha Laundry Kiloan Bersih', 'kertas', 'penawaran', 'Kubu Raya', 'Bu Endang', '0813-5566-2211'],
  ['Bengkel Motor Kapuas Besar', 'kertas', 'penawaran', 'Pontianak Utara', 'Pak Tomi', '0812-5577-8899'],
  ['Kantor Kecamatan Pontianak Kota', 'kertas', 'prospek', 'Pontianak Kota', 'Bagian Umum', ''],
  ['Sekasar SMA Negeri 4 Pontianak', 'kertas', 'prospek', 'Pontianak Barat', 'Pak Dorman', ''],
  ['Griya Purnama Bank Sampah Warga', 'campur', 'prospek', 'Kubu Raya', 'Bu Ratna', ''],
  ['Pabrik Tahu Siantan Timur', 'jelantah', 'prospek', 'Pontianak Timur', 'Pak Jaya', ''],
  ['Kafe Kopi Ambawang', 'jelantah', 'prospek', 'Kubu Raya', 'Fajar', ''],
  ['Mie Kering Pak De', 'jelantah', 'tidak_respon', 'Pontianak Selatan', 'Soleh', '0813-5500-1122'],
  ['Gudang Mebel Sungai Raya', 'kertas', 'tidak_respon', 'Kubu Raya', 'Apeng', '0812-5500-3344'],
  ['Toko Kelontong Harapan Ibu', 'kertas', 'ditolak', 'Pontianak Kota', 'Ibu Ani', '0813-5500-5566'],
  ['Restoran Seafood Bahari', 'jelantah', 'nonaktif', 'Pontianak Barat', 'Captain', '0812-5500-7788'],
];

const STREETS = {
  'Pontianak Kota': ['Jl. Gajah Mada', 'Jl. Ahmad Yani', 'Jl. Merdeka', 'Jl. Tanjung Raya II'],
  'Pontianak Timur': ['Jl. Tritura', 'Jl. Pantan Timur', 'Jl. Syarif Abdurrahman', 'Jl. Kapuas Ilir'],
  'Pontianak Barat': ['Jl. Komyodas', 'Jl. Parit Demang Arifin', 'Jl. Arteri Supadio', 'Jl. Siam rate'],
  'Pontianak Utara': ['Jl. Karet', 'Jl. Kelayan', 'Jl. Purnama', 'Jl. Selat Panjang'],
  'Pontianak Selatan': ['Jl. Imam Bonjol', 'Jl. Urai Burer', 'Jl. Alianyang', 'Jl. Nusa Indah'],
  'Kubu Raya': ['Jl. Adisucipto', 'Jl. Arteri Supadio', 'Jl. Raya Sungai Raya', 'Jl. Gusti Mahmud'],
};
const BASE_LATLNG = {
  'Pontianak Kota': [-0.0352, 109.3337],
  'Pontianak Timur': [-0.0414, 109.352],
  'Pontianak Barat': [-0.0569, 109.3195],
  'Pontianak Utara': [-0.0136, 109.3386],
  'Pontianak Selatan': [-0.054, 109.3435],
  'Kubu Raya': [-0.076, 109.296],
};

/* ----------------------------- util acak (deterministik) ----------------------------- */

let seedValue = 20261106;
const rnd = () => {
  seedValue = (seedValue * 1664525 + 1013904223) % 4294967296;
  return seedValue / 4294967296;
};
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const one = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const dayOf = (offset) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const at = (dateStr, jam, menit) => shiftMinutes(dateStr, jam, menit, 0);
/** Menit boleh melebihi 59 — Date menormalkan ke jam/hari berikutnya. */
const shiftMinutes = (dateStr, jam, menit, delta) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(Number(jam), Number(menit) + Number(delta), 0, 0);
  return stamp(d);
};
const ago = (menit) => stamp(new Date(Date.now() - menit * 60000));

/** Sisipkan baris dari objek — nama kolom dikontrol kode ini, bukan input pengguna. */
function ins(table, obj) {
  const keys = Object.keys(obj);
  return run(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((k) => obj[k]),
  ).lastInsertRowid;
}

function addMinutesToNow(delta) {
  return stamp(new Date(Date.now() + delta * 60000));
}

/* ---------------------------------- pembersihan ---------------------------------- */

function wipe() {
  const folders = ['pickup', 'barang', 'mitra', 'kunjungan', 'penawaran', 'kwitansi'];
  const files = all(
    `SELECT path FROM attachments WHERE ${folders.map((f) => `path LIKE '${f}/%'`).join(' OR ')}`,
  );
  for (const f of files) removeImage(f.path);
  // bersihkan file demo yang tersisa di folder uploads
  for (const folder of folders) {
    const dir = path.join(config.uploadDir, folder);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  run("DELETE FROM tracking_points WHERE pickup_id IN (SELECT id FROM pickups WHERE notes LIKE '%data demo%')");
  run('DELETE FROM tracking_points');
  run('DELETE FROM pickup_items');
  run('DELETE FROM pickup_vehicles');
  run('DELETE FROM pickup_crew');
  run('DELETE FROM receipts');
  run('DELETE FROM offers');
  run('DELETE FROM attachments');
  run('DELETE FROM pickups');
  run('DELETE FROM mitra_visits');
  run('DELETE FROM mitras');
  run('DELETE FROM counters');
  run('DELETE FROM audit_logs');
  run('DELETE FROM price_lists WHERE note LIKE ?', [`%${DEMO_MARK}%`]);
  const usernames = [...PURCHASERS, ...CREWMATES].map((u) => u[1]);
  run(`DELETE FROM users WHERE username IN (${usernames.map(() => '?').join(',')})`, usernames);
  const plates = VEHICLES.map((v) => v[0]);
  run(`DELETE FROM vehicles WHERE plate IN (${plates.map(() => '?').join(',')})`, plates);
  console.log('  data demo lama dibersihkan');
}

/* ----------------------------------- pembuatan ----------------------------------- */

function ensureUser([name, username, area, phone], role) {
  const found = get('SELECT id FROM users WHERE username = ?', [username]);
  if (found) return found.id;
  const owner = get("SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1");
  const { hash, salt } = hashPassword(DEMO_PASSWORD);
  return ins('users', {
    name, username, phone, role, password_hash: hash, password_salt: salt,
    is_active: 1, must_change_password: 0, area, notes: `${DEMO_MARK} — password awal ${DEMO_PASSWORD}`,
    created_by: owner ? owner.id : null, created_at: dayOf(-120) + ' 09:00:00',
  });
}

function ensureVehicles() {
  return VEHICLES.map(([plate, name, type, fuel, consumption, capacity, running]) => {
    const found = get('SELECT id FROM vehicles WHERE plate = ?', [plate]);
    if (found) return { id: found.id, plate, name, type, fuel_type: fuel, consumption, capacity_kg: capacity, km: found.km_running || running };
    const id = ins('vehicles', {
      plate, name, type, fuel_type: fuel, consumption_km_per_l: consumption, capacity_kg: capacity,
      km_running: running, is_active: 1, notes: DEMO_MARK,
    });
    return { id, plate, name, type, fuel_type: fuel, consumption, capacity_kg: capacity, km: running };
  });
}

function priceHistory(materials) {
  const pola = [[-70, 0.92], [-50, 0.96], [-30, 1], [-14, 1.04]];
  for (const m of materials) {
    for (const [offset, factor] of pola) {
      const price = Math.round((m.default_price * factor) / 50) * 50;
      ins('price_lists', {
        material_id: m.id, price, effective_from: dayOf(offset), created_by: null,
        note: `Harga ${DEMO_MARK} (${offset} hari)`,
      });
    }
  }
}

function createMitra(row, purchasers, crews, idx) {
  const [name, category, status, area, contact, phone] = row;
  const streets = STREETS[area] || STREETS['Pontianak Kota'];
  const base = BASE_LATLNG[area] || DEPOT;
  // Sebaran atribusi: tiap karyawan purchasing memegang sebagian wilayah.
  const source = status === 'aktif' ? purchasers[idx % purchasers.length] : one(purchasers);
  const crew = crews[idx % crews.length];
  const first = status === 'aktif' ? dayOf(-ri(70, 130))
    : ['penawaran', 'negosiasi'].includes(status) ? dayOf(-ri(14, 40))
      : dayOf(-ri(2, 12));
  const activeFrom = status === 'aktif' ? dayOf(-ri(20, 60)) : null;
  const [lat, lng] = [round2(base[0] + (rnd() - 0.5) * 0.02), round2(base[1] + (rnd() - 0.5) * 0.02)];
  const id = ins('mitras', {
    code: nextMitraCode(), name, category, contact_person: contact || null, phone: phone || null,
    address: `${one(streets)} No. ${ri(1, 128)}, Kel. ${area.replace('Pontianak ', '')}, Kota Pontianak`,
    area, lat, lng, status, source_user_id: source.id,
    crew_user_id: status === 'aktif' ? crew.id : null,
    dedupe_key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    expected_paper_kg: category === 'jelantah' ? 0 : ri(150, 1800),
    expected_oil_l: category === 'kertas' ? 0 : ri(40, 260),
    schedule_day: status === 'aktif' ? one(HARI) : null,
    schedule_time: status === 'aktif' ? one(['09.00 WIB', '10.00 WIB', '13.00 WIB']) : null,
    quality_note: one(['Kardus kering, bebas lumpur', 'Campur kertas HVS dan koran', 'Jelantah tanpa air', 'Perlu sortir di tempat']),
    notes: `${DEMO_MARK} ditemukan saat keliling ${area}.`,
    first_contact_at: at(first, ri(9, 16), ri(0, 59)), active_from: activeFrom,
    closed_at: ['ditolak', 'nonaktif'].includes(status) ? dayOf(-ri(10, 60)) : null,
    created_at: at(first, 9, 0), updated_at: nowStamp(),
  });
  return get('SELECT * FROM mitras WHERE id = ?', [id]);
}

function nowStamp() {
  const d = new Date();
  return stamp(d);
}

function addVisit(mitra, user, offset, type, outcome, catatan) {
  const visitedAt = `${dayOf(-offset)} ${pad(ri(9, 17))}:${pad(ri(0, 59))}:00`;
  const id = ins('mitra_visits', {
    mitra_id: mitra.id, user_id: user.id, visit_type: type, visited_at: visitedAt, outcome,
    next_action_at: outcome === 'lanjut' || outcome === 'tunda' ? `${dayOf(-offset + ri(3, 10))} 10:00:00` : null,
    notes: `${DEMO_MARK} ${catatan}`, lat: mitra.lat, lng: mitra.lng, created_at: visitedAt,
  });
  if (chance(0.35)) {
    const saved = saveImage(fixtureDataUrl([120, 130, 140]), { folder: 'kunjungan', caption: 'Dokumentasi kunjungan' });
    ins('attachments', {
      kind: 'kunjungan', owner_id: id, path: saved.path, caption: 'Dokumentasi kunjungan', bytes: saved.bytes,
      taken_by: user.id, taken_at: visitedAt, lat: mitra.lat, lng: mitra.lng, created_at: visitedAt,
    });
  }
  return id;
}

function addOffer(mitra, status, issuedOffset, createdBy) {
  const issuedAt = dayOf(-issuedOffset);
  const number = nextDocNumber('offer', issuedAt);
  const jadwal = mitra.schedule_day || one(HARI);
  const id = ins('offers', {
    number, mitra_id: mitra.id, issued_at: issuedAt, category: mitra.category,
    schedule_day: jadwal, schedule_time: mitra.schedule_time || '10.00 WIB',
    start_date: dayOf(-issuedOffset + 7), status,
    signed_by_name: setting('offer.signatory_name'), signed_by_title: setting('offer.signatory_title'),
    sent_via: status === 'draf' ? null : one(['langsung', 'whatsapp', 'email']),
    sent_at: status === 'draf' ? null : `${issuedAt} ${pad(ri(10, 16))}:00:00`,
    response_name: ['diterima', 'ditolak'].includes(status) ? mitra.contact_person : null,
    response_address: ['diterima', 'ditolak'].includes(status) ? mitra.address : null,
    response_phone: ['diterima', 'ditolak'].includes(status) ? mitra.phone : null,
    response_choice: status === 'diterima' ? 'bersedia' : status === 'ditolak' ? 'tidak' : status === 'kadaluarsa' ? '' : null,
    response_date: ['diterima', 'ditolak'].includes(status) ? dayOf(-issuedOffset + ri(2, 9)) : null,
    created_by: createdBy, created_at: `${issuedAt} 09:30:00`, updated_at: nowStamp(),
  });
  if (status === 'diterima' && chance(0.5)) {
    const saved = saveImage(fixtureDataUrl([38, 166, 154]), { folder: 'penawaran', caption: 'Lembar tanggapan ditandatangani' });
    ins('attachments', {
      kind: 'penawaran', owner_id: id, path: saved.path, caption: 'Lembar tanggapan ditandatangani', bytes: saved.bytes,
      taken_by: createdBy, taken_at: `${issuedAt} 15:00:00`, lat: mitra.lat, lng: mitra.lng, created_at: nowStamp(),
    });
  }
  return get('SELECT * FROM offers WHERE id = ?', [id]);
}

/** Rute bolak-balik gudang → mitra, dipakai untuk simulasi titik GPS. */
function routeTo(target, steps = 9) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wobble = i === 0 || i === steps ? 0 : (rnd() - 0.5) * 0.0045;
    out.push([round2(DEPOT[0] + (target[0] - DEPOT[0]) * t + wobble), round2(DEPOT[1] + (target[1] - DEPOT[1]) * t - wobble)]);
  }
  return out.concat(out.slice(1, -1).reverse());
}

function addTracking(pickupId, crewIds, mitra, jamMulai, dateStr, liveFromNow = false) {
  const pts = routeTo([mitra.lat, mitra.lng]);
  const perPoint = liveFromNow ? Math.round(28 / pts.length) : 7;
  pts.forEach((p, i) => {
    const user = crewIds[i % crewIds.length];
    const recorded = liveFromNow ? ago((pts.length - i) * perPoint) : shiftMinutes(dateStr, jamMulai, 0, i * perPoint);
    ins('tracking_points', {
      pickup_id: pickupId, user_id: user, lat: p[0], lng: p[1],
      accuracy: round2(4 + rnd() * 14), speed: round2(8 + rnd() * 34), battery: ri(35, 98),
      heading: ri(0, 359), recorded_at: recorded,
    });
  });
}

function createPickup(opts) {
  const { mitra, dateStr, status, jam, lead, crewIds, vehicles, materials, ownerUser, offsetDays } = opts;
  const code = nextPickupCode(dateStr);
  const scheduled = `${dateStr} ${pad(jam)}:00:00`;
  const arrived = shiftMinutes(dateStr, jam, 25, 0);
  const isDone = status === 'selesai';
  const completed = isDone ? shiftMinutes(dateStr, jam, 95, 0) : null;
  const pickupId = ins('pickups', {
    code, mitra_id: mitra.id, date: dateStr, scheduled_at: scheduled,
    arrived_at: status === 'terjadwal' ? null : arrived, completed_at: completed, status,
    notes: `${DEMO_MARK} pengambilan rutin ${mitra.name}.`,
    created_by: ownerUser.id, lead_user_id: lead.id,
    start_lat: DEPOT[0], start_lng: DEPOT[1],
    cost_source: 'auto', created_at: scheduled, updated_at: isDone ? completed : nowStamp(),
  });

  crewIds.forEach((uid, i) => {
    ins('pickup_crew', {
      pickup_id: pickupId, user_id: uid,
      role_in_run: i === 0 ? 'kordinator' : i === 1 ? 'driver' : 'kru',
    });
  });

  const jumlahArmada = Math.min(mitra.expected_paper_kg > 900 ? 2 : 1, vehicles.length);
  const mulai = ri(0, vehicles.length - 1);
  const used = Array.from({ length: jumlahArmada }, (_, k) => vehicles[(mulai + k) % vehicles.length]);
  for (const v of used) {
    const jarak = ri(14, 58);
    v.km += jarak;
    ins('pickup_vehicles', {
      pickup_id: pickupId, vehicle_id: v.id, km_start: v.km - jarak, km_end: v.km, liters: null, cost: null,
    });
  }

  const kertas = opts.materials.filter((m) => m.category === 'kertas');
  const jelantah = opts.materials.filter((m) => m.category === 'jelantah');
  const lines = [];
  if (mitra.category !== 'jelantah') lines.push({ material: one(kertas), unit: 'kg' });
  if (mitra.category !== 'kertas') lines.push({ material: one(jelantah), unit: 'liter' });
  if (mitra.category === 'kertas' && chance(0.45)) lines.push({ material: one(kertas), unit: 'kg' });

  lines.forEach((line, i) => {
    const kertasLine = line.material.category === 'kertas';
    const netTarget = kertasLine ? ri(120, 780) : ri(25, 145);
    const minus = kertasLine ? one([0, 0, 1, 2]) : one([2, 3, 4, 6]);
    const tare = kertasLine ? one([0, 25, 48]) : one([0, 18]);
    const gross = round2((netTarget / (1 - minus / 100)) + tare);
    const unitPrice = currentPrice(line.material.id, dateStr);
    const hit = computeItem({ gross, tare, minusPct: minus, unitPrice });
    const itemId = ins('pickup_items', {
      pickup_id: pickupId, line_no: i + 1, material_id: line.material.id,
      gross_weight: gross, tare_weight: tare, minus_pct: minus,
      net_weight: hit.net_weight, unit_price: unitPrice, amount: hit.amount,
      weighed_by: crewIds[i % crewIds.length], mitra_witness: 1,
      note: `${DEMO_MARK} ditimbang di depan ${mitra.contact_person || 'penanggung jawab mitra'}.`,
      created_at: shiftMinutes(dateStr, jam, 45 + i * 12, 0),
    });
    if (isDone && chance(0.28)) {
      const saved = saveImage(fixtureDataUrl([245, 166, 35]), { folder: 'barang', caption: `Bukti timbangan ${line.material.name}` });
      ins('attachments', {
        kind: 'barang', owner_id: itemId, path: saved.path, caption: `Bukti timbangan ${line.material.name}`,
        bytes: saved.bytes, taken_by: crewIds[0], taken_at: shiftMinutes(dateStr, jam, 45 + i * 12, 0),
        lat: mitra.lat, lng: mitra.lng, created_at: nowStamp(),
      });
    }
  });

  syncPickupCosts(pickupId);

  if (status !== 'terjadwal' && status !== 'batal') {
    addTracking(pickupId, crewIds, mitra, jam, dateStr, opts.live);
  }

  if (isDone) {
    const jumlahFoto = offsetDays <= 5 ? 2 : 1;
    for (let i = 0; i < jumlahFoto; i++) {
      const waktu = shiftMinutes(dateStr, jam, 60 + i * 15, 0);
      const saved = saveImage(fixtureDataUrl(i === 0 ? [140, 198, 63] : [70, 130, 180]), {
        folder: 'pickup', caption: i === 0 ? 'Muatan sebelum berangkat' : 'Timbangan di lokasi mitra',
      });
      ins('attachments', {
        kind: 'pickup', owner_id: pickupId, path: saved.path,
        caption: i === 0 ? 'Muatan sebelum berangkat' : 'Timbangan di lokasi mitra', bytes: saved.bytes,
        taken_by: crewIds[0], taken_at: waktu, lat: mitra.lat, lng: mitra.lng, created_at: nowStamp(),
      });
    }
    const totals = pickupTotals(pickupId);
    if (totals.total_amount > 0 && !opts.skipReceipt) {
      const statusKwitansi = offsetDays >= 3 ? 'lunas' : 'terbit';
      const issuedAt = dateStr;
      const snapshot = {
        pickup_id: pickupId, pickup_code: code, date: dateStr, mitra,
        lines: totals.items.map((it, n) => ({
          no: n + 1, material_id: it.material_id, code: it.material_code, name: it.material_name,
          category: it.category, unit: it.unit, gross_weight: it.gross_weight, tare_weight: it.tare_weight,
          minus_pct: it.minus_pct, qty: it.net_weight, unit_price: it.unit_price, amount: it.amount,
        })),
        paper_kg: totals.paper_kg, oil_liters: totals.oil_liters, total: totals.total_amount,
      };
      ins('receipts', {
        number: nextDocNumber('receipt', issuedAt), pickup_id: pickupId, mitra_id: mitra.id,
        issued_at: `${issuedAt} ${pad(jam + 2)}:10:00`, method: totals.total_amount > 2500000 ? 'transfer' : 'tunai',
        total: totals.total_amount, seller_name: mitra.contact_person || mitra.name,
        seller_address: mitra.address, seller_phone: mitra.phone,
        staff_name: setting('receipt.staff_name'), staff_title: setting('receipt.staff_title'),
        status: statusKwitansi, paid_at: statusKwitansi === 'lunas' ? `${dayOf(-offsetDays + 1)} 14:00:00` : null,
        snapshot: JSON.stringify(snapshot), created_by: ownerUser.id,
        created_at: `${issuedAt} ${pad(jam + 2)}:10:00`, updated_at: nowStamp(),
      });
    }
  }
  return pickupId;
}

function seed(ownerUser) {
  const purchasers = PURCHASERS.map((u) => ({ id: ensureUser(u, 'purchasing'), name: u[0] }));
  const crews = CREWMATES.map((u) => ({ id: ensureUser(u, 'crew'), name: u[0] }));
  const vehicles = ensureVehicles();
  const materials = all('SELECT id, code, name, category, unit, default_price FROM materials WHERE is_active = 1');
  priceHistory(materials);

  const mitras = MITRAS.map((row, idx) => createMitra(row, purchasers, crews, idx));
  const aktif = mitras.filter((m) => m.status === 'aktif');
  const byName = (u) => purchasers.find((p) => p.id === u);

  for (const m of mitras) {
    const src = byName(m.source_user_id) || purchasers[0];
    const offset = ri(20, 90);
    addVisit(m, src, offset, 'survey', 'lanjut', `Keliling ${m.area}, prospek ${m.name}.`);
    if (m.status !== 'prospek') addVisit(m, src, offset - 8, 'penawaran', 'lanjut', 'Menyampaikan surat penawaran mitra tetap.');
    if (['aktif', 'negosiasi', 'ditolak'].includes(m.status)) {
      addVisit(m, src, offset - 14, 'negosiasi', m.status === 'aktif' ? 'berhasil' : m.status === 'ditolak' ? 'tidak_berminat' : 'tunda',
        m.status === 'aktif' ? 'Sepakat harga dan jadwal pengambilan.' : 'Menunggu keputusan pemilik.');
    }
    if (m.status === 'aktif') {
      addOffer(m, 'diterima', offset, ownerUser.id);
    } else if (m.status === 'penawaran') {
      addOffer(m, 'terkirim', ri(4, 20), ownerUser.id);
    } else if (m.status === 'negosiasi') {
      addOffer(m, ri(0, 1) ? 'terkirim' : 'kadaluarsa', ri(15, 26), ownerUser.id);
    } else if (m.status === 'ditolak') {
      addOffer(m, 'ditolak', ri(20, 50), ownerUser.id);
    } else if (m.status === 'prospek' && chance(0.4)) {
      addOffer(m, 'draf', ri(1, 6), ownerUser.id);
    }
    if (chance(0.4)) {
      const saved = saveImage(fixtureDataUrl([100, 150, 90]), { folder: 'mitra', caption: 'Foto lokasi mitra' });
      ins('attachments', {
        kind: 'mitra', owner_id: m.id, path: saved.path, caption: 'Foto lokasi mitra', bytes: saved.bytes,
        taken_by: m.source_user_id, taken_at: m.first_contact_at, lat: m.lat, lng: m.lng, created_at: nowStamp(),
      });
    }
  }

  // riwayat 62 hari
  const hariSelesai = [];
  for (let offset = HISTORY_DAYS; offset >= 2; offset--) {
    const dateStr = dayOf(-offset);
    const dipilih = new Set();
    for (let i = 0; i < ri(2, 4); i++) {
      const mitra = one(aktif);
      if (dipilih.has(mitra.id)) continue;
      dipilih.add(mitra.id);
      const crewIds = [mitra.crew_user_id, ...crews.map((c) => c.id).filter((id) => id !== mitra.crew_user_id)]
        .slice(0, ri(2, 3));
      const status = chance(0.03) ? 'batal' : 'selesai';
      const jam = ri(8, 13);
      const pid = createPickup({
        mitra, dateStr, status, jam, lead: { id: crewIds[0] }, crewIds, vehicles, materials, ownerUser,
        offsetDays: offset, skipReceipt: status === 'selesai' && offset <= 6 && chance(0.18),
      });
      if (status === 'batal') {
        run('UPDATE pickups SET cancel_reason = ? WHERE id = ?', [`${DEMO_MARK} armada tidak tersedia.`, pid]);
        run('DELETE FROM pickup_items WHERE pickup_id = ?', [pid]);
      } else {
        hariSelesai.push(pid);
      }
    }
  }

  // aktivitas hari ini supaya papan kerja dan layar lacak langsung hidup
  const todayStr = dayOf(0);
  const terjadwal = [];
  for (let i = 0; i < 2; i++) {
    const mitra = aktif[i + 4];
    const crewIds = [crews[(i + 1) % crews.length].id, crews[(i + 3) % crews.length].id];
    const pid = ins('pickups', {
      code: nextPickupCode(todayStr), mitra_id: mitra.id, date: todayStr,
      scheduled_at: addMinutesToNow((i + 2) * 55), status: 'terjadwal',
      notes: `${DEMO_MARK} terjadwal hari ini.`, created_by: ownerUser.id, lead_user_id: crewIds[0],
      start_lat: DEPOT[0], start_lng: DEPOT[1], cost_source: 'auto', created_at: at(todayStr, 7, 30), updated_at: nowStamp(),
    });
    ins('pickup_crew', { pickup_id: pid, user_id: crewIds[0], role_in_run: 'kordinator' });
    ins('pickup_crew', { pickup_id: pid, user_id: crewIds[1], role_in_run: 'driver' });
    ins('pickup_vehicles', { pickup_id: pid, vehicle_id: vehicles[i].id, km_start: vehicles[i].km, km_end: null });
    terjadwal.push(pid);
  }

  for (let i = 0; i < 2; i++) {
    const mitra = aktif[i + 1];
    const crewIds = [crews[i * 2].id, crews[i * 2 + 1].id];
    const berjalan = createPickup({
      mitra, dateStr: todayStr, status: 'dalam_perjalanan', jam: 8, lead: { id: crewIds[0] }, crewIds,
      vehicles: [vehicles[i]], materials, ownerUser, offsetDays: 0, live: true,
    });
    run('UPDATE pickups SET arrived_at = ?, scheduled_at = ? WHERE id = ?', [ago(25), ago(45), berjalan]);
  }

  createPickup({
    mitra: aktif[3], dateStr: todayStr, status: 'menimbang', jam: 9,
    lead: { id: crews[2].id }, crewIds: [crews[2].id, crews[4].id],
    vehicles: [vehicles[2]], materials, ownerUser, offsetDays: 0, live: true,
  });

  // jadwal besok dan lusa
  for (let i = 0; i < 3; i++) {
    const mitra = aktif[i + 6];
    const dateStr = dayOf(i === 2 ? 2 : 1);
    const crewIds = [crews[i].id, crews[i + 3].id];
    const pid = ins('pickups', {
      code: nextPickupCode(dateStr), mitra_id: mitra.id, date: dateStr, scheduled_at: `${dateStr} 09:00:00`,
      status: 'terjadwal', notes: `${DEMO_MARK} agenda mingguan ${mitra.schedule_day || ''}`.trim(),
      created_by: ownerUser.id, lead_user_id: crewIds[0], start_lat: DEPOT[0], start_lng: DEPOT[1],
      cost_source: 'auto', created_at: nowStamp(), updated_at: nowStamp(),
    });
    ins('pickup_crew', { pickup_id: pid, user_id: crewIds[0], role_in_run: 'kordinator' });
    ins('pickup_vehicles', { pickup_id: pid, vehicle_id: vehicles[(i + 2) % vehicles.length].id, km_start: null, km_end: null });
  }

  for (const [action, entity, entityId] of [
    ['pickup.complete', 'pickup', hariSelesai[hariSelesai.length - 1]],
    ['receipt.create', 'receipt', get('SELECT MAX(id) AS id FROM receipts').id],
    ['mitra.update_status', 'mitra', aktif[0].id],
    ['auth.login', 'user', ownerUser.id],
  ]) {
    ins('audit_logs', {
      user_id: ownerUser.id, action, entity, entity_id: entityId,
      meta: JSON.stringify({ source: DEMO_MARK }), created_at: nowStamp(),
    });
  }

  for (const v of vehicles) {
    run('UPDATE vehicles SET km_running = ?, notes = ? WHERE id = ?', [v.km, `${DEMO_MARK} — odometer mengikuti pickup_vehicles`, v.id]);
  }
  const t = (sql) => get(sql).n;
  console.log([
    '',
    '  Data demo siap:',
    `    mitra           ${t('SELECT COUNT(*) AS n FROM mitras')}`,
    `    pengambilan     ${t('SELECT COUNT(*) AS n FROM pickups')}`,
    `    hasil timbangan ${t('SELECT COUNT(*) AS n FROM pickup_items')}`,
    `    kwitansi        ${t('SELECT COUNT(*) AS n FROM receipts')}`,
    `    surat penawaran ${t('SELECT COUNT(*) AS n FROM offers')}`,
    `    titik GPS       ${t('SELECT COUNT(*) AS n FROM tracking_points')}`,
    `    foto bukti      ${t('SELECT COUNT(*) AS n FROM attachments')}`,
    '',
    '  Akun demo (password semuanya ' + DEMO_PASSWORD + '):',
    `    owner/admin     ${config.bootstrapAdmin.username}`,
    `    purchasing      ${PURCHASERS.map((u) => u[1]).join(', ')}`,
    `    crew            ${CREWMATES.map((u) => u[1]).join(', ')}`,
    '',
  ].join('\n'));
}

migrate({ quiet: true });

const owner = get("SELECT id, username FROM users WHERE role = 'owner' ORDER BY id LIMIT 1");
if (!owner) {
  console.error('Akun pemilik tidak ditemukan. Jalankan `npm run migrate` terlebih dahulu.');
  process.exit(1);
}

if (process.argv.includes('--fresh')) {
  console.log('Menghapus data demo lama...');
  tx(wipe)();
} else if (get('SELECT COUNT(*) AS n FROM pickups').n > 0) {
  console.log('Sudah ada data pengambilan. Jalankan `npm run reset:demo` untuk menata ulang dari nol.');
  process.exit(0);
}

try {
  tx(() => seed(owner))();
} catch (err) {
  console.error('Seed gagal:', err.message);
  console.error(err.stack?.split('\n').slice(1, 4).join('\n'));
  process.exitCode = 1;
}
