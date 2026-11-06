# XYNLOOP — Sistem Operasional PT. Xynra Sukses Abadi

Dashboard + backend untuk perusahaan pembeli limbah kertas bekas (kg) dan minyak jelantah (liter):
pendataan mitra, akuisisi oleh bagian purchasing, penjemputan berikut timbangan & foto bukti,
tracking GPS, perhitungan BBM, sampai cetak digital **kwitansi** dan **surat penawaran** sesuai format asli.

Tanpa dependency frontend — cukup **Node.js 20+**, **Express**, dan **SQLite** (better-sqlite3).
Basis data, foto bukti pembelian, dan cadangan tersimpan di folder lokal server.

---

## Dokumentasi

| Berkas | Untuk siapa |
| --- | --- |
| [docs/panduan-admin.md](docs/panduan-admin.md) | Pemilik & admin/manajer: persiapan pertama, alur transaksi lengkap, laporan 7 tab, akun tim, pengaturan kop surat, audit, backup. |
| [docs/panduan-purchasing.md](docs/panduan-purchasing.md) | Bagian purchasing: cari prospek, catat kunjungan, surat penawaran & lembar tanggapan, kawal pengambilan, laporan atribusi dirinya. |
| [docs/panduan-kru.md](docs/panduan-kru.md) | Kru penjemputan (dibaca dari HP): berangkat, lacak GPS, timbang + foto, KM armada, kwitansi terbit/lunas. |
| [docs/deploy-vps-hostinger.md](docs/deploy-vps-hostinger.md) | Pasang di VPS Hostinger + domain `.id`/`.co.id`: syarat dokumen, SSH, firewall, systemd, nginx, Let's Encrypt, cron backup, checklist go-live. |

Ingin online tanpa VPS? Lihat bagian [Online tanpa VPS — Cloudflare Tunnel](#online-tanpa-vps--cloudflare-tunnel-dari-pc-kantor).

---

## Isi sistem

| Modul | Fungsi |
| --- | --- |
| **Mitra & Prospek** | Kartu mitra (toko, hotel, sekolah, restoran, rumah tangga…), kategori, wilayah, kontak, penanggung jawab, status `calon → penawaran → aktif → pasif`. Kunjungan bagian purchasing beserta foto dan catatan. |
| **Atribusi karyawan** | Setiap hasil timbangan tertelusur ke **karyawan purchasing yang menemukan mitranya** (`mitras.source_user_id`). Laporan "Karyawan" menampilkan kg, liter, jumlah kunjungan, surat terkirim/disetujui, dan konversi prospek → mitra aktif. |
| **Pengambilan** | Papan status harian (Terjadwal → Di jalan → Menimbang → Selesai), kru yang turun, **jumlah mobil/armada**, baris timbangan (kotor, tare, minus % → bersih & rupiah otomatis), foto bukti barang & mitra. |
| **Biaya BBM** | Per mobil: prioritas isian manual → selisih spido (km akhir − km awal) ÷ konsumsi → jarak rute GPS. Harga per liter per jenis BBM (pertalite/pertamax/dexlite/solar/bio) mengikuti tanggal pengambilan, menghasilkan Rp/kg sebagai dasar perhitungan biaya. |
| **Tracking** | Titik GPS tiap pengambilan dikirim perangkat kru, digambar pada peta kanvas buatan sendiri (tanpa kunci API/layanan peta berbayar) beserta rute dan jaraknya. |
| **Kwitansi digital** | `/api/print/receipt/:id` — kop PT, judul "KWITANSI PEMBELIAN KERTAS BEKAS", tabel max 7 baris, total, **terbilang**, metode pembayaran, tanda tangan. Nomor otomatis `001/XSA/XI/2026`. |
| **Surat penawaran** | `/api/print/offer/:id` — surat mitra tetap lengkap dengan klausul (hari & jam pengambilan otomatis) **plus lembar tanggapan** satu halaman. |
| **Laporan** | 7 tab: Karyawan, Kru penjemput, Mitra, Material, Armada & BBM, Wilayah, Tren. Rentang tanggal bebas, eskpor CSV, lingkup "hanya milik saya" untuk non-manajer. |
| **Administrasi** | Akun & peran, harga material, harga BBM, armada, pengaturan perusahaan (kop surat, penanda tangan, klausul), jejak audit. |

---

## Instalasi

```bash
cd xynloop-admin
npm run setup        # npm install + migrate (buat skema, material, harga BBM, akun awal)
npm run dev          # mode pengembangan (auto-reload) → http://localhost:3000
# atau
npm start            # mode produksi
```

Saat migrate pertama kali dibuat akun pemilik:

- username `admin`
- password `Xynloop2026!` (atau nilai `BOOTSTRAP_ADMIN_PASSWORD`)
- akun wajib **mengganti password pada login pertama**.

Ganti `BOOTSTRAP_ADMIN_PASSWORD` di `.env` sebelum server menyentuh jaringan produksi.

### Skrip npm

| Perintah | Kegunaan |
| --- | --- |
| `npm run setup` | install + migrate |
| `npm run dev` | server dengan auto-reload |
| `npm start` | server produksi |
| `npm run migrate` | jalankan skema & data dasar saja |
| `npm run seed:demo` | isi data demo (mitra, pengambilan, foto, GPS) ke basis data kosong |
| `npm run reset:demo` | hapus seluruh data demo lalu isi ulang dari nol |
| `npm run smoke` | uji end-to-end 71 poin lewat API |
| `npm run new-admin -- --name="..." --username=...` | buat akun admin/purchasing/kru dari terminal |
| `npm run backup` | cadangkan basis data + folder uploads ke `backups/` |
| `npm run tunnel` | buka URL sementara dari Cloudflare Tunnel (tanpa VPS) |
| `npm run tunnel:run` | jalankan tunnel dengan domain tetap (`tunnel/config.yml`) |

Contoh:

```bash
npm run new-admin -- --name="Sophian Rahardi" --username=sophian --role=admin
npm run new-admin -- --name="Sari" --username=sari --role=purchasing --password="Rahasia123"
npm run backup -- --keep=14
npm run smoke http://127.0.0.1:3000
```

Bila `--password` tidak diisi, sistem membuat password acak dan menandai akun untuk menggantinya saat login pertama.
Untuk akun yang sudah ada, gunakan layar **Pengguna → Reset password**: isian boleh dikosongkan (sistem membuat
password sementara acak) atau diisi password sementara pilihan Anda; sesi login akun tersebut langsung diputus.

---

## Konfigurasi

Salin `.env.example` menjadi `.env`, lalu sesuaikan.

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `NODE_ENV` | _(kosong)_ | `production` untuk mode live |
| `HOST` | `127.0.0.1` | Antarmuka yang dipakai; pakai `0.0.0.0` hanya bila memang perlu diakses langsung dari jaringan (container) |
| `PORT` | `3000` | Port HTTP |
| `SESSION_SECRET` | ada nilai dev | **wajib** di produksi (string acak ≥ 32 karakter); server menolak start mode produksi bila kosong |
| `SESSION_DAYS` | `30` | Umur sesi login |
| `DATA_DIR` | `data` | Lokasi SQLite (`WAL`) |
| `UPLOAD_DIR` | `uploads` | Foto bukti pembelian & branding |
| `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` | `admin` / `Xynloop2026!` | Akun awal saat basis data masih kosong |

Pengaturan yang bisa diubah dari layar **Pengaturan** (tanpa konfigurasi ulang): nama & kop perusahaan,
alamat, telepon, kota, kode nomor dokumen, nama/jabatan petugas kwitansi, nama/jabatan penanda tangan surat,
hal surat penawaran, klausul, hari + jam pengambilan rutin, dan catatan footer kwitansi.

---

## Peran & hak akses

| Peran | Isi |
| --- | --- |
| `owner` / `admin` | Semua modul, laporan biaya (BBM, Rp/kg), akun, harga, armada, pengaturan, audit, seluruh data lintas tim. |
| `purchasing` | Akuisisi & kunjungan calon mitra, surat penawaran, membuat/mengisi pengambilan, melihat laporannya sendiri. Tidak dapat membuat akun atau membaca biaya armada. |
| `crew` | Penugasannya sendiri: jalan/status, titik GPS, timbangan, foto. |

Aturan: **calon mitra tercatat atas nama karyawan yang menemukannya**; saat mitra menjadi aktif dan barang
terambil, hasil kg/liter otomatis masuk ke kolom attributednya di laporan.

Login memakai cookie sesi opaque + header `x-xxl: 1` untuk semua request non-GET (CSRF), password scrypt,
dan foto hanya bisa dibaca lewat `/files/*` setelah login (tidak ada tautan publik).

---

## Backup & pemulihan

```bash
npm run backup
```

Menghasilkan `backups/<timestamp>/` berisi salinan basis data yang aman (API `VACUUM INTO`),
folder `uploads/`, manifest `ISI.json`, dan `CARA-MULIHKAN.txt`. Simpan keluar dari server, misalnya:

```bash
rsync -a --delete backups/ user@storage:/backup/xynloop/
```

Kunci sesi (`SESSION_SECRET`) tidak ikut tersimpan di basis data — catat nilainya di tempat aman.

---

## Online tanpa VPS — Cloudflare Tunnel (dari PC kantor)

Aplikasi tetap jalan di PC (`HOST=127.0.0.1`), `cloudflared` membuka koneksi **keluar** ke Cloudflare,
sehingga tidak ada port yang perlu dibuka di router atau Windows Firewall, dan kru cukup membuka alamat
HTTPS dari HP. Data, foto bukti, dan basis data berada di harddisk PC sendiri.

### Cara cepat (URL acak — untuk uji coba)

```powershell
winget install --id Cloudflare.cloudflared -e
npm start            # terminal 1
npm run tunnel       # terminal 2 -> https://xxxx-xxxx.trycloudflare.com
```

URL ini berubah setiap kali tunnel dijalankan ulang, jadi hanya cocok untuk mencoba.

### Cara permanen (domain sendiri)

```powershell
cloudflared tunnel login
cloudflared tunnel create xynloop
cloudflared tunnel list                       # salin TUNNEL_ID
cloudflared tunnel route dns xynloop loop.domain-anda.com
copy tunnel\config.example.yml tunnel\config.yml   # isi TUNNEL_ID + hostname
npm run tunnel:run
```

Agar ikut menyala saat PC dinyalakan (butuh hak administrator):

```powershell
copy tunnel\config.yml C:\ProgramData\cloudflared\config.yml
cloudflared service install
sc start Cloudflared
```

Catatan penting untuk mode ini:

- Aplikasi sudah membaca `X-Forwarded-Proto`, jadi cookie sesi otomatis memakai flag **Secure** di belakang tunnel.
- Sesi login dan batas percobaan password memakai IP asli pengunjung (sudah `trust proxy`).
- Foto bukti hanya dapat dibaca lewat `/files/*` setelah login — tidak ada tautan publik.
- Lapis pengaman tambahan (opsional, gratis sampai 50 pengguna): pasang **Cloudflare Access** pada hostname tunnel
  sehingga hanya email karyawan yang boleh membuka halaman login.
- Karena data hidup di PC, **jadwalkan `npm run backup`** dan salin `backups/` keluar dari PC (Google Drive/OneDrive).
- Sebelum dipakai sungguhan: hentikan server, hapus `data/xynloop.db*` dan isi `uploads/`, lalu `npm run migrate`
  untuk memulai dari kosong (akun awal dibuat ulang). `npm run reset:demo` justru mengisi ulang data contoh.

---

## Deploy ke VPS (Ubuntu/Debian + nginx)

```bash
# 1. Node.js 22 + build tools (untuk modul native better-sqlite3)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3

# 2. Ambil berkas & pasang
git clone https://github.com/robyrbptk-web/xynloop.git ~/app
cd ~/app/xynloop-admin && npm run setup

# 3. Konfigurasi
cat > .env <<'EOF'
NODE_ENV=production
PORT=3000
SESSION_SECRET=<string-acak-panjang>
EOF

# 4. systemd
sudo tee /etc/systemd/system/xynloop.service > /dev/null <<'EOF'
[Unit]
Description=XYNLOOP Admin
After=network.target

[Service]
WorkingDirectory=/home/deploy/app/xynloop-admin
ExecStart=/usr/bin/node src/server.js
Restart=always
Environment=NODE_ENV=production
User=deploy

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now xynloop
journalctl -u xynloop -f
```

Blok nginx (WebSocket tidak diperlukan; aplikasi murni HTTP):

```nginx
server {
  listen 80;
  server_name loop.xynloop.id;
  client_max_body_size 10m;      # unggah foto bukti pembelian
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Pasang sertifikat dengan `sudo certbot --nginx -d loop.xynloop.id`.
Sudah `trust proxy` aktif di Express, jadi cookie `Secure` mengikuti header `X-Forwarded-Proto`.

Endpoint pemantauan: `GET /healthz` (jumlah mitra, pengambilan, dan user).

---

## Struktur

```
xynloop-admin/
├─ src/
│  ├─ server.js            bootstrap Express, routing, guard sesi
│  ├─ config.js            baca .env, path data & uploads
│  ├─ db/                  index.js (helper SQL), schema.sql, migrate.js, seed-demo.js
│  ├─ api/                 auth, users, mitras, pickups, documents, reports, dashboard, reference, tracking
│  ├─ lib/                 auth (scrypt+cookie), permissions, calc (timbangan & BBM), geo (jarak rute),
│  │                      attachments, uploads, csv, http, terbilang
│  ├─ print/documents.js   render HTML A4 kwitansi & surat penawaran (+ lembar tanggapan)
│  └─ tools/               smoke.js, new-admin.js, backup.js, fixture-image.js
└─ public/                 SPA vanilla ESM: app.js (router), api.js, ui.js, charts.js, geo.js, media.js, views/*
```

## Catatan

- Peta memakai kanvas yang digambar sendiri (jalan utama Pontianak sebagai garis referensi), sehingga tidak
  membutuhkan kunci API atau layanan tile berbayar/gratis.
- Nomor dokumen memakai counter per tahun (`NNN/XSA/BULAN/TAHUN`); bulan pada nomor hanya label.
- Data demo (`npm run seed:demo`) diberi tanda `data demo` supaya mudah dihapus sebelum produksi.
