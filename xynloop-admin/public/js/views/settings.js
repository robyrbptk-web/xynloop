/** Pengaturan: identitas, penomoran dokumen, kwitansi, surat penawaran, dan biaya default. */
import { api } from '../api.js';
import * as ui from '../ui.js';
import { card, esc, loading } from '../ui.js';

const HARI = ui.HARI;
const dayOptions = HARI.map((d) => ({ value: d, label: d }));

function clausesToText(raw) {
  if (raw === undefined || raw === null || raw === '') return '';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.join('\n');
    if (typeof parsed === 'string') return parsed;
  } catch {
    return String(raw);
  }
  return String(raw);
}

const GROUPS = [
  {
    title: 'Identitas perusahaan',
    note: 'Nama, merek, alamat, dan telepon ini tercetak pada kop kwitansi dan surat penawaran.',
    fields: [
      { key: 'company.name', label: 'Nama perusahaan', type: 'text', required: true, span2: true },
      { key: 'company.brand', label: 'Merek / singkatan', type: 'text', hint: 'Tampil di sidebar dan kop.' },
      { key: 'company.tagline', label: 'Tagline', type: 'text' },
      { key: 'company.phone', label: 'Telepon', type: 'tel' },
      { key: 'company.city', label: 'Kota', type: 'text' },
      { key: 'company.address', label: 'Alamat lengkap', type: 'textarea', rows: 2, span2: true },
    ],
  },
  {
    title: 'Penomoran dokumen & tanda tangan',
    note: "Kode dipakai sebagai awalan nomor dokumen. Petugas kwitansi tercetak pada kolom 'Diterima oleh'; penanda tangan tercetak pada kolom tanda tangan surat penawaran.",
    fields: [
      { key: 'doc.code', label: 'Kode awalan nomor dokumen', type: 'text', required: true, hint: 'mis. XSA → XSA/KWT/...' },
      { key: 'receipt.staff_name', label: 'Nama petugas kwitansi', type: 'text' },
      { key: 'receipt.staff_title', label: 'Jabatan petugas kwitansi', type: 'text' },
      { key: 'offer.signatory_name', label: 'Nama penanda tangan penawaran', type: 'text' },
      { key: 'offer.signatory_title', label: 'Jabatan penanda tangan', type: 'text' },
    ],
  },
  {
    title: 'Kwitansi',
    note: 'Teks catatan ini tercetak di bagian bawah setiap kwitansi pembelian.',
    fields: [
      { key: 'receipt.note', label: 'Catatan pada kwitansi', type: 'textarea', rows: 3, span2: true },
    ],
  },
  {
    title: 'Surat penawaran',
    note: 'Subjek menjadi baris "Perihal". Hari dan jam adalah jadwal pengambilan rutin yang disarankan. Klausal tercetak sebagai daftar perjanjian; isian {material}, {day}, {time}, dan {start_date} diisi otomatis saat surat dicetak.',
    fields: [
      { key: 'offer.subject', label: 'Subjek surat', type: 'text', required: true, span2: true },
      { key: 'offer.day', label: 'Hari pengambilan', type: 'select', options: dayOptions },
      { key: 'offer.time', label: 'Jam pengambilan', type: 'text', hint: 'mis. 10.00 WIB' },
      { key: 'offer.clauses', label: 'Klausal perjanjian (satu per baris)', type: 'clauses', rows: 6, span2: true, hint: 'Tulis tiap poin pada satu baris.' },
    ],
  },
  {
    title: 'Harga & biaya default',
    note: 'Harga BBM default dipakai saat jenis BBM belum memiliki harga yang berlaku, sebagai dasar perhitungan biaya operasional.',
    fields: [
      { key: 'fuel.default_price', label: 'Harga BBM default (Rp/liter)', type: 'money' },
    ],
  },
];

function fieldHtml(f, value) {
  const val = value === undefined || value === null ? '' : value;
  const req = f.required ? ' <span class="req">*</span>' : '';
  const hint = f.hint ? `<div class="hint">${esc(f.hint)}</div>` : '';
  const common = `id="s_${esc(f.key)}" ${f.required ? 'required' : ''}`;
  let input;
  if (f.type === 'textarea' || f.type === 'clauses') {
    input = `<textarea ${common} rows="${f.rows || 3}">${esc(f.type === 'clauses' ? clausesToText(val) : val)}</textarea>`;
  } else if (f.type === 'select') {
    input = `<select ${common}>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  } else if (f.type === 'money') {
    input = `<input class="money" type="text" inputmode="numeric" ${common} value="${val === '' ? '' : ui.angka(val)}">`;
  } else {
    input = `<input type="${f.type === 'tel' ? 'tel' : 'text'}" ${common} value="${esc(val)}">`;
  }
  return `<div class="fld${f.span2 ? ' span2' : ''}" data-field="${esc(f.key)}"><label for="s_${esc(f.key)}">${esc(f.label)}${req}</label>${input}${hint}<div class="ferr"></div></div>`;
}

function renderForm(s) {
  const groups = GROUPS.map((g) => card({
    title: g.title,
    body: `<div class="notebox">${esc(g.note)}</div><div class="grid2f">${g.fields.map((f) => fieldHtml(f, s[f.key])).join('')}</div>`,
  })).join('');
  return `<form id="setform" class="stack">${groups}
    <div class="card"><div class="ft row end">
      <button type="button" class="btn" data-act="settings-reset">Muat ulang</button>
      <button type="submit" class="btn pri">Simpan pengaturan</button>
    </div></div>
  </form>`;
}

export default async function render(page, ctx) {
  if (!ctx.can('settings.manage')) {
    page.innerHTML = card({ body: `<p class="lead">Hanya admin/pemilik yang dapat membuka halaman ini.</p><a class="btn pri" href="#/">Kembali ke dashboard</a>` });
    return;
  }
  page.innerHTML = loading('Memuat pengaturan…');

  const res = await api.get('/api/reference/settings');
  const store = res.settings || {};
  // Hanya kunci dalam whitelist server yang boleh diubah.
  const allowed = new Set(GROUPS.flatMap((g) => g.fields.map((f) => f.key)));

  page.innerHTML = `
    <p class="lead">Ubah identitas dan teks yang tercetak pada dokumen resmi. Hanya admin/pemilik yang dapat menyimpan.</p>
    ${renderForm(store)}`;

  const form = page.querySelector('#setform');

  function collectBody() {
    const vals = ui.collectFields(form);
    const body = {};
    for (const key of allowed) {
      if (!(key in vals)) continue;
      if (key === 'offer.clauses') {
        const lines = String(vals[key] || '').split('\n').map((x) => x.trim()).filter(Boolean);
        body[key] = JSON.stringify(lines);
      } else if (key === 'fuel.default_price') {
        body[key] = vals[key] === null || vals[key] === undefined || vals[key] === '' ? '' : String(Math.round(Number(vals[key]) || 0));
      } else {
        body[key] = vals[key] == null ? '' : String(vals[key]);
      }
    }
    return body;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    form.querySelectorAll('.ferr').forEach((e) => { e.textContent = ''; });
    form.querySelectorAll('.fld').forEach((e) => e.classList.remove('bad'));
    const body = collectBody();
    const required = GROUPS.flatMap((g) => g.fields).filter((f) => f.required);
    const missing = required.filter((f) => !String(body[f.key] || '').trim());
    if (missing.length) {
      missing.forEach((f) => {
        const box = form.querySelector(`[data-field="${CSS.escape(f.key)}"]`);
        if (box) { box.classList.add('bad'); const e = box.querySelector('.ferr'); if (e) e.textContent = 'Wajib diisi.'; }
      });
      ui.toast('Lengkapi isian yang ditandai.', 'warn');
      return;
    }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';
    try {
      await api.put('/api/reference/settings', body);
      await ctx.reloadBootstrap();
      ui.toast('Pengaturan disimpan.', 'ok');
    } catch (err) {
      Object.entries(err.data?.fields || {}).forEach(([k, v]) => {
        const box = form.querySelector(`[data-field="${CSS.escape(k)}"]`);
        if (box) { box.classList.add('bad'); const e = box.querySelector('.ferr'); if (e) e.textContent = v; }
      });
      ui.toastError(err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Simpan pengaturan';
    }
  });

  ui.on(page, 'click', '[data-act=settings-reset]', async () => {
    if (!(await ui.confirmDialog({ title: 'Muat ulang pengaturan', message: 'Perubahan yang belum disimpan akan dibuang.', okLabel: 'Muat ulang' }))) return;
    ctx.refresh();
  });
}
