import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { all, audit, get, run } from '../db/index.js';
import { hashPassword, requireAuth } from '../lib/auth.js';
import { badRequest, phoneOrNull, requireFields, str, wrap } from '../lib/http.js';
import { isManager } from '../lib/permissions.js';

const r = Router();
const ROLES = ['owner', 'admin', 'purchasing', 'crew'];

function shape(u) {
  const seen = get('SELECT MAX(last_seen) AS at FROM sessions WHERE user_id = ?', [u.id]);
  return {
    id: u.id, name: u.name, username: u.username, phone: u.phone, role: u.role, area: u.area,
    is_active: !!u.is_active, must_change_password: !!u.must_change_password, notes: u.notes,
    created_at: u.created_at, last_login_at: u.last_login_at, last_seen: seen ? seen.at : null,
  };
}

function managerOnly(req, res, next) {
  if (!isManager(req.user.role)) {
    return res.status(403).json({ error: 'Hanya admin atau pemilik yang dapat mengelola akun.' });
  }
  next();
}

/** Daftar pengguna. picklist=1 memberi bentuk ringan untuk mengisi form. */
r.get('/', requireAuth, wrap((req, res) => {
  const { role, active, picklist } = req.query;
  const where = [];
  const params = [];
  if (role) {
    where.push('role = ?');
    params.push(role);
  }
  if (active === '1') where.push('is_active = 1');
  if (!isManager(req.user.role)) {
    where.push("(role IN ('purchasing','crew','admin') OR id = ?)");
    params.push(req.user.id);
  }
  const rows = all(
    `SELECT * FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY is_active DESC, CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'purchasing' THEN 2 ELSE 3 END, name`,
    params,
  );
  if (picklist === '1') {
    return res.json({
      users: rows.map((u) => ({ id: u.id, name: u.name, role: u.role, username: u.username, area: u.area })),
    });
  }
  res.json({ users: rows.map(shape) });
}));

r.get('/:id', requireAuth, wrap((req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!u) throw badRequest('Pengguna tidak ditemukan.');
  const mitras = all(
    'SELECT id, code, name, status, area, category FROM mitras WHERE source_user_id = ? ORDER BY updated_at DESC LIMIT 100',
    [u.id],
  );
  res.json({ user: shape(u), mitras });
}));

r.post('/', requireAuth, managerOnly, wrap((req, res) => {
  requireFields(req.body, ['name', 'username', 'role', 'password']);
  const username = str(req.body.username, 40).toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (username.length < 3) throw badRequest('Username minimal 3 karakter, tanpa spasi.');
  if (!ROLES.includes(req.body.role)) throw badRequest('Peran tidak dikenali.');
  if (String(req.body.password).length < 8) throw badRequest('Password minimal 8 karakter.');
  if (get('SELECT id FROM users WHERE username = ?', [username])) throw badRequest('Username sudah dipakai.');
  const { hash, salt } = hashPassword(req.body.password);
  const info = run(
    `INSERT INTO users (name, username, phone, role, password_hash, password_salt, is_active,
                        must_change_password, area, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      str(req.body.name, 80), username, phoneOrNull(req.body.phone), req.body.role, hash, salt,
      req.body.is_active === false ? 0 : 1, req.body.must_change_password === false ? 0 : 1,
      str(req.body.area, 60), str(req.body.notes, 400), req.user.id,
    ],
  );
  audit(req.user.id, 'user.create', 'user', info.lastInsertRowid, { role: req.body.role, username });
  res.status(201).json({ user: shape(get('SELECT * FROM users WHERE id = ?', [info.lastInsertRowid])) });
}));

r.put('/:id', requireAuth, managerOnly, wrap((req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!u) throw badRequest('Pengguna tidak ditemukan.');
  const b = req.body || {};
  const role = ROLES.includes(b.role) ? b.role : u.role;
  if (u.role === 'owner' && role !== 'owner' && u.id === req.user.id) {
    throw badRequest('Anda tidak dapat menurunkan peran Anda sendiri.');
  }
  if (u.role === 'owner' && role !== 'owner' && req.user.role !== 'owner') {
    throw badRequest('Hanya pemilik yang dapat mengubah akun pemilik.');
  }
  run(
    `UPDATE users SET name = ?, phone = ?, role = ?, area = ?, notes = ?, is_active = ?, must_change_password = ?
      WHERE id = ?`,
    [
      b.name === undefined ? u.name : str(b.name, 80) || u.name,
      b.phone === undefined ? u.phone : phoneOrNull(b.phone),
      role,
      b.area === undefined ? u.area : str(b.area, 60),
      b.notes === undefined ? u.notes : str(b.notes, 400),
      b.is_active === undefined ? u.is_active : b.is_active ? 1 : 0,
      b.must_change_password === undefined ? u.must_change_password : b.must_change_password ? 1 : 0,
      u.id,
    ],
  );
  audit(req.user.id, 'user.update', 'user', u.id, { role });
  res.json({ user: shape(get('SELECT * FROM users WHERE id = ?', [u.id])) });
}));

/** Reset password; tanpa body maka dibuat password acak. Sesi pengguna dibuang. */
r.post('/:id/password', requireAuth, managerOnly, wrap((req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!u) throw badRequest('Pengguna tidak ditemukan.');
  if (u.role === 'owner' && req.user.role !== 'owner') throw badRequest('Hanya pemilik yang dapat mereset akun pemilik.');
  const password = str(req.body?.password, 40) || randomBytes(5).toString('hex') + 'A1';
  if (password.length < 8) throw badRequest('Password minimal 8 karakter.');
  const { hash, salt } = hashPassword(password);
  run('UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1 WHERE id = ?', [hash, salt, u.id]);
  run('DELETE FROM sessions WHERE user_id = ?', [u.id]);
  audit(req.user.id, 'user.reset_password', 'user', u.id);
  res.json({ ok: true, password, forced_change: true });
}));

r.post('/:id/toggle', requireAuth, managerOnly, wrap((req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!u) throw badRequest('Pengguna tidak ditemukan.');
  if (u.id === req.user.id) throw badRequest('Anda tidak dapat menonaktifkan akun sendiri.');
  run('UPDATE users SET is_active = ? WHERE id = ?', [u.is_active ? 0 : 1, u.id]);
  if (u.is_active) run('DELETE FROM sessions WHERE user_id = ?', [u.id]);
  audit(req.user.id, 'user.toggle', 'user', u.id, { is_active: u.is_active ? 0 : 1 });
  res.json({ user: shape(get('SELECT * FROM users WHERE id = ?', [u.id])) });
}));

/** Rekaman kerja satu karyawan: kunjungan prospect + runs yang ia ikuti. */
r.get('/:id/worklog', requireAuth, wrap((req, res) => {
  const since = str(req.query.from, 10) || '1970-01-01';
  const targetId = Number(req.params.id);
  if (!isManager(req.user.role) && targetId !== req.user.id) {
    return res.status(403).json({ error: 'Hanya admin yang dapat melihat kerja karyawan lain.' });
  }
  const visits = all(
    `SELECT v.id, v.visited_at, v.visit_type, v.outcome, v.notes, v.next_action_at,
            m.id AS mitra_id, m.name AS mitra_name, m.code AS mitra_code, m.status AS mitra_status
       FROM mitra_visits v JOIN mitras m ON m.id = v.mitra_id
      WHERE v.user_id = ? AND date(v.visited_at) >= ?
      ORDER BY v.visited_at DESC LIMIT 300`,
    [targetId, since],
  );
  const runs = all(
    `SELECT p.id, p.code, p.date, p.status, m.name AS mitra_name,
            COALESCE(SUM(CASE WHEN mt.category = 'kertas' THEN pi.net_weight END), 0) AS paper_kg,
            COALESCE(SUM(CASE WHEN mt.category = 'jelantah' THEN pi.net_weight END), 0) AS oil_liters,
            COALESCE(SUM(pi.amount), 0) AS amount,
            (SELECT COUNT(*) FROM pickup_vehicles pv WHERE pv.pickup_id = p.id) AS vehicles
       FROM pickups p
       JOIN mitras m ON m.id = p.mitra_id
       LEFT JOIN pickup_items pi ON pi.pickup_id = p.id
       LEFT JOIN materials mt ON mt.id = pi.material_id
      WHERE p.date >= ?
        AND (p.lead_user_id = ? OR EXISTS (SELECT 1 FROM pickup_crew c WHERE c.pickup_id = p.id AND c.user_id = ?))
      GROUP BY p.id ORDER BY p.date DESC LIMIT 300`,
    [since, targetId, targetId],
  );
  res.json({ visits, runs });
}));

export default r;
