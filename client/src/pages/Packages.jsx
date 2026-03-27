import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Package, Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../lib/formatCurrency';

/** Avoid showing literal "null" from bad API/DB values when optional fields are empty. */
function cleanDisplayText(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (s === 'null' || s === 'undefined') return '';
  return s;
}

const EMPTY_FORM = {
  label: '',
  display_title: '',
  icon: '',
  tagline: '',
  featuresText: '',
  coverage_heading: '',
  coverageItemsText: '',
  suggested_price: '',
  sort_order: '0',
};

export default function Packages() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = () =>
    api
      .getPackages()
      .then(setList)
      .catch(() => toast.error('Failed to load packages'))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      label: cleanDisplayText(row.label),
      display_title: cleanDisplayText(row.display_title),
      icon: cleanDisplayText(row.icon),
      tagline: cleanDisplayText(row.tagline),
      featuresText: (row.features || []).join('\n'),
      coverage_heading: cleanDisplayText(row.coverage_heading),
      coverageItemsText: (row.coverage_items || []).join('\n'),
      suggested_price: row.suggested_price != null ? String(row.suggested_price) : '',
      sort_order: String(row.sort_order ?? 0),
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const label = String(form.label || '').trim();
    if (!label) {
      toast.error('Package label is required (shown on bookings & portal)');
      return;
    }
    const payload = {
      label,
      display_title: String(form.display_title || '').trim() || null,
      icon: String(form.icon || '').trim() || null,
      tagline: String(form.tagline || '').trim() || null,
      features: String(form.featuresText || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
      coverage_heading: String(form.coverage_heading || '').trim() || null,
      coverage_items: String(form.coverageItemsText || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
      sort_order: parseInt(form.sort_order, 10) || 0,
    };
    const sp = String(form.suggested_price || '').trim();
    if (sp === '') {
      payload.suggested_price = null;
    } else {
      const n = Number.parseFloat(sp.replace(/[$,]/g, ''));
      if (!Number.isFinite(n) || n < 0) {
        toast.error('Suggested price must be a valid number');
        return;
      }
      payload.suggested_price = n;
    }

    setSaving(true);
    try {
      if (editingId) {
        await api.updatePackage(editingId, payload);
        toast.success('Package updated');
      } else {
        await api.createPackage(payload);
        toast.success('Package created');
      }
      await load();
      closeModal();
    } catch (err) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await api.deletePackage(deleteId);
      toast.success('Package deleted');
      setDeleteId(null);
      await load();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/20 flex items-center justify-center">
            <Package className="text-brand" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Packages</h1>
            <p className="text-slate-500 text-sm">
              Save deliverables once, then pick a package on new bookings — clients see details on their portal link.
            </p>
          </div>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary sm:ml-auto">
          <Plus size={16} />
          New package
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card border border-dashed border-surface-border py-16 text-center">
          <p className="text-slate-400 text-sm mb-4">No saved packages yet.</p>
          <button type="button" onClick={openCreate} className="btn-secondary text-sm">
            Create your first package
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((row) => (
            <li key={row.id} className="card flex flex-col sm:flex-row sm:items-start gap-4 border border-surface-border">
              <div className="flex gap-3 flex-1 min-w-0">
                {cleanDisplayText(row.icon) ? (
                  <span className="text-2xl flex-shrink-0 leading-none" aria-hidden>
                    {cleanDisplayText(row.icon)}
                  </span>
                ) : null}
                <div className="min-w-0">
                  <p className="text-white font-semibold">{cleanDisplayText(row.label)}</p>
                  {cleanDisplayText(row.display_title) ? (
                    <p className="text-slate-300 text-sm mt-0.5 font-medium tracking-wide">
                      {cleanDisplayText(row.display_title)}
                    </p>
                  ) : null}
                  {cleanDisplayText(row.tagline) ? (
                    <p className="text-slate-500 text-sm mt-1">{cleanDisplayText(row.tagline)}</p>
                  ) : null}
                  {row.features?.length ? (
                    <ul className="mt-2 text-sm text-slate-400 list-disc list-inside space-y-0.5">
                      {row.features.slice(0, 4).map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                      {row.features.length > 4 ? (
                        <li className="text-slate-600 list-none -ml-4">+{row.features.length - 4} more…</li>
                      ) : null}
                    </ul>
                  ) : null}
                  {row.suggested_price != null ? (
                    <p className="text-xs text-slate-600 mt-2">
                      Suggested price: {formatCurrency(row.suggested_price)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2 sm:flex-col sm:items-end flex-shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="btn-ghost text-sm py-2 px-3"
                  title="Edit"
                >
                  <Pencil size={15} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(row.id)}
                  className="btn-ghost text-sm py-2 px-3 text-rose-400 hover:text-rose-300"
                  title="Delete"
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-20"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pkg-modal-title"
        >
          <form
            onSubmit={handleSave}
            className="card w-full max-w-lg shrink-0 border border-surface-border shadow-xl space-y-4"
          >
            <h2 id="pkg-modal-title" className="text-lg font-semibold text-white">
              {editingId ? 'Edit package' : 'New package'}
            </h2>

            <div>
              <label className="label">Booking label *</label>
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. 5 hour photo"
                required
                autoComplete="off"
              />
              <p className="text-xs text-slate-600 mt-1">Short name on the booking and portal summary line.</p>
            </div>

            <div>
              <label className="label">Display title (optional)</label>
              <input
                className="input"
                value={form.display_title}
                onChange={(e) => setForm((f) => ({ ...f, display_title: e.target.value }))}
                placeholder="e.g. THE ESSENTIAL COLLECTION"
                autoComplete="off"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Icon (emoji)</label>
                <input
                  className="input"
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  placeholder="💎"
                  maxLength={8}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="label">Sort order</label>
                <input
                  className="input"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="label">Tagline (optional)</label>
              <textarea
                className="input min-h-[72px] resize-y"
                value={form.tagline}
                onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                placeholder="One short line under the package name…"
                rows={2}
              />
            </div>

            <div>
              <label className="label">Deliverables / features</label>
              <textarea
                className="input min-h-[120px] font-mono text-sm resize-y"
                value={form.featuresText}
                onChange={(e) => setForm((f) => ({ ...f, featuresText: e.target.value }))}
                placeholder={'One line per item:\n200+ professionally edited images\nOnline gallery\n4K highlight film'}
                rows={6}
              />
            </div>

            <div>
              <label className="label">Coverage section heading (optional)</label>
              <input
                className="input"
                value={form.coverage_heading}
                onChange={(e) => setForm((f) => ({ ...f, coverage_heading: e.target.value }))}
                placeholder="e.g. Coverage may include:"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="label">Coverage bullets (optional)</label>
              <textarea
                className="input min-h-[100px] font-mono text-sm resize-y"
                value={form.coverageItemsText}
                onChange={(e) => setForm((f) => ({ ...f, coverageItemsText: e.target.value }))}
                placeholder={'One line per item:\nCeremony\nReception\nFirst dances'}
                rows={5}
              />
            </div>

            <div>
              <label className="label">Suggested price ($)</label>
              <input
                className="input"
                value={form.suggested_price}
                onChange={(e) => setForm((f) => ({ ...f, suggested_price: e.target.value }))}
                placeholder="Optional — fills package price when you pick this package"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-surface-border">
              <button type="button" onClick={closeModal} className="btn-secondary text-sm">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary text-sm">
                {saving ? <Loader2 className="animate-spin" size={16} /> : editingId ? 'Save changes' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteId != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="del-pkg-title"
        >
          <div className="card w-full max-w-md border border-surface-border shadow-xl">
            <h2 id="del-pkg-title" className="text-lg font-semibold text-white mb-2">
              Delete this package?
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              Existing bookings keep the package name but will no longer show the deliverables block until you link
              another template.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setDeleteId(null)} className="btn-secondary text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="btn-primary text-sm bg-rose-600 hover:bg-rose-500 border-0"
              >
                {deleting ? <Loader2 className="animate-spin" size={16} /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
