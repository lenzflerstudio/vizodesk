const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const { computeBookingPricing, enrichBookingRow, roundMoney } = require('../lib/bookingPricing');
const contractUploadService = require('../services/contractUploadService');
const { serializePackageDetailsPublic } = require('./packages');
const { getPaymentPortalRow, serializePaymentPortal } = require('../lib/paymentPortalHelper');

function packageDetailsForBooking(booking) {
  if (!booking?.package_template_id) return null;
  const pt = db
    .prepare('SELECT * FROM package_templates WHERE id = ? AND user_id = ?')
    .get(booking.package_template_id, booking.user_id);
  return serializePackageDetailsPublic(pt);
}

function parsePackageTemplateId(body, userId) {
  if (!Object.prototype.hasOwnProperty.call(body, 'package_template_id')) return undefined;
  const raw = body.package_template_id;
  if (raw === null || raw === '' || raw === undefined) return null;
  const tid = parseInt(raw, 10);
  if (Number.isNaN(tid)) return false;
  const tpl = db.prepare('SELECT id FROM package_templates WHERE id = ? AND user_id = ?').get(tid, userId);
  if (!tpl) return false;
  return tid;
}

function normalizeVenueAddress(body) {
  if (body.venue_not_applicable === true || body.venue_not_applicable === 'true' || body.venue_not_applicable === 1) {
    return 'N/A';
  }
  const raw = body.venue_address;
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  return t === '' ? null : t;
}

/** Returns undefined if the client did not send any venue field (preserve on PUT). */
function normalizeVenueAddressForUpdate(body) {
  const hasAddr = Object.prototype.hasOwnProperty.call(body, 'venue_address');
  const hasNa = Object.prototype.hasOwnProperty.call(body, 'venue_not_applicable');
  if (!hasAddr && !hasNa) return undefined;
  return normalizeVenueAddress(body);
}

function normalizeEventTimeRange(body) {
  const raw = body.event_time_range;
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  return t === '' ? null : t;
}

/** Undefined = omit from PUT merge; null = clear. */
function normalizeEventTimeRangeForUpdate(body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'event_time_range')) return undefined;
  return normalizeEventTimeRange(body);
}

function normalizeTermsAndConditions(body) {
  const raw = body.terms_and_conditions;
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  return t === '' ? null : t;
}

function normalizeTermsAndConditionsForUpdate(body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'terms_and_conditions')) return undefined;
  return normalizeTermsAndConditions(body);
}

/** Every booking is signable: the booking + terms are the agreement (no separate template/PDF required). */
function ensureDefaultContract(bookingId) {
  const existing = db.prepare('SELECT 1 FROM contracts WHERE booking_id = ?').get(bookingId);
  if (existing) return;
  const b = db.prepare('SELECT terms_and_conditions FROM bookings WHERE id = ?').get(bookingId);
  const terms = (b?.terms_and_conditions && String(b.terms_and_conditions).trim()) || '';
  const content =
    terms.length > 0
      ? terms
      : 'The terms and conditions shown on your client booking page are part of this agreement.';
  db.prepare(`
    INSERT INTO contracts (booking_id, template_id, template_name, content, pdf_path)
    VALUES (?, NULL, 'Booking agreement', ?, NULL)
  `).run(bookingId, content);
}

// GET /api/bookings
router.get('/', auth, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, c.full_name as client_name, c.email as client_email, c.phone as client_phone
    FROM bookings b
    LEFT JOIN clients c ON b.client_id = c.id
    WHERE b.user_id = ?
    ORDER BY b.event_date DESC
  `).all(req.userId);
  res.json(bookings.map(enrichBookingRow));
});

// GET /api/bookings/stats — dashboard stats
router.get('/stats', auth, (req, res) => {
  const totalBookings = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE user_id = ?').get(req.userId);
  const contractsSigned = db.prepare(
    "SELECT COUNT(*) as count FROM bookings WHERE user_id = ? AND status IN ('Signed', 'Paid')"
  ).get(req.userId);
  const totalRevenue = db.prepare(
    "SELECT SUM(amount) as total FROM payments p JOIN bookings b ON p.booking_id = b.id WHERE b.user_id = ? AND p.status = 'Completed'"
  ).get(req.userId);
  const paymentsReceived = db.prepare(
    "SELECT COUNT(*) as count FROM payments p JOIN bookings b ON p.booking_id = b.id WHERE b.user_id = ? AND p.status = 'Completed'"
  ).get(req.userId);
  const pendingBookings = db.prepare(
    "SELECT COUNT(*) as count FROM bookings WHERE user_id = ? AND status = 'Pending'"
  ).get(req.userId);
  const thisMonthRevenue = db.prepare(`
    SELECT COALESCE(SUM(p.amount), 0) as total
    FROM payments p
    JOIN bookings b ON p.booking_id = b.id
    WHERE b.user_id = ? AND p.status = 'Completed'
      AND strftime('%Y-%m', p.created_at) = strftime('%Y-%m', 'now')
  `).get(req.userId);

  // Monthly revenue last 6 months (full chart)
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', p.created_at) as month, SUM(p.amount) as total
    FROM payments p
    JOIN bookings b ON p.booking_id = b.id
    WHERE b.user_id = ? AND p.status = 'Completed'
      AND p.created_at >= date('now', '-6 months')
    GROUP BY month
    ORDER BY month ASC
  `).all(req.userId);

  // Sparkline: completed payment revenue by month, Jan → current month (calendar year)
  const { y: sparkYear, cm: sparkCurrentMonth } = db.prepare(`
    SELECT strftime('%Y', 'now') as y, cast(strftime('%m', 'now') as int) as cm
  `).get();
  const ytdRows = db.prepare(`
    SELECT strftime('%Y-%m', p.created_at) as month, SUM(p.amount) as total
    FROM payments p
    JOIN bookings b ON p.booking_id = b.id
    WHERE b.user_id = ? AND p.status = 'Completed'
      AND strftime('%Y', p.created_at) = ?
    GROUP BY month
    ORDER BY month ASC
  `).all(req.userId, sparkYear);
  const ytdByMonth = Object.fromEntries(
    ytdRows.map((row) => [row.month, row.total || 0])
  );
  const revenueYtd = [];
  for (let m = 1; m <= sparkCurrentMonth; m += 1) {
    const key = `${sparkYear}-${String(m).padStart(2, '0')}`;
    revenueYtd.push({ month: key, total: ytdByMonth[key] || 0 });
  }

  res.json({
    totalBookings: totalBookings.count,
    contractsSigned: contractsSigned.count,
    totalRevenue: totalRevenue.total || 0,
    paymentsReceived: paymentsReceived.count,
    pendingBookings: pendingBookings.count,
    thisMonthRevenue: thisMonthRevenue.total || 0,
    monthly,
    revenueYtd
  });
});

// GET /api/bookings/public/:token — must be before /:id (avoid "public" parsed as id)
router.get('/public/:token', (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, c.full_name as client_name, c.email as client_email, c.phone as client_phone
    FROM bookings b
    LEFT JOIN clients c ON b.client_id = c.id
    WHERE b.public_token = ?
  `).get(req.params.token);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  ensureDefaultContract(booking.id);
  const contract = db.prepare('SELECT * FROM contracts WHERE booking_id = ?').get(booking.id);
  const payments = db.prepare("SELECT * FROM payments WHERE booking_id = ? AND status = 'Completed'").all(booking.id);
  const payment_portal = serializePaymentPortal(getPaymentPortalRow(booking.user_id));
  const { user_id, ...safeBooking } = booking;
  const package_details = packageDetailsForBooking(booking);
  const token = req.params.token;
  const contractOut = contract
    ? {
        ...contract,
        pdf_preview_url: contract.pdf_path ? `/api/bookings/public/${token}/contract-pdf` : null,
      }
    : null;
  res.json({
    ...enrichBookingRow(safeBooking),
    package_details,
    payment_portal,
    contract: contractOut,
    payments,
  });
});

/** GET /api/bookings/public/:token/contract-pdf — inline PDF for client portal */
router.get('/public/:token/contract-pdf', (req, res) => {
  const booking = db.prepare('SELECT id FROM bookings WHERE public_token = ?').get(req.params.token);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const contract = db.prepare('SELECT pdf_path FROM contracts WHERE booking_id = ?').get(booking.id);
  if (!contract || !contract.pdf_path) return res.status(404).json({ error: 'No PDF contract' });
  const abs = contractUploadService.absolutePath(contract.pdf_path);
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: 'File not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="contract.pdf"');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.resolve(abs));
});

// GET /api/bookings/:id
router.get('/:id', auth, (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, c.full_name as client_name, c.email as client_email, c.phone as client_phone
    FROM bookings b
    LEFT JOIN clients c ON b.client_id = c.id
    WHERE b.id = ? AND b.user_id = ?
  `).get(req.params.id, req.userId);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  ensureDefaultContract(booking.id);
  const contract = db.prepare('SELECT * FROM contracts WHERE booking_id = ?').get(booking.id);
  const payments = db.prepare('SELECT * FROM payments WHERE booking_id = ?').all(booking.id);
  const token = booking.public_token;
  const contractOut = contract
    ? {
        ...contract,
        pdf_preview_url: contract.pdf_path && token ? `/api/bookings/public/${token}/contract-pdf` : null,
      }
    : null;
  const package_details = packageDetailsForBooking(booking);
  res.json({ ...enrichBookingRow(booking), package_details, contract: contractOut, payments });
});

// POST /api/bookings
router.post('/', auth, (req, res) => {
  try {
    const {
      client_id, event_type, event_date, package: pkg,
      direct_price, payment_method,
      contract_template_id, contract_upload_id: contractUploadIdRaw,
      notes,
      new_client_name, new_client_email, new_client_phone
    } = req.body;

    const contractUploadId =
      contractUploadIdRaw !== undefined && contractUploadIdRaw !== null && contractUploadIdRaw !== ''
        ? parseInt(contractUploadIdRaw, 10)
        : null;

    if (contract_template_id && contractUploadId) {
      return res.status(400).json({ error: 'Choose either a text template or an uploaded PDF contract, not both.' });
    }
    if (contractUploadId !== null && Number.isNaN(contractUploadId)) {
      return res.status(400).json({ error: 'Invalid contract upload id' });
    }

    let finalClientId = client_id;

    // Create new client if needed
    if (!client_id && new_client_name) {
      const clientResult = db.prepare(
        'INSERT INTO clients (user_id, full_name, email, phone) VALUES (?, ?, ?, ?)'
      ).run(req.userId, new_client_name, new_client_email || null, new_client_phone || null);
      finalClientId = clientResult.lastInsertRowid;
    }

    if (!finalClientId) return res.status(400).json({ error: 'Client is required' });

    const packagePrice = roundMoney(parseFloat(direct_price) || 0);
    if (packagePrice <= 0) return res.status(400).json({ error: 'Package price must be greater than 0' });

    const venueAddress = normalizeVenueAddress(req.body);
    const eventTimeRange = normalizeEventTimeRange(req.body);
    const termsAndConditions = normalizeTermsAndConditions(req.body);

    const templateIdParsed = parsePackageTemplateId(req.body, req.userId);
    if (templateIdParsed === false) {
      return res.status(400).json({ error: 'Invalid or unknown package template' });
    }
    const packageTemplateId = templateIdParsed === undefined ? null : templateIdParsed;

    const p = computeBookingPricing(packagePrice, event_date);
    const publicToken = uuidv4();

    const result = db.prepare(`
      INSERT INTO bookings
        (user_id, client_id, event_type, event_date, package, event_time_range, venue_address, terms_and_conditions,
         deposit_amount, direct_price, square_price,
         remaining_amount, final_due_date, square_deposit, square_remaining,
         payment_method, public_token, notes, contract_upload_id, package_template_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.userId, finalClientId, event_type, event_date, pkg || '', eventTimeRange, venueAddress, termsAndConditions,
      p.deposit_amount, packagePrice, p.square_price,
      p.remaining_amount, p.final_due_date, p.square_deposit, p.square_remaining,
      payment_method || 'direct', publicToken, notes || null,
      contractUploadId,
      packageTemplateId
    );

    const bookingId = result.lastInsertRowid;

    if (contract_template_id) {
      const template = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(contract_template_id);
      if (template) {
        db.prepare(`
          INSERT INTO contracts (booking_id, template_id, template_name, content, pdf_path)
          VALUES (?, ?, ?, ?, NULL)
        `).run(bookingId, template.id, template.name, template.content);
      }
    } else if (contractUploadId) {
      const upload = contractUploadService.getByIdForBooking(req.userId, contractUploadId);
      if (!upload) {
        db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId);
        return res.status(400).json({ error: 'Invalid or inaccessible PDF contract' });
      }
      db.prepare(`
        INSERT INTO contracts (booking_id, template_id, template_name, content, pdf_path)
        VALUES (?, NULL, ?, ?, ?)
      `).run(bookingId, upload.name, '(PDF contract — see attached document)', upload.file_path);
    }

    ensureDefaultContract(bookingId);

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    res.status(201).json({
      ...enrichBookingRow(booking),
      package_details: packageDetailsForBooking(booking),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// PUT /api/bookings/:id
router.put('/:id', auth, (req, res) => {
  const existing = db
    .prepare(
      'SELECT id, venue_address, event_time_range, terms_and_conditions, package_template_id FROM bookings WHERE id = ? AND user_id = ?'
    )
    .get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  const {
    event_type, event_date, package: pkg,
    direct_price, payment_method,
    status, payment_status, notes
  } = req.body;

  const packagePrice = roundMoney(parseFloat(direct_price) || 0);
  if (packagePrice <= 0) return res.status(400).json({ error: 'Package price must be greater than 0' });

  const venueUpdate = normalizeVenueAddressForUpdate(req.body);
  const timeUpdate = normalizeEventTimeRangeForUpdate(req.body);
  const venue_address = venueUpdate !== undefined ? venueUpdate : existing.venue_address;
  const event_time_range = timeUpdate !== undefined ? timeUpdate : existing.event_time_range;
  const termsUpdate = normalizeTermsAndConditionsForUpdate(req.body);
  const terms_and_conditions =
    termsUpdate !== undefined ? termsUpdate : existing.terms_and_conditions;

  const p = computeBookingPricing(packagePrice, event_date);

  let packageTemplateId = existing.package_template_id;
  if (Object.prototype.hasOwnProperty.call(req.body, 'package_template_id')) {
    const parsed = parsePackageTemplateId(req.body, req.userId);
    if (parsed === false) {
      return res.status(400).json({ error: 'Invalid or unknown package template' });
    }
    packageTemplateId = parsed === undefined ? existing.package_template_id : parsed;
  }

  db.prepare(`
    UPDATE bookings SET
      event_type = ?, event_date = ?, package = ?, event_time_range = ?, venue_address = ?, terms_and_conditions = ?,
      deposit_amount = ?, direct_price = ?, square_price = ?,
      remaining_amount = ?, final_due_date = ?, square_deposit = ?, square_remaining = ?,
      payment_method = ?, status = ?, payment_status = ?, notes = ?, package_template_id = ?
    WHERE id = ?
  `).run(
    event_type, event_date, pkg, event_time_range, venue_address, terms_and_conditions,
    p.deposit_amount, packagePrice, p.square_price,
    p.remaining_amount, p.final_due_date, p.square_deposit, p.square_remaining,
    payment_method || 'direct',
    status, payment_status, notes || null,
    packageTemplateId,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  ensureDefaultContract(updated.id);
  if (termsUpdate !== undefined) {
    const ct = db
      .prepare('SELECT id, pdf_path, template_id FROM contracts WHERE booking_id = ?')
      .get(updated.id);
    if (ct && !ct.pdf_path && !ct.template_id) {
      const t = (terms_and_conditions && String(terms_and_conditions).trim()) || '';
      const content =
        t.length > 0
          ? t
          : 'The terms and conditions shown on your client booking page are part of this agreement.';
      db.prepare('UPDATE contracts SET content = ? WHERE id = ?').run(content, ct.id);
    }
  }

  res.json({
    ...enrichBookingRow(updated),
    package_details: packageDetailsForBooking(updated),
  });
});

// DELETE /api/bookings/:id
router.delete('/:id', auth, (req, res) => {
  const booking = db.prepare('SELECT id FROM bookings WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
