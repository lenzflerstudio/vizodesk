const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const { getDefaultPhotoVideoTerms, getStarterSocialRetainerTerms } = require('../lib/bookingTermsDefaults');

const MAX_NAME = 160;
const MAX_CONTENT = 500000;

function seedUserBookingTermsIfEmpty(userId) {
  const row = db.prepare('SELECT COUNT(*) as c FROM booking_terms_templates WHERE user_id = ?').get(userId);
  if (!row || Number(row.c) > 0) return;
  const ins = db.prepare(
    `INSERT INTO booking_terms_templates (user_id, name, content, sort_order) VALUES (?, ?, ?, ?)`
  );
  ins.run(userId, 'Photo & video — standard', getDefaultPhotoVideoTerms(), 0);
  ins.run(userId, 'Social & retainer (starter)', getStarterSocialRetainerTerms(), 1);
}

router.get('/', auth, (req, res) => {
  try {
    seedUserBookingTermsIfEmpty(req.userId);
    const rows = db
      .prepare(
        `SELECT id, name, content, sort_order, created_at
         FROM booking_terms_templates WHERE user_id = ?
         ORDER BY sort_order ASC, name ASC`
      )
      .all(req.userId);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load terms templates' });
  }
});

router.post('/', auth, (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, MAX_NAME);
    const content = String(req.body?.content ?? '').slice(0, MAX_CONTENT);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!content.trim()) return res.status(400).json({ error: 'Content is required' });
    const sort_order = Number.isFinite(Number(req.body?.sort_order)) ? Number(req.body.sort_order) : 999;
    const r = db
      .prepare(
        `INSERT INTO booking_terms_templates (user_id, name, content, sort_order) VALUES (?, ?, ?, ?)`
      )
      .run(req.userId, name, content, sort_order);
    const row = db.prepare('SELECT * FROM booking_terms_templates WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create terms template' });
  }
});

router.put('/:id', auth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const existing = db
      .prepare('SELECT id FROM booking_terms_templates WHERE id = ? AND user_id = ?')
      .get(id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const name = String(req.body?.name || '').trim().slice(0, MAX_NAME);
    const content = String(req.body?.content ?? '').slice(0, MAX_CONTENT);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!content.trim()) return res.status(400).json({ error: 'Content is required' });
    const sort_order = Number.isFinite(Number(req.body?.sort_order)) ? Number(req.body.sort_order) : 0;
    db.prepare(
      `UPDATE booking_terms_templates SET name = ?, content = ?, sort_order = ? WHERE id = ? AND user_id = ?`
    ).run(name, content, sort_order, id, req.userId);
    const row = db.prepare('SELECT * FROM booking_terms_templates WHERE id = ?').get(id);
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update terms template' });
  }
});

router.delete('/:id', auth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const r = db.prepare('DELETE FROM booking_terms_templates WHERE id = ? AND user_id = ?').run(id, req.userId);
    if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete terms template' });
  }
});

module.exports = router;
