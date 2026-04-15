const express = require('express');
const db = require('../db');
const { buildPublicBookingJson } = require('../lib/publicBookingView');
const { getSetting } = require('../lib/integrationSecrets');
const { upsertBookingFromSync } = require('../lib/bookingSyncUpsert');

const router = express.Router();

/** Accepts raw secret or `Bearer <secret>` (local sync client may send either). */
function verifySyncSecret(req, res, next) {
  const secret = getSetting('SYNC_SECRET');
  if (!secret) {
    return res.status(503).json({ error: 'SYNC_SECRET is not configured on this server' });
  }
  const auth = req.headers.authorization;
  if (!auth || (auth !== secret && auth !== `Bearer ${secret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/** POST /api/public/bookings and POST /api/sync/booking — inbound sync from local app */
function handleInboundBookingSync(req, res) {
  try {
    const body = req.body || {};
    const result = upsertBookingFromSync(body);
    console.log('[publicBookings] inbound sync saved token=%s bookingId=%s', result.public_token, result.bookingId);
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.bookingId);
    res.json({ success: true, booking });
  } catch (err) {
    console.error('SYNC ERROR:', err);
    const msg = String(err.message || err);
    if (msg === 'OWNER_USER_NOT_FOUND') {
      return res.status(400).json({ error: 'SYNC_OWNER_USER_ID does not match a user in this database' });
    }
    if (msg === 'MISSING_TOKEN' || msg === 'MISSING_BOOKING_FIELDS') {
      return res.status(400).json({ error: 'Invalid sync payload' });
    }
    if (msg === 'CLIENT_RESOLVE_FAILED') {
      return res.status(400).json({ error: 'Could not resolve client' });
    }
    return res.status(500).json({ error: 'Sync failed' });
  }
}

router.post('/', verifySyncSecret, handleInboundBookingSync);

/** GET /api/public/bookings/:token — public client view (no auth) */
router.get('/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing token' });
  const json = buildPublicBookingJson(token);
  if (!json) return res.status(404).json({ error: 'Booking not found' });
  res.json(json);
});

router.verifySyncSecret = verifySyncSecret;
router.handleInboundBookingSync = handleInboundBookingSync;
router.upsertBookingFromSync = upsertBookingFromSync;
module.exports = router;
