/** Cangkang aplikasi: sesi, navigasi peran, dan router berbasis hash. */
import { api, onUnauthorized } from './api.js';
import * as ui from './ui.js';
import { renderLogin } from './views/login.js';

const ICON = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h14V10',
  board: 'M4 4h7v16H4zM13 4h7v9h-7z',
  handshake: 'M8 12l2.5 2.5L16 9M12 3l4 4-4 4-4-4z',
  users: 'M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  truck: 'M3 7h9v8H3zM12 10h4l3 3v2h-7M6.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  letter: 'M4 5h16v14H4zM4 6l8 6 8-6',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  fuel: 'M5 20V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15M4 20h12M7 10h6M17 8l2 2v6a1.5 1.5 0 0 0 3 0v-7l-3-4',
  tag: 'M20 12.5 12.5 20 4 11.5V4h7.5zM8 8h.01',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 4.9 17l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 11.4H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 4.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.6 1',
  shield: 'M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6z',
  plus: 'M12 5v14M5 12h14',
};

function icon(name) {
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[name] || ICON.home}"/></svg>`;
}

export const NAV = [
  { path: '/', label: 'Dashboard', icon: 'home', mob: true },
  { path: '/papan', label: 'Papan Penjemputan', icon: 'board', mob: true },
  { path: '/pengambilan', label: 'Riwayat Pengambilan', icon: 'truck' },
  { path: '/mitras', label: 'Data Mitra', icon: 'handshake', mob: true },
  { path: '/prospek', label: 'Prospek & Kunjungan', icon: 'users', cap: 'mitras.manage' },
  { path: '/penawaran', label: 'Surat Penawaran', icon: 'letter', cap: 'offers.manage' },
  { path: '/kwitansi', label: 'Kwitansi', icon: 'receipt', mob: true },
  { path: '/tracking', label: 'Lacak Tim', icon: 'pin', mob: true },
  { path: '/laporan', label: 'Laporan', icon: 'chart' },
  { path: '/armada', label: 'Armada & BBM', icon: 'fuel', cap: 'vehicles.manage' },
  { path: '/harga', label: 'Harga Material', icon: 'tag', cap: 'prices.manage' },
  { path: '/pengguna', label: 'Pengguna', icon: 'users', cap: 'users.manage' },
  { path: '/pengaturan', label: 'Pengaturan', icon: 'gear', cap: 'settings.manage' },
  { path: '/audit', label: 'Jejak Audit', icon: 'shield', cap: 'audit.view' },
];

const ROUTES = {
  '/': () => import('./views/dashboard.js'),
  '/papan': () => import('./views/pickup-board.js'),
  '/pengambilan': () => import('./views/pickups.js'),
  '/pengambilan/:id': () => import('./views/pickup-detail.js'),
  '/mitras': () => import('./views/mitras.js'),
  '/mitras/:id': () => import('./views/mitra-detail.js'),
  '/prospek': () => import('./views/prospects.js'),
  '/penawaran': () => import('./views/offers.js'),
  '/kwitansi': () => import('./views/receipts.js'),
  '/tracking': () => import('./views/tracking.js'),
  '/laporan': () => import('./views/reports.js'),
  '/armada': () => import('./views/fleet.js'),
  '/harga': () => import('./views/prices.js'),
  '/pengguna': () => import('./views/users.js'),
  '/pengaturan': () => import('./views/settings.js'),
  '/audit': () => import('./views/audit.js'),
  '/akun': () => import('./views/account.js'),
};

const CACHE = { me: null, bootstrap: null };
let currentCleanup = null;

export const App = {
  get me() { return CACHE.me; },
  get caps() { return CACHE.me?.caps || []; },
  get company() { return CACHE.me?.company || {}; },
  can: (cap) => (CACHE.me?.caps || []).includes(cap),
  isManager: () => ['owner', 'admin'].includes(CACHE.me?.role),
  get bootstrap() { return CACHE.bootstrap; },
  go: (path) => { location.hash = '#' + (path.startsWith('/') ? path : `/${path}`); },
  refresh: () => render(),
  reloadBootstrap: async () => { CACHE.bootstrap = await api.get('/api/reference/bootstrap'); return CACHE.bootstrap; },
  icon,
};

function match(path) {
  if (ROUTES[path]) return { load: ROUTES[path], params: {} };
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 2) {
    const cand = `/${parts[0]}/:id`;
    if (ROUTES[cand]) return { load: ROUTES[cand], params: { id: parts[1] } };
  }
  return null;
}

function titleFor(path) {
  const item = NAV.find((n) => n.path === path || (n.path !== '/' && path.startsWith(n.path + '/')));
  if (item) return item.label;
  if (path.startsWith('/pengambilan')) return 'Detail Pengambilan';
  if (path.startsWith('/mitras')) return 'Detail Mitra';
  if (path === '/akun') return 'Akun Saya';
  return 'Xynloop';
}

function buildNav() {
  const allowed = NAV.filter((n) => !n.cap || App.can(n.cap));
  document.getElementById('side').innerHTML = `
    <div class="brand">
      <img src="/brand/logo.png" alt="Xynloop">
      <div><b>XYNLOOP</b><small>${ui.esc(CACHE.me?.company?.name || 'PT. Xynra Sukses Abadi')}</small></div>
    </div>
    <nav class="nav">
      ${allowed.map((n) => `<a href="#${n.path}" data-nav="${n.path}">${icon(n.icon)}<span>${ui.esc(n.label)}</span></a>`).join('')}
    </nav>
    <div class="who">
      <span class="av">${ui.inisial(CACHE.me?.name)}</span>
      <div><div class="nm">${ui.esc(CACHE.me?.name)}</div><div class="rl">${ui.esc(CACHE.me?.role_label || CACHE.me?.role)}</div></div>
      <button type="button" data-act="account" title="Akun saya">&#9881;</button>
      <button type="button" data-act="logout" title="Keluar">&#8618;</button>
    </div>`;
  document.getElementById('mobnav').innerHTML = allowed
    .filter((n) => n.mob)
    .map((n) => `<a href="#${n.path}" data-nav="${n.path}">${icon(n.icon)}<span>${ui.esc(n.label.split(' ')[0])}</span></a>`)
    .join('');
}

function paintActive(path) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const base = a.dataset.nav;
    const on = base === '/' ? path === '/' : (path === base || path.startsWith(base + '/'));
    a.classList.toggle('on', on);
  });
}

function buildTopbar(path) {
  const now = new Date();
  document.getElementById('topbar').innerHTML = `
    <button class="btn sm ghost menu-btn" type="button" data-act="menu" aria-label="Menu">&#9776;</button>
    <div><h1>${ui.esc(titleFor(path))}</h1><div class="sub">${ui.esc(`${['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][now.getDay()]}, ${now.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][now.getMonth()]} ${now.getFullYear()}`)}</div></div>
    <div class="grow"></div>
    <div class="row" id="tb-actions"></div>`;
}

function setHash(hash) {
  if (location.hash !== hash) location.hash = hash;
}

async function renderNow() {
  if (!CACHE.me) return;
  const raw = (location.hash || '#/').slice(1);
  const [pathPart, search] = raw.split('?');
  const path = pathPart.endsWith('/') && pathPart.length > 1 ? pathPart.slice(0, -1) : (pathPart || '/');
  const found = match(path);
  buildTopbar(path);
  paintActive(path);
  const page = document.getElementById('page');
  if (currentCleanup) { try { currentCleanup(); } catch { /* abaikan */ } currentCleanup = null; }
  if (!found) {
    page.innerHTML = ui.empty('Halaman tidak ditemukan.', '<a class="btn pri" href="#/">Ke dashboard</a>');
    document.getElementById('tb-actions').innerHTML = '';
    return;
  }
  page.innerHTML = ui.loading();
  const params = { ...found.params, q: new URLSearchParams(search || '') };
  try {
    const mod = await found.load();
    const fn = mod.default || mod.render;
    if (typeof fn !== 'function') throw new Error('Modul tampilan tidak lengkap.');
    const out = await fn(page, { ...App, path, params, setTopbarActions });
    if (typeof out === 'function') currentCleanup = out;
  } catch (err) {
    if (err.status === 401) return showLogin();
    page.innerHTML = `<div class="card"><div class="bd"><h3 class="mt0">Data tidak dapat dimuat</h3><p class="muted">${ui.esc(err.message || 'Kesalahan tak terduga.')}</p><button class="btn pri" type="button" data-act="retry">Coba lagi</button></div></div>`;
    page.querySelector('[data-act=retry]').addEventListener('click', render);
    ui.toastError(err);
  }
}

/** Antrean render — memastikan tampilan lama tidak menimpa tampilan baru. */
let renderChain = Promise.resolve();
function render() {
  renderChain = renderChain.then(renderNow).catch((err) => console.error(err));
  return renderChain;
}

export function setTopbarActions(html) {
  const box = document.getElementById('tb-actions');
  if (box) box.innerHTML = html || '';
}

async function loadBootstrap() {
  if (!CACHE.bootstrap) CACHE.bootstrap = await api.get('/api/reference/bootstrap');
  return CACHE.bootstrap;
}

function showLogin() {
  document.getElementById('app').hidden = true;
  document.getElementById('boot').hidden = true;
  renderLogin(async (user) => {
    CACHE.me = user;
    await start();
  });
}

async function start() {
  try {
    await loadBootstrap();
  } catch (err) {
    if (err.status === 401) return showLogin();
    throw err;
  }
  const root = document.getElementById('app');
  root.hidden = false;
  document.getElementById('boot').hidden = true;
  buildNav();
  if (!location.hash) setHash('#/');
  await render();
}

window.addEventListener('hashchange', () => {
  if (CACHE.me) render();
});

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  if (t.dataset.act === 'logout') {
    ev.preventDefault();
    try { await api.post('/api/auth/logout'); } catch { /* sesi tetap dibersihkan di klien */ }
    CACHE.me = null;
    CACHE.bootstrap = null;
    document.getElementById('app').hidden = true;
    showLogin();
  }
  if (t.dataset.act === 'account') { ev.preventDefault(); App.go('/akun'); }
  if (t.dataset.act === 'menu') {
    ev.preventDefault();
    document.getElementById('side').classList.toggle('open');
  }
  if (ev.target.closest('a[data-nav]')) document.getElementById('side').classList.remove('open');
  const shot = ev.target.closest('.gal img[data-full]');
  if (shot) ui.lightbox(shot.dataset.full);
});

async function boot() {
  try {
    const res = await api.get('/api/auth/me', { allowAnonymous: true });
    CACHE.me = res.user;
    if (CACHE.me.must_change_password) {
      renderLogin(async (user) => { CACHE.me = user; await start(); }, { forcedPassword: true });
      return;
    }
    await start();
  } catch (err) {
    if (err.status === 401 || err.status === 403) showLogin();
    else {
      document.querySelector('.boot-text').textContent = 'Server belum siap. Muat ulang halaman.';
      ui.toastError(err);
    }
  }
}

onUnauthorized(() => {
  CACHE.me = null;
  document.getElementById('app').hidden = true;
  showLogin();
  ui.toast('Sesi berakhir, silakan masuk kembali.', 'warn');
});

boot();
