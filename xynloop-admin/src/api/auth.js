import { Router } from 'express';
import { audit, get, nowLocal, run, setting } from '../db/index.js';
import { createSession, destroySession, hashPassword, isSecureRequest, requireAuth, sessionCookie, userFromRequest, verifyPassword } from '../lib/auth.js';
import { badRequest, requireFields, str, wrap } from '../lib/http.js';
import { capsFor, ROLE_LABELS } from '../lib/permissions.js';

const r = Router();
const attempts = new Map();

function tooFast(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  if (rec.until > now) return rec.until - now;
  return 0;
}

function registerFail(ip) {
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= 6) {
    rec.until = Date.now() + 5 * 60_000;
    rec.count = 0;
  }
  attempts.set(ip, rec);
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    phone: u.phone,
    role: u.role,
    role_label: ROLE_LABELS[u.role] || u.role,
    area: u.area,
    must_change_password: !!u.must_change_password,
    caps: capsFor(u.role),
    company: {
      name: setting('company.name'),
      brand: setting('company.brand'),
      phone: setting('company.phone'),
      address: setting('company.address'),
      city: setting('company.city'),
    },
  };
}

r.post('/login', wrap((req, res) => {
  const wait = tooFast(req.ip);
  if (wait) throw badRequest(`Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(wait / 1000)} detik.`);
  requireFields(req.body, ['username', 'password']);
  const user = get('SELECT * FROM users WHERE username = ?', [String(req.body.username).trim().toLowerCase()]);
  if (!user || !verifyPassword(req.body.password, user.password_hash, user.password_salt)) {
    registerFail(req.ip);
    throw badRequest('Username atau password salah.');
  }
  if (!user.is_active) throw badRequest('Akun ini sudah dinonaktifkan. Hubungi admin.');
  attempts.delete(req.ip);
  const token = createSession(user.id, req);
  run('UPDATE users SET last_login_at = ? WHERE id = ?', [nowLocal(), user.id]);
  audit(user.id, 'login', 'user', user.id);
  res.setHeader('Set-Cookie', sessionCookie(token, { secure: isSecureRequest(req) }));
  res.json({ user: publicUser(user) });
}));

r.post('/logout', wrap((req, res) => {
  const token = userFromRequest(req)?._token;
  if (token) destroySession(token);
  res.setHeader('Set-Cookie', sessionCookie('', { secure: isSecureRequest(req), maxAge: 0 }));
  res.json({ ok: true });
}));

r.get('/me', wrap((req, res) => {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Belum masuk.' });
  res.json({ user: publicUser(user) });
}));

r.post('/password', requireAuth, wrap((req, res) => {
  requireFields(req.body, ['current_password', 'new_password']);
  const { current_password: current, new_password: next } = req.body;
  if (String(next).length < 8) throw badRequest('Password baru minimal 8 karakter.');
  if (!/[0-9]/.test(next) || !/[a-zA-Z]/.test(next)) throw badRequest('Password baru harus berisi huruf dan angka.');
  const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!verifyPassword(current, user.password_hash, user.password_salt)) throw badRequest('Password lama tidak sesuai.');
  const { hash, salt } = hashPassword(next);
  run('UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?', [hash, salt, user.id]);
  run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', [user.id, user.token_hash]);
  audit(user.id, 'password.change', 'user', user.id);
  res.json({ ok: true });
}));

export default r;
export { publicUser };
