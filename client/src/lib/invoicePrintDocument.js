import { formatCurrency } from './formatCurrency';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatLongDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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

/**
 * Full invoice HTML for print / Save as PDF (browser print dialog).
 * @param {object} invoice — GET /api/invoices/:id response
 * @param {object} settings — business settings (brand_color, etc.)
 */
export function buildInvoicePrintHtml(invoice, settings) {
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

  const lines = (inv.line_items || [])
    .map((row) => {
      const amt = Number(row.amount) || 0;
      return `<tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(row.description || '—')}</td>
        <td style="text-align:right;padding:10px 8px;border-bottom:1px solid #e5e7eb">${row.quantity}</td>
        <td style="text-align:right;padding:10px 8px;border-bottom:1px solid #e5e7eb">${formatCurrency(row.unit_price)}</td>
        <td style="text-align:right;padding:10px 8px;border-bottom:1px solid #e5e7eb;font-weight:600">${formatCurrency(amt)}</td>
      </tr>`;
    })
    .join('');

  const discAmt = Number(inv.discount_amount) || 0;
  const discLabel = inv.discount_label && String(inv.discount_label).trim();
  const showDisc = discAmt > 0 && discLabel;

  const paymentsHtml = (inv.invoice_payments || [])
    .map((p) => `<p style="font-size:12px;color:#6b7280;margin:6px 0 0">${escapeHtml(paymentSentence(p))}</p>`)
    .join('');

  const amountDue = Number(inv.amount_remaining) || 0;
  const subtotal = Number(inv.subtotal) || 0;
  const total = Number(inv.total) || 0;
  const cur = inv.currency || 'USD';

  const billName = escapeHtml(inv.client_name || '—');
  const billPhone = inv.client_phone ? escapeHtml(inv.client_phone) : '';
  const billEmail = inv.client_email ? escapeHtml(inv.client_email) : '';
  const billExtra =
    (billPhone ? `<p>${billPhone}</p>` : '') + (billEmail ? `<p>${billEmail}</p>` : '');

  const title = escapeHtml((inv.title || 'Invoice').toUpperCase());
  const invNo = escapeHtml(inv.invoice_number || `#${inv.id}`);

  const logoSrc =
    typeof inv.logo_data_url === 'string' && inv.logo_data_url.startsWith('data:image/')
      ? inv.logo_data_url.replace(/"/g, '&quot;')
      : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Invoice ${invNo}</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:24px auto;color:#111;line-height:1.5;padding:0 12px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
    @media(max-width:640px){.grid2{grid-template-columns:1fr}}
    h1{font-size:1.75rem;margin:0 0 4px;letter-spacing:.02em}
    .sub{color:#5b21b6;font-size:0.95rem;margin:0 0 12px}
    .biz{font-size:14px;color:#374151}
    .bill{font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.06em;margin-bottom:8px}
    table.items{width:100%;border-collapse:collapse;margin:16px 0;border-radius:8px 8px 0 0;overflow:hidden}
    table.items thead th{background:${accent};color:#fff;padding:10px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;text-align:left}
    table.items thead th.num{text-align:right}
    .box{background:#f3f4f6;padding:10px 12px;border-radius:8px;margin-top:8px;font-size:14px}
    .tot{display:flex;justify-content:space-between;max-width:280px;margin-left:auto;margin-top:6px;font-size:14px}
    .due-big{display:flex;justify-content:space-between;max-width:280px;margin-left:auto;margin-top:16px;padding-top:12px;border-top:1px solid #d1d5db;font-weight:700;font-size:1.15rem}
    .disc{color:#047857}
    @media print{.no-print{display:none!important}}
  </style></head><body>
  <div class="no-print" style="margin-bottom:16px;display:flex;gap:8px;align-items:center">
    <button type="button" onclick="window.print()">Print or Save as PDF</button>
    <span style="font-size:12px;color:#6b7280">Use your browser’s print dialog → “Save as PDF”.</span>
  </div>
  <div class="grid2">
    <div>${logoSrc ? `<img src="${logoSrc}" alt="" style="max-height:72px;object-fit:contain"/>` : ''}</div>
    <div style="text-align:right">
      <h1>${title}</h1>
      ${inv.summary ? `<p class="sub">${escapeHtml(inv.summary)}</p>` : ''}
      <div class="biz" style="text-align:right">${bizLines.map(escapeHtml).join('<br/>')}</div>
    </div>
  </div>
  <div class="grid2">
    <div>
      <div class="bill">BILL TO</div>
      <div class="biz"><p style="font-weight:600">${billName}</p>${billExtra}</div>
    </div>
    <div style="text-align:right;font-size:14px">
      <div style="display:flex;justify-content:flex-end;gap:16px;margin-bottom:6px"><span style="color:#6b7280">Invoice number</span><span style="font-weight:600">${invNo}</span></div>
      <div style="display:flex;justify-content:flex-end;gap:16px;margin-bottom:6px"><span style="color:#6b7280">Invoice date</span><span>${escapeHtml(formatLongDate(inv.invoice_date))}</span></div>
      <div style="display:flex;justify-content:flex-end;gap:16px;margin-bottom:6px"><span style="color:#6b7280">Payment due</span><span>${escapeHtml(formatLongDate(inv.payment_due_date))}</span></div>
      ${inv.po_number ? `<div style="display:flex;justify-content:flex-end;gap:16px;margin-bottom:6px"><span style="color:#6b7280">P.O./S.O.</span><span>${escapeHtml(inv.po_number)}</span></div>` : ''}
      <div class="box" style="text-align:right">
        <span style="color:#6b7280;font-size:11px;text-transform:uppercase">Amount due (${escapeHtml(cur)})</span><br/>
        <span style="font-size:1.25rem;font-weight:700">${formatCurrency(amountDue)}</span>
      </div>
    </div>
  </div>
  <table class="items">
    <thead><tr><th>Items</th><th class="num">Quantity</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
    <tbody>${lines}</tbody>
  </table>
  <div class="tot"><span style="color:#6b7280">Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
  ${showDisc ? `<div class="tot disc"><span>${escapeHtml(discLabel)}</span><span>(${formatCurrency(discAmt)})</span></div>` : ''}
  <div class="tot" style="margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb"><span>Total</span><span><strong>${formatCurrency(total)}</strong></span></div>
  ${paymentsHtml}
  <div class="due-big"><span>Amount due (${escapeHtml(cur)})</span><span>${formatCurrency(amountDue)}</span></div>
  ${inv.notes_terms ? `<div style="margin-top:28px;font-size:13px"><strong>Notes / Terms</strong><pre style="white-space:pre-wrap;font-family:inherit;margin-top:8px;color:#374151">${escapeHtml(inv.notes_terms)}</pre></div>` : ''}
  ${inv.footer ? `<div style="margin-top:20px;font-size:12px;color:#6b7280;border-top:1px solid #eee;padding-top:14px">${escapeHtml(inv.footer)}</div>` : ''}
  </body></html>`;
}
