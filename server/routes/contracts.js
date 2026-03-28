const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const contractUploadService = require('../services/contractUploadService');
const { findBookingByPublicToken } = require('../lib/publicBookingView');
const { notifyLocalAppFireAndForget } = require('../lib/syncCallbackToLocal');

const memoryStorage = multer.memoryStorage();
const uploadPdf = multer({
  storage: memoryStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = file.originalname && file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdfMime && !isPdfExt) {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
});

function mapUploadRow(r) {
  return {
    id: r.id,
    name: r.name,
    filePath: r.file_path,
    createdAt: r.created_at,
    originalFilename: r.original_filename,
  };
}

// ── PDF library (register before /:id) ──────────────────────────────────────

/** GET /api/contracts/uploads — list uploaded PDFs for current user */
router.get('/uploads', auth, (req, res) => {
  try {
    const rows = contractUploadService.listByUser(req.userId);
    res.json(rows.map(mapUploadRow));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

/**
 * GET /api/contracts/files — alias for uploads list (library)
 * Note: GET /api/contracts (no suffix) remains the list of booking contract instances.
 */
router.get('/files', auth, (req, res) => {
  try {
    const rows = contractUploadService.listByUser(req.userId);
    res.json(rows.map(mapUploadRow));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

/** POST /api/contracts/upload — multipart field "file", optional "name" */
router.post('/upload', auth, (req, res) => {
  uploadPdf.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const sig = req.file.buffer.slice(0, 5).toString('utf8');
    if (!sig.startsWith('%PDF')) {
      return res.status(400).json({ error: 'Invalid PDF file' });
    }
    try {
      contractUploadService.ensureDirs();
      const row = contractUploadService.createUpload(
        req.userId,
        req.file.buffer,
        req.file.originalname,
        req.body?.name
      );
      res.status(201).json(mapUploadRow(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to save contract' });
    }
  });
});

/** GET /api/contracts/uploads/:uploadId/file — download / preview (auth) */
router.get('/uploads/:uploadId/file', auth, (req, res) => {
  try {
    const row = contractUploadService.getOwnedUpload(req.userId, req.params.uploadId);
    if (!row) return res.status(404).json({ error: 'Upload not found' });
    const abs = contractUploadService.absolutePath(row.file_path);
    if (!abs) return res.status(404).json({ error: 'Invalid path' });
    const fs = require('fs');
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.name || 'contract')}.pdf"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.resolve(abs));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

/** DELETE /api/contracts/uploads/:uploadId */
router.delete('/uploads/:uploadId', auth, (req, res) => {
  try {
    const check = contractUploadService.canDelete(req.userId, req.params.uploadId);
    if (!check.ok) {
      if (check.reason === 'in_use') {
        return res.status(400).json({ error: 'This contract is linked to a booking and cannot be deleted' });
      }
      return res.status(404).json({ error: 'Upload not found' });
    }
    contractUploadService.removeUpload(check.row);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ── Booking-linked contracts (existing) ─────────────────────────────────────

router.get('/', auth, (req, res) => {
  const contracts = db.prepare(`
    SELECT ct.*, b.id as booking_id, b.public_token, b.event_type, b.event_date, b.package,
           b.client_id, c.full_name as client_name, c.email as client_email
    FROM contracts ct
    JOIN bookings b ON ct.booking_id = b.id
    JOIN clients c ON b.client_id = c.id
    WHERE b.user_id = ?
    ORDER BY ct.created_at DESC
  `).all(req.userId);
  res.json(contracts);
});

router.get('/templates', auth, (req, res) => {
  const templates = db.prepare(
    'SELECT * FROM contract_templates WHERE user_id = ? OR user_id = 0 ORDER BY name ASC'
  ).all(req.userId);
  res.json(templates);
});

router.put('/:bookingToken/sign', (req, res) => {
  const { signature_data } = req.body;
  if (!signature_data) return res.status(400).json({ error: 'Signature required' });

  const booking = findBookingByPublicToken(req.params.bookingToken);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const contract = db.prepare('SELECT * FROM contracts WHERE booking_id = ?').get(booking.id);
  if (!contract) return res.status(404).json({ error: 'No contract found for this booking' });

  db.prepare(`
    UPDATE contracts SET signature_data = ?, signed_at = CURRENT_TIMESTAMP, status = 'Signed'
    WHERE id = ?
  `).run(signature_data, contract.id);

  db.prepare("UPDATE bookings SET status = 'Signed' WHERE id = ? AND status = 'Pending'").run(booking.id);

  notifyLocalAppFireAndForget({
    event: 'contract_signed',
    public_token: booking.public_token,
    signature_data,
  });

  res.json({ success: true, message: 'Contract signed successfully' });
});

/** DELETE /api/contracts/:bookingToken/signature — public; clears signature so client can sign again */
router.delete('/:bookingToken/signature', (req, res) => {
  const booking = findBookingByPublicToken(req.params.bookingToken);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const contract = db.prepare('SELECT * FROM contracts WHERE booking_id = ?').get(booking.id);
  if (!contract) return res.status(404).json({ error: 'No contract found for this booking' });

  db.prepare(`
    UPDATE contracts SET signature_data = NULL, signed_at = NULL, status = 'Pending'
    WHERE id = ?
  `).run(contract.id);

  db.prepare("UPDATE bookings SET status = 'Pending' WHERE id = ? AND status = 'Signed'").run(booking.id);

  notifyLocalAppFireAndForget({
    event: 'contract_signature_cleared',
    public_token: booking.public_token,
  });

  res.json({ success: true });
});

router.post('/templates', auth, (req, res) => {
  const { name, content } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'Name and content are required' });
  const result = db.prepare(
    'INSERT INTO contract_templates (user_id, name, content) VALUES (?, ?, ?)'
  ).run(req.userId, name, content);
  res.status(201).json(db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/templates/:id', auth, (req, res) => {
  const { name, content } = req.body;
  const tpl = db.prepare('SELECT id FROM contract_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  db.prepare('UPDATE contract_templates SET name = ?, content = ? WHERE id = ?').run(name, content, req.params.id);
  res.json(db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id));
});

router.get('/:id', auth, (req, res) => {
  const contract = db.prepare(`
    SELECT ct.* FROM contracts ct
    JOIN bookings b ON ct.booking_id = b.id
    WHERE ct.id = ? AND b.user_id = ?
  `).get(req.params.id, req.userId);
  if (!contract) return res.status(404).json({ error: 'Contract not found' });
  res.json(contract);
});

module.exports = router;
