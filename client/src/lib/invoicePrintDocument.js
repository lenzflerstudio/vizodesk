import { formatCurrency } from './formatCurrency';
import invoiceCss from '../styles/invoice.css?raw';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeTitle(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatLongDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

const METHOD_FOR_SENTENCE = {
  'Bank payment': 'a bank payment',
  'Bank transfer': 'a bank transfer',
  Card: 'a card payment',
  Check: 'a check',
  Zelle: 'Zelle',
  'Cash App': 'Cash App',
  Venmo: 'Venmo',
};

function paymentSentence(p) {
  const when = formatLongDate(p.paid_at);
  const m = String(p.method || '').trim();
  const using =
    METHOD_FOR_SENTENCE[m] ||
    (m.toLowerCase().startsWith('a ') ? m : m ? `a ${m.toLowerCase()}` : 'a payment');
  return `Payment on ${when} using ${using}: ${formatCurrency(p.amount)}`;
}

function formatLineItemDescriptionHtml(raw) {
  const text = String(raw ?? '').trim() || '—';
  const lines = text.split('\n');
  const first = lines[0];
  const rest = lines.slice(1).join('\n').trim();
  const firstEsc = escapeHtml(first);
  if (!rest) {
    return first === '—' ? firstEsc : `<strong class="inv-doc-item-title">${firstEsc}</strong>`;
  }
  const restEsc = escapeHtml(rest).replace(/\n/g, '<br/>');
  return `<strong class="inv-doc-item-title">${firstEsc}</strong><br/><span class="inv-doc-item-body">${restEsc}</span>`;
}

/**
 * Full invoice HTML for print / Save as PDF (browser or Electron).
 * Styles come from src/styles/invoice.css (imported once via ?raw — single source of truth).
 *
 * @param {object} invoice — GET /api/invoices/:id response
 * @param {object} settings — business settings
 * @param {{ omitEmbeddedToolbar?: boolean }} [options]
 */
export function buildInvoicePrintHtml(invoice, settings, options = {}) {
  const omitEmbeddedToolbar = options.omitEmbeddedToolbar === true;
  const inv = invoice || {};
  const s = settings || {};
  const accent =
    s.brand_color && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(s.brand_color))
      ? String(s.brand_color).toLowerCase()
      : '#6d28d9';

  const bizLines = [];
  if (s.business_name) bizLines.push(s.business_name);
  bizLines.push('United States');
  if (s.business_phone) bizLines.push(s.business_phone);
  if (s.business_website) bizLines.push(s.business_website);
  if (s.business_email) bizLines.push(s.business_email);

  const lineRows = (inv.line_items || [])
    .map((row) => {
      const amt = Number(row.amount) || 0;
      return `<tr>
        <td class="cell-desc">${formatLineItemDescriptionHtml(row.description)}</td>
        <td class="cell-num">${escapeHtml(String(row.quantity ?? ''))}</td>
        <td class="cell-num">${formatCurrency(row.unit_price)}</td>
        <td class="cell-num cell-amt">${formatCurrency(amt)}</td>
      </tr>`;
    })
    .join('');

  const discAmt = Number(inv.discount_amount) || 0;
  const discLabel = inv.discount_label && String(inv.discount_label).trim();
  const showDisc = discAmt > 0 && discLabel;

  const paymentsHtml = (inv.invoice_payments || [])
    .map((p) => `<p class="inv-doc-pay-note">${escapeHtml(paymentSentence(p))}</p>`)
    .join('');

  const subtotal = Number(inv.subtotal) || 0;
  const total = Number(inv.total) || 0;
  const cur = inv.currency || 'USD';

  const retainerRaw = inv.retainer_amount;
  const retainerNum =
    retainerRaw !== undefined && retainerRaw !== null && String(retainerRaw).trim() !== ''
      ? roundMoney(parseFloat(retainerRaw))
      : null;
  const showRetainer = retainerNum != null && !Number.isNaN(retainerNum) && retainerNum > 0;
  const totalAfterRetainer = showRetainer ? roundMoney(Math.max(0, total - retainerNum)) : total;

  const paidFromPayments = roundMoney(
    (inv.invoice_payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
  );
  const amountDue = roundMoney(Math.max(0, totalAfterRetainer - paidFromPayments));

  let summaryHtml;
  if (showRetainer) {
    summaryHtml = `<div class="inv-doc-tot"><span class="inv-doc-tot-muted">Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
${showDisc ? `<div class="inv-doc-tot inv-doc-disc"><span>${escapeHtml(discLabel)}</span><span>(${formatCurrency(discAmt)})</span></div>` : ''}
<div class="inv-doc-retainer"><span>Retainer</span><span>(${formatCurrency(retainerNum)})</span></div>
<div class="inv-doc-tot inv-doc-tot-divider"><span>Total</span><span><strong>${formatCurrency(totalAfterRetainer)}</strong></span></div>
${paymentsHtml}
<div class="inv-doc-due-big"><span>Amount Due (${escapeHtml(cur)})</span><span>${formatCurrency(amountDue)}</span></div>`;
  } else {
    summaryHtml = `<div class="inv-doc-tot"><span class="inv-doc-tot-muted">Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
${showDisc ? `<div class="inv-doc-tot inv-doc-disc"><span>${escapeHtml(discLabel)}</span><span>(${formatCurrency(discAmt)})</span></div>` : ''}
<div class="inv-doc-tot inv-doc-tot-divider"><span>Total</span><span><strong>${formatCurrency(total)}</strong></span></div>
${paymentsHtml}
<div class="inv-doc-due-big"><span>Amount Due (${escapeHtml(cur)})</span><span>${formatCurrency(amountDue)}</span></div>`;
  }

  const billName = escapeHtml(inv.client_name || '—');
  const billPhone = inv.client_phone ? escapeHtml(inv.client_phone) : '';
  const billEmail = inv.client_email ? escapeHtml(inv.client_email) : '';
  const billExtra = (billPhone ? `<p>${billPhone}</p>` : '') + (billEmail ? `<p>${billEmail}</p>` : '');

  const title = escapeHtml(String(inv.title || 'Invoice').toUpperCase());
  const invNo = escapeHtml(inv.invoice_number || `#${inv.id}`);

  const logoRaw =
    typeof inv.logo_data_url === 'string' && inv.logo_data_url.startsWith('data:image/')
      ? inv.logo_data_url
      : typeof s.business_logo_data_url === 'string' && s.business_logo_data_url.startsWith('data:image/')
        ? s.business_logo_data_url
        : '';
  const logoSrc = logoRaw.replace(/"/g, '&quot;');

  const toolbarHtml = omitEmbeddedToolbar
    ? ''
    : `<div class="no-print inv-doc-toolbar">
    <button type="button" onclick="window.print()">Print or Save as PDF</button>
    <span class="inv-doc-toolbar-hint">Use your browser’s print dialog → “Save as PDF”.</span>
  </div>`;

  const notesHtml = inv.notes_terms
    ? `<div class="inv-doc-notes"><strong>Notes / Terms</strong><pre class="inv-doc-notes-pre">${escapeHtml(inv.notes_terms)}</pre></div>`
    : '';

  const footerHtml = inv.footer
    ? `<div class="inv-doc-footer">${escapeHtml(inv.footer)}</div>`
    : '';

  const summaryBlock = inv.summary ? `<p class="inv-doc-sub">${escapeHtml(inv.summary)}</p>` : '';
  const poRow = inv.po_number
    ? `<div class="inv-doc-meta-row"><span class="inv-doc-meta-lbl">P.O./S.O.</span><span class="inv-doc-meta-val">${escapeHtml(inv.po_number)}</span></div>`
    : '';

  const bodyInner = `${toolbarHtml}
<div class="inv-doc-root" style="--inv-accent:${accent}">
  <div class="inv-doc-grid2">
    <div>${logoSrc ? `<img src="${logoSrc}" alt="" class="inv-doc-logo"/>` : ''}</div>
    <div class="inv-doc-right">
      <h1 class="inv-doc-h1">${title}</h1>
      ${summaryBlock}
      <div class="inv-doc-biz inv-doc-biz-right">${bizLines.map(escapeHtml).join('<br/>')}</div>
    </div>
  </div>
  <div class="inv-doc-grid2">
    <div>
      <div class="inv-doc-bill">BILL TO</div>
      <div class="inv-doc-biz"><p class="inv-doc-client-name">${billName}</p>${billExtra}</div>
    </div>
    <div class="inv-doc-right">
      <div class="inv-doc-meta-row"><span class="inv-doc-meta-lbl">Invoice Number:</span><span class="inv-doc-meta-val">${invNo}</span></div>
      <div class="inv-doc-meta-row"><span class="inv-doc-meta-lbl">Invoice Date:</span><span class="inv-doc-meta-val">${escapeHtml(formatLongDate(inv.invoice_date))}</span></div>
      <div class="inv-doc-meta-row"><span class="inv-doc-meta-lbl">Payment Due:</span><span class="inv-doc-meta-val">${escapeHtml(formatLongDate(inv.payment_due_date))}</span></div>
      ${poRow}
      <div class="inv-doc-box">
        <span class="inv-doc-box-label">Amount Due (${escapeHtml(cur)}):</span><br/>
        <span class="inv-doc-box-amount">${formatCurrency(amountDue)}</span>
      </div>
    </div>
  </div>
  <table class="inv-doc-items">
    <colgroup>
      <col class="col-desc" />
      <col class="col-qty" />
      <col class="col-price" />
      <col class="col-amt" />
    </colgroup>
    <thead><tr><th>Items</th><th class="num">Quantity</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
    <tbody>${lineRows}</tbody>
  </table>
  ${summaryHtml}
  ${notesHtml}
  ${footerHtml}
</div>`;

  const docTitle = escapeTitle(String(inv.invoice_number || `#${inv.id}`));

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<title>Invoice ${docTitle}</title>
<style>${invoiceCss}</style></head><body>${bodyInner}</body></html>`;
}

const BLOB_REVOKE_MS = 120_000;

export function openHtmlInBlobWindow(html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    URL.revokeObjectURL(url);
    return { ok: false, window: null };
  }
  setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_MS);
  return { ok: true, window: w };
}

export function printWhenBlobWindowReady(win, delayMs = 300) {
  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
  };
  if (win.document?.readyState === 'complete') {
    setTimeout(runPrint, delayMs);
    return;
  }
  win.addEventListener('load', () => setTimeout(runPrint, delayMs), { once: true });
}
