import { all, currentFuelPrice, get, round2, run, rupiah, currentPrice } from '../db/index.js';
import { routeLength } from './geo.js';

/** Hitung bersih & nilai untuk satu baris timbangan. */
export function computeItem({ gross = 0, tare = 0, minusPct = 0, unitPrice = 0 }) {
  const afterTare = Math.max(0, round2(gross - tare));
  const net = round2(afterTare * (1 - Math.min(100, Math.max(0, minusPct || 0)) / 100));
  return { net_weight: net, amount: rupiah(net * unitPrice) };
}

export function persistItem(itemId, fields) {
  const c = computeItem({
    gross: fields.gross_weight,
    tare: fields.tare_weight,
    minusPct: fields.minus_pct,
    unitPrice: fields.unit_price,
  });
  run('UPDATE pickup_items SET net_weight = ?, amount = ? WHERE id = ?', [c.net_weight, c.amount, itemId]);
  return c;
}

/** Total berat per kategori, nilai rupiah, dan rincian material untuk satu pengambilan. */
export function pickupTotals(pickupId) {
  const rows = all(
    `SELECT pi.id, pi.line_no, pi.material_id, pi.net_weight, pi.unit_price, pi.amount, pi.gross_weight, pi.tare_weight, pi.minus_pct,
            pi.weighed_by, pi.mitra_witness, pi.note,
            m.name AS material_name, m.code AS material_code, m.category, m.unit, m.sort
       FROM pickup_items pi JOIN materials m ON m.id = pi.material_id
      WHERE pi.pickup_id = ? ORDER BY pi.line_no, pi.id`,
    [pickupId],
  );
  let paperKg = 0;
  let oilLiter = 0;
  let amount = 0;
  let paperAmount = 0;
  let oilAmount = 0;
  for (const r of rows) {
    amount += r.amount;
    if (r.category === 'kertas') {
      paperKg += r.net_weight;
      paperAmount += r.amount;
    } else {
      oilLiter += r.net_weight;
      oilAmount += r.amount;
    }
  }
  return {
    items: rows,
    lines: rows.length,
    paper_kg: round2(paperKg),
    oil_liters: round2(oilLiter),
    paper_amount: rupiah(paperAmount),
    oil_amount: rupiah(oilAmount),
    total_amount: rupiah(amount),
    avg_price_paper: paperKg > 0 ? rupiah(paperAmount / paperKg) : 0,
    avg_price_oil: oilLiter > 0 ? rupiah(oilAmount / oilLiter) : 0,
  };
}

/** Estimasi kebutuhan BBM satu pengambilan.
 *  Prioritas: (1) isian manual, (2) selisih km arus (spido), (3) jarak GPS dari titik tracking. */
export function fuelEstimate(pickup) {
  const vehicles = all(
    `SELECT pv.id, pv.vehicle_id, pv.km_start, pv.km_end, pv.liters AS liters_manual, pv.cost AS cost_manual,
            v.plate, v.name, v.type, v.fuel_type, v.consumption_km_per_l, v.capacity_kg
       FROM pickup_vehicles pv JOIN vehicles v ON v.id = pv.vehicle_id
      WHERE pv.pickup_id = ?`,
    [pickup.id],
  );
  const gpsMeters = (() => {
    const pts = all(
      'SELECT lat, lng FROM tracking_points WHERE pickup_id = ? ORDER BY recorded_at, id',
      [pickup.id],
    ).map((p) => [p.lat, p.lng]);
    return pts.length > 1 ? routeLength(pts) : 0;
  })();

  let totalKm = 0;
  let totalLiters = 0;
  let totalCost = 0;
  let kmSource = 'gps';
  const detail = [];

  for (const v of vehicles) {
    const odometer =
      v.km_start !== null && v.km_end !== null && v.km_end >= v.km_start ? round2(v.km_end - v.km_start) : null;
    if (odometer !== null) kmSource = 'odometer';
    const km = odometer ?? round2(gpsMeters / 1000);
    const consumption = v.consumption_km_per_l > 0 ? v.consumption_km_per_l : 10;
    const price = currentFuelPrice(v.fuel_type, pickup.date);
    const liters = round2((v.liters_manual ?? km / consumption));
    const cost = rupiah(v.cost_manual ?? liters * price);
    totalKm += km;
    totalLiters += liters;
    totalCost += cost;
    detail.push({
      vehicle_id: v.vehicle_id, id: v.id, plate: v.plate, name: v.name, type: v.type,
      fuel_type: v.fuel_type, consumption_km_per_l: consumption, km_start: v.km_start, km_end: v.km_end,
      distance_km: km, liters, price_per_liter: price, cost, override: v.liters_manual !== null || v.cost_manual !== null,
    });
  }

  return {
    vehicles: detail,
    vehicle_count: detail.length,
    distance_km: round2(pickup.cost_source === 'manual' && pickup.distance_km ? pickup.distance_km : totalKm),
    gps_distance_km: round2(gpsMeters / 1000),
    km_source: pickup.cost_source === 'manual' ? 'manual' : kmSource,
    fuel_liters: round2(pickup.cost_source === 'manual' && pickup.fuel_liters ? pickup.fuel_liters : totalLiters),
    fuel_cost: rupiah(pickup.cost_source === 'manual' && pickup.fuel_cost ? pickup.fuel_cost : totalCost),
  };
}

/** Simpan hasil estimasi ke header pickup agar laporan cepat dibaca. */
export function syncPickupCosts(pickupId) {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [pickupId]);
  if (!pickup) return null;
  const est = fuelEstimate(pickup);
  run(
    `UPDATE pickups SET distance_km = ?, fuel_liters = ?, fuel_cost = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
    [est.distance_km, est.fuel_liters, est.fuel_cost, pickupId],
  );
  return est;
}

/** Harga + satuan untuk seluruh material pada tanggal tertentu (dipakai form timbangan). */
export function priceTable(dateStr) {
  return all('SELECT id, code, name, category, unit, default_price FROM materials WHERE is_active = 1 ORDER BY sort, name')
    .map((m) => ({ ...m, price: currentPrice(m.id, dateStr) }));
}
