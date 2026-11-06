import crypto from 'node:crypto';
import { config } from '../config.js';
import { all, get, nowLocal, run } from '../db/index.js';

export const COOKIE = 'xxl_session';

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

export function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + config.sessionDays * 86400_000).toISOString().replace('T', ' ').slice(0, 19);
  run('INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent) VALUES (?,?,?,?,?)', [
    tokenHash,
    userId,
    expires,
    req.ip || '',
    String(req.headers['user-agent'] || '').slice(0, 200),
  ]);
  return token;
}

export function destroySession(token) {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
}

export function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function isSecureRequest(req) {
  return Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
}

export function sessionCookie(token, { secure = false, maxAge = config.sessionDays * 86400 } = {}) {
  return [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
    `Max-Age=${Math.max(0, Math.round(maxAge))}`,
  ].join('; ');
}

export function userFromRequest(req) {
  const token = readCookie(req.headers.cookie, COOKIE);
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = get(
    `SELECT u.*, s.token_hash, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    [tokenHash],
  );
  if (!row) return null;
  if (new Date(row.expires_at.replace(' ', 'T')) < new Date()) {
    destroySession(token);
    return null;
  }
  if (!row.is_active) return null;
  run('UPDATE sessions SET last_seen = ? WHERE token_hash = ?', [nowLocal(), tokenHash]);
  return { ...row, _token: token };
}

export function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Sesi berakhir, silakan masuk kembali.' });
  if (req.method !== 'GET' && req.get('x-xxl') !== '1') {
    return res.status(403).json({ error: 'Permintaan tidak dikenali.' });
  }
  req.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Belum masuk.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Hak akses tidak cukup untuk tindakan ini.' });
    }
    next();
  };
}

export function purgeExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', [nowLocal()]);
}

export function activeSessionCount() {
  return all('SELECT user_id, MAX(last_seen) AS last_seen FROM sessions GROUP BY user_id');
}
