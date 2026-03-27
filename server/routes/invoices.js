const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

const MAX_LOGO_CHARS = 600000;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function computeLines(rawLines) {
  const arr = Array.isArray(rawLines) ? rawLines : [];
  let subtotal = 0;
  const normalized = [];
  arr.forEach((li, i) => {
    const q = Math.max(0, parseFloat(li.quantity) || 0);
    const p = Math.max(0, parseFloat(li.unit_price) || 0);
    const amount = round2(q * p);
    subtotal += amount;
    normalized.push({
      description: String(li.description || '').slice(0, 2000),
      quantity: q,
      unit_price: p,
      amount,
      sort_order: i,
    });
  });
  return { normalized, subtotal: round2(subtotal) };
}

function applyDiscount(subtotal, discountType, discountValue) {
  const t =
    discountType === 'percent' ? 'percent' : discountType === 'amount' ? 'amount' : 'none';
  let d = 0;
  if (t === 'percent') {
    d = round2(subtotal * (Math.min(100, Math.max(0, parseFloat(discountValue) || 0)) / 100));
  } else if (t === 'amount') {
    d = Math.min(subtotal, round2(Math.max(0, parseFloat(discountValue) || 0)));
  }
  return {
    discount_type: t,
    discount_value: t === 'none' ? 0 : parseFloat(discountValue) || 0,
    discount_amount: d,
    total: round2(subtotal - d),
  };
}

function loadInvoicePayments(invoiceId) {
  return db
    .prepare(
      'SELECT id, amount, method, paid_at, notes, created_at FROM invoice_payments WHERE invoice_id = ? ORDER BY paid_at ASC, id ASC'
    )
    .all(Number(invoiceId));
}

function loadInvoice(userId, id) {
  const inv = db
    .prepare(
      `SELECT i.*, c.full_name as client_name, c.email as client_email, c.phone as client_phone
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       WHERE i.id = ? AND i.user_id = ?`
    )
    .get(Number(id), userId);
  if (!inv) return null;
  const line_items = db
    .prepare('SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC')
    .all(Number(id));
  const invoice_payments = loadInvoicePayments(id);
  const paid = invoice_payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const amount_paid = round2(paid);
  const amount_remaining = Math.max(0, round2((parseFloat(inv.total) || 0) - paid));
  return { ...inv, line_items, invoice_payments, amount_paid, amount_remaining };
}

router.get('/next-number', auth, (req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) as n FROM invoices WHERE user_id = ?').get(req.userId);
    const n = Number(row?.n || 0) + 1;
    const y = new Date().getFullYear();
    res.json({ invoice_number: `${y}-${String(n).padStart(4, '0')}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to suggest invoice number' });
  }
});

/** Client-facing invoice (no auth) */
router.get('/public/:token', (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(404).json({ error: 'Invoice not found' });
    const inv = db.prepare('SELECT * FROM invoices WHERE public_token = ?').get(token);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const line_items = db
      .prepare(
        'SELECT description, quantity, unit_price, amount FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC'
      )
      .all(inv.id);
    const payments = db
      .prepare('SELECT amount, method, paid_at FROM invoice_payments WHERE invoice_id = ? ORDER BY paid_at ASC, id ASC')
      .all(inv.id);
    const client = db
      .prepare('SELECT full_name, email, phone FROM clients WHERE id = ?')
      .get(inv.client_id);
    const biz = db
      .prepare(
        'SELECT business_name, business_email, business_phone, business_website, company_type, brand_color FROM user_settings WHERE user_id = ?'
      )
      .get(inv.user_id);

    const paidSum = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const total = parseFloat(inv.total) || 0;
    const amount_due = Math.max(0, round2(total - paidSum));

    const discAmt = parseFloat(inv.discount_amount) || 0;
    const discLabel = inv.discount_label && String(inv.discount_label).trim();
    const show_discount_line = discAmt > 0 && !!discLabel;

    const hex = String(biz?.brand_color || '').trim();
    const brand_color = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex.toLowerCase() : '#6d28d9';

    res.json({
      title: inv.title,
      summary: inv.summary,
      invoice_number: inv.invoice_number,
      po_number: inv.po_number,
      invoice_date: inv.invoice_date,
      payment_due_date: inv.payment_due_date,
      payment_terms_label: inv.payment_terms_label,
      subtotal: inv.subtotal,
      discount_amount: inv.discount_amount,
      discount_label: discLabel || null,
      show_discount_line,
      total: inv.total,
      currency: inv.currency || 'USD',
      amount_due,
      logo_data_url: inv.logo_data_url,
      notes_terms: inv.notes_terms,
      footer: inv.footer,
      line_items,
      payments,
      client: client
        ? { full_name: client.full_name, email: client.email, phone: client.phone }
        : null,
      business: {
        name: biz?.business_name || '',
        email: biz?.business_email || '',
        phone: biz?.business_phone || '',
        website: biz?.business_website || '',
        company_type: biz?.company_type || '',
        brand_color,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load invoice' });
  }
});

router.get('/', auth, (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT i.id, i.client_id, i.booking_id, i.title, i.summary, i.invoice_number, i.po_number,
                i.invoice_date, i.payment_due_date, i.payment_terms_label, i.public_token,
                i.subtotal, i.discount_type, i.discount_amount, i.total, i.currency, i.status, i.created_at,
                c.full_name as client_name, c.email as client_email
         FROM invoices i
         LEFT JOIN clients c ON i.client_id = c.id
         WHERE i.user_id = ?
         ORDER BY i.created_at DESC`
      )
      .all(req.userId);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list invoices' });
  }
});

router.post('/:id/payments', auth, (req, res) => {
  try {
    const inv = db
      .prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?')
      .get(Number(req.params.id), req.userId);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const amount = parseFloat(req.body.amount);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Enter a valid payment amount' });
    }
    const method = String(req.body.method || 'Payment').trim().slice(0, 120) || 'Payment';
    const paid_at =
      String(req.body.paid_at || req.body.paid_date || '').trim().slice(0, 32) ||
      new Date().toISOString().slice(0, 10);
    const notes = req.body.notes != null ? String(req.body.notes).trim().slice(0, 500) : null;

    db.prepare(
      'INSERT INTO invoice_payments (invoice_id, amount, method, paid_at, notes) VALUES (?,?,?,?,?)'
    ).run(inv.id, round2(amount), method, paid_at, notes || null);

    const payRows = db.prepare('SELECT amount FROM invoice_payments WHERE invoice_id = ?').all(inv.id);
    const sum = payRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    if (round2(sum) >= round2(parseFloat(inv.total) || 0) - 0.005) {
      db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(inv.id);
    }

    res.status(201).json(loadInvoice(req.userId, inv.id));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

router.get('/:id', auth, (req, res) => {
  const inv = loadInvoice(req.userId, req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
});

router.delete('/:id', auth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = db
      .prepare('SELECT id, status FROM invoices WHERE id = ? AND user_id = ?')
      .get(id, req.userId);
    if (!row) return res.status(404).json({ error: 'Invoice not found' });
    const st = String(row.status || '').toLowerCase();
    if (st !== 'draft') {
      return res.status(400).json({ error: 'Only draft invoices can be deleted' });
    }
    db.prepare('DELETE FROM invoice_line_items WHERE invoice_id = ?').run(id);
    db.prepare('DELETE FROM invoice_payments WHERE invoice_id = ?').run(id);
    db.prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?').run(id, req.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

router.put('/:id', auth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db
      .prepare('SELECT id FROM invoices WHERE id = ? AND user_id = ?')
      .get(id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    const v = validateBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });

    const client = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(v.client_id, req.userId);
    if (!client) return res.status(400).json({ error: 'Invalid customer' });

    if (v.booking_id != null) {
      const b = db.prepare('SELECT id FROM bookings WHERE id = ? AND user_id = ?').get(v.booking_id, req.userId);
      if (!b) return res.status(400).json({ error: 'Invalid booking link' });
    }

    const invDate = v.invoice_date || new Date().toISOString().slice(0, 10);

    db.prepare(
      `UPDATE invoices SET
        client_id = ?, booking_id = ?, title = ?, summary = ?, invoice_number = ?, po_number = ?,
        invoice_date = ?, payment_due_date = ?, payment_terms_label = ?,
        subtotal = ?, discount_type = ?, discount_value = ?, discount_amount = ?, total = ?, currency = ?,
        notes_terms = ?, footer = ?, logo_data_url = ?, status = ?, discount_label = ?
      WHERE id = ? AND user_id = ?`
    ).run(
      v.client_id,
      v.booking_id,
      v.title,
      v.summary,
      v.invoice_number,
      v.po_number,
      invDate,
      v.payment_due_date,
      v.payment_terms_label,
      v.subtotal,
      v.discount_type,
      v.discount_value,
      v.discount_amount,
      v.total,
      v.currency,
      v.notes_terms,
      v.footer,
      v.logo_data_url,
      v.status,
      v.discount_label,
      id,
      req.userId
    );

    db.prepare('DELETE FROM invoice_line_items WHERE invoice_id = ?').run(id);
    const insLine = db.prepare(
      `INSERT INTO invoice_line_items (invoice_id, sort_order, description, quantity, unit_price, amount)
       VALUES (?,?,?,?,?,?)`
    );
    for (const li of v.normalized) {
      insLine.run(id, li.sort_order, li.description, li.quantity, li.unit_price, li.amount);
    }

    res.json(loadInvoice(req.userId, id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

function validateBody(body) {
  const client_id =
    body.client_id !== undefined && body.client_id !== null && body.client_id !== ''
      ? parseInt(body.client_id, 10)
      : null;
  if (!client_id || Number.isNaN(client_id)) return { error: 'Customer is required' };

  const booking_id =
    body.booking_id !== undefined && body.booking_id !== null && body.booking_id !== ''
      ? parseInt(body.booking_id, 10)
      : null;
  if (booking_id !== null && Number.isNaN(booking_id)) return { error: 'Invalid booking' };

  let logo = body.logo_data_url;
  if (logo != null && typeof logo === 'string') {
    if (logo.length > MAX_LOGO_CHARS) return { error: 'Logo image is too large (max ~450KB)' };
  } else logo = null;

  const { normalized, subtotal } = computeLines(body.line_items);
  if (normalized.length === 0) return { error: 'Add at least one line item' };

  const disc = applyDiscount(subtotal, body.discount_type, body.discount_value);

  let discount_label = null;
  if (disc.discount_amount > 0) {
    const dl = body.discount_label != null ? String(body.discount_label).trim().slice(0, 200) : '';
    if (dl) discount_label = dl;
  }

  return {
    ok: true,
    client_id,
    booking_id,
    title: String(body.title || 'Invoice').slice(0, 200) || 'Invoice',
    summary: body.summary != null ? String(body.summary).slice(0, 4000) : null,
    invoice_number: body.invoice_number != null ? String(body.invoice_number).slice(0, 80) : null,
    po_number: body.po_number != null ? String(body.po_number).slice(0, 120) : null,
    invoice_date: String(body.invoice_date || '').slice(0, 32),
    payment_due_date: body.payment_due_date != null ? String(body.payment_due_date).slice(0, 32) : null,
    payment_terms_label: body.payment_terms_label != null ? String(body.payment_terms_label).slice(0, 80) : null,
    currency: String(body.currency || 'USD').slice(0, 12) || 'USD',
    notes_terms: body.notes_terms != null ? String(body.notes_terms).slice(0, 8000) : null,
    footer: body.footer != null ? String(body.footer).slice(0, 4000) : null,
    logo_data_url: logo,
    discount_label,
    status: ['sent', 'paid', 'draft'].includes(body.status) ? body.status : 'draft',
    normalized,
    subtotal,
    ...disc,
  };
}

router.post('/', auth, (req, res) => {
  try {
    const v = validateBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });

    const client = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(v.client_id, req.userId);
    if (!client) return res.status(400).json({ error: 'Invalid customer' });

    if (v.booking_id != null) {
      const b = db.prepare('SELECT id FROM bookings WHERE id = ? AND user_id = ?').get(v.booking_id, req.userId);
      if (!b) return res.status(400).json({ error: 'Invalid booking link' });
    }

    const invDate = v.invoice_date || new Date().toISOString().slice(0, 10);
    const publicToken = uuidv4();

    const result = db
      .prepare(
        `INSERT INTO invoices (
          user_id, client_id, booking_id, title, summary, invoice_number, po_number,
          invoice_date, payment_due_date, payment_terms_label,
          subtotal, discount_type, discount_value, discount_amount, total, currency,
          notes_terms, footer, logo_data_url, status, discount_label, public_token
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        req.userId,
        v.client_id,
        v.booking_id,
        v.title,
        v.summary,
        v.invoice_number,
        v.po_number,
        invDate,
        v.payment_due_date,
        v.payment_terms_label,
        v.subtotal,
        v.discount_type,
        v.discount_value,
        v.discount_amount,
        v.total,
        v.currency,
        v.notes_terms,
        v.footer,
        v.logo_data_url,
        v.status,
        v.discount_label,
        publicToken
      );

    const id = result.lastInsertRowid;
    const insLine = db.prepare(
      `INSERT INTO invoice_line_items (invoice_id, sort_order, description, quantity, unit_price, amount)
       VALUES (?,?,?,?,?,?)`
    );
    for (const li of v.normalized) {
      insLine.run(id, li.sort_order, li.description, li.quantity, li.unit_price, li.amount);
    }

    res.status(201).json(loadInvoice(req.userId, id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

module.exports = router;
