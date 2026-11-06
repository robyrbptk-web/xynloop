/** Papan akuisisi: ringkasan pipeline, kanban status, dan peringatan tindak lanjut. */
import { api } from '../api.js';
import { hBars } from '../charts.js';
import * as ui from '../ui.js';

const BOARD = ['prospek', 'penawaran', 'negosiasi', 'aktif', 'tidak_respon', 'ditolak'];
const AKTIF_PIPELINE = ['prospek', 'penawaran', 'negosiasi', 'aktif'];
const STATUS_LABEL = {
  prospek: 'Prospek', penawaran: 'Penawaran', negosiasi: 'Negosiasi', aktif: 'Mitra aktif',
  tidak_respon: 'Tidak respon', ditolak: 'Ditolak',
};
const CATEGORY = [
  { value: 'kertas', label: 'Kertas' },
  { value: 'jelantah', label: 'Jelantah' },
  { value: 'campur', label: 'Campur' },
];
const VISIT_TYPE = {
  survey: 'Survei', penawaran: 'Penawaran', follow_up: 'Tindak lanjut',
  negosiasi: 'Negosiasi', pengambilan: 'Pengambilan', lainnya: 'Lainnya',
};
const OUTCOME = {
  lanjut: 'Lanjut', berhasil: 'Berhasil', tunda: 'Ditunda',
  tidak_berminat: 'Tidak berminat', belum_sampai: 'Belum sampai', lainnya: 'Lainnya',
};
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const STALE_DAYS = 14;

function num(v) {
  return ui.angka(Math.round(Number(v) || 0));
}

function selisihHari(value) {
  if (!value) return null;
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function kategoriLabel(c) {
  return (CATEGORY.find((x) => x.value === c) || {}).label || c;
}

export default async function render(page, ctx) {
  page.innerHTML = ui.loading('Memuat papan akuisisi…');
  const manager = ctx.isManager();
  const purchasing = (ctx.bootstrap?.users || []).filter((u) => u.role === 'purchasing');
  const state = { mine: !manager };

  ctx.setTopbarActions(
    ctx.can('mitras.manage') ? '<button type="button" class="btn sm pri" data-act="new">+ Prospek baru</button>' : '',
  );

  let mitras = [];
  let kpi = null;
  let alive = true;

  /* -------------------------------- dialog -------------------------------- */

  function quickFields() {
    const fields = [
      { name: 'name', label: 'Nama calon mitra', required: true, col: 1 },
      { name: 'category', label: 'Kategori', type: 'select', options: CATEGORY, value: 'kertas' },
      { name: 'phone', label: 'Nomor telepon', type: 'tel', inputmode: 'numeric' },
      { name: 'contact_person', label: 'Narahubung' },
      { name: 'area', label: 'Area / wilayah' },
      { name: 'expected_paper_kg', label: 'Perkiraan kertas (kg)', type: 'number', min: 0, step: 'any' },
      { name: 'expected_oil_l', label: 'Perkiraan jelantah (l)', type: 'number', min: 0, step: 'any' },
      { name: 'schedule_day', label: 'Hari pengambilan', type: 'select', options: HARI.map((h) => ({ value: h, label: h })) },
      { name: 'schedule_time', label: 'Jam pengambilan', type: 'time' },
      { name: 'notes', label: 'Catatan awal', type: 'textarea', col: 1 },
    ];
    if (manager) {
      fields.splice(1, 0, {
        name: 'source_user_id', label: 'Karyawan penemu', type: 'select',
        placeholder: 'Tentukan karyawan', options: purchasing.map((u) => ({ value: u.id, label: u.name })),
      });
    }
    return fields;
  }

  function openCreate() {
    ui.formDialog({
      title: 'Prospek baru',
      subtitle: 'Catat calon mitra. Status awal prospek.',
      size: 'wide',
      fields: quickFields(),
      okLabel: 'Simpan',
      onSubmit: async (vals) => {
        const res = await api.post('/api/mitras', vals);
        ui.toast('Prospek baru tercatat.', 'ok');
        await reload();
        return res.mitra;
      },
    });
  }

  function openVisit(m) {
    ui.formDialog({
      title: 'Catat kunjungan',
      subtitle: m.name,
      size: 'wide',
      fields: [
        { name: 'visit_type', label: 'Jenis kunjungan', type: 'select', blank: false, options: Object.entries(VISIT_TYPE).map(([value, label]) => ({ value, label })), value: 'follow_up' },
        { name: 'outcome', label: 'Hasil', type: 'select', blank: false, options: Object.entries(OUTCOME).map(([value, label]) => ({ value, label })), value: 'lanjut' },
        { name: 'visited_at', label: 'Tanggal', type: 'date', value: ui.tanggalIso() },
        { name: 'next_action_at', label: 'Rencana tindak lanjut', type: 'date' },
        { name: 'notes', label: 'Catatan', type: 'textarea', col: 1 },
      ],
      okLabel: 'Simpan',
      onSubmit: async (vals) => {
        await api.post(`/api/mitras/${m.id}/visits`, vals);
        ui.toast('Kunjungan tercatat.', 'ok');
        await reload();
      },
    });
  }

  function openStatus(m) {
    ui.formDialog({
      title: 'Pindahkan status',
      subtitle: m.name,
      size: 'thin',
      fields: [
        { name: 'status', label: 'Status baru', type: 'select', blank: false, options: Object.keys(STATUS_LABEL).map((s) => ({ value: s, label: STATUS_LABEL[s] })), value: m.status },
      ],
      okLabel: 'Simpan',
      onSubmit: async (vals) => {
        if (vals.status === m.status) {
          ui.toast('Status belum berubah.', 'warn');
          return false;
        }
        await api.post(`/api/mitras/${m.id}/status`, { status: vals.status });
        ui.toast('Status diperbarui.', 'ok');
        await reload();
      },
    });
  }

  /* -------------------------------- tampilan ------------------------------- */

  function kpiHtml() {
    if (!kpi) return '';
    const pick = (s) => kpi.pipeline.find((x) => x.status === s) || { total: 0, mine: 0 };
    const val = (s) => (manager ? pick(s).total : pick(s).mine);
    const kpis = `
      <div class="grid g4">
        ${ui.kpi({ label: 'Prospek', value: num(val('prospek')), hint: manager ? 'calon baru' : 'prospek saya' })}
        ${ui.kpi({ label: 'Diproses', value: num(val('penawaran') + val('negosiasi')), hint: 'penawaran & negosiasi', tone: 'amber' })}
        ${ui.kpi({ label: 'Mitra aktif', value: num(val('aktif')), hint: manager ? 'mitra berjalan' : 'saya temukan', tone: 'green' })}
        ${ui.kpi({ label: 'Macet', value: num(val('tidak_respon') + val('ditolak')), hint: 'tidak respon / menolak', tone: 'red' })}
      </div>`;
    const areas = (kpi.areas || []).slice(0, 6);
    const areaCard = ui.card({
      title: 'Sebaran wilayah',
      body: areas.length
        ? ui.list(areas.map((a) => ({ title: ui.esc(a.area), meta: `${num(a.n)} mitra`, right: ui.pill(`${num(a.aktif)} aktif`, 'green') })))
        : '<p class="muted sm">Belum ada wilayah.</p>',
    });
    let userCard = '';
    if (manager) {
      const rows = (kpi.by_user || []).map((u) => ({
        label: `${u.name}`,
        value: u.aktif,
        sub: `${num(u.prospek)} ditemukan · ${num(u.berjalan)} berjalan`,
      }));
      userCard = ui.card({
        title: 'Konversi per karyawan',
        sub: 'mitra aktif dari prospek yang ditemukan',
        body: rows.length ? hBars({ rows }) : '<p class="muted sm">Belum ada data.</p>',
      });
    }
    return `<div class="stack">${kpis}<div class="grid ${manager ? 'g2' : ''}">${userCard}${areaCard}</div></div>`;
  }

  function tickHtml(m) {
    const usia = selisihHari(m.updated_at);
    const lembap = AKTIF_PIPELINE.includes(m.status) && usia !== null && usia > STALE_DAYS;
    const expected = [
      m.expected_paper_kg ? `${num(m.expected_paper_kg)} kg` : '',
      m.expected_oil_l ? `${num(m.expected_oil_l)} l` : '',
    ].filter(Boolean).join(' / ');
    const acts = [
      ctx.can('visits.manage') ? '<button type="button" class="btn xs" data-act="visit" data-id="' + m.id + '">Kunjungan</button>' : '',
      ctx.can('mitras.manage') ? '<button type="button" class="btn xs" data-act="status" data-id="' + m.id + '">Status</button>' : '',
    ].filter(Boolean).join('');
    return `<div class="tick" data-goto="/mitras/${m.id}">
      <div class="t">${ui.esc(m.name)}</div>
      <div class="m">${ui.esc(m.area || 'tanpa area')} · ${m.source_user_name ? ui.esc(m.source_user_name) : 'penemu belum dicatat'}</div>
      ${expected ? `<div class="m">${ui.esc(kategoriLabel(m.category))} · ${expected}</div>` : ''}
      <div class="m">Kontak terakhir ${ui.umur(m.updated_at)}${lembap ? ' <span style="color:var(--red)">· perlu dikejar</span>' : ''}</div>
      ${acts ? `<div class="row2">${acts}</div>` : ''}
    </div>`;
  }

  function boardHtml() {
    const cols = BOARD
      .map((status) => ({ status, items: mitras.filter((m) => m.status === status) }))
      .filter((c) => (['tidak_respon', 'ditolak'].includes(c.status) ? c.items.length > 0 : true));
    const perCol = (c) => {
      const head = `<div class="ch">${ui.badge(c.status)}<span class="n">${num(c.items.length)}</span></div>`;
      const body = c.items.length
        ? c.items.map(tickHtml).join('')
        : '<p class="muted sm">Kosong.</p>';
      return `<div class="col">${head}<div class="cb">${body}</div></div>`;
    };
    return `<div class="board">${cols.map(perCol).join('')}</div>`;
  }

  function warningHtml() {
    const stale = mitras
      .filter((m) => AKTIF_PIPELINE.includes(m.status))
      .map((m) => ({ m, usia: selisihHari(m.updated_at) }))
      .filter((x) => x.usia !== null && x.usia > STALE_DAYS)
      .sort((a, b) => b.usia - a.usia)
      .slice(0, 12);
    const body = stale.length
      ? ui.list(stale.map((x) => ({
        tone: 'amber',
        title: `<a class="lk" href="#/mitras/${x.m.id}">${ui.esc(x.m.name)}</a> ${ui.badge(x.m.status)}`,
        meta: `${ui.esc(x.m.area || 'tanpa area')} · ${x.m.source_user_name ? ui.esc(x.m.source_user_name) : 'penemu belum dicatat'}`,
        right: `<span class="sm ${x.m.status === 'aktif' ? 'muted' : ''}" style="color:var(--red)">${x.usia} hari</span>`,
      })))
      : '<p class="muted sm">Semua prospek masih hangat. Tidak ada yang perlu dikejar.</p>';
    return ui.card({ title: 'Perlu dikejar', sub: `tanpa kontak lebih dari ${STALE_DAYS} hari`, body });
  }

  function controlsHtml() {
    return ui.filters(`
      <div class="fld"><label class="chk"><input type="checkbox" data-filter="mine" ${state.mine ? 'checked' : ''}><span>Hanya prospek saya</span></label></div>
      <div class="end sm muted" id="prospect-count">memuat…</div>
    `);
  }

  function paint() {
    page.innerHTML = `
      <div class="stack">
        <div id="prospect-kpi">${kpiHtml()}</div>
        ${controlsHtml()}
        <div id="prospect-board">${boardHtml()}</div>
        ${warningHtml()}
      </div>`;
    const c = document.getElementById('prospect-count');
    if (c) c.textContent = `${num(mitras.length)} mitra tampil`;
  }

  async function reload() {
    const usp = new URLSearchParams();
    if (state.mine) usp.set('mine', '1');
    usp.set('limit', '500');
    const [listRes, pipeRes] = await Promise.all([
      api.get(`/api/mitras?${usp.toString()}`),
      api.get('/api/mitras/pipeline'),
    ]);
    mitras = listRes.mitras || [];
    kpi = pipeRes;
    paint();
  }

  try {
    await reload();
  } catch (err) {
    page.innerHTML = ui.empty(err.message || 'Papan gagal dimuat.', '<button type="button" class="btn pri" data-act="retry">Coba lagi</button>');
    return;
  }

  ui.on(page, 'change', '[data-filter="mine"]', (ev, el) => {
    if (!alive) return;
    state.mine = el.checked;
    reload().catch((e) => ui.toast(e.message || 'Gagal memuat.', 'bad'));
  });

  ui.on(page, 'click', '[data-act]', async (ev, el) => {
    if (!alive) return;
    const act = el.dataset.act;
    try {
      if (act === 'new') openCreate();
      else if (act === 'retry') reload().catch((e) => ui.toast(e.message || 'Gagal memuat.', 'bad'));
      else if (act === 'visit') openVisit(mitras.find((m) => Number(m.id) === Number(el.dataset.id)));
      else if (act === 'status') openStatus(mitras.find((m) => Number(m.id) === Number(el.dataset.id)));
    } catch (err) {
      ui.toast(err.message || 'Terjadi kesalahan.', 'bad');
    }
  });

  ui.on(page, 'click', '[data-goto]', (ev, el) => {
    if (!alive) return;
    if (ev.target.closest('[data-act]')) return;
    ctx.go(el.dataset.goto);
  });

  return () => { alive = false; };
}
