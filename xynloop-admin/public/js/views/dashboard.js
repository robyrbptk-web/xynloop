/** Dashboard: ringkasan harian, aktivitas berjalan, peringatan, dan pipeline. */
import { api } from '../api.js';
import { lineChart, donut } from '../charts.js';
import * as ui from '../ui.js';
import { berat, card, empty, esc, jam, kpi, list, loading, pill, rp, rpShort, table, tglPendek, umur } from '../ui.js';

const STATUS_AKTIF = { dalam_perjalanan: 'amber', menimbang: 'purple' };

function runRow(r) {
  return `<tr class="clk" data-run="${r.id}">
    <td><div class="nm">${esc(r.mitra_name)}</div><div class="sm mono">${esc(r.code)}</div></td>
    <td>${ui.badge(r.status)}${r.area ? `<div class="sm muted">${esc(r.area)}</div>` : ''}</td>
    <td class="num">${r.lines ? `${berat(r.paper_kg)}<div class="sm muted">${berat(r.oil_liters, 'l')}</div>` : '<span class="muted">belum ada timbangan</span>'}</td>
    <td class="num">${r.amount ? rp(r.amount) : '—'}</td>
    <td class="sm">${esc(r.crew_names || '—')}${r.plates ? `<div class="muted mono">${esc(r.plates)}</div>` : ''}</td>
    <td>${r.receipt_status ? ui.badge(r.receipt_status, `Kwitansi ${ui.LABEL[r.receipt_status] || r.receipt_status}`) : '<span class="muted sm">tanpa kwitansi</span>'}</td>
  </tr>`;
}

export default async function render(page, ctx) {
  page.innerHTML = loading('Memuat ringkasan operasional…');
  ctx.setTopbarActions(`<a class="btn sm" href="#/papan">Papan hari ini</a>
    ${ctx.can('pickups.manage') ? '<a class="btn sm pri" href="#/papan">+ Pengambilan</a>' : ''}`);
  const d = await api.get('/api/dashboard/summary');
  const manager = ctx.isManager();

  const kpiHari = `
    <div class="grid g4">
      ${kpi({ label: 'Kertas hari ini', value: `${angkaWrap(d.today.paper_kg)}<small> kg</small>`, hint: `${d.today.runs} pengambilan · minggu ${angkaWrap(d.week.paper_kg)} kg` })}
      ${kpi({ label: 'Jelantah hari ini', value: `${angkaWrap(d.today.oil_liters)}<small> l</small>`, hint: `minggu ${angkaWrap(d.week.oil_liters)} l`, tone: 'teal' })}
      ${kpi({ label: 'Nilai pembelian', value: rpShort(d.today.amount || 0), hint: `hari ini · bulan ${rp(d.month.amount)}`, tone: 'green' })}
      ${kpi({ label: 'Mobil turun', value: `${d.today.vehicles || d.vehicles_today}<small> unit</small>`, hint: manager && d.today.fuel_cost != null ? `BBM hari ini ${rp(d.today.fuel_cost)}` : `mitra aktif ${d.mitras.active}`, tone: 'amber' })}
    </div>`;

  const chart = d.series_14d.length
    ? (() => {
      const c = lineChart({
        labels: d.series_14d.map((x) => tglPendek(x.d)),
        series: [
          { name: 'Kertas (kg)', values: d.series_14d.map((x) => x.paper_kg), color: '#3e9b3a' },
          { name: 'Jelantah (l)', values: d.series_14d.map((x) => x.oil_liters), color: '#167d6b' },
        ],
        height: 210,
        format: (v) => ui.angka(v),
      });
      return `${c.html}${c.legend}`;
    })()
    : empty('Belum ada pengambilan 14 hari terakhir.');

  const pipe = donut({
    slices: d.pipeline.map((p) => ({ label: ui.LABEL[p.status] || p.status, value: p.n })),
    centerSub: 'mitra',
    format: (v) => ui.angka(v),
  });

  const alertHtml = d.alerts.length
    ? list(d.alerts.map((a) => ({
      tone: a.level === 'warn' ? 'amber' : a.level === 'info' ? '' : 'grey',
      title: esc(a.text),
      meta: (a.links || a.mitras || []).slice(0, 4).map((x) => `<a class="lk" href="#/${a.mitras ? 'mitras' : 'pengambilan'}/${x.id}">${esc(x.name || x.code)}</a>`).join(' · ') || '',
      right: a.links || a.mitras ? pill(`${(a.links || a.mitras).length}`, 'grey') : '',
    })))
    : '<p class="muted sm">Tidak ada peringatan. Semua beres.</p>';

  const field = d.crew_on_field.length
    ? list(d.crew_on_field.map((c) => ({
      tone: 'amber',
      title: `<a class="lk" href="#/pengambilan">${esc(c.name)}</a>`,
      meta: `${esc(c.pickup_code || '')} · ${esc(c.mitra_name || '')} · GPS ${c.last_seen ? umur(c.last_seen) : 'belum ada'}`,
      right: c.lat != null ? `<a class="btn xs" href="#/tracking">Lihat</a>` : pill('tanpa GPS', 'grey'),
    })))
    : '<p class="muted sm">Tidak ada tim yang sedang di jalan.</p>';

  const upcoming = d.upcoming.length
    ? table({
      columns: [
        { label: 'Mitra', render: (r) => `<div class="nm">${esc(r.mitra_name)}</div><div class="sm mono">${esc(r.code)}</div>` },
        { label: 'Jadwal', align: 'right', render: (r) => `${tglPendek(r.date)}<div class="sm muted">${r.scheduled_at ? jam(r.scheduled_at) : 'tanpa jam'}</div>` },
        { label: 'Tim', render: (r) => `<span class="sm">${esc(r.crew_names || 'belum ditunjuk')}</span>${r.plates ? `<div class="sm muted mono">${esc(r.plates)}</div>` : ''}` },
      ],
      rows: d.upcoming,
      onRow: (r) => `#/pengambilan/${r.id}`,
    })
    : empty('Tidak ada pengambilan terjadwal.');

  const tasks = d.my_tasks.length
    ? list(d.my_tasks.map((m) => ({
      tone: m.status === 'negosiasi' ? 'amber' : 'grey',
      title: `<a class="lk" href="#/mitras/${m.id}">${esc(m.name)}</a> ${ui.badge(m.status)}`,
      meta: `${esc(m.area || 'tanpa area')} · ${m.sourced_by ? `ditemukan ${esc(m.sourced_by)}` : 'belum ada penanggung jawab'}${m.expected_paper_kg ? ` · perkiraan ${angkaWrap(m.expected_paper_kg)} kg` : ''}${m.expected_oil_l ? ` / ${angkaWrap(m.expected_oil_l)} l` : ''}`,
    })))
    : '<p class="muted sm">Tidak ada prospek yang menunggu tindak lanjut.</p>';

  page.innerHTML = `
    ${kpiHari}
    ${d.active_runs.length ? `<div class="grid" style="margin-top:14px">${card({
    title: 'Sedang berjalan',
    sub: `${d.active_runs.length} tim di lapangan`,
    flush: true,
    body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mitra</th><th>Status</th><th class="num">Hasil</th><th class="num">Nilai</th><th>Tim</th><th>Kwitansi</th></tr></thead><tbody>${d.active_runs.map(runRow).join('')}</tbody></table></div>`,
  })}</div>` : ''}
    <div class="grid g2" style="margin-top:14px">
      ${card({ title: 'Hasil 14 hari terakhir', sub: 'kg kertas & liter jelantah', body: chart })}
      <div class="stack">
        ${card({ title: 'Pipeline mitra', body: `${pipe.html}${pipe.legend}`, cls: 'gcol-2' })}
        ${card({ title: 'Perlu perhatian', body: alertHtml })}
      </div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      ${card({ title: 'Pengambilan hari ini', sub: d.date, flush: true, body: d.today_runs.length ? `<table class="tbl"><thead><tr><th>Mitra</th><th>Status</th><th class="num">Hasil</th><th class="num">Nilai</th><th>Tim</th><th>Kwitansi</th></tr></thead><tbody>${d.today_runs.map(runRow).join('')}</tbody></table>` : empty('Belum ada pengambilan hari ini.', '<a class="btn pri sm" href="#/papan">Buka papan</a>') })}
      ${card({ title: 'Baru selesai', flush: true, body: `<table class="tbl"><thead><tr><th>Mitra</th><th>Status</th><th class="num">Hasil</th><th class="num">Nilai</th><th>Tim</th><th>Kwitansi</th></tr></thead><tbody>${d.recent.map(runRow).join('')}</tbody></table>` })}
    </div>
    <div class="grid g3" style="margin-top:14px">
      ${card({ title: 'Menunggu jadwal', flush: true, body: upcoming })}
      ${card({ title: 'Tim di lapangan', body: field })}
      ${card({ title: manager ? 'Penawaran berjalan' : 'Tugas saya', body: tasks })}
    </div>
    ${manager ? `<div class="grid g4" style="margin:14px 0 4px">
      ${kpi({ label: 'Mitra aktif', value: d.mitras.active, hint: `${d.mitras.new_this_month} prospek baru bulan ini`, tone: 'green' })}
      ${kpi({ label: 'Prospek dibuka', value: d.mitras.prospek, hint: `${d.mitras.active_this_month} menjadi mitra bulan ini`, tone: 'amber' })}
      ${kpi({ label: 'Kas keluar bulan ini', value: rp(d.cash_out_month), hint: 'kwitansi terbit + lunas', tone: 'teal' })}
      ${kpi({ label: 'BBM bulan ini', value: rp(d.fuel_month), hint: `total pembelian bulan ${tglPendek(`${d.date.slice(0, 7)}-01`)}` })}
    </div>` : ''}`;

  ui.on(page, 'click', 'tr.clk', (ev, tr) => {
    if (tr.dataset.run) return ctx.go(`/pengambilan/${tr.dataset.run}`);
    const row = d.upcoming[Number(tr.dataset.idx)];
    if (row) ctx.go(`/pengambilan/${row.id}`);
  });
}

function angkaWrap(v) {
  return ui.angka(Number(v) || 0, Number(v) % 1 === 0 ? 0 : 1);
}
