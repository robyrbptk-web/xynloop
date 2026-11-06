export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError(400, msg, details);
export const notFound = (msg = 'Data tidak ditemukan.') => new ApiError(404, msg);

/** Bungkus handler async agar rejection masuk ke error middleware. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

export function str(v, max = 500) {
  if (v === null || v === undefined) return null;
  return String(v).trim().slice(0, max);
}

export function num(v, fallback = null) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function int(v, fallback = 0) {
  const n = num(v, null);
  return n === null ? fallback : Math.round(n);
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => str(body[f]) === null || str(body[f]) === '');
  if (missing.length) throw badRequest(`Lengkapi isian berikut: ${missing.join(', ')}.`, { missing });
}

export function dateOrToday(v) {
  const s = str(v, 20);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) throw badRequest('Format tanggal harus YYYY-MM-DD.');
  return s.slice(0, 10);
}

export function phoneOrNull(v) {
  const s = str(v, 30);
  if (!s) return null;
  const clean = s.replace(/[^\d+]/g, '');
  return clean || null;
}

/** Kunci anti duplikasi mitra: nama + telepon dinormalisasi. */
export function dedupeKey(name, phone) {
  const n = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const p = String(phone || '').replace(/\D/g, '').slice(-9);
  if (!n) return null;
  return `${n}|${p}`;
}
