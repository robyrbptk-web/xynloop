/** Komponen tampilan bersama: format, badge, tabel, formulir, dialog, toast, galeri. */
import { collectPhotos } from './media.js';

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function angka(v, des = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('id-ID', { minimumFractionDigits: des, maximumFractionDigits: des });
}

export function rp(v, { kosong = '—' } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return kosong;
  return `Rp ${angka(Math.round(n))}`;
}

export function rpShort(v) {
  const n = Math.abs(Number(v) || 0);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} jt`;
  if (n >= 1_000) return `${(n / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb`;
  return angka(n);
}

export function berat(v, unit = 'kg') {
  const n = Number(v);
  if (!Number.isFinite(n)) return `0 ${unit}`;
  return `${n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unit}`;
}

export function pct(v, des = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0%';
  return `${angka(n, des)}%`;
}

export function parseMoney(v) {
  if (typeof v === 'number') return v;
  const cleaned = String(v ?? '').replace(/[^\d-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  return Number(cleaned);
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const s = String(value || '');
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})([T ](\d{2}):(\d{2})(:\d{2})?)?/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[5] || 0), Number(m[6] || 0));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function tgl(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export function tglPendek(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${BULAN[d.getMonth()]}`;
}

export function tglJam(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${tgl(d)} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

export function jam(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

export function tanggalIso(d = new Date()) {
  const x = d instanceof Date ? d : toDate(d);
  if (!x) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function hariNama(value) {
  const d = toDate(value);
  return d ? HARI[d.getDay()] : '';
}

export function umur(value) {
  const d = toDate(value);
  if (!d) return '—';
  const detik = (Date.now() - d.getTime()) / 1000;
  if (detik < 0) return `${Math.round(-detik / 60)} menit lagi`;
  if (detik < 90) return 'baru saja';
  if (detik < 3600) return `${Math.round(detik / 60)} menit lalu`;
  if (detik < 86400) return `${Math.round(detik / 3600)} jam lalu`;
  if (detik < 2592000) return `${Math.round(detik / 86400)} hari lalu`;
  return tgl(d);
}

export function inisial(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

export function waLink(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '').replace(/^0/, '62');
  return digits ? `https://wa.me/${digits}` : '';
}

/* ---------------------------------- badge --------------------------------- */
const TONE = {
  prospek: 'grey', penawaran: 'amber', negosiasi: 'amber', aktif: 'green', 'tidak_respon': 'red',
  ditolak: 'red', nonaktif: 'grey',
  terjadwal: 'blue', dalam_perjalanan: 'amber', menimbang: 'purple', selesai: 'green', batal: 'red',
  draf: 'grey', terbit: 'blue', lunas: 'green', terkirim: 'blue', diterima: 'green', kadaluarsa: 'red',
  lanjut: 'green', tunda: 'amber', deal: 'green', batal_run: 'red',
  owner: 'purple', admin: 'blue', purchasing: 'amber', crew: 'green',
  mobil: 'blue', pick_up: 'green', motor: 'amber', truk: 'purple',
  kertas: 'blue', jelantah: 'green',
};

export const LABEL = {
  prospek: 'Prospek', penawaran: 'Penawaran', negosiasi: 'Negosiasi', aktif: 'Mitra aktif',
  'tidak_respon': 'Tidak respon', ditolak: 'Ditolak', nonaktif: 'Nonaktif',
  terjadwal: 'Terjadwal', dalam_perjalanan: 'Di jalan', menimbang: 'Menimbang', selesai: 'Selesai', batal: 'Batal',
  draf: 'Draf', terbit: 'Terbit', lunas: 'Lunas', terkirim: 'Terkirim', diterima: 'Diterima', kadaluarsa: 'Kadaluarsa',
  survey: 'Survei', kunjungan: 'Kunjungan', ulang: 'Pengingat', lain: 'Lainnya',
  lanjut: 'Lanjut', tunda: 'Tunda', deal: 'Sepakat',
  mobil: 'Mobil', pick_up: 'Pick up', motor: 'Motor', truk: 'Truk',
  kertas: 'Kertas', jelantah: 'Jelantah',
  owner: 'Pemilik', admin: 'Admin', purchasing: 'Purchasing', crew: 'Kru',
};

export function badge(status, text) {
  const key = String(status || '');
  if (!key && !text) return '';
  return `<span class="bdg b-${TONE[key] || 'grey'}">${esc(text || LABEL[key] || key)}</span>`;
}

export function pill(text, tone = 'grey') {
  return `<span class="bdg b-${tone}">${esc(text)}</span>`;
}

/* ---------------------------------- toast --------------------------------- */
export function toast(message, kind = 'ok', ms = 3600) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const box = document.createElement('div');
  box.className = `toast ${kind}`;
  box.innerHTML = esc(message);
  root.appendChild(box);
  setTimeout(() => {
    box.classList.add('out');
    setTimeout(() => box.remove(), 320);
  }, ms);
}

export function toastError(err) {
  toast(err && err.message ? err.message : 'Terjadi kesalahan.', 'bad', 5200);
}

/* --------------------------------- dialog --------------------------------- */
let dialogStack = [];

export function openDialog({ title, body = '', footer = '', size = '', onClose } = {}) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'mask';
  wrap.innerHTML = `
    <div class="dialog ${size}" role="dialog" aria-modal="true" aria-label="${esc(title || 'Dialog')}">
      ${title ? `<header><h3>${esc(title)}</h3><button class="x" data-close type="button" aria-label="Tutup">&times;</button></header>` : ''}
      <div class="body">${body}</div>
      ${footer ? `<footer>${footer}</footer>` : ''}
    </div>`;
  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  const handle = { el: wrap, body: wrap.querySelector('.body'), close };
  dialogStack.push(handle);
  wrap.addEventListener('click', (ev) => {
    if (ev.target === wrap || ev.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', function onKey(ev) {
    if (ev.key === 'Escape' && dialogStack[dialogStack.length - 1] === handle) {
      document.removeEventListener('keydown', onKey);
      close();
    }
  });
  setTimeout(() => {
    const first = wrap.querySelector('input:not([type=hidden]),select,textarea,button.pri');
    if (first && size !== 'wide') first.focus();
  }, 70);
  function close() {
    wrap.classList.remove('show');
    dialogStack = dialogStack.filter((d) => d !== handle);
    setTimeout(() => wrap.remove(), 220);
    if (typeof onClose === 'function') onClose();
  }
  return handle;
}

export function confirmDialog({ title = 'Konfirmasi', message = '', okLabel = 'Ya, lanjutkan', danger = false } = {}) {
  return new Promise((resolve) => {
    const d = openDialog({
      title,
      size: 'thin',
      body: `<p class="lead">${esc(message)}</p>`,
      footer: `<button class="btn" data-close type="button">Batal</button>
               <button class="btn ${danger ? 'danger' : 'pri'}" data-yes type="button">${esc(okLabel)}</button>`,
      onClose: () => resolve(false),
    });
    d.el.querySelector('[data-yes]').addEventListener('click', () => {
      dialogStack = dialogStack.filter((x) => x !== d);
      d.el.remove();
      resolve(true);
    });
  });
}

/* -------------------------------- formulir -------------------------------- */
function optionsHtml(options, selected) {
  const list = (options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  return list.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(selected ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
}

function fieldHtml(f, values) {
  const val = values[f.name] !== undefined ? values[f.name] : (f.value ?? '');
  const req = f.required ? 'required' : '';
  const label = `<label for="fld_${f.name}">${esc(f.label || '')}${f.required ? ' <span class="req">*</span>' : ''}</label>`;
  const hint = f.hint ? `<div class="hint">${esc(f.hint)}</div>` : '';
  const common = `id="fld_${f.name}" name="${esc(f.name)}" ${req} ${f.readonly ? 'readonly' : ''}`;
  let input = '';
  switch (f.type) {
    case 'static':
      input = `<div class="stat">${esc(val)}</div>`;
      break;
    case 'textarea':
      input = `<textarea ${common} rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`;
      break;
    case 'select':
      input = `<select ${common}>${f.blank !== false ? `<option value="">${esc(f.placeholder || 'Pilih…')}</option>` : ''}${optionsHtml(f.options, val)}</select>`;
      break;
    case 'radio':
      input = `<div class="choices">${(f.options || []).map((o) => {
        const oo = typeof o === 'object' ? o : { value: o, label: o };
        return `<label class="choice"><input type="radio" name="${esc(f.name)}" value="${esc(oo.value)}" ${String(oo.value) === String(val ?? f.default ?? '') ? 'checked' : ''}><span>${esc(oo.label)}</span></label>`;
      }).join('')}</div>`;
      break;
    case 'checkbox':
      input = `<label class="chk"><input type="checkbox" name="${esc(f.name)}" value="1" ${val ? 'checked' : ''}><span>${esc(f.boxLabel || f.label || '')}</span></label>`;
      break;
    case 'money':
      input = `<input class="money${f.mini ? ' mini' : ''}" type="text" inputmode="numeric" ${common} value="${val === '' || val == null ? '' : angka(val)}" placeholder="${esc(f.placeholder || '0')}">`;
      break;
    case 'number':
      input = `<input class="${f.mini ? 'mini' : ''}" type="number" ${common} value="${val ?? ''}" ${f.step ? `step="${f.step}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} placeholder="${esc(f.placeholder || '')}">`;
      break;
    case 'date':
      input = `<input type="date" ${common} value="${val ? String(val).slice(0, 10) : ''}">`;
      break;
    case 'time':
      input = `<input type="time" ${common} value="${val ? String(val).slice(11, 16) : ''}">`;
      break;
    case 'photos':
      input = `<div class="shotbar" data-photos="${esc(f.name)}" data-capture="${f.capture ? '1' : ''}">
                 <div class="shots" data-shots></div>
                 <button type="button" class="btn sm lime" data-addphoto>+ ${esc(f.buttonLabel || 'Ambil / pilih foto')}</button>
                 ${f.noHint ? '' : '<div class="hint">Foto dikompres di perangkat sebelum dikirim.</div>'}
               </div>`;
      break;
    default:
      input = `<input type="${f.type || 'text'}" ${common} value="${esc(val ?? '')}" placeholder="${esc(f.placeholder || '')}" ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ''}>`;
  }
  const wide = f.col === 1 || f.type === 'radio' || f.type === 'photos' ? ' span2' : '';
  const showLabel = f.type !== 'photos' && f.type !== 'checkbox' && f.type !== 'radio';
  return `<div class="fld${wide}" data-field="${esc(f.name)}">${showLabel ? label : ''}${input}${hint}<div class="ferr"></div></div>`;
}

export function collectFields(root) {
  const out = {};
  root.querySelectorAll('[data-field]').forEach((box) => {
    const name = box.dataset.field;
    const bar = box.querySelector(`[data-photos="${CSS.escape(name)}"]`);
    if (bar) { out[name] = bar.__photos || []; return; }
    const checkbox = box.querySelector('input[type=checkbox]');
    if (checkbox) { out[name] = checkbox.checked; return; }
    const radio = box.querySelector('input[type=radio]');
    if (radio) {
      const sel = box.querySelector('input[type=radio]:checked');
      out[name] = sel ? sel.value : null;
      return;
    }
    const input = box.querySelector('select, textarea, input');
    if (!input) return;
    if (input.classList.contains('money')) { out[name] = parseMoney(input.value); return; }
    let v = input.value;
    if (input.type === 'number') v = v === '' ? null : Number(v);
    out[name] = typeof v === 'string' ? v.trim() : v;
  });
  return out;
}

export function setFieldError(root, name, message) {
  const box = root.querySelector(`[data-field="${CSS.escape(name)}"]`);
  if (!box) return;
  const err = box.querySelector('.ferr');
  if (err) err.textContent = message || '';
  box.classList.toggle('bad', Boolean(message));
}

/** Dialog formulir. `onSubmit(values)` → mengembalikan `false` membiarkan dialog terbuka. */
export function formDialog({
  title, subtitle, fields = [], values = {}, okLabel = 'Simpan', size = '',
  note, onSubmit, cancelLabel = 'Batal', tabs = null,
} = {}) {
  const tabsBar = tabs ? `<div class="tabs mini">${tabs.map((t, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-tab="${esc(t.id)}">${esc(t.label)}</button>`).join('')}</div>` : '';
  const d = openDialog({
    title,
    size,
    body: `
      ${subtitle ? `<p class="lead">${esc(subtitle)}</p>` : ''}
      ${tabsBar}
      <form class="form grid2f" autocomplete="off" novalidate>
        ${fields.map((f) => fieldHtml(f, values)).join('')}
        ${note ? `<div class="notebox">${esc(note)}</div>` : ''}
      </form>`,
    footer: `<button type="button" class="btn" data-close>${esc(cancelLabel)}</button>
             <button type="button" class="btn pri" data-ok>${esc(okLabel)}</button>`,
  });
  const form = d.body.querySelector('form');

  d.body.querySelectorAll('[data-photos]').forEach((bar) => {
    bar.__photos = Array.isArray(values[bar.dataset.photos])
      ? values[bar.dataset.photos].map((p) => ({ ...p }))
      : [];
    const shots = bar.querySelector('[data-shots]');
    const paint = () => {
      shots.innerHTML = bar.__photos.map((p, i) => `
        <figure class="mini-shot">
          <img src="${esc(p.data || p.url || '')}" alt="">
          <button type="button" class="x" data-kill="${i}" aria-label="Hapus foto">&times;</button>
        </figure>`).join('');
    };
    paint();
    bar.querySelector('[data-addphoto]').addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      b.disabled = true;
      try {
        const { photos, gagal } = await collectPhotos({ capture: bar.dataset.capture === '1' });
        bar.__photos.push(...photos);
        if (gagal) toast('Beberapa berkas terlalu besar dan dilewati.', 'warn');
        else if (!photos.length) toast('Tidak ada foto dipilih.', 'warn');
        paint();
      } catch (err) {
        toastError(err);
      } finally {
        b.disabled = false;
      }
    });
    shots.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-kill]');
      if (!btn) return;
      bar.__photos.splice(Number(btn.dataset.kill), 1);
      paint();
    });
  });

  if (tabs) {
    tabs.forEach((t) => t.fields.forEach((name) => {
      const box = form.querySelector(`[data-field="${CSS.escape(name)}"]`);
      if (box) box.dataset.tabGroup = t.id;
    }));
    const showTab = (id) => {
      form.querySelectorAll('[data-tab-group]').forEach((b) => { b.hidden = b.dataset.tabGroup !== id; });
      d.body.querySelectorAll('.tab, .tabs.mini button').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    };
    d.body.querySelectorAll('.tabs.mini button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    showTab(tabs[0].id);
  }

  const okBtn = d.el.querySelector('[data-ok]');
  const submit = async () => {
    const vals = collectFields(form);
    const missing = [];
    fields.forEach((f) => {
      setFieldError(form, f.name, '');
      if (!f.required) return;
      const v = vals[f.name];
      if (v === null || v === undefined || v === '' || (f.type === 'checkbox' && v === false)) missing.push(f);
    });
    if (missing.length) {
      missing.forEach((f) => setFieldError(form, f.name, 'Wajib diisi.'));
      const box = form.querySelector(`[data-field="${CSS.escape(missing[0].name)}"]`);
      (box?.querySelector('input,select,textarea') || box)?.focus?.();
      toast('Lengkapi isian yang ditandai.', 'warn');
      return;
    }
    okBtn.disabled = true;
    okBtn.textContent = 'Menyimpan…';
    try {
      const res = onSubmit ? await onSubmit(vals) : vals;
      if (res === false) return;
      d.close();
      return res === undefined ? vals : res;
    } catch (err) {
      Object.entries(err.data?.fields || {}).forEach(([k, v]) => setFieldError(form, k, v));
      toastError(err);
    } finally {
      okBtn.disabled = false;
      okBtn.textContent = okLabel;
    }
  };
  okBtn.addEventListener('click', submit);
  form.addEventListener('submit', (ev) => { ev.preventDefault(); submit(); });
  form.addEventListener('input', (ev) => {
    const box = ev.target.closest('[data-field]');
    if (!box) return;
    box.classList.remove('bad');
    const e = box.querySelector('.ferr');
    if (e) e.textContent = '';
  });
  return { ...d, form, submit };
}

/* --------------------------------- tampilan -------------------------------- */
export function loading(text = 'Memuat…') {
  return `<div class="loading"><span class="spin"></span><span>${esc(text)}</span></div>`;
}

export function empty(text, action = '') {
  return `<div class="empty"><b>${esc(text)}</b>${action}</div>`;
}

export function card({ title, sub, actions = '', body = '', cls = '', flush = false, foot = '' }) {
  return `<section class="card ${cls}">
    ${title || actions ? `<div class="hd"><h3>${esc(title || '')}${sub ? `<span class="sub"> · ${esc(sub)}</span>` : ''}</h3><div class="end row">${actions}</div></div>` : ''}
    <div class="bd${flush ? ' flush' : ''}">${body}</div>
    ${foot ? `<div class="ft">${foot}</div>` : ''}
  </section>`;
}

export function kpi({ label, value, hint, tone = '' }) {
  return `<div class="kpi ${tone ? `k-${tone}` : ''}">
    <div class="lb">${esc(label)}</div>
    <div class="vl">${value ?? '—'}</div>
    ${hint ? `<div class="xt">${hint}</div>` : ''}
  </div>`;
}

/** Tabel umum. columns: [{key,label,align:'right'|'center',render(row,i),cls,width}] */
export function table({ columns, rows = [], emptyText = 'Belum ada data.', cls = '', onRow, emptyAction = '' }) {
  if (!rows.length) return empty(emptyText, emptyAction);
  const th = (c) => `<th class="${c.align === 'right' ? 'num' : c.align === 'center' ? 'c' : ''} ${c.cls || ''}" ${c.width ? `style="width:${c.width}"` : ''}>${esc(c.label)}</th>`;
  const td = (c, r, i) => `<td class="${c.align === 'right' ? 'num' : c.align === 'center' ? 'c' : ''} ${c.cls || ''}">${(c.render ? c.render(r, i) : esc(r[c.key])) ?? ''}</td>`;
  const body = rows.map((r, i) => `<tr class="${onRow ? 'clk' : ''} ${r.__cls || ''}" ${onRow ? `data-idx="${i}"` : ''}>${columns.map((c) => td(c, r, i)).join('')}</tr>`).join('');
  return `<div class="tbl-wrap"><table class="tbl ${cls}"><thead><tr>${columns.map(th).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function link(to, label) {
  return `<a class="lk" href="#${to}">${esc(label)}</a>`;
}

export function btn(label, { cls = '', act = '', data = '', disabled = false, title = '' } = {}) {
  return `<button type="button" class="btn ${cls}" ${act ? `data-act="${act}"` : ''} ${data} ${title ? `title="${esc(title)}"` : ''} ${disabled ? 'disabled' : ''}>${esc(label)}</button>`;
}

export function filters(html) {
  return `<div class="filters">${html}</div>`;
}

export function selectBox({ name, label, options, value, all = 'Semua' }) {
  return `<div class="fld">
    ${label ? `<label>${esc(label)}</label>` : ''}
    <select data-filter="${esc(name)}">${all ? `<option value="">${esc(all)}</option>` : ''}${optionsHtml(options, value)}</select></div>`;
}

export function inputBox({ name, label, placeholder, value = '', type = 'text', grow = true }) {
  return `<div class="fld${grow ? ' grow' : ''}">
    ${label ? `<label>${esc(label)}</label>` : ''}
    <input type="${type}" data-filter="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder || '')}"></div>`;
}

export function dateBox({ name, label, value = '' }) {
  return `<div class="fld">
    ${label ? `<label>${esc(label)}</label>` : ''}
    <input type="date" data-filter="${esc(name)}" value="${esc(value)}"></div>`;
}

export function tabs(items, active) {
  return `<div class="tabs">${items.map((t) => `<button type="button" class="${t.id === active ? 'on' : ''}" data-tab="${esc(t.id)}">${esc(t.label)}</button>`).join('')}</div>`;
}

export function statRow(items) {
  return `<div class="stats">${items.map((i) => `<div class="st"><b>${i.value}</b><span>${esc(i.label)}</span></div>`).join('')}</div>`;
}

export function list(items) {
  if (!items.length) return '<p class="muted sm">Tidak ada.</p>';
  return items.map((i) => `<div class="li"><span class="dot ${i.tone || ''}"></span><div class="bd1">
    <div class="t1">${i.title}</div>${i.meta ? `<div class="m1">${i.meta}</div>` : ''}</div>
    ${i.right ? `<div class="end r">${i.right}</div>` : ''}</div>`).join('');
}

/* --------------------------------- galeri --------------------------------- */
export function photoSrc(photo) {
  if (!photo) return '';
  return photo.path ? `/files/${photo.path}` : (photo.data || photo.url || '');
}

export function gallery(photos, { add = false, label = 'Tambah foto' } = {}) {
  const list = (photos || []).map((p) => `
    <figure>
      <img loading="lazy" src="${esc(photoSrc(p))}" alt="${esc(p.caption || 'Bukti foto')}" data-full="${esc(photoSrc(p))}">
      <figcaption>${esc(p.caption || '')}${p.taken_by_name ? ` — ${esc(p.taken_by_name)}` : ''}${p.taken_at ? ` · <span class="muted">${umur(p.taken_at)}</span>` : ''}</figcaption>
      ${p.id ? `<button type="button" class="x" data-del-photo="${p.id}" title="Hapus foto">&times;</button>` : ''}
    </figure>`).join('');
  const plus = add ? `<button type="button" class="add-shot" data-act="add-photo"><span>+ ${esc(label)}</span></button>` : '';
  if (!list && !plus) return '<p class="muted sm">Belum ada foto bukti.</p>';
  return `<div class="gal">${list}${plus}</div>`;
}

export function lightbox(src) {
  const root = document.getElementById('lightbox-root');
  root.innerHTML = `<div class="lightbox"><img src="${esc(src)}" alt="Foto bukti"></div>`;
  root.querySelector('.lightbox').addEventListener('click', () => { root.innerHTML = ''; });
}

/* ------------------------------ util DOM cepat ---------------------------- */
export function on(root, event, selector, handler) {
  root.addEventListener(event, (ev) => {
    const t = ev.target.closest(selector);
    if (t && root.contains(t)) handler(ev, t);
  });
}

export function actHandler(handler) {
  return (ev) => {
    const t = ev.target.closest('[data-act]');
    if (t) handler(t.dataset.act, t, ev);
  };
}

export { BULAN, HARI };
