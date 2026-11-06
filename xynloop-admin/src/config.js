import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile();

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  secret: env.SESSION_SECRET || 'xynloop-dev-secret-ganti-di-produksi',
  sessionDays: Number(env.SESSION_DAYS || 30),
  dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
  uploadDir: path.resolve(ROOT, env.UPLOAD_DIR || 'uploads'),
  bootstrapAdmin: {
    username: env.BOOTSTRAP_ADMIN_USERNAME || 'admin',
    password: env.BOOTSTRAP_ADMIN_PASSWORD || 'Xynloop2026!',
  },
  maxUploadBytes: 6 * 1024 * 1024,
};

for (const dir of [config.dataDir, config.uploadDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

if (env.NODE_ENV === 'production' && !env.SESSION_SECRET) {
  console.error('SESSION_SECRET wajib diisi saat menjalankan mode produksi.');
  process.exit(1);
}
