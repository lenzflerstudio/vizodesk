import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from './lib/api';
import { formatCurrency } from './lib/formatCurrency';

function formatLongDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
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

export default function InvoiceView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api
      .getInvoiceByToken(token)
      .then(setData)
      .catch((e) => setErr(e.message || 'Invoice not found'));
  }, [token]);

  if (err) {
    return (
      <div className="min-h-screen bg-[#0c0c0f] text-slate-400 flex items-center justify-center p-6 text-center">
        {err}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0c0c0f] text-slate-400 flex items-center justify-center p-6">
        Loading…
      </div>
    );
  }

  const accent = data.business?.brand_color || '#6d28d9';
  const biz = data.business || {};
  const client = data.client;
  const retainerAmt = Number(data.retainer_amount) || 0;
  const showRetainer = retainerAmt > 0;
  const summaryTotal =
    data.total_after_retainer != null ? Number(data.total_after_retainer) : Number(data.total) || 0;

  return (
    <div className="min-h-screen bg-[#0c0c0f] text-slate-200 py-8 px-4 print:bg-white print:text-black">
      <div className="max-w-[820px] mx-auto bg-[#14141a] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl print:shadow-none print:border print:border-zinc-300">
        <div className="p-8 pb-6 grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-zinc-800 print:border-zinc-300">
          <div>
            {data.logo_data_url ? (
              <img src={data.logo_data_url} alt="" className="max-h-20 max-w-[200px] object-contain mb-4" />
            ) : (
              <div className="h-16 w-32 rounded-lg bg-zinc-800/80 print:bg-zinc-200 mb-4" />
            )}
          </div>
          <div className="text-right md:text-right">
            <p className="text-2xl font-bold text-white tracking-wide print:text-black">{data.title || 'INVOICE'}</p>
            {data.summary ? (
              <p className="text-sm text-violet-300/90 mt-1 print:text-violet-800">{data.summary}</p>
            ) : null}
            <div className="mt-4 text-sm text-slate-400 space-y-0.5 print:text-zinc-700">
              {biz.name ? <p className="text-white font-medium print:text-black">{biz.name}</p> : null}
              <p>United States</p>
              {biz.phone ? <p>{biz.phone}</p> : null}
              {biz.website ? <p>{biz.website}</p> : null}
              {biz.email ? <p>{biz.email}</p> : null}
            </div>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 print:text-zinc-600">Bill to</p>
            {client ? (
              <div className="text-sm space-y-1 text-slate-300 print:text-zinc-800">
                <p className="text-white font-medium print:text-black">{client.full_name}</p>
                {client.phone ? <p>{client.phone}</p> : null}
                {client.email ? <p>{client.email}</p> : null}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">—</p>
            )}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 print:text-zinc-600">Invoice number</span>
              <span className="text-white font-medium print:text-black">{data.invoice_number || '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 print:text-zinc-600">Invoice date</span>
              <span>{formatLongDate(data.invoice_date)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 print:text-zinc-600">Payment due</span>
              <span>{formatLongDate(data.payment_due_date)}</span>
            </div>
            {data.po_number ? (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 print:text-zinc-600">P.O./S.O.</span>
                <span>{data.po_number}</span>
              </div>
            ) : null}
            <div className="mt-3 rounded-lg bg-zinc-800/80 border border-zinc-700 px-3 py-2 print:bg-zinc-100 print:border-zinc-300">
              <div className="flex justify-between gap-4">
                <span className="text-slate-400 text-xs uppercase print:text-zinc-600">Amount due ({data.currency || 'USD'})</span>
                <span className="font-semibold text-white tabular-nums print:text-black">{formatCurrency(data.amount_due)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 pb-2">
          <div className="rounded-t-lg overflow-hidden border border-b-0 border-zinc-700 print:border-zinc-400">
            <div
              className="grid grid-cols-12 gap-2 text-xs font-semibold text-white uppercase tracking-wide px-3 py-2.5 print:text-white"
              style={{ backgroundColor: accent }}
            >
              <span className="col-span-5">Items</span>
              <span className="col-span-2 text-right">Quantity</span>
              <span className="col-span-2 text-right">Price</span>
              <span className="col-span-3 text-right">Amount</span>
            </div>
            {(data.line_items || []).map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-12 gap-2 items-start text-sm px-3 py-3 border-t border-zinc-800 bg-zinc-900/50 print:bg-white print:border-zinc-200"
              >
                <span className="col-span-5 text-slate-200 whitespace-pre-wrap print:text-zinc-900">{row.description || '—'}</span>
                <span className="col-span-2 text-right tabular-nums text-slate-300 print:text-zinc-800">{row.quantity}</span>
                <span className="col-span-2 text-right tabular-nums text-slate-300 print:text-zinc-800">
                  {formatCurrency(row.unit_price)}
                </span>
                <span className="col-span-3 text-right tabular-nums font-medium text-white print:text-black">
                  {formatCurrency(row.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 print:text-zinc-600">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(data.subtotal)}</span>
            </div>
            {data.show_discount_line ? (
              <div className="flex justify-between gap-4 text-emerald-400/90 print:text-emerald-800">
                <span className="text-left pr-2">{data.discount_label}</span>
                <span className="tabular-nums whitespace-nowrap">({formatCurrency(data.discount_amount)})</span>
              </div>
            ) : null}
            {showRetainer ? (
              <div className="flex justify-between gap-4 text-emerald-400/90 print:text-emerald-800">
                <span>Retainer</span>
                <span className="tabular-nums whitespace-nowrap">({formatCurrency(retainerAmt)})</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 pt-1 border-t border-zinc-800 print:border-zinc-300 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(summaryTotal)}</span>
            </div>
            {(data.payments || []).map((p, i) => (
              <p key={i} className="text-xs text-slate-500 pt-1 leading-snug print:text-zinc-600">
                {paymentSentence(p)}
              </p>
            ))}
            <div className="flex justify-between gap-4 pt-3 mt-2 border-t border-zinc-700 print:border-zinc-400">
              <span className="font-semibold text-white print:text-black">Amount due ({data.currency || 'USD'})</span>
              <span className="font-bold text-lg tabular-nums text-white print:text-black">{formatCurrency(data.amount_due)}</span>
            </div>
          </div>
        </div>

        {data.notes_terms ? (
          <div className="px-8 pb-6 border-t border-zinc-800 print:border-zinc-300">
            <p className="text-xs font-semibold text-slate-500 uppercase mt-6 mb-2 print:text-zinc-600">Notes / Terms</p>
            <div className="text-sm text-slate-400 whitespace-pre-wrap print:text-zinc-800">{data.notes_terms}</div>
          </div>
        ) : null}

        {data.footer ? (
          <div className="px-8 pb-8 text-xs text-slate-600 border-t border-zinc-800/80 pt-4 print:text-zinc-600 print:border-zinc-200">
            {data.footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
