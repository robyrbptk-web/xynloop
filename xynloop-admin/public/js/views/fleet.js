/** Armada: kendaraan, statistik pemakaian, dan harga BBM. */
import { api } from '../api.js';
import * as ui from '../ui.js';
import { card, empty, esc, loading, table, umur } from '../ui.js';

const VEHICLE_TYPES = [
  { value: 'mobil', label: 'Mobil' },
  { value: 'pick_up', label: 'Pick up' },
  { value: 'truk', label: 'Truk' },
  { value: 'motor', label: 'Motor' },
];

const FUEL_TYPES = [
  { value: 'pertalite', label: 'Pertalite' },
  { value: 'pertamax', label: 'Pertamax' },
  { value: 'pertamax-turbo', label: 'Pertamax Turbo' },
  { value: 'dexlite', label: 'Dexlite' },
  { value: 'pertamina-dex', label: 'Pertamina Dex' },
  { value: 'solar', label: 'Solar' },
  { value: 'bio', label: 'Bio Solar' },
];

const typeLabel = (v) => (VEHICLE_TYPES.find((t) => t.value === v) || {}).label || v;
const fuelLabel = (v) => (FUEL_TYPES.find((t) => t.value === v) || {}).label || String(v || '—');

function vehicleFields(v) {
  return [
    { name: 'plate', label: 'Nomor polisi', type: 'text', required: true, placeholder: 'B 1234 XYZ', value: v ? v.plate : '', hint: 'Format: B 1234 XYZ.' },
    { name: 'name', label: 'Nama kendaraan', type: 'text', required: true, placeholder: 'mis. Triton Putih', value: v ? v.name : '' },
    { name: 'type', label: 'Jenis', type: 'select', required: true, blank: false, options: VEHICLE_TYPES, value: v ? v.type : 'mobil' },
    { name: 'fuel_type', label: 'Jenis BBM', type: 'select', required: true, blank: false, options: FUEL_TYPES, value: v ? v.fuel_type : 'pertalite' },
    { name: 'consumption_km_per_l', label: 'Konsumsi (km/liter)', type: 'number', step: '0.1', min: 1, max: 40, value: v ? v.consumption_km_per_l : 10, hint: 'Antara 1 dan 40.' },
    { name: 'capacity_kg', label: 'Kapasitas angkut (kg)', type: 'number', min: 0, value: v ? v.capacity_kg : 1000 },
    { name: 'km_running', label: 'Odometer terkini (km)', type: 'number', min: 0, step: '0.1', value: v ? v.km_running : 0 },
    { name: 'notes', label: 'Catatan', type: 'textarea', rows: 2, col: 1, value: v ? v.notes || '' : '' },
  ];
}

function effectiveFuel(fuelPrices, today) {
  const map = {};
  for (const f of fuelPrices) {
    if (String(f.effective_from) > String(today)) continue; // harga belum berlaku
    const cur = map[f.fuel_type];
    if (!cur || String(f.effective_from) > String(cur.effective_from)) map[f.fuel_type] = f;
  }
  return map;
}

export default async function render(page, ctx) {
  if (!ctx.can('vehicles.manage')) {
    page.innerHTML = card({ body: `<p class="lead">Hanya admin/pemilik yang dapat membuka halaman ini.</p><a class="btn pri" href="#/">Kembali ke dashboard</a>` });
    return;
  }
  page.innerHTML = loading('Memuat data armada…');

  const today = (ctx.bootstrap && ctx.bootstrap.now ? String(ctx.bootstrap.now).slice(0, 10) : '') || ui.tanggalIso(new Date());
  const [vres, fres] = await Promise.all([
    api.get('/api/reference/vehicles'),
    api.get('/api/reference/fuel-prices'),
  ]);
  let vehicles = vres.vehicles || [];
  let fuelPrices = fres.fuel_prices || [];
  const showCost = ctx.can('reports.costs');

  ctx.setTopbarActions('<button type="button" class="btn sm pri" data-act="veh-new">+ Tambah kendaraan</button>');

  function vehColumns() {
    const cols = [
      { label: 'Plat', render: (v) => `<span class="mono">${esc(v.plate)}</span>` },
      { label: 'Nama', render: (v) => `<div class="nm">${esc(v.name)}</div>${v.is_active ? '' : '<div class="sm muted">nonaktif</div>'}` },
      { label: 'Jenis', render: (v) => ui.badge(v.type, typeLabel(v.type)) },
      { label: 'BBM', render: (v) => `<span class="sm">${esc(fuelLabel(v.fuel_type))}</span>` },
      { label: 'Konsumsi', align: 'right', render: (v) => `${ui.angka(v.consumption_km_per_l, v.consumption_km_per_l % 1 ? 1 : 0)} km/l` },
      { label: 'Kapasitas', align: 'right', render: (v) => `${ui.angka(v.capacity_kg)} kg` },
      { label: 'Odometer', align: 'right', render: (v) => `${ui.angka(v.km_running)} km` },
      { label: 'Pengambilan', align: 'right', render: (v) => ui.angka(v.runs) },
      { label: 'Total km', align: 'right', render: (v) => `${ui.angka(v.total_km)} km` },
      { label: 'Total liter', align: 'right', render: (v) => `${ui.angka(v.total_liters)} l` },
    ];
    if (showCost) cols.push({ label: 'Biaya BBM', align: 'right', render: (v) => ui.rp(v.total_cost) });
    cols.push({
      label: '',
      align: 'right',
      render: (v) => `<div class="row" style="gap:6px;justify-content:flex-end">
        <button type="button" class="btn xs" data-act="veh-edit" data-id="${v.id}">Edit</button>
        ${v.is_active
          ? `<button type="button" class="btn xs danger" data-act="veh-toggle" data-id="${v.id}">Nonaktifkan</button>`
          : `<button type="button" class="btn xs lime" data-act="veh-toggle" data-id="${v.id}">Aktifkan</button>`}
      </div>`,
    });
    return cols;
  }

  function paintVehicles() {
    document.getElementById('veh-body').innerHTML = vehicles.length
      ? table({ columns: vehColumns(), rows: vehicles, emptyText: 'Belum ada kendaraan.' })
      : empty('Belum ada kendaraan terdaftar.', '<button type="button" class="btn pri sm" data-act="veh-new">+ Tambah kendaraan</button>');
  }

  function paintFuel() {
    const eff = effectiveFuel(fuelPrices, today);
    const rows = FUEL_TYPES.map((t) => ({ type: t.value, label: t.label, price: eff[t.value] || null }));
    const used = new Set(vehicles.map((v) => v.fuel_type));
    document.getElementById('fuel-body').innerHTML = table({
      cls: '',
      columns: [
        { label: 'Jenis BBM', render: (r) => `${esc(r.label)}${used.has(r.type) ? '' : '<span class="sm muted"> · tidak dipakai</span>'}` },
        { label: 'Harga efektif', align: 'right', render: (r) => (r.price ? `${ui.rp(r.price.price_per_liter)}<div class="sm muted mono">/ liter</div>` : '<span class="muted sm">belum ada</span>') },
        { label: 'Berlaku sejak', render: (r) => (r.price ? `${ui.tgl(r.price.effective_from)}<div class="sm muted">${r.price.effective_from > today ? 'belum berlaku' : umur(r.price.effective_from)}</div>` : '<span class="muted sm">—</span>') },
        { label: 'Keterangan', render: (r) => (r.price && r.price.note ? `<span class="sm">${esc(r.price.note)}</span>` : '<span class="muted sm">—</span>') },
      ],
      rows,
      emptyText: 'Belum ada harga BBM.',
    });
  }

  page.innerHTML = `
    ${card({
      title: 'Kendaraan',
      sub: `${ui.angka(vehicles.length)} unit terdaftar`,
      actions: '<button type="button" class="btn sm pri" data-act="veh-new">+ Tambah</button>',
      body: '<div id="veh-body"></div>',
      foot: 'Total km, liter, dan biaya dihitung dari pengambilan yang tidak dibatalkan. Lihat rincian biaya per pengambilan di Laporan.',
    })}
    <div style="height:14px"></div>
    ${card({
      title: 'Harga BBM',
      sub: 'harga per liter yang berlaku hari ini',
      actions: '<button type="button" class="btn sm" data-act="fuel-new">+ Harga baru</button>',
      body: `<div class="notebox">Harga baru berlaku sejak tanggal efektif yang dipilih. Pengambilan memakai harga yang paling akhir berlaku pada tanggal pengambilan.</div>
        <div id="fuel-body"></div>`,
    })}`;
  paintVehicles();
  paintFuel();

  async function reloadAll() {
    const [a, b] = await Promise.all([api.get('/api/reference/vehicles'), api.get('/api/reference/fuel-prices')]);
    vehicles = a.vehicles || [];
    fuelPrices = b.fuel_prices || [];
    paintVehicles();
    paintFuel();
  }

  async function onAct(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const id = Number(el.dataset.id);

    if (act === 'veh-new' || act === 'veh-edit') {
      const v = act === 'veh-edit' ? vehicles.find((x) => x.id === id) : null;
      ui.formDialog({
        title: v ? `Edit kendaraan — ${v.plate}` : 'Tambah kendaraan',
        fields: vehicleFields(v),
        okLabel: v ? 'Simpan' : 'Tambah',
        size: 'wide',
        onSubmit: async (val) => {
          const body = {
            plate: val.plate, name: val.name, type: val.type, fuel_type: val.fuel_type,
            consumption_km_per_l: val.consumption_km_per_l, capacity_kg: val.capacity_kg,
            km_running: val.km_running, notes: val.notes || null,
          };
          if (v) await api.put(`/api/reference/vehicles/${v.id}`, body);
          else await api.post('/api/reference/vehicles', body);
          ui.toast(v ? 'Kendaraan diperbarui.' : 'Kendaraan ditambahkan.', 'ok');
          await ctx.reloadBootstrap();
          await reloadAll();
        },
      });
      return;
    }

    if (act === 'veh-toggle') {
      const v = vehicles.find((x) => x.id === id);
      if (!v) return;
      const msg = v.is_active
        ? `Nonaktifkan ${v.plate}? Kendaraan tidak akan muncul saat penjadwalan.`
        : `Aktifkan kembali ${v.plate}?`;
      if (!(await ui.confirmDialog({ title: v.is_active ? 'Nonaktifkan kendaraan' : 'Aktifkan kendaraan', message: msg, danger: v.is_active, okLabel: v.is_active ? 'Nonaktifkan' : 'Aktifkan' }))) return;
      try {
        await api.post(`/api/reference/vehicles/${v.id}/toggle`);
        await ctx.reloadBootstrap();
        await reloadAll();
        ui.toast('Status kendaraan diperbarui.', 'ok');
      } catch (err) {
        ui.toastError(err);
      }
      return;
    }

    if (act === 'fuel-new') {
      ui.formDialog({
        title: 'Tambah harga BBM',
        subtitle: 'Harga berlaku sejak tanggal efektif yang dipilih.',
        fields: [
          { name: 'fuel_type', label: 'Jenis BBM', type: 'select', required: true, blank: false, options: FUEL_TYPES },
          { name: 'price_per_liter', label: 'Harga per liter (Rp)', type: 'money', required: true, hint: 'Angka bulat Rupiah penuh.' },
          { name: 'effective_from', label: 'Berlaku sejak', type: 'date', required: true, value: today },
          { name: 'note', label: 'Keterangan', type: 'text', col: 1, placeholder: 'mis. Penyesuaian SPBU' },
        ],
        okLabel: 'Simpan harga',
        onSubmit: async (val) => {
          const body = {
            fuel_type: val.fuel_type, price_per_liter: val.price_per_liter,
            effective_from: val.effective_from, note: val.note || null,
          };
          await api.post('/api/reference/fuel-prices', body);
          ui.toast(`Harga ${fuelLabel(val.fuel_type)} disimpan, berlaku ${ui.tgl(val.effective_from)}.`, 'ok');
          await ctx.reloadBootstrap();
          await reloadAll();
        },
      });
    }
  }

  document.addEventListener('click', onAct);
  return () => document.removeEventListener('click', onAct);
}
