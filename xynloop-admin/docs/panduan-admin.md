# Panduan Penggunaan — Pemilik & Admin/Manajer

Untuk peran **Pemilik (owner)** dan **Admin / Manajer**. Anda punya akses penuh: semua modul, laporan biaya
armada & BBM, membuat akun, harga, armada, pengaturan kop surat, dan jejak audit.

Daftar isi: [Persiapan pertama](#persiapan-pertama) · [Papan kerja harian](#papan-kerja-harian) ·
[Alur transaksi](#alur-transaksi-dari-prospek-sampai-kwitansi-lunas) · [Laporan](#laporan) ·
[Armada, BBM & harga](#armada-bbm--harga) · [Akun tim](#membuat--mengelola-akun-tim) ·
[Pengaturan](#pengaturan) · [Audit](#jejak-audit) · [Backup](#backup--pemulihan) · [Tanya jawab](#tanya-jawab)

---

## Persiapan pertama

Lakukan sekali di hari pertama. Butuh ±20 menit.

1. **Masuk** ke alamat sistem, gunakan username `admin` dan password yang diberikan. Bila muncul layar
   *Ganti password & masuk*, isi password baru (minimal 8 karakter, harus ada huruf **dan** angka).
2. **Pengaturan** (`#/pengaturan`) — periksa grup **Identitas perusahaan** (nama, brand, tagline, alamat,
   telepon, kota). Semua nilai ini yang tercetak sebagai kop pada kwitansi dan surat penawaran.
3. Masih di **Pengaturan**:
   - *Penomoran dokumen & tanda tangan* → `Kode dokumen` (mis. `XSA`) dan nama/jabatan petugas kwitansi.
   - *Surat penawaran* → nama penandatangan, subjek surat, **hari + jam pengambilan rutin**, dan klausal.
   - *Kwitansi* → kalimat catatan di bawah tabel.
   - *Harga & biaya default* → harga BBM default (Rp/liter) bila belum diisi per jenis.
   - Tekan **Simpan pengaturan**.
4. **Harga Material** (`#/harga`) — katalog awal sudah berisi 7 jenis kertas + 2 jenis jelantah. Tekan
   **Ubah harga** pada baris yang perlu, isi **Harga**, **Beraku sejak**, **Catatan**. Harga lama tetap tersimpan
   di **Riwayat**, dan setiap pengambilan memakai harga yang berlaku pada **tanggal pengambilan**, bukan harga hari ini.
5. **Armada & BBM** (`#/armada`) — **Tambah kendaraan** untuk setiap mobil/truk yang dipakai: nomor polisi, nama,
   jenis (Mobil/Pick up/Truk/Motor), **jenis BBM** (Pertalite–Bio Solar), **konsumsi km/l**, kapasitas kg, dan
   **odometer** terkini (penting: biaya BBM dihitung dari selisih km). Lalu isi **Harga BBM** → **Tambah harga BBM**
   (harga per liter + tanggal berlaku) setiap kali harga SPBU berubah.
6. **Pengguna** (`#/pengguna`) — **Buat akun** untuk setiap karyawan (lihat [Akun tim](#membuat--mengelola-akun-tim)).
7. Bila basis data masih berisi contoh: hentikan server, kosongkan `data/` dan `uploads/`, jalankan
   `npm run migrate`, lalu masuk ulang. Jangan lupa **backup** pertama (`npm run backup`).

---

## Papan kerja harian

Buka **Dashboard** (`#/`). Isinya, dari kiri ke kanan:

| Kartu | Gunanya |
| --- | --- |
| Kertas hari ini / Jelantah hari ini / Nilai pembelian / Mobil turun | Detik ini juga: berapa masuk, berapa keluar kas, berapa unit di jalan. |
| Mitra aktif / Prospek dibuka / Kas keluar bulan ini / BBM bulan ini | Ukuran pipelines & biaya sebulan. |
| **Sedang berjalan** | Run yang statusnya *Di jalan* atau *Menimbang*, lengkap dengan lokasi terakhir kru. |
| **Perlu perhatian** | Papan peringatan: pengambilan terjadwal belum dimulai, run selesai tanpa kwitansi, penawaran belum dijawab mitra, mitra aktif yang lama tidak diambil. Tiap baris bisa diklik. |
| **Pipeline mitra** | Jumlah prospek → penawaran → negosiasi → aktif, bulan ini. |
| Pengambilan hari ini / Baru selesai / Menunggu jadwal / Tim di lapangan | Operasional harian. |

Tombol cepat: **Papan hari ini** dan **+ Pengambilan**.

**Papan Penjemputan** (`#/papan`) adalah kendali operasional: 5 kolom *Terjadwal · Di jalan · Menimbang ·
Selesai · Batal*. Kartu bisa digeser/ditekannya tombol **Berangkat**, **Timbang**, **Selesai**; **Batalkan pengambilan**
meminta **Alasan**. Penanggung jawab, jam, dan mitra diubah lewat **Ubah jadwal** di detail. Papan dimuat ulang tiap
45 detik, jadi dua admin tidak saling menimpa tanpa sadar.

---

## Alur transaksi (dari prospek sampai kwitansi lunas)

```
Prospek  →  Kunjungan  →  Surat penawaran  →  Tanggapan BERSEDIA  →  Mitra aktif
                                                                  ↓
                                        Pengambilan (jadwal → jalan → timbang → selesai) → Kwitansi → Lunas
```

1. **Prospek & Kunjungan** (`#/prospek`) — papan kanban per status. **+ Prospek baru** untuk tempat yang ditemukan
   tim purchasing. Status: *Prospek · Penawaran · Negosiasi · Mitra aktif* (+ *Tidak respon* / *Ditolak* bila terisi).
   Baris **Perlu dikejar** menampilkan kontak yang tidak disentuh >14 hari.
2. **Data Mitra** (`#/mitras`) — **Mitra baru** bila ingin langsung masuk sebagai mitra. Field penting:
   nama, kategori (Kertas/Jelantah/Campur), narahubung + telepon, area, alamat, perkiraan kg/liter per pengambilan,
   hari & jam pengambilan, catatan kualitas. Untuk Anda (manager) ada field **Karyawan penemu** — inilah yang
   dipakai laporan atribusi, jadi jangan dibiarkan kosong.
3. **Surat Penawaran** (`#/penawaran`) — **+ Buat surat** (2 langkah: pilih mitra & kategori, lalu *Rincian surat
   penawaran*: nomor otomatis, hari/waktu rutin, tanggal mulai, penandatangan). Setelah jadi: **Kirim surat penawaran**
   (WhatsApp / Serah langsung). Saat mitra menjawab, isi **Lembar tanggapan mitra** dan pilih **BERSEDIA** + unggah
   foto lembar bertanda tangan → mitra otomatis naik jadi *aktif*. Dokumen siap cetak lewat **Cetak surat + lembar tanggapan**.
4. **Pengambilan** — dari papan atau **+ Pengambilan**; isinya mitra, tanggal, jam, penanggung jawab, catatan.
   Setelah dibuat, buka **Detail Pengambilan** (`#/pengambilan/:id`) dan lengkapi:
   - **Tim**: **+ Tambah kru** dengan peran Koordinator / Pengemudi / Kru / Penimbang.
   - **Kendaraan**: **+ Tambah armada**, lalu isi **KM awal/akhir** saat kembali.
   - **Hasil timbangan**: **+ Tambah baris** → *Bahan, Timbangan penuh, Timbangan kosong, Minus (%), Harga satuan,
     Catatan, Disaksikan perwakilan mitra,* dan **Ambil foto timbangan**. Sistem menghitung
     `Bersih = (penuh − kosong) × (1 − minus%)` lalu `Jumlah = Bersih × Harga satuan`.
   - **Foto bukti pembelian** untuk arsip.
   - **Rute GPS** muncul bila kru menyalakan pelacakan; ada tombol **Buka di Google Maps**.
5. **Kwitansi** (`#/kwitansi` atau dari detail) — **Buat kwitansi** (nomor otomatis `001/XSA/XI/2026`), periksa
   **Terbilang**, lalu **Terbitkan**. Ketika uang dibayar: **Tandai lunas** (kwitansi terkunci dari pengeditan biasa).
   Salah terbit? **Batalkan** lalu buat baru. **Cetak** membuka halaman A4 — pilih *Save as PDF* pada tujuan printer.
   Bukti transfer/THR bisa ditambahkan dengan **+ Foto bukti bayar**.

> Satu pengambilan hanya boleh punya satu kwitansi aktif. Kwitansi berstatus *batal* tidak dihitung sebagai kas keluar.

---

## Laporan

**Laporan** (`#/laporan`) — pilih periode: *7/30/90 hari terakhir, 6 bulan terakhir*, atau **Tanggal sendiri**
(Dari–Sampai). Tujuh tab:

| Tab | Isi pokok |
| --- | --- |
| **Karyawan** | Atribusi: nama karyawan purchasing, mitra ditemukan, menjadi mitra aktif + % konversi, kunjungan, surat terkirim/disetujui, kg & liter yang mereka bawa. |
| **Kru penjemput** | Hasil yang dijemput tiap anggota tim penjemputan. |
| **Mitra** | Peringkat mitra (TOP), mitra terlewat/lama tidak diambil. |
| **Material** | Komposisi jenis kertas & jelantah, harga rata-rata. |
| **Armada & BBM** | km, liter, biaya, **Rp/kg** per kendaraan. |
| **Wilayah** | Per kecamatan/area Pontianak. |
| **Tren** | Seri bulanan kg, liter, nilai, biaya. |

**Ekspor CSV** menghasilkan berkas (pilih jenis laporan → **Unduh CSV**) untuk direkap di Excel/Spreadsheet.
**Muat ulang** mengambil data terbaru. Angka biaya armada hanya muncul pada akun manager — itu sebabnya tab
*Armada & BBM* tidak tampil untuk purchasing.

---

## Armada, BBM & harga

- **Armada & BBM** (`#/armada`): tabel kendaraan + statistik *Pengambilan · Total km · Total liter · Biaya BBM*.
  **Nonaktifkan** untuk unit yang keluar servis/pindah; histori tetap utuh.
- Cara biaya dihitung (urutan prioritas): isian manual liter/biaya → selisih odometer ÷ konsumsi → jarak rute GPS
  (dibagi rata bila lebih dari satu unit turun bersamaan). Karena itu **KM awal/akhir wajib diisi**; kalau kru lupa,
  angka tetap keluar dari GPS tapi lebih kasar.
- **Harga Material** (`#/harga`): **Tambah material** (Kode 1–6 karakter, Nama, Kategori, Harga dasar, Urutan),
  **Edit** untuk mengubah nama/aktif-nonaktif, **Riwayat** untuk melihat harga dari waktu ke waktu.

---

## Membuat & mengelola akun tim

**Pengguna** (`#/pengguna`) → **+ Buat akun**:

| Field | Isi |
| --- | --- |
| Nama / Username | nama lengkap; username 3–40 karakter, huruf kecil, tanpa spasi |
| Peran | *Pemilik* · *Admin-Manajer* · *Purchasing* · *Kru* (hint di layar menjelaskan tiap peran) |
| Telepon / Area kerja | opsional, tapi berguna untuk pencatatan mitra |
| Password awal | minimal 8 karakter |
| **Wajib ganti password saat masuk pertama** | biarkan tercentang untuk karyawan baru |

Aksi per baris: **Edit** (termasuk menonaktifkan akun), **Reset sandi** (kosongkan isian agar sistem membuat
password acak yang hanya ditampilkan sekali, atau ketik password sementara), **Nonaktifkan/Aktifkan**,
**Riwayat kerja** (mitra temuannya). Akun yang dinonaktifkan langsung keluar dari semua sesi.
Baris bertanda **sandi wajib diganti** berarti pemiliknya belum mengganti password awal.

---

## Pengaturan

Yang diubah → dampaknya:

| Perubahan | Muncul di |
| --- | --- |
| Nama/alamat/telepon/kota perusahaan | Kop kwitansi, kop surat, footer dokumen |
| Nama & jabatan petugas kwitansi | Blok tanda tangan "Petugas PT. ..." |
| Nama & jabatan penandatangan surat | Kaki surat penawaran |
| Hari + jam pengambilan rutin, klausal | Badan surat penawaran (klausal mendukung placeholder `{material}`, `{day}`, `{time}`, `{start_date}`) |
| Subjek & catatan | Perihal surat; kalimat di bawah tabel kwitansi |
| Kode dokumen | Format nomor: `001/XSA/XI/2026` |
| Harga BBM default | Perhitungan biaya bila harga per jenis belum diisi |

---

## Jejak audit

**Jejak Audit** (`#/audit`) mencatat Waktu · Siapa · Aksi · Entitas · Detail (login, buat akun, terbit/lunas kwitansi,
ubah harga, hapus baris timbangan, ganti pengaturan). Filter **Karyawan**, **Entitas**, **Saring aksi**;
**Muat lebih banyak** menampilkan hingga 300 entri.

---

## Backup & pemulihan

```bash
npm run backup            # simpan basis data + foto ke backups/<waktu>
npm run backup -- --keep=14
```

Salin keluar dari server (Google Drive, rsync ke NAS, atau snapshot Hostinger). Pulihkan dengan langkah pada
`CARA-MULIHKAN.txt` yang ikut tertulis di folder backup — ingat bahwa `SESSION_SECRET` tidak tersimpan di basis data,
jadi jangan ganti nilai itu saat memulihkan.

---

## Tanya jawab

**Lupa password admin.** Dari terminal server:
`npm run new-admin -- --name="Sophian Rahardi" --username=sophian --role=admin` (akun baru), atau
login akun manager lain lalu **Pengguna → Reset sandi** pada akun tersebut.

**Angka timbangan salah.** Buka detail → **Tambah baris**/**Edit** koreksi *Penuh/Kosong/Minus* lalu **Hitung ulang**.
Kwitansi yang sudah terbit tidak berubah otomatis: batalkan kwitansi, periksa ulang, terbitkan kembali.

**Nomor surat/kwitansi melompat.** Nomornya per tahun dari penghitung; dokumen yang dibatalkan tetap memakai
nomornya. Itu normal dan justru menyulitkan pemalsuan.

**Foto tidak terunggah.** Maksimal 6 MB dan minimal 512 byte; aplikasi sudah mengecilkan foto dari HP, jadi biasanya
penyebabnya koneksi. Coba **Ambil foto timbangan** sekali lagi, lalu **Muat ulang**.

**Peta tidak menampilkan rute.** Kru belum menekan **Mulai lacak** (atau mematikan *Bagikan otomatis* di
**Lacak Tim**). Tanpa titik GPS, jarak memakai selisih odometer.

**Kru melihat biaya?** Tidak. Tab *Armada & BBM* di Laporan dan menu **Armada/Harga/Pengaturan/Pengguna/Jejak Audit**
hanya tampil untuk manager/pemilik.

---

Lihat juga: [panduan purchasing](panduan-purchasing.md) · [panduan kru](panduan-kru.md) ·
[deploy VPS Hostinger](deploy-vps-hostinger.md)
