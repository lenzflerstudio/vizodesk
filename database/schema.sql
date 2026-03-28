-- VizoDesk Database Schema

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Users (admin accounts)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Contract Templates
CREATE TABLE IF NOT EXISTS contract_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Uploaded PDF contracts (library)
CREATE TABLE IF NOT EXISTS contract_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  original_filename TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Saved package offerings (deliverables shown on client portal when linked to a booking)
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

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_date TEXT NOT NULL,
  package TEXT NOT NULL,
  package_template_id INTEGER,
  event_time_range TEXT,
  venue_address TEXT,
  deposit_amount REAL DEFAULT 0,
  direct_price REAL NOT NULL,
  square_price REAL NOT NULL,
  remaining_amount REAL DEFAULT 0,
  final_due_date TEXT,
  square_deposit REAL DEFAULT 0,
  square_remaining REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'direct', -- 'direct' | 'card'
  status TEXT DEFAULT 'Pending', -- Pending | Signed | Paid
  payment_status TEXT DEFAULT 'Unpaid', -- Unpaid | Partial | Paid
  public_token TEXT UNIQUE NOT NULL,
  terms_and_conditions TEXT,
  notes TEXT,
  contract_upload_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (contract_upload_id) REFERENCES contract_uploads(id) ON DELETE SET NULL,
  FOREIGN KEY (package_template_id) REFERENCES package_templates(id) ON DELETE SET NULL
);

-- Contracts
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER UNIQUE NOT NULL,
  template_id INTEGER,
  template_name TEXT NOT NULL,
  content TEXT NOT NULL,
  pdf_path TEXT,
  signature_data TEXT, -- Base64 PNG data URL
  signed_at DATETIME,
  status TEXT DEFAULT 'Pending', -- Pending | Signed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES contract_templates(id)
);

-- Singleton app settings (self-hosted / white-label)
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  client_portal_base_url TEXT,
  square_webhook_signature_key_enc TEXT,
  square_webhook_notification_url TEXT
);

-- Encrypted integration secrets (e.g. SYNC_SECRET); not the singleton app_settings row above
CREATE TABLE IF NOT EXISTS app_secret_kv (
  key TEXT PRIMARY KEY,
  value_enc TEXT NOT NULL
);

-- Invoices (Wave-style billing; independent from payment records)
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
  public_token TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);

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

-- Client portal: bank payment instructions + optional QR (data URL or https) per method
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

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL, -- Zelle | Cash App | Venmo | Square
  square_order_id TEXT,
  square_payment_id TEXT,
  status TEXT DEFAULT 'Pending', -- Pending | Completed
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- Internal template seed user (removed at runtime by server/db.js when applying schema; not a real account)
INSERT OR IGNORE INTO users (id, email, password_hash, name) VALUES (0, 'system@example.invalid', 'system', 'System');
