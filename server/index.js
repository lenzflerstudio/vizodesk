require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('./db');
const { verifyOrigin } = require('./lib/corsOrigins');

const app = express();
const PORT = Number(process.env.PORT) || 3001;

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
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/email', require('./routes/email'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ── Admin SPA (Vite build in ../client/dist) — after all /api routes ─────────
if (hasClientBuild) {
  app.use(
    express.static(clientDist, {
      index: true,
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    })
  );

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
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

// ── Async startup: init DB first, then listen ─────────────────────────────────
async function start(retries = 5) {
  await db.init();

  if (!hasClientBuild && process.env.NODE_ENV === 'production') {
    console.warn(
      '⚠️  client/dist not found — build the admin app (npm run build in client/) before deploy, or set root build to include it.'
    );
  }

  const server = require('http').createServer(app);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries > 0) {
      console.warn(`⚠️  Port ${PORT} busy (TIME_WAIT), retrying in 3 s… (${retries} left)`);
      server.close();
      setTimeout(() => start(retries - 1), 3000);
    } else {
      console.error('❌ Failed to start server:', err);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log(`✅ VizoDesk API running on port ${PORT}`);
    if (hasClientBuild) {
      console.log(`✅ Serving admin SPA from ${clientDist}`);
    }
  });
}

start();
module.exports = app;
