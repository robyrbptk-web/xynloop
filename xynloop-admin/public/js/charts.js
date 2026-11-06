/** Grafik SVG tanpa dependensi — cukup untuk laporan dan dashboard. */
import { angka, esc } from './ui.js';

export const PALET = ['#3e9b3a', '#167d6b', '#8cc63f', '#6cc24a', '#b9c8c0', '#55665f', '#2b3b36', '#a5b5ad'];
const NS = 'http://www.w3.org/2000/svg';

function svg(width, height, inner, extra = '') {
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" ${extra}>${inner}</svg>`;
}

function niceMax(v) {
  if (!(v > 0)) return 10;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

function gridLines(w, h, pad, max, fmt, rows = 4) {
  let out = '';
  for (let i = 0; i <= rows; i++) {
    const y = pad.t + ((h - pad.t - pad.b) * i) / rows;
    const val = max * (1 - i / rows);
    out += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${w - pad.r}" y2="${y.toFixed(1)}" class="grid"/>`;
    out += `<text x="${pad.l - 6}" y="${(y + 3.5).toFixed(1)}" class="ax yr" text-anchor="end">${esc(fmt(val))}</text>`;
  }
  return out;
}

function xLabels(labels, w, h, pad, skip) {
  let out = '';
  const inner = w - pad.l - pad.r;
  labels.forEach((l, i) => {
    if (i % skip !== 0) return;
    const x = pad.l + (inner / labels.length) * (i + 0.5);
    out += `<text x="${x.toFixed(1)}" y="${h - pad.b + 16}" class="ax" text-anchor="middle">${esc(l)}</text>`;
  });
  return out;
}

export function legend(items) {
  if (!items || items.length < 2) return '';
  return `<div class="legend">${items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div>`;
}

/** Batang (opsi bertumpuk). */
export function barChart({ labels = [], series = [], height = 200, stacked = false, format = (v) => angka(Math.round(v)), colors = PALET }) {
  const w = Math.max(320, labels.length * (stacked ? 44 : 34 * series.length + 22));
  const pad = { l: 52, r: 10, t: 12, b: 26 };
  const totals = labels.map((_, i) => (stacked ? series.reduce((s, se) => s + (Number(se.values[i]) || 0), 0) : Math.max(...series.map((se) => Number(se.values[i]) || 0), 0)));
  const max = niceMax(Math.max(...totals, 0));
  const inner = w - pad.l - pad.r;
  const bw = inner / Math.max(1, labels.length);
  const usable = series.length ? Math.min(bw * 0.62, 26) : 0;
  const single = Math.min(bw * 0.62, 22);
  const groupWidth = single * series.length + (series.length - 1) * 3;
  let body = gridLines(w, height, pad, max, format);
  labels.forEach((_, i) => {
    const cx = pad.l + bw * (i + 0.5);
    if (stacked) {
      let acc = 0;
      series.forEach((se, si) => {
        const v = Number(se.values[i]) || 0;
        if (!v) return;
        const h1 = ((height - pad.t - pad.b) * acc) / max;
        const h2 = ((height - pad.t - pad.b) * v) / max;
        const y = height - pad.b - h1 - h2;
        body += `<rect class="bar" x="${(cx - usable / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${usable.toFixed(1)}" height="${Math.max(1, h2).toFixed(1)}" fill="${se.color || colors[si % colors.length]}"><title>${esc(se.name)}: ${esc(format(v))}</title></rect>`;
        acc += v;
      });
    } else {
      series.forEach((se, si) => {
        const v = Number(se.values[i]) || 0;
        const x = cx - groupWidth / 2 + si * (single + 3);
        const hgt = ((height - pad.t - pad.b) * v) / max;
        body += `<rect class="bar" x="${x.toFixed(1)}" y="${(height - pad.b - hgt).toFixed(1)}" width="${single.toFixed(1)}" height="${Math.max(1, hgt).toFixed(1)}" rx="3" fill="${se.color || colors[si % colors.length]}"><title>${esc(se.name)}: ${esc(format(v))}</title></rect>`;
      });
    }
  });
  const skip = Math.ceil(labels.length / Math.floor(inner / 54)) || 1;
  body += xLabels(labels, w, height, pad, skip);
  return { html: `<div class="chartwrap">${svg(w, height, body)}</div>`, legend: legend(series.map((s, i) => ({ label: s.name, color: s.color || colors[i % colors.length] }))) };
}

export function lineChart({ labels = [], series = [], height = 200, format = (v) => angka(Math.round(v)), area = true, colors = PALET }) {
  const w = Math.max(320, labels.length * 46);
  const pad = { l: 52, r: 12, t: 12, b: 26 };
  const max = niceMax(Math.max(...series.flatMap((s) => s.values.map(Number)), 0));
  const inner = w - pad.l - pad.r;
  const stepX = labels.length > 1 ? inner / (labels.length - 1) : 0;
  let body = gridLines(w, height, pad, max, format);
  series.forEach((se, si) => {
    const color = se.color || colors[si % colors.length];
    const pts = se.values.map((v, i) => [pad.l + stepX * i, height - pad.b - ((height - pad.t - pad.b) * (Number(v) || 0)) / max]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    if (area && pts.length > 1) {
      body += `<path d="${d} L${pts[pts.length - 1][0].toFixed(1)},${height - pad.b} L${pts[0][0].toFixed(1)},${height - pad.b} Z" fill="${color}" opacity=".12"/>`;
    }
    body += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    pts.forEach((p, i) => {
      body += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#fff" stroke="${color}" stroke-width="2"><title>${esc(labels[i])}: ${esc(format(se.values[i]))}</title></circle>`;
    });
  });
  const skip = Math.ceil(labels.length / Math.floor(inner / 58)) || 1;
  labels.forEach((l, i) => {
    if (i % skip) return;
    body += `<text x="${(pad.l + stepX * i).toFixed(1)}" y="${height - pad.b + 16}" class="ax" text-anchor="middle">${esc(l)}</text>`;
  });
  return { html: `<div class="chartwrap">${svg(w, height, body)}</div>`, legend: legend(series.map((s, i) => ({ label: s.name, color: s.color || colors[i % colors.length] }))) };
}

export function donut({ slices = [], size = 168, thickness = 26, centerTop = '', centerSub = '', format = (v) => angka(v) }) {
  const total = slices.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  let body = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#eef3ec" stroke-width="${thickness}"/>`;
  slices.forEach((s, i) => {
    const v = Number(s.value) || 0;
    if (!v || !total) return;
    const len = (c * v) / total;
    body += `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.color || PALET[i % PALET.length]}" stroke-width="${thickness}"
      stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cx})" stroke-linecap="butt"><title>${esc(s.label)}: ${esc(format(v))}</title></circle>`;
    offset += len;
  });
  if (total) {
    body += `<text x="${cx}" y="${cx - 2}" text-anchor="middle" class="dn-top">${esc(centerTop || format(total))}</text>`;
    if (centerSub) body += `<text x="${cx}" y="${cx + 16}" text-anchor="middle" class="dn-sub">${esc(centerSub)}</text>`;
  } else {
    body += `<text x="${cx}" y="${cx + 4}" text-anchor="middle" class="dn-sub">Tidak ada data</text>`;
  }
  return {
    html: `<div class="donutwrap">${svg(size, size, body)}</div>`,
    legend: `<div class="legend">${slices.map((s, i) => `<span><i style="background:${s.color || PALET[i % PALET.length]}"></i>${esc(s.label)} <b>${esc(format(Number(s.value) || 0))}</b></span>`).join('')}</div>`,
  };
}

/** Peringkat horizontal, cocok untuk atribusi karyawan. */
export function hBars({ rows = [], format = (v) => angka(v), showSub = true }) {
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 0);
  if (!rows.length) return '<p class="muted">Tidak ada data.</p>';
  return `<div class="hbars">${rows.map((r, i) => {
    const v = Number(r.value) || 0;
    const w = max ? Math.max(1.5, (v / max) * 100) : 0;
    const color = r.color || PALET[i % PALET.length];
    return `<div class="hrow">
      <span class="hl">${esc(r.label)}</span>
      <span class="hb"><i style="width:${w.toFixed(1)}%;background:${color}"></i></span>
      <span class="hv">${esc(format(v))}${showSub && r.sub ? `<em>${esc(r.sub)}</em>` : ''}</span>
    </div>`;
  }).join('')}</div>`;
}

export function sparkline(values, { color = '#3e9b3a', width = 92, height = 26 } = {}) {
  const nums = (values || []).map(Number);
  const max = Math.max(...nums, 0);
  const min = Math.min(...nums, 0);
  if (!nums.length) return '';
  const step = nums.length > 1 ? width / (nums.length - 1) : 0;
  const pts = nums.map((v, i) => `${(step * i).toFixed(1)},${(height - 2 - ((height - 4) * (v - min)) / (max - min || 1)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><polyline fill="none" stroke="${color}" stroke-width="1.8" points="${pts.join(' ')}"/></svg>`;
}

export function meter(value, max, { label = '', color = '#3e9b3a' } = {}) {
  const p = max > 0 ? Math.min(100, (Number(value) / max) * 100) : 0;
  return `<div class="meter"><i style="width:${p.toFixed(1)}%;background:${color}"></i><span>${esc(label)}</span></div>`;
}
