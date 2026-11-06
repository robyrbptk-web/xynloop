/** Akun saya: profil read-only dan penggantian password. */
import { api } from '../api.js';
import * as ui from '../ui.js';
import { card, esc, loading } from '../ui.js';

export default async function render(page, ctx) {
  page.innerHTML = loading('Memuat akun…');
  const me = ctx.me || {};

  const profileRows = [
    ['Nama', me.name],
    ['Username', me.username],
    ['Peran', me.role_label || ui.LABEL[me.role] || me.role],
    ['Telepon', me.phone || '—'],
    ['Area', me.area || '—'],
  ];

  const profileCard = card({
    title: 'Profil saya',
    sub: 'Data dari sesi login Anda',
    body: `<div class="grid g2">${profileRows.map(([k, v]) => `
      <div class="fld"><label>${esc(k)}</label><div class="stat">${esc(v == null ? '—' : v)}</div></div>`).join('')}
      <div class="fld"><label>Hak akses</label><div class="stat">${ui.angka((me.caps || []).length)} kewenangan</div></div>
      <div class="fld"><label>Status</label><div class="stat">${me.must_change_password ? 'Password sementara — segera ganti' : 'Password sudah permanen'}</div></div>
      </div>`,
    foot: 'Untuk mengubah nama, peran, atau area, hubungi admin. Bagian ini hanya menampilkan data akun Anda.',
  });

  const securityCard = card({
    title: 'Keamanan akun',
    body: `<p class="lead">Ganti password Anda di sini. Password baru minimal 8 karakter dan harus berisi huruf serta angka.</p>
      <div class="notebox">Setelah berhasil, sesi Anda di perangkat lain otomatis keluar. Anda tetap masuk pada perangkat ini.</div>
      <button type="button" class="btn pri" data-act="change-password">Ganti password</button>`,
  });

  page.innerHTML = `<div class="stack">${profileCard}${securityCard}</div>`;

  ui.on(page, 'click', '[data-act=change-password]', () => {
    ui.formDialog({
      title: 'Ganti password',
      subtitle: 'Masukkan password lama lalu tentukan password baru.',
      okLabel: 'Ganti password',
      size: 'thin',
      fields: [
        { name: 'current_password', label: 'Password lama', type: 'password', required: true, col: 1 },
        { name: 'new_password', label: 'Password baru', type: 'password', required: true, col: 1, hint: 'Minimal 8 karakter, kombinasi huruf dan angka.' },
        { name: 'confirm_password', label: 'Ulangi password baru', type: 'password', required: true, col: 1 },
      ],
      onSubmit: async (v) => {
        if (String(v.new_password).length < 8) throw new Error('Password baru minimal 8 karakter.');
        if (!/[0-9]/.test(v.new_password) || !/[a-zA-Z]/.test(v.new_password)) throw new Error('Password baru harus berisi huruf dan angka.');
        if (v.new_password !== v.confirm_password) throw new Error('Ulangi password belum sama.');
        await api.post('/api/auth/password', { current_password: v.current_password, new_password: v.new_password });
        ui.toast('Password diganti. Sesi lain keluar.', 'ok');
      },
    });
  });
}
