require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const db      = require('./db');
const { verifyOrigin } = require('./lib/corsOrigins');

const app  = express();
const PORT = process.env.PORT || 3001;

// Square webhook needs raw body — register BEFORE json middleware
app.use('/api/payments/square/webhook', express.raw({ type: 'application/json' }));

// White-label: allow admin app, portal, env URLs, and configured Client Portal URL (from Settings)
app.use(cors({
  origin: verifyOrigin,
  credentials: true,
}));
// Default 100kb is too small for Settings payment_portal QR data URLs (base64 images).
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/clients',  require('./routes/clients'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/contracts',require('./routes/contracts'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/email', require('./routes/email'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Async startup: init DB first, then listen ──
async function start(retries = 5) {
  await db.init();

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

  server.listen(PORT, () =>
    console.log(`✅ VizoDesk API running on http://localhost:${PORT}`)
  );
}

start();
module.exports = app;
