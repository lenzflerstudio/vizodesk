import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  X,
  Plus,
  Trash2,
  CloudUpload,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../lib/formatCurrency';
import { buildInvoiceLineDescriptionFromPackage } from '../lib/packageDisplay';
import invoiceCss from '../styles/invoice.css?raw';
import InvoiceDocumentCard from './InvoiceDocumentCard';
import { buildInvoiceDocumentDataFromEditor } from '../lib/invoiceDocumentCardData';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(isoDate, days) {
  if (!isoDate || days == null) return isoDate || '';
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const TERM_OPTIONS = [
  { key: 'on_receipt', label: 'On Receipt', days: 0 },
  { key: 'net_15', label: 'Net 15', days: 15 },
  { key: 'net_30', label: 'Net 30', days: 30 },
  { key: 'net_60', label: 'Net 60', days: 60 },
  { key: 'custom', label: 'Custom due date', days: null },
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatLongDatePreview(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Same markup pattern as buildInvoicePrintHtml (invoicePrintDocument.js). */
function formatLineItemDescriptionPreviewHtml(raw) {
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

function buildPreviewHtml({ form, settings, subtotal, discountAmount, total, amountDue, businessLines, clientName }) {
  const logoForPreview = form.logo_data_url || settings?.business_logo_data_url;
  const logoSrc = logoForPreview ? String(logoForPreview).replace(/"/g, '&quot;') : '';
  const accent = settings?.brand_color && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(settings.brand_color))
    ? String(settings.brand_color).toLowerCase()
    : '#6d28d9';
  const retStr = String(form.retainer_amount ?? '').trim();
  const retParsed = retStr ? Math.round(parseFloat(retStr) * 100) / 100 : 0;
  const showRetainerPreview = Number.isFinite(retParsed) && retParsed > 0;
  const totalAfterRetainer = showRetainerPreview
    ? Math.round(Math.max(0, total - retParsed) * 100) / 100
    : total;
  const lineRows = form.line_items
    .filter((l) => String(l.description || '').trim() || Number(l.quantity) > 0 || Number(l.unit_price) > 0)
    .map((l) => {
      const amt = Math.round((Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * 100) / 100;
      return `<tr>
        <td class="cell-desc">${formatLineItemDescriptionPreviewHtml(l.description)}</td>
        <td class="cell-num">${escapeHtml(String(Number(l.quantity) || 0))}</td>
        <td class="cell-num">${formatCurrency(Number(l.unit_price) || 0)}</td>
        <td class="cell-num cell-amt">${formatCurrency(amt)}</td>
      </tr>`;
    })
    .join('');
  const discLabel = String(form.discount_label || '').trim();
  const showDiscLine = discountAmount > 0 && discLabel;
  const invNo = escapeHtml(form.invoice_number || '—');
  const cur = escapeHtml(form.currency || 'USD');
  const summaryBlock = form.summary ? `<p class="inv-doc-sub">${escapeHtml(form.summary)}</p>` : '';
  const poRow = form.po_number
    ? `<div class="inv-doc-meta-row"><span class="inv-doc-meta-lbl">P.O./S.O.</span><span class="inv-doc-meta-val">${escapeHtml(form.po_number)}</span></div>`
    : '';
  const notesHtml = form.notes_terms
    ? `<div class="inv-doc-notes"><strong>Notes / Terms</strong><pre class="inv-doc-notes-pre">${escapeHtml(form.notes_terms)}</pre></div>`
    : '';
  const footerHtml = form.footer ? `<div class="inv-doc-footer">${escapeHtml(form.footer)}</div>` : '';

  let summaryHtml;
  if (showRetainerPreview) {
    summaryHtml = `<div class="inv-doc-tot"><span class="inv-doc-tot-muted">Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
${showDiscLine ? `<div class="inv-doc-tot inv-doc-disc"><span>${escapeHtml(discLabel)}</span><span>(${formatCurrency(discountAmount)})</span></div>` : ''}
<div class="inv-doc-retainer"><span>Retainer</span><span>(${formatCurrency(retParsed)})</span></div>
<div class="inv-doc-tot inv-doc-tot-divider"><span>Total</span><span><strong>${formatCurrency(totalAfterRetainer)}</strong></span></div>
<div class="inv-doc-due-big"><span>Amount Due (${cur})</span><span>${formatCurrency(amountDue)}</span></div>`;
  } else {
    summaryHtml = `<div class="inv-doc-tot"><span class="inv-doc-tot-muted">Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
${showDiscLine ? `<div class="inv-doc-tot inv-doc-disc"><span>${escapeHtml(discLabel)}</span><span>(${formatCurrency(discountAmount)})</span></div>` : ''}
<div class="inv-doc-tot inv-doc-tot-divider"><span>Total</span><span><strong>${formatCurrency(total)}</strong></span></div>
<div class="inv-doc-due-big"><span>Amount Due (${cur})</span><span>${formatCurrency(amountDue)}</span></div>`;
  }

  const toolbarHtml = `<div class="no-print inv-doc-toolbar">
    <button type="button" onclick="window.print()">Print</button>
  </div>`;

  const bodyInner = `${toolbarHtml}
<div class="inv-doc-root" style="--inv-accent:${accent}">
  <div class="inv-doc-grid2">
    <div>${logoSrc ? `<img src="${logoSrc}" alt="" class="inv-doc-logo"/>` : ''}</div>
    <div class="inv-doc-right">
      <h1 class="inv-doc-h1">${escapeHtml((form.title || 'Invoice').toUpperCase())}</h1>
      ${summaryBlock}
      <div class="inv-doc-biz inv-doc-biz-right">${businessLines.map(escapeHtml).join('<br/>')}</div>
    </div>
  </div>
  <div class="inv-doc-grid2">
    <div>
      <div class="inv-doc-bill">BILL TO</div>
      <div class="inv-doc-biz"><p class="inv-doc-client-name">${escapeHtml(clientName || '—')}</p></div>
    </div>
    <div class="inv-doc-right">
      <div class="inv-doc-meta-row"><span class="inv-doc-meta-lbl">Invoice number</span><span class="inv-doc-meta-val">${invNo}</span></div>
      <div class="inv-doc-meta-row"><span class="inv-doc-meta-lbl">Invoice date</span><span class="inv-doc-meta-val">${escapeHtml(formatLongDatePreview(form.invoice_date))}</span></div>
      <div class="inv-doc-meta-row"><span class="inv-doc-meta-lbl">Payment due</span><span class="inv-doc-meta-val">${escapeHtml(formatLongDatePreview(form.payment_due_date))}</span></div>
      ${poRow}
      <div class="inv-doc-box">
        <span class="inv-doc-box-label">Amount due (${cur})</span><br/>
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

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Invoice preview</title>
<style>${invoiceCss}</style></head><body>${bodyInner}</body></html>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function InvoiceEditorModal({ open, onClose, onSaved, clients, bookings, settings, invoiceId = null }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [loadEdit, setLoadEdit] = useState(false);
  const [termKey, setTermKey] = useState('on_receipt');
  const [showDiscount, setShowDiscount] = useState(false);
  const [footerOpen, setFooterOpen] = useState(false);
  const [packages, setPackages] = useState([]);
  const [packagePick, setPackagePick] = useState('');
  const [form, setForm] = useState({
    title: 'Invoice',
    summary: '',
    client_id: '',
    booking_id: '',
    invoice_number: '',
    po_number: '',
    invoice_date: todayISO(),
    payment_due_date: todayISO(),
    payment_terms_label: 'On Receipt',
    currency: 'USD',
    notes_terms: '',
    footer: '',
    logo_data_url: null,
    status: 'draft',
    discount_type: 'none',
    discount_value: 0,
    discount_label: '',
    retainer_amount: '',
    line_items: [{ _key: uid(), description: '', quantity: 1, unit_price: 0 }],
  });

  useEffect(() => {
    if (!open) return;

    if (invoiceId) {
      setFooterOpen(false);
      setLoadEdit(true);
      api
        .getInvoice(invoiceId)
        .then((inv) => {
          const dt = inv.discount_type === 'percent' || inv.discount_type === 'amount' ? inv.discount_type : 'amount';
          const showDisc = inv.discount_type === 'percent' || inv.discount_type === 'amount';
          const match = TERM_OPTIONS.find((o) => o.label === inv.payment_terms_label);
          setTermKey(match ? match.key : 'custom');
          setShowDiscount(showDisc);
          setForm({
            title: inv.title || 'Invoice',
            summary: inv.summary || '',
            client_id: inv.client_id != null ? String(inv.client_id) : '',
            booking_id: inv.booking_id != null ? String(inv.booking_id) : '',
            invoice_number: inv.invoice_number || '',
            po_number: inv.po_number || '',
            invoice_date: inv.invoice_date || todayISO(),
            payment_due_date: inv.payment_due_date || '',
            payment_terms_label: inv.payment_terms_label || 'On Receipt',
            currency: inv.currency || 'USD',
            notes_terms: inv.notes_terms || '',
            footer: inv.footer || '',
            logo_data_url: inv.logo_data_url || null,
            status: inv.status || 'draft',
            discount_type: dt,
            discount_value: inv.discount_value ?? 0,
            discount_label: inv.discount_label || '',
            retainer_amount:
              inv.retainer_amount != null && inv.retainer_amount !== ''
                ? String(inv.retainer_amount)
                : '',
            line_items:
              (inv.line_items || []).length > 0
                ? (inv.line_items || []).map((li) => ({
                    _key: uid(),
                    description: li.description || '',
                    quantity: li.quantity,
                    unit_price: li.unit_price,
                  }))
                : [{ _key: uid(), description: '', quantity: 1, unit_price: 0 }],
          });
        })
        .catch((e) => {
          toast.error(e.message || 'Failed to load invoice');
          onCloseRef.current();
        })
        .finally(() => setLoadEdit(false));
      return;
    }

    const base = {
      title: 'Invoice',
      summary: '',
      client_id: '',
      booking_id: '',
      po_number: '',
      invoice_date: todayISO(),
      payment_due_date: todayISO(),
      payment_terms_label: 'On Receipt',
      currency: 'USD',
      notes_terms: '',
      footer: '',
      logo_data_url: null,
      status: 'draft',
      discount_type: 'none',
      discount_value: 0,
      discount_label: '',
      retainer_amount: '',
      line_items: [{ _key: uid(), description: '', quantity: 1, unit_price: 0 }],
    };
    setTermKey('on_receipt');
    setShowDiscount(false);
    setFooterOpen(false);
    api
      .getInvoiceNextNumber()
      .then(({ invoice_number }) => {
        setForm({ ...base, invoice_number });
      })
      .catch(() => {
        setForm({ ...base, invoice_number: '' });
      });
  }, [open, invoiceId]);

  useEffect(() => {
    if (!open) return;
    api
      .getPackages()
      .then(setPackages)
      .catch(() => {
        setPackages([]);
      });
  }, [open]);

  const insertLineFromPackage = (packageId) => {
    const id = Number(packageId);
    const pkg = packages.find((p) => Number(p.id) === id);
    if (!pkg) return;
    const description = buildInvoiceLineDescriptionFromPackage(pkg);
    if (!description.trim()) {
      toast.error('This package has no title or details to insert');
      return;
    }
    const unit =
      pkg.suggested_price != null && Number.isFinite(Number(pkg.suggested_price))
        ? Math.round(Number(pkg.suggested_price) * 100) / 100
        : 0;
    setForm((f) => {
      const oneEmpty =
        f.line_items.length === 1 &&
        !String(f.line_items[0].description || '').trim() &&
        !(Number(f.line_items[0].unit_price) > 0);
      if (oneEmpty) {
        return {
          ...f,
          line_items: [
            {
              _key: f.line_items[0]._key,
              description,
              quantity: 1,
              unit_price: unit,
            },
          ],
        };
      }
      return {
        ...f,
        line_items: [
          ...f.line_items,
          { _key: uid(), description, quantity: 1, unit_price: unit },
        ],
      };
    });
    toast.success(`Inserted “${pkg.label || 'package'}”`);
  };

  const businessLines = useMemo(() => {
    const s = settings || {};
    const lines = [];
    if (s.business_name) lines.push(s.business_name);
    if (s.business_phone) lines.push(s.business_phone);
    if (s.business_email) lines.push(s.business_email);
    if (s.business_website) lines.push(s.business_website);
    return lines;
  }, [settings]);

  const selectedClient = useMemo(
    () => clients.find((c) => String(c.id) === String(form.client_id)),
    [clients, form.client_id]
  );

  const clientDetailLines = useMemo(() => {
    if (!selectedClient) return [];
    const out = [];
    if (selectedClient.email) out.push(String(selectedClient.email));
    if (selectedClient.phone) out.push(String(selectedClient.phone));
    return out;
  }, [selectedClient]);

  const invoicePreviewData = useMemo(
    () =>
      buildInvoiceDocumentDataFromEditor({
        form,
        settings,
        clientName: selectedClient?.full_name || '',
        clientLines: clientDetailLines,
        subtotal,
        discountAmount,
        total,
        amountDue: amountDuePreview,
        showDiscount,
      }),
    [
      form,
      settings,
      selectedClient,
      clientDetailLines,
      subtotal,
      discountAmount,
      total,
      amountDuePreview,
      showDiscount,
    ]
  );

  const { subtotal, discountAmount, total } = useMemo(() => {
    let sub = 0;
    for (const l of form.line_items) {
      sub += Math.round((Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * 100) / 100;
    }
    sub = Math.round(sub * 100) / 100;
    let disc = 0;
    if (showDiscount && form.discount_type === 'percent') {
      disc = Math.round(sub * (Math.min(100, Math.max(0, Number(form.discount_value) || 0)) / 100) * 100) / 100;
    } else if (showDiscount && form.discount_type === 'amount') {
      disc = Math.min(sub, Math.round(Math.max(0, Number(form.discount_value) || 0) * 100) / 100);
    }
    return { subtotal: sub, discountAmount: disc, total: Math.round((sub - disc) * 100) / 100 };
  }, [form.line_items, form.discount_type, form.discount_value, showDiscount]);

  const amountDuePreview = useMemo(() => {
    const t = String(form.retainer_amount ?? '').trim();
    if (!t) return total;
    const ret = Math.round(parseFloat(t) * 100) / 100;
    if (!Number.isFinite(ret) || ret <= 0) return total;
    return Math.round(Math.max(0, total - ret) * 100) / 100;
  }, [form.retainer_amount, total]);

  const handle = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const setTerm = (key) => {
    setTermKey(key);
    const opt = TERM_OPTIONS.find((o) => o.key === key);
    if (!opt) return;
    if (opt.days == null) {
      setForm((f) => ({ ...f, payment_terms_label: 'Custom' }));
      return;
    }
    const due = addDaysISO(form.invoice_date, opt.days);
    setForm((f) => ({
      ...f,
      payment_due_date: due,
      payment_terms_label: opt.label,
    }));
  };

  useEffect(() => {
    if (invoiceId) return;
    if (termKey === 'custom') return;
    const opt = TERM_OPTIONS.find((o) => o.key === termKey);
    if (!opt || opt.days == null) return;
    setForm((f) => ({
      ...f,
      payment_due_date: addDaysISO(f.invoice_date, opt.days),
      payment_terms_label: opt.label,
    }));
  }, [form.invoice_date, termKey, invoiceId]);

  const updateLine = (key, field, value) => {
    setForm((f) => ({
      ...f,
      line_items: f.line_items.map((row) => (row._key === key ? { ...row, [field]: value } : row)),
    }));
  };

  const addLine = () => {
    setForm((f) => ({
      ...f,
      line_items: [...f.line_items, { _key: uid(), description: '', quantity: 1, unit_price: 0 }],
    }));
  };

  const removeLine = (key) => {
    setForm((f) => ({
      ...f,
      line_items: f.line_items.length <= 1 ? f.line_items : f.line_items.filter((row) => row._key !== key),
    }));
  };

  const onLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|gif|webp)$/i.test(file.type)) {
      toast.error('Use JPG, PNG, GIF, or WebP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo max 5MB');
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result || '');
      if (url.length > 450000) {
        toast.error('Logo is too large after encoding — try a smaller image');
        return;
      }
      setForm((f) => ({ ...f, logo_data_url: url }));
    };
    r.readAsDataURL(file);
    e.target.value = '';
  };

  const openPreview = () => {
    const clientName = clients.find((c) => String(c.id) === String(form.client_id))?.full_name || '';
    const html = buildPreviewHtml({
      form,
      settings,
      subtotal,
      discountAmount,
      total,
      amountDue: amountDuePreview,
      businessLines,
      clientName,
    });
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    } else {
      toast.error('Popup blocked — allow popups to preview');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.client_id) {
      toast.error('Choose a customer');
      return;
    }
    const lines = form.line_items
      .map(({ description, quantity, unit_price }) => ({
        description: String(description || '').trim(),
        quantity,
        unit_price,
      }))
      .filter((l) => l.description || Number(l.quantity) * Number(l.unit_price) > 0);
    if (lines.length === 0) {
      toast.error('Add at least one line item with a description or amount');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: form.title,
        summary: form.summary || null,
        client_id: parseInt(form.client_id, 10),
        booking_id: form.booking_id ? parseInt(form.booking_id, 10) : null,
        invoice_number: form.invoice_number || null,
        po_number: form.po_number || null,
        invoice_date: form.invoice_date,
        payment_due_date: form.payment_due_date || null,
        payment_terms_label: form.payment_terms_label || null,
        currency: form.currency,
        notes_terms: form.notes_terms || null,
        footer: form.footer || null,
        logo_data_url: form.logo_data_url,
        status: form.status,
        discount_type: showDiscount ? form.discount_type : 'none',
        discount_value: showDiscount ? form.discount_value : 0,
        discount_label: showDiscount ? form.discount_label : '',
        retainer_amount: (() => {
          const t = String(form.retainer_amount ?? '').trim();
          if (!t) return null;
          const n = parseFloat(t);
          return Number.isNaN(n) || n < 0 ? null : Math.round(n * 100) / 100;
        })(),
        line_items: lines,
      };
      const inv = invoiceId ? await api.updateInvoice(invoiceId, payload) : await api.createInvoice(payload);
      toast.success(invoiceId ? 'Invoice updated' : 'Invoice saved');
      onSaved(inv);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-6 sm:pt-10 overflow-y-auto">
      <div className="card w-full max-w-7xl my-4 border-surface-border shadow-xl relative">
        {loadEdit && (
          <div className="absolute inset-0 z-10 bg-surface/80 flex items-center justify-center rounded-xl">
            <Loader2 className="w-10 h-10 text-brand animate-spin" />
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-surface-border">
          <h2 className="text-xl font-bold text-white">{invoiceId ? 'Edit invoice' : 'New invoice'}</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openPreview} className="btn-secondary text-sm">
              <Eye size={15} /> Preview
            </button>
            <button type="submit" form="invoice-form" className="btn-primary text-sm" disabled={loading || loadEdit}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {invoiceId ? 'Save changes' : 'Save invoice'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost p-2" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <form id="invoice-form" onSubmit={submit} className="space-y-8" aria-busy={loadEdit}>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(280px,400px)] gap-8 xl:gap-10 items-start">
            <div className="space-y-8 min-w-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={onLogo} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full min-h-[140px] rounded-xl border-2 border-dashed border-surface-border bg-surface-overlay/40 hover:bg-surface-overlay/60 flex flex-col items-center justify-center gap-2 text-slate-400 text-sm transition-colors"
              >
                {form.logo_data_url ? (
                  <img src={form.logo_data_url} alt="" className="max-h-24 max-w-[200px] object-contain" />
                ) : (
                  <>
                    <CloudUpload size={28} className="opacity-60" />
                    <span>Browse or drop your logo here</span>
                    <span className="text-xs text-slate-600">Max 5MB · JPG, PNG, GIF, WebP</span>
                  </>
                )}
              </button>
              {form.logo_data_url && (
                <button
                  type="button"
                  className="text-xs text-brand-light mt-2"
                  onClick={() => setForm((f) => ({ ...f, logo_data_url: null }))}
                >
                  Remove logo
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Document title</label>
                <input name="title" className="input text-lg font-medium" value={form.title} onChange={handle} />
              </div>
              <div>
                <label className="label">Summary</label>
                <textarea
                  name="summary"
                  className="input min-h-[72px] resize-y"
                  placeholder="e.g. project name, description of invoice"
                  value={form.summary}
                  onChange={handle}
                />
              </div>
              <div className="rounded-lg border border-surface-border bg-surface-overlay/30 p-3 text-sm text-slate-300 space-y-0.5">
                {businessLines.length > 0 ? (
                  businessLines.map((line, i) => <p key={i}>{line}</p>)
                ) : (
                  <p className="text-slate-500">No business contact lines yet — add them in Settings.</p>
                )}
                <Link to="/settings" className="text-brand-light text-sm inline-block mt-2 hover:underline">
                  Edit your business details in Settings
                </Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-surface-border bg-surface-overlay/20 p-4">
              <label className="label">Customer</label>
              <select name="client_id" className="input" required value={form.client_id} onChange={handle}>
                <option value="">Add a customer…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-600 mt-2">
                Manage clients under <Link to="/clients" className="text-brand-light hover:underline">Clients</Link>.
              </p>
              <div className="mt-4">
                <label className="label">Link to booking (optional)</label>
                <select name="booking_id" className="input" value={form.booking_id} onChange={handle}>
                  <option value="">— None —</option>
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.client_name} — {b.event_type} ({b.event_date})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Invoice number</label>
                <input name="invoice_number" className="input" value={form.invoice_number} onChange={handle} />
              </div>
              <div>
                <label className="label">P.O./S.O. number</label>
                <input name="po_number" className="input" placeholder="Optional" value={form.po_number} onChange={handle} />
              </div>
              <div>
                <label className="label">Invoice date</label>
                <input name="invoice_date" type="date" className="input" required value={form.invoice_date} onChange={handle} />
              </div>
              <div>
                <label className="label">Payment terms</label>
                <select
                  className="input mb-2"
                  value={termKey}
                  onChange={(e) => setTerm(e.target.value)}
                >
                  {TERM_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <label className="label">Payment due</label>
                <input
                  name="payment_due_date"
                  type="date"
                  className="input"
                  value={form.payment_due_date}
                  onChange={handle}
                  disabled={termKey !== 'custom'}
                />
                <p className="text-xs text-slate-600 mt-1">{form.payment_terms_label || '—'}</p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300">Line items</h3>
              <button type="button" onClick={addLine} className="text-sm text-brand-light flex items-center gap-1 hover:underline">
                <Plus size={14} /> Add an item
              </button>
            </div>
            {packages.length > 0 ? (
              <div className="mb-3 max-w-md">
                <label className="label" htmlFor="invoice-package-insert">
                  Insert from package
                </label>
                <select
                  id="invoice-package-insert"
                  className="input text-sm"
                  value={packagePick}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPackagePick(v);
                    if (v) {
                      insertLineFromPackage(v);
                      setPackagePick('');
                    }
                  }}
                >
                  <option value="">Choose a package…</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label || `Package #${p.id}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-lg border border-surface-border">
              <table className="w-full text-sm min-w-[520px]">
                <thead
                  className="border-b border-surface-border text-white"
                  style={{
                    backgroundColor:
                      settings?.brand_color && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(settings.brand_color))
                        ? settings.brand_color
                        : '#6d28d9',
                  }}
                >
                  <tr>
                    <th className="text-left text-xs font-medium px-3 py-2.5 uppercase tracking-wide">Items</th>
                    <th className="text-right text-xs font-medium px-3 py-2.5 w-24 uppercase tracking-wide">Quantity</th>
                    <th className="text-right text-xs font-medium px-3 py-2.5 w-28 uppercase tracking-wide">Price</th>
                    <th className="text-right text-xs font-medium px-3 py-2.5 w-28 uppercase tracking-wide">Amount</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {form.line_items.map((row) => {
                    const amt = Math.round((Number(row.quantity) || 0) * (Number(row.unit_price) || 0) * 100) / 100;
                    return (
                      <tr key={row._key} className="bg-surface-overlay/20">
                        <td className="px-2 py-2 align-top">
                          <textarea
                            className="input py-1.5 text-sm min-h-[4.5rem] resize-y w-full"
                            placeholder="Description"
                            rows={3}
                            value={row.description}
                            onChange={(e) => updateLine(row._key, 'description', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="input py-1.5 text-sm text-right"
                            value={row.quantity}
                            onChange={(e) => updateLine(row._key, 'quantity', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="input py-1.5 text-sm text-right"
                            value={row.unit_price}
                            onChange={(e) => updateLine(row._key, 'unit_price', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2 align-top text-right text-slate-200 tabular-nums">{formatCurrency(amt)}</td>
                        <td className="px-1 py-2 align-top">
                          <button
                            type="button"
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded"
                            onClick={() => removeLine(row._key)}
                            aria-label="Remove line"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col items-end gap-2 text-sm">
              <div className="flex justify-between w-full max-w-xs gap-4">
                <span className="text-slate-500">Subtotal</span>
                <span className="text-white font-medium tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              {!showDiscount ? (
                <button
                  type="button"
                  className="text-brand-light text-sm flex items-center gap-1 hover:underline"
                  onClick={() => {
                    setShowDiscount(true);
                    setForm((f) => ({ ...f, discount_type: 'amount', discount_value: 0 }));
                  }}
                >
                  <Plus size={14} /> Add a discount
                </button>
              ) : (
                <div className="w-full max-w-xs space-y-2 rounded-lg border border-surface-border p-3 bg-surface-overlay/30">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-xs uppercase">Discount</span>
                    <button
                      type="button"
                      className="text-xs text-slate-500 hover:text-slate-300"
                      onClick={() => {
                        setShowDiscount(false);
                        setForm((f) => ({
                          ...f,
                          discount_type: 'none',
                          discount_value: 0,
                          discount_label: '',
                        }));
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <select
                    className="input text-sm"
                    value={form.discount_type}
                    onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value }))}
                  >
                    <option value="amount">Fixed amount</option>
                    <option value="percent">Percent</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="input text-sm"
                    value={form.discount_value}
                    onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
                  />
                  <div>
                    <label className="label">Discount reason</label>
                    <input
                      name="discount_label"
                      className="input text-sm"
                      placeholder="e.g. Returning client credit"
                      value={form.discount_label}
                      onChange={handle}
                    />
                    <p className="text-xs text-slate-600 mt-1">
                      Shown on the client invoice next to the amount. Leave blank to hide that line (total still includes the discount).
                    </p>
                  </div>
                </div>
              )}
              <div className="flex justify-between w-full max-w-xs gap-4 items-center pt-2 border-t border-surface-border">
                <span className="text-slate-400">Currency</span>
                <select name="currency" className="input text-sm py-1.5 max-w-[200px]" value={form.currency} onChange={handle}>
                  <option value="USD">USD ($) — U.S. dollar</option>
                </select>
              </div>
              <div className="flex justify-between w-full max-w-xs gap-4">
                <span className="text-slate-300 font-medium">Total</span>
                <span className="text-white font-semibold tabular-nums">{formatCurrency(total)}</span>
              </div>
              <div className="w-full max-w-xs">
                <label className="label text-xs text-slate-500">Retainer (deposit)</label>
                <input
                  type="number"
                  name="retainer_amount"
                  min={0}
                  step={0.01}
                  className="input text-sm"
                  placeholder="Retainer Amount"
                  value={form.retainer_amount}
                  onChange={handle}
                />
              </div>
              <div className="w-full max-w-xs rounded-lg bg-brand/15 border border-brand/30 px-4 py-3 mt-1">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Amount due</p>
                <p className="text-xl font-bold text-white tabular-nums">{formatCurrency(amountDuePreview)}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notes / Terms</label>
            <textarea
              name="notes_terms"
              className="input min-h-[100px] resize-y"
              placeholder="Enter notes or terms of service that are visible to your customer"
              value={form.notes_terms}
              onChange={handle}
            />
          </div>

          <div className="rounded-lg border border-surface-border overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 bg-surface-overlay/40 text-sm font-medium text-slate-300 hover:bg-surface-overlay/60"
              onClick={() => setFooterOpen((v) => !v)}
            >
              Footer
              {footerOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {footerOpen && (
              <div className="p-4 border-t border-surface-border">
                <textarea
                  name="footer"
                  className="input min-h-[80px] resize-y text-sm"
                  placeholder="Optional footer text on the invoice"
                  value={form.footer}
                  onChange={handle}
                />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-dashed border-surface-border bg-surface-overlay/20 p-6 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-400 mb-1">Attachments</p>
            <p className="text-xs max-w-md mx-auto">
              File uploads to invoices are not stored yet. Email files to your client separately, or add filenames in Notes / Terms.
            </p>
          </div>

          <div>
            <label className="label">Status</label>
            <select name="status" className="input max-w-xs" value={form.status} onChange={handle}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2 pt-4 border-t border-surface-border">
            <button type="button" onClick={openPreview} className="btn-secondary text-sm">
              <Eye size={15} /> Preview
            </button>
            <button type="submit" className="btn-primary text-sm" disabled={loading || loadEdit}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {invoiceId ? 'Save changes' : 'Save invoice'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
            </div>

            <aside className="xl:sticky xl:top-4 space-y-2 min-w-0 order-last xl:order-none">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice layout</p>
              <p className="text-[11px] text-slate-600 leading-snug">
                Live preview (PDF-style). Values follow the form; empty fields stay blank.
              </p>
              <div className="rounded-lg border border-surface-border bg-slate-100 p-2 sm:p-3 max-h-[min(70vh,720px)] overflow-y-auto overscroll-contain">
                <InvoiceDocumentCard
                  data={invoicePreviewData}
                  accentColor={settings?.brand_color}
                  className="shadow-md"
                />
              </div>
            </aside>
          </div>
        </form>
      </div>
    </div>
  );
}
