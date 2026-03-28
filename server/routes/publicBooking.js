const express = require('express');
const {
  findBookingByPublicToken,
  serializePublicBookingPayload,
} = require('../lib/publicBookingView');

/**
 * GET /api/public/booking/:token
 * No auth. Resolves booking by bookings.public_token only.
 */
function handlePublicBookingByToken(req, res) {
  const token = String(req.params.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }

  const booking = findBookingByPublicToken(token);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  try {
    res.json(serializePublicBookingPayload(booking));
  } catch (err) {
    console.error('GET /api/public/booking/:token', err);
    res.status(500).json({ error: 'Could not load booking' });
  }
}

const router = express.Router();
router.get('/:token', handlePublicBookingByToken);

module.exports = router;
module.exports.handlePublicBookingByToken = handlePublicBookingByToken;
