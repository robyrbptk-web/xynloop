/** Membuat akun pengelola (owner/admin) dari terminal — berguna saat pertama kali
 *  memasang sistem di server, sebelum ada akun yang bisa masuk lewat dashboard.
 *
 *   npm run new-admin -- --name="Sophian Rahardi" --username=sophian
 *   npm run new-admin -- --username=admin --password="Rahasia123" --role=owner
 *
 * Bila password tidak diberikan, sistem membuat password acak dan menampilkannya sekali.
 */
import { all, get, run } from '../db/index.js';
import { config } from '../config.js';
import { hashPassword } from '../lib/auth.js';
import { migrate } from '../db/migrate.js';

function arg(name, fallback = undefined) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

migrate({ quiet: true });

const name = (arg('name') || process.env.XXL_NAME || '').trim();
const username = (arg('username') || process.env.XXL_USERNAME || '').trim().toLowerCase();
const role = (arg('role') || process.env.XXL_ROLE || 'owner').trim().toLowerCase();
const password = arg('password') || process.env.XXL_PASSWORD || '';
const phone = (arg('phone') || process.env.XXL_PHONE || '').trim();

const errors = [];
if (!name) errors.push('Nama lengkap wajib diisi (--name="Nama Lengkap").');
if (!username) errors.push('Username wajib diisi (--username=nama).');
if (!/^[a-z0-9._-]{3,32}$/.test(username || 'x')) errors.push('Username 3-32 karakter: huruf kecil, angka, titik, garis tengah.');
if (!['owner', 'admin'].includes(role)) errors.push('Role hanya owner atau admin.');
if (password && password.length < 8) errors.push('Password minimal 8 karakter.');

if (errors.length) {
  console.error('Pemakaian:\n  npm run new-admin -- --name="Nama" --username=nama [--role=admin] [--password=...] [--phone=0812...]');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

if (get('SELECT id FROM users WHERE username = ?', [username])) {
  console.error(`Username "${username}" sudah dipakai. Ganti username, atau reset password lewat dashboard.`);
  process.exit(1);
}

const finalPassword = password || `Xyn${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
const { hash, salt } = hashPassword(finalPassword);
const mustChange = password ? 0 : 1;
const pemanggil = get("SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1");

run(
  `INSERT INTO users (name, username, phone, role, password_hash, password_salt, is_active, must_change_password, notes, created_by)
   VALUES (?,?,?,?,?,?,?,?,?,?)`,
  [name, username, phone || null, role, hash, salt, 1, mustChange, 'Dibuat dari terminal', pemanggil ? pemanggil.id : null],
);

const dibuat = get('SELECT id, name, username, role FROM users WHERE username = ?', [username]);
const total = all('SELECT id FROM users').length;

console.log([
  '',
  `  Akun dibuat  ->  id ${dibuat.id} · ${dibuat.role} · ${dibuat.username} (${dibuat.name})`,
  `  Password     ->  ${finalPassword}`,
  mustChange
    ? '  Password acak — ganti segera setelah masuk (menu Akun).'
    : '  Password sesuai permintaan — simpan baik-baik dan jangan dibagikan lewat chat.',
  `  Total akun   ->  ${total} · basis data ${config.dataDir}`,
  '',
  '  Masuk ke dashboard, lalu simpan ulang password ini di pengelola kata sandi perusahaan.',
  '',
].join('\n'));
