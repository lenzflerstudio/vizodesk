/**
 * Contract PDF uploads — disk storage under /uploads/contracts
 */
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const UPLOADS_ROOT = process.env.UPLOADS_ROOT
  ? path.resolve(process.env.UPLOADS_ROOT)
  : path.join(__dirname, '..', '..', 'uploads');
const CONTRACTS_DIR = path.join(UPLOADS_ROOT, 'contracts');

function ensureDirs() {
  if (!fs.existsSync(CONTRACTS_DIR)) {
    fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  }
}

/** Absolute path for a DB-stored relative path e.g. contracts/uuid.pdf */
function absolutePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const normalized = relativePath.replace(/^[/\\]+/, '');
  if (normalized.includes('..')) return null;
  return path.join(UPLOADS_ROOT, normalized);
}

/**
 * Save a PDF buffer to disk and insert contract_uploads row.
 * @param {number} userId
 * @param {Buffer} buffer
 * @param {string} originalFilename
 * @param {string} displayName
 */
function createUpload(userId, buffer, originalFilename, displayName) {
  ensureDirs();
  const id = uuidv4();
  const filename = `${id}.pdf`;
  const relativePath = path.posix.join('contracts', filename);
  const fullPath = path.join(CONTRACTS_DIR, filename);
  fs.writeFileSync(fullPath, buffer);

  const name = (displayName && String(displayName).trim()) || path.basename(originalFilename, path.extname(originalFilename)) || 'Contract';

  const result = db.prepare(
    `INSERT INTO contract_uploads (user_id, name, file_path, original_filename)
     VALUES (?, ?, ?, ?)`
  ).run(userId, name, relativePath.replace(/\\/g, '/'), originalFilename || filename);

  return db.prepare('SELECT * FROM contract_uploads WHERE id = ?').get(result.lastInsertRowid);
}

function listByUser(userId) {
  return db
    .prepare(
      `SELECT id, name, file_path, original_filename, created_at
       FROM contract_uploads
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(userId);
}

function getOwnedUpload(userId, uploadId) {
  const id = parseInt(uploadId, 10);
  if (Number.isNaN(id)) return null;
  return db
    .prepare('SELECT * FROM contract_uploads WHERE id = ? AND user_id = ?')
    .get(id, userId);
}

function getByIdForBooking(userId, uploadId) {
  return getOwnedUpload(userId, uploadId);
}

function canDelete(userId, uploadId) {
  const row = getOwnedUpload(userId, uploadId);
  if (!row) return { ok: false, reason: 'not_found' };
  const used = db
    .prepare('SELECT COUNT(*) as c FROM bookings WHERE contract_upload_id = ?')
    .get(row.id);
  if (used.c > 0) return { ok: false, reason: 'in_use' };
  return { ok: true, row };
}

function removeUpload(row) {
  const abs = absolutePath(row.file_path);
  if (abs && fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs);
    } catch (_) {}
  }
  db.prepare('DELETE FROM contract_uploads WHERE id = ?').run(row.id);
}

module.exports = {
  UPLOADS_ROOT,
  CONTRACTS_DIR,
  ensureDirs,
  absolutePath,
  createUpload,
  listByUser,
  getOwnedUpload,
  getByIdForBooking,
  canDelete,
  removeUpload,
};
