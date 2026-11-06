/** Pengguna: akun karyawan, peran, reset password, dan riwayat kerja. */
import { api } from '../api.js';
import * as ui from '../ui.js';
import { card, empty, esc, loading, table, umur } from '../ui.js';

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Pemilik' },
  { value: 'admin', label: 'Admin / Manajer' },
  { value: 'purchasing', label: 'Purchasing (Akuisisi Mitra)' },
  { value: 'crew', label: 'Penjemputan / Pengambilan' },
];

const ROLE_INFO = {
  owner: 'Akses penuh, termasuk pengaturan dan akun.',
  admin: 'Mengelola semua aspek operasional harian.',
  purchasing: 'Mencari dan mengelola mitra.',
  crew: 'Penjemputan dan penimbangan di lapangan.',
};

const VISIT_LABEL = {
  survey: 'Survei', penawaran: 'Penawaran', follow_up: 'Tindak lanjut',
  negosiasi: 'Negosiasi', pengambilan: 'Pengambilan', lainnya: 'Lainnya',
};
const OUTCOME_LABEL = {
  lanjut: 'Lanjut', berhasil: 'Berhasil', tunda: 'Tunda',
  tidak_berminat: 'Tidak berminat', belum_sampai: 'Belum sampai', lainnya: 'Lainnya',
};

function roleHint(role) {
  const text = ROLE_INFO[role] || '';
  return `<div class="sm muted">${esc(text)}</div>`;
}

function actionBtn(label, act, id, cls = '') {
  return `<button type="button" class="btn xs ${cls}" data-act="${act}" data-id="${esc(String(id))}">${esc(label)}</button>`;
}

function rowActions(u, me) {
  const isOwnerRow = u.role === 'owner';
  const amOwner = me.role === 'owner';
  const isSelf = u.id === me.id;
  const parts = [actionBtn('Edit', 'edit', u.id)];
  if (!(isOwnerRow && !amOwner)) parts.push(actionBtn('Reset sandi', 'reset', u.id));
  if (!isSelf) {
    parts.push(u.is_active
      ? actionBtn('Nonaktifkan', 'toggle', u.id, 'danger')
      : actionBtn('Aktifkan', 'toggle', u.id, 'lime'));
  }
  parts.push(actionBtn('Riwayat kerja', 'worklog', u.id));
  return `<div class="row" style="gap:6px;justify-content:flex-end">${parts.join('')}</div>`;
}

function columns(me) {
  return [
    {
      label: 'Nama',
      render: (u) => `<div class="nm">${esc(u.name)}</div>
        <div class="sm mono">${esc(u.username)}</div>
        ${u.must_change_password ? '<div class="sm" style="color:var(--amber)">sandi wajib diganti</div>' : ''}`,
    },
    { label: 'Peran', render: (u) => `${ui.badge(u.role)}${roleHint(u.role)}` },
    { label: 'Telepon', render: (u) => (u.phone ? esc(u.phone) : '<span class="muted sm">—</span>') },
    { label: 'Area', render: (u) => (u.area ? esc(u.area) : '<span class="muted sm">—</span>') },
    {
      label: 'Status',
      align: 'center',
      render: (u) => ui.badge(u.is_active ? 'aktif' : 'nonaktif', u.is_active ? 'Aktif' : 'Nonaktif'),
    },
    { label: 'Terakhir masuk', render: (u) => (u.last_login_at ? umur(u.last_login_at) : '<span class="muted sm">belum pernah</span>') },
    { label: '', align: 'right', render: (u) => rowActions(u, me) },
  ];
}

function createFields(areas) {
  return [
    { name: 'name', label: 'Nama lengkap', type: 'text', required: true, placeholder: 'Nama karyawan' },
    { name: 'username', label: 'Username', type: 'text', required: true, placeholder: 'tanpa.spasi', hint: '3-40 karakter: huruf, angka, titik, garis bawah, atau strip.' },
    {
      name: 'role', label: 'Peran', type: 'select', required: true, blank: false, value: 'purchasing', options: ROLE_OPTIONS,
      hint: 'Purchasing: mencari & mengelola mitra · Kru: penjemputan/timbangan · Admin: semua.',
    },
    { name: 'phone', label: 'Telepon', type: 'tel', placeholder: '08xx xxxx xxxx' },
    { name: 'area', label: 'Area kerja', type: 'text', placeholder: 'mis. Pontianak Timur' },
    {
      name: 'password', label: 'Password awal', type: 'password', required: true, col: 1,
      hint: 'Minimal 8 karakter. Bagikan ke karyawan, lalu minta ia menggantinya saat masuk pertama.',
    },
    { name: 'must_change_password', label: 'Wajib ganti password saat masuk pertama', type: 'checkbox', boxLabel: 'Minta ganti password saat masuk pertama', col: 1, value: true },
    { name: 'notes', label: 'Catatan', type: 'textarea', rows: 2, col: 1, placeholder: 'opsional' },
  ];
}

function editFields(u) {
  return [
    { name: 'username', label: 'Username', type: 'static', value: u.username, col: 1 },
    { name: 'name', label: 'Nama lengkap', type: 'text', required: true, value: u.name },
    { name: 'role', label: 'Peran', type: 'select', required: true, blank: false, value: u.role, options: ROLE_OPTIONS },
    { name: 'phone', label: 'Telepon', type: 'tel', value: u.phone || '' },
    { name: 'area', label: 'Area kerja', type: 'text', value: u.area || '' },
    { name: 'notes', label: 'Catatan', type: 'textarea', rows: 3, col: 1, value: u.notes || '' },
    { name: 'is_active', label: 'Akun aktif', type: 'checkbox', boxLabel: 'Akun aktif', col: 1, value: u.is_active },
    { name: 'must_change_password', label: 'Wajib ganti password', type: 'checkbox', boxLabel: 'Wajib ganti password saat masuk', col: 1, value: u.must_change_password },
  ];
}

function showGeneratedPassword(name, password) {
  const d = ui.openDialog({
    title: 'Password baru dibuat',
    size: 'thin',
    body: `<p class="lead">Sampaikan password sementara ini kepada <b>${esc(name)}</b>. Hanya ditampilkan sekali dan ia akan diminta menggantinya saat masuk.</p>
      <div class="stat mono" style="font-size:16px;text-align:center;letter-spacing:1px">${esc(password)}</div>`,
    footer: `<button type="button" class="btn" data-copy>Salin</button>
             <button type="button" class="btn pri" data-close>Tutup</button>`,
  });
  d.el.querySelector('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(password);
      ui.toast('Password disalin.', 'ok');
    } catch {
      ui.toast('Penyalinan tidak didukung peramban. Silakan salin manual.', 'warn');
    }
  });
}

async function renderWorklog(ctx, user) {
  const d = ui.openDialog({
    title: `Riwayat kerja — ${user.name}`,
    size: 'wide',
    body: ui.loading('Memuat riwayat kerja…'),
  });
  try {
    const res = await api.get(`/api/users/${user.id}/worklog`);
    const visits = res.visits || [];
    const runs = res.runs || [];
    const visitRows = visits.length
      ? ui.list(visits.map((v) => ({
        tone: v.outcome === 'lanjut' || v.outcome === 'berhasil' ? '' : 'amber',
        title: `<a class="lk" href="#/mitras/${v.mitra_id}">${esc(v.mitra_name)}</a> ${ui.badge(v.visit_type, VISIT_LABEL[v.visit_type] || v.visit_type)}`,
        meta: `${ui.tglJam(v.visited_at)} · hasil ${esc(OUTCOME_LABEL[v.outcome] || v.outcome || '—')}${v.notes ? ` · ${esc(v.notes)}` : ''}${v.next_action_at ? ` · tindak lanjut ${ui.tgl(v.next_action_at)}` : ''}`,
        right: ui.badge(v.mitra_status),
      })))
      : '<p class="muted sm">Belum ada kunjungan tercatat.</p>';
    const runRows = runs.length
      ? table({
        columns: [
          { label: 'Mitra', render: (r) => `<div class="nm"><a class="lk" href="#/pengambilan/${r.id}">${esc(r.mitra_name)}</a></div><div class="sm mono">${esc(r.code)}</div>` },
          { label: 'Tanggal', render: (r) => `${ui.tgl(r.date)}` },
          { label: 'Status', render: (r) => ui.badge(r.status) },
          { label: 'Kertas', align: 'right', render: (r) => `${ui.angka(r.paper_kg)} kg` },
          { label: 'Jelantah', align: 'right', render: (r) => `${ui.angka(r.oil_liters)} l` },
          { label: 'Nilai', align: 'right', render: (r) => ui.rp(r.amount) },
        ],
        rows: runs,
        emptyText: 'Belum ada pengambilan.',
      })
      : '<p class="muted sm">Belum ada pengambilan.</p>';
    d.body.innerHTML = `
      <div class="stats" style="margin-bottom:14px">
        <div class="st"><b>${ui.angka(visits.length)}</b><span>kunjungan</span></div>
        <div class="st"><b>${ui.angka(runs.length)}</b><span>pengambilan</span></div>
        <div class="st"><b>${ui.angka(runs.reduce((s, r) => s + (Number(r.paper_kg) || 0), 0))} kg</b><span>total kertas</span></div>
        <div class="st"><b>${ui.rp(runs.reduce((s, r) => s + (Number(r.amount) || 0), 0))}</b><span>total nilai</span></div>
      </div>
      <div class="stack">
        ${card({ title: 'Kunjungan prospek/mitra', body: visitRows })}
        ${card({ title: 'Pengambilan yang diikuti', flush: true, body: runRows })}
      </div>`;
  } catch (err) {
    d.body.innerHTML = `<p class="muted">${esc(err.message || 'Riwayat kerja tidak dapat dimuat.')}</p>`;
    ui.toastError(err);
  }
}

export default async function render(page, ctx) {
  if (!ctx.can('users.manage')) {
    page.innerHTML = card({ body: `<p class="lead">Hanya admin/pemilik yang dapat membuka halaman ini.</p><a class="btn pri" href="#/">Kembali ke dashboard</a>` });
    return;
  }
  page.innerHTML = loading('Memuat daftar pengguna…');
  ctx.setTopbarActions('<button type="button" class="btn sm pri" data-act="create">+ Buat akun</button>');

  const res = await api.get('/api/users');
  const all = res.users || [];
  const me = ctx.me;
  const areas = (ctx.bootstrap && ctx.bootstrap.areas) || [];

  const state = { q: (ctx.params.q.get('q') || ''), role: '' };

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return all.filter((u) => {
      if (state.role && u.role !== state.role) return false;
      if (!q) return true;
      return [u.name, u.username, u.phone, u.area].some((x) => String(x || '').toLowerCase().includes(q));
    });
  }

  function paintTable() {
    const rows = filtered();
    document.getElementById('users-body').innerHTML = rows.length
      ? table({ columns: columns(me), rows })
      : empty('Tidak ada pengguna yang cocok.', '<button type="button" class="btn pri sm" data-act="create">+ Buat akun</button>');
  }

  const filterBar = ui.filters(`
    ${ui.inputBox({ name: 'q', placeholder: 'Cari nama / username…', value: state.q })}
    ${ui.selectBox({ name: 'role', all: 'Semua peran', options: ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label })), value: state.role })}
    <div class="fld sm muted" style="align-self:center">${ui.angka(all.length)} akun</div>`);

  page.innerHTML = `
    ${card({ title: 'Akun karyawan', sub: 'Nama, peran, dan status masuk', flush: false,
      body: `${filterBar}<div id="users-body"></div>` })}`;
  paintTable();

  const filterRoot = page.querySelector('.filters');
  ui.on(filterRoot, 'input', '[data-filter=q]', (ev, el) => { state.q = el.value; paintTable(); });
  ui.on(filterRoot, 'change', '[data-filter=role]', (ev, el) => { state.role = el.value; paintTable(); });

  async function refreshList() {
    const r2 = await api.get('/api/users');
    all.length = 0;
    all.push(...(r2.users || []));
    document.querySelector('.filters .fld.sm').textContent = `${ui.angka(all.length)} akun`;
    paintTable();
  }

  async function onAct(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const id = Number(el.dataset.id);
    const u = all.find((x) => x.id === id);

    if (act === 'create') {
      ui.formDialog({
        title: 'Buat akun karyawan',
        subtitle: 'Isi data lalu bagikan password awal. Peran menentukan apa yang dapat dilakukan akun ini.',
        fields: createFields(areas),
        okLabel: 'Buat akun',
        size: 'wide',
        onSubmit: async (v) => {
          const body = {
            name: v.name, username: v.username, role: v.role,
            phone: v.phone || null, area: v.area || null, notes: v.notes || null,
            password: v.password, must_change_password: !!v.must_change_password,
          };
          const r = await api.post('/api/users', body);
          ui.toast(`Akun ${r.user.name} dibuat.`, 'ok');
          await ctx.reloadBootstrap();
          await refreshList();
        },
      });
      return;
    }

    if (act === 'edit' && u) {
      ui.formDialog({
        title: `Edit akun — ${u.name}`,
        fields: editFields(u),
        okLabel: 'Simpan',
        size: 'wide',
        onSubmit: async (v) => {
          const body = {
            name: v.name, role: v.role, phone: v.phone || null, area: v.area || null,
            notes: v.notes || null, is_active: !!v.is_active, must_change_password: !!v.must_change_password,
          };
          await api.put(`/api/users/${u.id}`, body);
          ui.toast('Perubahan disimpan.', 'ok');
          await ctx.reloadBootstrap();
          await refreshList();
        },
      });
      return;
    }

    if (act === 'reset' && u) {
      if (!(await ui.confirmDialog({ title: 'Reset password', message: `Buat password baru untuk ${u.name}? Sesi login akun ini akan keluar.`, okLabel: 'Buat password baru' }))) return;
      ui.formDialog({
        title: `Reset password — ${u.name}`,
        subtitle: 'Kosongkan isian agar sistem membuat password acak. Password hanya ditampilkan sekali.',
        fields: [{ name: 'password', label: 'Password baru (opsional)', type: 'password', col: 1, hint: 'Kosong = dibuat otomatis oleh sistem.' }],
        okLabel: 'Reset',
        size: 'thin',
        onSubmit: async (v) => {
          const body = v.password ? { password: v.password } : {};
          const r = await api.post(`/api/users/${u.id}/password`, body);
          showGeneratedPassword(u.name, r.password);
        },
      });
      return;
    }

    if (act === 'toggle' && u) {
      const msg = u.is_active
        ? `Nonaktifkan akun ${u.name}? Yang bersangkutan tidak dapat masuk dan sesinya keluar.`
        : `Aktifkan kembali akun ${u.name}?`;
      if (!(await ui.confirmDialog({ title: u.is_active ? 'Nonaktifkan akun' : 'Aktifkan akun', message: msg, danger: u.is_active, okLabel: u.is_active ? 'Nonaktifkan' : 'Aktifkan' }))) return;
      try {
        await api.post(`/api/users/${u.id}/toggle`);
        await ctx.reloadBootstrap();
        await refreshList();
        ui.toast('Status akun diperbarui.', 'ok');
      } catch (err) {
        ui.toastError(err);
      }
      return;
    }

    if (act === 'worklog' && u) {
      renderWorklog(ctx, u);
    }
  }

  document.addEventListener('click', onAct);
  return () => document.removeEventListener('click', onAct);
}
