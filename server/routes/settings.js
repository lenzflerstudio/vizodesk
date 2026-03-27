const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const { validateClientPortalBaseUrl } = require('../lib/clientPortalUrl');
const { invalidateCorsOriginCache } = require('../lib/corsOrigins');
const { encryptAppSecret } = require('../lib/appSecretCrypto');
const {
  getPaymentPortalRow,
  serializePaymentPortal,
  upsertPaymentPortal,
} = require('../lib/paymentPortalHelper');

const USER_KEYS = new Set([
  'business_name',
  'business_email',
  'business_phone',
  'business_website',
  'company_type',
  'brand_color',
  'email_signature',
  'notify_email',
  'notify_payment',
  'notify_contract',
  'notify_calendar',
  'tax_home_state',
  'tax_ytd_expenses',
  'tax_filing_status',
  'tax_entity_type',
  'tax_sales_tax_rate',
]);

const DEFAULT_EMAIL_TEMPLATE_NAMES = [
  'Booking Confirmation + Next Steps',
  'Session Reminder',
  'Payment Received',
  'Contract Ready to Sign',
  'Thank You / Follow-up',
  'Invoice Sent',
  'Quote Request Response',
  'Reschedule Request',
  'Final Gallery Delivery',
  'Deposit Reminder',
  'Event Day Details',
  'Year in Review',
  'Referral Request',
];

function ensureEmailTemplatesForUser(userId) {
  const row = db.prepare('SELECT COUNT(*) as n FROM email_templates WHERE user_id = ?').get(userId);
  if (!row || Number(row.n) > 0) return;
  const ins = db.prepare('INSERT INTO email_templates (user_id, name) VALUES (?, ?)');
  DEFAULT_EMAIL_TEMPLATE_NAMES.forEach((name) => ins.run(userId, name));
}

function normalizeBrandColor(raw) {
  const s = String(raw || '').trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return '#a21caf';
  if (s.length === 4) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return s.toLowerCase();
}

function toBoolInt(v) {
  if (v === true || v === 1 || v === '1') return 1;
  if (v === false || v === 0 || v === '0') return 0;
  return null;
}

function defaultUserRow() {
  return {
    business_name: '',
    business_email: '',
    business_phone: '',
    business_website: '',
    company_type: 'Photography',
    brand_color: '#a21caf',
    notify_email: 1,
    notify_payment: 1,
    notify_contract: 1,
    notify_calendar: 0,
    email_signature: '',
    tax_home_state: '',
    tax_ytd_expenses: 0,
    tax_filing_status: 'single',
    tax_entity_type: 'sole_prop',
    tax_sales_tax_rate: 0,
  };
}

function getUserRow(userId) {
  const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  if (!row) return { ...defaultUserRow(), user_id: userId };
  return row;
}

function ensureUserSettingsRow(userId) {
  const exists = db.prepare('SELECT 1 FROM user_settings WHERE user_id = ?').get(userId);
  if (!exists) {
    const cur = getUserRow(userId);
    persistUserRow(userId, mergeUserRow(serializeUser(cur), {}));
  }
}

function mergeUserRow(current, body) {
  const next = { ...current };
  for (const key of USER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const val = body[key];
    if (key.startsWith('notify_')) {
      const b = toBoolInt(val);
      if (b !== null) next[key] = b;
    } else if (key === 'email_signature' && typeof val === 'string') {
      next[key] = val.replace(/\r\n/g, '\n');
    } else if (key === 'tax_ytd_expenses') {
      const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
      if (!Number.isNaN(n) && n >= 0) next[key] = n;
    } else if (key === 'tax_filing_status') {
      const s = String(val).trim().toLowerCase();
      if (s === 'married_joint' || s === 'single') next[key] = s;
    } else if (key === 'tax_entity_type') {
      const s = String(val).trim().toLowerCase();
      if (s === 's_corp' || s === 'sole_prop') next[key] = s;
    } else if (key === 'tax_sales_tax_rate') {
      const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
      if (!Number.isNaN(n)) next[key] = Math.max(0, Math.min(0.25, n));
    } else if (key === 'tax_home_state' && typeof val === 'string') {
      const s = val.trim().toUpperCase().slice(0, 2);
      if (s.length === 0) next[key] = '';
      else next[key] = /^[A-Z]{2}$/.test(s) ? s : next[key];
    } else if (typeof val === 'string') {
      next[key] = val.trim();
    } else if (val != null) {
      next[key] = String(val);
    }
  }
  return next;
}

function persistUserRow(userId, row) {
  const exists = db.prepare('SELECT 1 FROM user_settings WHERE user_id = ?').get(userId);
  const brand = normalizeBrandColor(row.brand_color);
  const ctype = String(row.company_type || 'Photography').slice(0, 80) || 'Photography';
  const nEmail = row.notify_email ? 1 : 0;
  const nPay = row.notify_payment ? 1 : 0;
  const nContract = row.notify_contract ? 1 : 0;
  const nCal = row.notify_calendar ? 1 : 0;

  if (!exists) {
    db.prepare(`
      INSERT INTO user_settings (
        user_id, business_name, business_email, business_phone, business_website,
        company_type, brand_color, email_signature,
        notify_email, notify_payment, notify_contract, notify_calendar,
        tax_home_state, tax_ytd_expenses,
        tax_filing_status, tax_entity_type, tax_sales_tax_rate,
        stripe_fee_percent, default_deposit_amount, currency,
        gmail_sender_address, gmail_app_password_enc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      row.business_name || '',
      row.business_email || '',
      row.business_phone || '',
      row.business_website || '',
      ctype,
      brand,
      row.email_signature || '',
      nEmail,
      nPay,
      nContract,
      nCal,
      row.tax_home_state || '',
      Number(row.tax_ytd_expenses) || 0,
      row.tax_filing_status === 'married_joint' ? 'married_joint' : 'single',
      row.tax_entity_type === 's_corp' ? 's_corp' : 'sole_prop',
      Math.max(0, Math.min(0.25, Number(row.tax_sales_tax_rate) || 0)),
      '3',
      '500',
      'USD',
      null,
      null
    );
  } else {
    const gmailPres = db
      .prepare('SELECT gmail_sender_address, gmail_app_password_enc FROM user_settings WHERE user_id = ?')
      .get(userId);
    db.prepare(`
      UPDATE user_settings SET
        business_name = ?, business_email = ?, business_phone = ?, business_website = ?,
        company_type = ?, brand_color = ?, email_signature = ?,
        notify_email = ?, notify_payment = ?, notify_contract = ?, notify_calendar = ?,
        tax_home_state = ?, tax_ytd_expenses = ?,
        tax_filing_status = ?, tax_entity_type = ?, tax_sales_tax_rate = ?,
        stripe_fee_percent = ?, default_deposit_amount = ?, currency = ?,
        gmail_sender_address = ?, gmail_app_password_enc = ?
      WHERE user_id = ?
    `).run(
      row.business_name || '',
      row.business_email || '',
      row.business_phone || '',
      row.business_website || '',
      ctype,
      brand,
      row.email_signature || '',
      nEmail,
      nPay,
      nContract,
      nCal,
      row.tax_home_state || '',
      Number(row.tax_ytd_expenses) || 0,
      row.tax_filing_status === 'married_joint' ? 'married_joint' : 'single',
      row.tax_entity_type === 's_corp' ? 's_corp' : 'sole_prop',
      Math.max(0, Math.min(0.25, Number(row.tax_sales_tax_rate) || 0)),
      '3',
      '500',
      'USD',
      gmailPres?.gmail_sender_address ?? null,
      gmailPres?.gmail_app_password_enc ?? null,
      userId
    );
  }
}

function serializeUser(row) {
  return {
    business_name: row.business_name || '',
    business_email: row.business_email || '',
    business_phone: row.business_phone || '',
    business_website: row.business_website || '',
    company_type: row.company_type || 'Photography',
    brand_color: normalizeBrandColor(row.brand_color || '#a21caf'),
    email_signature: row.email_signature || '',
    notify_email: !!row.notify_email,
    notify_payment: !!row.notify_payment,
    notify_contract: !!row.notify_contract,
    notify_calendar: !!row.notify_calendar,
    tax_home_state: row.tax_home_state || '',
    tax_ytd_expenses: Number(row.tax_ytd_expenses) || 0,
    tax_filing_status: row.tax_filing_status === 'married_joint' ? 'married_joint' : 'single',
    tax_entity_type: row.tax_entity_type === 's_corp' ? 's_corp' : 'sole_prop',
    tax_sales_tax_rate: Math.max(0, Math.min(0.25, Number(row.tax_sales_tax_rate) || 0)),
    gmail_outbound_ready: !!(row.gmail_sender_address && String(row.gmail_sender_address).trim() && row.gmail_app_password_enc),
    gmail_sender_address: row.gmail_sender_address ? String(row.gmail_sender_address).trim() : '',
    square_location_id: row.square_location_id != null ? String(row.square_location_id).trim() : '',
    square_environment: row.square_environment === 'production' ? 'production' : 'sandbox',
    square_access_token_saved: !!row.square_access_token_enc,
    square_payments_ready: !!(row.square_access_token_enc && String(row.square_location_id || '').trim()),
  };
}

// GET /api/settings
router.get('/', auth, (req, res) => {
  try {
    const app = db
      .prepare(
        `SELECT client_portal_base_url, square_webhook_notification_url, square_webhook_signature_key_enc
         FROM app_settings WHERE id = 1`
      )
      .get();
    const u = getUserRow(req.userId);
    return res.json({
      client_portal_base_url: app?.client_portal_base_url ?? null,
      square_webhook_notification_url:
        app?.square_webhook_notification_url != null ? String(app.square_webhook_notification_url).trim() : '',
      square_webhook_secret_set: !!(app?.square_webhook_signature_key_enc),
      ...serializeUser(u),
      payment_portal: serializePaymentPortal(getPaymentPortalRow(req.userId)),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PUT /api/settings — partial update (any subset of keys)
router.put('/', auth, (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid body' });
    }

    if (Object.prototype.hasOwnProperty.call(body, 'client_portal_base_url')) {
      const bodyVal = body.client_portal_base_url;
      const raw = bodyVal === null || bodyVal === undefined ? '' : String(bodyVal).trim();
      if (!raw) {
        db.prepare('UPDATE app_settings SET client_portal_base_url = NULL WHERE id = 1').run();
      } else {
        const v = validateClientPortalBaseUrl(raw);
        if (!v.ok) return res.status(400).json({ error: v.error });
        db.prepare('UPDATE app_settings SET client_portal_base_url = ? WHERE id = 1').run(v.normalized);
      }
      invalidateCorsOriginCache();
    }

    const hasUserKey = Object.keys(body).some((k) => USER_KEYS.has(k));
    if (hasUserKey) {
      const cur = getUserRow(req.userId);
      const base = serializeUser(cur);
      const merged = mergeUserRow(base, body);
      persistUserRow(req.userId, merged);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'payment_portal') && body.payment_portal != null) {
      if (typeof body.payment_portal !== 'object') {
        return res.status(400).json({ error: 'payment_portal must be an object' });
      }
      upsertPaymentPortal(req.userId, body.payment_portal);
    }

    if (
      Object.prototype.hasOwnProperty.call(body, 'gmail_sender_address') ||
      Object.prototype.hasOwnProperty.call(body, 'gmail_app_password')
    ) {
      const settingsExists = db.prepare('SELECT 1 FROM user_settings WHERE user_id = ?').get(req.userId);
      if (!settingsExists) {
        const cur = getUserRow(req.userId);
        persistUserRow(req.userId, mergeUserRow(serializeUser(cur), {}));
      }
      const ex = db
        .prepare('SELECT gmail_sender_address, gmail_app_password_enc FROM user_settings WHERE user_id = ?')
        .get(req.userId);
      let addr = ex?.gmail_sender_address != null ? String(ex.gmail_sender_address).trim() : '';
      let enc = ex?.gmail_app_password_enc || null;
      if (Object.prototype.hasOwnProperty.call(body, 'gmail_sender_address')) {
        addr = String(body.gmail_sender_address ?? '').trim();
      }
      if (Object.prototype.hasOwnProperty.call(body, 'gmail_app_password')) {
        const p = body.gmail_app_password;
        if (p == null || String(p).trim() === '') {
          enc = null;
        } else {
          enc = encryptAppSecret(String(p).trim());
        }
      }
      db.prepare('UPDATE user_settings SET gmail_sender_address = ?, gmail_app_password_enc = ? WHERE user_id = ?').run(
        addr || null,
        enc,
        req.userId
      );
    }

    if (Object.prototype.hasOwnProperty.call(body, 'square_access_token')) {
      ensureUserSettingsRow(req.userId);
      const p = body.square_access_token;
      const enc = p == null || String(p).trim() === '' ? null : encryptAppSecret(String(p).trim());
      db.prepare('UPDATE user_settings SET square_access_token_enc = ? WHERE user_id = ?').run(enc, req.userId);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'square_location_id')) {
      ensureUserSettingsRow(req.userId);
      const v = String(body.square_location_id ?? '').trim();
      db.prepare('UPDATE user_settings SET square_location_id = ? WHERE user_id = ?').run(v || null, req.userId);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'square_environment')) {
      ensureUserSettingsRow(req.userId);
      const s = String(body.square_environment || '').toLowerCase();
      const mode = s === 'production' ? 'production' : 'sandbox';
      db.prepare('UPDATE user_settings SET square_environment = ? WHERE user_id = ?').run(mode, req.userId);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'square_webhook_notification_url')) {
      const v = body.square_webhook_notification_url;
      const raw = v === null || v === undefined ? '' : String(v).trim();
      db.prepare('UPDATE app_settings SET square_webhook_notification_url = ? WHERE id = 1').run(raw || null);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'square_webhook_signature_key')) {
      const p = body.square_webhook_signature_key;
      const enc = p == null || String(p).trim() === '' ? null : encryptAppSecret(String(p).trim());
      db.prepare('UPDATE app_settings SET square_webhook_signature_key_enc = ? WHERE id = 1').run(enc);
    }

    const app = db
      .prepare(
        `SELECT client_portal_base_url, square_webhook_notification_url, square_webhook_signature_key_enc
         FROM app_settings WHERE id = 1`
      )
      .get();
    const u = getUserRow(req.userId);
    return res.json({
      client_portal_base_url: app?.client_portal_base_url ?? null,
      square_webhook_notification_url:
        app?.square_webhook_notification_url != null ? String(app.square_webhook_notification_url).trim() : '',
      square_webhook_secret_set: !!(app?.square_webhook_signature_key_enc),
      ...serializeUser(u),
      payment_portal: serializePaymentPortal(getPaymentPortalRow(req.userId)),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

// GET /api/settings/email-templates
router.get('/email-templates', auth, (req, res) => {
  try {
    ensureEmailTemplatesForUser(req.userId);
    const templates = db.prepare(`
      SELECT id, name, created_at FROM email_templates
      WHERE user_id = ?
      ORDER BY datetime(created_at) DESC
    `).all(req.userId);
    return res.json({ templates });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load email templates' });
  }
});

// POST /api/settings/email-templates  { name }
router.post('/email-templates', auth, (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Template name is required' });
    if (name.length > 200) return res.status(400).json({ error: 'Name is too long' });
    const r = db.prepare('INSERT INTO email_templates (user_id, name) VALUES (?, ?)').run(req.userId, name);
    const template = db.prepare('SELECT id, name, created_at FROM email_templates WHERE id = ?').get(r.lastInsertRowid);
    return res.status(201).json({ template });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create template' });
  }
});

// GET /api/settings/export
router.get('/export', auth, (req, res) => {
  try {
    const uid = req.userId;
    const user = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(uid);
    const clients = db.prepare('SELECT * FROM clients WHERE user_id = ?').all(uid);
    const bookings = db.prepare(`
      SELECT b.*, c.full_name AS client_name, c.email AS client_email
      FROM bookings b
      LEFT JOIN clients c ON b.client_id = c.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `).all(uid);
    const payments = db.prepare(`
      SELECT p.* FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE b.user_id = ?
      ORDER BY p.created_at DESC
    `).all(uid);
    const contracts = db.prepare(`
      SELECT ct.* FROM contracts ct
      JOIN bookings b ON ct.booking_id = b.id
      WHERE b.user_id = ?
    `).all(uid);

    return res.json({
      exported_at: new Date().toISOString(),
      user,
      clients,
      bookings,
      payments,
      contracts,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to export data' });
  }
});

module.exports = router;
