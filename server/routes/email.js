const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const auth = require('../middleware/auth');
const db = require('../db');
const { getResolvedClientPortalBaseUrl, validateClientPortalBaseUrl } = require('../lib/clientPortalUrl');
const { decryptAppSecret } = require('../lib/appSecretCrypto');
const contractUploadService = require('../services/contractUploadService');

const router = express.Router();

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeFilename(name) {
  return String(name || 'contract')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .slice(0, 80) || 'contract';
}

function portalUrlFor(segment, token) {
  const base = getResolvedClientPortalBaseUrl();
  if (!base) return null;
  const v = validateClientPortalBaseUrl(base);
  if (!v.ok || v.empty) return null;
  return `${v.normalized}/${segment}/${encodeURIComponent(token)}`;
}

function simpleEmailValid(s) {
  const t = String(s || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function getGmailOutbound(userId) {
  const row = db
    .prepare('SELECT gmail_sender_address, gmail_app_password_enc FROM user_settings WHERE user_id = ?')
    .get(userId);
  const addr = row?.gmail_sender_address && String(row.gmail_sender_address).trim();
  if (!addr || !row?.gmail_app_password_enc) {
    return { error: 'Add your Gmail address and app password under Settings → Email → Send from Gmail.' };
  }
  const pass = decryptAppSecret(row.gmail_app_password_enc);
  if (!pass) {
    return { error: 'Could not read your saved Gmail app password. Open Settings and enter it again.' };
  }
  const transport = nodemailer.createTransport({
    service: 'Gmail',
    auth: { user: addr, pass },
  });
  return { transport, from: addr };
}

/**
 * POST /send-documents
 * Outbound only (no inbox). At least one of invoice_id, contract_id.
 * Body: { to?, invoice_id?, contract_id?, subject?, message?, include_invoice?, include_contract? }
 */
router.post('/send-documents', auth, async (req, res) => {
  try {
    const outbound = getGmailOutbound(req.userId);
    if (outbound.error) return res.status(400).json({ error: outbound.error });

    const invoiceId =
      req.body.invoice_id !== undefined && req.body.invoice_id !== null && req.body.invoice_id !== ''
        ? parseInt(req.body.invoice_id, 10)
        : null;
    const contractId =
      req.body.contract_id !== undefined && req.body.contract_id !== null && req.body.contract_id !== ''
        ? parseInt(req.body.contract_id, 10)
        : null;

    const wantInvoice = req.body.include_invoice !== false;
    const wantContract = req.body.include_contract !== false;

    if ((!invoiceId || !wantInvoice) && (!contractId || !wantContract)) {
      return res.status(400).json({ error: 'Choose at least one of invoice or contract to include.' });
    }

    let inv = null;
    if (invoiceId && wantInvoice) {
      inv = db
        .prepare(
          `SELECT i.*, c.full_name AS client_name, c.email AS client_email
           FROM invoices i
           LEFT JOIN clients c ON i.client_id = c.id
           WHERE i.id = ? AND i.user_id = ?`
        )
        .get(invoiceId, req.userId);
      if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    }

    let ct = null;
    if (contractId && wantContract) {
      ct = db
        .prepare(
          `SELECT ct.*, b.public_token, b.client_id, b.id AS booking_id,
                  c.email AS client_email, c.full_name AS client_name
           FROM contracts ct
           JOIN bookings b ON ct.booking_id = b.id
           JOIN clients c ON b.client_id = c.id
           WHERE ct.id = ? AND b.user_id = ?`
        )
        .get(contractId, req.userId);
      if (!ct) return res.status(404).json({ error: 'Contract not found' });
    }

    if (inv && ct && Number(inv.client_id) !== Number(ct.client_id)) {
      return res.status(400).json({ error: 'Invoice and contract must belong to the same client.' });
    }

    const toRaw = req.body.to != null ? String(req.body.to).trim() : '';
    const fallbackEmail = (inv?.client_email || ct?.client_email || '').trim();
    const to = toRaw || fallbackEmail;
    if (!to) return res.status(400).json({ error: 'Add an email address for this client, or enter To manually.' });
    if (!simpleEmailValid(to)) return res.status(400).json({ error: 'Invalid recipient email address.' });

    const settings = db.prepare('SELECT business_name, email_signature FROM user_settings WHERE user_id = ?').get(req.userId);
    const bizName = (settings?.business_name || 'VizoDesk').trim() || 'VizoDesk';
    const sig = (settings?.email_signature || '').trim();

    const subjectDefaultParts = [];
    if (inv && wantInvoice) subjectDefaultParts.push('invoice');
    if (ct && wantContract) subjectDefaultParts.push('contract');
    const defaultSubject = `Your ${subjectDefaultParts.join(' & ')} from ${bizName}`;

    const subject =
      String(req.body.subject || '')
        .trim()
        .slice(0, 200) || defaultSubject;

    const messagePlain = String(req.body.message || '').replace(/\r\n/g, '\n').slice(0, 8000);
    const messageHtml = messagePlain
      ? `<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(messagePlain)}</p>`
      : '';

    const blocks = [];
    if (inv && wantInvoice) {
      const token = inv.public_token && String(inv.public_token).trim();
      const href = token ? portalUrlFor('invoice', token) : null;
      if (href) {
        blocks.push(
          `<p style="margin:12px 0"><strong>Invoice</strong> (${escapeHtml(inv.invoice_number || `#${inv.id}`)})</p>
           <p style="margin:0 0 8px">View and pay online:</p>
           <p style="margin:0"><a href="${escapeHtml(href)}">${escapeHtml(href)}</a></p>`
        );
      } else {
        blocks.push(
          `<p style="margin:12px 0"><strong>Invoice</strong> (${escapeHtml(inv.invoice_number || `#${inv.id}`)})</p>
           <p style="margin:0;color:#666">This invoice does not have a share link yet. Add your Client Portal URL in Settings and ensure the invoice is saved.</p>`
        );
      }
    }

    const attachments = [];
    if (ct && wantContract) {
      const tok = ct.public_token && String(ct.public_token).trim();
      const signHref = tok ? portalUrlFor('contract', tok) : null;
      let pdfAttached = false;
      if (ct.pdf_path) {
        const abs = contractUploadService.absolutePath(ct.pdf_path);
        if (abs && fs.existsSync(abs)) {
          attachments.push({
            filename: `${safeFilename(ct.template_name)}.pdf`,
            path: path.resolve(abs),
          });
          pdfAttached = true;
        }
      }
      let contractHtml = `<p style="margin:12px 0"><strong>Contract</strong> (${escapeHtml(ct.template_name || 'Agreement')})</p>`;
      if (pdfAttached) {
        contractHtml += `<p style="margin:0 0 8px">The agreement PDF is attached. You can also open your client page to review or sign:</p>`;
      } else {
        contractHtml += `<p style="margin:0 0 8px">Open your client page to review or sign:</p>`;
      }
      if (signHref) {
        contractHtml += `<p style="margin:0"><a href="${escapeHtml(signHref)}">${escapeHtml(signHref)}</a></p>`;
      } else {
        contractHtml += `<p style="margin:0;color:#666">Set your Client Portal URL in Settings to include a signing link.</p>`;
      }
      blocks.push(contractHtml);
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;max-width:560px">
        ${messageHtml}
        ${blocks.join('')}
        ${sig ? `<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/><div style="font-size:13px;color:#444;white-space:pre-wrap">${escapeHtml(sig).replace(/\n/g, '<br/>')}</div>` : ''}
        </body></html>`;

    await outbound.transport.sendMail({
      from: outbound.from,
      to,
      subject,
      html,
      attachments: attachments.length ? attachments : undefined,
    });

    return res.json({ success: true, sent: true });
  } catch (err) {
    console.error(err);
    const msg = err?.response || err?.message || '';
    const hint =
      String(msg).includes('Invalid login') || String(msg).includes('535')
        ? ' Gmail rejected the login. Use an App Password (not your normal password) and ensure the sender address matches that Google account.'
        : '';
    return res.status(500).json({ error: `Failed to send email.${hint ? ` ${hint}` : ''}` });
  }
});

module.exports = router;
