const express = require('express');
const db = require('../db');
const { buildPublicBookingJson, ensureDefaultContract } = require('../lib/publicBookingView');
const { getSetting } = require('../lib/integrationSecrets');

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

function resolveCloudClientId(ownerId, clientPayload) {
  const name = String(clientPayload?.full_name || '').trim();
  if (!name) return null;
  const email = clientPayload?.email != null ? String(clientPayload.email).trim() : '';
  const phone = clientPayload?.phone != null ? String(clientPayload.phone).trim() : '';

  let row = null;
  if (email) {
    row = db
      .prepare(
        `SELECT id FROM clients WHERE user_id = ? AND email IS NOT NULL AND trim(lower(email)) = trim(lower(?))`
      )
      .get(ownerId, email);
  }
  if (!row) {
    row = db
      .prepare(
        `SELECT id FROM clients WHERE user_id = ? AND full_name = ?
         AND IFNULL(trim(email),'') = ? AND IFNULL(trim(phone),'') = ?`
      )
      .get(ownerId, name, email, phone);
  }
  if (row) return row.id;

  const ins = db
    .prepare('INSERT INTO clients (user_id, full_name, email, phone) VALUES (?, ?, ?, ?)')
    .run(ownerId, name, email || null, phone || null);
  return ins.lastInsertRowid;
}

/**
 * Prefer SYNC_OWNER_USER_ID when set and that row exists; otherwise first user (no manual DB lookup).
 */
function resolveSyncOwnerUserId() {
  const raw = process.env.SYNC_OWNER_USER_ID;
  const parsed =
    raw != null && String(raw).trim() !== '' ? parseInt(String(raw).trim(), 10) : NaN;
  if (Number.isFinite(parsed)) {
    const found = db.prepare('SELECT id FROM users WHERE id = ?').get(parsed);
    if (found) return found.id;
  }
  const first = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
  if (!first) {
    throw new Error('OWNER_USER_NOT_FOUND');
  }
  console.log('Using fallback owner_id:', first.id);
  return first.id;
}

function upsertBookingFromSync(body) {
  const ownerId = resolveSyncOwnerUserId();

  const public_token = String(body?.public_token || '').trim();
  if (!public_token) throw new Error('MISSING_TOKEN');

  const c = body.client || {};
  const b = body.booking || {};
  if (!b.event_type || !b.event_date || b.direct_price == null) {
    throw new Error('MISSING_BOOKING_FIELDS');
  }

  const clientId = resolveCloudClientId(ownerId, c);
  if (!clientId) throw new Error('CLIENT_RESOLVE_FAILED');

  let packageTemplateId = b.package_template_id != null ? parseInt(b.package_template_id, 10) : null;
  if (packageTemplateId != null && Number.isNaN(packageTemplateId)) packageTemplateId = null;
  if (packageTemplateId != null) {
    const tpl = db.prepare('SELECT id FROM package_templates WHERE id = ? AND user_id = ?').get(packageTemplateId, ownerId);
    if (!tpl) packageTemplateId = null;
  }

  const existing = db.prepare('SELECT id FROM bookings WHERE public_token = ?').get(public_token);

  const cols = {
    user_id: ownerId,
    client_id: clientId,
    event_type: b.event_type,
    event_date: b.event_date,
    package: b.package != null ? String(b.package) : '',
    event_time_range: b.event_time_range ?? null,
    venue_address: b.venue_address ?? null,
    terms_and_conditions: b.terms_and_conditions ?? null,
    deposit_amount: Number(b.deposit_amount) || 0,
    direct_price: Number(b.direct_price) || 0,
    square_price: Number(b.square_price) || 0,
    remaining_amount: Number(b.remaining_amount) || 0,
    final_due_date: b.final_due_date ?? null,
    square_deposit: Number(b.square_deposit) || 0,
    square_remaining: Number(b.square_remaining) || 0,
    payment_method: b.payment_method || 'direct',
    status: b.status || 'Pending',
    payment_status: b.payment_status || 'Unpaid',
    notes: b.notes ?? null,
    package_template_id: packageTemplateId,
    portal_package_json:
      b.portal_package_json != null && String(b.portal_package_json).trim() !== ''
        ? String(b.portal_package_json)
        : null,
    contract_upload_id: null,
  };

  let bookingId;
  if (existing) {
    db.prepare(`
      UPDATE bookings SET
        client_id = ?, event_type = ?, event_date = ?, package = ?, event_time_range = ?, venue_address = ?,
        terms_and_conditions = ?, deposit_amount = ?, direct_price = ?, square_price = ?,
        remaining_amount = ?, final_due_date = ?, square_deposit = ?, square_remaining = ?,
        payment_method = ?, status = ?, payment_status = ?, notes = ?, package_template_id = ?,
        portal_package_json = ?, contract_upload_id = NULL
      WHERE id = ?
    `).run(
      cols.client_id,
      cols.event_type,
      cols.event_date,
      cols.package,
      cols.event_time_range,
      cols.venue_address,
      cols.terms_and_conditions,
      cols.deposit_amount,
      cols.direct_price,
      cols.square_price,
      cols.remaining_amount,
      cols.final_due_date,
      cols.square_deposit,
      cols.square_remaining,
      cols.payment_method,
      cols.status,
      cols.payment_status,
      cols.notes,
      cols.package_template_id,
      cols.portal_package_json,
      existing.id
    );
    bookingId = existing.id;
  } else {
    const r = db.prepare(`
      INSERT INTO bookings
        (user_id, client_id, event_type, event_date, package, event_time_range, venue_address, terms_and_conditions,
         deposit_amount, direct_price, square_price, remaining_amount, final_due_date, square_deposit, square_remaining,
         payment_method, status, payment_status, public_token, notes, contract_upload_id, package_template_id, portal_package_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      cols.user_id,
      cols.client_id,
      cols.event_type,
      cols.event_date,
      cols.package,
      cols.event_time_range,
      cols.venue_address,
      cols.terms_and_conditions,
      cols.deposit_amount,
      cols.direct_price,
      cols.square_price,
      cols.remaining_amount,
      cols.final_due_date,
      cols.square_deposit,
      cols.square_remaining,
      cols.payment_method,
      cols.status,
      cols.payment_status,
      public_token,
      cols.notes,
      cols.package_template_id,
      cols.portal_package_json
    );
    bookingId = r.lastInsertRowid;
  }

  const ct = body.contract;
  db.prepare('DELETE FROM contracts WHERE booking_id = ?').run(bookingId);

  if (ct && ct.content && String(ct.content).trim() && !ct.has_pdf) {
    db.prepare(`
      INSERT INTO contracts (booking_id, template_id, template_name, content, pdf_path)
      VALUES (?, NULL, ?, ?, NULL)
    `).run(bookingId, ct.template_name || 'Booking agreement', ct.content);
  } else if (ct && ct.has_pdf) {
    db.prepare(`
      INSERT INTO contracts (booking_id, template_id, template_name, content, pdf_path)
      VALUES (?, NULL, ?, ?, NULL)
    `).run(
      bookingId,
      ct.template_name || 'PDF contract',
      'Your photographer attached a PDF contract. Contact them if you need a copy linked here.'
    );
  }

  ensureDefaultContract(bookingId);

  return { bookingId, public_token };
}

/** POST /api/public/bookings and POST /api/sync/booking — inbound sync from local app */
function handleInboundBookingSync(req, res) {
  try {
    const body = req.body || {};
    const result = upsertBookingFromSync(body);
    console.log('Saved booking token:', result.public_token);
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
module.exports = router;
