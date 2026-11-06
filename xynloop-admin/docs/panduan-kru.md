# Panduan Penggunaan — Kru Penjemputan / Pengambilan

Untuk koordinator, pengemudi, penimbang, dan kru lapangan. Sebagian besar kerja dilakukan dari **HP** saat berada
di lokasi mitra. Menu yang tampil untuk akun kru: **Dashboard · Papan Penjemputan · Riwayat Pengambilan · Data Mitra ·
Kwitansi · Lacak Tim · Laporan**. Anda tidak melihat Prospek & Kunjungan, Surat Penawaran, Armada & BBM, Harga Material,
Pengguna, Pengaturan, atau Jejak Audit.

---

## Urutan kerja satu pengambilan

### 1. Sebelum berangkat — **Papan Penjemputan** (`#/papan`)

Lima kolom: **Terjadwal · Di jalan · Menimbang · Selesai · Batal**. Cari kartu mitra Anda hari itu; di situ tertulis
mitra, kode `PGB-YYYYMMDD-NNN`, wilayah, jam, nama kru, nomor polisi mobil, dan jumlah yang diperkirakan.

Tekan **Berangkat** saat mobil jalan. Kartu pindah ke kolom *Di jalan* — dari sinilah hitungan jarak mulai dipakai.
Berhalangan? Tekan **Batalkan pengambilan** dan tulis **Alasan** (mis. hujan deras, mitra minta mundur).

### 2. Di perjalanan — **Lacak Tim** (`#/tracking`)

- **Mulai lacak** (atau **Kirim lokasi sekarang** sekali saja) agar posisi tim terlihat di kantor.
- **Bagikan otomatis** mengirim titik setiap menit; **Hentikan otomatis** bila sedang berhenti lama di tempat sensitif.
- Jangan keluar dari aplikasi tanpa menekan berhenti bila tidak perlu — jarak GPS dipakai sistem menghitung BBM
  ketika odometer tidak diisi.

Peta digambar aplikasi sendiri (tanpa layanan peta eksternal), jadi tetap jalan meski sinyal lemah; titik terakhir
tersimpan begitu koneksi kembali.

### 3. Sampai di lokasi — **Menimbang**

Tekan **Timbang** pada kartu (atau buka **Detail Pengambilan** → **Mulai menimbang**). Lalu **+ Tambah baris**
untuk setiap jenis barang:

| Isian | Contoh | Catatan |
| --- | --- | --- |
| **Bahan** | Kardus/Dus (OCC), HVS, Koran, Kertas Campur, Minyak Jelantah | Harga satuan otomatis mengikuti harga tanggal ini |
| **Timbangan penuh** | 533 | angka timbangan saat masih ada wadah/kemasan |
| **Timbangan kosong** | 48 | karos/kaleng/ember |
| **Minus (%)** | 6 | potongan kadar air/kotor, kosongkan bila tidak ada |
| **Bersih** & **Jumlah** | 485 kg · Rp 703.250 | dihitung otomatis: `(penuh − kosong) × (1 − minus%)` lalu × harga |
| **Catatan** | "dus basah" | berguna saat direkap |
| **Disaksikan perwakilan mitra** | nama yang melihat | dikuatkan pada kwitansi |
| **Ambil foto timbangan** | foto angka timbangan + barang | wajib bila nilai besar / ada minus |

Lanjut terus sampai semua barang terhitung, lalu **Tandai selesai**. Foto **bukti pembelian** (tumpukan barang,
nota, serah terima) diunggah pada bagian **Foto bukti pembelian**.

### 4. Kendaraan & BBM

Di bagian **Kendaraan** dalam detail, isi **KM awal** saat berangkat dan **KM akhir** saat pulang. Kalau dua mobil
turun, masing-masing punya barisnya sendiri (**+ Tambah armada**). Bila Anda tahu liter isi SPBU hari itu, isi saja
**liter/biaya manual** — angka manual selalu mengalahkan hasil hitungan km.

### 5. Kwitansi

Buka **Kwitansi** (`#/kwitansi`) atau tombol **Buat kwitansi** di detail pengambilan. Isian sudah terisi dari timbangan:
hari/tanggal, nama & alamat penjual, nomor pengambilan, tabel maksimal 7 baris, total, dan **Terbilang**.

1. **Terbitkan** → nomor otomatis, mis. `019/XSA/XI/2026`.
2. **Cetak** → halaman A4; pilih **Save as PDF** untuk mengirim berkas ke kantor, atau cetak lalu minta tanda tangan mitra.
3. Uang sudah dibayar → **Tandai lunas**. Kwitansi lunas terkunci dan tidak bisa diubah lagi oleh Anda.
4. Salah angka? Lapor manajer — hanya manajer/pemilik yang bisa **Batalkan** kwitansi lalu membuat ulang.

---

## Yang boleh dan tidak boleh

| Aksi | Kru |
| --- | --- |
| Membuat/mengubah pengambilan & baris timbangan miliknya | ✅ sampai status **Selesai** |
| Mengubah hasil setelah **Selesai** | ❌ minta manajer memakai **Hitung ulang** |
| Menghapus baris timbangan pada run selesai | ❌ hanya manajer |
| **Terbitkan** & **Tandai lunas** kwitansi (uang tunai sudah diserahkan) | ✅ |
| **Batalkan** kwitansi, mengoreksi kwitansi yang sudah **Lunas** | ❌ hanya manajer/pemilik |
| Melihat biaya BBM & Rp/kg | ❌ — Laporan Anda hanya 6 tab tanpa *Armada & BBM*, KPI tanpa kartu *Biaya BBM* |
| Melihat data tim lain | ❌ tertulis **"angka di atas hanya mencakup mitra dan pengambilan yang terkait dengan Anda."** |

Angka BBM dan jarak hari itu tetap dihitung kantor dari km/GPS yang Anda isi, jadi kolom itu jangan dilewati.

---

## Tips praktis di lapangan

- **Sinyal hilang?** Halaman tetap terbuka (sudah termuat); pengiriman data gagal dan bisa diulang. Jangan tekan
  **Tandai selesai** dua kali — periksa status kartunya lebih dulu lewat **Muat ulang**.
- **Foto terlalu besar?** Aplikasi mengecilkan ke 1400 piksel sebelum dikirim; batas server 6 MB. Foto dari kamera HP
  biasanya aman tanpa diatur ulang.
- **Mitra menolak angka timbangan.** Catat namanya pada **Disaksikan perwakilan mitra** dan unggah foto timbangan;
  itu dasar yang dipakai saat kwitansi ditandatangani.
- **Barang campuran.** Pecah jadi beberapa baris per **Bahan**, jangan digabung satu baris — laporan material &
  harga rata-rata jadi benar.
- **Lupa KM.** Isi manual di SPBU struk bila ada, atau biarkan sistem memakai jarak GPS dan tuliskan di **Catatan**.

---

## Tanya jawab

**Password diminta ganti terus.** Password minimal 8 karakter dan harus mengandung huruf **dan** angka.
**Akun saya tidak menemukan penugasan.** Cari di **Riwayat Pengambilan** (penyaring *Status* → *Terjadwal*) atau minta
koordinator menambahkan Anda pada kartu lewat **+ Tambah kru** (peran Koordinator/Pengemudi/Kru/Penimbang).
**Peta kantor tidak melihat posisi saya.** Pastikan **Lacak Tim → Bagikan otomatis** aktif dan browser HP diizinkan
mengakses lokasi. **Salah tekan **Selesai**.** Segera lapor manajer; ia bisa menghitung ulang atau membatalkan kwitansi
yang terlanjur terbit.

---

Lihat juga: [panduan purchasing](panduan-purchasing.md) · [panduan admin](panduan-admin.md)
