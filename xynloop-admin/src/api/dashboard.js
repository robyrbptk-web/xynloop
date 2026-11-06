import { Router } from 'express';
import { all, get, setting, today } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { wrap } from '../lib/http.js';
import { isManager } from '../lib/permissions.js';

const r = Router();

const startOfWeek = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

const RUN_AGG = `
  SELECT p.id, p.code, p.date, p.status, p.scheduled_at, p.completed_at, p.distance_km, p.fuel_liters, p.fuel_cost,
         m.id AS mitra_id, m.name AS mitra_name, m.code AS mitra_code, m.area,
         COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0) AS paper_kg,
         COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0) AS oil_liters,
         COALESCE(SUM(pi.amount),0) AS amount,
         COUNT(DISTINCT pi.id) AS lines,
         (SELECT COUNT(*) FROM pickup_vehicles pv WHERE pv.pickup_id=p.id) AS vehicles,
         (SELECT GROUP_CONCAT(DISTINCT v.plate) FROM pickup_vehicles pv JOIN vehicles v ON v.id=pv.vehicle_id WHERE pv.pickup_id=p.id) AS plates,
         (SELECT GROUP_CONCAT(DISTINCT u.name) FROM pickup_crew c JOIN users u ON u.id=c.user_id WHERE c.pickup_id=p.id) AS crew_names,
         (SELECT rec.status FROM receipts rec WHERE rec.pickup_id=p.id AND rec.status<>'batal' ORDER BY rec.id DESC LIMIT 1) AS receipt_status,
         (SELECT rec.number FROM receipts rec WHERE rec.pickup_id=p.id AND rec.status<>'batal' ORDER BY rec.id DESC LIMIT 1) AS receipt_number
    FROM pickups p JOIN mitras m ON m.id=p.mitra_id
    LEFT JOIN pickup_items pi ON pi.pickup_id=p.id LEFT JOIN materials mt ON mt.id=pi.material_id`;

function totalsOf(rows) {
  const t = { runs: rows.length, paper_kg: 0, oil_liters: 0, amount: 0, fuel_cost: 0, vehicles: 0 };
  for (const x of rows) {
    t.paper_kg += x.paper_kg;
    t.oil_liters += x.oil_liters;
    t.amount += x.amount;
    t.fuel_cost += x.fuel_cost || 0;
    t.vehicles += x.vehicles || 0;
  }
  t.paper_kg = Math.round(t.paper_kg * 100) / 100;
  t.oil_liters = Math.round(t.oil_liters * 100) / 100;
  return t;
}

r.get('/summary', requireAuth, wrap((req, res) => {
  const day = today();
  const manager = isManager(req.user.role);
  const mine = req.query.scope === 'mine' || !manager;
  const scopeSql = mine ? 'WHERE p.date = ? AND (p.lead_user_id = ? OR p.created_by = ? OR EXISTS (SELECT 1 FROM pickup_crew c WHERE c.pickup_id=p.id AND c.user_id=?))' : 'WHERE p.date = ?';
  const scopeParams = mine ? [day, req.user.id, req.user.id, req.user.id] : [day];
  const todayRuns = all(`${RUN_AGG} ${scopeSql} GROUP BY p.id ORDER BY p.date DESC`, scopeParams);
  const week = startOfWeek();
  const monthStart = `${day.slice(0, 7)}-01`;
  const weekRows = all(`${RUN_AGG} WHERE p.status<>'batal' AND p.date >= ? GROUP BY p.id`, [week]);
  const monthRows = all(`${RUN_AGG} WHERE p.status<>'batal' AND p.date >= ? GROUP BY p.id`, [monthStart]);

  const activeRuns = all(
    `${RUN_AGG} WHERE p.status IN ('dalam_perjalanan','menimbang') GROUP BY p.id`, [],
  );
  const upcoming = all(
    `SELECT p.id, p.code, p.date, p.scheduled_at, p.status, m.name AS mitra_name, m.area,
            (SELECT GROUP_CONCAT(DISTINCT u.name) FROM pickup_crew c JOIN users u ON u.id=c.user_id WHERE c.pickup_id=p.id) AS crew_names,
            (SELECT GROUP_CONCAT(DISTINCT v.plate) FROM pickup_vehicles pv JOIN vehicles v ON v.id=pv.vehicle_id WHERE pv.pickup_id=p.id) AS plates
       FROM pickups p JOIN mitras m ON m.id=p.mitra_id
      WHERE p.status='terjadwal' AND p.date >= ? ORDER BY p.date, COALESCE(p.scheduled_at,'9999') LIMIT 25`,
    [day],
  );
  const recent = all(`${RUN_AGG} WHERE p.status='selesai' GROUP BY p.id ORDER BY p.date DESC, p.completed_at DESC LIMIT 8`, []);
  const last14 = all(
    `SELECT date(p.date) AS d,
            COALESCE(SUM(CASE WHEN mt.category='kertas' THEN pi.net_weight END),0) AS paper_kg,
            COALESCE(SUM(CASE WHEN mt.category='jelantah' THEN pi.net_weight END),0) AS oil_liters,
            COALESCE(SUM(pi.amount),0) AS amount, COALESCE(SUM(p.fuel_cost),0) AS fuel_cost,
            COUNT(DISTINCT p.id) AS runs
       FROM pickups p LEFT JOIN pickup_items pi ON pi.pickup_id=p.id LEFT JOIN materials mt ON mt.id=pi.material_id
      WHERE p.status<>'batal' AND p.date >= date('now','localtime','-13 day')
      GROUP BY d ORDER BY d`, [],
  );

  const alerts = [];
  const tanpaTugasan = get(
    "SELECT COUNT(*) AS n FROM pickups WHERE status='terjadwal' AND date = ? AND (? OR scheduled_at IS NOT NULL OR 1=1)",
    [day, manager ? 1 : 0],
  ).n;
  if (tanpaTugasan) alerts.push({ level: 'info', text: `${tanpaTugasan} pengambilan terjadwal hari ini belum dimulai.` });
  const tanpaKwitansi = all(
    `SELECT p.id, p.code, m.name FROM pickups p JOIN mitras m ON m.id=p.mitra_id
      WHERE p.status='selesai' AND p.date >= date('now','localtime','-7 day')
        AND NOT EXISTS (SELECT 1 FROM receipts rec WHERE rec.pickup_id=p.id AND rec.status<>'batal') LIMIT 8`, [],
  );
  if (tanpaKwitansi.length) {
    alerts.push({ level: 'warn', text: `${tanpaKwitansi.length} pengambilan selesai 7 hari terakhir belum berkuitansi.`, links: tanpaKwitansi });
  }
  const mitraTerlewat = all(
    `SELECT m.id, m.name, m.area, m.schedule_day, su.name AS sourced_by,
            (SELECT MAX(p.date) FROM pickups p WHERE p.mitra_id=m.id AND p.status='selesai') AS last_pickup
       FROM mitras m LEFT JOIN users su ON su.id=m.source_user_id
      WHERE m.status='aktif' AND COALESCE((SELECT MAX(p.date) FROM pickups p WHERE p.mitra_id=m.id AND p.status<>'batal'), '1970-01-01') < date('now','localtime','-21 day')
      ORDER BY last_pickup LIMIT 8`, [],
  );
  if (mitraTerlewat.length) {
    alerts.push({ level: 'warn', text: `${mitraTerlewat.length} mitra aktif belum diambil lebih dari 3 minggu.`, mitras: mitraTerlewat });
  }
  const draftLama = get("SELECT COUNT(*) AS n FROM receipts WHERE status='draf' AND created_at < datetime('now','localtime','-3 day')").n;
  if (draftLama) alerts.push({ level: 'warn', text: `${draftLama} kwitansi masih berstatus draf lebih dari 3 hari.` });
  const tanggapanTunda = get("SELECT COUNT(*) AS n FROM offers WHERE status='terkirim' AND issued_at < date('now','localtime','-14 day')").n;
  if (tanggapanTunda) alerts.push({ level: 'info', text: `${tanggapanTunda} surat penawaran belum dijawab lebih dari 2 minggu.` });

  const myTasks = mine || !manager
    ? all(
        `SELECT m.id, m.name, m.area, m.status, su.name AS sourced_by, m.expected_paper_kg, m.expected_oil_l
           FROM mitras m LEFT JOIN users su ON su.id=m.source_user_id
          WHERE m.source_user_id = ? AND m.status IN ('prospek','penawaran','negosiasi')
          ORDER BY m.updated_at DESC LIMIT 10`,
        [req.user.id],
      )
    : all(
        `SELECT m.id, m.name, m.area, m.status, su.name AS sourced_by, m.expected_paper_kg, m.expected_oil_l
           FROM mitras m LEFT JOIN users su ON su.id=m.source_user_id
          WHERE m.status IN ('penawaran','negosiasi') ORDER BY m.updated_at DESC LIMIT 10`, [],
      );

  res.json({
    date: day,
    scope: mine ? 'mine' : 'all',
    today: manager ? totalsOf(todayRuns) : { ...totalsOf(todayRuns), fuel_cost: null },
    week: totalsOf(weekRows),
    month: totalsOf(monthRows),
    today_runs: todayRuns,
    active_runs: activeRuns,
    upcoming,
    recent,
    series_14d: last14,
    mitras: {
      active: get("SELECT COUNT(*) AS n FROM mitras WHERE status='aktif'").n,
      prospek: get("SELECT COUNT(*) AS n FROM mitras WHERE status IN ('prospek','penawaran','negosiasi')").n,
      new_this_month: get('SELECT COUNT(*) AS n FROM mitras WHERE first_contact_at >= ?', [monthStart]).n,
      active_this_month: get('SELECT COUNT(*) AS n FROM mitras WHERE active_from >= ?', [monthStart]).n,
    },
    crew_on_field: all(
      `SELECT u.id, u.name, u.role, p.code AS pickup_code, m.name AS mitra_name,
              (SELECT MAX(t.recorded_at) FROM tracking_points t WHERE t.user_id=u.id AND t.recorded_at >= datetime('now','localtime','-6 hour')) AS last_seen,
              (SELECT t.lat FROM tracking_points t WHERE t.user_id=u.id ORDER BY t.recorded_at DESC, t.id DESC LIMIT 1) AS lat,
              (SELECT t.lng FROM tracking_points t WHERE t.user_id=u.id ORDER BY t.recorded_at DESC, t.id DESC LIMIT 1) AS lng
         FROM pickup_crew c
         JOIN pickups p ON p.id=c.pickup_id AND p.status IN ('dalam_perjalanan','menimbang')
         JOIN users u ON u.id=c.user_id
         JOIN mitras m ON m.id=p.mitra_id
        GROUP BY u.id ORDER BY u.name`, [],
    ),
    vehicles_today: get(
      'SELECT COALESCE(SUM(n),0) AS n FROM (SELECT COUNT(DISTINCT pv.vehicle_id) AS n FROM pickups p JOIN pickup_vehicles pv ON pv.pickup_id=p.id WHERE p.date = ? AND p.status <> ? )',
      [day, 'batal'],
    ).n,
    pipeline: ['prospek', 'penawaran', 'negosiasi', 'aktif'].map((status) => ({
      status, n: get('SELECT COUNT(*) AS n FROM mitras WHERE status = ?', [status]).n,
    })),
    my_tasks: myTasks,
    alerts,
    cash_out_month: get(
      "SELECT COALESCE(SUM(total),0) AS n FROM receipts WHERE status IN ('lunas','terbit') AND strftime('%Y-%m', issued_at) = strftime('%Y-%m','now','localtime')",
    ).n,
    fuel_month: get(
      "SELECT COALESCE(SUM(fuel_cost),0) AS n FROM pickups WHERE status<>'batal' AND strftime('%Y-%m', date)=strftime('%Y-%m','now','localtime')",
    ).n,
    company: { brand: setting('company.brand'), name: setting('company.name') },
  });
}));

export default r;
