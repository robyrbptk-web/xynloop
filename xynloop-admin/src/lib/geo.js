const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

/** Jarak dua koordinat dalam meter. */
export function haversine(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Total jarak rute (meter) dari daftar titik [lat,lng]. */
export function routeLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [la1, ln1] = points[i - 1];
    const [la2, ln2] = points[i];
    const d = haversine(la1, ln1, la2, ln2);
    // Buang lompatan GPS > 500 m antar titik berurutan (noise).
    if (d > 500) continue;
    total += d;
  }
  return total;
}

export function bounds(points) {
  const lats = points.map((p) => p[0]).filter(Number.isFinite);
  const lngs = points.map((p) => p[1]).filter(Number.isFinite);
  if (!lats.length) return null;
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
}
