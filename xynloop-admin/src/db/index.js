import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(config.dataDir, 'xynloop.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function applySchema() {
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
}

export const all = (sql, params = []) => db.prepare(sql).all(params);
export const get = (sql, params = []) => db.prepare(sql).get(params);
export const run = (sql, params = []) => db.prepare(sql).run(params);
export const tx = (fn) => db.transaction(fn);
export { db };

/* ------------------------------------------------------------------ */
/* Helpers lintas modul                                               */
/* ------------------------------------------------------------------ */

export function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function today() {
  return nowLocal().slice(0, 10);
}

/** Nilai setting dengan fallback. */
export function setting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
}

export function settingJson(key, fallback) {
  const raw = setting(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setSetting(key, value) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, String(value), nowLocal()],
  );
}

/** Nomor urut dokumen: 001/XSA/XI/2026 (pencahan per tahun, bisa per bulan). */
export function nextDocNumber(scope, dateStr = today(), opts = {}) {
  const per = opts.per || 'year';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  const year = d.getFullYear();
  const period = per === 'month' ? `${year}-${String(d.getMonth() + 1).padStart(2, '0')}` : String(year);
  run('INSERT INTO counters (scope, period, seq) VALUES (?, ?, 0) ON CONFLICT(scope, period) DO NOTHING', [
    scope,
    period,
  ]);
  run('UPDATE counters SET seq = seq + 1 WHERE scope = ? AND period = ?', [scope, period]);
  const { seq } = get('SELECT seq FROM counters WHERE scope = ? AND period = ?', [scope, period]);
  const code = setting('doc.code', 'XSA');
  const romanMonth = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][d.getMonth()];
  const useMonth = opts.month !== false;
  const parts = [String(seq).padStart(3, '0'), code];
  if (useMonth) parts.push(opts.romanMonth === false ? String(d.getMonth() + 1).padStart(2, '0') : romanMonth);
  parts.push(String(year));
  return parts.join('/');
}

/** Nomor transaksi pengambilan: PGB-20261106-001 */
export function nextPickupCode(dateStr = today()) {
  const d = dateStr.replace(/-/g, '').slice(0, 8);
  const prefix = `PGB-${d}-`;
  const row = get('SELECT code FROM pickups WHERE code LIKE ? ORDER BY code DESC LIMIT 1', [prefix + '%']);
  const n = row ? Number(row.code.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(3, '0');
}

export function nextMitraCode() {
  const row = get("SELECT code FROM mitras WHERE code LIKE 'MTR-%' ORDER BY CAST(substr(code,5) AS INTEGER) DESC LIMIT 1");
  const n = row ? Number(row.code.slice(4)) + 1 : 1;
  return 'MTR-' + String(n).padStart(4, '0');
}

/** Harga berlaku untuk satu material pada tanggal tertentu. */
export function currentPrice(materialId, dateStr = today()) {
  const row = get(
    'SELECT price FROM price_lists WHERE material_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1',
    [materialId, dateStr],
  );
  if (row) return row.price;
  const m = get('SELECT default_price FROM materials WHERE id = ?', [materialId]);
  return m ? m.default_price : 0;
}

export function currentFuelPrice(fuelType, dateStr = today()) {
  const row = get(
    'SELECT price_per_liter FROM fuel_prices WHERE fuel_type = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1',
    [String(fuelType || '').toLowerCase(), dateStr],
  );
  return row ? row.price_per_liter : Number(setting('fuel.default_price', 10000));
}

export function audit(userId, action, entity, entityId, meta) {
  run('INSERT INTO audit_logs (user_id, action, entity, entity_id, meta, created_at) VALUES (?,?,?,?,?,?)', [
    userId ?? null,
    action,
    entity ?? null,
    entityId ?? null,
    meta ? JSON.stringify(meta) : null,
    nowLocal(),
  ]);
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const rupiah = (n) => Math.round(Number(n) || 0);
