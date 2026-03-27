import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Loader2, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => void} [props.onSent]
 * @param {boolean} props.gmailReady
 * @param {{ id: number, client_email?: string|null, invoice_number?: string|null, public_token?: string|null } | null} props.invoice
 * @param {{ id: number, client_email?: string|null, template_name?: string|null, pdf_path?: string|null, public_token?: string|null } | null} props.contract
 */
export default function SendClientDocumentsModal({ open, onClose, onSent, gmailReady, invoice, contract }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [includeInvoice, setIncludeInvoice] = useState(true);
  const [includeContract, setIncludeContract] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const email = (invoice?.client_email || contract?.client_email || '').trim();
    setTo(email);
    setSubject('');
    setMessage('');
    setIncludeInvoice(!!invoice);
    setIncludeContract(!!contract);
  }, [open, invoice, contract]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!gmailReady) {
      toast.error('Configure Gmail in Settings first');
      return;
    }
    const invoiceId = includeInvoice && invoice ? invoice.id : null;
    const contractId = includeContract && contract ? contract.id : null;
    if (!invoiceId && !contractId) {
      toast.error('Select at least one of invoice or contract');
      return;
    }
    const toTrim = to.trim();
    if (!toTrim) {
      toast.error('Enter the recipient email');
      return;
    }

    setSending(true);
    try {
      await api.sendClientDocumentsEmail({
        to: toTrim,
        invoice_id: invoiceId,
        contract_id: contractId,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
        include_invoice: includeInvoice,
        include_contract: includeContract,
      });
      toast.success('Email sent');
      onSent?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md border border-surface-border shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Mail size={18} className="text-sky-400" />
            Email client
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-surface-overlay rounded-lg" aria-label="Close">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {!gmailReady ? (
          <div className="text-sm text-slate-400 space-y-3">
            <p>
              Outbound email uses your Gmail account (send only — no inbox in VizoDesk). Add an app password under{' '}
              <Link to="/settings" className="text-brand-light hover:underline" onClick={onClose}>
                Settings → Email → Send from Gmail
              </Link>
              .
            </p>
            <button type="button" className="btn-secondary w-full justify-center" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-xs text-slate-500">
              Sends from your connected Gmail. The invoice uses your client portal link; the contract attaches the PDF when
              available, plus a link to review or sign.
            </p>

            {invoice ? (
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInvoice}
                  onChange={(e) => setIncludeInvoice(e.target.checked)}
                  className="rounded border-surface-border"
                />
                Include invoice {invoice.invoice_number ? `(${invoice.invoice_number})` : ''}
              </label>
            ) : null}

            {contract ? (
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeContract}
                  onChange={(e) => setIncludeContract(e.target.checked)}
                  className="rounded border-surface-border"
                />
                Include contract {contract.template_name ? `(${contract.template_name})` : ''}
                {contract.pdf_path ? <span className="text-slate-500">· PDF attachment if file exists</span> : null}
              </label>
            ) : null}

            <div>
              <label className="label">To</label>
              <input
                type="email"
                className="input"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="client@email.com"
              />
            </div>
            <div>
              <label className="label">Subject (optional)</label>
              <input type="text" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Auto if empty" />
            </div>
            <div>
              <label className="label">Message (optional)</label>
              <textarea className="input min-h-[88px] resize-y" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Short note above the links…" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" className="btn-secondary flex-1 justify-center" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1 justify-center" disabled={sending}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : 'Send email'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
