import { all, get, nowLocal, run } from '../db/index.js';
import { num, str } from './http.js';
import { saveImage, removeImage } from './uploads.js';

/** Simpan daftar foto berbasis data URL untuk satu entitas. */
export function savePhotos(req, kind, ownerId, list = []) {
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || !item.data) continue;
    const saved = saveImage(item.data, { folder: kind });
    const info = run(
      `INSERT INTO attachments (kind, owner_id, path, caption, bytes, taken_by, taken_at, lat, lng)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [kind, ownerId, saved.path, str(item.caption, 160), saved.bytes, req.user.id, nowLocal(),
        num(item.lat, null), num(item.lng, null)],
    );
    out.push(get('SELECT * FROM attachments WHERE id = ?', [info.lastInsertRowid]));
  }
  return out;
}

export function photosFor(kind, ownerId) {
  return all(
    `SELECT a.*, u.name AS taken_by_name FROM attachments a LEFT JOIN users u ON u.id = a.taken_by
      WHERE a.kind = ? AND a.owner_id = ? ORDER BY a.created_at DESC, a.id DESC`,
    [kind, ownerId],
  );
}

export function deletePhoto(req, attachmentId) {
  const row = get('SELECT * FROM attachments WHERE id = ?', [attachmentId]);
  if (!row) return false;
  removeImage(row.path);
  run('DELETE FROM attachments WHERE id = ?', [attachmentId]);
  return true;
}
