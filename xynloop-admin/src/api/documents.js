import { Router } from 'express';
import { all, audit, get, nextDocNumber, nowLocal, run, setting, today } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, dateOrToday, phoneOrNull, requireFields, str, wrap } from '../lib/http.js';
import { isManager } from '../lib/permissions.js';
import { pickupTotals } from '../lib/calc.js';
import { photosFor, savePhotos } from '../lib/attachments.js';
import { renderKwitansi, renderPenawaran } from '../print/documents.js';

const r = Router();

/** Rincian beku dokumen, agar kwitansi tersimpan tidak berubah ketika harga diperbarui. */
function snapshotForPickup(pickupId) {
  const pickup = get('SELECT * FROM pickups WHERE id = ?', [pickupId]);
  if (!pickup) throw badRequest('Pengambilan tidak ditemukan.');
  const mitra = get('SELECT * FROM mitras WHERE id = ?', [pickup.mitra_id]);
  const totals = pickupTotals(pickupId);
  return {
    pickup_id: pickup.id,
    pickup_code: pickup.code,
    date: pickup.date,
    mitra,
    lines: totals.items.map((it, i) => ({
      no: i + 1,
      material_id: it.material_id,
      code: it.material_code,
      name: it.material_name,
      category: it.category,
      unit: it.unit,
      gross_weight: it.gross_weight,
      tare_weight: it.tare_weight,
      minus_pct: it.minus_pct,
      qty: it.net_weight,
      unit_price: it.unit_price,
      amount: it.amount,
    })),
    paper_kg: totals.paper_kg,
    oil_liters: totals.oil_liters,
    total: totals.total_amount,
  };
}

r.get('/receipts/preview', requireAuth, wrap((req, res) => {
  const snap = snapshotForPickup(Number(req.query.pickup_id));
  res.json({
    snapshot: snap,
    suggested_number: nextDocNumber('receipt', snap.date),
    default_seller: {
      name: snap.mitra.contact_person || snap.mitra.name,
      address: snap.mitra.address,
      phone: snap.mitra.phone,
    },
    staff: { name: setting('receipt.staff_name'), title: setting('receipt.staff_title') },
    note: setting('receipt.note'),
    exists: get("SELECT id FROM receipts WHERE pickup_id = ? AND status <> 'batal'", [snap.pickup_id]) || null,
  });
}));

r.get('/receipts', requireAuth, wrap((req, res) => {
  const where = [];
  const params = [];
  if (!isManager(req.user.role)) {
    where.push(`(EXISTS (SELECT 1 FROM pickups pp WHERE pp.id = rc.pickup_id
                  AND (pp.lead_user_id = ? OR pp.created_by = ?
                       OR EXISTS (SELECT 1 FROM pickup_crew cc WHERE cc.pickup_id = pp.id AND cc.user_id = ?)))
                 OR m.source_user_id = ?)`);
    params.push(req.user.id, req.user.id, req.user.id, req.user.id);
  }
  if (req.query.status) { where.push('rc.status = ?'); params.push(String(req.query.status)); }
  if (req.query.mitra_id) { where.push('rc.mitra_id = ?'); params.push(Number(req.query.mitra_id)); }
  if (req.query.from) { where.push('rc.issued_at >= ?'); params.push(dateOrToday(req.query.from)); }
  if (req.query.to) { where.push('rc.issued_at <= ?'); params.push(dateOrToday(req.query.to)); }
  if (req.query.method) { where.push('rc.method = ?'); params.push(String(req.query.method)); }
  if (req.query.q) {
    where.push('(LOWER(COALESCE(rc.number,"")) LIKE ? OR LOWER(m.name) LIKE ? OR LOWER(COALESCE(rc.seller_name,"")) LIKE ?)');
    const like = `%${String(req.query.q).toLowerCase()}%`;
    params.push(like, like, like);
  }
  const limit = Math.min(400, Number(req.query.limit) || 150);
  const rows = all(
    `SELECT rc.*, m.name AS mitra_name, m.code AS mitra_code, p.code AS pickup_code, p.date AS pickup_date,
            u.name AS created_by_name,
            COALESCE(json_extract(rc.snapshot,'$.paper_kg'),0) AS paper_kg,
            COALESCE(json_extract(rc.snapshot,'$.oil_liters'),0) AS oil_liters
       FROM receipts rc JOIN mitras m ON m.id = rc.mitra_id
       LEFT JOIN pickups p ON p.id = rc.pickup_id
       LEFT JOIN users u ON u.id = rc.created_by
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY rc.issued_at DESC, rc.id DESC LIMIT ${limit}`,
    params,
  );
  const sum = rows.reduce((s, x) => s + (x.status === 'batal' ? 0 : x.total), 0);
  res.json({ receipts: rows, total_shown: sum });
}));

r.get('/receipts/:id', requireAuth, wrap((req, res) => {
  const rc = get(
    `SELECT rc.*, m.name AS mitra_name, m.code AS mitra_code, p.code AS pickup_code, p.date AS pickup_date
       FROM receipts rc JOIN mitras m ON m.id = rc.mitra_id LEFT JOIN pickups p ON p.id = rc.pickup_id
      WHERE rc.id = ?`,
    [req.params.id],
  );
  if (!rc) throw badRequest('Kwitansi tidak ditemukan.');
  res.json({ receipt: rc, snapshot: rc.snapshot ? JSON.parse(rc.snapshot) : null, photos: photosFor('kwitansi', rc.id) });
}));

r.post('/receipts', requireAuth, wrap((req, res) => {
  const pickupId = Number(req.body?.pickup_id);
  const snap = snapshotForPickup(pickupId);
  const existing = get("SELECT id, number, status FROM receipts WHERE pickup_id = ? AND status <> 'batal'", [pickupId]);
  if (existing) throw badRequest(`Kwitansi ${existing.number} sudah dibuat untuk pengambilan ini.`);
  if (snap.lines.length === 0) throw badRequest('Belum ada hasil timbangan yang dapat dikwitansi.');
  const issuedAt = dateOrToday(req.body.issued_at) || snap.date;
  const number = str(req.body.number, 40) || nextDocNumber('receipt', issuedAt);
  if (get('SELECT id FROM receipts WHERE number = ?', [number])) throw badRequest('Nomor kwitansi sudah dipakai.');
  const info = run(
    `INSERT INTO receipts (number, pickup_id, mitra_id, issued_at, method, total, seller_name, seller_address,
                           seller_phone, staff_name, staff_title, status, created_by, snapshot, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [number, pickupId, snap.mitra.id, issuedAt, req.body.method === 'transfer' ? 'transfer' : 'tunai', snap.total,
      str(req.body.seller_name, 80) || snap.mitra.contact_person || snap.mitra.name,
      str(req.body.seller_address, 200) || snap.mitra.address,
      phoneOrNull(req.body.seller_phone) || snap.mitra.phone,
      str(req.body.staff_name, 60) || setting('receipt.staff_name'),
      str(req.body.staff_title, 60) || setting('receipt.staff_title'),
      'draf', req.user.id, JSON.stringify(snap), nowLocal(), nowLocal()],
  );
  audit(req.user.id, 'receipt.create', 'receipt', info.lastInsertRowid, { number, total: snap.total });
  res.status(201).json({ receipt: get('SELECT * FROM receipts WHERE id = ?', [info.lastInsertRowid]) });
}));

r.put('/receipts/:id', requireAuth, wrap((req, res) => {
  const rc = get('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
  if (!rc) throw badRequest('Kwitansi tidak ditemukan.');
  if (rc.status === 'lunas' && !isManager(req.user.role)) throw badRequest('Kwitansi sudah lunas; hanya admin yang dapat mengubah.');
  const b = req.body || {};
  if (b.number && b.number !== rc.number && get('SELECT id FROM receipts WHERE number = ? AND id <> ?', [b.number, rc.id])) {
    throw badRequest('Nomor kwitansi sudah dipakai dokumen lain.');
  }
  run(
    `UPDATE receipts SET seller_name=?, seller_address=?, seller_phone=?, method=?, staff_name=?, staff_title=?,
            number=?, updated_at=? WHERE id=?`,
    [
      b.seller_name === undefined ? rc.seller_name : str(b.seller_name, 80),
      b.seller_address === undefined ? rc.seller_address : str(b.seller_address, 200),
      b.seller_phone === undefined ? rc.seller_phone : phoneOrNull(b.seller_phone),
      ['tunai', 'transfer'].includes(b.method) ? b.method : rc.method,
      b.staff_name === undefined ? rc.staff_name : str(b.staff_name, 60),
      b.staff_title === undefined ? rc.staff_title : str(b.staff_title, 60),
      b.number === undefined || b.number === rc.number ? rc.number : str(b.number, 40),
      nowLocal(), rc.id,
    ],
  );
  if (b.number && b.number !== rc.number && get('SELECT id FROM receipts WHERE number = ? AND id <> ?', [b.number, rc.id])) {
    throw badRequest('Nomor kwitansi sudah dipakai dokumen lain.');
  }
  audit(req.user.id, 'receipt.update', 'receipt', rc.id);
  res.json({ receipt: get('SELECT * FROM receipts WHERE id = ?', [rc.id]) });
}));

r.post('/receipts/:id/status', requireAuth, wrap((req, res) => {
  const rc = get('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
  if (!rc) throw badRequest('Kwitansi tidak ditemukan.');
  const status = str(req.body?.status, 12);
  if (!['draf', 'terbit', 'lunas', 'batal'].includes(status)) throw badRequest('Status kwitansi tidak dikenali.');
  if (status === 'batal' && !isManager(req.user.role)) throw badRequest('Hanya admin yang dapat membatalkan kwitansi.');
  run('UPDATE receipts SET status=?, updated_at=?, paid_at=?, void_reason=? WHERE id=?', [
    status, nowLocal(),
    status === 'lunas' ? nowLocal() : null,
    status === 'batal' ? str(req.body?.reason, 200) || 'Dibatalkan' : null,
    rc.id,
  ]);
  audit(req.user.id, 'receipt.status', 'receipt', rc.id, { from: rc.status, to: status });
  res.json({ receipt: get('SELECT * FROM receipts WHERE id = ?', [rc.id]) });
}));

r.post('/receipts/:id/photos', requireAuth, wrap((req, res) => {
  const rc = get('SELECT id FROM receipts WHERE id = ?', [req.params.id]);
  if (!rc) throw badRequest('Kwitansi tidak ditemukan.');
  res.status(201).json({ photos: savePhotos(req, 'kwitansi', rc.id, req.body?.photos) });
}));

/* =============================== SURAT PENAWARAN =============================== */

r.get('/offers', requireAuth, wrap((req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) { where.push('o.status = ?'); params.push(String(req.query.status)); }
  if (req.query.mitra_id) { where.push('o.mitra_id = ?'); params.push(Number(req.query.mitra_id)); }
  if (req.query.from) { where.push('o.issued_at >= ?'); params.push(dateOrToday(req.query.from)); }
  if (req.query.to) { where.push('o.issued_at <= ?'); params.push(dateOrToday(req.query.to)); }
  if (req.query.q) {
    where.push('(LOWER(COALESCE(o.number,"")) LIKE ? OR LOWER(m.name) LIKE ?)');
    const like = `%${String(req.query.q).toLowerCase()}%`;
    params.push(like, like);
  }
  const limit = Math.min(400, Number(req.query.limit) || 150);
  res.json({
    offers: all(
      `SELECT o.*, m.name AS mitra_name, m.code AS mitra_code, m.status AS mitra_status, m.area AS mitra_area,
              u.name AS created_by_name
         FROM offers o JOIN mitras m ON m.id = o.mitra_id LEFT JOIN users u ON u.id = o.created_by
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY o.issued_at DESC, o.id DESC LIMIT ${limit}`,
      params,
    ),
    counts: all('SELECT status, COUNT(*) AS n FROM offers GROUP BY status'),
  });
}));

r.get('/offers/next-number', requireAuth, wrap((req, res) => {
  res.json({ number: nextDocNumber('offer', dateOrToday(req.query.date) || today()) });
}));

r.get('/offers/preview', requireAuth, wrap((req, res) => {
  const mitra = get('SELECT * FROM mitras WHERE id = ?', [req.query.mitra_id]);
  if (!mitra) throw badRequest('Pilih mitra terlebih dahulu.');
  const date = dateOrToday(req.query.date) || today();
  const def = offerDefaults(mitra, date);
  res.json({
    number: nextDocNumber('offer', date),
    defaults: def,
    start_date: nextWeekday(date, def.schedule_day),
    clauses: setting('offer.clauses') ? JSON.parse(setting('offer.clauses')) : [],
    subject: setting('offer.subject'),
    mitra,
  });
}));

r.get('/offers/:id', requireAuth, wrap((req, res) => {
  const o = get(
    `SELECT o.*, m.name AS mitra_name, m.code AS mitra_code, m.address AS mitra_address, m.area AS mitra_area,
            m.phone AS mitra_phone, m.contact_person AS mitra_contact, u.name AS created_by_name
       FROM offers o JOIN mitras m ON m.id = o.mitra_id LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ?`,
    [req.params.id],
  );
  if (!o) throw badRequest('Surat penawaran tidak ditemukan.');
  res.json({ offer: o, mitra: get('SELECT * FROM mitras WHERE id = ?', [o.mitra_id]), photos: photosFor('penawaran', o.id) });
}));

function offerDefaults(mitra, date) {
  return {
    category: ['kertas', 'jelantah', 'campur'].includes(mitra.category) ? mitra.category : 'kertas',
    schedule_day: mitra.schedule_day || setting('offer.day', 'Jumat'),
    schedule_time: mitra.schedule_time || setting('offer.time', '10.00 WIB'),
    issued_at: date,
    signed_by_name: setting('offer.signatory_name'),
    signed_by_title: setting('offer.signatory_title'),
  };
}

/** Tanggal pengambilan rutin berikutnya pada hari yang disebutkan (untuk klausul "mulai ..."). */
function nextWeekday(fromDate, dayName) {
  const days = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
  const target = days.indexOf(String(dayName || 'jumat').toLowerCase().trim());
  if (target < 0) return fromDate;
  const d = new Date(`${fromDate}T00:00:00`);
  for (let i = 1; i <= 14; i++) {
    const c = new Date(d.getTime() + i * 86400000);
    if (c.getDay() === target) return c.toISOString().slice(0, 10);
  }
  return fromDate;
}

r.post('/offers', requireAuth, wrap((req, res) => {
  requireFields(req.body, ['mitra_id']);
  const mitra = get('SELECT * FROM mitras WHERE id = ?', [req.body.mitra_id]);
  if (!mitra) throw badRequest('Mitra tidak ditemukan.');
  const def = offerDefaults(mitra, today());
  const issuedAt = dateOrToday(req.body.issued_at) || today();
  const number = str(req.body.number, 40) || nextDocNumber('offer', issuedAt);
  if (get('SELECT id FROM offers WHERE number = ?', [number])) throw badRequest('Nomor surat sudah dipakai.');
  const info = run(
    `INSERT INTO offers (number, mitra_id, issued_at, category, schedule_day, schedule_time, start_date, status,
                         signed_by_name, signed_by_title, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [number, mitra.id, issuedAt, ['kertas', 'jelantah', 'campur'].includes(req.body.category) ? req.body.category : def.category,
      str(req.body.schedule_day, 20) || def.schedule_day, str(req.body.schedule_time, 20) || def.schedule_time,
      dateOrToday(req.body.start_date) || nextWeekday(issuedAt, str(req.body.schedule_day, 20) || def.schedule_day),
      'draf', str(req.body.signed_by_name, 60) || def.signed_by_name,
      str(req.body.signed_by_title, 60) || def.signed_by_title, req.user.id, nowLocal(), nowLocal()],
  );
  audit(req.user.id, 'offer.create', 'offer', info.lastInsertRowid, { number, mitra_id: mitra.id });
  res.status(201).json({ offer: get('SELECT * FROM offers WHERE id = ?', [info.lastInsertRowid]) });
}));

r.put('/offers/:id', requireAuth, wrap((req, res) => {
  const o = get('SELECT * FROM offers WHERE id = ?', [req.params.id]);
  if (!o) throw badRequest('Surat tidak ditemukan.');
  const b = req.body || {};
  if (b.number && b.number !== o.number && get('SELECT id FROM offers WHERE number = ? AND id <> ?', [b.number, o.id])) {
    throw badRequest('Nomor surat sudah dipakai dokumen lain.');
  }
  run(
    `UPDATE offers SET number=?, issued_at=?, category=?, schedule_day=?, schedule_time=?, start_date=?,
            signed_by_name=?, signed_by_title=?, updated_at=? WHERE id=?`,
    [
      b.number === undefined ? o.number : str(b.number, 40),
      b.issued_at === undefined ? o.issued_at : dateOrToday(b.issued_at) || o.issued_at,
      ['kertas', 'jelantah', 'campur'].includes(b.category) ? b.category : o.category,
      b.schedule_day === undefined ? o.schedule_day : str(b.schedule_day, 20),
      b.schedule_time === undefined ? o.schedule_time : str(b.schedule_time, 20),
      b.start_date === undefined ? o.start_date : dateOrToday(b.start_date),
      b.signed_by_name === undefined ? o.signed_by_name : str(b.signed_by_name, 60),
      b.signed_by_title === undefined ? o.signed_by_title : str(b.signed_by_title, 60),
      nowLocal(), o.id,
    ],
  );
  audit(req.user.id, 'offer.update', 'offer', o.id);
  res.json({ offer: get('SELECT * FROM offers WHERE id = ?', [o.id]) });
}));

r.post('/offers/:id/send', requireAuth, wrap((req, res) => {
  const o = get('SELECT * FROM offers WHERE id = ?', [req.params.id]);
  if (!o) throw badRequest('Surat tidak ditemukan.');
  run("UPDATE offers SET status='terkirim', sent_at=?, sent_via=?, updated_at=? WHERE id=?", [
    nowLocal(), str(req.body?.via, 20) || 'langsung', nowLocal(), o.id,
  ]);
  const mitra = get('SELECT * FROM mitras WHERE id = ?', [o.mitra_id]);
  if (mitra && mitra.status === 'prospek') {
    run("UPDATE mitras SET status='penawaran', updated_at=? WHERE id=?", [nowLocal(), mitra.id]);
  }
  run('INSERT INTO mitra_visits (mitra_id, user_id, visit_type, outcome, notes) VALUES (?,?,?,?,?)', [
    o.mitra_id, req.user.id, 'penawaran', 'lanjut', `Surat penawaran nomor ${o.number} disampaikan.`,
  ]);
  audit(req.user.id, 'offer.send', 'offer', o.id, { number: o.number });
  res.json({ offer: get('SELECT * FROM offers WHERE id = ?', [o.id]) });
}));

/** Rekam lembar tanggapan; bila bersedia, mitra otomatis naik status menjadi aktif. */
r.post('/offers/:id/response', requireAuth, wrap((req, res) => {
  const o = get('SELECT * FROM offers WHERE id = ?', [req.params.id]);
  if (!o) throw badRequest('Surat tidak ditemukan.');
  const choice = str(req.body?.choice, 12);
  if (!['bersedia', 'tidak'].includes(choice)) throw badRequest('Pilih tanggapan BERSEDIA atau TIDAK BERSEDIA.');
  const stamp = nowLocal();
  run(
    `UPDATE offers SET status=?, response_name=?, response_address=?, response_phone=?, response_choice=?,
            response_date=?, updated_at=? WHERE id=?`,
    [choice === 'bersedia' ? 'diterima' : 'ditolak',
      str(req.body?.name, 80) || o.response_name, str(req.body?.address, 200) || o.response_address,
      phoneOrNull(req.body?.phone) || o.response_phone, choice,
      dateOrToday(req.body?.date) || today(), stamp, o.id],
  );
  const mitra = get('SELECT * FROM mitras WHERE id = ?', [o.mitra_id]);
  let mitraHasCrew = false;
  if (choice === 'bersedia') {
    mitraHasCrew = !!mitra.crew_user_id;
    run("UPDATE mitras SET status='aktif', active_from=?, updated_at=? WHERE id=?", [today(), stamp, o.mitra_id]);
    const responder = str(req.body?.name, 80);
    const responderPhone = phoneOrNull(req.body?.phone);
    if (responder || responderPhone) {
      run('UPDATE mitras SET contact_person = COALESCE(?, contact_person), phone = COALESCE(?, phone) WHERE id = ?', [
        responder, responderPhone, o.mitra_id,
      ]);
    }
    if (!mitra.schedule_day && o.schedule_day) {
      run('UPDATE mitras SET schedule_day=?, schedule_time=? WHERE id=?', [o.schedule_day, o.schedule_time, o.mitra_id]);
    }
  } else {
    run("UPDATE mitras SET status='ditolak', updated_at=? WHERE id=?", [stamp, o.mitra_id]);
  }
  const photos = savePhotos(req, 'penawaran', o.id, req.body?.photos);
  run('INSERT INTO mitra_visits (mitra_id, user_id, visit_type, outcome, notes) VALUES (?,?,?,?,?)', [
    o.mitra_id, req.user.id, 'penawaran', choice === 'bersedia' ? 'berhasil' : 'tidak_berminat',
    `Tanggapan atas surat ${o.number}: ${choice === 'bersedia' ? 'BERSEDIA menjadi mitra tetap' : 'TIDAK BERSEDIA'}.`,
  ]);
  audit(req.user.id, 'offer.response', 'offer', o.id, { choice });
  res.json({
    offer: get('SELECT * FROM offers WHERE id = ?', [o.id]),
    mitra: get('SELECT * FROM mitras WHERE id = ?', [o.mitra_id]),
    photos,
    next_hint: choice === 'bersedia' && !mitraHasCrew
      ? 'Mitra sudah aktif. Jadwalkan pengambilan pertama dari menu Pengambilan.'
      : null,
  });
}));

r.delete('/offers/:id', requireAuth, wrap((req, res) => {
  if (!isManager(req.user.role)) throw badRequest('Hanya admin yang dapat menghapus surat.');
  const o = get('SELECT * FROM offers WHERE id = ?', [req.params.id]);
  if (!o) throw badRequest('Surat tidak ditemukan.');
  if (o.status !== 'draf') throw badRequest('Hanya surat berstatus draf yang dapat dihapus.');
  run('DELETE FROM offers WHERE id = ?', [o.id]);
  audit(req.user.id, 'offer.delete', 'offer', o.id);
  res.json({ ok: true });
}));

/* ================================== CETAK ================================== */

r.get('/print/receipt/:id', requireAuth, wrap((req, res) => {
  const rc = get('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
  if (!rc) throw badRequest('Kwitansi tidak ditemukan.');
  const snapshot = rc.snapshot ? JSON.parse(rc.snapshot) : null;
  res.status(200).send(renderKwitansi({
    receipt: rc,
    snapshot,
    photos: photosFor('kwitansi', rc.id),
    company: companyBlock(),
    note: setting('receipt.note'),
    showPrintedAt: req.query.as !== 'final',
  }));
}));

r.get('/print/offer/:id', requireAuth, wrap((req, res) => {
  const o = get(
    `SELECT o.*, m.name AS mitra_name, m.address AS mitra_address, m.area AS mitra_area
       FROM offers o JOIN mitras m ON m.id = o.mitra_id WHERE o.id = ?`,
    [req.params.id],
  );
  if (!o) throw badRequest('Surat tidak ditemukan.');
  const clauses = setting('offer.clauses') ? JSON.parse(setting('offer.clauses')) : [];
  res.status(200).send(
    renderPenawaran({
      offer: o,
      company: companyBlock(),
      clauses,
      subject: setting('offer.subject'),
      photos: photosFor('penawaran', o.id),
    }),
  );
}));

function companyBlock() {
  return {
    name: setting('company.name'),
    brand: setting('company.brand'),
    address: setting('company.address'),
    phone: setting('company.phone'),
    city: setting('company.city', 'Pontianak'),
    code: setting('doc.code', 'XSA'),
  };
}

r.get('/documents/summary', requireAuth, wrap((req, res) => {
  res.json({
    receipts: all('SELECT status, COUNT(*) AS n, SUM(total) AS amount FROM receipts GROUP BY status'),
    offers: all('SELECT status, COUNT(*) AS n FROM offers GROUP BY status'),
  });
}));

export default r;
