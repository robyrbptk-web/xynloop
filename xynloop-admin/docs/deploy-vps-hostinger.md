# Deploy di VPS Hostinger + Domain `.id`

Panduan dari nol sampai `https://loop.xynloop.id` bisa dipakai kru dari HP. Semua perintah dijalankan sebagai
`root` di VPS, kecuali bertanda `$`.

**Yang dibeli di Hostinger**

| Barang | Pilihan | Perkiraan |
| --- | --- | --- |
| VPS | Paket **KVM** (mulai KVM 1) dengan template **Ubuntu 24.04 LTS**; sudah termasuk root access & NVMe. Untuk < 30 pengguna aktif, 1 vCPU / 4 GB RAM sudah lega — aplikasi ini cuma Node + SQLite. | dari ± USD 6–10/bulan |
| Domain | `.id` (perorangan) atau `.co.id` (badan usaha seperti PT). Bisa dibeli di Hostinger dan DNS-nya otomatis memakai nameserver Hostinger. | ± Rp 200–350 ribu/tahun (`.id` perorangan biasanya lebih murah) |
| (opsional) | Backup/AFS addon, atau cukup cron + `rsync` keluar server. | — |

> Harga berubah menurut promo; yang penting pilih VPS dengan **Ubuntu 24.04 template** dan lokasi data center
> terdekat (Singapore) agar latensi dari Pontianak rendah.

---

## 1. Syarat dokumen domain `.id` / `.co.id`

| Jenis domain | Dokumen yang diunggah |
| --- | --- |
| `.id` perorangan | **KTP** penanggung jawab (scan/foto jelas) |
| `.id` lembaga/sekolah | KTP + SK pendirian lembaga / surat keterangan rektor |
| `.co.id` (perusahaan — cocok untuk PT. Xynra Sukses Abadi) | **KTP** penanggung jawab + **NIB** (Nomor Induk Berusaha dari OSS) atau **Akta Notaris** pendirian; sebagian kasus diminta sertifikat merek jika nama-domainnya merek terdaftar |

Caranya: hPanel → **Domains** → beli domain → saat diminta verifikasi, unggah berkas **PDF** dokumennya
(hPanel → Domains → *Persyaratan domain Indonesia*). Verifikasi PANDI biasanya **1–3 hari kerja**; domain tetap bisa
dipakai untuk DNS lebih dulu, tapi aktivasi penuh menunggu dokumen disetujui.

**Tips:** beli domain dulu, lalu tunnel/SSL ke subdomain `loop.xynloop.id` setelah A record terpasang.
Data KTP/NIB harus sama persis dengan nama penanggung jawab pada order.

---

## 2. Menyalakan VPS

1. hPanel → **VPS** → pilih paket → saat instalasi pilih template **Ubuntu 24.04** dan tentukan **root password**.
2. Catat **IPv4** server (mis. `76.134.x.x`).
3. Masuk dari terminal:
   ```bash
   ssh root@76.134.x.x
   apt update && apt -y full-upgrade
   timedatectl set-timezone Asia/Jakarta      # WAJIB: tanggal kwitansi & hitungan harian memakai waktu lokal
   ```
4. Kunci akses SSH (sangat disarankan karena server akan terbuka 24 jam):
   ```bash
   adduser deploy && usermod -aG sudo deploy
   install -d -m 700 /home/deploy/.ssh
   # tempel public key Anda:
   nano /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
   chown -R deploy:deploy /home/deploy/.ssh
   sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
   systemctl restart ssh
   ```
   Untuk uji pertama, gunakan `Hostinger VPS browser` (terminal di hPanel) supaya tidak terkunci bila ada salah seting.

### Pemasangan firewall

```bash
apt -y install ufw
ufw default deny incoming
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Port 3000 **tidak** dibuka: nginx yang berbicara ke aplikasi lewat loopback.

---

## 3. Pasang aplikasi

```bash
su - deploy
sudo apt -y install git build-essential python3 nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
node -v                                  # v22.x

git clone https://github.com/robyrbptk-web/xynloop.git ~/app
cd ~/app/xynloop-admin
npm run setup                            # install + buat skema, material, harga BBM, akun awal
```

Konfigurasi (berkas ini jangan pernah di-commit):

```bash
umask 077
cat > .env <<'EOF'
HOST=127.0.0.1
PORT=3000
NODE_ENV=production
SESSION_SECRET=ganti-dengan-64-karakter-acak
SESSION_DAYS=30
DATA_DIR=data
UPLOAD_DIR=uploads
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=<password-sementara-yang-langsung-anda-ganti>
EOF

npm run new-admin -- --name="Sophian Rahardi" --username=sophian --role=admin
node src/server.js                       # uji: http://127.0.0.1:3000/healthz
```

`SESSION_SECRET` acak: `openssl rand -hex 32`.
Karena `NODE_ENV=production`, server **menolak jalan** bila `SESSION_SECRET` kosong — itu pengaman, bukan error.

### Layanan systemd (auto-start & auto-restart)

```bash
sudo tee /etc/systemd/system/xynloop.service > /dev/null <<'EOF'
[Unit]
Description=XYNLOOP Admin
After=network.target

[Service]
User=deploy
WorkingDirectory=/home/deploy/app/xynloop-admin
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now xynloop
systemctl status xynloop --no-pager
```

---

## 4. DNS + nginx + sertifikat HTTPS

**hPanel → Domains → `xynloop.id` → DNS Zone Records**, tambah:

| Tipe | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `loop` | IPv4 VPS Anda | 300 |
| AAAA | `loop` | IPv6 VPS (bila ada) | 300 |

Tunggu 5–10 menit; cek dengan `dig +short loop.xynloop.id`.

```bash
sudo tee /etc/nginx/sites-available/xynloop > /dev/null <<'EOF'
server {
    listen 80;
    server_name loop.xynloop.id;

    client_max_body_size 10m;        # unggah foto bukti pembelian (batas aplikasi 6 MB)

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/xynloop /etc/nginx/sites-enabled/xynloop
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d loop.xynloop.id --redirect -m admin@xynloop.id --agree-tos -n
```

Sertifikat Let's Encrypt otomatis perpanjangan (timer certbot sudah terpasang). Aplikasi membaca
`X-Forwarded-Proto`, jadi cookie sesi langsung memakai flag **Secure** begitu HTTPS aktif.

---

## 5. Backup otomatis

```bash
crontab -e                # sebagai user deploy
```

```cron
# 02:30 WIB: backup harian, simpan 14 hari
30 2 * * * cd /home/deploy/app/xynloop-admin && /usr/bin/npm run backup -- --keep=14 >> /home/deploy/backup.log 2>&1
```

Salin keluar server (Hostinger punya **snapshot** berbayar; alternatif gratis ke storage lain):

```bash
rsync -az -e ssh deploy@76.134.x.x:/home/deploy/app/xynloop-admin/backups/ /backup-lokal/xynloop/
```

Restore: lihat `CARA-MULIHKAN.txt` di dalam folder backup — intinya hentikan service, kembalikan `data/xynloop.db`
dan `uploads/`, pastikan `SESSION_SECRET` sama, lalu `systemctl start xynloop`.

---

## 6. Checklist setelah live

1. Buka `https://loop.xynloop.id` → halaman **Masuk ke Xynloop** tampil.
2. Login `admin` / password sementara → **ganti password** (minimal 8 karakter, huruf + angka).
3. Buat akun manajer Anda (`sophian` di atas) lalu **nonaktifkan** akses login `admin` default atau ganti
   password-nya menjadi sangat kuat.
4. **Pengaturan** → isi identitas, alamat, telepon, nama petugas kwitansi, penandatangan surat, hari+jam pengambilan.
5. **Harga Material** → harga hari ini. **Armada & BBM** → daftar mobil + konsumsi + harga BBM.
6. **Pengguna** → akun purchasing & kru, centang *Wajib ganti password saat masuk pertama*.
7. **Buat 1 pengambilan uji** sampai kwitansi **Cetak** (Save as PDF) — pastikan tampilannya benar di HP.
8. Cek `https://loop.xynloop.id/healthz` (menampilkan jumlah mitra, pengambilan, user) dan `journalctl -u xynloop -n 50`.
9. `npm run smoke https://loop.xynloop.id` — 71 pengujian end-to-end harus lulus.
   (Jalankan sebelum ada data produksi: smoke membuat akun & armada percobaan sendiri.)

---

## 7. Update aplikasi di kemudian hari

```bash
su - deploy
cd ~/app/xynloop-admin
npm run backup -- --keep=5          # jaga-jaga
git pull origin main
npm install                          # bila ada perubahan dependensi
npm run migrate                      # skema baru (aman diulang)
sudo systemctl restart xynloop
npm run smoke https://loop.xynloop.id
```

---

## Alternatif tanpa VPS

Kalau belum mau berlangganan VPS, sistem yang sama bisa diakses dari internet lewat **Cloudflare Tunnel** yang
berjalan di PC kantor (lihat README bagian "Online tanpa VPS"). Bedanya: data di harddisk PC dan hanya online saat PC
menyala — cocok untuk uji coba tim, kurang cocok untuk pemakaian harian 20+ orang.

## Catatan keamanan khusus domain publik

- Jangan gunakan `HOST=0.0.0.0`; aplikasi cukup loopback karena nginx menjadi penerus.
- Ganti `BOOTSTRAP_ADMIN_PASSWORD` sebelum VPS hidup; sistem memaksa penggantian saat login pertama, tapi jangan
  biarkan password awal bertahan.
- Foto bukti hanya bisa dibaca setelah login (`/files/*` menolak anonim) — tidak ada tautan publik yang bocor.
- Pertimbangkan **Cloudflare proxy** (oranye awan) di depan `loop.xynloop.id` untuk menyembunyikan IP asal, atau
  **Cloudflare Access** bila ingin hanya email kantor yang boleh membuka halaman login.
