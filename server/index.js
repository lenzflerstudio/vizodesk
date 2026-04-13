require('dotenv').config({
  path: require('path').resolve(__dirname, '.env')
});

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('./db');
const { verifyOrigin } = require('./lib/corsOrigins');
const publicBookingRouter = require('./routes/publicBooking');

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
const publicBookingsRouter = require('./routes/publicBookings');
app.use('/api/public/bookings', publicBookingsRouter);
/** Debug trace for Render — runs before auth so failed auth still appears in logs */
function debugLogSyncBookingRoute(req, res, next) {
  console.log('SYNC ROUTE HIT');
  console.log('Auth header:', req.headers.authorization);
  console.log('SYNC BODY:', req.body);
  next();
}
/** Alias for local → Render sync (same handler as POST /api/public/bookings) */
app.post(
  '/api/sync/booking',
  debugLogSyncBookingRoute,
  publicBookingsRouter.verifySyncSecret,
  publicBookingsRouter.handleInboundBookingSync
);
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/booking-terms-templates', require('./routes/bookingTermsTemplates'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/email', require('./routes/email'));
app.use('/api/sync/callback', require('./routes/syncCallbackReceiver'));

/** Public booking by `public_token` — no auth (see routes/publicBooking.js) */
app.use('/api/public/booking', publicBookingRouter);

/** Legacy alias — same handler */
app.get('/api/booking/:token', publicBookingRouter.handlePublicBookingByToken);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ── Admin SPA (Vite → client/dist) — after all /api routes ───────────────────
if (hasClientBuild) {
  app.use(express.static(clientDist));

  // Direct visits to client routes (e.g. /booking/:token) must serve index.html so React Router runs.
  // Must come after express.static so real files (/assets/*, favicon, etc.) are not replaced.
  // app.use avoids path-to-regexp issues with app.get('*') on some Express versions.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
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

  app.listen(PORT, '0.0.0.0', () => {
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
