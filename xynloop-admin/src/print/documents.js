import { terbilang } from '../lib/terbilang.js';

export const rupiah = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
export const angka = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function tanggalPanjang(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export function hariDari(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : HARI[d.getDay()];
}

const BASE_CSS = `
  @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11.5pt; color: #111; margin: 0; background: #eceef0; }
  .sheet { background: #fff; width: 210mm; min-height: 297mm; margin: 10mm auto; padding: 14mm; box-shadow: 0 2px 12px rgba(0,0,0,.16); }
  .kop { display: flex; align-items: flex-start; gap: 12px; border-bottom: 3px double #16342a; padding-bottom: 8px; }
  .kop img { width: 54px; height: 54px; object-fit: contain; }
  .kop .nama { font-size: 15pt; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; }
  .kop .merek { font-size: 10pt; font-weight: 700; color: #3e9b3a; letter-spacing: 2px; }
  .kop .alamat { font-size: 9.5pt; line-height: 1.35; color: #333; }
  .judul { text-align: center; margin: 14px 0 4px; }
  .judul h1 { font-size: 13pt; margin: 0; text-decoration: underline; letter-spacing: .5px; }
  .judul .nonor { font-size: 10.5pt; margin-top: 2px; }
  table { border-collapse: collapse; width: 100%; }
  .meta td { padding: 2.5px 0; vertical-align: top; font-size: 11pt; }
  .meta td.l { width: 132px; }
  .meta td.s { width: 14px; }
  .items { margin-top: 10px; }
  .items th, .items td { border: 1px solid #222; padding: 4px 6px; font-size: 10.5pt; }
  .items th { background: #eef3ec; text-align: center; font-weight: 700; }
  .items td.n, .items td.u { text-align: right; }
  .items td.c { text-align: center; }
  .items tr.total td { font-weight: 700; background: #f6f8f4; }
  .items tr.empty td { height: 13px; }
  .bayar { margin-top: 10px; font-size: 11pt; }
  .bayar td { padding: 3px 0; vertical-align: top; }
  .bayar td.l { width: 150px; }
  .catatan { margin-top: 8px; font-size: 10pt; font-style: italic; }
  .ttd { margin-top: 22px; display: flex; justify-content: space-between; gap: 20px; font-size: 11pt; }
  .ttd .kotak { width: 47%; }
  .ttd .kosong { height: 58px; }
  .ttd .nama-ttd { border-top: 1px solid #222; padding-top: 3px; display: inline-block; min-width: 170px; }
  .metode { margin-top: 6px; font-size: 11pt; }
  .kotak-cb { display: inline-block; width: 11px; height: 11px; border: 1px solid #222; vertical-align: -1px; margin-right: 5px; }
  .cb-aktif { background: #222; position: relative; }
  .cb-aktif::after { content: "\\2713"; color: #fff; font-size: 9px; position: absolute; left: 1.5px; top: -3px; }
  .halaman-baru { page-break-before: always; }
  .isi-letter p { text-align: justify; margin: 0 0 9px; line-height: 1.5; }
  .isi-letter ol { margin: 0 0 10px 0; padding-left: 26px; line-height: 1.5; text-align: justify; }
  .isi-letter ol li { margin-bottom: 6px; }
  .lampiran-title { text-align: center; margin: 0 0 12px; }
  .lampiran-title h2 { font-size: 12.5pt; margin: 0 0 4px; text-decoration: underline; }
  .lampiran-title div { font-size: 10.5pt; }
  .foto { margin-top: 14px; }
  .foto h3 { font-size: 10.5pt; margin: 0 0 6px; }
  .foto .gal { display: flex; flex-wrap: wrap; gap: 8px; }
  .foto img { width: 116px; height: 88px; object-fit: cover; border: 1px solid #999; }
  .kaki { margin-top: 18px; border-top: 1px solid #bbb; padding-top: 5px; font-size: 8.5pt; color: #555; display: flex; justify-content: space-between; }
  .toolbar { position: sticky; top: 0; background: #16342a; color: #fff; padding: 9px 14px; display: flex; gap: 10px; align-items: center; font-family: system-ui, sans-serif; font-size: 13px; z-index: 5; }
  .toolbar button, .toolbar a { background: #8cc63f; color: #12271c; border: 0; border-radius: 6px; padding: 7px 13px; font-weight: 600; cursor: pointer; text-decoration: none; font-size: 13px; }
  .toolbar .b { background: transparent; color: #e6f0e8; border: 1px solid #4a6b5d; }
  .toolbar .info { opacity: .8; }
  @media print { body { background: #fff; } .sheet { box-shadow: none; margin: 0; width: auto; min-height: 0; padding: 0; } .no-print { display: none !important; } }
`;

function shell({ title, body, actions = '', brandMark }) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>${BASE_CSS}</style></head><body>
<div class="toolbar no-print">
  <button onclick="window.print()">Cetak / Simpan PDF</button>
  ${actions}
  <span class="info">Pilih "Save as PDF" pada tujuan printer untuk menyimpan sebagai berkas digital.</span>
</div>
${body}
</body></html>`;
}

function kop(company, brandMark) {
  return `<div class="kop">
  ${brandMark ? `<img src="${escapeHtml(brandMark)}" alt="logo">` : ''}
  <div>
    <div class="nama">${escapeHtml(company.name)}</div>
    <div class="merek">${escapeHtml(company.brand || '')}</div>
    <div class="alamat">${escapeHtml(company.address)}<br>Telp/WhatsApp: ${escapeHtml(company.phone)}</div>
  </div>
</div>`;
}

/* ================================ KWITANSI ================================ */

export function renderKwitansi({ receipt, snapshot, company, note, photos = [], brandMark = '/brand/logo.png' }) {
  const lines = snapshot?.lines || [];
  const hasOil = lines.some((l) => l.category === 'jelantah');
  const hasPaper = lines.some((l) => l.category === 'kertas');
  const judulKolom = hasOil && !hasPaper ? 'Jenis Minyak Jelantah' : hasOil && hasPaper ? 'Jenis Barang' : 'Jenis Kertas Bekas';
  const satuanHeader = hasOil && hasPaper ? 'Hasil Timbangan (kg/liter)' : hasOil ? 'Volume (liter)' : 'Hasil Timbangan (kg)';

  let rowsHtml = '';
  for (let i = 0; i < Math.max(7, lines.length); i++) {
    const l = lines[i];
    if (!l) {
      rowsHtml += `<tr class="empty"><td class="c">${i + 1}</td><td></td><td></td><td></td><td></td></tr>`;
      continue;
    }
    const u = l.unit === 'liter' ? 'l' : 'kg';
    const ket = [
      l.gross_weight ? `kotor ${angka(l.gross_weight)} ${u}` : '',
      l.tare_weight ? `tare ${angka(l.tare_weight)} ${u}` : '',
      l.minus_pct ? `minus ${angka(l.minus_pct)}%` : '',
    ].filter(Boolean).join('; ');
    const keterangan = ket ? `<div style="font-size:8.5pt;color:#555">${ket}</div>` : '';
    rowsHtml += `<tr>
      <td class="c">${i + 1}</td>
      <td>${escapeHtml(l.name)}${keterangan}</td>
      <td class="n">${angka(l.qty)}${l.unit === 'liter' ? ' l' : ' kg'}</td>
      <td class="n">${rupiah(l.unit_price).replace('Rp ', '')}</td>
      <td class="n">${rupiah(l.amount).replace('Rp ', '')}</td>
    </tr>`;
  }

  const tunAktif = receipt.method === 'tunai' ? ' cb-aktif' : '';
  const trfAktif = receipt.method === 'transfer' ? ' cb-aktif' : '';
  const statusBadge = receipt.status === 'lunas' ? 'LUNAS' : receipt.status === 'terbit' ? 'TERBIT' : receipt.status === 'batal' ? 'BATAL' : 'DRAF';

  return shell({
    title: `Kwitansi ${receipt.number}`,
    brandMark,
    body: `<div class="sheet">
  ${kop(company, brandMark)}
  <div class="judul">
    <h1>KWITANSI PEMBELIAN ${hasOil && !hasPaper ? 'MINYAK JELANTAH' : 'KERTAS BEKAS'}</h1>
    <div class="nonor">No. ${escapeHtml(receipt.number)} &nbsp;·&nbsp; ${escapeHtml(statusBadge)}</div>
  </div>
  <table class="meta">
    <tr><td class="l">No. Kwitansi</td><td class="s">:</td><td>${escapeHtml(receipt.number)}</td></tr>
    <tr><td class="l">Hari/Tanggal</td><td class="s">:</td><td>${escapeHtml(hariDari(receipt.issued_at))}, ${escapeHtml(tanggalPanjang(receipt.issued_at))}</td></tr>
    <tr><td class="l">Dibayarkan kepada</td><td class="s">:</td><td>${escapeHtml(receipt.seller_name)}</td></tr>
    <tr><td class="l">Alamat</td><td class="s">:</td><td>${escapeHtml(receipt.seller_address)}</td></tr>
    <tr><td class="l">No. Telp/WhatsApp</td><td class="s">:</td><td>${escapeHtml(receipt.seller_phone || '-')}</td></tr>
    ${snapshot?.pickup_code ? `<tr><td class="l">No. Pengambilan</td><td class="s">:</td><td>${escapeHtml(snapshot.pickup_code)}</td></tr>` : ''}
  </table>
  <table class="items">
    <thead><tr><th style="width:26px">No</th><th>${escapeHtml(judulKolom)}</th><th style="width:104px">${escapeHtml(satuanHeader)}</th><th style="width:96px">Harga per ${hasOil && !hasPaper ? 'liter' : hasPaper && hasOil ? 'satuan' : 'kg'} (Rp)</th><th style="width:104px">Jumlah (Rp)</th></tr></thead>
    <tbody>${rowsHtml}
      <tr class="total"><td colspan="2" class="c">TOTAL</td><td class="n">${angka((snapshot?.paper_kg || 0) + (snapshot?.oil_liters || 0))}</td><td></td><td class="n">${rupiah(receipt.total).replace('Rp ', '')}</td></tr>
    </tbody>
  </table>
  <table class="bayar">
    <tr><td class="l">Total Pembayaran</td><td class="s">:</td><td><b>${rupiah(receipt.total)}</b></td></tr>
    <tr><td class="l">Terbilang</td><td class="s">:</td><td><i>${escapeHtml(terbilang(receipt.total))}</i></td></tr>
  </table>
  <div class="metode">Metode Pembayaran:
    <span class="kotak-cb${tunAktif}"></span> Tunai &nbsp;&nbsp;
    <span class="kotak-cb${trfAktif}"></span> Transfer
    ${receipt.method === 'transfer' && receipt.paid_at ? `<span style="font-size:10pt"> &nbsp;·&nbsp; dibayar ${escapeHtml(tanggalPanjang(String(receipt.paid_at).slice(0, 10)))}</span>` : ''}
  </div>
  ${note ? `<div class="catatan">Catatan: ${escapeHtml(note)}</div>` : ''}
  <div class="ttd">
    <div class="kotak">
      <div>Penjual,</div><div class="kosong"></div>
      <div class="nama-ttd">( .................................... )</div>
      <div style="font-size:9.5pt">Nama jelas</div>
    </div>
    <div class="kotak">
      <div>${escapeHtml(company.city)}, ${escapeHtml(tanggalPanjang(receipt.issued_at))}</div>
      <div>Petugas ${escapeHtml(company.name)},</div><div class="kosong"></div>
      <div class="nama-ttd">${escapeHtml(receipt.staff_name || '')}</div>
      <div style="font-size:9.5pt">${escapeHtml(receipt.staff_title || '')}</div>
    </div>
  </div>
  ${photos.length ? `<div class="foto"><h3>Bukti foto</h3><div class="gal">${photos.map((p) => `<img src="/files/${encodeURI(p.path)}" alt="">`).join('')}</div></div>` : ''}
  <div class="kaki"><span>${escapeHtml(company.brand || '')} · Sistem Operasional ${escapeHtml(company.name)}</span><span>Cetak: ${escapeHtml(new Date().toLocaleString('id-ID'))}</span></div>
</div>`,
    actions: `<a class="b" href="/#/receipts/${receipt.id}">Kembali</a>`,
  });
}

/* ============================= SURAT PENAWARAN ============================= */

const MATERI_LABEL = {
  kertas: 'kertas bekas',
  jelantah: 'minyak jelantah',
  campur: 'kertas bekas dan minyak jelantah',
};

export function renderPenawaran({ offer, company, clauses = [], subject, photos = [], brandMark = '/brand/logo.png' }) {
  const materi = MATERI_LABEL[offer.category] || 'kertas bekas';
  const startDate = offer.start_date || offer.issued_at;
  const isIbu = ['terkirim', 'diterima', 'kadaluarsa'].includes(offer.status);
  const pembuka = isIbu
    ? `Terima kasih atas kerja sama yang telah terjalin selama ini antara Bapak/Ibu dengan ${escapeHtml(company.name)} dalam pembelian ${materi}. Untuk menjaga kelancaran dan kesinambungan kerja sama tersebut, kami bermaksud menawarkan kepada Bapak/Ibu untuk menjadi Mitra Tetap ${escapeHtml(company.name)} dengan ketentuan sebagai berikut:`
    : `Sehubungan dengan upaya perluasan kemitraan pembelian ${materi}, dengan ini kami bermaksud mengajak Bapak/Ibu untuk menjadi Mitra Tetap ${escapeHtml(company.name)} dengan ketentuan sebagai berikut:`;

  const hari = offer.schedule_day || hariDari(startDate);
  const listItems = clauses
    .map((raw) => String(raw)
      .replaceAll('{material}', materi)
      .replaceAll('{day}', offer.schedule_day || '')
      .replaceAll('{time}', offer.schedule_time || '')
      .replaceAll('{start_date}', `${hari}, ${tanggalPanjang(startDate)}`)
      .replaceAll('{company}', company.name))
    .map((c) => `<li>${escapeHtml(c)}</li>`)
    .join('');

  const tanggapan = (choice) => `<span class="kotak-cb${offer.response_choice === choice ? ' cb-aktif' : ''}"></span> ${choice === 'bersedia' ? 'BERSEDIA' : 'TIDAK BERSEDIA'}`;

  return shell({
    title: `Surat Penawaran ${offer.number}`,
    brandMark,
    body: `<div class="sheet">
  ${kop(company, brandMark)}
  <table class="meta" style="margin-top:12px">
    <tr><td class="l">Nomor</td><td class="s">:</td><td>${escapeHtml(offer.number)}</td></tr>
    <tr><td class="l">Lampiran</td><td class="s">:</td><td>1 (satu) lembar</td></tr>
    <tr><td class="l">Perihal</td><td class="s">:</td><td>${escapeHtml(subject || 'Penawaran Kerja Sama Mitra Tetap')}</td></tr>
  </table>
  <div style="text-align:right; margin-top:6px">${escapeHtml(company.city)}, ${escapeHtml(tanggalPanjang(offer.issued_at))}</div>
  <div style="margin:10px 0">Kepada Yth.<br>Bapak/Ibu Calon Mitra Penjual ${escapeHtml(materi)}<br>di Tempat</div>
  <div class="isi-letter">
    <p>Dengan hormat,</p>
    <p>${pembuka}</p>
    <ol>${listItems}</ol>
    <p>Apabila Bapak/Ibu berkenan, mohon mengisi tanggapan pada lembar tanggapan terlampir dan menyerahkannya kepada petugas kami. Untuk informasi lebih lanjut, Bapak/Ibu dapat menghubungi kami melalui telepon/WhatsApp di ${escapeHtml(company.phone)}.</p>
    <p>Demikian penawaran ini kami sampaikan. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.</p>
  </div>
  <div class="ttd">
    <div class="kotak"></div>
    <div class="kotak">
      <div>Hormat kami,</div>
      <div><b>${escapeHtml(company.name)}</b></div>
      <div class="kosong"></div>
      <div class="nama-ttd">${escapeHtml(offer.signed_by_name || '')}</div>
      <div style="font-size:9.5pt">${escapeHtml(offer.signed_by_title || '')}</div>
    </div>
  </div>
  <div class="kaki"><span>${escapeHtml(company.brand || '')} · ${escapeHtml(company.name)}</span><span>Nomor ${escapeHtml(offer.number)}</span></div>
</div>
<div class="sheet halaman-baru">
    ${kop(company, brandMark)}
    <div class="lampiran-title" style="margin-top:16px">
      <h2>LEMBAR TANGGAPAN</h2>
      <div>Penawaran Kerja Sama Mitra Tetap ${escapeHtml(materi)} — Nomor: ${escapeHtml(offer.number)}</div>
    </div>
    <p style="font-size:10.5pt; margin:0 0 12px">Mohon lembar ini diisi dan diserahkan kembali kepada petugas ${escapeHtml(company.name)}.</p>
    <table class="items">
      <thead><tr><th style="background:#eef3ec">TANGGAPAN PENAWARAN MITRA TETAP</th></tr></thead>
      <tbody><tr><td style="padding:12px">
        <div>Saya yang bertanda tangan di bawah ini:</div>
        <table class="meta" style="margin-top:10px">
          <tr><td class="l" style="width:120px">Nama</td><td class="s">:</td><td>${offer.response_name ? escapeHtml(offer.response_name) : '................................................................................................'}</td></tr>
          <tr><td class="l">Alamat</td><td class="s">:</td><td>${offer.response_address ? escapeHtml(offer.response_address) : '................................................................................................'}</td></tr>
          <tr><td class="l">No. WhatsApp</td><td class="s">:</td><td>${offer.response_phone ? escapeHtml(offer.response_phone) : '................................................................................................'}</td></tr>
        </table>
        <div style="margin-top:14px">menyatakan:&nbsp;&nbsp;${tanggapan('bersedia')}&nbsp;&nbsp;&nbsp;&nbsp;${tanggapan('tidak')}</div>
        <div style="margin-top:12px; text-align:justify">menjadi Mitra Tetap ${escapeHtml(company.name)} dan menjual seluruh ${escapeHtml(materi)} kepada ${escapeHtml(company.name)}.</div>
      </td></tr></tbody>
    </table>
    <div class="ttd" style="margin-top:34px">
      <div class="kotak"></div>
      <div class="kotak">
        <div>${escapeHtml(company.city)}, ${offer.response_date ? escapeHtml(tanggalPanjang(offer.response_date)) : '.........................'}</div>
        <div class="kosong"></div>
        <div class="nama-ttd">( .................................... )</div>
      </div>
    </div>
    ${photos.length ? `<div class="foto"><h3>Lembar tanggapan (foto)</h3><div class="gal">${photos.map((p) => `<img src="/files/${encodeURI(p.path)}" alt="">`).join('')}</div></div>` : ''}
    <div class="kaki"><span>${escapeHtml(company.brand || '')} · ${escapeHtml(company.name)}</span><span>Lampiran surat ${escapeHtml(offer.number)}</span></div>
</div>`,
    actions: `<a class="b" href="/#/offers/${offer.id}">Kembali</a>`,
  });
}
