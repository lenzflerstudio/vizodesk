const db = require('../db');

function getPaymentPortalRow(userId) {
  return db.prepare('SELECT * FROM user_payment_portal WHERE user_id = ?').get(userId);
}

function serializePaymentPortal(row) {
  const cell = (instructions, qr, copy) => ({
    instructions: instructions || '',
    qr_data_url: qr && String(qr).trim() ? String(qr) : null,
    copy_text: copy && String(copy).trim() ? String(copy).trim() : '',
  });
  if (!row) {
    return {
      zelle: cell('', null, ''),
      cashapp: cell('', null, ''),
      venmo: cell('', null, ''),
    };
  }
  return {
    zelle: cell(row.zelle_instructions, row.zelle_qr_data_url, row.zelle_copy_text),
    cashapp: cell(row.cashapp_instructions, row.cashapp_qr_data_url, row.cashapp_copy_text),
    venmo: cell(row.venmo_instructions, row.venmo_qr_data_url, row.venmo_copy_text),
  };
}

function upsertPaymentPortal(userId, body) {
  const z = body?.zelle || {};
  const c = body?.cashapp || {};
  const v = body?.venmo || {};
  const zi = String(z.instructions ?? '').slice(0, 12000);
  const zq = z.qr_data_url != null && String(z.qr_data_url).trim() !== '' ? String(z.qr_data_url).slice(0, 600000) : null;
  const zx = String(z.copy_text ?? '').trim().slice(0, 500);
  const ci = String(c.instructions ?? '').slice(0, 12000);
  const cq = c.qr_data_url != null && String(c.qr_data_url).trim() !== '' ? String(c.qr_data_url).slice(0, 600000) : null;
  const cx = String(c.copy_text ?? '').trim().slice(0, 500);
  const vi = String(v.instructions ?? '').slice(0, 12000);
  const vq = v.qr_data_url != null && String(v.qr_data_url).trim() !== '' ? String(v.qr_data_url).slice(0, 600000) : null;
  const vx = String(v.copy_text ?? '').trim().slice(0, 500);

  db.prepare(`
    INSERT INTO user_payment_portal (
      user_id,
      zelle_instructions, zelle_qr_data_url, zelle_copy_text,
      cashapp_instructions, cashapp_qr_data_url, cashapp_copy_text,
      venmo_instructions, venmo_qr_data_url, venmo_copy_text
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      zelle_instructions = excluded.zelle_instructions,
      zelle_qr_data_url = excluded.zelle_qr_data_url,
      zelle_copy_text = excluded.zelle_copy_text,
      cashapp_instructions = excluded.cashapp_instructions,
      cashapp_qr_data_url = excluded.cashapp_qr_data_url,
      cashapp_copy_text = excluded.cashapp_copy_text,
      venmo_instructions = excluded.venmo_instructions,
      venmo_qr_data_url = excluded.venmo_qr_data_url,
      venmo_copy_text = excluded.venmo_copy_text
  `).run(userId, zi, zq, zx || null, ci, cq, cx || null, vi, vq, vx || null);
}

module.exports = {
  getPaymentPortalRow,
  serializePaymentPortal,
  upsertPaymentPortal,
};
