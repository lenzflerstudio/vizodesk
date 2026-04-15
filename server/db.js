/**
 * db.js — Async-initialised sql.js wrapper
 * Exposes a better-sqlite3-compatible synchronous prepare/run/all/get API.
 * Database is persisted to disk after every write operation.
 */
const path = require('path');
const fs   = require('fs');

const dbDir  = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'database', 'vizodesk.db'));
const dbPath = process.env.DB_PATH              || path.join(__dirname, '..', 'database', 'vizodesk.db');

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let _db = null; // sql.js Database instance

// ─── Persistence ─────────────────────────────────────────────────────────────
function saveDb() {
  const data = _db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// ─── better-sqlite3–compatible prepare() wrapper ─────────────────────────────
function toArray(params) {
  if (!params || params.length === 0) return [];
  if (typeof params[0] === 'object' && !Array.isArray(params[0]) && params[0] !== null)
    return Object.values(params[0]);
  if (Array.isArray(params[0])) return params[0];
  return [...params];
}

function prepare(sql) {
  return {
    all(...params) {
      const args = toArray(params);
      const result = _db.exec(sql, args.length ? args : undefined);
      if (!result || !result[0]) return [];
      const { columns, values } = result[0];
      return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
    },
    get(...params) {
      return this.all(...params)[0] ?? null;
    },
    run(...params) {
      const args = toArray(params);
      const stmt = _db.prepare(sql);
      stmt.run(args.length ? args : []);
      stmt.free();
      const changes    = _db.getRowsModified();
      const [[lastId]] = _db.exec('SELECT last_insert_rowid()')[0].values;
      saveDb();
      return { changes, lastInsertRowid: Number(lastId) };
    },
  };
}

function exec(sql) {
  _db.run(sql);
  saveDb();
}

// ─── init() — called once at server startup ───────────────────────────────────
async function init() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  _db = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  _db.run('PRAGMA foreign_keys=ON;');

  // Apply schema
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    let schema = fs.readFileSync(schemaPath, 'utf-8');
    // Remove the seed line that references a fake system user
    schema = schema.replace(/^INSERT OR IGNORE.*$/m, '');
    _db.run(schema);
  }

  // Bookings table: add pricing columns on existing DBs (CREATE IF NOT EXISTS skips new cols)
  migrateBookingsColumns();
  migrateDropLegacyStripeBookingColumns();
  migrateContractUploads();
  migrateAppSettings();
  migrateUserSettings();
  migrateUserSettingsColumns();
  migrateSquareSettingsColumns();
  migrateAppSecretKv();
  migrateEmailTemplates();
  migratePaymentsTaxEstimates();
  migratePaymentsSquareIds();
  migrateInvoices();
  migrateInvoiceExtensions();
  migratePackageTemplates();
  migrateBookingTermsTemplates();
  migratePortalPackageJson();
  migrateBookingOrigin();
  migrateUserPaymentPortal();

  // Seed default contract templates if none exist
  const [[count]] = _db.exec('SELECT COUNT(*) FROM contract_templates')[0]?.values || [[0]];
  if (Number(count) === 0) {
    _db.run('PRAGMA foreign_keys=OFF;');
    const stmt = _db.prepare('INSERT INTO contract_templates (user_id, name, content) VALUES (?,?,?)');
    [
      [0, 'Standard Photography Contract', getPhotoContract()],
      [0, 'Wedding Package Contract',      getWeddingContract()],
      [0, 'Video Production Contract',     getVideoContract()],
    ].forEach(r => stmt.run(r));
    stmt.free();
    _db.run('PRAGMA foreign_keys=ON;');
    saveDb();
  }

  ensurePlaceholderOwnerUserIfEmpty();

  console.log('✅ Database ready:', dbPath);
}

/** Fresh cloud DBs had no users (schema seed line is stripped); sync/bookings need a user_id owner. */
function ensurePlaceholderOwnerUserIfEmpty() {
  const row = prepare('SELECT COUNT(*) AS n FROM users').get();
  if (!row || Number(row.n) > 0) return;
  const bcrypt = require('bcryptjs');
  const password_hash = bcrypt.hashSync('__vizodesk_sync_placeholder_not_for_login__', 12);
  prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)').run(
    'sync-owner@internal.vizodesk.local',
    password_hash,
    'Cloud sync owner'
  );
  console.log(
    '[vizodesk] No user existed; created internal placeholder owner so booking sync can attach data. Register normally in the app when ready.'
  );
}

function migrateBookingsColumns() {
  const result = _db.exec("PRAGMA table_info(bookings);");
  if (!result || !result[0]) return;
  const { columns, values } = result[0];
  const nameIdx = columns.indexOf("name");
  if (nameIdx < 0) return;
  const cols = new Set(values.map((row) => row[nameIdx]));
  const add = (name, def) => {
    if (!cols.has(name)) {
      _db.run(`ALTER TABLE bookings ADD COLUMN ${name} ${def};`);
      cols.add(name);
    }
  };
  add('remaining_amount', 'REAL DEFAULT 0');
  add('final_due_date', 'TEXT');
  add('square_deposit', 'REAL DEFAULT 0');
  add('square_remaining', 'REAL DEFAULT 0');
  add('square_price', 'REAL DEFAULT 0');
  add('venue_address', 'TEXT');
  add('event_time_range', 'TEXT');
  add('terms_and_conditions', 'TEXT');

  // Backfill / recompute from package + deposit (idempotent for consistent data)
  _db.run(`
    UPDATE bookings SET
      remaining_amount = ROUND(direct_price - deposit_amount, 2),
      square_deposit = ROUND(deposit_amount * 1.03, 2),
      square_remaining = ROUND((direct_price - deposit_amount) * 1.03, 2),
      square_price = ROUND(direct_price * 1.03, 2),
      final_due_date = date(event_date, '-7 days')
    WHERE direct_price IS NOT NULL AND event_date IS NOT NULL
      AND event_date != '';
  `);
  saveDb();
}

/** Older DBs had stripe_* mirror columns NOT NULL; inserts only set square_* → booking create failed. Square is canonical. */
function migrateDropLegacyStripeBookingColumns() {
  const result = _db.exec('PRAGMA table_info(bookings);');
  if (!result || !result[0]) return;
  const nameIdx = result[0].columns.indexOf('name');
  if (nameIdx < 0) return;
  const colNames = new Set(result[0].values.map((row) => row[nameIdx]));
  for (const col of ['stripe_price', 'stripe_deposit', 'stripe_remaining']) {
    if (!colNames.has(col)) continue;
    try {
      _db.run(`ALTER TABLE bookings DROP COLUMN ${col};`);
      colNames.delete(col);
    } catch (err) {
      console.warn(`Bookings migration: could not DROP COLUMN ${col}:`, err.message);
    }
  }
  saveDb();
}

function migrateContractUploads() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS contract_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      original_filename TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const bookingInfo = _db.exec('PRAGMA table_info(bookings);');
  if (bookingInfo && bookingInfo[0]) {
    const { columns, values } = bookingInfo[0];
    const ni = columns.indexOf('name');
    if (ni >= 0) {
      const bcols = new Set(values.map((row) => row[ni]));
      if (!bcols.has('contract_upload_id')) {
        _db.run('ALTER TABLE bookings ADD COLUMN contract_upload_id INTEGER;');
      }
    }
  }

  const ctInfo = _db.exec('PRAGMA table_info(contracts);');
  if (ctInfo && ctInfo[0]) {
    const { columns, values } = ctInfo[0];
    const ni = columns.indexOf('name');
    if (ni >= 0) {
      const ccols = new Set(values.map((row) => row[ni]));
      if (!ccols.has('pdf_path')) {
        _db.run('ALTER TABLE contracts ADD COLUMN pdf_path TEXT;');
      }
    }
  }

  saveDb();
}

function migrateAppSettings() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      client_portal_base_url TEXT
    );
  `);
  _db.run(`INSERT OR IGNORE INTO app_settings (id, client_portal_base_url) VALUES (1, NULL);`);
  saveDb();
}

function migrateUserSettings() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      business_name TEXT,
      business_email TEXT,
      business_phone TEXT,
      business_website TEXT,
      notify_email INTEGER NOT NULL DEFAULT 1,
      notify_payment INTEGER NOT NULL DEFAULT 1,
      notify_contract INTEGER NOT NULL DEFAULT 1,
      notify_calendar INTEGER NOT NULL DEFAULT 0,
      stripe_fee_percent TEXT DEFAULT '3',
      default_deposit_amount TEXT DEFAULT '500',
      currency TEXT DEFAULT 'USD',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  saveDb();
}

function migrateUserSettingsColumns() {
  const result = _db.exec('PRAGMA table_info(user_settings);');
  if (!result || !result[0]) return;
  const { columns, values } = result[0];
  const ni = columns.indexOf('name');
  if (ni < 0) return;
  const existing = new Set(values.map((row) => row[ni]));
  const add = (name, defSql) => {
    if (!existing.has(name)) {
      _db.run(`ALTER TABLE user_settings ADD COLUMN ${name} ${defSql};`);
      existing.add(name);
    }
  };
  add('company_type', "TEXT DEFAULT 'Photography'");
  add('brand_color', "TEXT DEFAULT '#a21caf'");
  add('email_signature', 'TEXT');
  add('tax_home_state', 'TEXT');
  add('tax_ytd_expenses', 'REAL DEFAULT 0');
  add('tax_filing_status', "TEXT DEFAULT 'single'");
  add('tax_entity_type', "TEXT DEFAULT 'sole_prop'");
  add('tax_sales_tax_rate', 'REAL DEFAULT 0');
  add('gmail_sender_address', 'TEXT');
  add('gmail_app_password_enc', 'TEXT');
  add('business_logo_data_url', 'TEXT');
  saveDb();
}

function migrateSquareSettingsColumns() {
  const appInfo = _db.exec('PRAGMA table_info(app_settings);');
  if (appInfo && appInfo[0]) {
    const ni = appInfo[0].columns.indexOf('name');
    if (ni >= 0) {
      const names = new Set(appInfo[0].values.map((r) => r[ni]));
      if (!names.has('square_webhook_signature_key_enc')) {
        _db.run('ALTER TABLE app_settings ADD COLUMN square_webhook_signature_key_enc TEXT;');
      }
      if (!names.has('square_webhook_notification_url')) {
        _db.run('ALTER TABLE app_settings ADD COLUMN square_webhook_notification_url TEXT;');
      }
    }
  }
  const userInfo = _db.exec('PRAGMA table_info(user_settings);');
  if (userInfo && userInfo[0]) {
    const ni = userInfo[0].columns.indexOf('name');
    if (ni >= 0) {
      const existing = new Set(userInfo[0].values.map((r) => r[ni]));
      const add = (name, defSql) => {
        if (!existing.has(name)) {
          _db.run(`ALTER TABLE user_settings ADD COLUMN ${name} ${defSql};`);
          existing.add(name);
        }
      };
      add('square_access_token_enc', 'TEXT');
      add('square_location_id', 'TEXT');
      add('square_environment', "TEXT DEFAULT 'sandbox'");
    }
  }
  saveDb();
}

/** Key/value secrets (e.g. SYNC_SECRET). Separate from singleton app_settings row. */
function migrateAppSecretKv() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS app_secret_kv (
      key TEXT PRIMARY KEY,
      value_enc TEXT NOT NULL
    );
  `);
  _db.run(`DELETE FROM app_secret_kv WHERE key IN ('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET');`);
  saveDb();
}

function migratePaymentsTaxEstimates() {
  const result = _db.exec('PRAGMA table_info(payments);');
  if (!result || !result[0]) return;
  const { columns, values } = result[0];
  const ni = columns.indexOf('name');
  if (ni < 0) return;
  const existing = new Set(values.map((row) => row[ni]));
  const add = (name, defSql) => {
    if (!existing.has(name)) {
      _db.run(`ALTER TABLE payments ADD COLUMN ${name} ${defSql};`);
      existing.add(name);
    }
  };
  add('est_sales_tax', 'REAL DEFAULT 0');
  add('est_se_tax', 'REAL DEFAULT 0');
  add('est_federal_tax', 'REAL DEFAULT 0');
  add('est_state_tax', 'REAL DEFAULT 0');
  saveDb();
}

function migratePaymentsSquareIds() {
  const result = _db.exec('PRAGMA table_info(payments);');
  if (!result || !result[0]) return;
  const { columns, values } = result[0];
  const ni = columns.indexOf('name');
  if (ni < 0) return;
  const existing = new Set(values.map((row) => row[ni]));
  const add = (name, defSql) => {
    if (!existing.has(name)) {
      _db.run(`ALTER TABLE payments ADD COLUMN ${name} ${defSql};`);
      existing.add(name);
    }
  };
  add('square_order_id', 'TEXT');
  add('square_payment_id', 'TEXT');
  try {
    if (existing.has('stripe_session_id')) {
      _db.run(
        `UPDATE payments SET square_order_id = stripe_session_id WHERE (square_order_id IS NULL OR square_order_id = '') AND stripe_session_id IS NOT NULL`
      );
    }
    if (existing.has('stripe_payment_intent')) {
      _db.run(
        `UPDATE payments SET square_payment_id = stripe_payment_intent WHERE (square_payment_id IS NULL OR square_payment_id = '') AND stripe_payment_intent IS NOT NULL`
      );
    }
  } catch (_) {
    /* ignore */
  }
  try {
    _db.run(`UPDATE payments SET method = 'Square' WHERE method = 'Stripe'`);
  } catch (_) {
    /* ignore */
  }
  saveDb();
}

function migrateInvoices() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_id INTEGER,
      booking_id INTEGER,
      title TEXT NOT NULL DEFAULT 'Invoice',
      summary TEXT,
      invoice_number TEXT,
      po_number TEXT,
      invoice_date TEXT NOT NULL,
      payment_due_date TEXT,
      payment_terms_label TEXT,
      subtotal REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'none',
      discount_value REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      notes_terms TEXT,
      footer TEXT,
      logo_data_url TEXT,
      status TEXT DEFAULT 'draft',
      discount_label TEXT,
      public_token TEXT,
      retainer_amount REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
    );
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );
  `);
  saveDb();
}

function migrateInvoiceExtensions() {
  const { v4: uuidv4 } = require('uuid');
  _db.run(`
    CREATE TABLE IF NOT EXISTS invoice_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );
  `);

  const invInfo = _db.exec('PRAGMA table_info(invoices);');
  if (invInfo && invInfo[0]) {
    const nameIdx = invInfo[0].columns.indexOf('name');
    if (nameIdx >= 0) {
      const colnames = new Set(invInfo[0].values.map((r) => r[nameIdx]));
      if (!colnames.has('discount_label')) _db.run('ALTER TABLE invoices ADD COLUMN discount_label TEXT;');
      if (!colnames.has('public_token')) _db.run('ALTER TABLE invoices ADD COLUMN public_token TEXT;');
      if (!colnames.has('retainer_amount')) _db.run('ALTER TABLE invoices ADD COLUMN retainer_amount REAL;');
    }
  }

  const rows = prepare(
    "SELECT id FROM invoices WHERE public_token IS NULL OR TRIM(COALESCE(public_token,'')) = ''"
  ).all();
  for (const r of rows) {
    prepare('UPDATE invoices SET public_token = ? WHERE id = ?').run(uuidv4(), r.id);
  }
  saveDb();
}

function migratePackageTemplates() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS package_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      display_title TEXT,
      icon TEXT,
      tagline TEXT,
      features TEXT NOT NULL DEFAULT '[]',
      coverage_heading TEXT,
      coverage_items TEXT,
      suggested_price REAL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const bookingInfo = _db.exec('PRAGMA table_info(bookings);');
  if (bookingInfo && bookingInfo[0]) {
    const ni = bookingInfo[0].columns.indexOf('name');
    if (ni >= 0) {
      const bcols = new Set(bookingInfo[0].values.map((row) => row[ni]));
      if (!bcols.has('package_template_id')) {
        _db.run('ALTER TABLE bookings ADD COLUMN package_template_id INTEGER;');
      }
    }
  }

  saveDb();
}

function migratePortalPackageJson() {
  const bookingInfo = _db.exec('PRAGMA table_info(bookings);');
  if (bookingInfo && bookingInfo[0]) {
    const ni = bookingInfo[0].columns.indexOf('name');
    if (ni >= 0) {
      const bcols = new Set(bookingInfo[0].values.map((row) => row[ni]));
      if (!bcols.has('portal_package_json')) {
        _db.run('ALTER TABLE bookings ADD COLUMN portal_package_json TEXT;');
      }
    }
  }
  saveDb();
}

function migrateBookingOrigin() {
  const bookingInfo = _db.exec('PRAGMA table_info(bookings);');
  if (bookingInfo && bookingInfo[0]) {
    const ni = bookingInfo[0].columns.indexOf('name');
    if (ni >= 0) {
      const bcols = new Set(bookingInfo[0].values.map((row) => row[ni]));
      if (!bcols.has('origin')) {
        _db.run(`ALTER TABLE bookings ADD COLUMN origin TEXT NOT NULL DEFAULT 'local';`);
      }
    }
  }
  saveDb();
}

function migrateBookingTermsTemplates() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS booking_terms_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  saveDb();
}

function migrateUserPaymentPortal() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS user_payment_portal (
      user_id INTEGER PRIMARY KEY,
      zelle_instructions TEXT,
      zelle_qr_data_url TEXT,
      zelle_copy_text TEXT,
      cashapp_instructions TEXT,
      cashapp_qr_data_url TEXT,
      cashapp_copy_text TEXT,
      venmo_instructions TEXT,
      venmo_qr_data_url TEXT,
      venmo_copy_text TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const ptInfo = _db.exec('PRAGMA table_info(user_payment_portal);');
  if (ptInfo && ptInfo[0]) {
    const ni = ptInfo[0].columns.indexOf('name');
    if (ni >= 0) {
      const pcols = new Set(ptInfo[0].values.map((row) => row[ni]));
      const add = (col) => {
        if (!pcols.has(col)) {
          _db.run(`ALTER TABLE user_payment_portal ADD COLUMN ${col} TEXT;`);
          pcols.add(col);
        }
      };
      add('zelle_copy_text');
      add('cashapp_copy_text');
      add('venmo_copy_text');
    }
  }
  saveDb();
}

function migrateEmailTemplates() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  saveDb();
}

const db = { prepare, exec, init };
module.exports = db;


// ─── Default contract templates ──────────────────────────────────────────────
function getPhotoContract() {
  return `PHOTOGRAPHY SERVICES AGREEMENT

This Photography Services Agreement is entered into between the photographer ("Photographer") and the client ("Client") identified in the booking details.

1. SERVICES
Photographer agrees to provide photography services as described in the booking package for the event date specified.

2. PAYMENT
Client agrees to pay the total package price. A deposit is required to secure the date and is non-refundable.

3. COPYRIGHT
Photographer retains copyright of all images. Client receives a personal-use license for delivered images.

4. DELIVERY
Final edited images will be delivered within 2–4 weeks of the event date via online gallery.

5. CANCELLATION
Cancellations made less than 30 days before the event forfeit the deposit. Cancellations within 14 days forfeit 50% of the total package price.

6. LIMITATION OF LIABILITY
Liability is limited to a refund of payments made in the event of circumstances beyond the Photographer's control.

By signing below, Client agrees to all terms of this Agreement.`;
}

function getWeddingContract() {
  return `WEDDING PHOTOGRAPHY & VIDEOGRAPHY AGREEMENT

This Agreement is between the Photographer/Videographer and the couple ("Clients") for wedding coverage services.

1. COVERAGE
Photographer will provide coverage as specified in the selected wedding package including ceremony and reception.

2. PAYMENT SCHEDULE
- Retainer (non-refundable): Due upon signing
- Remaining balance: Due 7 days before the wedding date

3. TIMELINE
Clients agree to provide a detailed day-of timeline at least 2 weeks before the wedding. Overtime is billed at $200/hour.

4. DELIVERY
Digital gallery: 4–6 weeks after the event. Video highlights: 6–8 weeks after the event.

5. FORCE MAJEURE
In the event of illness or emergency, Photographer will make every effort to find an equivalent replacement.

By signing, Clients agree to all terms of this Wedding Agreement.`;
}

function getVideoContract() {
  return `VIDEO PRODUCTION SERVICES AGREEMENT

This Agreement is between the Videographer ("Producer") and the client ("Client").

1. PRODUCTION SERVICES
Producer will provide video production services as specified, including filming, editing, and delivery of final content.

2. REVISIONS
Package includes up to 2 rounds of revisions. Additional revisions are billed at $75/hour.

3. DELIVERY FORMAT
Final video delivered in 4K/1080p MP4 format via download link. Raw footage not included unless specified.

4. INTELLECTUAL PROPERTY
Producer retains all rights to the video content and may use footage for portfolio purposes unless Client requests otherwise in writing.

By signing, Client agrees to all terms of this Video Production Agreement.`;
}
