const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { WebhooksHelper } = require('square');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const { applyPaymentTax } = require('../lib/paymentTax');
const { getSquareClientForUser, getSquareWebhookVerification } = require('../lib/squareClient');
const { getResolvedClientPortalBaseUrl } = require('../lib/clientPortalUrl');

/** Client-visible card markup (passed through to card total). */
const CARD_MARKUP = 0.03;

/** Net amount applied to the package (card gross ÷ 1.03). */
function cardPaymentNet(gross) {
  return Math.round((parseFloat(gross) / (1 + CARD_MARKUP)) * 100) / 100;
}

function isCardProcessorMethod(m) {
  return m === 'Square' || m === 'Stripe';
}

/** Sum of completed payments toward package total (direct $ = face value; card = net of fee). */
function effectivePackagePaid(bookingId) {
  const rows = db.prepare(
    "SELECT amount, method FROM payments WHERE booking_id = ? AND status = 'Completed'"
  ).all(bookingId);
  let sum = 0;
  for (const p of rows) {
    const a = parseFloat(p.amount) || 0;
    sum += isCardProcessorMethod(p.method) ? cardPaymentNet(a) : a;
  }
  return Math.round(sum * 100) / 100;
}

function cardDepositFromBooking(booking) {
  return parseFloat(booking.square_deposit ?? booking.stripe_deposit) || 0;
}

function updateBookingPaymentStatus(booking) {
  const packageTotal = parseFloat(booking.direct_price) || 0;
  const deposit = parseFloat(booking.deposit_amount) || 0;
  const paid = effectivePackagePaid(booking.id);

  if (packageTotal > 0 && paid + 0.005 >= packageTotal) {
    db.prepare(`UPDATE bookings SET payment_status = 'Paid', status = 'Paid' WHERE id = ?`).run(booking.id);
  } else if (deposit > 0 && paid + 0.005 >= deposit) {
    db.prepare(`UPDATE bookings SET payment_status = 'Deposit Paid', status = 'Deposit Paid' WHERE id = ?`).run(booking.id);
  } else {
    db.prepare(
      `UPDATE bookings SET payment_status = 'Unpaid',
        status = CASE WHEN status IN ('Paid', 'Deposit Paid') THEN 'Pending' ELSE status END
       WHERE id = ?`
    ).run(booking.id);
  }
}

async function createSquarePaymentLink({ booking, userId, chargeDollars, title, bookingTokenEncoded }) {
  const sq = getSquareClientForUser(userId);
  if (!sq.client) {
    throw Object.assign(new Error('SQUARE_NOT_CONFIGURED'), { code: 503 });
  }
  if (!sq.locationId) {
    throw Object.assign(new Error('SQUARE_LOCATION_ID missing'), { code: 503 });
  }

  const portalBase = getResolvedClientPortalBaseUrl();
  if (!portalBase) {
    throw Object.assign(new Error('PORTAL_URL missing'), { code: 400 });
  }

  const cents = BigInt(Math.round(chargeDollars * 100));
  const redirectUrl = `${portalBase.replace(/\/$/, '')}/payment/${bookingTokenEncoded}?payment=success`;

  const raw = await sq.client.checkout.paymentLinks.create({
    idempotencyKey: uuidv4(),
    description: `VizoDesk booking ${booking.id}`,
    quickPay: {
      name: title,
      priceMoney: { amount: cents, currency: 'USD' },
      locationId: sq.locationId,
    },
    checkoutOptions: {
      redirectUrl,
    },
    paymentNote: `vizodesk booking ${booking.id}`,
  });

  const body = raw?.data ?? raw;
  const pl = body?.paymentLink || body?.payment_link;
  const url = pl?.url || pl?.longUrl;
  const orderId =
    pl?.orderId ||
    pl?.order_id ||
    body?.relatedResources?.orders?.[0]?.id ||
    body?.related_resources?.orders?.[0]?.id;
  if (!url || !orderId) {
    console.error('Square createPaymentLink unexpected response', JSON.stringify(raw, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    throw new Error('Square did not return checkout URL or order id');
  }
  return { url, orderId: String(orderId) };
}

// GET /api/payments — all payments for user's bookings
router.get('/', auth, (req, res) => {
  const payments = db.prepare(`
    SELECT p.*, b.event_type, b.package, b.public_token,
           b.deposit_amount, b.direct_price, b.square_deposit, b.square_remaining,
           b.payment_status AS booking_payment_status,
           c.full_name as client_name
    FROM payments p
    JOIN bookings b ON p.booking_id = b.id
    JOIN clients c ON b.client_id = c.id
    WHERE b.user_id = ?
    ORDER BY p.created_at DESC
  `).all(req.userId);
  res.json(payments);
});

// DELETE /api/payments/:id — remove a payment row and refresh booking payment status
router.delete('/:id', auth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const row = db
      .prepare(
        `SELECT p.id, p.booking_id FROM payments p
         JOIN bookings b ON p.booking_id = b.id
         WHERE p.id = ? AND b.user_id = ?`
      )
      .get(id, req.userId);
    if (!row) return res.status(404).json({ error: 'Payment not found' });

    db.prepare('DELETE FROM payments WHERE id = ?').run(id);

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(row.booking_id);
    if (booking) updateBookingPaymentStatus(booking);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

// POST /api/payments/manual — record manual payment (Zelle, Cash, Venmo)
router.post('/manual', auth, (req, res) => {
  try {
    const { booking_id, amount, method, notes } = req.body;
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(booking_id, req.userId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const result = db.prepare(`
      INSERT INTO payments (booking_id, amount, method, status, notes)
      VALUES (?, ?, ?, 'Completed', ?)
    `).run(booking_id, parseFloat(amount), method, notes || null);

    const fresh = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking_id);
    updateBookingPaymentStatus(fresh);

    const newId = result.lastInsertRowid;
    try {
      applyPaymentTax(newId);
    } catch (e) {
      console.error('applyPaymentTax:', e);
    }

    res.status(201).json(db.prepare('SELECT * FROM payments WHERE id = ?').get(newId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

const PORTAL_METHOD_LABEL = {
  zelle: 'Zelle',
  cashapp: 'Cash App',
  venmo: 'Venmo',
};

/**
 * POST /api/payments/portal/confirm-bank — public; client confirms bank/app payment from portal.
 * Records a completed payment (direct amount) and updates booking payment status.
 */
router.post('/portal/confirm-bank', (req, res) => {
  try {
    const { booking_token, phase, method } = req.body;
    const tok = String(booking_token || '').trim();
    if (!tok) return res.status(400).json({ error: 'Missing booking token' });

    const ph = phase === 'remaining' ? 'remaining' : 'retainer';
    const mKey = String(method || 'zelle').toLowerCase();
    const methodLabel = PORTAL_METHOD_LABEL[mKey] || 'Zelle';

    const booking = db.prepare('SELECT * FROM bookings WHERE public_token = ?').get(tok);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const packageTotal = parseFloat(booking.direct_price) || 0;
    const deposit = parseFloat(booking.deposit_amount) || 0;
    const paidBefore = effectivePackagePaid(booking.id);

    const notePrefix = ph === 'remaining' ? 'Portal: remaining' : 'Portal: retainer';

    if (ph === 'remaining' && paidBefore + 0.005 < deposit) {
      return res.status(400).json({ error: 'Retainer must be received before this step' });
    }

    const existing = db
      .prepare(
        `SELECT id FROM payments WHERE booking_id = ? AND status = 'Completed' AND notes LIKE ?`
      )
      .get(booking.id, `${notePrefix}%`);
    if (existing) {
      const fresh = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
      updateBookingPaymentStatus(fresh);
      return res.json({
        ok: true,
        alreadyRecorded: true,
        payment_status: fresh.payment_status,
        booking_status: fresh.status,
      });
    }

    let amount = 0;
    if (ph === 'retainer') {
      amount = Math.round(Math.max(0, deposit - paidBefore) * 100) / 100;
    } else {
      amount = Math.round(Math.max(0, packageTotal - paidBefore) * 100) / 100;
    }

    if (amount <= 0.005) {
      const fresh = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
      updateBookingPaymentStatus(fresh);
      return res.json({
        ok: true,
        alreadyRecorded: true,
        payment_status: fresh.payment_status,
        booking_status: fresh.status,
      });
    }

    const notes = `${notePrefix} confirmed (${methodLabel})`;

    const result = db
      .prepare(`
      INSERT INTO payments (booking_id, amount, method, status, notes)
      VALUES (?, ?, ?, 'Completed', ?)
    `)
      .run(booking.id, amount, methodLabel, notes);

    const newId = result.lastInsertRowid;
    try {
      applyPaymentTax(newId);
    } catch (e) {
      console.error('applyPaymentTax:', e);
    }

    const fresh = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
    updateBookingPaymentStatus(fresh);

    const payRow = db.prepare('SELECT * FROM payments WHERE id = ?').get(newId);
    res.status(201).json({
      ok: true,
      payment: payRow,
      payment_status: fresh.payment_status,
      booking_status: fresh.status,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// POST /api/payments/square/remaining — Square-hosted checkout for remaining balance
router.post('/square/remaining', async (req, res) => {
  const { booking_token } = req.body;

  try {
    const booking = db.prepare(`
      SELECT b.*, c.full_name as client_name
      FROM bookings b
      JOIN clients c ON b.client_id = c.id
      WHERE b.public_token = ?
    `).get(booking_token);

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const packageTotal = parseFloat(booking.direct_price || 0);
    const paidNet = effectivePackagePaid(booking.id);
    let baseRemaining = Math.round((packageTotal - paidNet) * 100) / 100;

    if (baseRemaining <= 0) {
      return res.status(400).json({ error: 'Nothing left to pay' });
    }

    const chargeDollars = Math.round(baseRemaining * (1 + CARD_MARKUP) * 100) / 100;
    const tok = encodeURIComponent(booking_token);

    if (!getResolvedClientPortalBaseUrl()) {
      return res.status(400).json({
        error:
          'Client portal URL is not configured. In the admin app go to Settings → Client Portal URL, or set PORTAL_URL in server/.env for your deployment.',
      });
    }

    const { url, orderId } = await createSquarePaymentLink({
      booking,
      userId: booking.user_id,
      chargeDollars,
      title: `Remaining balance — ${booking.package}`,
      bookingTokenEncoded: tok,
    });

    db.prepare(`
        INSERT INTO payments (booking_id, amount, method, square_order_id, status)
        VALUES (?, ?, 'Square', ?, 'Pending')
      `).run(booking.id, chargeDollars, orderId);

    res.json({ url });
  } catch (err) {
    console.error(err);
    if (err.code === 503 || err.code === 400) {
      const msg =
        err.message === 'SQUARE_NOT_CONFIGURED'
          ? 'Square is not configured. Open Settings → Company → Square payments (or set SQUARE_ACCESS_TOKEN in server/.env).'
          : err.message === 'SQUARE_LOCATION_ID missing'
            ? 'Square location ID is missing. Add it under Settings → Company → Square payments (or SQUARE_LOCATION_ID in server/.env).'
            : err.message === 'PORTAL_URL missing'
              ? 'Client portal URL is not configured. Set PORTAL_URL or Settings → Client Portal URL.'
              : err.message;
      return res.status(err.code).json({ error: msg });
    }
    res.status(500).json({ error: err.message || 'Square error' });
  }
});

// POST /api/payments/square/deposit — retainer checkout (card amount includes fee markup)
router.post('/square/deposit', async (req, res) => {
  const { booking_token } = req.body;

  try {
    const booking = db.prepare(`
      SELECT b.*, c.full_name as client_name
      FROM bookings b
      JOIN clients c ON b.client_id = c.id
      WHERE b.public_token = ?
    `).get(booking_token);

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const paidNet = effectivePackagePaid(booking.id);
    const depositNet = parseFloat(booking.deposit_amount || 0);
    if (paidNet + 0.005 >= depositNet) {
      return res.status(400).json({ error: 'Retainer has already been received' });
    }

    const chargeDollars = Math.round(cardDepositFromBooking(booking) * 100) / 100;
    if (chargeDollars <= 0) {
      return res.status(400).json({ error: 'No retainer amount configured' });
    }

    const tok = encodeURIComponent(booking_token);

    if (!getResolvedClientPortalBaseUrl()) {
      return res.status(400).json({
        error:
          'Client portal URL is not configured. In the admin app go to Settings → Client Portal URL, or set PORTAL_URL in server/.env for your deployment.',
      });
    }

    const { url, orderId } = await createSquarePaymentLink({
      booking,
      userId: booking.user_id,
      chargeDollars,
      title: `Retainer — ${booking.package}`,
      bookingTokenEncoded: tok,
    });

    db.prepare(`
        INSERT INTO payments (booking_id, amount, method, square_order_id, status)
        VALUES (?, ?, 'Square', ?, 'Pending')
      `).run(booking.id, chargeDollars, orderId);

    res.json({ url });
  } catch (err) {
    console.error(err);
    if (err.code === 503 || err.code === 400) {
      const msg =
        err.message === 'SQUARE_NOT_CONFIGURED'
          ? 'Square is not configured. Open Settings → Company → Square payments (or set SQUARE_ACCESS_TOKEN in server/.env).'
          : err.message === 'SQUARE_LOCATION_ID missing'
            ? 'Square location ID is missing. Add it under Settings → Company → Square payments (or SQUARE_LOCATION_ID in server/.env).'
            : err.message === 'PORTAL_URL missing'
              ? 'Client portal URL is not configured. Set PORTAL_URL or Settings → Client Portal URL.'
              : err.message;
      return res.status(err.code).json({ error: msg });
    }
    res.status(500).json({ error: err.message || 'Square error' });
  }
});

function squarePaymentPayload(event) {
  const obj = event?.data?.object;
  if (!obj) return null;
  if (obj.payment) return obj.payment;
  if (obj.id && (obj.amountMoney || obj.amount_money)) return obj;
  return null;
}

// POST /api/payments/square/webhook — Square webhook (payment.updated)
router.post('/square/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = req.body.toString('utf8');
  const sig = req.headers['x-square-hmacsha256-signature'];
  const { signatureKey, notificationUrl } = getSquareWebhookVerification();

  try {
    if (signatureKey && notificationUrl) {
      const ok = await WebhooksHelper.verifySignature({
        requestBody: rawBody,
        signatureHeader: sig,
        signatureKey,
        notificationUrl,
      });
      if (!ok) return res.status(401).send('Invalid signature');
    } else if (process.env.NODE_ENV === 'production') {
      console.warn(
        'Square webhook: webhook signing key or notification URL not set (Settings → Square payments or SQUARE_WEBHOOK_* in .env)'
      );
    }

    const event = JSON.parse(rawBody);
    if (event.type !== 'payment.updated') {
      return res.json({ received: true });
    }

    const payment = squarePaymentPayload(event);
    if (!payment) return res.json({ received: true });

    const status = String(payment.status || '').toUpperCase();
    if (status !== 'COMPLETED') {
      return res.json({ received: true });
    }

    const orderId = payment.order_id ?? payment.orderId;
    if (!orderId) return res.json({ received: true });

    const squarePaymentId = payment.id;

    const pending = db
      .prepare(
        `SELECT id, booking_id FROM payments WHERE square_order_id = ? AND status = 'Pending'`
      )
      .get(String(orderId));

    if (!pending) {
      return res.json({ received: true });
    }

    db.prepare(
      `UPDATE payments SET status = 'Completed', square_payment_id = ? WHERE id = ?`
    ).run(squarePaymentId, pending.id);

    try {
      applyPaymentTax(pending.id);
    } catch (e) {
      console.error('applyPaymentTax:', e);
    }

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(pending.booking_id);
    if (booking) updateBookingPaymentStatus(booking);

    return res.json({ received: true });
  } catch (err) {
    console.error('Square webhook error:', err);
    return res.status(400).send('Webhook error');
  }
});

module.exports = router;
