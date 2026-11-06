import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, ROOT } from './config.js';
import { applySchema, get, nowLocal } from './db/index.js';
import { migrate } from './db/migrate.js';
import { purgeExpiredSessions, requireAuth, userFromRequest } from './lib/auth.js';
import { ApiError } from './lib/http.js';

import authApi from './api/auth.js';
import usersApi from './api/users.js';
import mitrasApi from './api/mitras.js';
import pickupsApi from './api/pickups.js';
import documentsApi from './api/documents.js';
import reportsApi from './api/reports.js';
import dashboardApi from './api/dashboard.js';
import referenceApi from './api/reference.js';
import trackingApi from './api/tracking.js';

applySchema();
migrate({ quiet: true });

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '9mb' }));

/* ---------------------------------- API ---------------------------------- */

app.use('/api/auth', authApi);
app.get('/api/ping', (req, res) => res.json({ ok: true, time: nowLocal() }));

const guarded = express.Router();
guarded.use(requireAuth);
guarded.use('/users', usersApi);
guarded.use('/mitras', mitrasApi);
guarded.use('/pickups', pickupsApi);
guarded.use('/reports', reportsApi);
guarded.use('/dashboard', dashboardApi);
guarded.use('/reference', referenceApi);
guarded.use('/tracking', trackingApi);
app.use('/api', guarded);
app.use('/api', requireAuth, documentsApi);

/* ------------------------------ Berkas foto ------------------------------ */

app.get('/files/*', (req, res) => {
  if (!userFromRequest(req)) return res.status(401).json({ error: 'Belum masuk.' });
  const rel = String(req.params[0] || '').replace(/\\/g, '/');
  if (rel.includes('..')) return res.status(400).json({ error: 'Alamat berkas tidak sah.' });
  const target = path.resolve(config.uploadDir, rel);
  if (!target.startsWith(path.resolve(config.uploadDir)) || !fs.existsSync(target)) {
    return res.status(404).json({ error: 'Foto tidak ditemukan.' });
  }
  res.sendFile(target);
});

/* -------------------------------- Static -------------------------------- */

app.use('/brand', express.static(path.join(ROOT, 'public/brand'), { maxAge: '1d' }));
app.use('/js', (_req, res, next) => { res.setHeader('Cache-Control', 'no-cache'); next(); });
app.use('/css', (_req, res, next) => { res.setHeader('Cache-Control', 'no-cache'); next(); });
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], index: 'index.html' }));

app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    time: nowLocal(),
    mitras: get('SELECT COUNT(*) AS n FROM mitras').n,
    pickups: get('SELECT COUNT(*) AS n FROM pickups').n,
    users: get('SELECT COUNT(*) AS n FROM users').n,
  });
});

/* ------------------------------ Error & 404 ------------------------------ */

app.use('/api', (req, res) => res.status(404).json({ error: 'Alamat tidak ditemukan.' }));
app.use('/print', (req, res) => res.status(404).send('<h3>Dokumen tidak ditemukan.</h3>'));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err instanceof ApiError ? err.status : 500;
  if (status >= 500) console.error(`[${nowLocal()}]`, err);
  res.status(status).json({
    error: err instanceof ApiError ? err.message : 'Terjadi kesalahan pada server. Silakan coba lagi.',
    details: err.details || undefined,
  });
});

setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref();

app.listen(config.port, config.host, () => {
  console.log(`XYNLOOP Admin berjalan pada http://localhost:${config.port} (hanya antarmuka ${config.host})`);
});
