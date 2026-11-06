/** Lacak tim di lapangan: peta kanvas tanpa tile, daftar kru, dan pengiriman lokasi. */
import { api } from '../api.js';
import * as geo from '../geo.js';
import * as ui from '../ui.js';
import { card, esc, loading } from '../ui.js';

let markers = [];
let highlight = null;
let hover = null;
let autoOn = false;

/** Hapus titik GPS milik satu run — endpoint DELETE memerlukan body JSON. */
async function delWithBody(url, body) {
  const res = await fetch(url, {
    method: 'DELETE', credentials: 'same-origin',
    headers: { 'x-xxl': '1', 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw Object.assign(new Error(data.error || `Terjadi kesalahan (${res.status}).`), { status: res.status, data });
  return data;
}

/* ------------------------------ proyeksi kanvas ---------------------------- */

function projector(list, W, H, pad) {
  let minLat = Infinity; let maxLat = -Infinity; let minLng = Infinity; let maxLng = -Infinity;
  for (const p of list) {
    if (p.lat == null || p.lng == null) continue;
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  }
  const MIN = 0.004;
  if (!Number.isFinite(minLat)) { minLat = 0; maxLat = MIN; minLng = 0; maxLng = MIN; }
  const midLat = (minLat + maxLat) / 2;
  const cos = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  let spanLat = maxLat - minLat; let spanLng = (maxLng - minLng) * cos;
  if (spanLat < MIN) { const add = (MIN - spanLat) / 2; minLat -= add; maxLat += add; spanLat = MIN; }
  if (spanLng < MIN) { const add = (MIN - spanLng) / 2; minLng -= add / cos; maxLng += add / cos; spanLng = MIN; }
  const s = Math.min((W - 2 * pad) / spanLng, (H - 2 * pad) / spanLat);
  const drawW = spanLng * s; const drawH = spanLat * s;
  const offX = (W - 2 * pad - drawW) / 2; const offY = (H - 2 * pad - drawH) / 2;
  return {
    toXY(p) {
      return [pad + offX + (p.lng - minLng) * cos * s, pad + offY + (maxLat - p.lat) * s];
    },
  };
}

function graticule(g, W, H) {
  g.strokeStyle = 'rgba(62,155,58,0.10)';
  g.lineWidth = 1;
  const step = 70;
  for (let x = step; x < W; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = step; y < H; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
}

function dot(g, x, y, color, label) {
  g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2);
  g.fillStyle = color; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
  if (label) {
    g.fillStyle = '#fff'; g.font = '600 9px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label.slice(0, 2), x, y);
  }
}

function drawLive(canvas, data) {
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(120, rect.width); const H = Math.max(120, rect.height);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#eef3ec'; g.fillRect(0, 0, W, H);

  const pts = [];
  for (const run of data.runs) {
    for (const c of run.crew) if (c.last) pts.push(c.last);
    if (run.mitra?.lat != null && run.mitra?.lng != null) pts.push(run.mitra);
  }
  for (const id of data.idle) if (id.last) pts.push(id.last);

  if (!pts.length) {
    g.fillStyle = '#8c9c93'; g.font = '600 13px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Tidak ada titik GPS yang dapat ditampilkan', W / 2, H / 2);
    markers = [];
    return;
  }

  graticule(g, W, H);
  const pr = projector(pts, W, H, 22);
  markers = [];

  for (const run of data.runs) {
    const trail = run.crew.filter((c) => c.last).map((c) => c.last)
      .sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)));
    if (run.mitra?.lat != null && run.mitra?.lng != null) trail.push(run.mitra);
    if (trail.length >= 2) {
      g.strokeStyle = '#3e9b3a'; g.lineWidth = 2.2; g.lineJoin = 'round';
      g.beginPath();
      trail.forEach((p, i) => { const [x, y] = pr.toXY(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    }
    if (run.mitra?.lat != null && run.mitra?.lng != null) {
      const [mx, my] = pr.toXY(run.mitra);
      g.strokeStyle = '#167d6b'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(mx, my, 6, 0, Math.PI * 2); g.moveTo(mx - 9, my); g.lineTo(mx + 9, my);
      g.moveTo(mx, my - 9); g.lineTo(mx, my + 9); g.stroke();
    }
    for (const c of run.crew) {
      if (!c.last) continue;
      const [x, y] = pr.toXY(c.last);
      const idx = markers.length;
      markers.push({ x, y, name: c.name, runId: run.pickup_id, code: run.code, last: c.last });
      dot(g, x, y, highlight === idx || hover === idx ? '#16342a' : '#3e9b3a', ui.inisial(c.name));
    }
  }
  for (const id of data.idle) {
    if (!id.last) continue;
    const [x, y] = pr.toXY(id.last);
    const idx = markers.length;
    markers.push({ x, y, name: id.name, runId: null });
    dot(g, x, y, hover === idx ? '#16342a' : '#c98a13', ui.inisial(id.name));
  }

  const tip = hover != null && markers[hover] ? markers[hover] : (highlight != null && markers[highlight] ? markers[highlight] : null);
  if (tip) {
    const text = `${tip.name}${tip.code ? ` · ${tip.code}` : ''}${tip.last ? ` · ${ui.umur(tip.last.recorded_at)}` : ''}`;
    g.font = '600 11px system-ui';
    const w = g.measureText(text).width + 12;
    let bx = tip.x + 12; let by = tip.y - 22;
    bx = Math.min(Math.max(2, bx), W - w - 2); by = Math.max(2, by);
    g.fillStyle = 'rgba(18,39,28,0.92)'; g.fillRect(bx, by, w, 18);
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(text, bx + 6, by + 9);
  }
}

function nearest(mx, my) {
  let best = null; let bd = 18;
  for (let i = 0; i < markers.length; i++) {
    const d = Math.hypot(mx - markers[i].x, my - markers[i].y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/* --------------------------------- rute run -------------------------------- */

function drawRoute(canvas, points) {
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(120, rect.width); const H = Math.max(120, rect.height);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#eef3ec'; g.fillRect(0, 0, W, H);
  if (points.length < 1) {
    g.fillStyle = '#8c9c93'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Belum ada titik GPS untuk run ini', W / 2, H / 2);
    return;
  }
  graticule(g, W, H);
  const pr = projector(points, W, H, 20);
  g.strokeStyle = '#3e9b3a'; g.lineWidth = 2.4; g.lineJoin = 'round';
  g.beginPath();
  points.forEach((p, i) => { const [x, y] = pr.toXY(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
  const a = pr.toXY(points[0]); const b = pr.toXY(points[points.length - 1]);
  dot(g, a[0], a[1], '#167d6b', 'A'); dot(g, b[0], b[1], '#c2410c', 'B');
}

async function openRoute(pickupId) {
  let d;
  try {
    d = await api.get(`/api/tracking/route/${pickupId}`);
  } catch (err) {
    ui.toastError(err);
    return;
  }
  const perUser = d.by_user.map((u) => `<div class="li"><span class="dot"></span><div class="bd1">
    <div class="t1">${esc(u.name)}</div><div class="m1">${ui.angka(u.points)} titik · ${ui.angka(u.distance_km, 2)} km</div></div></div>`).join('')
    || '<p class="muted sm">Tidak ada titik.</p>';
  const stats = `<div class="stats">
    <div class="st"><b>${ui.angka(d.distance_km, 2)} km</b><span>Jarak GPS</span></div>
    <div class="st"><b>${ui.angka(d.points.length)}</b><span>Titik</span></div>
    <div class="st"><b>${ui.angka(d.duration_minutes)} mnt</b><span>Durasi</span></div>
    <div class="st"><b>${d.odometer?.distance_km != null ? `${ui.angka(d.odometer.distance_km, 1)} km` : '—'}</b><span>Spido</span></div>
  </div>`;
  const handle = ui.openDialog({
    title: `Rute ${d.pickup.code || ''}`,
    size: 'wide',
    body: `<p class="lead">${esc(d.pickup.mitra_name)} · ${esc(ui.tgl(d.pickup.date))} — ${esc(d.pickup.mitra_address || '')}</p>
      ${stats}
      <div class="mapbox sm mt12"><canvas data-route></canvas></div>
      <h4 class="mt12">Per orang</h4>${perUser}`,
    footer: '<span class="end"></span><button class="btn ghost" type="button" data-close>Tutup</button>',
  });
  requestAnimationFrame(() => drawRoute(handle.body.querySelector('[data-route]'), d.points));
}

/* -------------------------------- panel kru -------------------------------- */

function crewPanel(my) {
  const run = my.active_run;
  const lastSeen = my.today.last_seen;
  return card({
    title: 'Bagikan lokasi',
    sub: my.user?.name,
    body: `
      <div class="notebox" id="geo-status">${lastSeen
        ? `Lokasi terakhir dikirim ${esc(ui.umur(lastSeen))}.`
        : 'Belum ada lokasi terkirim hari ini.'}</div>
      <div class="stats mb12">
        <div class="st"><b>${ui.angka(my.today.points)}</b><span>Titik hari ini</span></div>
        <div class="st"><b>${ui.angka(my.today.distance_km, 2)} km</b><span>Jarak tercatat</span></div>
      </div>
      ${run ? `<p class="sm">Sedang bertugas: <a class="lk" href="#/pengambilan/${run.pickup_id}">${esc(run.code)}</a> ke ${esc(run.mitra_name)} ${ui.badge(run.status)}</p>`
        : '<p class="sm muted">Tidak ada penugasan aktif hari ini. Lokasi akan tercatat tanpa run bila dikirim.</p>'}
      <div class="row mt12">
        <button class="btn pri" type="button" data-geo="send">Kirim lokasi sekarang</button>
        <button class="btn" type="button" data-geo="auto">${autoOn ? 'Hentikan otomatis' : 'Bagikan otomatis'}</button>
      </div>
      <p class="sm muted mt12">Bagikan otomatis mengirim titik tiap menit selama halaman terbuka.</p>`,
  });
}

function crewMeta(c) {
  const bits = [];
  if (c.last) {
    bits.push(`GPS ${esc(ui.umur(c.last.recorded_at))}`);
    if (c.last.accuracy != null) bits.push(`±${ui.angka(c.last.accuracy)} m`);
    if (c.last.speed != null) bits.push(`${ui.angka(c.last.speed)} km/jam`);
    if (c.last.battery != null) bits.push(`baterai ${ui.angka(c.last.battery)}%`);
  } else bits.push('belum ada titik GPS');
  return bits.join(' · ');
}

function liveList(data, ctx) {
  const purge = ctx.can('tracking.view_all') && ctx.isManager();
  if (!data.runs.length && !data.idle.length) {
    return card({
      title: 'Tim di lapangan',
      body: ui.empty('Tidak ada tim di lapangan sekarang.', '<a class="btn pri sm" href="#/papan">Buka papan penjemputan</a>'),
    });
  }
  const runs = data.runs.map((run) => {
    const rows = run.crew.map((c) => {
      const idx = markers.findIndex((m) => m.runId === run.pickup_id && m.name === c.name);
      return `<div class="li${idx >= 0 ? ` clk` : ''}" ${idx >= 0 ? `data-hi="${idx}"` : ''}>
        <span class="dot ${c.last ? 'amber' : 'grey'}"></span>
        <div class="bd1"><div class="t1">${esc(c.name)}${c.vehicle_plate ? ` <span class="mono muted">${esc(c.vehicle_plate)}</span>` : ''}</div>
          <div class="m1">${esc(crewMeta(c))}</div></div>
        <div class="end r">${idx >= 0 ? `<a class="btn xs" href="#/pengambilan/${run.pickup_id}" data-stop>Lihat run</a>` : ''}</div>
      </div>`;
    }).join('') || '<p class="muted sm">Belum ada kru terdaftar.</p>';
    return card({
      title: run.mitra?.name || run.code,
      sub: `${run.code} · ${ui.LABEL[run.status] || run.status}`,
      actions: `<button class="btn xs" type="button" data-route="${run.pickup_id}">Lihat rute</button>`
        + (purge ? `<button class="btn xs danger" type="button" data-purge="${run.pickup_id}" data-code="${esc(run.code)}" data-n="${run.crew.reduce((s, c) => s + (c.points_today || 0), 0)}">Bersihkan titik</button>` : ''),
      body: `<p class="sm muted mb12">Dituju ${esc(run.mitra?.address || '—')}</p>${rows}`,
    });
  }).join('');

  const idle = data.idle.length
    ? card({
      title: 'Di luar penugasan',
      sub: `${data.idle.length} orang mengirim lokasi`,
      body: data.idle.map((c) => `<div class="li"><span class="dot"></span>
        <div class="bd1"><div class="t1">${esc(c.name)}</div><div class="m1">${esc(crewMeta(c))}</div></div></div>`).join(''),
    })
    : '';

  return `<div class="grid g2">${runs}</div>${idle}`;
}

/* ---------------------------------- render --------------------------------- */

async function loadMyStatus(ctx) {
  if (ctx.isManager()) return null;
  try {
    return await api.get('/api/tracking/my-status');
  } catch {
    return null;
  }
}

async function paint(ctx) {
  let data;
  try {
    data = await api.get('/api/tracking/live');
  } catch (err) {
    document.getElementById('tk-map').innerHTML = `<div class="notebox">${esc(err.message || 'Data lacakan tidak dapat dimuat.')}</div>`;
    return;
  }
  highlight = null; hover = null;
  const hasPts = data.runs.some((r) => r.crew.some((c) => c.last)) || data.idle.some((i) => i.last);
  document.getElementById('tk-map').innerHTML = `
    <p class="muted sm mb12">Diperbarui ${esc(ui.umur(data.updated))}. ${hasPts ? 'Arahkan kursor ke titik untuk detail, klik untuk membuka run.' : ''}</p>
    <div class="mapbox"><canvas id="tk-canvas"></canvas></div>`;
  const canvas = document.getElementById('tk-canvas');
  drawLive(canvas, data);
  canvas.addEventListener('mousemove', (ev) => {
    const r = canvas.getBoundingClientRect();
    const i = nearest(ev.clientX - r.left, ev.clientY - r.top);
    if (i !== hover) { hover = i; drawLive(canvas, canvasData); }
  });
  canvas.addEventListener('mouseleave', () => { if (hover !== null) { hover = null; drawLive(canvas, canvasData); } });
  canvas.addEventListener('click', (ev) => {
    const r = canvas.getBoundingClientRect();
    const i = nearest(ev.clientX - r.left, ev.clientY - r.top);
    if (i != null && markers[i]?.runId) ctx.go(`/pengambilan/${markers[i].runId}`);
  });
  canvasData = data;

  const my = await loadMyStatus(ctx);
  const showCrew = !ctx.isManager();
  document.getElementById('tk-side').innerHTML =
    (showCrew && my ? crewPanel(my) : '') + liveList(data, ctx);
}

let canvasData = null;

export default async function render(page, ctx) {
  autoOn = false;
  page.innerHTML = `
    <div class="stack">
      ${card({ title: 'Peta lapangan', sub: 'Posisi terkini tim', body: '<div id="tk-map"></div>' })}
      <div id="tk-side">${loading()}</div>
    </div>`;

  await paint(ctx);

  ui.on(page, 'click', '[data-hi]', (ev, el) => {
    if (ev.target.closest('[data-stop]')) return;
    highlight = Number(el.dataset.hi);
    if (canvasData) drawLive(document.getElementById('tk-canvas'), canvasData);
  });
  ui.on(page, 'click', '[data-route]', (ev, b) => openRoute(Number(b.dataset.route)));
  ui.on(page, 'click', '[data-purge]', async (ev, b) => {
    const n = Number(b.dataset.n || 0);
    const ok = await ui.confirmDialog({
      title: 'Bersihkan titik GPS',
      message: `Menghapus seluruh ${n} titik GPS milik run ${b.dataset.code}. Titik yang terhapus tidak dapat dikembalikan dan jarak run akan dihitung ulang.`,
      okLabel: 'Hapus titik',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await delWithBody('/api/tracking/points', { pickup_id: Number(b.dataset.purge) });
      ui.toast(`${ui.angka(res.deleted || 0)} titik GPS dihapus.`, 'ok');
      await paint(ctx);
    } catch (err) {
      ui.toastError(err);
    }
  });
  ui.on(page, 'click', '[data-geo]', async (ev, b) => {
    if (b.dataset.geo === 'send') {
      b.disabled = true;
      try {
        const pos = await geo.currentPosition();
        await api.post('/api/tracking/point', pos);
        ui.toast('Lokasi terkirim.', 'ok');
        await paint(ctx);
      } catch (err) {
        ui.toastError(err);
      } finally {
        b.disabled = false;
      }
    } else {
      if (autoOn) {
        geo.stopTracking(); autoOn = false;
        b.textContent = 'Bagikan otomatis';
        b.classList.remove('lime');
        ui.toast('Berbagi lokasi otomatis dihentikan.', 'warn');
      } else {
        geo.startTracking({
          intervalMs: 60000,
          onPoint: () => { const s = document.getElementById('geo-status'); if (s) s.textContent = 'Lokasi baru saja dikirim.'; },
          onError: (err) => ui.toastError(err),
        });
        autoOn = true;
        b.textContent = 'Hentikan otomatis';
        b.classList.add('lime');
        ui.toast('Berbagi lokasi otomatis aktif selama halaman terbuka.', 'ok');
      }
    }
  });

  let busy = false;
  const tick = async () => {
    if (document.visibilityState !== 'visible' || busy) return;
    busy = true;
    try { await paint(ctx); } finally { busy = false; }
  };
  const timer = setInterval(tick, 30000);

  return () => {
    clearInterval(timer);
    if (autoOn) geo.stopTracking();
    autoOn = false;
  };
}
