require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('./db');
const { verifyOrigin } = require('./lib/corsOrigins');
const { buildPublicBookingJson } = require('./lib/publicBookingView');

const app = express();
const PORT = process.env.PORT || 10000;

const clientDist = path.join(__dirname, '..', 'client', 'dist');
const hasClientBuild = fs.existsSync(path.join(clientDist, 'index.html'));

// Square webhook needs raw body — register BEFORE json middleware
app.use('/api/payments/square/webhook', express.raw({ type: 'application/json' }));

// White-label: allow admin app, portal, env URLs, and configured Client Portal URL (from Settings)
app.use(
  cors({
    origin: verifyOrigin,
    credentials: true,
  })
);
// Default 100kb is too small for Settings payment_portal QR data URLs (base64 images).
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/public/bookings', require('./routes/publicBookings'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/email', require('./routes/email'));

/** Public booking JSON by token (no auth) — alias for client links /portal parity */
app.get('/api/booking/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing token' });
  const json = buildPublicBookingJson(token);
  if (!json) return res.status(404).json({ error: 'Booking not found' });
  res.json(json);
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ── Admin SPA (Vite → client/dist) — after all /api routes ───────────────────
if (hasClientBuild) {
  app.use(express.static(clientDist));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (hasClientBuild) {
    return res.status(404).type('text/plain').send('Not found');
  }
  return res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Init DB, then listen (so API routes work before accepting traffic) ──────
async function start() {
  await db.init();

  if (!hasClientBuild && process.env.NODE_ENV === 'production') {
    console.warn(
      '⚠️  client/dist not found — run a client build before deploy (see render.yaml buildCommand).'
    );
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (hasClientBuild) {
      console.log(`Serving static files from ${clientDist}`);
    }
  });
}

start().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
