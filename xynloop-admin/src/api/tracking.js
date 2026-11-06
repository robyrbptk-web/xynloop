import { Router } from 'express';
import { all, audit, get, nowLocal, round2, run, today } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, dateOrToday, notFound, num, requireFields, str, wrap } from '../lib/http.js';
import { isManager } from '../lib/permissions.js';
import { bounds, haversine, routeLength } from '../lib/geo.js';

const r = Router();

const DEDUP_SECONDS = 3;
const DEDUP_METERS = 5;
const MAX_LIVE_RUNS = 40;
const ROLE_PRIORITY = { driver: 0, kordinator: 1, penimbang: 2, kru: 3 };

const pad = (n) => String(n).padStart(2, '0');

function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toMs(v) {
  const s = str(v, 40);
  if (!s) return null;
  const t = new Date(s.replace(' ', 'T')).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Waktu rekaman dari aplikasi lapangan; nilai yang tidak terbaca atau melompat ke masa
 *  depan dianggap rusak sehingga jatuh ke nowLocal(). */
function timestampOrNull(v) {
  const t = toMs(v);
  if (t === null || t > Date.now() + 5 * 60_000) return null;
  return stamp(new Date(t));
}

function coordsOf(body) {
  const lat = num(body?.lat, null);
  const lng = num(body?.lng, null);
  const bad = lat === null || lng === null
    || Math.abs(lat) > 90 || Math.abs(lng) > 180
    || (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001);
  if (bad) throw badRequest('GPS belum mendapat posisi, coba lagi di area terbuka.');
  return { lat, lng };
}

const pairs = (rows) => rows.map((p) => [p.lat, p.lng]);

function lastShape(row) {
  if (!row) return null;
  return {
    lat: row.lat, lng: row.lng, accuracy: row.accuracy, speed: row.speed,
    battery: row.battery, recorded_at: row.recorded_at,
  };
}

function activePickup(userId) {
  return get(
    `SELECT p.*, m.name AS mitra_name FROM pickups p JOIN mitras m ON m.id = p.mitra_id
      WHERE p.date = ? AND p.status IN ('dalam_perjalanan','menimbang')
        AND (p.lead_user_id = ? OR EXISTS (SELECT 1 FROM pickup_crew c
                                            WHERE c.pickup_id = p.id AND c.user_id = ?))
      ORDER BY p.id DESC LIMIT 1`,
    [today(), userId, userId],
  );
}

function membership(pickupId, userId) {
  return get(
    `SELECT 1 AS ok FROM pickups p
      WHERE p.id = ? AND (p.lead_user_id = ? OR EXISTS (SELECT 1 FROM pickup_crew c
                                                        WHERE c.pickup_id = p.id AND c.user_id = ?))`,
    [pickupId, userId, userId],
  );
}

/** Satu plat per orang: driver dan kordinator lebih dahulu mendapat armada run. */
function assignPlates(crew, plates) {
  const queue = plates.slice();
  const ordered = crew.slice().sort(
    (a, b) => (ROLE_PRIORITY[a.role_in_run] ?? 9) - (ROLE_PRIORITY[b.role_in_run] ?? 9),
  );
  for (const c of ordered) {
    if (!queue.length) break;
    c.vehicle_plate = queue.shift();
  }
}

function forbidden(res, msg) {
  return res.status(403).json({ error: msg });
}

/* ------------------------------------------------------------------ */
/* 1. Titik GPS dari aplikasi lapangan                                  */
/* ------------------------------------------------------------------ */

r.post('/point', requireAuth, wrap((req, res) => {
  const b = req.body || {};
  const { lat, lng } = coordsOf(b);
  const auto = b.auto === true || b.auto === '1' || b.auto === 1;

  const requested = num(b.pickup_id, null);
  let pickupId = null;
  if (requested !== null) {
    const target = get('SELECT id FROM pickups WHERE id = ?', [requested]);
    if (!target) throw badRequest('Penugasan tidak ditemukan.');
    if (!isManager(req.user.role) && !membership(target.id, req.user.id)) {
      return forbidden(res, 'Anda tidak terdaftar pada penugasan tersebut.');
    }
    pickupId = target.id;
  } else {
    const active = activePickup(req.user.id);
    pickupId = active ? active.id : null;
  }

  const prev = get(
    `SELECT lat, lng, recorded_at FROM tracking_points
      WHERE user_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1`,
    [req.user.id],
  );
  if (prev) {
    const ageMs = Date.now() - (toMs(prev.recorded_at) ?? 0);
    if (ageMs < DEDUP_SECONDS * 1000 && haversine(prev.lat, prev.lng, lat, lng) < DEDUP_METERS) {
      return res.json({ ok: true, deduped: true, saved: false, auto });
    }
  }

  const info = run(
    `INSERT INTO tracking_points (pickup_id, user_id, lat, lng, accuracy, speed, battery, heading, recorded_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      pickupId, req.user.id, lat, lng,
      num(b.accuracy, null), num(b.speed, null), num(b.battery, null), num(b.heading, null),
      timestampOrNull(b.recorded_at) || nowLocal(),
    ],
  );
  res.status(201).json({
    ok: true, saved: true, deduped: false, auto, pickup_id: pickupId,
    point: get('SELECT * FROM tracking_points WHERE id = ?', [info.lastInsertRowid]),
  });
}));

/* ------------------------------------------------------------------ */
/* 2. Peta kantor: run aktif + posisi terakhir tiap orang               */
/* ------------------------------------------------------------------ */

r.get('/live', requireAuth, wrap((req, res) => {
  const manager = isManager(req.user.role);
  const runs = all(
    `SELECT p.id, p.code, p.date, p.status, p.scheduled_at, p.lead_user_id,
            lu.name AS lead_name,
            m.id AS mitra_id, m.name AS mitra_name, m.address AS mitra_address,
            m.area AS mitra_area, m.lat AS mitra_lat, m.lng AS mitra_lng
       FROM pickups p
       JOIN mitras m ON m.id = p.mitra_id
       LEFT JOIN users lu ON lu.id = p.lead_user_id
      WHERE p.status NOT IN ('selesai','batal')
        AND (p.status IN ('dalam_perjalanan','menimbang')
             OR (p.status = 'terjadwal' AND p.scheduled_at IS NOT NULL
                 AND date(p.scheduled_at) = date('now','localtime')
                 AND datetime(p.scheduled_at) <= datetime(?)))
        ${manager ? '' : `AND (p.lead_user_id = ? OR EXISTS (SELECT 1 FROM pickup_crew c
                                       WHERE c.pickup_id = p.id AND c.user_id = ?))`}
      ORDER BY CASE p.status WHEN 'menimbang' THEN 0 WHEN 'dalam_perjalanan' THEN 1 ELSE 2 END, p.id DESC
      LIMIT ${MAX_LIVE_RUNS}`,
    manager ? [nowLocal()] : [nowLocal(), req.user.id, req.user.id],
  );

  const ids = runs.map((row) => row.id);
  const marks = ids.map(() => '?').join(',');
  const hasRuns = ids.length > 0;

  const pointRows = hasRuns
    ? all(
      `SELECT tp.pickup_id, tp.user_id, tp.lat, tp.lng, tp.accuracy, tp.speed, tp.battery, tp.recorded_at
         FROM tracking_points tp
        WHERE tp.pickup_id IN (${marks}) AND date(tp.recorded_at) = date('now','localtime')
        ORDER BY tp.pickup_id, tp.user_id, tp.recorded_at, tp.id`,
      ids,
    )
    : [];
  const byUser = new Map();
  const byRun = new Map();
  for (const p of pointRows) {
    const key = `${p.pickup_id}|${p.user_id}`;
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(p);
    if (!byRun.has(p.pickup_id)) byRun.set(p.pickup_id, []);
    byRun.get(p.pickup_id).push(p);
  }

  const crewRows = hasRuns
    ? all(
      `SELECT c.pickup_id, c.user_id, c.role_in_run, u.name
         FROM pickup_crew c JOIN users u ON u.id = c.user_id
        WHERE c.pickup_id IN (${marks}) ORDER BY c.pickup_id, c.id`,
      ids,
    )
    : [];
  const vehicleRows = hasRuns
    ? all(
      `SELECT pv.pickup_id, v.plate
         FROM pickup_vehicles pv JOIN vehicles v ON v.id = pv.vehicle_id
        WHERE pv.pickup_id IN (${marks}) ORDER BY pv.id`,
      ids,
    )
    : [];

  const memberIds = new Set();
  const live = runs.map((row) => {
    const crew = crewRows.filter((c) => c.pickup_id === row.id).map((c) => ({
      user_id: c.user_id, name: c.name, role_in_run: c.role_in_run,
      vehicle_plate: null, last: null, points_today: 0, distance_m: 0,
    }));
    if (row.lead_user_id && !crew.some((c) => c.user_id === row.lead_user_id)) {
      crew.unshift({
        user_id: row.lead_user_id, name: row.lead_name || 'Tanpa nama', role_in_run: 'kordinator',
        vehicle_plate: null, last: null, points_today: 0, distance_m: 0,
      });
    }
    const plates = vehicleRows.filter((v) => v.pickup_id === row.id).map((v) => v.plate);
    assignPlates(crew, plates);

    for (const c of crew) {
      memberIds.add(c.user_id);
      const list = byUser.get(`${row.id}|${c.user_id}`);
      if (!list || !list.length) continue;
      c.last = lastShape(list[list.length - 1]);
      c.points_today = list.length;
      c.distance_m = Math.round(routeLength(pairs(list)));
    }

    const list = byRun.get(row.id) || [];
    let startedAt = null;
    let lastSeen = null;
    for (const p of list) {
      if (!startedAt || p.recorded_at < startedAt) startedAt = p.recorded_at;
      if (!lastSeen || p.recorded_at > lastSeen) lastSeen = p.recorded_at;
    }

    return {
      pickup_id: row.id,
      code: row.code,
      date: row.date,
      status: row.status,
      scheduled_at: row.scheduled_at,
      lead_user_id: row.lead_user_id,
      started_at: startedAt || row.scheduled_at,
      last_seen: lastSeen,
      mitra: {
        id: row.mitra_id, name: row.mitra_name, address: row.mitra_address,
        area: row.mitra_area, lat: row.mitra_lat, lng: row.mitra_lng,
      },
      crew,
      vehicles: plates,
    };
  });

  const idleRows = all(
    `SELECT tp.user_id, u.name, u.role, tp.lat, tp.lng, tp.accuracy, tp.speed, tp.battery, tp.recorded_at
       FROM tracking_points tp JOIN users u ON u.id = tp.user_id
      WHERE u.role IN ('purchasing','crew') AND u.is_active = 1
        AND tp.recorded_at >= datetime('now','localtime','-12 hours')
        ${hasRuns ? `AND (tp.pickup_id IS NULL OR tp.pickup_id NOT IN (${marks}))` : ''}
        ${manager ? '' : 'AND tp.user_id = ?'}
      ORDER BY tp.user_id, tp.recorded_at DESC, tp.id DESC`,
    [...(hasRuns ? ids : []), ...(manager ? [] : [req.user.id])],
  );
  const seenUser = new Set();
  const idle = [];
  for (const p of idleRows) {
    if (seenUser.has(p.user_id) || memberIds.has(p.user_id)) continue;
    seenUser.add(p.user_id);
    idle.push({
      user_id: p.user_id, name: p.name, role: p.role,
      last: {
        lat: p.lat, lng: p.lng, accuracy: p.accuracy, speed: p.speed,
        battery: p.battery, recorded_at: p.recorded_at,
      },
    });
  }

  res.json({ updated: nowLocal(), runs: live, idle });
}));

/* ------------------------------------------------------------------ */
/* 3. Rute lengkap satu penugasan                                       */
/* ------------------------------------------------------------------ */

r.get('/route/:pickupId', requireAuth, wrap((req, res) => {
  const id = num(req.params.pickupId, null);
  if (id === null) throw badRequest('ID penugasan tidak valid.');
  const p = get(
    `SELECT p.id, p.code, p.date, p.status, p.start_lat, p.start_lng,
            m.name AS mitra_name, m.address AS mitra_address, m.lat AS mitra_lat, m.lng AS mitra_lng
       FROM pickups p JOIN mitras m ON m.id = p.mitra_id
      WHERE p.id = ?`,
    [id],
  );
  if (!p) throw notFound('Penugasan tidak ditemukan.');
  if (!isManager(req.user.role) && !membership(id, req.user.id)) {
    return forbidden(res, 'Hanya peserta run yang dapat membuka rute ini.');
  }

  const rows = all(
    `SELECT tp.lat, tp.lng, tp.recorded_at, tp.speed, tp.accuracy, tp.user_id, u.name AS user_name
       FROM tracking_points tp JOIN users u ON u.id = tp.user_id
      WHERE tp.pickup_id = ? ORDER BY tp.recorded_at, tp.id`,
    [id],
  );

  const perUser = new Map();
  for (const row of rows) {
    if (!perUser.has(row.user_id)) perUser.set(row.user_id, { name: row.user_name, list: [] });
    perUser.get(row.user_id).list.push(row);
  }
  const odo = get(
    `SELECT pv.km_start, pv.km_end FROM pickup_vehicles pv
      WHERE pv.pickup_id = ? ORDER BY pv.id LIMIT 1`,
    [id],
  );
  const first = rows[0];
  const last = rows[rows.length - 1];
  const t1 = first ? toMs(first.recorded_at) : null;
  const t2 = last ? toMs(last.recorded_at) : null;

  res.json({
    pickup: {
      id: p.id, code: p.code, date: p.date, status: p.status,
      mitra_name: p.mitra_name, mitra_address: p.mitra_address,
      mitra_lat: p.mitra_lat, mitra_lng: p.mitra_lng,
    },
    points: rows.map((row) => ({
      lat: row.lat, lng: row.lng, recorded_at: row.recorded_at, speed: row.speed,
      accuracy: row.accuracy, user_id: row.user_id, user_name: row.user_name,
    })),
    by_user: [...perUser.entries()].map(([userId, v]) => ({
      user_id: userId, name: v.name, points: v.list.length,
      distance_km: round2(routeLength(pairs(v.list)) / 1000),
    })),
    distance_km: round2(routeLength(pairs(rows)) / 1000),
    duration_minutes: t1 !== null && t2 !== null ? Math.max(0, Math.round((t2 - t1) / 60000)) : 0,
    started_at: first ? first.recorded_at : null,
    ended_at: last ? last.recorded_at : null,
    odometer: {
      km_start: odo ? odo.km_start : null,
      km_end: odo ? odo.km_end : null,
      distance_km: odo && odo.km_start !== null && odo.km_end !== null
        ? round2(odo.km_end - odo.km_start)
        : null,
    },
  });
}));

/* ------------------------------------------------------------------ */
/* 4. Titik satu orang pada satu tanggal                                */
/* ------------------------------------------------------------------ */

r.get('/day', requireAuth, wrap((req, res) => {
  const day = dateOrToday(req.query.date) || today();
  const target = num(req.query.user_id, req.user.id);
  if (target === null) throw badRequest('ID pengguna tidak valid.');
  if (!isManager(req.user.role) && target !== req.user.id) {
    return forbidden(res, 'Hanya admin atau pemilik yang dapat melihat rute karyawan lain.');
  }
  const rows = all(
    `SELECT tp.id, tp.pickup_id, tp.lat, tp.lng, tp.accuracy, tp.speed, tp.battery, tp.heading,
            tp.recorded_at, p.code AS pickup_code, m.name AS mitra_name
       FROM tracking_points tp
       LEFT JOIN pickups p ON p.id = tp.pickup_id
       LEFT JOIN mitras m ON m.id = p.mitra_id
      WHERE tp.user_id = ? AND date(tp.recorded_at) = ?
      ORDER BY tp.recorded_at, tp.id`,
    [target, day],
  );
  const list = pairs(rows);
  res.json({ points: rows, distance_km: round2(routeLength(list) / 1000), bounds: bounds(list) });
}));

/* ------------------------------------------------------------------ */
/* 5. Status untuk aplikasi lapangan                                     */
/* ------------------------------------------------------------------ */

r.get('/my-status', requireAuth, wrap((req, res) => {
  const active = activePickup(req.user.id);
  const rows = all(
    `SELECT lat, lng, recorded_at FROM tracking_points
      WHERE user_id = ? AND date(recorded_at) = ? ORDER BY recorded_at, id`,
    [req.user.id, today()],
  );
  res.json({
    user: { id: req.user.id, name: req.user.name, role: req.user.role },
    active_run: active
      ? {
        pickup_id: active.id, code: active.code, status: active.status,
        mitra_name: active.mitra_name, scheduled_at: active.scheduled_at,
      }
      : null,
    today: {
      points: rows.length,
      distance_km: round2(routeLength(pairs(rows)) / 1000),
      last_seen: rows.length ? rows[rows.length - 1].recorded_at : null,
    },
  });
}));

/* ------------------------------------------------------------------ */
/* 6. Hapus titik satu run (salah batalkan / data sampah)                */
/* ------------------------------------------------------------------ */

r.delete('/points', requireAuth, wrap((req, res) => {
  if (!isManager(req.user.role)) {
    return forbidden(res, 'Hanya admin atau pemilik yang dapat menghapus titik GPS.');
  }
  requireFields(req.body, ['pickup_id']);
  const id = num(req.body.pickup_id, null);
  if (id === null) throw badRequest('ID penugasan tidak valid.');
  if (!get('SELECT id FROM pickups WHERE id = ?', [id])) throw badRequest('Penugasan tidak ditemukan.');
  const count = get('SELECT COUNT(*) AS n FROM tracking_points WHERE pickup_id = ?', [id]).n;
  run('DELETE FROM tracking_points WHERE pickup_id = ?', [id]);
  audit(req.user.id, 'tracking.purge', 'pickup', id, { count });
  res.json({ ok: true, deleted: count });
}));

export default r;
