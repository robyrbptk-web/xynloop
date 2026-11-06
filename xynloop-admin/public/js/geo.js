/** Pelacakan posisi kru: baca GPS perangkat lalu kirim berkala ke server. */
import { api } from './api.js';

let watcher = null;
let poster = null;
let last = null;

function nowIso() { return new Date().toISOString(); }

export function geoSupported() {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

export function currentPosition({ timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!geoSupported()) { reject(new Error('Perangkat ini tidak mendukung GPS.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        lat: Number(p.coords.latitude.toFixed(6)),
        lng: Number(p.coords.longitude.toFixed(6)),
        accuracy: Math.round(p.coords.accuracy || 0),
        speed: p.coords.speed == null ? null : Math.round(p.coords.speed * 3.6),
        heading: p.coords.heading == null ? null : Math.round(p.coords.heading),
        at: nowIso(),
      }),
      (err) => reject(new Error(err.code === 1 ? 'Izin lokasi ditolak. Aktifkan lokasi pada browser.' : 'Sinyal GPS belum terbaca, coba lagi.')),
      { enableHighAccuracy: true, timeout, maximumAge: 8000 },
    );
  });
}

/** Mulai kirim titik setiap `intervalMs`. Menghentikan sesi lama lebih dulu. */
export function startTracking({ intervalMs = 60000, onPoint, onError } = {}) {
  stopTracking();
  const tick = async () => {
    try {
      const pos = await currentPosition();
      last = pos;
      const res = await api.post('/api/tracking/point', pos);
      if (res.deduped !== true && typeof onPoint === 'function') onPoint(res.point || pos);
    } catch (err) {
      if (typeof onError === 'function') onError(err);
    }
  };
  tick();
  watcher = setInterval(tick, Math.max(15000, intervalMs));
  poster = tick;
}

export function stopTracking() {
  if (watcher) clearInterval(watcher);
  watcher = null;
  poster = null;
}

export function isTracking() {
  return !!watcher;
}

export function lastFix() { return last; }
