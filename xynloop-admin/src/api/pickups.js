import { Router } from 'express';
import { all, audit, currentPrice, get, nextPickupCode, nowLocal, run, today } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, dateOrToday, num, requireFields, str, wrap } from '../lib/http.js';
import { isManager } from '../lib/permissions.js';
import { computeItem, fuelEstimate, pickupTotals, syncPickupCosts } from '../lib/calc.js';
import { photosFor, savePhotos } from '../lib/attachments.js';

const r = Router();

export const PICKUP_STATUS = ['terjadwal', 'dalam_perjalanan', 'menimbang', 'selesai', 'batal'];
export const STATUS_LABELS = {
  terjadwal: 'Terjadwal',
  dalam_perjalanan: 'Dalam perjalanan',
  menimbang: 'Sedang menimbang',
  selesai: 'Selesai',
  batal: 'Dibatalkan',
};
const CREW_ROLES = ['kordinator', 'driver', 'kru', 'penimbang'];

const SELECT_LIST = `
  SELECT p.*, m.name AS mitra_name, m.code AS mitra_code, m.address AS mitra_address, m.area AS mitra_area,
         m.phone AS mitra_phone, m.lat AS mitra_lat, m.lng AS mitra_lng, m.category AS mitra_category,
         m.source_user_id AS mitra_source_user_id,
         lead_u.name AS lead_name, created_u.name AS created_by_name,
         (SELECT COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0)
            FROM pickup_items pi JOIN materials mt ON mt.id=pi.material_id WHERE pi.pickup_id = p.id) AS paper_kg,
         (SELECT COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0)
            FROM pickup_items pi JOIN materials mt ON mt.id=pi.material_id WHERE pi.pickup_id = p.id) AS oil_liters,
         (SELECT COALESCE(SUM(pi.amount),0) FROM pickup_items pi WHERE pi.pickup_id = p.id) AS amount,
         (SELECT COUNT(*) FROM pickup_items pi WHERE pi.pickup_id = p.id) AS item_lines,
         (SELECT COUNT(*) FROM pickup_vehicles pv WHERE pv.pickup_id = p.id) AS vehicle_count,
         (SELECT GROUP_CONCAT(DISTINCT v.plate) FROM pickup_vehicles pv JOIN vehicles v ON v.id=pv.vehicle_id
           WHERE pv.pickup_id = p.id) AS plates,
         (SELECT GROUP_CONCAT(DISTINCT u.name) FROM pickup_crew c JOIN users u ON u.id=c.user_id
           WHERE c.pickup_id = p.id) AS crew_names,
         (SELECT COUNT(*) FROM pickup_crew c WHERE c.pickup_id = p.id) AS crew_count,
         (rec.number) AS receipt_number, (rec.status) AS receipt_status,
         (rec.total) AS receipt_total, (rec.id) AS receipt_id,
         (SELECT COUNT(*) FROM tracking_points t WHERE t.pickup_id = p.id) AS gps_points
    FROM pickups p
    JOIN mitras m ON m.id = p.mitra_id
    LEFT JOIN users lead_u ON lead_u.id = p.lead_user_id
    LEFT JOIN users created_u ON created_u.id = p.created_by
    LEFT JOIN receipts rec ON rec.pickup_id = p.id AND rec.status <> 'batal'`;

/** Berkaitan dengan pengguna: penanggung jawab, pembuat, penjemput, atau karyawan yang menemukan mitranya. */
const MINE_CLAUSE = `(p.lead_user_id = ? OR p.created_by = ? OR m.source_user_id = ? OR EXISTS
  (SELECT 1 FROM pickup_crew c WHERE c.pickup_id = p.id AND c.user_id = ?))`;
const MINE_PARAMS = (userId) => [userId, userId, userId, userId];

function shape(row) {
  return { ...row, status_label: STATUS_LABELS[row.status] || row.status };
}

r.get('/', requireAuth, wrap((req, res) => {
  const where = [];
  const params = [];
  const mine = req.query.mine === '1' || (!isManager(req.user.role) && req.query.all !== '1');
  if (mine) {
    where.push(MINE_CLAUSE);
    params.push(...MINE_PARAMS(req.user.id));
  }
  if (req.query.status) { where.push('p.status = ?'); params.push(String(req.query.status)); }
  if (req.query.mitra_id) { where.push('p.mitra_id = ?'); params.push(Number(req.query.mitra_id)); }
  if (req.query.vehicle_id) {
    where.push('EXISTS (SELECT 1 FROM pickup_vehicles pv WHERE pv.pickup_id = p.id AND pv.vehicle_id = ?)');
    params.push(Number(req.query.vehicle_id));
  }
  if (req.query.crew_user_id) {
    where.push('EXISTS (SELECT 1 FROM pickup_crew c WHERE c.pickup_id = p.id AND c.user_id = ?)');
    params.push(Number(req.query.crew_user_id));
  }
  if (req.query.date) { where.push('p.date = ?'); params.push(dateOrToday(req.query.date)); }
  if (req.query.from) { where.push('p.date >= ?'); params.push(dateOrToday(req.query.from)); }
  if (req.query.to) { where.push('p.date <= ?'); params.push(dateOrToday(req.query.to)); }
  if (req.query.q) {
    where.push(`(LOWER(m.name) LIKE ? OR LOWER(COALESCE(p.code,'')) LIKE ? OR LOWER(COALESCE(m.area,'')) LIKE ?)`);
    const like = `%${String(req.query.q).toLowerCase()}%`;
    params.push(like, like, like);
  }
  if (req.query.no_receipt === '1') where.push('rec.id IS NULL');
  const limit = Math.min(400, Number(req.query.limit) || 150);
  const rows = all(
    `${SELECT_LIST} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY p.date DESC, p.id DESC LIMIT ${limit}`,
    params,
  );
  const totals = rows.reduce(
    (acc, x) => ({
      paper_kg: acc.paper_kg + x.paper_kg,
      oil_liters: acc.oil_liters + x.oil_liters,
      amount: acc.amount + x.amount,
      fuel_cost: acc.fuel_cost + (x.fuel_cost || 0),
      runs: acc.runs + 1,
    }),
    { paper_kg: 0, oil_liters: 0, amount: 0, fuel_cost: 0, runs: 0 },
  );
  res.json({ pickups: rows.map(shape), totals, scope: mine ? 'mine' : 'all' });
}));

/** Papan jadwal satu hari: siapa berangkat ke mana, dengan mobil apa. */
r.get('/board', requireAuth, wrap((req, res) => {
  const date = dateOrToday(req.query.date) || today();
  const manager = isManager(req.user.role);
  const list = all(
    `${SELECT_LIST} WHERE p.date = ? ${manager ? '' : `AND ${MINE_CLAUSE}`} ORDER BY COALESCE(p.scheduled_at, p.created_at), p.id`,
    manager ? [date] : [date, ...MINE_PARAMS(req.user.id)],
  );
  const mitrasAktif = all(
    "SELECT id, code, name, area, phone, schedule_day, schedule_time FROM mitras WHERE status='aktif' ORDER BY name",
  );
  res.json({
    date,
    pickups: list.map(shape),
    groups: PICKUP_STATUS.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      items: list.filter((p) => p.status === status).map(shape),
    })),
    active_mitras: mitrasAktif,
  });
}));

r.get('/next-code', requireAuth, wrap((req, res) => {
  res.json({ code: nextPickupCode(dateOrToday(req.query.date) || today()) });
}));

function assertEditable(req, pickup) {
  if (!pickup) throw badRequest('Pengambilan tidak ditemukan.');
  if (isManager(req.user.role)) return;
  if (pickup.status === 'selesai') throw badRequest('Pengambilan yang sudah selesai hanya dapat diubah admin.');
  const member = get(
    'SELECT 1 AS x FROM pickup_crew WHERE pickup_id = ? AND user_id = ? UNION ALL SELECT 1 FROM pickups WHERE id = ? AND (lead_user_id = ? OR created_by = ?)',
    [pickup.id, req.user.id, pickup.id, req.user.id, req.user.id],
  );
  if (!member) throw badRequest('Hanya admin atau kru yang bertugas yang dapat mengubah pengambilan ini.');
}

r.get('/:id', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  if (!pickup) throw badRequest('Pengambilan tidak ditemukan.');
  if (!isManager(req.user.role)) {
    const member = get(
      `SELECT 1 AS x FROM pickup_crew WHERE pickup_id = ? AND user_id = ?
        UNION SELECT 1 FROM pickups WHERE id = ? AND (lead_user_id = ? OR created_by = ?)`,
      [pickup.id, req.user.id, pickup.id, req.user.id, req.user.id],
    );
    if (!member) throw badRequest('Anda tidak tercatat pada pengambilan ini.');
  }
  const row = all(`${SELECT_LIST} WHERE p.id = ?`, [pickup.id])[0];
  const totals = pickupTotals(pickup.id);
  const estimate = fuelEstimate(pickup);
  const crew = all(
    `SELECT c.id, c.user_id, c.role_in_run, u.name, u.phone, u.role AS user_role
       FROM pickup_crew c JOIN users u ON u.id = c.user_id WHERE c.pickup_id = ? ORDER BY c.id`,
    [pickup.id],
  );
  const vehicles = all(
    `SELECT pv.id, pv.vehicle_id, pv.km_start, pv.km_end, pv.liters AS liters_manual, pv.cost AS cost_manual,
            v.plate, v.name, v.type, v.fuel_type, v.consumption_km_per_l, v.capacity_kg
       FROM pickup_vehicles pv JOIN vehicles v ON v.id = pv.vehicle_id WHERE pv.pickup_id = ? ORDER BY pv.id`,
    [pickup.id],
  );
  const receipt = get("SELECT * FROM receipts WHERE pickup_id = ? AND status <> 'batal' ORDER BY id DESC LIMIT 1", [pickup.id]);
  const track = all(
    'SELECT id, user_id, lat, lng, speed, accuracy, battery, recorded_at FROM tracking_points WHERE pickup_id = ? ORDER BY recorded_at, id',
    [pickup.id],
  );
  res.json({
    pickup: shape(row),
    totals,
    fuel: estimate,
    crew,
    vehicles,
    receipt: receipt || null,
    photos: photosFor('pickup', pickup.id),
    item_photos: all(
      `SELECT a.* FROM attachments a WHERE a.kind='barang' AND a.owner_id IN
        (SELECT id FROM pickup_items WHERE pickup_id = ?) ORDER BY a.created_at DESC LIMIT 60`,
      [pickup.id],
    ),
    tracking: track,
    mitra: get('SELECT * FROM mitras WHERE id = ?', [pickup.mitra_id]),
  });
}));

r.post('/', requireAuth, wrap((req, res) => {
  requireFields(req.body, ['mitra_id', 'date']);
  const mitra = get('SELECT * FROM mitras WHERE id = ?', [req.body.mitra_id]);
  if (!mitra) throw badRequest('Pilih mitra yang dituju.');
  if (mitra.status === 'nonaktif') throw badRequest('Mitra ini sudah nonaktif. Aktifkan kembali bila masih bekerja sama.');
  const date = dateOrToday(req.body.date) || today();
  const leadUserId = req.body.lead_user_id ? Number(req.body.lead_user_id) : req.user.role === 'crew' ? req.user.id : null;
  const code = req.body.code ? String(req.body.code).trim().toUpperCase() : nextPickupCode(date);
  if (get('SELECT id FROM pickups WHERE code = ?', [code])) throw badRequest('Nomor pengambilan sudah dipakai.');
  const info = run(
    `INSERT INTO pickups (code, mitra_id, date, scheduled_at, status, notes, created_by, lead_user_id, start_lat, start_lng, cost_source)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [code, mitra.id, date, str(req.body.scheduled_at, 20), 'terjadwal', str(req.body.notes, 1000),
      req.user.id, leadUserId, num(req.body.start_lat, null), num(req.body.start_lng, null),
      req.body.cost_source === 'manual' ? 'manual' : 'auto'],
  );
  const id = Number(info.lastInsertRowid);
  addCrew(id, leadUserId, 'kordinator');
  for (const c of req.body.crew || []) addCrew(id, c.user_id ?? c, c.role_in_run || 'kru');
  for (const v of req.body.vehicles || []) {
    if (!addVehicle(id, v?.vehicle_id ?? v, v?.km_start, v?.km_end) && v?.vehicle_id) {
      throw badRequest('Salah satu armada tidak ditemukan atau sedang nonaktif.');
    }
  }
  if (req.body.distance_km !== undefined || req.body.fuel_liters !== undefined) {
    run('UPDATE pickups SET distance_km = ?, fuel_liters = ?, fuel_cost = ?, cost_source = ? WHERE id = ?',
      [num(req.body.distance_km, 0), num(req.body.fuel_liters, 0), num(req.body.fuel_cost, 0), 'manual', id]);
  }
  audit(req.user.id, 'pickup.create', 'pickup', id, { mitra_id: mitra.id, code });
  res.status(201).json({ pickup: get('SELECT * FROM pickups WHERE id = ?', [id]) });
}));

function addCrew(pickupId, userId, role) {
  const uid = num(userId, null);
  if (!uid) return null;
  const u = get('SELECT id FROM users WHERE id = ? AND is_active = 1', [uid]);
  if (!u) return null;
  const safeRole = CREW_ROLES.includes(role) ? role : 'kru';
  const info = run('INSERT OR IGNORE INTO pickup_crew (pickup_id, user_id, role_in_run) VALUES (?,?,?)', [pickupId, u.id, safeRole]);
  return info.lastInsertRowid;
}

function addVehicle(pickupId, vehicleId, kmStart, kmEnd) {
  const vid = num(vehicleId, null);
  if (!vid) return null;
  const v = get('SELECT id FROM vehicles WHERE id = ? AND is_active = 1', [vid]);
  if (!v) return null;
  const info = run('INSERT OR IGNORE INTO pickup_vehicles (pickup_id, vehicle_id, km_start, km_end) VALUES (?,?,?,?)',
    [pickupId, v.id, num(kmStart, null), num(kmEnd, null)]);
  return info.lastInsertRowid;
}

r.put('/:id', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  const b = req.body || {};
  const mitraId = b.mitra_id ? Number(b.mitra_id) : pickup.mitra_id;
  if (!get('SELECT id FROM mitras WHERE id = ?', [mitraId])) throw badRequest('Mitra tujuan tidak ditemukan.');
  run(
    `UPDATE pickups SET mitra_id=?, date=?, scheduled_at=?, notes=?, lead_user_id=?, start_lat=?, start_lng=?,
            cost_source=?, distance_km=?, fuel_liters=?, fuel_cost=?, updated_at=? WHERE id=?`,
    [
      mitraId,
      b.date === undefined ? pickup.date : dateOrToday(b.date) || pickup.date,
      b.scheduled_at === undefined ? pickup.scheduled_at : str(b.scheduled_at, 20),
      b.notes === undefined ? pickup.notes : str(b.notes, 1000),
      b.lead_user_id === undefined ? pickup.lead_user_id : b.lead_user_id ? Number(b.lead_user_id) : null,
      b.start_lat === undefined ? pickup.start_lat : num(b.start_lat, null),
      b.start_lng === undefined ? pickup.start_lng : num(b.start_lng, null),
      b.cost_source === undefined ? pickup.cost_source : b.cost_source === 'manual' ? 'manual' : 'auto',
      b.distance_km === undefined ? pickup.distance_km : num(b.distance_km, null),
      b.fuel_liters === undefined ? pickup.fuel_liters : num(b.fuel_liters, null),
      b.fuel_cost === undefined ? pickup.fuel_cost : num(b.fuel_cost, null),
      nowLocal(), pickup.id,
    ],
  );
  const refreshed = get('SELECT * FROM pickups WHERE id = ?', [pickup.id]);
  const est = refreshed.cost_source === 'auto' ? syncPickupCosts(pickup.id) : null;
  audit(req.user.id, 'pickup.update', 'pickup', pickup.id);
  res.json({ pickup: refreshed, fuel: est });
}));

r.post('/:id/status', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  const status = str(req.body?.status, 20);
  if (!PICKUP_STATUS.includes(status)) throw badRequest('Status pengambilan tidak dikenali.');
  const totals = pickupTotals(pickup.id);
  if (status === 'selesai' && totals.lines === 0) {
    throw badRequest('Belum ada hasil timbangan. Catat minimal satu baris timbangan sebelum menyelesaikan.');
  }
  if (status === 'batal' && !isManager(req.user.role) && pickup.status === 'selesai') {
    throw badRequest('Hanya admin yang dapat membatalkan pengambilan yang sudah selesai.');
  }
  const stamp = nowLocal();
  if (status === 'terjadwal') {
    run('UPDATE pickups SET status=?, arrived_at=NULL, completed_at=NULL, cancel_reason=NULL, updated_at=? WHERE id=?',
      [status, stamp, pickup.id]);
  } else if (status === 'dalam_perjalanan') {
    run(`UPDATE pickups SET status=?, arrived_at=COALESCE(arrived_at, ?), completed_at=NULL, updated_at=? WHERE id=?`,
      [status, stamp, stamp, pickup.id]);
  } else if (status === 'menimbang') {
    run('UPDATE pickups SET status=?, arrived_at=COALESCE(arrived_at, ?), completed_at=NULL, updated_at=? WHERE id=?',
      [status, stamp, stamp, pickup.id]);
  } else if (status === 'selesai') {
    run('UPDATE pickups SET status=?, arrived_at=COALESCE(arrived_at, ?), completed_at=?, updated_at=? WHERE id=?',
      [status, stamp, stamp, stamp, pickup.id]);
    const finder = get('SELECT source_user_id, active_from FROM mitras WHERE id = ?', [pickup.mitra_id]);
    if (finder && !finder.active_from) run('UPDATE mitras SET active_from = ? WHERE id = ?', [pickup.date, pickup.mitra_id]);
  } else {
    run('UPDATE pickups SET status=?, completed_at=?, cancel_reason=?, updated_at=? WHERE id=?',
      [status, stamp, str(req.body?.reason, 200) || 'Dibatalkan', stamp, pickup.id]);
  }
  if (status === 'batal') {
    run("UPDATE receipts SET status='batal', updated_at=?, void_reason=? WHERE pickup_id=? AND status IN ('draf','terbit')",
      [nowLocal(), 'Pengambilan dibatalkan', pickup.id]);
  }
  const est = pickup.cost_source === 'auto' ? syncPickupCosts(pickup.id) : null;
  audit(req.user.id, 'pickup.status', 'pickup', pickup.id, { from: pickup.status, to: status });
  res.json({
    pickup: get('SELECT * FROM pickups WHERE id = ?', [pickup.id]),
    totals,
    fuel: est,
  });
}));

/* --------------------------------- KRU --------------------------------- */

r.post('/:id/crew', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  requireFields(req.body, ['user_id']);
  const id = addCrew(pickup.id, Number(req.body.user_id), req.body.role_in_run || 'kru');
  if (!id) throw badRequest('Anggota kru tidak ditemukan atau sudah tidak aktif.');
  audit(req.user.id, 'pickup.crew.add', 'pickup', pickup.id, { user_id: req.body.user_id });
  res.status(201).json({ ok: true });
}));

r.delete('/:id/crew/:userId', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  run('DELETE FROM pickup_crew WHERE pickup_id = ? AND user_id = ?', [pickup.id, Number(req.params.userId)]);
  res.json({ ok: true });
}));

/* -------------------------------- MOBIL -------------------------------- */

r.post('/:id/vehicles', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  const body = req.body || {};
  const list = Array.isArray(body.vehicles) ? body.vehicles : [body];
  for (const v of list) {
    if (!v.vehicle_id) continue;
    if (!addVehicle(pickup.id, Number(v.vehicle_id), v.km_start, v.km_end)) throw badRequest('Armada tidak ditemukan atau sedang nonaktif.');
  }
  const est = pickup.cost_source === 'auto' ? syncPickupCosts(pickup.id) : null;
  audit(req.user.id, 'pickup.vehicle.add', 'pickup', pickup.id);
  res.status(201).json({ fuel: est, vehicles: all('SELECT * FROM pickup_vehicles WHERE pickup_id = ?', [pickup.id]) });
}));

r.put('/:id/vehicles/:vehicleId', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  const row = get('SELECT * FROM pickup_vehicles WHERE pickup_id = ? AND vehicle_id = ?', [pickup.id, Number(req.params.vehicleId)]);
  if (!row) throw badRequest('Armada ini tidak ada dalam penugasan.');
  const b = req.body || {};
  run('UPDATE pickup_vehicles SET km_start=?, km_end=?, liters=?, cost=? WHERE id=?', [
    b.km_start === undefined ? row.km_start : num(b.km_start, null),
    b.km_end === undefined ? row.km_end : num(b.km_end, null),
    b.liters === undefined ? row.liters : num(b.liters, null),
    b.cost === undefined ? row.cost : num(b.cost, null),
    row.id,
  ]);
  if (b.km_end !== undefined && b.km_end !== null && pickup.status !== 'selesai') {
    run('UPDATE vehicles SET km_running = ? WHERE id = ? AND km_running < ?', [Number(b.km_end), row.vehicle_id, Number(b.km_end)]);
  }
  const est = pickup.cost_source === 'auto' ? syncPickupCosts(pickup.id) : null;
  res.json({ fuel: est });
}));

r.delete('/:id/vehicles/:vehicleId', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  run('DELETE FROM pickup_vehicles WHERE pickup_id = ? AND vehicle_id = ?', [pickup.id, Number(req.params.vehicleId)]);
  if (pickup.cost_source === 'auto') syncPickupCosts(pickup.id);
  res.json({ ok: true });
}));

/* ------------------------------ TIMBANGAN ------------------------------ */

function lineNo(pickupId) {
  const row = get('SELECT COUNT(*) AS n, MAX(line_no) AS mx FROM pickup_items WHERE pickup_id = ?', [pickupId]);
  return Math.max(row.n, row.mx || 0) + 1;
}

r.post('/:id/items', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  requireFields(req.body, ['material_id']);
  const material = get('SELECT * FROM materials WHERE id = ?', [req.body.material_id]);
  if (!material) throw badRequest('Jenis bahan tidak ditemukan.');
  if (material.is_active !== 1) throw badRequest(`Jenis ${material.name} sedang tidak dipakai.`);
  const gross = num(req.body.gross_weight, 0);
  const tare = num(req.body.tare_weight, 0);
  const minus = num(req.body.minus_pct, 0);
  const unitPrice = req.body.unit_price === undefined || req.body.unit_price === null || req.body.unit_price === ''
    ? currentPrice(material.id, pickup.date)
    : num(req.body.unit_price, 0);
  const calc = computeItem({ gross, tare, minusPct: minus, unitPrice });
  const info = run(
    `INSERT INTO pickup_items (pickup_id, line_no, material_id, gross_weight, tare_weight, minus_pct, net_weight,
                               unit_price, amount, weighed_by, mitra_witness, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [pickup.id, lineNo(pickup.id), material.id, gross, tare, minus, calc.net_weight, unitPrice, calc.amount,
      num(req.body.weighed_by, req.user.id), req.body.mitra_witness === false ? 0 : 1, str(req.body.note, 200)],
  );
  const id = Number(info.lastInsertRowid);
  if (req.body.photo) savePhotos(req, 'barang', id, [req.body.photo]);
  audit(req.user.id, 'item.create', 'pickup_item', id, { pickup_id: pickup.id, material: material.code });
  res.status(201).json({
    item: get('SELECT * FROM pickup_items WHERE id = ?', [id]),
    photos: photosFor('barang', id),
    totals: pickupTotals(pickup.id),
  });
}));

r.put('/:id/items/:itemId', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  const item = get('SELECT * FROM pickup_items WHERE id = ? AND pickup_id = ?', [req.params.itemId, pickup.id]);
  if (!item) throw badRequest('Baris timbangan tidak ditemukan.');
  const b = req.body || {};
  const next = {
    material_id: b.material_id ? Number(b.material_id) : item.material_id,
    gross_weight: b.gross_weight === undefined ? item.gross_weight : num(b.gross_weight, 0),
    tare_weight: b.tare_weight === undefined ? item.tare_weight : num(b.tare_weight, 0),
    minus_pct: b.minus_pct === undefined ? item.minus_pct : num(b.minus_pct, 0),
    unit_price: b.unit_price === undefined || b.unit_price === '' ? item.unit_price : num(b.unit_price, item.unit_price),
    note: b.note === undefined ? item.note : str(b.note, 200),
    mitra_witness: b.mitra_witness === undefined ? item.mitra_witness : b.mitra_witness ? 1 : 0,
  };
  if (next.gross_weight < 0 || next.tare_weight < 0 || next.tare_weight > next.gross_weight) {
    throw badRequest('Timbangan kosong tidak boleh melebihi timbangan penuh.');
  }
  if (next.gross_weight === 0 && next.tare_weight === 0) throw badRequest('Isi hasil timbangan terlebih dahulu.');
  const calc = computeItem({
    gross: next.gross_weight, tare: next.tare_weight, minusPct: next.minus_pct, unitPrice: next.unit_price,
  });
  run(
    `UPDATE pickup_items SET material_id=?, gross_weight=?, tare_weight=?, minus_pct=?, unit_price=?, note=?,
            mitra_witness=?, net_weight=?, amount=? WHERE id=?`,
    [next.material_id, next.gross_weight, next.tare_weight, next.minus_pct, next.unit_price, next.note,
      next.mitra_witness, calc.net_weight, calc.amount, item.id],
  );
  if (b.photo) savePhotos(req, 'barang', item.id, [b.photo]);
  audit(req.user.id, 'item.update', 'pickup_item', item.id);
  res.json({ item: get('SELECT * FROM pickup_items WHERE id = ?', [item.id]), totals: pickupTotals(pickup.id) });
}));

r.delete('/:id/items/:itemId', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  const item = get('SELECT * FROM pickup_items WHERE id = ? AND pickup_id = ?', [req.params.itemId, pickup.id]);
  if (!item) throw badRequest('Baris timbangan tidak ditemukan.');
  if (pickup.status === 'selesai' && !isManager(req.user.role)) {
    throw badRequest('Pengambilan sudah selesai; hubungi admin untuk menghapus baris.');
  }
  for (const p of photosFor('barang', item.id)) run('DELETE FROM attachments WHERE id = ?', [p.id]);
  run('DELETE FROM pickup_items WHERE id = ?', [item.id]);
  all('SELECT id FROM pickup_items WHERE pickup_id = ? ORDER BY line_no, id', [pickup.id])
    .forEach((row, i) => run('UPDATE pickup_items SET line_no = ? WHERE id = ?', [i + 1, row.id]));
  audit(req.user.id, 'item.delete', 'pickup_item', item.id, { pickup_id: pickup.id });
  res.json({ totals: pickupTotals(pickup.id) });
}));

r.post('/:id/photos', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  res.status(201).json({ photos: savePhotos(req, 'pickup', pickup.id, req.body?.photos) });
}));

r.post('/:id/items/:itemId/photo', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  const item = get('SELECT id FROM pickup_items WHERE id = ? AND pickup_id = ?', [req.params.itemId, pickup.id]);
  if (!item) throw badRequest('Baris timbangan tidak ditemukan.');
  const saved = savePhotos(req, 'barang', item.id, [req.body?.photo || req.body].map((p) => (p.data ? p : { data: p })));
  res.status(201).json({ photos: saved });
}));

/** Perhitungan ulang biaya BBM: otomatis dari km/GPS, atau tetap pada angka manual bila dipilih. */
r.post('/:id/recount', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  assertEditable(req, pickup);
  const est = pickup.cost_source === 'auto' ? syncPickupCosts(pickup.id) : fuelEstimate(pickup);
  res.json({
    fuel: est,
    totals: pickupTotals(pickup.id),
    pickup: get('SELECT id, code, status, distance_km, fuel_liters, fuel_cost, cost_source FROM pickups WHERE id = ?', [pickup.id]),
  });
}));

r.get('/:id/estimate-fuel', requireAuth, wrap((req, res) => {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [req.params.id]);
  if (!pickup) throw badRequest('Pengambilan tidak ditemukan.');
  res.json({ fuel: fuelEstimate(pickup), totals: pickupTotals(pickup.id) });
}));

export default r;
