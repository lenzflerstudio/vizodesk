import { jsPDF } from 'jspdf';
import { formatCurrency } from './formatCurrency';

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Classify completed payment vs booking (aligned with Payments.jsx paymentKindLabel).
 */
export function receiptPaymentKind(p, booking) {
  if (p.status !== 'Completed') return null;
  const n = String(p.notes || '');
  if (n.includes('Portal: retainer')) return 'retainer';
  if (n.includes('Portal: remaining')) return 'remaining';
  if (p.method === 'Square' || p.method === 'Stripe') {
    const gross = Number(p.amount) || 0;
    const sd = Number(booking.square_deposit ?? booking.stripe_deposit) || 0;
    const sr = Number(booking.square_remaining ?? booking.stripe_remaining) || 0;
    if (sd > 0 && Math.abs(gross - sd) < 0.02) return 'retainer';
    if (sr > 0 && Math.abs(gross - sr) < 0.02) return 'remaining';
    return 'card';
  }
  const dep = Number(booking.deposit_amount) || 0;
  const amt = Number(p.amount) || 0;
  const pkg = Number(booking.direct_price) || 0;
  if (dep > 0 && Math.abs(amt - dep) < 0.02) return 'retainer';
  const rem = Math.max(0, roundMoney(pkg - dep));
  if (rem > 0 && Math.abs(amt - rem) < 0.02) return 'remaining';
  return 'other';
}

function formatPaidDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(iso);
  }
}

function formatLongDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return String(iso);
    }
  }
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function methodPhrase(m) {
  const s = String(m || '').trim();
  if (!s) return 'a bank payment';
  const lower = s.toLowerCase();
  if (lower === 'square') return 'a card payment (Square)';
  if (lower === 'stripe') return 'a card payment (Stripe)';
  if (lower === 'zelle') return 'Zelle';
  if (lower === 'venmo') return 'Venmo';
  if (lower === 'cash app' || lower === 'cashapp') return 'Cash App';
  if (lower === 'check') return 'a check';
  if (lower === 'cash') return 'cash';
  if (lower === 'bank transfer' || lower === 'bank payment') return 'a bank payment';
  return lower.startsWith('a ') ? lower : `a ${lower}`;
}

function completedPayments(booking) {
  const list = Array.isArray(booking.payments) ? booking.payments.filter((p) => p.status === 'Completed') : [];
  return list.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
}

function hexToRgb(hex) {
  const s = String(hex || '').trim();
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(s);
  if (!m) return { r: 109, g: 40, b: 217 };
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function jspdfImageFormat(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.exec(dataUrl);
  if (!m) return 'PNG';
  const t = m[1].toLowerCase();
  if (t === 'jpg' || t === 'jpeg') return 'JPEG';
  if (t === 'webp') return 'WEBP';
  if (t === 'gif') return 'GIF';
  return 'PNG';
}

function loadNaturalSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function fitInBox(maxW, maxH, natW, natH) {
  if (!natW || !natH) return { w: maxW, h: maxH };
  const r = natW / natH;
  const br = maxW / maxH;
  if (r > br) return { w: maxW, h: maxW / r };
  return { w: maxH * r, h: maxH };
}

function paymentSentence(p) {
  const when = formatLongDate(p.created_at);
  const using = methodPhrase(p.method);
  return `Payment on ${when} using ${using}: ${formatCurrency(Number(p.amount) || 0)}`;
}

const PDF_MUTED = [88, 88, 88];

/**
 * Line segments for the Items column: package template (label → display_title → tagline → bullets)
 * or a single fallback title. Omits venue, time range, and address.
 */
function collectPackageItemSegments(booking, colW, pdf) {
  const segments = [];
  const pushText = (raw, opts) => {
    const t = String(raw || '').trim();
    if (!t) return;
    const size = opts.size ?? 9;
    pdf.setFontSize(size);
    const wrapped = pdf.splitTextToSize(t, colW);
    if (wrapped.length) segments.push({ lines: wrapped, ...opts, size });
  };

  const pd = booking.package_details;
  const hasTemplate =
    pd &&
    (pd.label ||
      pd.display_title ||
      pd.tagline ||
      (Array.isArray(pd.features) && pd.features.length > 0) ||
      (pd.coverage_heading && Array.isArray(pd.coverage_items) && pd.coverage_items.length > 0));

  if (hasTemplate) {
    const primary =
      String(pd.label || '').trim() ||
      String(booking.package || '').trim() ||
      String(booking.event_type || '').trim() ||
      'Service';
    pushText(primary, { bold: true, color: [0, 0, 0], size: 10 });
    if (pd.display_title) {
      const dt = String(pd.display_title).trim();
      if (dt && dt.toLowerCase() !== primary.toLowerCase()) {
        pushText(dt, { bold: true, color: [0, 0, 0], size: 9 });
      }
    }
    if (pd.tagline) pushText(pd.tagline, { bold: false, color: PDF_MUTED, size: 8.5 });
    for (const f of pd.features || []) {
      const line = String(f || '').trim();
      if (line) pushText(`• ${line}`, { bold: false, color: PDF_MUTED, size: 8.5 });
    }
    if (pd.coverage_heading && (pd.coverage_items || []).length) {
      pushText(pd.coverage_heading, { bold: true, color: [0, 0, 0], size: 8.5 });
      for (const c of pd.coverage_items) {
        const line = String(c || '').trim();
        if (line) pushText(`• ${line}`, { bold: false, color: PDF_MUTED, size: 8.5 });
      }
    }
    return segments;
  }

  const fallback =
    String(booking.package || '').trim() || String(booking.event_type || '').trim() || 'Service';
  pushText(fallback, { bold: true, color: [0, 0, 0], size: 10 });
  return segments;
}

function countSegmentLines(segments) {
  return segments.reduce((n, s) => n + s.lines.length, 0);
}

function drawPackageItemSegments(pdf, segments, x0, yStart, textLineH) {
  let y = yStart;
  for (const seg of segments) {
    pdf.setFont('helvetica', seg.bold ? 'bold' : 'normal');
    pdf.setFontSize(seg.size ?? 9);
    const c = seg.color || [0, 0, 0];
    pdf.setTextColor(c[0], c[1], c[2]);
    for (const ln of seg.lines) {
      pdf.text(ln, x0, y);
      y += textLineH;
    }
  }
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
  return y;
}

/** Sum of completed retainer payments (capped at package total); used for Subtotal / Retainer / Total lines. */
function retainerCreditAmount(booking, payments) {
  const retPayments = payments.filter((p) => receiptPaymentKind(p, booking) === 'retainer');
  const fromPay = roundMoney(retPayments.reduce((a, p) => a + (Number(p.amount) || 0), 0));
  return Math.min(fromPay, Number(booking.direct_price) || 0);
}

/**
 * Short lines for the in-app modal preview.
 */
export function getReceiptSummaryLines(booking) {
  if (!booking) return [];
  const payments = completedPayments(booking);
  const status = String(booking.payment_status || 'Unpaid');
  const lines = [];

  const retainers = payments.filter((p) => receiptPaymentKind(p, booking) === 'retainer');
  if (retainers.length) {
    const r = retainers[0];
    lines.push(
      `Retainer paid on ${formatPaidDate(r.created_at)} — ${formatCurrency(Number(r.amount) || 0)} (${r.method || 'payment'})`
    );
  }

  if (status === 'Paid' && payments.length) {
    const last = [...payments].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    lines.push(
      `Booking paid in full on ${formatPaidDate(last.created_at)} — ${formatCurrency(Number(last.amount) || 0)} (${last.method || 'payment'})`
    );
  } else if (status !== 'Paid') {
    lines.push(`Balance status: ${status}`);
  }

  if (!lines.length && !payments.length) {
    lines.push('No completed payments on this booking yet.');
  }

  return lines;
}

/**
 * Invoice-style receipt PDF — Lenzfler/Wave layout: INVOICE + company header, package template in Items column.
 */
export async function downloadBookingPaymentReceiptPdf(booking, settings, user) {
  if (!booking) return;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const innerW = pageW - 2 * margin;
  let y = margin;
  const lineH = 5;
  const sectionGap = 8;
  const accent = hexToRgb(settings?.brand_color);
  const cur = String(settings?.currency || 'USD').trim() || 'USD';
  const grayLabel = { r: 136, g: 136, b: 136 };
  const grayLine = 210;
  const grayFill = { r: 245, g: 245, b: 245 };

  const colItemsW = 88;
  const colQtyW = 22;
  const colPriceW = 30;
  const colAmtW = innerW - colItemsW - colQtyW - colPriceW;
  const xItems = margin;
  const xQty = xItems + colItemsW;
  const xPrice = xQty + colQtyW;
  const xAmt = xPrice + colPriceW;

  const ensureSpace = (needed = lineH) => {
    if (y + needed > pageH - 16) {
      pdf.addPage();
      y = margin;
    }
  };

  const businessName = settings?.business_name?.trim() || user?.name || 'VizoDesk';
  const companyType = settings?.company_type?.trim() || '';
  const phone = settings?.business_phone?.trim() || '';
  const website = settings?.business_website?.trim() || '';
  const email = settings?.business_email?.trim() || user?.email || '';
  const logoUrl =
    typeof settings?.business_logo_data_url === 'string' && settings.business_logo_data_url.startsWith('data:image/')
      ? settings.business_logo_data_url
      : null;

  let logoSize = null;
  if (logoUrl) {
    const nat = await loadNaturalSize(logoUrl);
    if (nat) logoSize = fitInBox(52, 20, nat.w, nat.h);
  }

  const topY = y;
  if (logoUrl && logoSize) {
    try {
      const fmt = jspdfImageFormat(logoUrl);
      pdf.addImage(logoUrl, fmt, margin, topY, logoSize.w, logoSize.h);
    } catch {
      /* unsupported format in jsPDF */
    }
  }

  let hy = topY + 5;
  const rightX = margin + innerW;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.setTextColor(0, 0, 0);
  pdf.text('INVOICE', rightX, hy, { align: 'right' });
  hy += 7;
  if (companyType) {
    pdf.setFontSize(9);
    pdf.setTextColor(accent.r, accent.g, accent.b);
    pdf.text(companyType, rightX, hy, { align: 'right' });
    hy += lineH - 0.5;
  }
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.text(businessName, rightX, hy, { align: 'right' });
  hy += lineH;
  pdf.setFont('helvetica', 'normal');
  pdf.text('United States', rightX, hy, { align: 'right' });
  hy += lineH;
  if (phone) {
    pdf.text(phone, rightX, hy, { align: 'right' });
    hy += lineH;
  }
  if (website) {
    pdf.text(website, rightX, hy, { align: 'right' });
    hy += lineH;
  }
  if (email) {
    pdf.text(email, rightX, hy, { align: 'right' });
    hy += lineH;
  }

  const headerBottom = Math.max(topY + (logoSize ? logoSize.h : 0), hy + 1);
  y = headerBottom + 4;

  pdf.setDrawColor(grayLine);
  pdf.setLineWidth(0.35);
  pdf.line(margin, y, margin + innerW, y);
  y += 5;

  const blockTop = y;
  const mid = margin + innerW * 0.46;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(grayLabel.r, grayLabel.g, grayLabel.b);
  pdf.text('BILL TO', margin, y + 4);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  y += 5.5;
  pdf.setFont('helvetica', 'bold');
  pdf.text(String(booking.client_name || 'Client'), margin, y + 4);
  pdf.setFont('helvetica', 'normal');
  y += lineH;
  const cPhone = String(booking.client_phone || '').trim();
  const cEmail = String(booking.client_email || '').trim();
  if (cPhone) {
    pdf.text(cPhone, margin, y + 4);
    y += lineH;
  }
  if (cEmail) {
    const wrappedMail = pdf.splitTextToSize(cEmail, mid - margin - 4);
    for (const ln of wrappedMail) {
      pdf.text(ln, margin, y + 4);
      y += lineH - 0.5;
    }
  }

  const invoiceNo = `BK-${booking.id}`;
  const todayIso = new Date().toISOString().slice(0, 10);
  const paymentDueStr = formatLongDate(booking.event_date) || '—';
  const pkgTotal = Number(booking.direct_price) || 0;
  const payments = completedPayments(booking);
  const status = String(booking.payment_status || 'Unpaid');
  const paidSum = roundMoney(payments.reduce((a, p) => a + (Number(p.amount) || 0), 0));
  const amountDueNum = status === 'Paid' ? 0 : Math.max(0, roundMoney(pkgTotal - paidSum));
  const retainerAmt = retainerCreditAmount(booking, payments);
  const totalAfterRetainer = Math.max(0, roundMoney(pkgTotal - retainerAmt));

  let ry = blockTop;
  const labelX = mid + 4;
  const valueRight = margin + innerW;
  const metaRowH = 6;

  const rowMetaPlain = (label, value) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(grayLabel.r, grayLabel.g, grayLabel.b);
    pdf.text(label, labelX, ry + 4);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(value), valueRight, ry + 4, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    ry += metaRowH;
  };

  rowMetaPlain('Invoice number', invoiceNo);
  rowMetaPlain('Invoice date', formatLongDate(todayIso));
  rowMetaPlain('Payment due', paymentDueStr);

  pdf.setFillColor(grayFill.r, grayFill.g, grayFill.b);
  pdf.setDrawColor(grayLine);
  pdf.rect(labelX, ry, valueRight - labelX, metaRowH, 'F');
  pdf.line(labelX, ry, valueRight, ry);
  pdf.line(labelX, ry + metaRowH, valueRight, ry + metaRowH);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Amount Due (${cur}):`, labelX + 2, ry + 4);
  pdf.text(formatCurrency(amountDueNum), valueRight - 2, ry + 4, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  ry += metaRowH;

  y = Math.max(y, ry) + sectionGap;

  const itemColW = colItemsW - 4;
  const itemSegments = collectPackageItemSegments(booking, itemColW, pdf);
  const textLineH = 4.2;
  const rowPad = 3;
  const bodyTextLines = Math.max(1, countSegmentLines(itemSegments));
  const bodyRowH = Math.max(11, bodyTextLines * textLineH + rowPad * 2);

  const tableTop = y;
  const headerH = 7.5;
  ensureSpace(headerH + bodyRowH + 55);

  pdf.setFillColor(accent.r, accent.g, accent.b);
  pdf.rect(margin, tableTop, innerW, headerH, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  const headY = tableTop + 5;
  pdf.text('ITEMS', xItems + 2, headY);
  pdf.text('QUANTITY', xQty + colQtyW - 2, headY, { align: 'right' });
  pdf.text('PRICE', xPrice + colPriceW - 2, headY, { align: 'right' });
  pdf.text('AMOUNT', margin + innerW - 2, headY, { align: 'right' });

  const bodyTop = tableTop + headerH;
  pdf.setDrawColor(grayLine);
  pdf.setLineWidth(0.25);
  pdf.line(margin, bodyTop, margin + innerW, bodyTop);

  const valY = bodyTop + rowPad + 4;
  drawPackageItemSegments(pdf, itemSegments, xItems + 2, valY, textLineH);

  const qtyX = xQty + colQtyW - 2;
  const priceStr = formatCurrency(pkgTotal);
  const amtStr = formatCurrency(pkgTotal);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  pdf.text('1', qtyX, valY, { align: 'right' });
  pdf.text(priceStr, xPrice + colPriceW - 2, valY, { align: 'right' });
  pdf.setFont('helvetica', 'bold');
  pdf.text(amtStr, margin + innerW - 2, valY, { align: 'right' });
  pdf.setFont('helvetica', 'normal');

  const tableBottom = bodyTop + bodyRowH;
  pdf.line(margin, tableBottom, margin + innerW, tableBottom);

  y = tableBottom + 6;

  const totLabelX = xPrice;
  const totValX = margin + innerW - 2;
  const drawTotRow = (label, value, opts = {}) => {
    const { bold = false, size = 10 } = opts;
    pdf.setFont('helvetica', bold ? 'bold' : 'normal', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(0, 0, 0);
    pdf.text(label, totLabelX, y + 4);
    pdf.text(value, totValX, y + 4, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    y += lineH + 0.5;
  };

  drawTotRow('Subtotal:', formatCurrency(pkgTotal), { bold: false });
  if (retainerAmt > 0.005) {
    drawTotRow('Retainer:', `(${formatCurrency(retainerAmt)})`, { bold: false });
  }

  pdf.setDrawColor(grayLine);
  pdf.setLineWidth(0.25);
  pdf.line(totLabelX, y + 1, totValX, y + 1);
  y += 3;

  pdf.setDrawColor(45, 45, 45);
  pdf.setLineWidth(0.55);
  pdf.line(totLabelX, y + 1, totValX, y + 1);
  pdf.setLineWidth(0.25);
  pdf.setDrawColor(grayLine);
  y += 3;

  drawTotRow('Total:', formatCurrency(totalAfterRetainer), { bold: true });

  pdf.line(totLabelX, y + 1, totValX, y + 1);
  y += 4;

  drawTotRow(`Amount Due (${cur}):`, formatCurrency(amountDueNum), { bold: true, size: 11 });

  y += sectionGap;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(90, 90, 90);
  if (!payments.length) {
    ensureSpace(lineH);
    pdf.text('No completed payments recorded for this booking yet.', margin, y + 4);
    y += lineH;
  } else {
    for (const p of payments) {
      ensureSpace(lineH + 1);
      pdf.text(paymentSentence(p), margin, y + 4);
      y += lineH + 1;
    }
  }

  const retainers = payments.filter((p) => receiptPaymentKind(p, booking) === 'retainer');
  if (retainers.length) {
    const r = retainers[0];
    ensureSpace(lineH + 1);
    pdf.setFont('helvetica', 'italic');
    pdf.text(
      `Retainer was paid on ${formatPaidDate(r.created_at)} (${formatCurrency(Number(r.amount) || 0)}).`,
      margin,
      y + 4
    );
    pdf.setFont('helvetica', 'normal');
    y += lineH + 1;
  }
  if (status === 'Paid' && payments.length) {
    const last = [...payments].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    ensureSpace(lineH + 1);
    pdf.setFont('helvetica', 'italic');
    pdf.text(
      `This booking was paid in full on ${formatPaidDate(last.created_at)} (${formatCurrency(Number(last.amount) || 0)}).`,
      margin,
      y + 4
    );
    pdf.setFont('helvetica', 'normal');
    y += lineH + 1;
  }

  y += 4;
  pdf.setTextColor(grayLabel.r, grayLabel.g, grayLabel.b);
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(10);
  pdf.text('Thank you!', margin, y + 4);

  const raw = String(booking.client_name || 'booking')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim();
  const safe = (raw || 'booking').slice(0, 40).replace(/\s+/g, '-');
  const d = new Date().toISOString().slice(0, 10);
  pdf.save(`booking-receipt-${safe}-${d}.pdf`);
}
