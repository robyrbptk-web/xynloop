/** Ambil foto dari kamera/galeri lalu kecilkan di perangkat sebelum dikirim. */

const MAX_EDGE = 1400;
const QUALITY = 0.72;

export function pickFiles({ multiple = true, capture = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (multiple) input.multiple = true;
    if (capture) input.capture = 'environment';
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; input.remove(); resolve(v); } };
    input.addEventListener('change', () => done([...input.files]));
    input.addEventListener('cancel', () => done([]));
    input.click();
    // Beberapa browser tidak melepas event cancel; pantau fokus untuk melepas penunggu.
    const onFocus = () => { setTimeout(() => done([]), 600); window.removeEventListener('focus', onFocus); };
    window.addEventListener('focus', onFocus);
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('Gagal membaca berkas foto.'));
    fr.readAsDataURL(file);
  });
}

function shrink(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      if (scale >= 1 && dataUrl.length < 900_000) { resolve(dataUrl); return; }
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Kembalikan array `{ data, caption }` siap kirim ke API. */
export async function collectPhotos({ capture = false } = {}) {
  const files = await pickFiles({ multiple: true, capture });
  const out = [];
  for (const file of files) {
    if (!/^image\//.test(file.type)) continue;
    if (file.size > 12_000_000) { out.push(null); continue; }
    const shrunk = await shrink(await readAsDataUrl(file));
    out.push(shrunk ? { data: shrunk, caption: '' } : null);
  }
  const gagal = out.filter((x) => x === null).length;
  const ok = out.filter(Boolean);
  return { photos: ok, gagal };
}

export function thumbAttrs(photo) {
  return photo.path ? `/files/${photo.path}` : (photo.data || photo.thumb || '');
}
