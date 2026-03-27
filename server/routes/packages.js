const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

/** Maps SQL/JSON garbage like the literal string "null" to real null / empty. */
function normalizeOptionalText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '' || s === 'null' || s === 'undefined') return null;
  return s;
}

function normalizeLabel(v) {
  return normalizeOptionalText(v) ?? '';
}

function parseJsonArray(raw, fallback = []) {
  if (raw == null || raw === '') return [...fallback];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [...fallback];
    return v
      .map((s) => String(s).trim())
      .filter((s) => s && s !== 'null' && s !== 'undefined');
  } catch {
    return [...fallback];
  }
}

function serializeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    label: normalizeLabel(row.label),
    display_title: normalizeOptionalText(row.display_title),
    icon: normalizeOptionalText(row.icon),
    tagline: normalizeOptionalText(row.tagline),
    features: parseJsonArray(row.features),
    coverage_heading: normalizeOptionalText(row.coverage_heading),
    coverage_items: parseJsonArray(row.coverage_items),
    suggested_price: row.suggested_price != null ? Number(row.suggested_price) : null,
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
  };
}

function filterFeatureLines(lines) {
  return lines.map((s) => String(s).trim()).filter((s) => s && s !== 'null' && s !== 'undefined');
}

function normalizeFeaturesInput(body) {
  if (Array.isArray(body.features)) {
    return JSON.stringify(filterFeatureLines(body.features));
  }
  if (typeof body.features === 'string') {
    return JSON.stringify(filterFeatureLines(body.features.split(/\r?\n/)));
  }
  return '[]';
}

function normalizeCoverageItemsInput(body) {
  if (Array.isArray(body.coverage_items)) {
    const j = JSON.stringify(filterFeatureLines(body.coverage_items));
    return j === '[]' ? null : j;
  }
  if (typeof body.coverage_items === 'string') {
    const lines = filterFeatureLines(body.coverage_items.split(/\r?\n/));
    return lines.length === 0 ? null : JSON.stringify(lines);
  }
  return null;
}

// GET /api/packages
router.get('/', auth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM package_templates WHERE user_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(req.userId);
  res.json(rows.map(serializeRow));
});

// POST /api/packages
router.post('/', auth, (req, res) => {
  const label = normalizeLabel(req.body.label);
  if (!label) return res.status(400).json({ error: 'Package label is required' });

  const display_title = req.body.display_title != null ? normalizeOptionalText(req.body.display_title) : null;
  const icon = req.body.icon != null ? normalizeOptionalText(req.body.icon) : null;
  const tagline = req.body.tagline != null ? normalizeOptionalText(req.body.tagline) : null;
  const coverage_heading =
    req.body.coverage_heading != null ? normalizeOptionalText(req.body.coverage_heading) : null;
  const featuresJson = normalizeFeaturesInput(req.body);
  const coverageRaw = normalizeCoverageItemsInput(req.body);
  const coverage_items = coverageRaw === '[]' || coverageRaw === null ? null : coverageRaw;

  let suggested_price = null;
  if (req.body.suggested_price !== undefined && req.body.suggested_price !== null && req.body.suggested_price !== '') {
    const n = Number(req.body.suggested_price);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: 'Suggested price must be a valid number' });
    }
    suggested_price = Math.round(n * 100) / 100;
  }

  const sort_order = parseInt(req.body.sort_order, 10);
  const so = Number.isFinite(sort_order) ? sort_order : 0;

  const result = db
    .prepare(
      `INSERT INTO package_templates
        (user_id, label, display_title, icon, tagline, features, coverage_heading, coverage_items, suggested_price, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.userId,
      label,
      display_title,
      icon,
      tagline,
      featuresJson,
      coverage_heading,
      coverage_items,
      suggested_price,
      so
    );

  const row = db.prepare('SELECT * FROM package_templates WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(serializeRow(row));
});

// PUT /api/packages/:id
router.put('/:id', auth, (req, res) => {
  const existing = db
    .prepare('SELECT * FROM package_templates WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Package not found' });

  const label = req.body.label !== undefined ? normalizeLabel(req.body.label) : normalizeLabel(existing.label);
  if (!label) return res.status(400).json({ error: 'Package label is required' });

  const display_title =
    req.body.display_title !== undefined ? normalizeOptionalText(req.body.display_title) : normalizeOptionalText(existing.display_title);
  const icon = req.body.icon !== undefined ? normalizeOptionalText(req.body.icon) : normalizeOptionalText(existing.icon);
  const tagline =
    req.body.tagline !== undefined ? normalizeOptionalText(req.body.tagline) : normalizeOptionalText(existing.tagline);
  const coverage_heading =
    req.body.coverage_heading !== undefined
      ? normalizeOptionalText(req.body.coverage_heading)
      : normalizeOptionalText(existing.coverage_heading);

  const featuresJson =
    req.body.features !== undefined ? normalizeFeaturesInput(req.body) : existing.features;

  let coverage_items = existing.coverage_items;
  if (req.body.coverage_items !== undefined) {
    const cov = normalizeCoverageItemsInput(req.body);
    coverage_items = cov === null || cov === '[]' ? null : cov;
  }

  let suggested_price = existing.suggested_price;
  if (req.body.suggested_price !== undefined) {
    if (req.body.suggested_price === null || req.body.suggested_price === '') {
      suggested_price = null;
    } else {
      const n = Number(req.body.suggested_price);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: 'Suggested price must be a valid number' });
      }
      suggested_price = Math.round(n * 100) / 100;
    }
  }

  const sort_order =
    req.body.sort_order !== undefined
      ? (() => {
          const so = parseInt(req.body.sort_order, 10);
          return Number.isFinite(so) ? so : 0;
        })()
      : existing.sort_order;

  db.prepare(
    `UPDATE package_templates SET
      label = ?, display_title = ?, icon = ?, tagline = ?, features = ?,
      coverage_heading = ?, coverage_items = ?, suggested_price = ?, sort_order = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    label,
    display_title,
    icon,
    tagline,
    featuresJson,
    coverage_heading,
    coverage_items,
    suggested_price,
    sort_order,
    req.params.id,
    req.userId
  );

  const row = db.prepare('SELECT * FROM package_templates WHERE id = ?').get(req.params.id);
  res.json(serializeRow(row));
});

// DELETE /api/packages/:id
router.delete('/:id', auth, (req, res) => {
  const row = db.prepare('SELECT id FROM package_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Package not found' });
  db.prepare('UPDATE bookings SET package_template_id = NULL WHERE package_template_id = ?').run(req.params.id);
  db.prepare('DELETE FROM package_templates WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ success: true });
});

module.exports = router;
module.exports.serializePackageDetailsPublic = function serializePackageDetailsPublic(row) {
  if (!row) return null;
  const features = parseJsonArray(row.features);
  const coverage_items = parseJsonArray(row.coverage_items);
  const display_title = normalizeOptionalText(row.display_title);
  const tagline = normalizeOptionalText(row.tagline);
  const icon = normalizeOptionalText(row.icon);
  const coverage_heading = normalizeOptionalText(row.coverage_heading);
  const hasContent =
    display_title ||
    tagline ||
    icon ||
    features.length > 0 ||
    (coverage_heading && coverage_items.length > 0);
  if (!hasContent) return null;
  return {
    display_title,
    icon,
    tagline,
    features,
    coverage_heading,
    coverage_items,
  };
};
