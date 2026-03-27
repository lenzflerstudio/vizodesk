const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');

// GET /api/clients
router.get('/', auth, (req, res) => {
  const clients = db.prepare(
    'SELECT * FROM clients WHERE user_id = ? ORDER BY full_name ASC'
  ).all(req.userId);
  res.json(clients);
});

// GET /api/clients/:id
router.get('/:id', auth, (req, res) => {
  const client = db.prepare(
    'SELECT * FROM clients WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const bookings = db.prepare(
    'SELECT * FROM bookings WHERE client_id = ? ORDER BY event_date DESC'
  ).all(client.id);
  res.json({ ...client, bookings });
});

// POST /api/clients
router.post('/', auth, (req, res) => {
  const { full_name, email, phone, notes } = req.body;
  if (!full_name) return res.status(400).json({ error: 'Full name is required' });
  const result = db.prepare(
    'INSERT INTO clients (user_id, full_name, email, phone, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(req.userId, full_name, email || null, phone || null, notes || null);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(client);
});

// PUT /api/clients/:id
router.put('/:id', auth, (req, res) => {
  const { full_name, email, phone, notes } = req.body;
  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  db.prepare(
    'UPDATE clients SET full_name = ?, email = ?, phone = ?, notes = ? WHERE id = ?'
  ).run(full_name, email || null, phone || null, notes || null, req.params.id);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

// DELETE /api/clients/:id
router.delete('/:id', auth, (req, res) => {
  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
