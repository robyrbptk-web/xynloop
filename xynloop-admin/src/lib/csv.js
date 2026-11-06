/** Bangun CSV (dengan BOM agar Excel membaca UTF-8 dengan benar). */
export function toCsv(rows, headers) {
  const cols = headers && headers.length ? headers : Object.keys(rows[0] || {});
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const name = (c) => (typeof c === 'object' ? c.label : c);
  const value = (row, c) => (typeof c === 'object' ? row[c.key] : row[c]);
  const lines = [
    [
      '\uFEFF' + cell(name(cols[0])),
      ...cols.slice(1).map((c) => cell(name(c))),
    ].join(','),
  ];
  for (const row of rows) lines.push(cols.map((c) => cell(value(row, c))).join(','));
  return lines.join('\r\n');
}
