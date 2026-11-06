/** Kapabilitas per peran. owner = pemilik, admin = manajer operasional,
 *  purchasing = akuisisi/mitra, crew = penjemputan/pengambilan. */
const CAPS = {
  owner: [
    'users.manage', 'settings.manage', 'prices.manage', 'vehicles.manage',
    'mitras.view', 'mitras.manage', 'visits.manage', 'offers.manage', 'offers.view_all',
    'pickups.view_all', 'pickups.manage', 'items.manage', 'receipts.manage', 'receipts.view_all',
    'tracking.view_all', 'reports.costs', 'reports.view_all', 'attachments.view_all', 'audit.view',
  ],
  admin: [
    'users.manage', 'settings.manage', 'prices.manage', 'vehicles.manage',
    'mitras.view', 'mitras.manage', 'visits.manage', 'offers.manage', 'offers.view_all',
    'pickups.view_all', 'pickups.manage', 'items.manage', 'receipts.manage', 'receipts.view_all',
    'tracking.view_all', 'reports.costs', 'reports.view_all', 'attachments.view_all', 'audit.view',
  ],
  purchasing: [
    'mitras.view', 'mitras.manage', 'visits.manage', 'offers.manage',
    'pickups.manage', 'items.manage', 'receipts.manage',
    'tracking.view_all', 'attachments.view_all',
  ],
  crew: [
    'mitras.view', 'visits.manage',
    'pickups.manage', 'items.manage', 'receipts.manage',
    'tracking.view_all', 'attachments.view_all',
  ],
};

export const ROLE_LABELS = {
  owner: 'Pemilik',
  admin: 'Admin / Manajer',
  purchasing: 'Purchasing (Akuisisi Mitra)',
  crew: 'Penjemputan / Pengambilan',
};

export function can(role, cap) {
  return (CAPS[role] || []).includes(cap);
}

export function capsFor(role) {
  return CAPS[role] || [];
}

/** Apakah peran ini boleh melihat data seluruh tim (bukan hanya miliknya)? */
export function isManager(role) {
  return role === 'owner' || role === 'admin';
}
