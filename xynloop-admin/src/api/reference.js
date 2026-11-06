import { Router } from 'express';
import {
  all,
  audit,
  currentFuelPrice,
  currentPrice,
  get,
  nowLocal,
  round2,
  rupiah,
  run,
  setSetting,
  today,
  tx,
} from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, dateOrToday, int, num, requireFields, str, wrap } from '../lib/http.js';
import { isManager } from '../lib/permissions.js';

const r = Router();

const CATEGORIES = ['kertas', 'jelantah'];
const UNIT_FOR = { kertas: 'kg', jelantah: 'liter' };
const VEHICLE_TYPES = ['mobil', 'truk', 'motor', 'pick_up'];
const FUEL_TYPES = ['pertalite', 'pertamax', 'pertamax-turbo', 'dexlite', 'pertamina-dex', 'solar', 'bio'];
const SETTINGS_PREFIXES = ['company.', 'doc.', 'receipt.', 'offer.', 'fuel.', 'app.'];
const SETTING_WHITELIST = [
  'company.name', 'company.brand', 'company.tagline', 'company.address', 'company.phone', 'company.city',
  'doc.code', 'receipt.staff_name', 'receipt.staff_title', 'receipt.note',
  'offer.signatory_name', 'offer.signatory_title', 'offer.subject', 'offer.day', 'offer.time', 'offer.clauses',
  'fuel.default_price', 'app.version',
];

/* ------------------------------ pemvalidasian ------------------------------ */

function managerOnly(req, res, next) {
  if (!isManager(req.user.role)) {
    return res.status(403).json({ error: 'Hanya admin atau pemilik yang dapat mengubah data referensi.' });
  }
  next();
}

function normalizeCode(raw) {
  const c = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!c) throw badRequest('Kode material wajib diisi.');
  if (!/^[A-Z0-9]{1,6}$/.test(c)) throw badRequest('Kode material harus 1-6 karakter, hanya huruf kapital dan angka.');
  return c;
}

function priceValue(v, field) {
  const n = num(v, null);
  if (n === null) throw badRequest(`${field} wajib diisi sebagai angka.`);
  if (!Number.isInteger(n)) throw badRequest(`${field} harus angka bulat dalam Rupiah penuh.`);
  if (n < 0) throw badRequest(`${field} tidak boleh negatif.`);
  return n;
}

function normalizePlate(raw) {
  const p = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!p) throw badRequest('Nomor polisi wajib diisi.');
  if (!/^[A-Z]{1,3} \d{1,4}[A-Z]{0,3}( [A-Z]{1,3})?$/.test(p)) {
    throw badRequest('Format nomor polisi tidak dikenali. Contoh: B 1234 XYZ.');
  }
  return p;
}

function fuelTypeOr(v, fallback = null) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return fallback;
  if (!FUEL_TYPES.includes(s)) throw badRequest(`Jenis BBM tidak dikenali. Pilihan: ${FUEL_TYPES.join(', ')}.`);
  return s;
}

function consumptionValue(v) {
  if (v === undefined || v === null || String(v).trim() === '') return 10;
  const n = num(v, null);
  if (n === null) throw badRequest('Konsumsi BBM harus berupa angka.');
  if (n < 1 || n > 40) throw badRequest('Konsumsi BBM harus antara 1 dan 40 km per liter.');
  return n;
}

function capacityValue(v) {
  if (v === undefined || v === null || String(v).trim() === '') return 1000;
  const n = num(v, null);
  if (n === null || n <= 0) throw badRequest('Kapasitas angkut (kg) harus lebih dari nol.');
  return n;
}

function kmRunningValue(v) {
  if (v === undefined || v === null || String(v).trim() === '') return 0;
  const n = num(v, null);
  if (n === null || n < 0) throw badRequest('Total jarak tempuh (km) tidak boleh negatif.');
  return n;
}

function parseMeta(v) {
  if (v === null || v === undefined) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

const withPrice = (m) => ({ ...m, price: currentPrice(m.id, today()) });

/* --------------------------------- healthz -------------------------------- */
// Dipasang sebelum requireAuth sehingga dapat dipantau dari luar tanpa sesi.
r.get('/healthz', wrap((req, res) => {
  res.json({
    ok: true,
    time: nowLocal(),
    mitras: get('SELECT COUNT(*) AS n FROM mitras').n,
    pickups: get('SELECT COUNT(*) AS n FROM pickups').n,
  });
}));

r.use(requireAuth);

/* -------------------------------- bootstrap ------------------------------- */
r.get('/bootstrap', wrap((req, res) => {
  const t = today();
  const materials = all('SELECT * FROM materials WHERE is_active = 1 ORDER BY sort, name');
  const byMaterial = {};
  for (const m of materials) {
    m.price = currentPrice(m.id, t);
    byMaterial[m.id] = m.price;
  }
  const vehicles = all('SELECT * FROM vehicles WHERE is_active = 1 ORDER BY plate');
  const fuel_prices = {};
  for (const f of all('SELECT DISTINCT fuel_type FROM fuel_prices')) {
    fuel_prices[f.fuel_type] = currentFuelPrice(f.fuel_type, t);
  }
  const users = all(
    'SELECT id, name, role, username, area, phone FROM users WHERE is_active = 1 ORDER BY name',
  );
  const areas = all(
    "SELECT DISTINCT area FROM mitras WHERE area IS NOT NULL AND TRIM(area) <> '' ORDER BY area",
  ).map((x) => x.area);
  const placeholders = SETTING_WHITELIST.map(() => '?').join(',');
  const settings = {};
  for (const s of all(`SELECT key, value FROM settings WHERE key IN (${placeholders})`, SETTING_WHITELIST)) {
    if (/secret|password/i.test(s.key)) continue;
    settings[s.key] = s.value;
  }
  res.json({ materials, prices: { byMaterial }, vehicles, fuel_prices, users, areas, settings, now: nowLocal() });
}));

/* -------------------------------- materials ------------------------------- */
r.get('/materials', wrap((req, res) => {
  const rows = all('SELECT * FROM materials ORDER BY sort, name');
  res.json({ materials: rows.map(withPrice) });
}));

r.post('/materials', managerOnly, wrap((req, res) => {
  const b = req.body || {};
  requireFields(b, ['name']);
  const code = normalizeCode(b.code);
  if (get('SELECT id FROM materials WHERE code = ?', [code])) {
    throw badRequest(`Kode material ${code} sudah dipakai.`);
  }
  if (!CATEGORIES.includes(b.category)) throw badRequest('Kategori harus kertas atau jelantah.');
  const expectedUnit = UNIT_FOR[b.category];
  const unit = b.unit === undefined || String(b.unit).trim() === '' ? expectedUnit : String(b.unit).trim();
  if (unit !== expectedUnit) throw badRequest(`Unit untuk kategori ${b.category} harus ${expectedUnit}.`);
  const defaultPrice = b.default_price === undefined || b.default_price === null || b.default_price === ''
    ? 0
    : priceValue(b.default_price, 'Harga dasar');
  const id = tx(() => {
    const info = run(
      `INSERT INTO materials (code, name, category, unit, default_price, sort, is_active, notes)
       VALUES (?,?,?,?,?,?,?,?)`,
      [code, str(b.name, 120), b.category, unit, defaultPrice, int(b.sort, 0), b.is_active === false ? 0 : 1,
        str(b.notes, 400)],
    );
    run(
      'INSERT INTO price_lists (material_id, price, effective_from, created_by, note) VALUES (?,?,?,?,?)',
      [info.lastInsertRowid, defaultPrice, today(), req.user.id, 'Harga awal saat material dibuat'],
    );
    return info.lastInsertRowid;
  })();
  audit(req.user.id, 'material.create', 'material', id, { code, category: b.category, default_price: defaultPrice });
  res.status(201).json({ material: withPrice(get('SELECT * FROM materials WHERE id = ?', [id])) });
}));

r.put('/materials/:id', managerOnly, wrap((req, res) => {
  const m = get('SELECT * FROM materials WHERE id = ?', [req.params.id]);
  if (!m) throw badRequest('Material tidak ditemukan.');
  const b = req.body || {};
  const code = b.code === undefined ? m.code : normalizeCode(b.code);
  if (code !== m.code && get('SELECT id FROM materials WHERE code = ? AND id <> ?', [code, m.id])) {
    throw badRequest(`Kode material ${code} sudah dipakai.`);
  }
  const category = b.category === undefined ? m.category : b.category;
  if (!CATEGORIES.includes(category)) throw badRequest('Kategori harus kertas atau jelantah.');
  const expectedUnit = UNIT_FOR[category];
  const unit = b.unit === undefined || String(b.unit).trim() === '' ? m.unit : String(b.unit).trim();
  if (unit !== expectedUnit) throw badRequest(`Unit untuk kategori ${category} harus ${expectedUnit}.`);
  const defaultPrice = b.default_price === undefined || b.default_price === null || b.default_price === ''
    ? m.default_price
    : priceValue(b.default_price, 'Harga dasar');
  run(
    `UPDATE materials SET code = ?, name = ?, category = ?, unit = ?, default_price = ?, sort = ?, notes = ?
      WHERE id = ?`,
    [
      code,
      b.name === undefined ? m.name : str(b.name, 120) || m.name,
      category,
      unit,
      defaultPrice,
      b.sort === undefined ? m.sort : int(b.sort, m.sort),
      b.notes === undefined ? m.notes : str(b.notes, 400),
      m.id,
    ],
  );
  audit(req.user.id, 'material.update', 'material', m.id, { code, category });
  res.json({ material: withPrice(get('SELECT * FROM materials WHERE id = ?', [m.id])) });
}));

r.post('/materials/:id/toggle', managerOnly, wrap((req, res) => {
  const m = get('SELECT * FROM materials WHERE id = ?', [req.params.id]);
  if (!m) throw badRequest('Material tidak ditemukan.');
  const next = m.is_active ? 0 : 1;
  run('UPDATE materials SET is_active = ? WHERE id = ?', [next, m.id]);
  audit(req.user.id, 'material.toggle', 'material', m.id, { is_active: next });
  res.json({ material: withPrice(get('SELECT * FROM materials WHERE id = ?', [m.id])) });
}));

/* --------------------------------- prices --------------------------------- */
r.get('/prices', wrap((req, res) => {
  const where = [];
  const params = [];
  if (req.query.material_id) {
    where.push('pl.material_id = ?');
    params.push(Number(req.query.material_id));
  }
  const from = dateOrToday(req.query.from);
  if (from) {
    where.push('pl.effective_from >= ?');
    params.push(from);
  }
  const to = dateOrToday(req.query.to);
  if (to) {
    where.push('pl.effective_from <= ?');
    params.push(to);
  }
  const rows = all(
    `SELECT pl.id, pl.material_id, pl.price, pl.effective_from, pl.created_by, pl.note,
            m.code AS material_code, m.name AS material_name, m.category, m.unit, u.name AS created_by_name
       FROM price_lists pl
       JOIN materials m ON m.id = pl.material_id
       LEFT JOIN users u ON u.id = pl.created_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY pl.effective_from DESC, pl.id DESC LIMIT 500`,
    params,
  );
  res.json({ prices: rows });
}));

r.post('/prices', managerOnly, wrap((req, res) => {
  const b = req.body || {};
  requireFields(b, ['material_id', 'price']);
  const material = get('SELECT id FROM materials WHERE id = ?', [Number(b.material_id)]);
  if (!material) throw badRequest('Material tidak ditemukan.');
  const price = priceValue(b.price, 'Harga');
  const effective_from = dateOrToday(b.effective_from) || today();
  const sameDay = get('SELECT id FROM price_lists WHERE material_id = ? AND effective_from = ?', [material.id, effective_from]);
  if (sameDay) {
    run('UPDATE price_lists SET price = ?, created_by = ?, note = ? WHERE id = ?', [price, req.user.id, str(b.note, 300), sameDay.id]);
    run('UPDATE materials SET default_price = ? WHERE id = ?', [price, material.id]);
    audit(req.user.id, 'price.revise', 'price', sameDay.id, { material_id: material.id, price, effective_from });
    return res.json({
      price: get('SELECT * FROM price_lists WHERE id = ?', [sameDay.id]),
      replaced: true,
      note: 'Harga tanggal ini diperbarui; riwayat tanggal sebelumnya tetap tersimpan.',
    });
  }
  const info = run(
    'INSERT INTO price_lists (material_id, price, effective_from, created_by, note) VALUES (?,?,?,?,?)',
    [material.id, price, effective_from, req.user.id, str(b.note, 300)],
  );
  audit(req.user.id, 'price.create', 'price', info.lastInsertRowid, {
    material_id: material.id, price, effective_from,
  });
  res.status(201).json({
    price: get(
      `SELECT pl.id, pl.material_id, pl.price, pl.effective_from, pl.created_by, pl.note,
              m.code AS material_code, m.name AS material_name, u.name AS created_by_name
         FROM price_lists pl JOIN materials m ON m.id = pl.material_id
         LEFT JOIN users u ON u.id = pl.created_by WHERE pl.id = ?`,
      [info.lastInsertRowid],
    ),
  });
}));

/* -------------------------------- vehicles -------------------------------- */
r.get('/vehicles', wrap((req, res) => {
  const vehicles = all('SELECT * FROM vehicles ORDER BY is_active DESC, plate');
  const links = all(
    `SELECT pv.vehicle_id AS vehicle_id, pv.km_start, pv.km_end, pv.liters AS liters_manual, pv.cost AS cost_manual,
            p.date, p.distance_km, v.fuel_type, v.consumption_km_per_l,
            (SELECT COUNT(*) FROM pickup_vehicles pv2 WHERE pv2.pickup_id = pv.pickup_id) AS vehicle_count
       FROM pickup_vehicles pv
       JOIN pickups p ON p.id = pv.pickup_id AND p.status <> 'batal'
       JOIN vehicles v ON v.id = pv.vehicle_id`,
  );
  const stats = {};
  for (const link of links) {
    const s = (stats[link.vehicle_id] ||= { runs: 0, km: 0, liters: 0, cost: 0, last_run: null });
    const odometer = link.km_start != null && link.km_end != null && link.km_end >= link.km_start
      ? link.km_end - link.km_start : null;
    // Satu pengambilan bisa memakai beberapa mobil: jarak tercatat dibagi rata bila spido tidak diisi.
    const km = odometer ?? (link.distance_km ? link.distance_km / (link.vehicle_count || 1) : 0);
    const liters = link.liters_manual ?? km / (link.consumption_km_per_l || 10);
    s.runs += 1;
    s.km += km;
    s.liters += liters;
    s.cost += link.cost_manual ?? liters * currentFuelPrice(link.fuel_type, link.date);
    if (!s.last_run || link.date > s.last_run) s.last_run = link.date;
  }
  res.json({
    vehicles: vehicles.map((v) => {
      const s = stats[v.id];
      return {
        ...v,
        runs: s ? s.runs : 0,
        last_run: s ? s.last_run : null,
        total_km: s ? round2(s.km) : 0,
        total_liters: s ? round2(s.liters) : 0,
        total_cost: s ? rupiah(s.cost) : 0,
      };
    }),
  });
}));

r.post('/vehicles', managerOnly, wrap((req, res) => {
  const b = req.body || {};
  requireFields(b, ['plate', 'name']);
  const plate = normalizePlate(b.plate);
  if (get('SELECT id FROM vehicles WHERE plate = ?', [plate])) {
    throw badRequest(`Nomor polisi ${plate} sudah terdaftar.`);
  }
  const type = b.type === undefined || String(b.type).trim() === '' ? 'mobil' : String(b.type);
  if (!VEHICLE_TYPES.includes(type)) throw badRequest(`Tipe kendaraan tidak dikenali. Pilihan: ${VEHICLE_TYPES.join(', ')}.`);
  const info = run(
    `INSERT INTO vehicles (plate, name, type, fuel_type, consumption_km_per_l, capacity_kg, km_running, is_active, notes)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      plate, str(b.name, 80), type, fuelTypeOr(b.fuel_type, 'pertalite'),
      consumptionValue(b.consumption_km_per_l), capacityValue(b.capacity_kg), kmRunningValue(b.km_running),
      b.is_active === false ? 0 : 1, str(b.notes, 400),
    ],
  );
  audit(req.user.id, 'vehicle.create', 'vehicle', info.lastInsertRowid, { plate, type });
  res.status(201).json({ vehicle: get('SELECT * FROM vehicles WHERE id = ?', [info.lastInsertRowid]) });
}));

r.put('/vehicles/:id', managerOnly, wrap((req, res) => {
  const v = get('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
  if (!v) throw badRequest('Kendaraan tidak ditemukan.');
  const b = req.body || {};
  const plate = b.plate === undefined ? v.plate : normalizePlate(b.plate);
  if (plate !== v.plate && get('SELECT id FROM vehicles WHERE plate = ? AND id <> ?', [plate, v.id])) {
    throw badRequest(`Nomor polisi ${plate} sudah terdaftar.`);
  }
  const type = b.type === undefined || String(b.type).trim() === '' ? v.type : String(b.type);
  if (!VEHICLE_TYPES.includes(type)) throw badRequest(`Tipe kendaraan tidak dikenali. Pilihan: ${VEHICLE_TYPES.join(', ')}.`);
  run(
    `UPDATE vehicles SET plate = ?, name = ?, type = ?, fuel_type = ?, consumption_km_per_l = ?,
                          capacity_kg = ?, km_running = ?, notes = ? WHERE id = ?`,
    [
      plate,
      b.name === undefined ? v.name : str(b.name, 80) || v.name,
      type,
      b.fuel_type === undefined ? v.fuel_type : fuelTypeOr(b.fuel_type, v.fuel_type),
      b.consumption_km_per_l === undefined ? v.consumption_km_per_l : consumptionValue(b.consumption_km_per_l),
      b.capacity_kg === undefined ? v.capacity_kg : capacityValue(b.capacity_kg),
      b.km_running === undefined ? v.km_running : kmRunningValue(b.km_running),
      b.notes === undefined ? v.notes : str(b.notes, 400),
      v.id,
    ],
  );
  audit(req.user.id, 'vehicle.update', 'vehicle', v.id, { plate, type });
  res.json({ vehicle: get('SELECT * FROM vehicles WHERE id = ?', [v.id]) });
}));

r.post('/vehicles/:id/toggle', managerOnly, wrap((req, res) => {
  const v = get('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
  if (!v) throw badRequest('Kendaraan tidak ditemukan.');
  const next = v.is_active ? 0 : 1;
  run('UPDATE vehicles SET is_active = ? WHERE id = ?', [next, v.id]);
  audit(req.user.id, 'vehicle.toggle', 'vehicle', v.id, { is_active: next });
  res.json({ vehicle: get('SELECT * FROM vehicles WHERE id = ?', [v.id]) });
}));

/* ------------------------------- fuel prices ------------------------------ */
r.get('/fuel-prices', wrap((req, res) => {
  const ft = req.query.fuel_type ? String(req.query.fuel_type).trim().toLowerCase() : null;
  const params = [];
  let where = '';
  if (ft) {
    where = 'WHERE fp.fuel_type = ?';
    params.push(ft);
  }
  const rows = all(
    `SELECT fp.id, fp.fuel_type, fp.price_per_liter, fp.effective_from, fp.created_by, fp.note,
            u.name AS created_by_name
       FROM fuel_prices fp LEFT JOIN users u ON u.id = fp.created_by
      ${where} ORDER BY fp.effective_from DESC, fp.id DESC LIMIT 500`,
    params,
  );
  res.json({ fuel_prices: rows });
}));

r.post('/fuel-prices', managerOnly, wrap((req, res) => {
  const b = req.body || {};
  requireFields(b, ['fuel_type', 'price_per_liter']);
  const fuel_type = fuelTypeOr(b.fuel_type);
  const price = num(b.price_per_liter, null);
  if (price === null || !Number.isInteger(price) || price <= 0) {
    throw badRequest('Harga BBM per liter harus angka bulat lebih dari nol.');
  }
  const effective_from = dateOrToday(b.effective_from) || today();
  const info = run(
    'INSERT INTO fuel_prices (fuel_type, price_per_liter, effective_from, created_by, note) VALUES (?,?,?,?,?)',
    [fuel_type, price, effective_from, req.user.id, str(b.note, 300)],
  );
  audit(req.user.id, 'fuel_price.create', 'fuel_price', info.lastInsertRowid, {
    fuel_type, price_per_liter: price, effective_from,
  });
  res.status(201).json({
    fuel_price: get(
      `SELECT fp.id, fp.fuel_type, fp.price_per_liter, fp.effective_from, fp.created_by, fp.note,
              u.name AS created_by_name FROM fuel_prices fp LEFT JOIN users u ON u.id = fp.created_by
             WHERE fp.id = ?`,
      [info.lastInsertRowid],
    ),
  });
}));

/* --------------------------------- settings ------------------------------- */
const settingsObject = () => {
  const obj = {};
  for (const s of all('SELECT key, value FROM settings ORDER BY key')) obj[s.key] = s.value;
  return obj;
};

r.get('/settings', managerOnly, wrap((req, res) => {
  res.json({ settings: settingsObject() });
}));

r.put('/settings', managerOnly, wrap((req, res) => {
  const body = req.body || {};
  const keys = Object.keys(body);
  if (!keys.length) throw badRequest('Tidak ada perubahan yang dikirim.');
  for (const key of keys) {
    if (/secret|password/i.test(key) || !SETTINGS_PREFIXES.some((p) => key.startsWith(p))) {
      throw badRequest(`Kunci pengaturan "${key}" tidak diizinkan untuk diubah.`);
    }
  }
  const updated = {};
  for (const key of keys) {
    const value = body[key];
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    setSetting(key, raw);
    updated[key] = raw;
  }
  audit(req.user.id, 'settings.update', 'setting', null, { keys });
  res.json({ settings: updated });
}));

/* ---------------------------------- audit --------------------------------- */
r.get('/audit', managerOnly, wrap((req, res) => {
  let limit = int(req.query.limit, 100);
  if (limit < 1) limit = 100;
  if (limit > 300) limit = 300;
  const where = [];
  const params = [];
  if (req.query.user_id) {
    where.push('a.user_id = ?');
    params.push(Number(req.query.user_id));
  }
  if (req.query.entity) {
    where.push('a.entity = ?');
    params.push(String(req.query.entity));
  }
  const rows = all(
    `SELECT a.id, a.user_id, u.name AS user_name, a.action, a.entity, a.entity_id, a.meta, a.created_at
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY a.id DESC LIMIT ?`,
    [...params, limit],
  );
  res.json({ audit: rows.map((a) => ({ ...a, meta: parseMeta(a.meta) })) });
}));

export default r;
