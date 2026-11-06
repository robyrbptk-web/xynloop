import { Router } from 'express';
import { all, currentFuelPrice, get, setting, today } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, dateOrToday, str, wrap } from '../lib/http.js';
import { isManager } from '../lib/permissions.js';
import { toCsv } from '../lib/csv.js';
import { routeLength } from '../lib/geo.js';

const r = Router();

const RANGES = `
  p.status <> 'batal' AND p.date >= COALESCE(?, '1970-01-01') AND p.date <= COALESCE(?, '9999-12-31')`;

function range(req) {
  const to = dateOrToday(req.query.to) || today();
  const from = dateOrToday(req.query.from) || defaultFrom(to);
  return [from, to];
}

function defaultFrom(to) {
  const d = new Date(`${to}T00:00:00`);
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

/** Blok SELECT standar untuk agregasi hasil timbangan per pickup. */
const AGG = `
  SELECT p.id, p.code, p.date, p.status, p.mitra_id, p.lead_user_id, p.created_by,
         p.distance_km, p.fuel_liters, p.fuel_cost, p.cost_source, p.notes, p.completed_at,
         m.name AS mitra_name, m.code AS mitra_code, m.area AS mitra_area, m.category AS mitra_category,
         m.source_user_id AS sourcing_user_id,
         COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0) AS paper_kg,
         COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0) AS oil_liters,
         COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.amount END),0) AS paper_amount,
         COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.amount END),0) AS oil_amount,
         COALESCE(SUM(pi.amount),0) AS amount,
         COUNT(DISTINCT pi.id) AS item_lines,
         (SELECT COUNT(*) FROM pickup_vehicles pv WHERE pv.pickup_id = p.id) AS vehicles,
         (SELECT GROUP_CONCAT(DISTINCT v.plate) FROM pickup_vehicles pv JOIN vehicles v ON v.id=pv.vehicle_id WHERE pv.pickup_id=p.id) AS plates,
         (SELECT GROUP_CONCAT(DISTINCT u.name) FROM pickup_crew c JOIN users u ON u.id=c.user_id WHERE c.pickup_id=p.id) AS crew_names,
         (SELECT COUNT(*) FROM pickup_crew c WHERE c.pickup_id=p.id) AS crew_count,
         (SELECT rec.number FROM receipts rec WHERE rec.pickup_id=p.id AND rec.status<>'batal' ORDER BY rec.id DESC LIMIT 1) AS receipt_number,
         (SELECT rec.status FROM receipts rec WHERE rec.pickup_id=p.id AND rec.status<>'batal' ORDER BY rec.id DESC LIMIT 1) AS receipt_status
    FROM pickups p
    JOIN mitras m ON m.id = p.mitra_id
    LEFT JOIN pickup_items pi ON pi.pickup_id = p.id
    LEFT JOIN materials mt ON mt.id = pi.material_id
   WHERE`;

function sum(rows) {
  const acc = { runs: rows.length, paper_kg: 0, oil_liters: 0, amount: 0, paper_amount: 0, oil_amount: 0, fuel_cost: 0, distance_km: 0, fuel_liters: 0, vehicles: 0 };
  for (const x of rows) {
    acc.paper_kg += x.paper_kg;
    acc.oil_liters += x.oil_liters;
    acc.amount += x.amount;
    acc.paper_amount += x.paper_amount;
    acc.oil_amount += x.oil_amount;
    acc.fuel_cost += x.fuel_cost || 0;
    acc.distance_km += x.distance_km || 0;
    acc.fuel_liters += x.fuel_liters || 0;
    acc.vehicles += x.vehicles || 0;
  }
  for (const k of ['paper_kg', 'oil_liters', 'distance_km', 'fuel_liters']) acc[k] = Math.round(acc[k] * 100) / 100;
  acc.avg_price_paper = acc.paper_kg ? Math.round(acc.paper_amount / acc.paper_kg) : 0;
  acc.avg_price_oil = acc.oil_liters ? Math.round(acc.oil_amount / acc.oil_liters) : 0;
  acc.cost_per_kg = acc.paper_kg + acc.oil_liters ? Math.round(acc.fuel_cost / (acc.paper_kg + acc.oil_liters)) : 0;
  acc.fuel_ratio = acc.amount ? Math.round((acc.fuel_cost / acc.amount) * 1000) / 10 : 0;
  return acc;
}

/* --------------------------------- RINGKASAN --------------------------------- */

r.get('/summary', requireAuth, wrap((req, res) => {
  const [from, to] = range(req);
  const manager = isManager(req.user.role);
  const ownScope = req.query.scope === 'mine' || !manager;
  const extra = ownScope ? ' AND (m.source_user_id = ? OR p.lead_user_id = ? OR p.created_by = ? OR EXISTS (SELECT 1 FROM pickup_crew c WHERE c.pickup_id=p.id AND c.user_id=?))' : '';
  const params = [from, to];
  if (ownScope) params.push(req.user.id, req.user.id, req.user.id, req.user.id);
  const rows = all(`${AGG} ${RANGES}${extra} GROUP BY p.id ORDER BY p.date DESC`, params);
  const totals = sum(rows);
  res.json({
    range: { from, to },
    scope: ownScope ? 'mine' : 'all',
    totals: manager ? totals : { ...totals, fuel_cost: null, distance_km: null, fuel_liters: null, cost_per_kg: null, fuel_ratio: null },
    mitras: {
      active: get("SELECT COUNT(*) AS n FROM mitras WHERE status='aktif'").n,
      prospects: get("SELECT COUNT(*) AS n FROM mitras WHERE status='prospek'").n,
      offered: get("SELECT COUNT(*) AS n FROM mitras WHERE status='penawaran'").n,
      negotiated: get("SELECT COUNT(*) AS n FROM mitras WHERE status='negosiasi'").n,
      new_in_range: all('SELECT id FROM mitras WHERE date(first_contact_at) >= ? AND date(first_contact_at) <= ?', [from, to]).length,
      converted_in_range: all(
        'SELECT id FROM mitras WHERE active_from >= ? AND active_from <= ?', [from, to],
      ).length,
    },
    documents: {
      receipts: all('SELECT status, COUNT(*) AS n, COALESCE(SUM(total),0) AS amount FROM receipts WHERE issued_at >= ? AND issued_at <= ? GROUP BY status', [from, to]),
      offers: all('SELECT status, COUNT(*) AS n FROM offers WHERE issued_at >= ? AND issued_at <= ? GROUP BY status', [from, to]),
    },
    runs_by_status: all(
      `SELECT status, COUNT(*) AS n FROM pickups WHERE date >= ? AND date <= ? GROUP BY status`, [from, to],
    ),
  });
}));

/* --------------------------------- SERI WAKTU --------------------------------- */

r.get('/timeseries', requireAuth, wrap((req, res) => {
  const [from, to] = range(req);
  const group = ['day', 'week', 'month'].includes(req.query.group) ? req.query.group : 'day';
  const expr = group === 'month'
    ? "strftime('%Y-%m', p.date)"
    : group === 'week'
      ? "strftime('%Y-W%W', p.date)"
      : "date(p.date)";
  const fuel = all(
    `SELECT ${expr} AS bucket, COALESCE(SUM(p.fuel_cost),0) AS fuel_cost,
            COALESCE(SUM(p.distance_km),0) AS distance_km, COALESCE(SUM(p.fuel_liters),0) AS fuel_liters
       FROM pickups p WHERE p.status <> 'batal' AND p.date >= ? AND p.date <= ? GROUP BY bucket ORDER BY bucket`,
    [from, to],
  );
  const base = all(
    `SELECT ${expr} AS bucket,
            COUNT(DISTINCT p.id) AS runs,
            COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0) AS paper_kg,
            COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0) AS oil_liters,
            COALESCE(SUM(pi.amount),0) AS amount,
            COUNT(DISTINCT pv.id) AS vehicle_trips
       FROM pickups p
       LEFT JOIN pickup_items pi ON pi.pickup_id = p.id
       LEFT JOIN materials mt ON mt.id = pi.material_id
       LEFT JOIN pickup_vehicles pv ON pv.pickup_id = p.id
      WHERE p.status <> 'batal' AND p.date >= ? AND p.date <= ?
      GROUP BY bucket ORDER BY bucket`,
    [from, to],
  );
  res.json({
    group,
    series: base.map((b) => {
      const f = fuel.find((x) => x.bucket === b.bucket) || {};
      return {
        ...b,
        paper_kg: Math.round(b.paper_kg * 100) / 100,
        oil_liters: Math.round(b.oil_liters * 100) / 100,
        fuel_cost: f.fuel_cost || 0,
        distance_km: Math.round((f.distance_km || 0) * 100) / 100,
        fuel_liters: Math.round((f.fuel_liters || 0) * 100) / 100,
        label: b.bucket,
      };
    }),
  });
}));

/* ------------------------------ ATRIBUTI KARYAWAN ------------------------------ */

/** Siapa (bagian purchasing) memperoleh mitra mana, dan berapa kg/liter yang akhirnya diambil. */
r.get('/attribution', requireAuth, wrap((req, res) => {
  const [from, to] = range(req);
  const staff = all(
    `SELECT u.id, u.name, u.role, u.area, u.is_active,
            (SELECT COUNT(*) FROM mitras m WHERE m.source_user_id = u.id) AS mitras_total,
            (SELECT COUNT(*) FROM mitras m WHERE m.source_user_id = u.id AND m.status='aktif') AS mitras_aktif,
            (SELECT COUNT(*) FROM mitras m WHERE m.source_user_id = u.id AND m.status IN ('prospek','penawaran','negosiasi')) AS mitras_prospek,
            (SELECT COUNT(*) FROM mitra_visits v WHERE v.user_id = u.id AND date(v.visited_at) BETWEEN ? AND ?) AS kunjungan,
            (SELECT COUNT(*) FROM offers o JOIN mitras m2 ON m2.id=o.mitra_id WHERE m2.source_user_id = u.id
               AND o.status IN ('terkirim','diterima') AND o.issued_at BETWEEN ? AND ?) AS penawaran,
            (SELECT COUNT(*) FROM offers o JOIN mitras m3 ON m3.id=o.mitra_id WHERE m3.source_user_id = u.id
               AND o.status='diterima') AS penawaran_diterima,
            (SELECT COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0)
               FROM pickups p JOIN pickup_items pi ON pi.pickup_id=p.id JOIN materials mt ON mt.id=pi.material_id
              JOIN mitras m4 ON m4.id=p.mitra_id
             WHERE m4.source_user_id = u.id AND p.status<>'batal' AND p.date BETWEEN ? AND ?) AS paper_kg,
            (SELECT COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0)
               FROM pickups p JOIN pickup_items pi ON pi.pickup_id=p.id JOIN materials mt ON mt.id=pi.material_id
              JOIN mitras m5 ON m5.id=p.mitra_id
             WHERE m5.source_user_id = u.id AND p.status<>'batal' AND p.date BETWEEN ? AND ?) AS oil_liters,
            (SELECT COALESCE(SUM(pi.amount),0) FROM pickups p JOIN pickup_items pi ON pi.pickup_id=p.id
              JOIN mitras m6 ON m6.id=p.mitra_id
             WHERE m6.source_user_id = u.id AND p.status<>'batal' AND p.date BETWEEN ? AND ?) AS amount,
            (SELECT COUNT(DISTINCT p.id) FROM pickups p JOIN mitras m7 ON m7.id=p.mitra_id
             WHERE m7.source_user_id = u.id AND p.status<>'batal' AND p.date BETWEEN ? AND ?) AS runs
       FROM users u ORDER BY u.role, u.name`,
    [from, to, from, to, from, to, from, to, from, to, from, to],
  );
  const rows = staff.map((s) => ({
    ...s,
    paper_kg: Math.round(s.paper_kg * 100) / 100,
    oil_liters: Math.round(s.oil_liters * 100) / 100,
    total_qty: Math.round((s.paper_kg + s.oil_liters) * 100) / 100,
    conversion: s.mitras_total ? Math.round((s.mitras_aktif / s.mitras_total) * 100) : 0,
  }));
  const totalQty = rows.reduce((a, x) => a + x.total_qty, 0);
  res.json({
    range: { from, to },
    rows: rows.map((x) => ({ ...x, share: totalQty ? Math.round((x.total_qty / totalQty) * 1000) / 10 : 0 })),
    total_qty: Math.round(totalQty * 100) / 100,
  });
}));

/** Kontribusi kru penjemputan (siapa yang turun ke lapangan). */
r.get('/crew', requireAuth, wrap((req, res) => {
  const [from, to] = range(req);
  const rows = all(
    `SELECT u.id, u.name, u.role,
            COUNT(DISTINCT p.id) AS runs,
            COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0) AS paper_kg,
            COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0) AS oil_liters,
            COALESCE(SUM(pi.amount),0) AS amount,
            COUNT(DISTINCT CASE WHEN pi.id IS NULL THEN p.id END) AS empty_runs
       FROM pickup_crew c
       JOIN users u ON u.id = c.user_id
       JOIN pickups p ON p.id = c.pickup_id AND p.status <> 'batal' AND p.date BETWEEN ? AND ?
       LEFT JOIN pickup_items pi ON pi.pickup_id = p.id
       LEFT JOIN materials mt ON mt.id = pi.material_id
      GROUP BY u.id ORDER BY (paper_kg + oil_liters) DESC`,
    [from, to],
  );
  res.json({
    range: { from, to },
    rows: rows.map((x) => ({ ...x, paper_kg: Math.round(x.paper_kg * 100) / 100, oil_liters: Math.round(x.oil_liters * 100) / 100 })),
  });
}));

/* ---------------------------------- MITRA ---------------------------------- */

r.get('/mitras', requireAuth, wrap((req, res) => {
  const [from, to] = range(req);
  const limit = Math.min(200, Number(req.query.limit) || 40);
  const rows = all(
    `SELECT m.id, m.code, m.name, m.category, m.status, m.area, m.active_from,
            su.name AS sourced_by, cu.name AS handled_by,
            COUNT(DISTINCT p.id) AS runs,
            COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0) AS paper_kg,
            COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0) AS oil_liters,
            COALESCE(SUM(pi.amount),0) AS amount,
            MAX(p.date) AS last_pickup
       FROM mitras m
       LEFT JOIN users su ON su.id = m.source_user_id
       LEFT JOIN users cu ON cu.id = m.crew_user_id
       LEFT JOIN pickups p ON p.mitra_id = m.id AND p.status <> 'batal' AND p.date BETWEEN ? AND ?
       LEFT JOIN pickup_items pi ON pi.pickup_id = p.id
       LEFT JOIN materials mt ON mt.id = pi.material_id
      GROUP BY m.id HAVING runs > 0 OR m.status = 'aktif'
      ORDER BY amount DESC LIMIT ${limit}`,
    [from, to],
  );
  const dormant = all(
    `SELECT m.id, m.name, m.code, m.area, su.name AS sourced_by,
            (SELECT MAX(p.date) FROM pickups p WHERE p.mitra_id=m.id AND p.status='selesai') AS last_pickup
       FROM mitras m LEFT JOIN users su ON su.id = m.source_user_id
      WHERE m.status='aktif' AND (SELECT MAX(p.date) FROM pickups p WHERE p.mitra_id=m.id AND p.status='selesai') IS NULL
         OR m.status='aktif' AND (SELECT MAX(p.date) FROM pickups p WHERE p.mitra_id=m.id AND p.status='selesai') < date('now','localtime','-21 day')
      ORDER BY last_pickup LIMIT 40`,
  );
  res.json({
    range: { from, to },
    rows: rows.map((x) => ({ ...x, paper_kg: Math.round(x.paper_kg * 100) / 100, oil_liters: Math.round(x.oil_liters * 100) / 100 })),
    dormant,
  });
}));

/* --------------------------------- MATERIAL --------------------------------- */

r.get('/materials', requireAuth, wrap((req, res) => {
  const [from, to] = range(req);
  const rows = all(
    `SELECT mt.id, mt.code, mt.name, mt.category, mt.unit,
            SUM(pi.net_weight) AS qty, SUM(pi.amount) AS amount,
            ROUND(SUM(pi.amount) * 1.0 / NULLIF(SUM(pi.net_weight),0)) AS avg_price,
            COUNT(DISTINCT pi.pickup_id) AS runs, COUNT(DISTINCT m.id) AS mitras
       FROM pickup_items pi
       JOIN materials mt ON mt.id = pi.material_id
       JOIN pickups p ON p.id = pi.pickup_id AND p.status <> 'batal' AND p.date BETWEEN ? AND ?
       JOIN mitras m ON m.id = p.mitra_id
      GROUP BY mt.id ORDER BY amount DESC`,
    [from, to],
  );
  res.json({ range: { from, to }, rows: rows.map((x) => ({ ...x, qty: Math.round(x.qty * 100) / 100 })) });
}));

/* --------------------------- ARMADA, JARAK & BIAYA BBM --------------------------- */

r.get('/vehicles', requireAuth, wrap((req, res) => {
  if (!isManager(req.user.role)) throw badRequest('Laporan armada dan biaya hanya tersedia untuk admin/pemilik.');
  const [from, to] = range(req);
  const links = all(
    `SELECT pv.pickup_id, pv.vehicle_id, pv.km_start, pv.km_end, pv.liters AS liters_manual, pv.cost AS cost_manual,
            p.date, p.status
       FROM pickup_vehicles pv JOIN pickups p ON p.id = pv.pickup_id
      WHERE p.status <> 'batal' AND p.date BETWEEN ? AND ?`,
    [from, to],
  );
  const runs = all(
    `SELECT p.id,
            COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0) AS paper_kg,
            COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0) AS oil_liters,
            COALESCE(SUM(pi.amount),0) AS amount,
            (SELECT COUNT(*) FROM pickup_vehicles pv2 WHERE pv2.pickup_id = p.id) AS vehicle_count
       FROM pickups p LEFT JOIN pickup_items pi ON pi.pickup_id = p.id
       LEFT JOIN materials mt ON mt.id = pi.material_id
      WHERE p.status <> 'batal' AND p.date BETWEEN ? AND ? GROUP BY p.id`,
    [from, to],
  );
  const runMap = new Map(runs.map((x) => [x.id, x]));
  const fleet = all('SELECT * FROM vehicles ORDER BY plate');
  const byVehicle = new Map(fleet.map((v) => [
    v.id,
    {
      id: v.id, plate: v.plate, name: v.name, type: v.type, fuel_type: v.fuel_type,
      consumption_km_per_l: v.consumption_km_per_l, capacity_kg: v.capacity_kg, is_active: v.is_active,
      runs: 0, km: 0, liters: 0, cost: 0, paper_kg: 0, oil_liters: 0, amount: 0, last_used: null,
      km_from_odometer: 0, km_from_gps: 0,
    },
  ]));
  for (const link of links) {
    const bucket = byVehicle.get(link.vehicle_id);
    const run = runMap.get(link.pickup_id);
    if (!bucket || !run) continue;
    const odometer = link.km_start != null && link.km_end != null && link.km_end >= link.km_start
      ? link.km_end - link.km_start : null;
    const gps = all(
      'SELECT lat, lng FROM tracking_points WHERE pickup_id = ? ORDER BY recorded_at, id', [link.pickup_id],
    ).map((p) => [p.lat, p.lng]);
    const gpsKm = gps.length > 1 ? routeLength(gps) / 1000 : 0;
    const km = odometer ?? gpsKm;
    bucket.km += km;
    if (odometer != null) bucket.km_from_odometer += km; else bucket.km_from_gps += km;
    const liters = link.liters_manual ?? km / (bucket.consumption_km_per_l || 10);
    const price = currentFuelPrice(bucket.fuel_type, link.date);
    bucket.liters += liters;
    bucket.cost += link.cost_manual ?? liters * price;
    const share = run.vehicle_count > 1 ? 1 / run.vehicle_count : 1;
    bucket.paper_kg += run.paper_kg * share;
    bucket.oil_liters += run.oil_liters * share;
    bucket.amount += run.amount * share;
    bucket.runs += 1;
    if (!bucket.last_used || link.date > bucket.last_used) bucket.last_used = link.date;
  }
  const rows = [...byVehicle.values()]
    .filter((x) => x.runs > 0)
    .map((x) => ({
      ...x,
      km: Math.round(x.km * 10) / 10,
      liters: Math.round(x.liters * 100) / 100,
      cost: Math.round(x.cost),
      paper_kg: Math.round(x.paper_kg * 100) / 100,
      oil_liters: Math.round(x.oil_liters * 100) / 100,
      amount: Math.round(x.amount),
      effective_consumption: x.liters > 0 ? Math.round((x.km / x.liters) * 10) / 10 : null,
      fuel_per_kg: x.paper_kg + x.oil_liters ? Math.round((x.liters / (x.paper_kg + x.oil_liters)) * 1000) / 1000 : 0,
      cost_per_kg: x.paper_kg + x.oil_liters ? Math.round(x.cost / (x.paper_kg + x.oil_liters)) : 0,
      rupiah_per_km: x.km ? Math.round(x.cost / x.km) : 0,
    }))
    .sort((a, b) => b.runs - a.runs || b.amount - a.amount);
  const tanpaArmada = get(
    `SELECT COUNT(*) AS n FROM pickups p WHERE p.status <> 'batal' AND p.date BETWEEN ? AND ?
       AND NOT EXISTS (SELECT 1 FROM pickup_vehicles pv WHERE pv.pickup_id = p.id)`,
    [from, to],
  ).n;
  res.json({
    range: { from, to },
    rows,
    idle_vehicles: [...byVehicle.values()].filter((x) => x.runs === 0 && x.is_active).map((x) => ({ id: x.id, plate: x.plate, name: x.name, type: x.type })),
    pickups_without_vehicle: tanpaArmada,
    note: 'Bila satu pengambilan memakai lebih dari satu mobil, hasil timbangan dibagi rata antar armada.',
    fuel_price_reference: all(
      'SELECT fuel_type, price_per_liter, effective_from FROM fuel_prices WHERE id IN (SELECT MAX(id) FROM fuel_prices GROUP BY fuel_type)',
    ),
  });
}));

/* ---------------------------------- WILAYAH ---------------------------------- */

r.get('/areas', requireAuth, wrap((req, res) => {
  const [from, to] = range(req);
  const rows = all(
    `SELECT COALESCE(NULLIF(m.area,''),'Tanpa wilayah') AS area,
            COUNT(DISTINCT m.id) AS mitras,
            SUM(CASE WHEN m.status='aktif' THEN 1 ELSE 0 END) AS aktif,
            COUNT(DISTINCT p.id) AS runs,
            COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0) AS paper_kg,
            COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0) AS oil_liters,
            COALESCE(SUM(pi.amount),0) AS amount
       FROM mitras m
       LEFT JOIN pickups p ON p.mitra_id = m.id AND p.status<>'batal' AND p.date BETWEEN ? AND ?
       LEFT JOIN pickup_items pi ON pi.pickup_id = p.id
       LEFT JOIN materials mt ON mt.id = pi.material_id
      WHERE m.status <> 'nonaktif' GROUP BY area ORDER BY amount DESC LIMIT 40`,
    [from, to],
  );
  res.json({ range: { from, to }, rows });
}));

/* --------------------------------- EKSPOR CSV --------------------------------- */

const EXPORTS = {
  attribution: {
    label: 'Rekap per karyawan purchasing',
    build: (req) => {
      const { rows } = attributionRows(req);
      return rows.map((x) => ({
        karyawan: x.name, peran: x.role, wilayah: x.area || '',
        prospek_ditemukan: x.mitras_total, mitra_aktif: x.mitras_aktif,
        penawaran_terkirim: x.penawaran, penawaran_disetuju: x.penawaran_diterima,
        kunjungan_lapangan: x.kunjungan, pengambilan: x.runs,
        kertas_kg: x.paper_kg, jelantah_liter: x.oil_liters, nilai_rp: x.amount, persen_konversi: x.conversion,
      }));
    },
  },
  pickups: {
    label: 'Daftar pengambilan',
    build: (req) => {
      const [from, to] = range(req);
      return all(`${AGG} ${RANGES} GROUP BY p.id ORDER BY p.date DESC`, [from, to]).map((x) => ({
        kode: x.code, tanggal: x.date, mitra: x.mitra_name, wilayah: x.mitra_area || '',
        status: x.status, kertas_kg: x.paper_kg, jelantah_liter: x.oil_liters, nilai_rp: x.amount,
        mobil: x.vehicles, plat: x.plates || '', kru: x.crew_names || '', km: x.distance_km || 0,
        bensin_liter: x.fuel_liters || 0, biaya_bb_rp: x.fuel_cost || 0, kwitansi: x.receipt_number || '',
      }));
    },
  },
  items: {
    label: 'Rincian timbangan',
    build: (req) => {
      const [from, to] = range(req);
      return all(
        `SELECT p.code, p.date, m.name AS mitra, mt.name AS bahan, pi.gross_weight, pi.tare_weight, pi.minus_pct,
                pi.net_weight, pi.unit_price, pi.amount, u.name AS penimbang
           FROM pickup_items pi JOIN pickups p ON p.id = pi.pickup_id JOIN materials mt ON mt.id = pi.material_id
           JOIN mitras m ON m.id = p.mitra_id LEFT JOIN users u ON u.id = pi.weighed_by
          WHERE p.status <> 'batal' AND p.date BETWEEN ? AND ? ORDER BY p.date DESC, p.code, pi.line_no`,
        [from, to],
      ).map((x) => ({
        kode: x.code, tanggal: x.date, mitra: x.mitra, bahan: x.bahan, timbangan_kotor: x.gross_weight,
        tara: x.tare_weight, minus_persen: x.minus_pct, bersih: x.net_weight, harga_satuan: x.unit_price,
        jumlah: x.amount, penimbang: x.penimbang || '',
      }));
    },
  },
  receipts: {
    label: 'Daftar kwitansi',
    build: (req) => {
      const [from, to] = range(req);
      return all(
        `SELECT rc.number, rc.issued_at, m.name AS mitra, rc.seller_name, rc.total, rc.method, rc.status,
                rc.paid_at, p.code AS pickup_code
           FROM receipts rc JOIN mitras m ON m.id = rc.mitra_id LEFT JOIN pickups p ON p.id = rc.pickup_id
          WHERE rc.issued_at BETWEEN ? AND ? ORDER BY rc.issued_at DESC`,
        [from, to],
      );
    },
  },
  mitras: {
    label: 'Daftar mitra',
    build: (req) => all(
      `SELECT m.code, m.name, m.category, m.status, m.contact_person, m.phone, m.area, m.address,
              su.name AS ditemukan_oleh, m.expected_paper_kg, m.expected_oil_l, m.first_contact_at, m.active_from,
              (SELECT MAX(p.date) FROM pickups p WHERE p.mitra_id=m.id AND p.status='selesai') AS pengambilan_terakhir,
              (SELECT COALESCE(SUM(pi.amount),0) FROM pickups p JOIN pickup_items pi ON pi.pickup_id=p.id
                WHERE p.mitra_id=m.id AND p.status<>'batal') AS total_nilai
         FROM mitras m LEFT JOIN users su ON su.id = m.source_user_id ORDER BY m.status, m.name`,
    ),
  },
};

function attributionRows(req) {
  const [from, to] = range(req);
  const rows = all(
    `SELECT u.id, u.name, u.role, u.area,
            (SELECT COUNT(*) FROM mitras m WHERE m.source_user_id=u.id) AS mitras_total,
            (SELECT COUNT(*) FROM mitras m WHERE m.source_user_id=u.id AND m.status='aktif') AS mitras_aktif,
            (SELECT COUNT(*) FROM mitra_visits v WHERE v.user_id=u.id AND date(v.visited_at) BETWEEN ? AND ?) AS kunjungan,
            (SELECT COUNT(*) FROM offers o JOIN mitras m2 ON m2.id=o.mitra_id WHERE m2.source_user_id=u.id AND o.status IN ('terkirim','diterima')) AS penawaran,
            (SELECT COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0)
               FROM pickups p JOIN pickup_items pi ON pi.pickup_id=p.id JOIN materials mt ON mt.id=pi.material_id
               JOIN mitras m3 ON m3.id=p.mitra_id WHERE m3.source_user_id=u.id AND p.status<>'batal' AND p.date BETWEEN ? AND ?) AS paper_kg,
            (SELECT COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0)
               FROM pickups p JOIN pickup_items pi ON pi.pickup_id=p.id JOIN materials mt ON mt.id=pi.material_id
               JOIN mitras m4 ON m4.id=p.mitra_id WHERE m4.source_user_id=u.id AND p.status<>'batal' AND p.date BETWEEN ? AND ?) AS oil_liters,
            (SELECT COALESCE(SUM(pi.amount),0) FROM pickups p JOIN pickup_items pi ON pi.pickup_id=p.id
               JOIN mitras m5 ON m5.id=p.mitra_id WHERE m5.source_user_id=u.id AND p.status<>'batal' AND p.date BETWEEN ? AND ?) AS amount,
            (SELECT COUNT(DISTINCT p.id) FROM pickups p JOIN mitras m6 ON m6.id=p.mitra_id
               WHERE m6.source_user_id=u.id AND p.status<>'batal' AND p.date BETWEEN ? AND ?) AS runs
       FROM users u WHERE u.is_active=1 ORDER BY u.name`,
    [from, to, from, to, from, to, from, to, from, to],
  );
  const out = rows.map((x) => ({
    ...x,
    paper_kg: Math.round(x.paper_kg * 100) / 100,
    oil_liters: Math.round(x.oil_liters * 100) / 100,
    conversion: x.mitras_total ? Math.round((x.mitras_aktif / x.mitras_total) * 100) : 0,
  }));
  return { rows: out };
}

r.get('/export', requireAuth, wrap((req, res) => {
  const type = String(req.query.type || 'pickups');
  const spec = EXPORTS[type];
  if (!spec) throw badRequest('Jenis laporan tidak dikenali.');
  if (type === 'attribution' && !isManager(req.user.role)) throw badRequest('Rekap lintas karyawan hanya untuk admin.');
  const rows = spec.build(req);
  const csv = toCsv(rows);
  const stamp = today();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="xynloop-${type}-${stamp}.csv"`);
  res.status(200).send(csv);
}));

r.get('/available', requireAuth, wrap((req, res) => {
  const manager = isManager(req.user.role);
  res.json({
    reports: [
      { key: 'attribution', label: EXPORTS.attribution.label, needs_manager: true, available: manager },
      { key: 'pickups', label: EXPORTS.pickups.label, needs_manager: false, available: true },
      { key: 'items', label: EXPORTS.items.label, needs_manager: false, available: true },
      { key: 'receipts', label: EXPORTS.receipts.label, needs_manager: false, available: true },
      { key: 'mitras', label: EXPORTS.mitras.label, needs_manager: false, available: true },
    ],
    company: setting('company.name'),
    generated_at: new Date().toLocaleString('id-ID'),
  });
}));

export default r;
export { attributionRows, AGG, RANGES, range, sum };
