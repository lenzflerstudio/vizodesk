import { formatCurrency } from './formatCurrency';

/**
 * Empty shape for `InvoiceDocumentCard` — no sample names, amounts, or dates.
 * Use as a reference for the data contract; fill from your app state at runtime.
 */
export function createEmptyInvoiceDocumentData() {
  return {
    business: {
      tagline: '',
      name: '',
      lines: [],
      logoUrl: '',
    },
    invoice: {
      title: '',
      number: '',
    },
    client: {
      name: '',
      lines: [],
    },
    meta: {
      invoiceDate: '',
      paymentDueDate: '',
      poNumber: '',
      currencyCode: '',
    },
    items: [],
    summary: {
      subtotal: '',
      discountLabel: '',
      discountAmount: '',
      showDiscount: false,
      retainerLabel: '',
      retainerAmount: '',
      showRetainer: false,
      total: '',
      amountDue: '',
    },
    notesTerms: '',
    footerMessage: '',
  };
}

function formatLongDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function splitDescriptionLines(raw) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return { title: '', detail: '', bullets: [] };
  }
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const title = lines[0] || '';
  const detail = lines[1] || '';
  const bullets = lines.slice(2);
  return { title, detail, bullets };
}

/**
 * Maps invoice editor state + settings into data for `InvoiceDocumentCard`.
 */
export function buildInvoiceDocumentDataFromEditor({
  form,
  settings,
  clientName,
  clientLines = [],
  subtotal,
  discountAmount,
  total,
  amountDue,
  showDiscount,
}) {
  const s = settings || {};
  const bizLines = [];
  if (s.business_phone) bizLines.push(String(s.business_phone));
  if (s.business_email) bizLines.push(String(s.business_email));
  if (s.business_website) bizLines.push(String(s.business_website));

  const retStr = String(form.retainer_amount ?? '').trim();
  const retParsed = retStr ? Math.round(parseFloat(retStr) * 100) / 100 : 0;
  const showRetainer = Number.isFinite(retParsed) && retParsed > 0;
  const totalAfterRetainer = showRetainer ? Math.round(Math.max(0, total - retParsed) * 100) / 100 : total;

  const discLabel = String(form.discount_label || '').trim();
  const showDiscLine = showDiscount && discountAmount > 0 && discLabel;

  const items = (form.line_items || [])
    .filter(
      (row) =>
        String(row.description || '').trim() ||
        Number(row.quantity) > 0 ||
        Number(row.unit_price) > 0
    )
    .map((row) => {
      const amt = Math.round((Number(row.quantity) || 0) * (Number(row.unit_price) || 0) * 100) / 100;
      const { title, detail, bullets } = splitDescriptionLines(row.description);
      return {
        id: String(row._key),
        description: title,
        detail,
        bullets,
        quantity: String(Number(row.quantity) || 0),
        unitPrice: formatCurrency(Number(row.unit_price) || 0),
        amount: formatCurrency(amt),
      };
    });

  const logoUrl = form.logo_data_url || s.business_logo_data_url || '';

  return {
    business: {
      tagline: String(form.summary || '').trim(),
      name: String(s.business_name || '').trim(),
      lines: bizLines,
      logoUrl: typeof logoUrl === 'string' && logoUrl.startsWith('data:') ? logoUrl : String(logoUrl || ''),
    },
    invoice: {
      title: String(form.title || '').trim().toUpperCase(),
      number: String(form.invoice_number || '').trim(),
    },
    client: {
      name: String(clientName || '').trim(),
      lines: (clientLines || []).map((x) => String(x).trim()).filter(Boolean),
    },
    meta: {
      invoiceDate: formatLongDate(form.invoice_date),
      paymentDueDate: formatLongDate(form.payment_due_date),
      poNumber: String(form.po_number || '').trim(),
      currencyCode: String(form.currency || '').trim(),
    },
    items,
    summary: {
      subtotal: formatCurrency(subtotal),
      discountLabel: discLabel,
      discountAmount: showDiscLine ? formatCurrency(discountAmount) : '',
      showDiscount: Boolean(showDiscLine),
      retainerLabel: 'Retainer',
      retainerAmount: showRetainer ? formatCurrency(retParsed) : '',
      showRetainer,
      total: formatCurrency(showRetainer ? totalAfterRetainer : total),
      amountDue: formatCurrency(amountDue),
    },
    notesTerms: String(form.notes_terms || '').trim(),
    footerMessage: String(form.footer || '').trim(),
  };
}
