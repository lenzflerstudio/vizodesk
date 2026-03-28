const express = require('express');
const db = require('../db');
const { getSetting } = require('../lib/integrationSecrets');
const { findBookingByPublicToken } = require('../lib/publicBookingView');
const { updateBookingPaymentStatus } = require('../lib/bookingPaymentStatus');
const { applyPaymentTax } = require('../lib/paymentTax');

const router = express.Router();

function verifyCallbackSecret(req, res, next) {
  const secret = getSetting('SYNC_SECRET');
  if (!secret) {
    return res.status(503).json({ error: 'SYNC_SECRET is not configured' });
  }
  const auth = req.headers.authorization;
  if (!auth || (auth !== secret && auth !== `Bearer ${secret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * POST /api/sync/callback — cloud → local (tunnel URL). Secured with SYNC_SECRET.
 */
router.post('/', verifyCallbackSecret, (req, res) => {
  try {
    const body = req.body || {};
    const event = body.event;
    const token = String(body.public_token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Missing public_token' });
    }

    const booking = findBookingByPublicToken(token);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (event === 'portal_payment') {
      const notes = String(body.notes || '');
      const amount = Number(body.amount);
      const method = String(body.method || 'Zelle');
      if (!notes || !Number.isFinite(amount)) {
        return res.status(400).json({ error: 'Invalid portal_payment payload' });
      }

      const dup = db
        .prepare(`SELECT id FROM payments WHERE booking_id = ? AND status = 'Completed' AND notes = ?`)
        .get(booking.id, notes);
      if (dup) {
        const fresh = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
        updateBookingPaymentStatus(fresh);
        return res.json({ ok: true, duplicate: true });
      }

      const result = db
        .prepare(`
        INSERT INTO payments (booking_id, amount, method, status, notes)
        VALUES (?, ?, ?, 'Completed', ?)
      `)
        .run(booking.id, amount, method, notes);

      const newId = result.lastInsertRowid;
      try {
        applyPaymentTax(newId);
      } catch (e) {
        console.error('applyPaymentTax (callback):', e);
      }
      const fresh = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
      updateBookingPaymentStatus(fresh);
      return res.json({ ok: true });
    }

    if (event === 'contract_signed') {
      const signature_data = body.signature_data;
      if (!signature_data) {
        return res.status(400).json({ error: 'Missing signature_data' });
      }
      const contract = db.prepare('SELECT * FROM contracts WHERE booking_id = ?').get(booking.id);
      if (!contract) {
        return res.status(404).json({ error: 'No contract' });
      }
      db.prepare(`
        UPDATE contracts SET signature_data = ?, signed_at = CURRENT_TIMESTAMP, status = 'Signed'
        WHERE id = ?
      `).run(signature_data, contract.id);
      db.prepare("UPDATE bookings SET status = 'Signed' WHERE id = ? AND status = 'Pending'").run(booking.id);
      return res.json({ ok: true });
    }

    if (event === 'contract_signature_cleared') {
      const contract = db.prepare('SELECT * FROM contracts WHERE booking_id = ?').get(booking.id);
      if (!contract) {
        return res.status(404).json({ error: 'No contract' });
      }
      db.prepare(`
        UPDATE contracts SET signature_data = NULL, signed_at = NULL, status = 'Pending'
        WHERE id = ?
      `).run(contract.id);
      db.prepare("UPDATE bookings SET status = 'Pending' WHERE id = ? AND status = 'Signed'").run(booking.id);
      return res.json({ ok: true });
    }

    if (event === 'square_payment_completed') {
      const square_order_id = String(body.square_order_id || '');
      const square_payment_id = body.square_payment_id != null ? String(body.square_payment_id) : '';
      const amount = Number(body.amount);
      if (!square_order_id || !Number.isFinite(amount)) {
        return res.status(400).json({ error: 'Invalid square_payment_completed payload' });
      }

      const pending = db
        .prepare(
          `SELECT id FROM payments WHERE booking_id = ? AND square_order_id = ? AND status = 'Pending'`
        )
        .get(booking.id, square_order_id);

      if (pending) {
        db.prepare(`UPDATE payments SET status = 'Completed', square_payment_id = ? WHERE id = ?`).run(
          square_payment_id || null,
          pending.id
        );
        try {
          applyPaymentTax(pending.id);
        } catch (e) {
          console.error('applyPaymentTax (callback square):', e);
        }
      } else if (square_payment_id) {
        const dup = db
          .prepare(`SELECT id FROM payments WHERE booking_id = ? AND square_payment_id = ?`)
          .get(booking.id, square_payment_id);
        if (dup) {
          const fresh = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
          updateBookingPaymentStatus(fresh);
          return res.json({ ok: true, duplicate: true });
        }
        const insRes = db
          .prepare(`
          INSERT INTO payments (booking_id, amount, method, status, square_order_id, square_payment_id, notes)
          VALUES (?, ?, 'Square', 'Completed', ?, ?, ?)
        `)
          .run(
            booking.id,
            amount,
            square_order_id,
            square_payment_id || null,
            'Synced from cloud (Square)'
          );
        const newId = insRes.lastInsertRowid;
        if (newId) {
          try {
            applyPaymentTax(newId);
          } catch (e) {
            console.error('applyPaymentTax (callback square insert):', e);
          }
        }
      } else {
        return res.status(400).json({ error: 'No pending Square payment and no square_payment_id' });
      }

      const fresh = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
      updateBookingPaymentStatus(fresh);
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown event' });
  } catch (err) {
    console.error('sync callback receiver:', err);
    return res.status(500).json({ error: 'Sync callback failed' });
  }
});

module.exports = router;
