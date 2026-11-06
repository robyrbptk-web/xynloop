import { Router } from 'express';
import { all, audit, get, nextMitraCode, nowLocal, run, today } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { dedupeKey, badRequest, num, phoneOrNull, requireFields, str, wrap } from '../lib/http.js';
import { isManager } from '../lib/permissions.js';
import { photosFor, savePhotos } from '../lib/attachments.js';

const r = Router();

export const MITRA_STATUS = ['prospek', 'penawaran', 'negosiasi', 'aktif', 'tidak_respon', 'ditolak', 'nonaktif'];
export const MITRA_LABELS = {
  prospek: 'Prospek baru',
  penawaran: 'Surat penawaran terkirim',
  negosiasi: 'Negosiasi harga',
  aktif: 'Mitra aktif',
  tidak_respon: 'Tidak merespons',
  ditolak: 'Menolak',
  nonaktif: 'Nonaktif / arsip',
};
const CATEGORIES = ['kertas', 'jelantah', 'campur'];

const TOTALS_SQL = `(
    SELECT COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0)
      FROM pickups p JOIN pickup_items pi ON pi.pickup_id=p.id JOIN materials mt ON mt.id=pi.material_id
     WHERE p.mitra_id = m.id AND p.status <> 'batal')`;
const OIL_SQL = `(
    SELECT COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0)
      FROM pickups p JOIN pickup_items pi ON pi.pickup_id=p.id JOIN materials mt ON mt.id=pi.material_id
     WHERE p.mitra_id = m.id AND p.status <> 'batal')`;
const AMOUNT_SQL = `(
    SELECT COALESCE(SUM(pi.amount),0)
      FROM pickups p JOIN pickup_items pi ON pi.pickup_id=p.id
     WHERE p.mitra_id = m.id AND p.status <> 'batal')`;

function decorate(m) {
  const finder = m.source_user_id ? get('SELECT name FROM users WHERE id = ?', [m.source_user_id]) : null;
  const crew = m.crew_user_id ? get('SELECT name FROM users WHERE id = ?', [m.crew_user_id]) : null;
  return {
    ...m,
    status_label: MITRA_LABELS[m.status] || m.status,
    source_user_name: finder ? finder.name : null,
    crew_user_name: crew ? crew.name : null,
    has_gps: !!(m.lat && m.lng),
  };
}

r.get('/', requireAuth, wrap((req, res) => {
  const q = str(req.query.q, 80);
  const where = ['1=1'];
  const params = [];
  if (q) {
    where.push(`(LOWER(m.name) LIKE ? OR LOWER(COALESCE(m.contact_person,'')) LIKE ?
                OR REPLACE(COALESCE(m.phone,''),' ','') LIKE ? OR LOWER(COALESCE(m.address,'')) LIKE ?
                OR LOWER(COALESCE(m.area,'')) LIKE ? OR UPPER(m.code) = ?)`);
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like, `%${q.replace(/\D/g, '')}%`, like, like, q.toUpperCase());
  }
  if (req.query.status) { where.push('m.status = ?'); params.push(String(req.query.status)); }
  if (req.query.category) { where.push('m.category = ?'); params.push(String(req.query.category)); }
  if (req.query.source_user_id) { where.push('m.source_user_id = ?'); params.push(Number(req.query.source_user_id)); }
  if (req.query.area) { where.push('LOWER(COALESCE(m.area,"")) LIKE ?'); params.push(`%${String(req.query.area).toLowerCase()}%`); }
  if (req.query.mine === '1') { where.push('(m.source_user_id = ? OR m.crew_user_id = ?)'); params.push(req.user.id, req.user.id); }
  if (req.query.need_pickup === '1') {
    where.push(`m.status = 'aktif' AND NOT EXISTS (SELECT 1 FROM pickups p WHERE p.mitra_id = m.id
                 AND p.status IN ('terjadwal','dalam_perjalanan','menimbang'))`);
  }
  if (req.query.include_inactive !== '1') where.push("m.status <> 'nonaktif'");
  const limit = Math.min(500, Number(req.query.limit) || 300);
  const order = ({
    updated: 'm.updated_at DESC',
    name: 'm.name ASC',
    result: '(paper_kg + oil_liters) DESC',
    amount: 'lifetime_amount DESC',
  })[String(req.query.sort || 'updated')];
  const rows = all(
    `SELECT m.*, ${TOTALS_SQL} AS paper_kg, ${OIL_SQL} AS oil_liters, ${AMOUNT_SQL} AS lifetime_amount,
            (SELECT COUNT(*) FROM pickups p WHERE p.mitra_id = m.id AND p.status='selesai') AS pickup_count,
            (SELECT MAX(p.date) FROM pickups p WHERE p.mitra_id = m.id AND p.status='selesai') AS last_pickup,
            (SELECT COUNT(*) FROM mitra_visits v WHERE v.mitra_id = m.id) AS visit_count,
            (SELECT COUNT(*) FROM offers o WHERE o.mitra_id = m.id AND o.status IN ('terkirim','diterima')) AS offer_count
       FROM mitras m WHERE ${where.join(' AND ')}
      ORDER BY CASE m.status WHEN 'aktif' THEN 0 WHEN 'negosiasi' THEN 1 WHEN 'penawaran' THEN 2
                             WHEN 'prospek' THEN 3 ELSE 4 END, ${order}
      LIMIT ${limit}`,
    params,
  );
  res.json({ mitras: rows.map(decorate) });
}));

r.get('/pipeline', requireAuth, wrap((req, res) => {
  const counts = all("SELECT status, COUNT(*) AS n FROM mitras WHERE status <> 'nonaktif' GROUP BY status");
  const mine = all(
    "SELECT status, COUNT(*) AS n FROM mitras WHERE status <> 'nonaktif' AND source_user_id = ? GROUP BY status",
    [req.user.id],
  );
  res.json({
    pipeline: MITRA_STATUS.map((status) => ({
      status,
      label: MITRA_LABELS[status],
      total: counts.find((c) => c.status === status)?.n || 0,
      mine: mine.find((c) => c.status === status)?.n || 0,
    })),
    by_user: all(
      `SELECT u.id, u.name, u.role,
              COUNT(m.id) AS prospek,
              SUM(CASE WHEN m.status='aktif' THEN 1 ELSE 0 END) AS aktif,
              SUM(CASE WHEN m.status IN ('penawaran','negosiasi') THEN 1 ELSE 0 END) AS berjalan
         FROM users u LEFT JOIN mitras m ON m.source_user_id = u.id AND m.status <> 'nonaktif'
        WHERE u.is_active = 1 AND u.role IN ('purchasing','admin','owner')
        GROUP BY u.id ORDER BY aktif DESC, prospek DESC`,
    ),
    areas: all(
      `SELECT COALESCE(NULLIF(m.area,''),'Tanpa wilayah') AS area, COUNT(*) AS n,
              SUM(CASE WHEN m.status='aktif' THEN 1 ELSE 0 END) AS aktif
         FROM mitras m WHERE m.status <> 'nonaktif' GROUP BY area ORDER BY n DESC LIMIT 40`,
    ),
  });
}));

r.get('/areas', requireAuth, wrap((req, res) => {
  res.json({ areas: all("SELECT DISTINCT area FROM mitras WHERE area IS NOT NULL AND area <> '' ORDER BY area").map((x) => x.area) });
}));

r.get('/:id', requireAuth, wrap((req, res) => {
  const m = get('SELECT * FROM mitras WHERE id = ?', [req.params.id]);
  if (!m) throw badRequest('Mitra tidak ditemukan.', { code: 404 });
  const id = m.id;
  const sums = get(
    `SELECT
       COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0) AS paper_kg,
       COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0) AS oil_liters,
       COALESCE(SUM(pi.amount),0) AS amount,
       COUNT(DISTINCT p.id) AS runs
       FROM pickups p JOIN pickup_items pi ON pi.pickup_id = p.id JOIN materials mt ON mt.id = pi.material_id
       WHERE p.mitra_id = ? AND p.status <> 'batal'`,
    [id],
  );
  const month = get(
    `SELECT COALESCE(SUM(pi.net_weight),0) AS qty, COALESCE(SUM(pi.amount),0) AS amount
       FROM pickups p JOIN pickup_items pi ON pi.pickup_id = p.id
      WHERE p.mitra_id = ? AND p.status <> 'batal' AND strftime('%Y-%m', p.date) = strftime('%Y-%m','now','localtime')`,
    [id],
  );
  res.json({
    mitra: decorate(m),
    finder: m.source_user_id ? get('SELECT id, name, role, phone FROM users WHERE id = ?', [m.source_user_id]) : null,
    lifetime: { ...sums, month },
    visits: all(
      `SELECT v.*, u.name AS user_name FROM mitra_visits v JOIN users u ON u.id = v.user_id
        WHERE v.mitra_id = ? ORDER BY v.visited_at DESC LIMIT 100`, [id]),
    pickups: all(
      `SELECT p.*,
              (SELECT COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0) FROM pickup_items pi JOIN materials mt ON mt.id=pi.material_id WHERE pi.pickup_id=p.id) AS paper_kg,
              (SELECT COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0) FROM pickup_items pi JOIN materials mt ON mt.id=pi.material_id WHERE pi.pickup_id=p.id) AS oil_liters,
              (SELECT COALESCE(SUM(pi.amount),0) FROM pickup_items pi WHERE pi.pickup_id=p.id) AS amount,
              (SELECT GROUP_CONCAT(DISTINCT u2.name) FROM pickup_crew c JOIN users u2 ON u2.id=c.user_id WHERE c.pickup_id=p.id) AS crew_names,
              (SELECT GROUP_CONCAT(DISTINCT v.plate) FROM pickup_vehicles pv JOIN vehicles v ON v.id=pv.vehicle_id WHERE pv.pickup_id=p.id) AS plates
         FROM pickups p WHERE p.mitra_id = ? ORDER BY p.date DESC LIMIT 100`, [id]),
    offers: all('SELECT * FROM offers WHERE mitra_id = ? ORDER BY issued_at DESC, id DESC', [id]),
    receipts: all("SELECT id, number, issued_at, total, method, status FROM receipts WHERE mitra_id = ? AND status <> 'batal' ORDER BY issued_at DESC LIMIT 60", [id]),
    photos: photosFor('mitra', id),
    visit_photos: all(
      `SELECT a.* FROM attachments a WHERE a.kind='kunjungan' AND a.owner_id IN (SELECT id FROM mitra_visits WHERE mitra_id = ?)
        ORDER BY a.created_at DESC LIMIT 40`, [id]),
  });
}));

function readBody(b, user, existing = null) {
  const category = CATEGORIES.includes(b.category) ? b.category : existing?.category || 'kertas';
  const status = MITRA_STATUS.includes(b.status) ? b.status : existing?.status || 'prospek';
  const pick = (key, fallback = null) => (b[key] === undefined ? existing?.[key] ?? fallback : b[key]);
  return {
    name: str(b.name, 90),
    category,
    contact_person: str(pick('contact_person'), 60),
    phone: phoneOrNull(pick('phone')),
    address: str(pick('address'), 220),
    area: str(pick('area'), 60),
    lat: num(pick('lat'), null),
    lng: num(pick('lng'), null),
    status,
    source_user_id:
      b.source_user_id === undefined || b.source_user_id === ''
        ? existing?.source_user_id ?? (user.role === 'purchasing' ? user.id : null)
        : Number(b.source_user_id),
    crew_user_id:
      b.crew_user_id === undefined || b.crew_user_id === '' ? existing?.crew_user_id ?? null : Number(b.crew_user_id),
    expected_paper_kg: num(pick('expected_paper_kg'), 0),
    expected_oil_l: num(pick('expected_oil_l'), 0),
    schedule_day: str(pick('schedule_day'), 20),
    schedule_time: str(pick('schedule_time'), 20),
    quality_note: str(pick('quality_note'), 300),
    notes: str(pick('notes'), 2000),
  };
}

r.post('/', requireAuth, wrap((req, res) => {
  requireFields(req.body, ['name']);
  const v = readBody(req.body, req.user);
  const key = dedupeKey(v.name, v.phone);
  if (key && get('SELECT id FROM mitras WHERE dedupe_key = ?', [key])) {
    throw badRequest('Calon mitra dengan nama dan nomor yang sama sudah tercatat.');
  }
  const code = nextMitraCode();
  const info = run(
    `INSERT INTO mitras (code, name, category, contact_person, phone, address, area, lat, lng, status,
                         source_user_id, crew_user_id, dedupe_key, expected_paper_kg, expected_oil_l,
                         schedule_day, schedule_time, quality_note, notes, first_contact_at, active_from)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [code, v.name, v.category, v.contact_person, v.phone, v.address, v.area, v.lat, v.lng, v.status,
      v.source_user_id, v.crew_user_id, key, v.expected_paper_kg, v.expected_oil_l, v.schedule_day,
      v.schedule_time, v.quality_note, v.notes, today(), v.status === 'aktif' ? today() : null],
  );
  const id = Number(info.lastInsertRowid);
  run('INSERT INTO mitra_visits (mitra_id, user_id, visit_type, outcome, notes) VALUES (?,?,?,?,?)', [
    id, req.user.id, 'survey', 'lanjut', v.notes || 'Pencatatan awal calon mitra.',
  ]);
  audit(req.user.id, 'mitra.create', 'mitra', id, { code, status: v.status });
  res.status(201).json({ mitra: decorate(get('SELECT * FROM mitras WHERE id = ?', [id])) });
}));

r.put('/:id', requireAuth, wrap((req, res) => {
  const m = get('SELECT * FROM mitras WHERE id = ?', [req.params.id]);
  if (!m) throw badRequest('Mitra tidak ditemukan.');
  if (!isManager(req.user.role) && req.user.role !== 'purchasing') {
    throw badRequest('Hanya admin atau bagian purchasing yang dapat mengubah data mitra.');
  }
  const v = readBody({ ...m, ...req.body }, req.user, m);
  const key = dedupeKey(v.name, v.phone);
  if (key && get('SELECT id FROM mitras WHERE dedupe_key = ? AND id <> ?', [key, m.id])) {
    throw badRequest('Nama & nomor ini sudah dipakai mitra lain.');
  }
  run(
    `UPDATE mitras SET name=?, category=?, contact_person=?, phone=?, address=?, area=?, lat=?, lng=?, status=?,
            source_user_id=?, crew_user_id=?, dedupe_key=?, expected_paper_kg=?, expected_oil_l=?, schedule_day=?,
            schedule_time=?, quality_note=?, notes=?, active_from=?, updated_at=? WHERE id=?`,
    [v.name, v.category, v.contact_person, v.phone, v.address, v.area, v.lat, v.lng, v.status,
      v.source_user_id, v.crew_user_id, key, v.expected_paper_kg, v.expected_oil_l, v.schedule_day,
      v.schedule_time, v.quality_note, v.notes,
      v.status === 'aktif' ? m.active_from || today() : null, nowLocal(), m.id],
  );
  audit(req.user.id, 'mitra.update', 'mitra', m.id);
  res.json({ mitra: decorate(get('SELECT * FROM mitras WHERE id = ?', [m.id])) });
}));

r.post('/:id/status', requireAuth, wrap((req, res) => {
  const m = get('SELECT * FROM mitras WHERE id = ?', [req.params.id]);
  if (!m) throw badRequest('Mitra tidak ditemukan.');
  const status = str(req.body?.status, 20);
  if (!MITRA_STATUS.includes(status)) throw badRequest('Status mitra tidak dikenali.');
  run('UPDATE mitras SET status=?, updated_at=?, active_from=?, closed_at=? WHERE id=?', [
    status, nowLocal(), status === 'aktif' ? m.active_from || today() : m.active_from,
    status === 'nonaktif' ? nowLocal() : null, m.id,
  ]);
  audit(req.user.id, 'mitra.status', 'mitra', m.id, { from: m.status, to: status });
  res.json({ mitra: decorate(get('SELECT * FROM mitras WHERE id = ?', [m.id])) });
}));

r.post('/:id/photos', requireAuth, wrap((req, res) => {
  const m = get('SELECT * FROM mitras WHERE id = ?', [req.params.id]);
  if (!m) throw badRequest('Mitra tidak ditemukan.');
  res.status(201).json({ photos: savePhotos(req, 'mitra', m.id, req.body?.photos) });
}));

r.post('/:id/archive', requireAuth, wrap((req, res) => {
  const m = get('SELECT * FROM mitras WHERE id = ?', [req.params.id]);
  if (!m) throw badRequest('Mitra tidak ditemukan.');
  if (!isManager(req.user.role)) throw badRequest('Hanya admin yang dapat mengarsipkan mitra.');
  const open = get(
    "SELECT COUNT(*) AS n FROM pickups WHERE mitra_id = ? AND status IN ('terjadwal','dalam_perjalanan','menimbang')",
    [m.id],
  ).n;
  if (open) throw badRequest(`Masih ada ${open} pengambilan berjalan untuk mitra ini.`);
  run('UPDATE mitras SET status=?, updated_at=?, closed_at=? WHERE id=?', ['nonaktif', nowLocal(), nowLocal(), m.id]);
  audit(req.user.id, 'mitra.archive', 'mitra', m.id);
  res.json({ ok: true });
}));

/* ------------------------------ KUNJUNGAN LAPANGAN ------------------------------ */

r.post('/:id/visits', requireAuth, wrap((req, res) => {
  const m = get('SELECT * FROM mitras WHERE id = ?', [req.params.id]);
  if (!m) throw badRequest('Mitra tidak ditemukan.');
  const visitType = str(req.body?.visit_type, 20) || 'survey';
  const outcome = str(req.body?.outcome, 20) || 'lanjut';
  const info = run(
    `INSERT INTO mitra_visits (mitra_id, user_id, visit_type, visited_at, outcome, next_action_at, notes, lat, lng)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [m.id, req.user.id, visitType, str(req.body?.visited_at, 20) || nowLocal(), outcome,
      str(req.body?.next_action_at, 10), str(req.body?.notes, 2000),
      num(req.body?.lat, null), num(req.body?.lng, null)],
  );
  const visitId = Number(info.lastInsertRowid);
  const photos = savePhotos(req, 'kunjungan', visitId, req.body?.photos);
  run('UPDATE mitras SET updated_at = ? WHERE id = ?', [nowLocal(), m.id]);
  audit(req.user.id, 'visit.create', 'mitra_visit', visitId, { mitra_id: m.id, outcome });
  res.status(201).json({ visit: get('SELECT * FROM mitra_visits WHERE id = ?', [visitId]), photos });
}));

r.get('/:id/visits', requireAuth, wrap((req, res) => {
  const id = Number(req.params.id);
  res.json({
    visits: all(
      `SELECT v.*, u.name AS user_name FROM mitra_visits v JOIN users u ON u.id = v.user_id
        WHERE v.mitra_id = ? ORDER BY v.visited_at DESC LIMIT 200`, [id]),
    photos: all(
      `SELECT a.* FROM attachments a WHERE a.kind='kunjungan' AND a.owner_id IN (SELECT id FROM mitra_visits WHERE mitra_id = ?)
        ORDER BY a.created_at DESC LIMIT 60`, [id]),
  });
}));

export default r;
