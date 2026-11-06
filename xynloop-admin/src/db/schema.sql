PRAGMA foreign_keys = ON;

-- =====================================================================
-- XYNLOOP OPERATIONAL SYSTEM · PT. Xynra Sukses Abadi
-- Unit uang: Rupiah (INTEGER, utuh). Unit berat: kg (REAL). Volume: liter (REAL).
-- =====================================================================

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL,
  username             TEXT NOT NULL UNIQUE,
  phone                TEXT,
  role                 TEXT NOT NULL CHECK (role IN ('owner','admin','purchasing','crew')),
  password_hash        TEXT NOT NULL,
  password_salt        TEXT NOT NULL,
  is_active            INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  area                 TEXT,
  notes                TEXT,
  created_by           INTEGER REFERENCES users(id),
  created_at           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  last_login_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, is_active);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at TEXT NOT NULL,
  last_seen  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS counters (
  scope  TEXT NOT NULL,
  period TEXT NOT NULL,
  seq    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, period)
);

-- ------------------------------- ARMADA & BBM -------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  plate               TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'mobil' CHECK (type IN ('mobil','truk','motor','pick_up')),
  fuel_type           TEXT NOT NULL DEFAULT 'pertalite',
  consumption_km_per_l REAL NOT NULL DEFAULT 10,
  capacity_kg         REAL NOT NULL DEFAULT 1000,
  km_running          REAL NOT NULL DEFAULT 0,
  is_active           INTEGER NOT NULL DEFAULT 1,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS fuel_prices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  fuel_type       TEXT NOT NULL,
  price_per_liter INTEGER NOT NULL,
  effective_from  TEXT NOT NULL,
  created_by      INTEGER REFERENCES users(id),
  note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_fuel_price ON fuel_prices(fuel_type, effective_from DESC);

-- ------------------------------- MITRA -------------------------------
CREATE TABLE IF NOT EXISTS mitras (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT UNIQUE,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'kertas' CHECK (category IN ('kertas','jelantah','campur')),
  contact_person    TEXT,
  phone             TEXT,
  address           TEXT,
  area              TEXT,
  lat               REAL,
  lng               REAL,
  status            TEXT NOT NULL DEFAULT 'prospek'
                    CHECK (status IN ('prospek','penawaran','negosiasi','aktif','tidak_respon','ditolak','nonaktif')),
  -- Akuisisi: karyawan purchasing yang menemukan / menangani prospek ini
  source_user_id    INTEGER REFERENCES users(id),
  -- Kru penjemputan yang biasa menangani (opsional, untuk penjadwalan)
  crew_user_id      INTEGER REFERENCES users(id),
  dedupe_key        TEXT UNIQUE,
  expected_paper_kg REAL DEFAULT 0,
  expected_oil_l    REAL DEFAULT 0,
  schedule_day      TEXT,
  schedule_time     TEXT,
  quality_note      TEXT,
  notes             TEXT,
  first_contact_at  TEXT,
  active_from       TEXT,
  closed_at         TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_mitra_status ON mitras(status, category);
CREATE INDEX IF NOT EXISTS idx_mitra_source ON mitras(source_user_id);

CREATE TABLE IF NOT EXISTS mitra_visits (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  mitra_id       INTEGER NOT NULL REFERENCES mitras(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  visit_type     TEXT NOT NULL DEFAULT 'survey'
                 CHECK (visit_type IN ('survey','penawaran','follow_up','negosiasi','pengambilan','lainnya')),
  visited_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  outcome        TEXT NOT NULL DEFAULT 'lanjut'
                 CHECK (outcome IN ('lanjut','berhasil','tunda','tidak_berminat','belum_sampai','lainnya')),
  next_action_at TEXT,
  notes          TEXT,
  lat            REAL,
  lng            REAL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_visit_mitra ON mitra_visits(mitra_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_visit_user ON mitra_visits(user_id, visited_at DESC);

-- ------------------------------- MATERIAL & HARGA -------------------------------
CREATE TABLE IF NOT EXISTS materials (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  code     TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('kertas','jelantah')),
  unit     TEXT NOT NULL CHECK (unit IN ('kg','liter')),
  default_price INTEGER NOT NULL DEFAULT 0,
  sort     INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes    TEXT
);

CREATE TABLE IF NOT EXISTS price_lists (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id    INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  price          INTEGER NOT NULL,
  effective_from TEXT NOT NULL,
  created_by     INTEGER REFERENCES users(id),
  note           TEXT
);
CREATE INDEX IF NOT EXISTS idx_price_lookup ON price_lists(material_id, effective_from DESC);

-- ------------------------------- PENGAMBILAN / PENJEMPUTAN -------------------------------
CREATE TABLE IF NOT EXISTS pickups (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT UNIQUE,
  mitra_id     INTEGER NOT NULL REFERENCES mitras(id),
  date         TEXT NOT NULL,
  scheduled_at TEXT,
  arrived_at   TEXT,
  completed_at TEXT,
  status       TEXT NOT NULL DEFAULT 'terjadwal'
               CHECK (status IN ('terjadwal','dalam_perjalanan','menimbang','selesai','batal')),
  notes        TEXT,
  -- Rantai: siapa membuat jadwal, siapa memimpin lapangan
  created_by   INTEGER REFERENCES users(id),
  lead_user_id INTEGER REFERENCES users(id),
  start_lat    REAL,
  start_lng    REAL,
  -- Biaya operasional (boleh diisi manual; bila kosong dihitung dari km & konsumsi)
  distance_km  REAL,
  fuel_liters  REAL,
  fuel_cost    INTEGER,
  cost_source  TEXT NOT NULL DEFAULT 'auto' CHECK (cost_source IN ('auto','manual')),
  cancel_reason TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_pickup_date ON pickups(date, status);
CREATE INDEX IF NOT EXISTS idx_pickup_mitra ON pickups(mitra_id, date DESC);

CREATE TABLE IF NOT EXISTS pickup_crew (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pickup_id  INTEGER NOT NULL REFERENCES pickups(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  role_in_run TEXT NOT NULL DEFAULT 'kru' CHECK (role_in_run IN ('kordinator','driver','kru','penimbang')),
  UNIQUE (pickup_id, user_id)
);

CREATE TABLE IF NOT EXISTS pickup_vehicles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pickup_id  INTEGER NOT NULL REFERENCES pickups(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  km_start   REAL,
  km_end     REAL,
  liters     REAL,
  cost       INTEGER,
  UNIQUE (pickup_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS pickup_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pickup_id     INTEGER NOT NULL REFERENCES pickups(id) ON DELETE CASCADE,
  line_no       INTEGER NOT NULL DEFAULT 1,
  material_id   INTEGER NOT NULL REFERENCES materials(id),
  gross_weight  REAL NOT NULL DEFAULT 0,
  tare_weight   REAL NOT NULL DEFAULT 0,
  minus_pct     REAL NOT NULL DEFAULT 0,
  net_weight    REAL NOT NULL DEFAULT 0,
  unit_price    INTEGER NOT NULL DEFAULT 0,
  amount        INTEGER NOT NULL DEFAULT 0,
  weighed_by    INTEGER REFERENCES users(id),
  mitra_witness INTEGER NOT NULL DEFAULT 1,
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_item_pickup ON pickup_items(pickup_id);
CREATE INDEX IF NOT EXISTS idx_item_material ON pickup_items(material_id);

-- ------------------------------- LAMPIRAN / FOTO BUKTI -------------------------------
CREATE TABLE IF NOT EXISTS attachments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('mitra','kunjungan','barang','pickup','kwitansi','penawaran','profil','lainnya')),
  owner_id   INTEGER,
  path       TEXT NOT NULL,
  caption    TEXT,
  bytes      INTEGER,
  taken_by   INTEGER REFERENCES users(id),
  taken_at   TEXT,
  lat        REAL,
  lng        REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_attach_owner ON attachments(kind, owner_id);

-- ------------------------------- KWITANSI -------------------------------
CREATE TABLE IF NOT EXISTS receipts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  number        TEXT UNIQUE,
  pickup_id     INTEGER REFERENCES pickups(id),
  mitra_id      INTEGER NOT NULL REFERENCES mitras(id),
  issued_at     TEXT NOT NULL,
  method        TEXT NOT NULL DEFAULT 'tunai' CHECK (method IN ('tunai','transfer')),
  total         INTEGER NOT NULL DEFAULT 0,
  seller_name   TEXT,
  seller_address TEXT,
  seller_phone  TEXT,
  staff_name    TEXT,
  staff_title   TEXT,
  status        TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','terbit','lunas','batal')),
  paid_at       TEXT,
  void_reason   TEXT,
  snapshot      TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_receipt_date ON receipts(issued_at DESC, status);

-- ------------------------------- SURAT PENAWARAN -------------------------------
CREATE TABLE IF NOT EXISTS offers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  number           TEXT UNIQUE,
  mitra_id         INTEGER NOT NULL REFERENCES mitras(id),
  issued_at        TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'kertas' CHECK (category IN ('kertas','jelantah','campur')),
  schedule_day     TEXT,
  schedule_time    TEXT,
  start_date       TEXT,
  status           TEXT NOT NULL DEFAULT 'draf'
                   CHECK (status IN ('draf','terkirim','diterima','ditolak','kadaluarsa')),
  signed_by_name   TEXT,
  signed_by_title  TEXT,
  sent_via         TEXT,
  sent_at          TEXT,
  response_name    TEXT,
  response_address TEXT,
  response_phone   TEXT,
  response_choice  TEXT CHECK (response_choice IN ('bersedia','tidak','')),
  response_date    TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_offer_mitra ON offers(mitra_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_status ON offers(status, issued_at DESC);

-- ------------------------------- TITIK GPS LAPANGAN -------------------------------
CREATE TABLE IF NOT EXISTS tracking_points (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pickup_id    INTEGER REFERENCES pickups(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  accuracy     REAL,
  speed        REAL,
  battery      REAL,
  heading      REAL,
  recorded_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_track_pickup ON tracking_points(pickup_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_track_user_time ON tracking_points(user_id, recorded_at DESC);

-- ------------------------------- JEJAK AKTIVITAS -------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  meta       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at DESC);
