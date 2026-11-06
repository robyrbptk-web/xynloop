/** Pembungkus fetch: cookie sesi, header pelindung CSRF, dan seragamkan error. */
let unauthorized = () => {};

export function onUnauthorized(fn) {
  unauthorized = fn;
}

async function request(method, url, body, opts = {}) {
  const headers = {};
  if (method !== 'GET') headers['x-xxl'] = '1';
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: opts.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw Object.assign(new Error('Koneksi ke server gagal. Periksa jaringan.'), { status: 0 });
  }
  if (res.status === 401 && !opts.allowAnonymous) unauthorized();
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data.error || data.message || (res.status === 404 ? 'Data tidak ditemukan.' : `Terjadi kesalahan (${res.status}).`);
    throw Object.assign(new Error(msg), { status: res.status, data });
  }
  return data;
}

export function query(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: (url, opts) => request('GET', url, undefined, opts),
  post: (url, body, opts) => request('POST', url, body ?? {}, opts),
  put: (url, body, opts) => request('PUT', url, body ?? {}, opts),
  del: (url, opts) => request('DELETE', url, undefined, opts),
  query,
};

/** Unduh CSV/berkas dengan menjaga header autentikasi tidak diperlukan (cookie sudah cukup). */
export function download(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function printFrame(url) {
  window.open(url, '_blank', 'noopener');
}
