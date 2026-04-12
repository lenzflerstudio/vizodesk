import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { buildInvoicePrintHtml } from '../lib/invoicePrintDocument';
import '../styles/invoice.css';

export default function InvoicePreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const iframeRef = useRef(null);
  const [invoice, setInvoice] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const invoiceId = Number(id);
  const idValid = Number.isFinite(invoiceId) && invoiceId > 0;

  useEffect(() => {
    if (!idValid) {
      setLoading(false);
      setError('Invalid invoice');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.getInvoice(invoiceId), api.getSettings()])
      .then(([inv, s]) => {
        if (!cancelled) {
          setInvoice(inv);
          setSettings(s);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Failed to load invoice');
          toast.error(e.message || 'Failed to load invoice');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceId, idValid]);

  const srcDoc = useMemo(() => {
    if (!invoice || !settings) return '';
    return buildInvoicePrintHtml(invoice, settings, { omitEmbeddedToolbar: true });
  }, [invoice, settings]);

  const handlePrint = useCallback(() => {
    const w = iframeRef.current?.contentWindow;
    if (!w) {
      toast.error('Invoice frame is not ready');
      return;
    }
    try {
      w.focus();
      w.print();
    } catch {
      toast.error('Could not open print dialog');
    }
  }, []);

  const title = invoice
    ? `Invoice ${invoice.invoice_number || `#${invoice.id}`}`
    : 'Invoice';

  return (
    <div className="flex flex-col min-h-0 flex-1 p-4 sm:p-6 lg:p-8 gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/payments')}
            className="btn-secondary inline-flex items-center gap-2 shrink-0"
          >
            <ArrowLeft size={16} />
            Back to payments
          </button>
          <h1 className="text-xl font-semibold text-white truncate">{title}</h1>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="btn-primary inline-flex items-center justify-center gap-2 shrink-0"
          disabled={!srcDoc || loading}
        >
          <Printer size={16} />
          Print
        </button>
      </div>

      <div className="card flex-1 min-h-0 flex flex-col p-0 overflow-hidden border border-surface-border">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 text-brand animate-spin" />
            <p className="text-sm text-slate-500">Loading invoice…</p>
          </div>
        ) : error || !idValid ? (
          <div className="p-8 text-center text-sm text-red-400">{error || 'Invalid invoice'}</div>
        ) : (
          <iframe
            ref={iframeRef}
            title="Invoice preview"
            className="w-full flex-1 min-h-[70vh] border-0 bg-[#fafafa]"
            srcDoc={srcDoc}
          />
        )}
      </div>
    </div>
  );
}
