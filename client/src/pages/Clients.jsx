import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { api } from '../lib/api';
import {
  formatUSPhoneDisplay,
  countDigitsBeforeIndex,
  caretAfterUSPhoneFormat,
} from '../lib/phoneInputFormat';
import { Plus, Search, Edit2, Trash2, Phone, Mail, ChevronRight, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDelayedLoading } from '../hooks/useDelayedLoading';

function ClientModal({ client, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name: client?.full_name || '',
    email: client?.email || '',
    phone: formatUSPhoneDisplay(client?.phone || '') || '',
    notes: client?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const phoneInputRef = useRef(null);
  const phoneCaretDigits = useRef(null);

  useEffect(() => {
    setForm({
      full_name: client?.full_name || '',
      email: client?.email || '',
      phone: formatUSPhoneDisplay(client?.phone || '') || '',
      notes: client?.notes || '',
    });
  }, [client]);

  const handle = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      const sel = e.target.selectionStart ?? value.length;
      const formatted = formatUSPhoneDisplay(value);
      phoneCaretDigits.current = countDigitsBeforeIndex(value, sel);
      setForm((f) => ({ ...f, phone: formatted }));
      return;
    }
    setForm((f) => ({ ...f, [name]: value }));
  };

  useLayoutEffect(() => {
    const digits = phoneCaretDigits.current;
    if (digits === null) return;
    const el = phoneInputRef.current;
    if (!el || document.activeElement !== el) {
      phoneCaretDigits.current = null;
      return;
    }
    const pos = caretAfterUSPhoneFormat(form.phone, digits);
    el.setSelectionRange(pos, pos);
    phoneCaretDigits.current = null;
  }, [form.phone]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const saved = client
        ? await api.updateClient(client.id, form)
        : await api.createClient(form);
      toast.success(client ? 'Client updated' : 'Client created');
      onSave(saved);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">{client ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-overlay rounded-lg"><X size={16} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Full Name *</label>
            <input name="full_name" className="input" required placeholder="John Doe" value={form.full_name} onChange={handle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input name="email" type="email" className="input" placeholder="client@example.com" value={form.email} onChange={handle} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                ref={phoneInputRef}
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                className="input"
                placeholder="(555) 010-0199"
                value={form.phone}
                onChange={handle}
              />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea name="notes" className="input resize-none" rows={3} placeholder="Internal notes..." value={form.notes} onChange={handle} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={loading}>
              {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Save Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const showSpinner = useDelayedLoading(loading);

  useEffect(() => {
    api.getClients()
      .then(setClients)
      .catch(() => toast.error('Failed to load clients'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = (saved) => {
    setClients(prev => {
      const idx = prev.findIndex(c => c.id === saved.id);
      return idx >= 0 ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev];
    });
    setModal(null);
  };

  const confirmDeleteClient = async () => {
    if (deleteConfirmId == null) return;
    const id = deleteConfirmId;
    setDeleting(true);
    try {
      await api.deleteClient(id);
      setClients((prev) => prev.filter((c) => c.id !== id));
      toast.success('Client deleted');
      setDeleteConfirmId(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {deleteConfirmId != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-client-title"
        >
          <div className="card w-full max-w-md border border-surface-border shadow-xl">
            <h2 id="delete-client-title" className="text-lg font-semibold text-white mb-2">
              Delete client?
            </h2>
            <p className="text-sm text-slate-400 mb-5">This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="btn-secondary"
                disabled={deleting}
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary bg-red-600 hover:bg-red-500 border-0"
                disabled={deleting}
                onClick={confirmDeleteClient}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-slate-500 text-sm mt-0.5">{clients.length} clients total</p>
        </div>
        <button className="btn-primary" onClick={() => setModal('new')}>
          <Plus size={16} /> Add Client
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-10"
          placeholder="Search clients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {showSpinner ? (
        <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-14 text-slate-600">
          <p className="text-sm">No clients found.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(client => (
            <div key={client.id} className="card hover:border-surface-border/80 transition-colors group flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand/40 to-brand-dark/40 flex items-center justify-center text-brand-light font-bold text-sm flex-shrink-0">
                {client.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-200">{client.full_name}</p>
                <div className="flex items-center gap-4 mt-0.5">
                  {client.email && <span className="text-xs text-slate-500 flex items-center gap-1"><Mail size={11} />{client.email}</span>}
                  {client.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone size={11} />{client.phone}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setModal(client)}
                  className="p-2 hover:bg-surface-overlay rounded-lg transition-colors"
                >
                  <Edit2 size={14} className="text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(client.id)}
                  className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <ClientModal
          client={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
