import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { badRequest } from './http.js';

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Simpan gambar dari data URL (sudah dipadatkan di perangkat sebelum dikirim).
 * Menghasilkan path relatif terhadap uploadDir dan metadata ukuran.
 */
export function saveImage(dataUrl, { folder = 'umum', caption = null } = {}) {
  const m = /^data:(image\/[a-z+.-]+);base64,([\s\S]+)$/i.exec(String(dataUrl || '').trim());
  if (!m) throw badRequest('Format gambar tidak dikenali. Gunakan foto JPEG/PNG/WebP.');
  const mime = m[1].toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext) throw badRequest('Jenis gambar tidak didukung.');
  const raw = Buffer.from(m[2], 'base64');
  if (raw.length > config.maxUploadBytes) {
    throw badRequest(`Ukuran foto melebihi ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`);
  }
  if (raw.length < 512) throw badRequest('Foto terlalu kecil atau rusak, ambil ulang foto.');
  const safeFolder = String(folder).replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || 'umum';
  const dir = path.join(config.uploadDir, safeFolder);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), raw);
  return { path: `${safeFolder}/${name}`, bytes: raw.length, mime };
}

export function removeImage(relPath) {
  try {
    const target = path.resolve(config.uploadDir, String(relPath));
    if (target.startsWith(config.uploadDir) && fs.existsSync(target)) fs.unlinkSync(target);
  } catch {
    /* file sudah hilang — abaikan */
  }
}
