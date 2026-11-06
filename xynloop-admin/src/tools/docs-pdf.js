/** Cetak panduan di docs/ menjadi PDF A4 memakai Edge/Chrome yang sudah terpasang.
 *  Pemakaian: npm run docs:pdf            -> semua panduan + satu bundel gabungan
 *             npm run docs:pdf -- --html -> hanya tulis HTML (untuk cek cepat)
 *  Tidak memakai layanan eksternal dan tanpa dependensi baru. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = path.join(APP, 'docs');
const OUT = path.join(DOCS, 'pdf');

const SERIES = [
  { file: 'panduan-admin.md', title: 'Panduan Pemakaian — Pemilik & Admin/Manajer' },
  { file: 'panduan-purchasing.md', title: 'Panduan Pemakaian — Bagian Purchasing' },
  { file: 'panduan-kru.md', title: 'Panduan Pemakaian — Kru Penjemputan' },
  { file: 'deploy-vps-hostinger.md', title: 'Panduan Deploy — VPS Hostinger & Domain .id' },
];

/* ------------------------------ markdown ------------------------------ */

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function inline(text) {
  const codes = [];
  let out = esc(text).replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    const target = /\.md($|#)/.test(href) ? href.replace(/\.md(#|$)/, '.pdf$1') : href;
    const ext = /^https?:/.test(target) ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${target}"${ext}>${label}</a>`;
  });
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${codes[i]}</code>`);
  return out;
}

const isTableSep = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

function listBlock(lines, start) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
    if (!m) {
      if (!lines[i].trim() && items.length && /^\s{2,}/.test(lines[i + 1] || '')) { i++; continue; }
      break;
    }
    const indent = m[1].length;
    const ordered = /\d/.test(m[2]);
    const body = [m[3]];
    i++;
    while (i < lines.length && (/^\s{2,}\S/.test(lines[i]) && !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i]))) {
      body.push(lines[i].trim());
      i++;
    }
    items.push({ indent, ordered, html: body.join(' ') });
  }
  const build = (level, from, to) => {
    const ordered = items[from].ordered;
    const tag = ordered ? 'ol' : 'ul';
    let html = `<${tag}>`;
    let k = from;
    while (k < to) {
      const item = items[k];
      let j = k + 1;
      while (j < to && items[j].indent > level) j++;
      const inner = j > k + 1 ? build(items[k + 1].indent, k + 1, j) : '';
      html += `<li>${inline(item.html)}${inner}</li>`;
      k = j;
    }
    return `${html}</${tag}>`;
  };
  return { html: build(items[0].indent, 0, items.length), next: i };
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let hindex = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      const id = `s${++hindex}`;
      out.push(`<h${lvl} id="${id}">${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }
    if (/^\s*([-*]){3,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${markdownToHtml(buf.join('\n'))}</blockquote>`);
      continue;
    }
    if (line.includes('|') && isTableSep(lines[i + 1] || '')) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>`
        + `${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      );
      continue;
    }
    if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
      const res = listBlock(lines, i);
      out.push(res.html);
      i = res.next;
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*>|\s*(?:[-*]|\d+\.)\s)/.test(lines[i])
      && !(lines[i].includes('|') && isTableSep(lines[i + 1] || ''))) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

/* ------------------------------- template ------------------------------- */

const CSS = `
@page { size: A4; margin: 17mm 15mm 18mm 15mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 10.5pt; line-height: 1.5; color: #16202a; margin: 0; }
.cover { border-left: 6px solid #14b26b; padding: 4mm 0 4mm 6mm; margin-bottom: 8mm; }
.cover .brand { font-size: 15pt; font-weight: 800; letter-spacing: .06em; color: #0f8f57; }
.cover .sub { color: #5b6b7a; font-size: 9.5pt; margin-top: 1mm; }
.cover h1 { margin: 2mm 0 0; font-size: 17pt; line-height: 1.25; }
h2 { font-size: 13pt; margin: 7mm 0 2mm; padding-bottom: 1.5mm; border-bottom: 1.5px solid #14b26b; }
h3 { font-size: 11.5pt; margin: 5mm 0 1.5mm; }
h4 { font-size: 10.5pt; margin: 4mm 0 1mm; color: #35485a; }
p { margin: 0 0 2.5mm; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.2mm; }
a { color: #0b6b4b; text-decoration: none; border-bottom: 1px dotted #7fb9a3; }
code { font-family: "Cascadia Mono", Consolas, "Liberation Mono", monospace; font-size: 9.3pt;
  background: #eef3f0; padding: .3mm 1mm; border-radius: 2px; }
pre { background: #f4f7f5; border: 1px solid #dfe7e2; border-left: 3px solid #14b26b; border-radius: 3px;
  padding: 3mm 4mm; margin: 0 0 4mm; overflow: hidden; }
pre code { background: none; padding: 0; font-size: 9pt; line-height: 1.45; display: block; white-space: pre-wrap; }
table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9.6pt; }
th { background: #eaf5ef; text-align: left; font-weight: 700; }
th, td { border: 1px solid #d6e2da; padding: 1.6mm 2mm; vertical-align: top; }
tbody tr:nth-child(even) td { background: #fafcfb; }
blockquote { margin: 0 0 4mm; padding: 2.5mm 4mm; background: #fff9ec; border-left: 3px solid #e3a008; color: #4a3c17; }
blockquote p:last-child { margin-bottom: 0; }
hr { border: 0; border-top: 1px solid #e2e8e4; margin: 6mm 0; }
.doc { page-break-after: always; }
.doc:last-child { page-break-after: auto; }
.foot { margin-top: 8mm; padding-top: 3mm; border-top: 1px solid #e2e8e4; font-size: 8.6pt; color: #6b7c8b; }
@media print { a { color: #0b6b4b; } }
`;

function page(title, bodyHtml, meta) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${CSS}</style></head><body>
<div class="cover"><div class="brand">XYNLOOP</div>
<div class="sub">Sistem Operasional PT. Xynra Sukses Abadi — ${esc(meta)}</div>
<h1>${esc(title)}</h1></div>
${bodyHtml}
<div class="foot">Dokumen ini dibuat otomatis dari berkas markdown di <code>docs/</code> pada repositori
<code>xynloop-admin</code>. Bila ada perbedaan, kode dan layar aplikasi yang berlaku.
Dibuat ${esc(meta)}.</div>
</body></html>`;
}

/* -------------------------------- cetak -------------------------------- */

function findBrowser() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find((c) => fs.existsSync(c));
}

const htmlOnly = process.argv.includes('--html');
fs.mkdirSync(OUT, { recursive: true });
const hariIni = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

const parts = [];
for (const doc of SERIES) {
  const src = path.join(DOCS, doc.file);
  if (!fs.existsSync(src)) { console.warn(`lewat (tidak ditemukan): ${doc.file}`); continue; }
  const body = markdownToHtml(fs.readFileSync(src, 'utf8'));
  const html = page(doc.title, body, hariIni);
  const base = doc.file.replace(/\.md$/, '');
  const htmlPath = path.join(OUT, `${base}.html`);
  fs.writeFileSync(htmlPath, html);
  parts.push(`<section class="doc">${body}</section>`);
  if (!htmlOnly) {
    const bin = findBrowser();
    if (!bin) { console.error('Edge/Chrome tidak ditemukan — jalankan dengan --html lalu cetak manual.'); break; }
    const pdfPath = path.join(OUT, `${base}.pdf`);
    const res = spawnSync(bin, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${path.join(os.tmpdir(), 'xynloop-pdf')}`,
      '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file:///${htmlPath.replace(/\\/g, '/')}`,
    ], { encoding: 'utf8' });
    const ok = fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 4000;
    console.log(`${ok ? 'ok  ' : 'GAGAL'} ${path.basename(pdfPath)}${ok ? ` (${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB)` : ` -> ${res.stderr?.slice(0, 200) || res.stdout?.slice(0, 200)}`}`);
  }
}

if (!htmlOnly && parts.length) {
  const htmlPath = path.join(OUT, 'Bundel-Panduan-XYNLOOP.html');
  fs.writeFileSync(htmlPath, page('Bundel Panduan XYNLOOP', parts.join('\n<hr>\n'), hariIni));
  const bin = findBrowser();
  const pdfPath = path.join(OUT, 'Bundel-Panduan-XYNLOOP.pdf');
  spawnSync(bin, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(os.tmpdir(), 'xynloop-pdf')}`,
    '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { encoding: 'utf8' });
  console.log(`${fs.existsSync(pdfPath) ? 'ok  ' : 'GAGAL'} ${path.basename(pdfPath)} (${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB) — ${parts.length} panduan dalam satu berkas`);
}

console.log(`\nFolder hasil: ${OUT}`);
