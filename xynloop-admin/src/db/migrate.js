import { fileURLToPath, pathToFileURL } from 'node:url';
import { applySchema, all, get, run, nowLocal, setSetting, today } from './index.js';
import { config } from '../config.js';
import { hashPassword } from '../lib/auth.js';

const DEFAULT_SETTINGS = {
  'company.name': 'PT. Xynra Sukses Abadi',
  'company.brand': 'XYNLOOP',
  'company.tagline': 'Waste Goes Around',
  'company.address':
    'Jl. Tritura, RT 002/RW 009, Kel. Dalam Bugis, Kec. Pontianak Timur, Kota Pontianak, Kalimantan Barat 78235',
  'company.phone': '0851-8311-4530',
  'company.city': 'Pontianak',
  'doc.code': 'XSA',
  'receipt.staff_name': 'Sophian Rahardi',
  'receipt.staff_title': 'Staff Operasional',
  'offer.signatory_name': 'Widi Eka Putri, S.Pd',
  'offer.signatory_title': 'Koordinator Operasional',
  'offer.subject': 'Penawaran Kerja Sama Mitra Tetap Pembelian Kertas Bekas',
  'offer.day': 'Jumat',
  'offer.time': '10.00 WIB',
  'fuel.default_price': '10000',
};

const OFFER_CLAUSES = [
  'Seluruh {material} yang Bapak/Ibu miliki atau kumpulkan dijual kepada PT. Xynra Sukses Abadi.',
  'Pengambilan dilakukan secara rutin oleh petugas kami setiap hari {day} pukul {time}, mulai {start_date}.',
  'Penimbangan dilakukan di hadapan Bapak/Ibu, dan hasilnya dicatat pada kwitansi pembelian.',
  'Pembayaran dilakukan sesuai hasil timbangan dan harga yang disepakati bersama, dengan bukti kwitansi.',
];

const MATERIALS = [
  ['KR1', 'Kardus / Dus (OCC)', 'kertas', 'kg', 1200, 1],
  ['KR2', 'Buku Tulis Lama', 'kertas', 'kg', 1500, 2],
  ['KR3', 'Kertas HVS / Office Paper', 'kertas', 'kg', 2600, 3],
  ['KR4', 'Koran / Kertas Baca', 'kertas', 'kg', 1800, 4],
  ['KR5', 'Kertas Campur (Mixed Paper)', 'kertas', 'kg', 900, 5],
  ['KR6', 'Amplop & Dokumen', 'kertas', 'kg', 1400, 6],
  ['KR7', 'Singel / Book Paper', 'kertas', 'kg', 2000, 7],
  ['MJ1', 'Minyak Jelantah', 'jelantah', 'liter', 5000, 8],
  ['MJ2', 'Minyak Jelantah Campur', 'jelantah', 'liter', 3500, 9],
];

export function migrate({ quiet = false } = {}) {
  applySchema();

  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    run('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO NOTHING', [k, v]);
  }
  setSetting('offer.clauses', JSON.stringify(OFFER_CLAUSES));
  setSetting('receipt.note', 'Hasil timbangan dicatat di hadapan penjual dan disetujui oleh kedua belah pihak.');

  for (const [code, name, category, unit, price, sort] of MATERIALS) {
    const exists = get('SELECT id FROM materials WHERE code = ?', [code]);
    if (exists) continue;
    run('INSERT INTO materials (code, name, category, unit, default_price, sort) VALUES (?,?,?,?,?,?)', [
      code, name, category, unit, price, sort,
    ]);
    run('INSERT INTO price_lists (material_id, price, effective_from, created_by, note) VALUES (?,?,?,?,?)', [
      get('SELECT id FROM materials WHERE code = ?', [code]).id, price, today(), null, 'Harga awal sistem',
    ]);
  }

  for (const [type, price] of [
    ['pertalite', 10000], ['pertamax', 12000], ['dexlite', 13000], ['solar', 10000], ['bio', 11000],
  ]) {
    run('INSERT INTO fuel_prices (fuel_type, price_per_liter, effective_from, note) VALUES (?,?,?,?)', [
      type, price, today(), 'Harga awal sistem',
    ]);
  }

  const userCount = get('SELECT COUNT(*) AS n FROM users').n;
  if (userCount === 0) {
    const { hash, salt } = hashPassword(config.bootstrapAdmin.password);
    run(
      `INSERT INTO users (name, username, role, password_hash, password_salt, must_change_password, is_active)
       VALUES (?,?,?,?,?,?,1)`,
      ['Administrator XYNLOOP', config.bootstrapAdmin.username, 'owner', hash, salt, 1],
    );
    if (!quiet) console.log(`  akun awal dibuat  ->  username: ${config.bootstrapAdmin.username}`);
  }

  if (!quiet) console.log('Skema & data dasar siap. Total material:', all('SELECT id FROM materials').length);
  return true;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  migrate({ quiet: false });
}
