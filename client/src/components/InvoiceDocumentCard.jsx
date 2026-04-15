/**
 * Client-facing invoice layout (light card). All copyable values come from `data`;
 * section labels (e.g. column headers) are structural UI text.
 */
function isHexColor(v) {
  return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
}

function headerFooterStyle(accentColor) {
  if (!isHexColor(accentColor)) return undefined;
  const c = accentColor.trim();
  return {
    background: `linear-gradient(105deg, ${c} 0%, #4f46e5 92%)`,
  };
}

function displayCell(v) {
  const s = v == null ? '' : String(v);
  return s.trim() === '' ? '\u00a0' : s;
}

export default function InvoiceDocumentCard({ data, accentColor, className = '' }) {
  const hfStyle = headerFooterStyle(accentColor);
  const useDefaultGradient = !hfStyle;

  return (
    <div
      className={`rounded-xl border border-slate-200/90 bg-white text-slate-900 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)] overflow-hidden ${className}`}
    >
      {/* Header */}
      <div
        className={`px-5 py-6 sm:px-8 sm:py-7 text-white ${useDefaultGradient ? 'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600' : ''}`}
        style={hfStyle}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start min-w-0">
            {data.business?.logoUrl ? (
              <img
                src={data.business.logoUrl}
                alt=""
                className="h-12 sm:h-14 w-auto max-w-[160px] object-contain shrink-0"
              />
            ) : null}
            <div className="min-w-0 space-y-1">
              {data.business?.tagline ? (
                <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.14em] text-white/85">
                  {data.business.tagline}
                </p>
              ) : null}
              {data.business?.name ? (
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-white">{data.business.name}</p>
              ) : null}
              {Array.isArray(data.business?.lines) && data.business.lines.length > 0 ? (
                <div className="text-xs sm:text-sm text-white/90 space-y-0.5 leading-relaxed">
                  {data.business.lines.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-1 shrink-0">
            <p className="text-2xl sm:text-3xl font-light tracking-[0.2em] text-white uppercase">
              {displayCell(data.invoice?.title)}
            </p>
            {data.invoice?.number ? (
              <p className="text-sm text-white/90 tabular-nums">
                <span className="text-white/70">#</span>
                {data.invoice.number}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bill to + meta */}
      <div className="px-5 py-6 sm:px-8 sm:py-8 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700 mb-2">Bill to</p>
          {data.client?.name ? (
            <p className="text-lg font-bold text-slate-900 tracking-tight">{data.client.name}</p>
          ) : null}
          {Array.isArray(data.client?.lines) && data.client.lines.length > 0 ? (
            <div className="mt-2 text-sm text-slate-600 space-y-1">
              {data.client.lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 lg:items-end min-w-0">
          <div className="w-full max-w-sm lg:ml-auto space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Invoice date</span>
              <span className="text-slate-900 tabular-nums text-right">{displayCell(data.meta?.invoiceDate)}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payment due</span>
              <span className="text-slate-900 tabular-nums text-right">{displayCell(data.meta?.paymentDueDate)}</span>
            </div>
            {data.meta?.poNumber ? (
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">P.O. / S.O.</span>
                <span className="text-slate-900 text-right">{data.meta.poNumber}</span>
              </div>
            ) : null}
          </div>

          <div className="w-full max-w-sm lg:ml-auto rounded-xl bg-violet-50 border border-violet-100/80 px-4 py-4 mt-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-800">Amount due</p>
            <p className="mt-1 text-2xl sm:text-3xl font-bold text-violet-700 tabular-nums">
              {displayCell(data.summary?.amountDue)}
            </p>
            {data.meta?.currencyCode ? (
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide">{data.meta.currencyCode}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="px-5 sm:px-8 pb-6">
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div
            className={`grid grid-cols-[minmax(0,1fr)_52px_72px_88px] sm:grid-cols-[minmax(0,1fr)_64px_88px_96px] gap-2 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-white ${
              useDefaultGradient ? 'bg-gradient-to-r from-violet-600 to-indigo-600' : ''
            }`}
            style={hfStyle}
          >
            <span>Description</span>
            <span className="text-center sm:text-right">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Amount</span>
          </div>

          <div className="divide-y divide-slate-100">
            {(data.items || []).map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[minmax(0,1fr)_52px_72px_88px] sm:grid-cols-[minmax(0,1fr)_64px_88px_96px] gap-2 px-3 py-4 text-sm"
              >
                <div className="min-w-0 pr-1">
                  {row.description ? <p className="font-semibold text-slate-900">{row.description}</p> : null}
                  {row.detail ? <p className="text-slate-600 text-sm mt-1 leading-snug">{row.detail}</p> : null}
                  {Array.isArray(row.bullets) && row.bullets.length > 0 ? (
                    <ul className="mt-2 list-disc list-inside text-slate-600 text-sm space-y-0.5">
                      {row.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="text-center sm:text-right text-slate-800 tabular-nums self-start pt-0.5">
                  {displayCell(row.quantity)}
                </div>
                <div className="text-right text-slate-700 tabular-nums self-start pt-0.5">{displayCell(row.unitPrice)}</div>
                <div className="text-right font-semibold text-slate-900 tabular-nums self-start pt-0.5">
                  {displayCell(row.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between gap-6 text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums text-slate-800">{displayCell(data.summary?.subtotal)}</span>
            </div>
            {data.summary?.showDiscount ? (
              <div className="flex justify-between gap-6 text-red-600">
                <span className="min-w-0 truncate pr-2">{displayCell(data.summary.discountLabel)}</span>
                <span className="tabular-nums shrink-0">({displayCell(data.summary.discountAmount)})</span>
              </div>
            ) : null}
            {data.summary?.showRetainer ? (
              <div className="flex justify-between gap-6 text-red-600">
                <span>{displayCell(data.summary.retainerLabel)}</span>
                <span className="tabular-nums shrink-0">({displayCell(data.summary.retainerAmount)})</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-6 pt-2 border-t border-slate-200 text-base font-bold text-slate-900">
              <span>Total</span>
              <span className="tabular-nums">{displayCell(data.summary?.total)}</span>
            </div>
            <div className="flex justify-between gap-6 pt-1 text-slate-700">
              <span className="text-xs font-semibold uppercase tracking-wide text-violet-800">Amount due</span>
              <span className="tabular-nums font-semibold text-violet-800">{displayCell(data.summary?.amountDue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {data.notesTerms ? (
        <div className="px-5 sm:px-8 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700 mb-2">Notes / terms</p>
          <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{data.notesTerms}</div>
        </div>
      ) : null}

      {/* Footer banner */}
      {data.footerMessage ? (
        <div
          className={`px-5 py-4 sm:px-8 text-center text-sm text-white/95 ${useDefaultGradient ? 'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600' : ''}`}
          style={hfStyle}
        >
          <p>{data.footerMessage}</p>
        </div>
      ) : null}
    </div>
  );
}
