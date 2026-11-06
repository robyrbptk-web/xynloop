/** Laporan: atribusi karyawan, kru, mitra, material, armada, wilayah, dan ekspor CSV. */
import { api, query } from '../api.js';
import { barChart, donut, hBars, lineChart } from '../charts.js';
import * as ui from '../ui.js';
import { angka, badge, berat, card, dateBox, empty, esc, filters, inputBox, kpi, loading, rp, rpShort, selectBox, statRow, table, tgl, tglPendek, umur } from '../ui.js';

const TABS = [
  { id: 'attribution', label: 'Karyawan', caps: null },
  { id: 'crew', label: 'Kru penjemput', caps: null },
  { id: 'mitras', label: 'Mitra', caps: null },
  { id: 'materials', label: 'Material', caps: null },
  { id: 'vehicles', label: 'Armada & BBM', caps: 'reports.costs' },
  { id: 'areas', label: 'Wilayah', caps: null },
  { id: 'trend', label: 'Tren', caps: null },
];

const PERIODE = [
  { value: '7', label: '7 hari terakhir' },
  { value: '30', label: '30 hari terakhir' },
  { value: '90', label: '90 hari terakhir' },
  { value: '180', label: '6 bulan terakhir' },
  { value: 'custom', label: 'Tanggal sendiri' },
];

function shiftDay(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return ui.tanggalIso(d);
}

export default async function render(page, ctx) {
  const q = ctx.params.q || new URLSearchParams();
  const state = {
    tab: (q.get('tab') || 'attribution'),
    preset: q.get('preset') || '30',
    from: q.get('from') || shiftDay(29),
    to: q.get('to') || ui.tanggalIso(),
  };
  if (!ctx.can('reports.costs') && state.tab === 'vehicles') state.tab = 'attribution';

  ctx.setTopbarActions(`
    <button class="btn sm" type="button" data-act="export">Ekspor CSV</button>
    <button class="btn sm" type="button" data-act="reload">&#8635; Muat ulang</button>`);

  page.innerHTML = ui.loading('Menyusun laporan…');
  let data = null;

  const tanggalLabel = () => `${tgl(state.from)} – ${tgl(state.to)}`;
  const range = () => ({ from: state.from, to: state.to });

  async function load() {
    const [summary, main] = await Promise.all([
      api.get(`/api/reports/summary${query(range())}`),
      loadTab(),
    ]);
    return { summary, main };
  }

  function loadTab() {
    switch (state.tab) {
      case 'attribution': return api.get(`/api/reports/attribution${query(range())}`);
      case 'crew': return api.get(`/api/reports/crew${query(range())}`);
      case 'mitras': return api.get(`/api/reports/mitras${query({ ...range(), limit: 60 })}`);
      case 'materials': return api.get(`/api/reports/materials${query(range())}`);
      case 'vehicles': return ctx.can('reports.costs') ? api.get(`/api/reports/vehicles${query(range())}`) : Promise.resolve(null);
      case 'areas': return api.get(`/api/reports/areas${query(range())}`);
      default: return api.get(`/api/reports/timeseries${query({ ...range(), group: presetGroup() })}`);
    }
  }

  function presetGroup() {
    const d = Math.round((new Date(state.to) - new Date(state.from)) / 86400000);
    return d > 120 ? 'month' : d > 40 ? 'week' : 'day';
  }

  function paintSkeleton() {
    page.innerHTML = `
      ${filters(`
        ${selectBox({ name: 'preset', label: 'Periode', options: PERIODE, value: state.preset, all: '' })}
        ${dateBox({ name: 'from', label: 'Dari', value: state.from })}
        ${dateBox({ name: 'to', label: 'Sampai', value: state.to })}
        <div class="fld"><label>&nbsp;</label><button class="btn sm pri" type="button" data-act="apply">Terapkan</button></div>
      `)}
      <div id="rp-body">${ui.loading()}</div>`;
    wireFilters();
  }

  function wireFilters() {
    const presetSel = page.querySelector('[data-filter="preset"]');
    const dateFields = page.querySelectorAll('[data-filter="from"], [data-filter="to"]');
    dateFields.forEach((inp) => inp.addEventListener('change', () => {
      state[inp.dataset.filter] = inp.value;
      state.preset = 'custom';
      if (presetSel) presetSel.value = 'custom';
    }));
    if (presetSel) {
      presetSel.addEventListener('change', () => {
        const v = presetSel.value;
        if (v && v !== 'custom') {
          state.preset = v;
          state.to = ui.tanggalIso();
          state.from = shiftDay(Number(v) - 1);
        } else {
          state.preset = 'custom';
        }
        refresh();
      });
    }
  }

  function headerCards(s) {
    const t = s.totals;
    const manager = ctx.isManager();
    const items = [
      kpi({ label: 'Pengambilan', value: `${angka(t.runs)}<small> run</small>`, hint: tanggalLabel() }),
      kpi({ label: 'Kertas diperoleh', value: `${angka(t.paper_kg, 1)}<small> kg</small>`, hint: manager ? `rata-rata ${rp(t.avg_price_paper)}/kg` : `nilai ${rp(t.paper_amount)}`, tone: 'green' }),
      kpi({ label: 'Jelantah diperoleh', value: `${angka(t.oil_liters, 1)}<small> l</small>`, hint: manager ? `rata-rata ${rp(t.avg_price_oil)}/l` : `nilai ${rp(t.oil_amount)}`, tone: 'teal' }),
      kpi({ label: 'Nilai pembelian', value: rpShort(t.amount || 0), hint: `total ${rp(t.amount)}`, tone: 'amber' }),
    ];
    if (manager) {
      items.push(kpi({
        label: 'Biaya BBM',
        value: rpShort(t.fuel_cost || 0),
        hint: `${angka(t.fuel_liters, 1)} l · ${rp(t.cost_per_kg)}/kg`,
        tone: 'red',
      }));
    }
    return `<div class="grid ${manager ? 'g5' : 'g4'}">${items.join('')}</div>`;
  }

  function tabBody(d) {
    const bar = `<div class="tabs">${TABS.filter((t) => !t.caps || ctx.can(t.caps)).map((t) => `<button type="button" class="${t.id === state.tab ? 'on' : ''}" data-tab="${t.id}">${esc(t.label)}</button>`).join('')}</div>`;
    let inner;
    switch (state.tab) {
      case 'attribution': inner = tabAttribution(d); break;
      case 'crew': inner = tabCrew(d); break;
      case 'mitras': inner = tabMitras(d); break;
      case 'materials': inner = tabMaterials(d); break;
      case 'vehicles': inner = tabVehicles(d); break;
      case 'areas': inner = tabAreas(d); break;
      default: inner = tabTrend(d);
    }
    return `${bar}${inner}`;
  }

  /* --------------------------- Atribusi karyawan --------------------------- */
  function tabAttribution(d) {
    const rows = (d.rows || []).filter((x) => x.mitras_total || x.paper_kg || x.oil_liters || x.kunjungan || x.role === 'purchasing');
    if (!rows.length) return empty('Belum ada aktivitas mitra pada periode ini.');
    const byQty = [...rows].sort((a, b) => (b.paper_kg + b.oil_liters) - (a.paper_kg + a.oil_liters));
    const chart = hBars({
      rows: byQty.map((x) => ({
        label: `${x.name}${x.role === 'purchasing' ? '' : ` (${ui.LABEL[x.role] || x.role})`}`,
        value: x.paper_kg + x.oil_liters,
        sub: `${angka(x.paper_kg, 1)} kg · ${angka(x.oil_liters, 1)} l`,
      })),
      format: (v) => `${angka(v, 1)} satuan`,
    });
    const topTable = table({
      columns: [
        { label: 'Karyawan', render: (x) => `<div class="nm">${esc(x.name)}</div><div class="sm muted">${badge(x.role)}${x.area ? ` · ${esc(x.area)}` : ''}</div>` },
        { label: 'Mitra ditemukan', align: 'right', render: (x) => `${angka(x.mitras_total)}<div class="sm muted">${angka(x.mitras_prospek)} prospek</div>` },
        { label: 'Menjadi mitra aktif', align: 'right', render: (x) => `${angka(x.mitras_aktif)}<div class="sm muted">${angka(x.conversion)}%</div>` },
        { label: 'Kunjungan', align: 'right', render: (x) => angka(x.kunjungan) },
        { label: 'Surat terkirim', align: 'right', render: (x) => `${angka(x.penawaran)}<div class="sm muted">${angka(x.penawaran_diterima)} disetujui</div>` },
        { label: 'Kertas', align: 'right', render: (x) => berat(x.paper_kg) },
        { label: 'Jelantah', align: 'right', render: (x) => berat(x.oil_liters, 'l') },
        { label: 'Nilai', align: 'right', render: (x) => rp(x.amount) },
        { label: 'Bagian', align: 'right', render: (x) => x.mitras_total ? `${angka(x.share, 1)}%` : '—' },
      ],
      rows: byQty,
      emptyText: 'Tidak ada karyawan yang tercatat.',
    });
    return `
      ${card({ title: 'Hasil yang diperoleh per karyawan', sub: 'dihitung dari mitra yang ditemukan karyawan tersebut', body: chart })}
      ${card({ title: 'Rekap lengkap', sub: tanggalLabel(), flush: true, body: topTable, foot: `<span class="sm muted">Total seluruh hasil: <b>${angka(d.total_qty, 2)}</b> kg/liter. Atribusi mengikuti karyawan yang mencatat mitra pertama kali, meskipun penjemputan dilakukan kru lain.</span>` })}`;
  }

  function tabCrew(d) {
    const rows = d.rows || [];
    if (!rows.length) return empty('Belum ada kru yang turun pada periode ini.');
    const chart = barChart({
      labels: rows.map((x) => x.name.split(' ')[0]),
      series: [
        { name: 'Kertas (kg)', values: rows.map((x) => x.paper_kg), color: '#3e9b3a' },
        { name: 'Jelantah (l)', values: rows.map((x) => x.oil_liters), color: '#167d6b' },
      ],
      height: 210,
      format: (v) => angka(v),
    });
    return `
      ${card({ title: 'Hasil diboyong kru penjemput', body: `${chart.html}${chart.legend}` })}
      ${card({ title: 'Rincian', flush: true, body: table({
  columns: [
    { label: 'Kru', render: (x) => `<div class="nm">${esc(x.name)}</div><div class="sm muted">${badge(x.role)}</div>` },
    { label: 'Pengambilan', align: 'right', render: (x) => angka(x.runs) },
    { label: 'Kertas', align: 'right', render: (x) => berat(x.paper_kg) },
    { label: 'Jelantah', align: 'right', render: (x) => berat(x.oil_liters, 'l') },
    { label: 'Nilai', align: 'right', render: (x) => rp(x.amount) },
    { label: 'Run kosong', align: 'right', render: (x) => x.empty_runs ? `<span class="bdg b-amber">${angka(x.empty_runs)}</span>` : '—' },
  ],
  rows,
}) })}`;
  }

  function tabMitras(d) {
    const rows = d.rows || [];
    const top = rows.slice(0, 8);
    const chart = top.length ? hBars({
      rows: top.map((x) => ({ label: x.name, value: x.paper_kg + x.oil_liters, sub: `${angka(x.paper_kg, 1)} kg · ${angka(x.oil_liters, 1)} l` })),
      format: (v) => `${angka(v, 1)} satuan`,
    }) : '';
    return `
      ${top.length ? card({ title: 'Mitra penghasil terbanyak', sub: 'periode terpilih', body: chart }) : ''}
      ${card({
  title: 'Peringkat mitra',
  flush: true,
  body: table({
    columns: [
      { label: 'Mitra', render: (x) => `<div class="nm">${esc(x.name)}</div><div class="sm mono">${esc(x.code)}${x.area ? ` · ${esc(x.area)}` : ''}</div>` },
      { label: 'Status', render: (x) => badge(x.status) },
      { label: 'Ditemukan oleh', render: (x) => esc(x.sourced_by || '—') },
      { label: 'Pengambilan', align: 'right', render: (x) => angka(x.runs) },
      { label: 'Kertas', align: 'right', render: (x) => berat(x.paper_kg) },
      { label: 'Jelantah', align: 'right', render: (x) => berat(x.oil_liters, 'l') },
      { label: 'Nilai', align: 'right', render: (x) => rp(x.amount) },
      { label: 'Terakhir diambil', align: 'right', render: (x) => x.last_pickup ? `${tglPendek(x.last_pickup)}<div class="sm muted">${umur(x.last_pickup)}</div>` : '<span class="muted">belum pernah</span>' },
    ],
    rows,
    onRow: (x) => x.id,
    emptyText: 'Tidak ada mitra dengan aktivitas pada periode ini.',
  }),
})}
      ${(d.dormant || []).length ? card({
  title: 'Perlu dijenguk lagi',
  sub: 'mitra aktif yang belum diambil lebih dari 3 minggu',
  body: ui.list(d.dormant.map((m) => ({
    tone: 'amber',
    title: `<a class="lk" href="#/mitras/${m.id}">${esc(m.name)}</a>`,
    meta: `${esc(m.area || 'tanpa wilayah')} · ditemukan ${esc(m.sourced_by || '—')} · terakhir ${m.last_pickup ? tgl(m.last_pickup) : 'belum pernah'} `,
    right: badge('prospek', m.last_pickup ? 'terlewat' : 'belum pernah'),
  }))),
}) : ''}`;
  }

  function tabMaterials(d) {
    const rows = d.rows || [];
    if (!rows.length) return empty('Belum ada timbangan pada periode ini.');
    const paper = rows.filter((x) => x.category === 'kertas');
    const oil = rows.filter((x) => x.category === 'jelantah');
    const chart = barChart({
      labels: rows.map((x) => x.name),
      series: [{ name: 'Jumlah', values: rows.map((x) => x.qty), color: '#3e9b3a' }],
      height: 200,
      format: (v) => `${angka(v)} satuan`,
    });
    return `
      ${card({ title: 'Volume per jenis bahan', sub: 'kg untuk kertas, liter untuk jelantah', body: `${chart.html}${chart.legend}` })}
      ${card({ title: 'Rincian material', flush: true, body: table({
  columns: [
    { label: 'Material', render: (x) => `<div class="nm">${esc(x.name)}</div><div class="sm mono">${esc(x.code)} · ${badge(x.category)}</div>` },
    { label: 'Terima', align: 'right', render: (x) => berat(x.qty, x.unit) },
    { label: 'Harga rata-rata', align: 'right', render: (x) => rp(x.avg_price) },
    { label: 'Nilai', align: 'right', render: (x) => rp(x.amount) },
    { label: 'Diambil dari', align: 'right', render: (x) => `${angka(x.mitras)} mitra<div class="sm muted">${angka(x.runs)} pengambilan</div>` },
  ],
  rows,
}) })}
      ${card({ title: 'Campuran kertas vs jelantah', body: (() => {
    const dn = donut({
      slices: [
        { label: 'Kertas', value: paper.reduce((a, x) => a + x.amount, 0), color: '#3e9b3a' },
        { label: 'Jelantah', value: oil.reduce((a, x) => a + x.amount, 0), color: '#167d6b' },
      ],
      format: (v) => rpShort(v),
      centerSub: 'nilai pembelian',
    });
    return `${dn.html}${dn.legend}`;
  })() })}`;
  }

  function tabVehicles(d) {
    if (!d) return empty('Laporan armada hanya tersedia untuk admin/pemilik.');
    const rows = d.rows || [];
    if (!rows.length) return empty('Belum ada armada terpakai pada periode ini.');
    const chart = barChart({
      labels: rows.map((x) => x.plate),
      series: [{ name: 'Jarak (km)', values: rows.map((x) => x.km), color: '#167d6b' }, { name: 'BBM (l)', values: rows.map((x) => x.liters), color: '#c98a13' }],
      height: 210,
      format: (v) => angka(v, 1),
    });
    return `
      ${card({ title: 'Jarak & konsumsi BBM per armada', body: `${chart.html}${chart.legend}` })}
      ${card({ title: 'Rekap armada', sub: d.note, flush: true, body: table({
  columns: [
    { label: 'Armada', render: (x) => `<div class="nm mono">${esc(x.plate)}</div><div class="sm muted">${esc(x.name)} · ${badge(x.type)}</div>` },
    { label: 'Run', align: 'right', render: (x) => angka(x.runs) },
    { label: 'Jarak', align: 'right', render: (x) => `${angka(x.km, 1)} km<div class="sm muted">${x.km_from_odometer ? 'spido ' + angka(x.km_from_odometer, 1) : 'GPS ' + angka(x.km_from_gps, 1)} km</div>` },
    { label: 'BBM', align: 'right', render: (x) => `${angka(x.liters, 1)} l<div class="sm muted">${esc(x.fuel_type)}</div>` },
    { label: 'Konsumsi', align: 'right', render: (x) => x.effective_consumption ? `${angka(x.effective_consumption, 1)} km/l` : '<span class="muted">—</span>' },
    { label: 'Biaya', align: 'right', render: (x) => rp(x.cost) },
    { label: 'Rp / km', align: 'right', render: (x) => rp(x.rupiah_per_km) },
    { label: 'Hasil diboyong', align: 'right', render: (x) => `${berat(x.paper_kg)}<div class="sm muted">${berat(x.oil_liters, 'l')}</div>` },
    { label: 'Rp / kg', align: 'right', render: (x) => rp(x.cost_per_kg) },
  ],
  rows,
}) })}
      <div class="grid g2">
        ${card({ title: 'Armada tidak terpakai', body: (d.idle_vehicles || []).length ? ui.list(d.idle_vehicles.map((v) => ({ tone: 'grey', title: `<span class="mono">${esc(v.plate)}</span> ${esc(v.name)}`, meta: ui.LABEL[v.type] || v.type, right: `<a class="btn xs" href="#/armada">Kelola</a>` }))) : '<p class="muted sm">Semua armada aktif terpakai pada periode ini.</p>' })}
        ${card({ title: 'Pengambilan tanpa armada', body: `<p class="lead">Sebaiknya setiap pengambilan dicatat mobil yang dipakai agar biaya BBM akurat.</p>${statRow([{ label: 'Run tanpa armada', value: angka(d.pickups_without_vehicle || 0) }, ...(d.fuel_price_reference || []).map((f) => ({ label: `${esc(f.fuel_type)} sejak ${tglPendek(f.effective_from)}`, value: rp(f.price_per_liter) }))])}` })}
      </div>`;
  }

  function tabAreas(d) {
    const rows = d.rows || [];
    if (!rows.length) return empty('Belum ada wilayah tercatat.');
    const chart = donut({
      slices: rows.slice(0, 6).map((x) => ({ label: x.area, value: x.amount })),
      format: (v) => rpShort(v),
      centerSub: 'total nilai',
    });
    return `
      ${card({ title: 'Sebaran nilai pembelian', body: `${chart.html}${chart.legend}` })}
      ${card({ title: 'Per wilayah', flush: true, body: table({
  columns: [
    { label: 'Wilayah', render: (x) => `<div class="nm">${esc(x.area)}</div>` },
    { label: 'Mitra', align: 'right', render: (x) => `${angka(x.mitras)}<div class="sm muted">${angka(x.aktif)} aktif</div>` },
    { label: 'Pengambilan', align: 'right', render: (x) => angka(x.runs) },
    { label: 'Kertas', align: 'right', render: (x) => berat(x.paper_kg) },
    { label: 'Jelantah', align: 'right', render: (x) => berat(x.oil_liters, 'l') },
    { label: 'Nilai', align: 'right', render: (x) => rp(x.amount) },
  ],
  rows,
  onRow: true,
}) })}`;
  }

  function tabTrend(d) {
    const rows = d.series || [];
    if (!rows.length) return empty('Belum ada data pada periode ini.');
    const chart = lineChart({
      labels: rows.map((x) => x.label),
      series: [
        { name: 'Kertas (kg)', values: rows.map((x) => x.paper_kg), color: '#3e9b3a' },
        { name: 'Jelantah (l)', values: rows.map((x) => x.oil_liters), color: '#167d6b' },
      ],
      height: 220,
      format: (v) => angka(v),
    });
    const money = barChart({
      labels: rows.map((x) => x.label),
      series: [
        { name: 'Nilai pembelian (Rp)', values: rows.map((x) => x.amount), color: '#3e9b3a' },
        ...(ctx.can('reports.costs') ? [{ name: 'Biaya BBM (Rp)', values: rows.map((x) => x.fuel_cost), color: '#c98a13' }] : []),
      ],
      height: 200,
      format: (v) => rpShort(v),
    });
    return `
      ${card({ title: `Volume per ${d.group === 'month' ? 'bulan' : d.group === 'week' ? 'minggu' : 'hari'}`, body: `${chart.html}${chart.legend}` })}
      ${card({ title: 'Nilai pembelian vs biaya BBM', body: `${money.html}${money.legend}` })}
      ${card({ title: 'Detail periode', flush: true, body: table({
  columns: [
    { label: d.group === 'month' ? 'Bulan' : d.group === 'week' ? 'Minggu' : 'Tanggal', render: (x) => `<span class="nm">${esc(x.label)}</span>` },
    { label: 'Run', align: 'right', render: (x) => angka(x.runs) },
    { label: 'Kertas', align: 'right', render: (x) => berat(x.paper_kg) },
    { label: 'Jelantah', align: 'right', render: (x) => berat(x.oil_liters, 'l') },
    { label: 'Mobil jalan', align: 'right', render: (x) => angka(x.vehicle_trips) },
    { label: 'Jarak', align: 'right', render: (x) => ctx.can('reports.costs') ? `${angka(x.distance_km, 1)} km` : '—' },
    { label: 'BBM', align: 'right', render: (x) => ctx.can('reports.costs') ? rp(x.fuel_cost) : '—' },
    { label: 'Nilai', align: 'right', render: (x) => rp(x.amount) },
  ],
  rows,
}) })}`;
  }

  async function refresh() {
    paintSkeleton();
    try {
      const { summary, main } = await load();
      document.getElementById('rp-body').innerHTML = `
        ${headerCards(summary)}
        ${summary.scope === 'mine' ? `<p class="muted sm" style="margin:10px 0 0">${esc(ctx.me.name)}: angka di atas hanya mencakup mitra dan pengambilan yang terkait dengan Anda.</p>` : ''}
        <div class="sep"></div>
        ${tabBody(main)}
        ${footer(summary)}`;
      ui.on(document.getElementById('rp-body'), 'click', '[data-tab]', (ev, b) => {
        state.tab = b.dataset.tab;
        refresh();
      });
    } catch (err) {
      document.getElementById('rp-body').innerHTML = ui.empty(err.message || 'Laporan tidak dapat dimuat.', '<button class="btn pri sm" type="button" data-act="reload">Coba lagi</button>');
    }
  }

  function footer(s) {
    const docs = s.documents || {};
    const kw = (docs.receipts || []).reduce((a, x) => a + x.n, 0);
    const kwNilai = (docs.receipts || []).reduce((a, x) => a + (x.status === 'batal' ? 0 : x.amount), 0);
    const surat = (docs.offers || []).reduce((a, x) => a + x.n, 0);
    const m = s.mitras || {};
    return card({
      title: 'Ringkasan periode',
      body: `${statRow([
        { label: 'Kwitansi terbit', value: `${angka(kw)}<div class="sm muted">${rp(kwNilai)}</div>` },
        { label: 'Surat penawaran', value: `${angka(surat)}<div class="sm muted">${((docs.offers || []).find((x) => x.status === 'diterima') || {}).n || 0} disetujui</div>` },
        { label: 'Mitra aktif', value: `${angka(m.active)}<div class="sm muted">${angka(m.prospects)} prospek, ${angka(m.offered)} penawaran</div>` },
        { label: 'Mitra baru periode ini', value: `${angka(m.new_in_range)}<div class="sm muted">${angka(m.converted_in_range)} jadi mitra aktif</div>` },
        ...(s.runs_by_status || []).filter((x) => x.status === 'batal').map((x) => ({ label: 'Dibatalkan', value: angka(x.n) })),
      ])}`,
      foot: `<span class="sm muted">Periode ${esc(tanggalLabel())} · data diambil langsung dari timbangan dan bukan estimasi.</span>`,
    });
  }

  ui.on(page, 'click', '[data-act]', (ev, t) => {
    const act = t.dataset.act;
    if (act === 'reload' || act === 'apply') refresh();
    if (act === 'export') openExport();
  });

  async function openExport() {
    let list = [];
    try {
      list = (await api.get('/api/reports/available')).reports.filter((x) => x.available);
    } catch (err) {
      ui.toastError(err);
      return;
    }
    ui.formDialog({
      title: 'Ekspor laporan (CSV)',
      subtitle: 'Berkas dibuka di tab baru dan dapat langsung dibuka di Excel.',
      size: 'thin',
      values: { type: 'attribution' },
      fields: [
        { name: 'type', label: 'Jenis laporan', type: 'select', required: true, col: 1, options: list.map((x) => ({ value: x.key, label: x.label })) },
      ],
      note: `Periode yang dipakai: ${tanggalLabel()}`,
      okLabel: 'Unduh CSV',
      onSubmit: (v) => {
        window.open(`/api/reports/export?type=${encodeURIComponent(v.type)}&from=${state.from}&to=${state.to}`, '_blank');
        ui.toast('Berkas sedang diunduh.', 'ok');
      },
    });
  }

  await refresh();
}
