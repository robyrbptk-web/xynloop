/** Jalankan Cloudflare Tunnel dari terminal mana pun.
 *  Pemakaian: node src/tools/tunnel.js         -> URL sementara (trycloudflare)
 *             node src/tools/tunnel.js run     -> domain tetap (tunnel/config.yml)
 *  Dicari dulu cloudflared di PATH, lalu lokasi instalasi standar Windows,
 *  karena PATH hasil installer sering belum terbaca di terminal yang sudah terbuka. */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config, ROOT } from '../config.js';

const CANDIDATES = [
  'cloudflared',
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'cloudflared', 'cloudflared.exe'),
  '/usr/local/bin/cloudflared',
  '/opt/homebrew/bin/cloudflared',
];

function locate() {
  for (const c of CANDIDATES) {
    if (c.includes(path.sep) || c.endsWith('.exe') || c.startsWith('/')) {
      if (fs.existsSync(c)) return c;
      continue;
    }
    const probe = spawnSync(c, ['--version'], { shell: process.platform === 'win32' });
    if (!probe.error && probe.status === 0) return c;
  }
  return null;
}

const named = process.argv[2] === 'run';
const bin = locate();
if (!bin) {
  console.error('cloudflared belum terpasang. Jalankan:  winget install --id Cloudflare.cloudflared -e');
  process.exit(1);
}

const local = `http://127.0.0.1:${config.port}`;
if (named && !fs.existsSync(path.join(ROOT, 'tunnel/config.yml'))) {
  console.error('Belum ada tunnel/config.yml. Salin dari tunnel/config.example.yml lalu isi TUNNEL_ID & hostname.');
  process.exit(1);
}

const args = named
  ? ['tunnel', '--config', path.join(ROOT, 'tunnel', 'config.yml'), 'run']
  : ['tunnel', '--url', local, '--no-autoupdate'];

console.log(`Server lokal : ${local}`);
console.log(named ? 'Tunnel domain tetap (tunnel/config.yml).' : 'Tunnel sementara — salin URL yang muncul di bawah.');
console.log('Catatan: aplikasi harus sudah berjalan (npm start) pada terminal lain.\n');

const child = spawn(bin, args, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
