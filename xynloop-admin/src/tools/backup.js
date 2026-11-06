/** Cadangkan basis data + seluruh foto bukti ke satu folder.
 *
 *   npm run backup
 *   npm run backup -- --out="D:/cadangan" --keep=14
 *
 * Pemulihan: stop aplikasi, salin xynloop.db kembali ke folder data dan uploads ke
 * folder uploads, lalu jalankan aplikasi. Tidak ada langkah lain.
 */
import fs from 'node:fs';
import path from 'node:path';
import { all, db, get } from '../db/index.js';
import { config, ROOT } from '../config.js';

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const now = new Date();
const cap = (n) => String(n).padStart(2, '0');
const label = `${now.getFullYear()}${cap(now.getMonth() + 1)}${cap(now.getDate())}-${cap(now.getHours())}${cap(now.getMinutes())}${cap(now.getSeconds())}`;
const root = path.resolve(ROOT, arg('out', 'backups'));
const dest = path.join(root, `xynloop-${label}`);

fs.mkdirSync(dest, { recursive: true });

const dbFile = path.join(dest, 'xynloop.db');
await db.backup(dbFile);

let fotoJumlah = 0;
let fotoUkuran = 0;
if (fs.existsSync(config.uploadDir)) {
  const target = path.join(dest, 'uploads');
  fs.cpSync(config.uploadDir, target, { recursive: true });
  const jalan = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) jalan(p);
      else { fotoJumlah += 1; fotoUkuran += fs.statSync(p).size; }
    }
  };
  jalan(target);
}

const ringkas = {
  dibuat_pada: now.toISOString(),
  basis_data_ukuran_MB: Math.round((fs.statSync(dbFile).size / 1048576) * 100) / 100,
  foto: fotoJumlah,
  foto_ukuran_MB: Math.round((fotoUkuran / 1048576) * 100) / 100,
  mitra: get('SELECT COUNT(*) AS n FROM mitras').n,
  pengambilan: get('SELECT COUNT(*) AS n FROM pickups').n,
  kwitansi: get('SELECT COUNT(*) AS n FROM receipts').n,
  akun: all('SELECT id FROM users').length,
};

fs.writeFileSync(path.join(dest, 'ISI.json'), JSON.stringify(ringkas, null, 2));
fs.writeFileSync(path.join(dest, 'CARA-MULIHKAN.txt'), [
  'CARA MEMULIHKAN CADANGAN XYNLOOP',
  '',
  '1. Hentikan aplikasi (systemctl stop xynloop atau tutup node).',
  `2. Ganti ${path.join(config.dataDir, 'xynloop.db')} dengan berkas xynloop.db di folder ini.`,
  '   Hapus juga berkas xynloop.db-wal dan xynloop.db-shm yang lama bila ada.',
  `3. Ganti isi folder ${config.uploadDir} dengan folder uploads di cadangan ini.`,
  '4. Jalankan kembali aplikasi. Data, foto, dan akun ikut pulih.',
  '',
  'Catatan: kunci sesi (SESSION_SECRET) tidak ikut tersimpan di basis data. Bila server',
  'baru memakai secret berbeda, seluruh pengguna cukup masuk ulang.',
  '',
].join('\n'));

// pangkas cadangan lama
const keep = Number(arg('keep', 14));
const daftar = fs.readdirSync(root, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith('xynloop-'))
  .map((e) => e.name)
  .sort()
  .reverse();
for (const lama of daftar.slice(keep)) {
  fs.rmSync(path.join(root, lama), { recursive: true, force: true });
  console.log('  cadangan lama dihapus:', lama);
}

console.log([
  '',
  `  Cadangan selesai -> ${dest}`,
  `  Basis data       : ${ringkas.basis_data_ukuran_MB} MB`,
  `  Foto bukti       : ${ringkas.foto} berkas (${ringkas.foto_ukuran_MB} MB)`,
  `  Isi              : ${ringkas.mitra} mitra, ${ringkas.pengambilan} pengambilan, ${ringkas.kwitansi} kwitansi, ${ringkas.akun} akun`,
  '',
].join('\n'));
