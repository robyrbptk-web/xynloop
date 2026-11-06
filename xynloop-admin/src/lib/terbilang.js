const SATUAN = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan',
  'sepuluh', 'sebelas',
];

/** 0 - 999 menjadi kata. */
function kelompok(n) {
  if (n === 0) return '';
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${SATUAN[n - 10]} belas`;
  if (n < 100) {
    const p = SATUAN[Math.floor(n / 10)];
    const s = kelompok(n % 10);
    return `${p} puluh${s ? ' ' + s : ''}`;
  }
  const r = n < 200 ? 'seratus' : `${SATUAN[Math.floor(n / 100)]} ratus`;
  const s = kelompok(n % 100);
  return s ? `${r} ${s}` : r;
}

/** Bilangan rupiah menjadi kata, mis. 1.500.000 -> "satu juta rupiah". */
export function terbilang(amount) {
  const value = Math.round(Number(amount) || 0);
  if (value === 0) return 'nol rupiah';
  const n = Math.abs(value);
  const bagian = [
    { divisor: 1_000_000_000, label: 'miliar' },
    { divisor: 1_000_000, label: 'juta' },
    { divisor: 1_000, label: 'ribu' },
    { divisor: 1, label: '' },
  ];
  const kata = [];
  let sisa = n;
  for (const { divisor, label } of bagian) {
    const jumlah = Math.floor(sisa / divisor);
    sisa -= jumlah * divisor;
    if (!jumlah) continue;
    if (label === 'ribu' && jumlah === 1) kata.push('seribu');
    else if (label) kata.push(`${kelompok(jumlah)} ${label}`);
    else kata.push(kelompok(jumlah));
  }
  const text = kata.join(' ').replace(/\s+/g, ' ').trim();
  return `${value < 0 ? 'minus ' : ''}${text} rupiah`;
}
