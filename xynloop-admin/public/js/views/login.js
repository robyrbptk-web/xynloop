/** Layar masuk + penggantian password wajib. */
import { api } from '../api.js';
import { esc, toast } from '../ui.js';

function shell(inner) {
  return `<div class="login-wrap">
    <form class="login-card" novalidate autocomplete="on">
      <img class="lg" src="/brand/logo.png" alt="Xynloop">
      <h2>Masuk ke Xynloop</h2>
      <p class="sub">Sistem operasional pembelian kertas bekas &amp; minyak jelantah<br>PT. Xynra Sukses Abadi — Pontianak</p>
      ${inner}
    </form>
    <p class="login-foot">Data tersimpan di server perusahaan Anda sendiri.</p>
  </div>`;
}

export function renderLogin(onDone, opts = {}) {
  document.getElementById('login-root')?.remove();
  const holder = document.createElement('div');
  holder.id = 'login-root';
  document.body.appendChild(holder);

  if (opts.forcedPassword) {
    holder.innerHTML = shell(`
      <div class="fld"><label class="lbl" for="cur">Password lama</label><input class="inp" id="cur" name="current_password" type="password" autocomplete="current-password" required></div>
      <div class="fld"><label class="lbl" for="n1">Password baru</label><input class="inp" id="n1" name="new_password" type="password" autocomplete="new-password" required minlength="8"><div class="hint">Minimal 8 karakter, kombinasi huruf dan angka.</div></div>
      <div class="fld"><label class="lbl" for="n2">Ulangi password baru</label><input class="inp" id="n2" type="password" autocomplete="new-password" required></div>
      <div class="ferr" id="err"></div>
      <button class="btn pri block" type="submit">Ganti password &amp; masuk</button>`);
    const form = holder.querySelector('form');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = form.querySelector('#err');
      err.textContent = '';
      const current = form.current_password.value;
      const next = form.new_password.value;
      if (next.length < 8) { err.textContent = 'Password baru minimal 8 karakter.'; return; }
      if (!/[0-9]/.test(next) || !/[a-zA-Z]/.test(next)) { err.textContent = 'Password baru harus berisi huruf dan angka.'; return; }
      if (next !== form.n2.value) { err.textContent = 'Ulangi password belum sama.'; return; }
      try {
        await api.post('/api/auth/password', { current_password: current, new_password: next });
        const me = await api.get('/api/auth/me');
        holder.remove();
        toast('Password berhasil diganti.', 'ok');
        onDone(me.user);
      } catch (e) {
        err.textContent = e.message;
      }
    });
    setTimeout(() => form.cur.focus(), 80);
    return;
  }

  holder.innerHTML = shell(`
    <div class="fld"><label class="lbl" for="u">Username</label><input class="inp" id="u" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="nama pengguna"></div>
    <div class="fld"><label class="lbl" for="p">Password</label><input class="inp" id="p" name="password" type="password" autocomplete="current-password" required placeholder="••••••••"></div>
    <div class="ferr" id="err"></div>
    <button class="btn pri block" type="submit">Masuk</button>`);
  const form = holder.querySelector('form');
  const err = form.querySelector('#err');
  setTimeout(() => form.u.focus(), 80);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Memeriksa…';
    try {
      const res = await api.post('/api/auth/login', { username: form.u.value.trim(), password: form.p.value }, { allowAnonymous: true });
      holder.remove();
      if (res.user.must_change_password) {
        renderLogin(onDone, { forcedPassword: true });
        return;
      }
      onDone(res.user);
    } catch (e) {
      err.textContent = esc(e.message || 'Gagal masuk.');
      btn.disabled = false;
      btn.textContent = 'Masuk';
    }
  });
}
