import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { openPdfBlobInNewTab } from '../lib/openPdfPreview';
import { FileText, Upload, Eye, Trash2, Copy, Mail, ScrollText, Pencil, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import { useAuth } from '../contexts/AuthContext';
import { clientBookingPortalUrl } from '../lib/portalLinks';
import SendClientDocumentsModal from '../components/SendClientDocumentsModal';

function StatusBadge({ status }) {
  return status === 'Signed' ? (
    <span className="badge-signed">Signed</span>
  ) : (
    <span className="badge-pending">Pending</span>
  );
}

export default function Contracts() {
  const { clientPortalBaseUrl } = useAuth();
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [appSettings, setAppSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [deleteUploadId, setDeleteUploadId] = useState(null);
  const [deletingUpload, setDeletingUpload] = useState(false);
  const [emailDocs, setEmailDocs] = useState(null);
  const [bookingTermsTemplates, setBookingTermsTemplates] = useState([]);
  const [bookingTermsReady, setBookingTermsReady] = useState(false);
  /** null | 'new' | numeric id */
  const [termsModalId, setTermsModalId] = useState(null);
  const [termsDraft, setTermsDraft] = useState({ name: '', content: '' });
  const [termsSaving, setTermsSaving] = useState(false);
  const [deleteTermsId, setDeleteTermsId] = useState(null);
  const [deletingTerms, setDeletingTerms] = useState(false);
  const fileRef = useRef(null);
  const showSpinner = useDelayedLoading(loading);

  const loadBookingTerms = () =>
    api
      .getBookingTermsTemplates()
      .then((rows) => {
        setBookingTermsTemplates(rows);
        setBookingTermsReady(true);
        return rows;
      })
      .catch(() => {
        toast.error('Failed to load portal terms presets');
        setBookingTermsTemplates([]);
        setBookingTermsReady(true);
      });

  const loadAll = () => {
    setLoading(true);
    loadBookingTerms();
    Promise.all([api.getContracts(), api.getContractUploads(), api.getInvoices(), api.getSettings()])
      .then(([c, u, inv, s]) => {
        setContracts(c);
        setUploads(u);
        setInvoices(inv);
        setAppSettings(s);
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error('Choose a PDF file');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are allowed');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (displayName.trim()) fd.append('name', displayName.trim());
      await api.uploadContract(fd);
      toast.success('Contract uploaded');
      setDisplayName('');
      if (fileRef.current) fileRef.current.value = '';
      const u = await api.getContractUploads();
      setUploads(u);
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const previewPdf = async (id) => {
    try {
      const blob = await api.fetchContractUploadPdfBlob(id);
      if (!blob) return;
      const { ok, reason } = openPdfBlobInNewTab(blob);
      if (!ok && reason === 'popup_blocked') {
        toast.error('Popup blocked — allow popups for this site to preview PDFs');
      }
    } catch {
      toast.error('Could not open PDF');
    }
  };

  const confirmDeleteUpload = async () => {
    if (deleteUploadId == null) return;
    const id = deleteUploadId;
    setDeletingUpload(true);
    try {
      await api.deleteContractUpload(id);
      toast.success('Removed');
      setUploads(await api.getContractUploads());
      setDeleteUploadId(null);
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setDeletingUpload(false);
    }
  };

  const openTermsCreate = () => {
    setTermsDraft({ name: '', content: '' });
    setTermsModalId('new');
  };

  const openTermsEdit = (row) => {
    setTermsDraft({ name: row.name || '', content: row.content || '' });
    setTermsModalId(row.id);
  };

  const saveTermsPreset = async () => {
    const name = termsDraft.name.trim();
    const content = termsDraft.content.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    if (!content) {
      toast.error('Terms text is required');
      return;
    }
    setTermsSaving(true);
    try {
      if (termsModalId === 'new') {
        await api.createBookingTermsTemplate({ name, content });
        toast.success('Saved preset');
      } else {
        await api.updateBookingTermsTemplate(termsModalId, { name, content });
        toast.success('Updated preset');
      }
      await loadBookingTerms();
      setTermsModalId(null);
    } catch (err) {
      toast.error(err.message || 'Save failed');
    } finally {
      setTermsSaving(false);
    }
  };

  const confirmDeleteTerms = async () => {
    if (deleteTermsId == null) return;
    const id = deleteTermsId;
    setDeletingTerms(true);
    try {
      await api.deleteBookingTermsTemplate(id);
      toast.success('Deleted');
      await loadBookingTerms();
      setDeleteTermsId(null);
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setDeletingTerms(false);
    }
  };

  const openEmailForContract = (row) => {
    const inv = invoices.find((i) => Number(i.booking_id) === Number(row.booking_id));
    setEmailDocs({
      invoice: inv
        ? {
            id: inv.id,
            client_email: inv.client_email || row.client_email,
            invoice_number: inv.invoice_number,
            public_token: inv.public_token,
          }
        : null,
      contract: {
        id: row.id,
        client_email: row.client_email,
        template_name: row.template_name,
        pdf_path: row.pdf_path,
        public_token: row.public_token,
      },
    });
  };

  const copyLink = (token) => {
    const r = clientBookingPortalUrl(clientPortalBaseUrl, token);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    navigator.clipboard.writeText(r.url);
    toast.success('Client link copied!');
  };

  return (
    <div className="space-y-8">
      {deleteUploadId != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-upload-title"
        >
          <div className="card w-full max-w-md border border-surface-border shadow-xl">
            <h2 id="delete-upload-title" className="text-lg font-semibold text-white mb-2">
              Delete this uploaded contract?
            </h2>
            <p className="text-sm text-slate-400 mb-5">The PDF will be removed from your library.</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="btn-secondary"
                disabled={deletingUpload}
                onClick={() => setDeleteUploadId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary bg-red-600 hover:bg-red-500 border-0"
                disabled={deletingUpload}
                onClick={confirmDeleteUpload}
              >
                {deletingUpload ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTermsId != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-terms-title"
        >
          <div className="card w-full max-w-md border border-surface-border shadow-xl">
            <h2 id="delete-terms-title" className="text-lg font-semibold text-white mb-2">
              Delete this terms preset?
            </h2>
            <p className="text-sm text-slate-400 mb-5">
              Existing bookings keep the text they already have. New bookings will no longer see this option in the
              dropdown.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="btn-secondary"
                disabled={deletingTerms}
                onClick={() => setDeleteTermsId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary bg-red-600 hover:bg-red-500 border-0"
                disabled={deletingTerms}
                onClick={confirmDeleteTerms}
              >
                {deletingTerms ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {termsModalId != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-editor-title"
        >
          <div className="card w-full max-w-2xl max-h-[90vh] flex flex-col border border-surface-border shadow-xl">
            <h2 id="terms-editor-title" className="text-lg font-semibold text-white mb-1 shrink-0">
              {termsModalId === 'new' ? 'New portal terms preset' : 'Edit portal terms preset'}
            </h2>
            <p className="text-xs text-slate-500 mb-4 shrink-0">
              This text is for the client booking page (sign below pricing), not PDF contracts.
            </p>
            <div className="space-y-3 flex-1 min-h-0 flex flex-col">
              <div>
                <label className="label">Preset name</label>
                <input
                  className="input"
                  placeholder="e.g. Photo & video — standard"
                  value={termsDraft.name}
                  onChange={(e) => setTermsDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <label className="label">Terms text</label>
                <textarea
                  className="input min-h-[200px] flex-1 resize-y font-sans leading-relaxed"
                  rows={12}
                  value={termsDraft.content}
                  onChange={(e) => setTermsDraft((d) => ({ ...d, content: e.target.value }))}
                  spellCheck
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-surface-border shrink-0">
              <button
                type="button"
                className="btn-secondary"
                disabled={termsSaving}
                onClick={() => setTermsModalId(null)}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={termsSaving} onClick={saveTermsPreset}>
                {termsSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">Contracts</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Upload PDF agreements and attach them to new bookings. {contracts.length} active booking contract(s).
        </p>
      </div>

      {/* PDF library */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between border-b border-surface-border pb-3">
          <h2 className="text-sm font-semibold text-slate-300">PDF contract library</h2>
          <span className="text-xs text-slate-500">{uploads.length} file(s)</span>
        </div>
        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Display name (optional)</label>
              <input
                className="input"
                placeholder="e.g. Wedding Agreement 2026"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">PDF file</label>
              <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="input text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand/20 file:text-brand-light" />
            </div>
          </div>
          <button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={uploading}>
            <Upload size={16} />
            {uploading ? 'Uploading…' : 'Upload contract'}
          </button>
        </form>

        {uploads.length === 0 ? (
          <p className="text-sm text-slate-600 py-2">No PDFs yet. Upload a contract to use it on the New Booking page.</p>
        ) : (
          <ul className="divide-y divide-surface-border rounded-lg border border-surface-border overflow-hidden">
            {uploads.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-surface-overlay/30 hover:bg-surface-overlay/50">
                <div>
                  <p className="font-medium text-slate-200">{u.name}</p>
                  <p className="text-xs text-slate-500">
                    Added {u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'}
                    {u.originalFilename ? ` · ${u.originalFilename}` : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => previewPdf(u.id)} className="btn-ghost text-sm p-2" title="Preview">
                    <Eye size={16} />
                  </button>
                  <button type="button" onClick={() => setDeleteUploadId(u.id)} className="btn-ghost text-sm p-2 text-red-400 hover:text-red-300" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Portal terms presets (client booking page) */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border pb-3">
          <div className="flex gap-3">
            <ScrollText className="text-brand-light shrink-0 mt-0.5" size={20} />
            <div>
              <h2 className="text-sm font-semibold text-slate-300">Portal terms presets</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-xl">
                Saved sets of terms for the client booking link (below pricing, with signature). Pick one on{' '}
                <span className="text-slate-400">New Booking</span> — you can still edit the text before creating the
                booking.
              </p>
            </div>
          </div>
          <button type="button" className="btn-secondary inline-flex items-center gap-2 shrink-0" onClick={openTermsCreate}>
            <Plus size={16} />
            Add preset
          </button>
        </div>
        {!bookingTermsReady ? (
          <p className="text-sm text-slate-600 py-2">Loading presets…</p>
        ) : bookingTermsTemplates.length === 0 ? (
          <p className="text-sm text-slate-600 py-2">No presets yet. Use Add preset to create one.</p>
        ) : (
          <ul className="divide-y divide-surface-border rounded-lg border border-surface-border overflow-hidden">
            {bookingTermsTemplates.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-surface-overlay/30 hover:bg-surface-overlay/50"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-200 truncate">{t.name}</p>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{t.content}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openTermsEdit(t)}
                    className="btn-ghost text-sm p-2"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTermsId(t.id)}
                    className="btn-ghost text-sm p-2 text-red-400 hover:text-red-300"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Booking contracts */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Booking contracts</h2>
        {showSpinner ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : contracts.length === 0 ? (
          <div className="card text-center py-14 text-slate-600">
            <FileText size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No booking contracts yet. Create a booking with a template or PDF.</p>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-surface-border bg-surface">
                <tr>
                  <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Client</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Event</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Package</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Contract</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Signed</th>
                  <th className="text-right text-xs font-medium text-slate-500 px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-overlay/40 transition-colors group">
                    <td className="px-5 py-3.5 font-medium text-slate-200">{c.client_name}</td>
                    <td className="px-5 py-3.5 text-slate-400">{c.event_type}</td>
                    <td className="px-5 py-3.5 text-slate-400">{c.package}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">
                      {c.template_name}
                      {c.pdf_path ? <span className="ml-1 text-brand-light">(PDF)</span> : null}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">
                      {c.signed_at ? new Date(c.signed_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEmailForContract(c)}
                        className="p-1.5 hover:bg-surface-overlay rounded transition-colors opacity-0 group-hover:opacity-100 mr-0.5"
                        title="Email invoice and/or contract"
                      >
                        <Mail size={14} className="text-sky-400" />
                      </button>
                      <button
                        type="button"
                        onClick={() => copyLink(c.public_token)}
                        className="p-1.5 hover:bg-surface-overlay rounded transition-colors opacity-0 group-hover:opacity-100"
                        title="Copy client link"
                      >
                        <Copy size={13} className="text-slate-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {emailDocs && (
        <SendClientDocumentsModal
          open={!!emailDocs}
          gmailReady={!!appSettings?.gmail_outbound_ready}
          invoice={emailDocs.invoice}
          contract={emailDocs.contract}
          onClose={() => setEmailDocs(null)}
          onSent={loadAll}
        />
      )}
    </div>
  );
}
