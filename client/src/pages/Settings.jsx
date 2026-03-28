import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { validateClientPortalBaseUrl, PORTAL_ROUTE } from '../lib/portalLinks';
import {
  CircleHelp, LogOut, Save, Loader2, Palette, Pencil, ImageIcon, Upload,
  Lock, Mail, Search, CreditCard, Plug,
} from 'lucide-react';
import toast from 'react-hot-toast';

const COMPANY_TYPES = ['Photography', 'Videography', 'Photo & Video', 'Other'];

const emptyPaymentPortal = () => ({
  zelle: { instructions: '', qr_data_url: null, copy_text: '' },
  cashapp: { instructions: '', qr_data_url: null, copy_text: '' },
  venmo: { instructions: '', qr_data_url: null, copy_text: '' },
});

const SOON_IDS = new Set(['ai', 'team', 'membership', 'bank', 'payment-methods']);

const COMPANY_NAV = [
  { id: 'brand', label: 'Company brand' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'email', label: 'Email settings' },
  { id: 'ai', label: 'VizoDesk AI', soon: true },
  { id: 'portal', label: 'Client portal & domain' },
  { id: 'square', label: 'Square payments' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'team', label: 'Team', soon: true },
  { id: 'membership', label: 'Membership', soon: true },
  { id: 'bank', label: 'Bank details', soon: true },
  { id: 'payment-methods', label: 'Client payment methods', soon: true },
];

function ToggleRow({ id, title, description, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-surface-border last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-200">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-snug">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised ${
          checked ? 'bg-brand' : 'bg-slate-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function SoonPanel({ title }) {
  return (
    <div className="card border border-surface-border py-20 px-6 text-center">
      <p className="text-slate-400 text-sm">{title} is coming soon.</p>
    </div>
  );
}

function emptyIntegrationMeta() {
  return {
    sync_secret: { configured: false, preview: null },
  };
}

function formatWebsiteHref(raw) {
  const w = String(raw || '').trim();
  if (!w) return '#';
  if (/^https?:\/\//i.test(w)) return w;
  return `https://${w.replace(/^\/+/, '')}`;
}

function lineLooksLikeUrl(line) {
  const t = String(line || '').trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^www\./i.test(t)) return true;
  return /^[a-z0-9][-a-z0-9.]*\.[a-z]{2,}(\/[^\s]*)?$/i.test(t);
}

function buildAutoSignatureParts(userName, companyType, bizName, website, phone) {
  const parts = [];
  if (userName?.trim()) parts.push({ type: 'text', text: userName.trim() });
  if (companyType?.trim()) parts.push({ type: 'text', text: companyType.trim() });
  if (bizName?.trim()) parts.push({ type: 'text', text: bizName.trim() });
  if (website?.trim()) {
    const href = formatWebsiteHref(website.trim());
    const display = website.trim().replace(/^https?:\/\//i, '');
    parts.push({ type: 'link', text: display, href });
  }
  if (phone?.trim()) parts.push({ type: 'text', text: phone.trim() });
  return parts;
}

function autoSignaturePlainText(parts) {
  return parts.map((p) => p.text).join('\n');
}

function SignaturePreviewBlock({ customSig, autoParts }) {
  const useCustom = Boolean(customSig?.trim());
  if (useCustom) {
    const lines = customSig.split('\n');
    return (
      <div className="text-sm space-y-0.5 min-h-[120px]">
        {lines.map((line, i) => {
          if (!line.trim()) return <div key={i} className="h-2" />;
          if (lineLooksLikeUrl(line)) {
            const href = formatWebsiteHref(line);
            const display = line.trim().replace(/^https?:\/\//i, '');
            return (
              <p key={i}>
                <a href={href} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                  {display}
                </a>
              </p>
            );
          }
          return (
            <p key={i} className="text-slate-200">
              {line}
            </p>
          );
        })}
      </div>
    );
  }
  return (
    <div className="text-sm space-y-0.5 min-h-[120px]">
      {autoParts.map((p, i) =>
        p.type === 'link' ? (
          <p key={i}>
            <a href={p.href} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
              {p.text}
            </a>
          </p>
        ) : (
          <p key={i} className="text-slate-200">
            {p.text}
          </p>
        )
      )}
    </div>
  );
}

export default function Settings() {
  const { user, logout, refreshAppSettings } = useAuth();
  const navigate = useNavigate();
  const [mainTab, setMainTab] = useState('company');
  const [activeSection, setActiveSection] = useState('brand');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingBrandLook, setSavingBrandLook] = useState(false);
  const [savingPortal, setSavingPortal] = useState(false);
  const [paymentPortal, setPaymentPortal] = useState(emptyPaymentPortal);
  const [savingPaymentPortal, setSavingPaymentPortal] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [businessName, setBusinessName] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessWebsite, setBusinessWebsite] = useState('');
  const [companyType, setCompanyType] = useState('Photography');
  const [brandColor, setBrandColor] = useState('#a21caf');
  const [businessLogoDataUrl, setBusinessLogoDataUrl] = useState('');
  const businessLogoInputRef = useRef(null);
  const [portalUrl, setPortalUrl] = useState('');

  const [errCompanyName, setErrCompanyName] = useState('');
  const [errCompanyEmail, setErrCompanyEmail] = useState('');

  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyPayment, setNotifyPayment] = useState(true);
  const [notifyContract, setNotifyContract] = useState(true);
  const [notifyCalendar, setNotifyCalendar] = useState(false);

  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [gmailAddress, setGmailAddress] = useState('');
  const [gmailAppPasswordDraft, setGmailAppPasswordDraft] = useState('');
  const [gmailOutboundReady, setGmailOutboundReady] = useState(false);
  const [savingGmail, setSavingGmail] = useState(false);

  const [squareLocationId, setSquareLocationId] = useState('');
  const [squareEnvironment, setSquareEnvironment] = useState('sandbox');
  const [squareAccessTokenDraft, setSquareAccessTokenDraft] = useState('');
  const [squareWebhookUrl, setSquareWebhookUrl] = useState('');
  const [squareWebhookSecretDraft, setSquareWebhookSecretDraft] = useState('');
  const [squareAccessTokenSaved, setSquareAccessTokenSaved] = useState(false);
  const [squareWebhookSecretSet, setSquareWebhookSecretSet] = useState(false);
  const [squarePaymentsReady, setSquarePaymentsReady] = useState(false);
  const [savingSquare, setSavingSquare] = useState(false);

  const [integrationMeta, setIntegrationMeta] = useState(() => emptyIntegrationMeta());
  const [syncSecretDraft, setSyncSecretDraft] = useState('');
  const [savingIntegrationField, setSavingIntegrationField] = useState(null);

  const [emailSignature, setEmailSignature] = useState('');
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [sigDraft, setSigDraft] = useState('');
  const [savingSig, setSavingSig] = useState(false);

  const [emailTemplates, setEmailTemplates] = useState([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplSearch, setTplSearch] = useState('');
  const [tplSort, setTplSort] = useState('new');
  const [newTplOpen, setNewTplOpen] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplSaving, setNewTplSaving] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setBusinessName(s.business_name || '');
        setBusinessEmail(s.business_email || '');
        setBusinessPhone(s.business_phone || '');
        setBusinessWebsite(s.business_website || '');
        setCompanyType(s.company_type || 'Photography');
        setBrandColor(s.brand_color || '#a21caf');
        setBusinessLogoDataUrl(
          typeof s.business_logo_data_url === 'string' ? s.business_logo_data_url : ''
        );
        setPortalUrl(s.client_portal_base_url || '');
        setPaymentPortal(
          s.payment_portal
            ? {
                zelle: { ...emptyPaymentPortal().zelle, ...s.payment_portal.zelle },
                cashapp: { ...emptyPaymentPortal().cashapp, ...s.payment_portal.cashapp },
                venmo: { ...emptyPaymentPortal().venmo, ...s.payment_portal.venmo },
              }
            : emptyPaymentPortal()
        );
        setEmailSignature(s.email_signature || '');
        setGmailAddress(s.gmail_sender_address || '');
        setGmailOutboundReady(!!s.gmail_outbound_ready);
        setGmailAppPasswordDraft('');
        setSquareLocationId(s.square_location_id || '');
        setSquareEnvironment(s.square_environment === 'production' ? 'production' : 'sandbox');
        setSquareAccessTokenDraft('');
        setSquareWebhookUrl(s.square_webhook_notification_url || '');
        setSquareWebhookSecretDraft('');
        setSquareAccessTokenSaved(!!s.square_access_token_saved);
        setSquareWebhookSecretSet(!!s.square_webhook_secret_set);
        setSquarePaymentsReady(!!s.square_payments_ready);
        setIntegrationMeta({ ...emptyIntegrationMeta(), ...(s.integration_secrets || {}) });
        setSyncSecretDraft('');
        setNotifyEmail(!!s.notify_email);
        setNotifyPayment(!!s.notify_payment);
        setNotifyContract(!!s.notify_contract);
        setNotifyCalendar(!!s.notify_calendar);
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (mainTab !== 'company' || activeSection !== 'email') return;
    setTplLoading(true);
    api
      .getEmailTemplates()
      .then((r) => setEmailTemplates(Array.isArray(r.templates) ? r.templates : []))
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setTplLoading(false));
  }, [mainTab, activeSection]);

  const patchNotify = async (key, value) => {
    setToggling(true);
    try {
      await api.updateSettings({ [key]: value });
      toast.success('Preference saved');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
      if (key === 'notify_email') setNotifyEmail(!value);
      if (key === 'notify_payment') setNotifyPayment(!value);
      if (key === 'notify_contract') setNotifyContract(!value);
      if (key === 'notify_calendar') setNotifyCalendar(!value);
    } finally {
      setToggling(false);
    }
  };

  const saveCompanyProfile = async () => {
    const name = businessName.trim();
    const email = businessEmail.trim();
    setErrCompanyName(!name ? 'Company name is required' : '');
    setErrCompanyEmail(!email ? 'Company email is required' : '');
    if (!name || !email) return;

    setSavingProfile(true);
    try {
      await api.updateSettings({
        business_name: name,
        business_email: email,
        business_phone: businessPhone.trim(),
        business_website: businessWebsite.trim(),
        company_type: companyType,
        brand_color: brandColor,
      });
      toast.success('Company profile saved');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingProfile(false);
    }
  };

  const saveBrandLookOnly = async () => {
    setSavingBrandLook(true);
    try {
      await api.updateSettings({
        brand_color: brandColor,
        business_logo_data_url: businessLogoDataUrl.trim() ? businessLogoDataUrl : '',
      });
      toast.success('Brand & logo saved');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingBrandLook(false);
    }
  };

  const onBusinessLogoFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
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
      if (url.length > 580000) {
        toast.error('Logo is too large after encoding — use a smaller image');
        return;
      }
      setBusinessLogoDataUrl(url);
    };
    r.readAsDataURL(file);
  };

  const patchPaymentPortal = (key, partial) => {
    setPaymentPortal((p) => ({ ...p, [key]: { ...p[key], ...partial } }));
  };

  const onPaymentQrFile = (key, e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (f.size > 450 * 1024) {
      toast.error('Image must be under 450 KB');
      return;
    }
    const r = new FileReader();
    r.onload = () => patchPaymentPortal(key, { qr_data_url: r.result });
    r.readAsDataURL(f);
  };

  const savePaymentPortalOnly = async () => {
    setSavingPaymentPortal(true);
    try {
      await api.updateSettings({ payment_portal: paymentPortal });
      toast.success('Payment instructions saved');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingPaymentPortal(false);
    }
  };

  const saveSquareSettings = async () => {
    setSavingSquare(true);
    try {
      const payload = {
        square_location_id: squareLocationId.trim(),
        square_environment: squareEnvironment,
      };
      if (squareWebhookUrl.trim()) {
        payload.square_webhook_notification_url = squareWebhookUrl.trim();
      } else {
        payload.square_webhook_notification_url = null;
      }
      if (squareAccessTokenDraft.trim()) {
        payload.square_access_token = squareAccessTokenDraft.trim();
      }
      if (squareWebhookSecretDraft.trim()) {
        payload.square_webhook_signature_key = squareWebhookSecretDraft.trim();
      }
      const s = await api.updateSettings(payload);
      setSquareAccessTokenDraft('');
      setSquareWebhookSecretDraft('');
      setSquareAccessTokenSaved(!!s.square_access_token_saved);
      setSquareWebhookSecretSet(!!s.square_webhook_secret_set);
      setSquarePaymentsReady(!!s.square_payments_ready);
      toast.success('Square settings saved');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingSquare(false);
    }
  };

  const removeSquareAccessToken = async () => {
    if (!window.confirm('Remove the saved Square access token from this server?')) return;
    setSavingSquare(true);
    try {
      const s = await api.updateSettings({ square_access_token: '' });
      setSquareAccessTokenDraft('');
      setSquareAccessTokenSaved(!!s.square_access_token_saved);
      setSquarePaymentsReady(!!s.square_payments_ready);
      toast.success('Access token removed');
    } catch (e) {
      toast.error(e.message || 'Failed to remove token');
    } finally {
      setSavingSquare(false);
    }
  };

  const removeSquareWebhookSecret = async () => {
    if (!window.confirm('Remove the saved webhook signing secret?')) return;
    setSavingSquare(true);
    try {
      const s = await api.updateSettings({ square_webhook_signature_key: '' });
      setSquareWebhookSecretDraft('');
      setSquareWebhookSecretSet(!!s.square_webhook_secret_set);
      toast.success('Webhook signing secret removed');
    } catch (e) {
      toast.error(e.message || 'Failed to remove secret');
    } finally {
      setSavingSquare(false);
    }
  };

  const saveIntegrationField = async (fieldKey) => {
    const map = { sync_secret: syncSecretDraft };
    const v = String(map[fieldKey] || '').trim();
    if (!v) {
      toast.error('Enter a value to save');
      return;
    }
    setSavingIntegrationField(fieldKey);
    try {
      const s = await api.saveIntegrationSecrets({ [fieldKey]: v });
      if (fieldKey === 'sync_secret') setSyncSecretDraft('');
      if (s.integration_secrets) setIntegrationMeta({ ...emptyIntegrationMeta(), ...s.integration_secrets });
      toast.success('Saved successfully');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingIntegrationField(null);
    }
  };

  const removeIntegrationField = async (fieldKey) => {
    if (!window.confirm('Remove this value from the server database? Environment variable fallback still applies if set.')) return;
    setSavingIntegrationField(fieldKey);
    try {
      const s = await api.saveIntegrationSecrets({ [fieldKey]: '' });
      if (s.integration_secrets) setIntegrationMeta({ ...emptyIntegrationMeta(), ...s.integration_secrets });
      toast.success('Removed stored value');
    } catch (e) {
      toast.error(e.message || 'Failed to remove');
    } finally {
      setSavingIntegrationField(null);
    }
  };

  const savePortalOnly = async () => {
    setSavingPortal(true);
    try {
      const trimmed = portalUrl.trim();
      let portalPayload = null;
      if (!trimmed) {
        portalPayload = null;
      } else {
        const v = validateClientPortalBaseUrl(trimmed);
        if (!v.ok) {
          toast.error(v.error);
          setSavingPortal(false);
          return;
        }
        portalPayload = v.normalized;
      }
      await api.updateSettings({ client_portal_base_url: portalPayload });
      await refreshAppSettings();
      toast.success('Portal URL saved');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingPortal(false);
    }
  };

  const exportData = async () => {
    try {
      const data = await api.exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vizodesk-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (e) {
      toast.error(e.message || 'Export failed');
    }
  };

  const submitPassword = async () => {
    if (pwdNew !== pwdConfirm) {
      toast.error('New passwords do not match');
      return;
    }
    setPwdSaving(true);
    try {
      await api.changePassword({ current_password: pwdCurrent, new_password: pwdNew });
      toast.success('Password updated');
      setPwdOpen(false);
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
    } catch (e) {
      toast.error(e.message || 'Could not update password');
    } finally {
      setPwdSaving(false);
    }
  };

  const submitDeleteAccount = async () => {
    setDeleteBusy(true);
    try {
      await api.deleteAccount(deletePassword);
      localStorage.removeItem('vizo_token');
      toast.success('Account deleted');
      navigate('/login', { replace: true });
    } catch (e) {
      toast.error(e.message || 'Could not delete account');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navPick = (item) => {
    setActiveSection(item.id);
  };

  const signatureAutoParts = buildAutoSignatureParts(
    user?.name,
    companyType,
    businessName,
    businessWebsite,
    businessPhone
  );

  const openSignatureEditor = () => {
    setSigDraft(emailSignature.trim() ? emailSignature : autoSignaturePlainText(signatureAutoParts));
    setSigModalOpen(true);
  };

  const saveGmailOutbound = async () => {
    const addr = gmailAddress.trim();
    if (!addr) {
      toast.error('Enter the Gmail address you send from');
      return;
    }
    if (!gmailOutboundReady && !gmailAppPasswordDraft.trim()) {
      toast.error('Enter your Gmail app password');
      return;
    }
    setSavingGmail(true);
    try {
      const body = { gmail_sender_address: addr };
      if (gmailAppPasswordDraft.trim()) body.gmail_app_password = gmailAppPasswordDraft.trim();
      await api.updateSettings(body);
      setGmailAppPasswordDraft('');
      const s = await api.getSettings();
      setGmailOutboundReady(!!s.gmail_outbound_ready);
      setGmailAddress(s.gmail_sender_address || '');
      toast.success('Gmail sending saved');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingGmail(false);
    }
  };

  const clearGmailOutbound = async () => {
    setSavingGmail(true);
    try {
      await api.updateSettings({ gmail_sender_address: '', gmail_app_password: '' });
      setGmailAddress('');
      setGmailAppPasswordDraft('');
      setGmailOutboundReady(false);
      toast.success('Gmail sending removed');
    } catch (e) {
      toast.error(e.message || 'Failed to clear');
    } finally {
      setSavingGmail(false);
    }
  };

  const saveEmailSignature = async () => {
    setSavingSig(true);
    try {
      await api.updateSettings({ email_signature: sigDraft });
      setEmailSignature(sigDraft);
      toast.success('Email signature saved');
      setSigModalOpen(false);
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingSig(false);
    }
  };

  const createNewTemplate = async () => {
    const n = newTplName.trim();
    if (!n) {
      toast.error('Enter a template name');
      return;
    }
    setNewTplSaving(true);
    try {
      const { template } = await api.createEmailTemplate(n);
      setEmailTemplates((prev) => [template, ...prev]);
      setNewTplName('');
      setNewTplOpen(false);
      toast.success('Template created');
    } catch (e) {
      toast.error(e.message || 'Failed to create');
    } finally {
      setNewTplSaving(false);
    }
  };

  const filteredSortedTemplates = (() => {
    let list = [...emailTemplates];
    const q = tplSearch.trim().toLowerCase();
    if (q) list = list.filter((t) => String(t.name).toLowerCase().includes(q));
    if (tplSort === 'name') {
      list.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
    } else {
      list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }
    return list;
  })();

  const customizeTheme = () => {
    toast('Theme customization is coming soon.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  const tabBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setMainTab(id)}
      className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
        mainTab === id
          ? 'text-white border-brand'
          : 'text-slate-500 border-transparent hover:text-slate-300'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto pb-24 relative">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-slate-500 text-sm mt-1.5">Manage your account and preferences.</p>
      </div>

      <div className="flex gap-10 border-b border-surface-border mb-8">
        {tabBtn('account', 'My Account')}
        {tabBtn('company', 'Company')}
      </div>

      {mainTab === 'account' && (
        <div className="max-w-xl space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Profile</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="label">Name</p>
                <p className="text-slate-200 font-medium">{user?.name}</p>
              </div>
              <div>
                <p className="label">Login email</p>
                <p className="text-slate-200 font-medium">{user?.email}</p>
              </div>
            </div>
          </div>
          <div className="card space-y-3">
            <h2 className="text-lg font-semibold text-white mb-1">Security & data</h2>
            <button
              type="button"
              onClick={() => setPwdOpen(true)}
              className="w-full py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 shadow-md shadow-fuchsia-900/20 transition-all"
            >
              Change password
            </button>
            <button
              type="button"
              onClick={exportData}
              className="w-full py-3 rounded-lg font-semibold text-white bg-surface-overlay hover:bg-surface-border border border-surface-border transition-colors"
            >
              Export data
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="w-full py-3 rounded-lg font-semibold text-red-400 bg-transparent hover:bg-red-500/10 border border-red-500/40 transition-colors"
            >
              Delete account
            </button>
            <button type="button" onClick={handleLogout} className="btn-ghost text-slate-400 hover:text-slate-200 justify-center w-full mt-1">
              <LogOut size={16} /> Sign out
            </button>
          </div>
          <div className="card border-surface-border">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">API & Square</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Card checkout uses your Square app. Configure credentials under{' '}
              <button
                type="button"
                className="text-brand hover:underline font-medium"
                onClick={() => {
                  setMainTab('company');
                  setActiveSection('square');
                }}
              >
                Company → Square payments
              </button>
              . You can still use <code className="text-brand-light bg-surface-overlay px-1 py-0.5 rounded">SQUARE_*</code> in{' '}
              <code className="text-brand-light bg-surface-overlay px-1 py-0.5 rounded">server/.env</code> if you prefer.{' '}
              <a href="https://developer.squareup.com/apps" target="_blank" rel="noreferrer" className="text-brand hover:underline">
                Square Developer
              </a>
            </p>
          </div>
        </div>
      )}

      {mainTab === 'company' && (
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
          <aside className="w-full lg:w-56 flex-shrink-0">
            <nav className="lg:sticky lg:top-4 space-y-0.5" aria-label="Company settings">
              {COMPANY_NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navPick(item)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === item.id
                      ? 'bg-brand/15 text-white border border-brand/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-surface-overlay/80 border border-transparent'
                  }`}
                >
                  {item.label}
                  {item.soon ? <span className="text-slate-600 text-xs ml-1">· Soon</span> : null}
                </button>
              ))}
            </nav>
          </aside>

          <div className="flex-1 min-w-0 space-y-8">
            {SOON_IDS.has(activeSection) ? (
              <SoonPanel title={COMPANY_NAV.find((n) => n.id === activeSection)?.label || 'This section'} />
            ) : null}

            {activeSection === 'brand' && (
              <>
                <section className="card">
                  <h2 className="text-lg font-semibold text-white mb-1">Build up your professional presence</h2>
                  <p className="text-xs text-slate-500 mb-6">Clients see this information on proposals and emails.</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <label className="label mb-0">Company name</label>
                        <Pencil size={14} className="text-slate-500 flex-shrink-0 mt-0.5" aria-hidden />
                      </div>
                      <input
                        className={`input ${errCompanyName ? 'border-red-500/60 ring-1 ring-red-500/25' : ''}`}
                        value={businessName}
                        onChange={(e) => {
                          setBusinessName(e.target.value);
                          if (errCompanyName) setErrCompanyName('');
                        }}
                        placeholder="Enter company name"
                      />
                      {errCompanyName ? <p className="text-xs text-red-400 mt-1">{errCompanyName}</p> : null}
                      <p className="text-xs text-slate-500 mt-2">{user?.name}</p>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="label">Company type</label>
                        <select
                          className="input appearance-none cursor-pointer"
                          value={companyType}
                          onChange={(e) => setCompanyType(e.target.value)}
                        >
                          {COMPANY_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Company email *</label>
                        <input
                          type="email"
                          className={`input ${errCompanyEmail ? 'border-red-500/60 ring-1 ring-red-500/25' : ''}`}
                          value={businessEmail}
                          onChange={(e) => {
                            setBusinessEmail(e.target.value);
                            if (errCompanyEmail) setErrCompanyEmail('');
                          }}
                          placeholder="email@email.com"
                        />
                        {errCompanyEmail ? <p className="text-xs text-red-400 mt-1">{errCompanyEmail}</p> : null}
                      </div>
                      <div>
                        <label className="label">Phone number</label>
                        <input className="input" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} placeholder="Phone number" />
                      </div>
                      <div>
                        <label className="label">Company website</label>
                        <input
                          className="input"
                          value={businessWebsite}
                          onChange={(e) => setBusinessWebsite(e.target.value)}
                          placeholder="https://www.website.com"
                        />
                      </div>
                    </div>
                  </div>
                  <button type="button" className="btn-primary mt-8" disabled={savingProfile} onClick={saveCompanyProfile}>
                    {savingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {savingProfile ? 'Saving…' : 'Save company profile'}
                  </button>
                </section>

                <section className="card">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    <div>
                      <h2 className="text-lg font-semibold text-white mb-2">Company smart file theme</h2>
                      <p className="text-sm text-slate-500 leading-relaxed mb-5">
                        Save time and automatically apply a default theme to new files clients see. Customize fonts and colors to match your brand.
                      </p>
                      <button
                        type="button"
                        onClick={customizeTheme}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-500/50 text-slate-200 text-sm font-medium hover:bg-surface-overlay transition-colors"
                      >
                        <Palette size={18} />
                        Customize company theme
                      </button>
                    </div>
                    <div
                      className="rounded-xl border border-surface-border p-5 bg-surface-overlay/40"
                      style={{ borderColor: `${brandColor}40` }}
                    >
                      <p className="text-xs text-slate-500 mb-3">Default theme preview</p>
                      <p className="text-sm text-white font-medium mb-3" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                        Inter
                      </p>
                      <div className="flex gap-2 mb-4">
                        <span className="w-8 h-8 rounded-full bg-[#2a2a38] border border-surface-border" />
                        <span className="w-8 h-8 rounded-full bg-[#1e1b2e] border border-surface-border" />
                        <span className="w-8 h-8 rounded-full border border-white/10" style={{ backgroundColor: brandColor }} />
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed mb-2">
                        Sample paragraph with a{' '}
                        <span className="underline font-medium" style={{ color: brandColor }}>
                          link style
                        </span>{' '}
                        for emphasis.
                      </p>
                      <button
                        type="button"
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                        style={{ backgroundColor: brandColor }}
                      >
                        Button
                      </button>
                    </div>
                  </div>
                </section>

                <section className="card">
                  <h2 className="text-lg font-semibold text-white mb-1">Brand elements</h2>
                  <p className="text-xs text-slate-500 mb-5">
                    Logo appears on booking payment receipt PDFs and on printed invoices when an invoice has no its own logo.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-6 mb-6">
                    <div className="flex-shrink-0">
                      <input
                        ref={businessLogoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={onBusinessLogoFile}
                      />
                      <button
                        type="button"
                        onClick={() => businessLogoInputRef.current?.click()}
                        className="w-[200px] min-h-[140px] rounded-xl border-2 border-dashed border-surface-border hover:border-slate-500 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm transition-colors p-4"
                      >
                        {businessLogoDataUrl ? (
                          <img src={businessLogoDataUrl} alt="" className="max-h-24 max-w-full object-contain" />
                        ) : (
                          <>
                            <ImageIcon size={28} />
                            <span>Company logo</span>
                            <Upload size={14} className="opacity-60" />
                          </>
                        )}
                      </button>
                      {businessLogoDataUrl ? (
                        <button
                          type="button"
                          className="mt-2 text-xs text-red-400 hover:text-red-300"
                          onClick={() => setBusinessLogoDataUrl('')}
                        >
                          Remove logo
                        </button>
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="label">Brand color</label>
                      <p className="text-xs text-slate-500 mb-2">
                        Used for buttons, invoice table headers, and receipt PDF accents.
                      </p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <input
                          type="color"
                          value={brandColor.length === 7 ? brandColor : '#a21caf'}
                          onChange={(e) => setBrandColor(e.target.value)}
                          className="w-12 h-12 rounded-lg border border-surface-border cursor-pointer bg-transparent"
                          aria-label="Pick brand color"
                        />
                        <input
                          className="input max-w-[140px] font-mono text-sm"
                          value={brandColor}
                          onChange={(e) => setBrandColor(e.target.value)}
                          placeholder="#912ea8"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="btn-primary" disabled={savingBrandLook} onClick={saveBrandLookOnly}>
                      {savingBrandLook ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      {savingBrandLook ? 'Saving…' : 'Save brand & logo'}
                    </button>
                  </div>
                </section>
              </>
            )}

            {activeSection === 'preferences' && (
              <div className="card">
                <h2 className="text-lg font-semibold text-white mb-2">Preferences</h2>
                <p className="text-sm text-slate-500 mb-4">Control alerts for your workflow.</p>
                <div className="-mx-1">
                  <ToggleRow
                    id="notify-email"
                    title="Email notifications"
                    description="Receive email updates for bookings."
                    checked={notifyEmail}
                    disabled={toggling}
                    onChange={(v) => {
                      setNotifyEmail(v);
                      patchNotify('notify_email', v);
                    }}
                  />
                  <ToggleRow
                    id="notify-payment"
                    title="Payment alerts"
                    description="Get notified when payments are received."
                    checked={notifyPayment}
                    disabled={toggling}
                    onChange={(v) => {
                      setNotifyPayment(v);
                      patchNotify('notify_payment', v);
                    }}
                  />
                  <ToggleRow
                    id="notify-contract"
                    title="Contract signed"
                    description="Alert when a client signs a contract."
                    checked={notifyContract}
                    disabled={toggling}
                    onChange={(v) => {
                      setNotifyContract(v);
                      patchNotify('notify_contract', v);
                    }}
                  />
                  <ToggleRow
                    id="notify-calendar"
                    title="Calendar reminders"
                    description="Upcoming event reminders."
                    checked={notifyCalendar}
                    disabled={toggling}
                    onChange={(v) => {
                      setNotifyCalendar(v);
                      patchNotify('notify_calendar', v);
                    }}
                  />
                </div>
              </div>
            )}

            {activeSection === 'email' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Email settings</h2>
                  <p className="text-slate-500 text-sm mt-1.5">Manage your email templates and set email signature.</p>
                  <p className="text-sm text-slate-500 mt-4 flex flex-wrap items-center gap-1.5">
                    <Lock size={14} className="text-slate-500 flex-shrink-0" aria-hidden />
                    <span>Only moderators or admins can edit.</span>
                    <button
                      type="button"
                      className="text-sky-400 hover:text-sky-300 hover:underline font-medium"
                      onClick={() => setActiveSection('preferences')}
                    >
                      Manage in preferences
                    </button>
                  </p>
                </div>

                <div className="card">
                  <h3 className="text-base font-semibold text-white mb-1">Email signature</h3>
                  <p className="text-sm text-slate-500 mb-5">
                    Edit your email signature here and include it when you draft emails.
                  </p>
                  <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <div className="flex-1 min-w-0 rounded-lg border border-surface-border bg-surface-overlay/40 p-4">
                      <SignaturePreviewBlock customSig={emailSignature} autoParts={signatureAutoParts} />
                    </div>
                    <button
                      type="button"
                      onClick={openSignatureEditor}
                      className="flex-shrink-0 self-end px-4 py-2 rounded-lg border border-slate-500/60 text-sm font-medium text-white hover:bg-surface-overlay transition-colors"
                    >
                      Edit email signature
                    </button>
                  </div>
                </div>

                <div className="card space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1">Send from Gmail (outbound only)</h3>
                    <p className="text-sm text-slate-500">
                      VizoDesk sends email through your Gmail account. It does not read your inbox. Use a Google{' '}
                      <a
                        href="https://support.google.com/accounts/answer/185833"
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-400 hover:underline"
                      >
                        App Password
                      </a>{' '}
                      (not your normal Gmail password). The app password is encrypted on the server.
                    </p>
                  </div>
                  <div>
                    <label className="label">Gmail address (From)</label>
                    <input
                      type="email"
                      className="input"
                      value={gmailAddress}
                      onChange={(e) => setGmailAddress(e.target.value)}
                      placeholder="you@gmail.com"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="label">Gmail app password</label>
                    <input
                      type="password"
                      className="input"
                      value={gmailAppPasswordDraft}
                      onChange={(e) => setGmailAppPasswordDraft(e.target.value)}
                      placeholder={gmailOutboundReady ? 'Leave blank to keep existing password' : '16-character app password'}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary text-sm inline-flex items-center gap-2"
                      disabled={savingGmail}
                      onClick={saveGmailOutbound}
                    >
                      {savingGmail ? <Loader2 size={15} className="animate-spin" /> : null}
                      Save Gmail settings
                    </button>
                    {gmailOutboundReady ? (
                      <button type="button" className="btn-secondary text-sm" disabled={savingGmail} onClick={clearGmailOutbound}>
                        Remove Gmail
                      </button>
                    ) : null}
                  </div>
                  {gmailOutboundReady ? (
                    <p className="text-xs text-emerald-400/90">Gmail sending is configured.</p>
                  ) : (
                    <p className="text-xs text-slate-600">Not configured — you cannot email invoices or contracts until this is saved.</p>
                  )}
                </div>

                <div className="card overflow-hidden flex flex-col">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <h3 className="text-base font-semibold text-white">
                      Email templates ({emailTemplates.length})
                    </h3>
                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-3">
                      <select
                        className="input py-2 text-sm min-w-[160px]"
                        value={tplSort}
                        onChange={(e) => setTplSort(e.target.value)}
                        aria-label="Sort templates"
                      >
                        <option value="new">Sort by: Newly created</option>
                        <option value="name">Sort by: Name</option>
                      </select>
                      <div className="relative flex-1 min-w-[140px] sm:max-w-[200px]">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <input
                          className="input pl-9 py-2 text-sm"
                          placeholder="Search…"
                          value={tplSearch}
                          onChange={(e) => setTplSearch(e.target.value)}
                          aria-label="Search templates"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewTplOpen(true)}
                        className="text-sm font-semibold text-sky-400 hover:text-sky-300 whitespace-nowrap text-left sm:text-right"
                      >
                        + New template
                      </button>
                    </div>
                  </div>
                  <div className="border-t border-surface-border max-h-[320px] overflow-y-auto -mx-5 px-5">
                    {tplLoading ? (
                      <div className="py-10 flex justify-center">
                        <Loader2 className="w-6 h-6 text-brand animate-spin" />
                      </div>
                    ) : filteredSortedTemplates.length === 0 ? (
                      <p className="py-8 text-sm text-slate-500 text-center">No templates match your search.</p>
                    ) : (
                      <ul className="divide-y divide-surface-border">
                        {filteredSortedTemplates.map((t) => (
                          <li key={t.id} className="flex items-center gap-3 py-3.5">
                            <Mail size={18} className="text-slate-400 flex-shrink-0" />
                            <span className="text-sm text-slate-200 font-medium">{t.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'portal' && (
              <div className="card">
                <h2 className="text-lg font-semibold text-white mb-2">Client portal & domain</h2>
                <p className="text-sm text-slate-500 mb-4">
                  Base URL where your client portal is hosted. Used when you copy booking links and for Square checkout return URLs.
                </p>
                <label className="label">Portal base URL</label>
                <input
                  className="input"
                  value={portalUrl}
                  onChange={(e) => setPortalUrl(e.target.value)}
                  placeholder="https://portal.yourstudio.com"
                />
                <p className="text-xs text-slate-600 mt-2">
                  Paths: <code className="text-slate-500">/{PORTAL_ROUTE.booking}/:token</code>,{' '}
                  <code className="text-slate-500">/{PORTAL_ROUTE.contract}/:token</code>, etc.
                </p>
                <button type="button" className="btn-primary mt-5" disabled={savingPortal} onClick={savePortalOnly}>
                  {savingPortal ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {savingPortal ? 'Saving…' : 'Save portal URL'}
                </button>

                <div className="mt-10 pt-8 border-t border-surface-border">
                  <h3 className="text-base font-semibold text-white mb-1">Bank / app payment (client portal)</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    When clients choose Zelle, Cash App, or Venmo on a booking link, they&apos;ll see these instructions,
                    optional payee text with a Copy button, and optional QR codes before confirming they sent the retainer.
                  </p>

                  {(['zelle', 'cashapp', 'venmo']).map((key) => {
                    const labels = { zelle: 'Zelle', cashapp: 'Cash App', venmo: 'Venmo' };
                    const instructionPlaceholders = {
                      zelle: 'e.g. Send the retainer to yourstudio@email.com or (555) 555-0100',
                      cashapp: 'e.g. Send the retainer to $YourCashtag',
                      venmo: 'e.g. Send the retainer to @YourHandle',
                    };
                    const copyPlaceholders = {
                      zelle: 'yourstudio@email.com or (555) 555-0100',
                      cashapp: '$YourCashtag',
                      venmo: '@YourHandle',
                    };
                    const v = paymentPortal[key];
                    return (
                      <div key={key} className="mb-5 rounded-xl border border-surface-border p-4 space-y-3">
                        <p className="text-sm font-medium text-slate-200">{labels[key]}</p>
                        <div>
                          <label className="label">Instructions</label>
                          <textarea
                            className="input min-h-[88px] text-sm resize-y"
                            value={v.instructions}
                            onChange={(e) => patchPaymentPortal(key, { instructions: e.target.value })}
                            placeholder={instructionPlaceholders[key]}
                          />
                        </div>
                        <div>
                          <label className="label">Copy button (optional)</label>
                          <p className="text-xs text-slate-600 mb-1.5">
                            Exact email, phone, $Cashtag, or @handle — clients tap Copy so they don&apos;t have to type it.
                          </p>
                          <input
                            type="text"
                            className="input text-sm"
                            value={v.copy_text ?? ''}
                            onChange={(e) => patchPaymentPortal(key, { copy_text: e.target.value })}
                            placeholder={copyPlaceholders[key]}
                            maxLength={500}
                          />
                        </div>
                        <div>
                          <label className="label">QR code (optional)</label>
                          <input
                            type="file"
                            accept="image/*"
                            className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-surface-overlay file:px-3 file:py-1.5 file:text-slate-200"
                            onChange={(e) => onPaymentQrFile(key, e)}
                          />
                          {v.qr_data_url ? (
                            <div className="mt-2 flex items-start gap-3">
                              <img
                                src={v.qr_data_url}
                                alt=""
                                className="h-28 w-28 rounded-lg border border-surface-border object-contain bg-surface-overlay"
                              />
                              <button
                                type="button"
                                className="btn-ghost text-xs text-rose-400"
                                onClick={() => patchPaymentPortal(key, { qr_data_url: null })}
                              >
                                Remove QR
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    className="btn-primary"
                    disabled={savingPaymentPortal}
                    onClick={savePaymentPortalOnly}
                  >
                    {savingPaymentPortal ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {savingPaymentPortal ? 'Saving…' : 'Save payment instructions'}
                  </button>
                </div>
              </div>
            )}

            {activeSection === 'square' && (
              <div className="card">
                <div className="flex items-start gap-3 mb-4">
                  <div className="mt-0.5 rounded-lg bg-surface-overlay p-2 border border-surface-border">
                    <CreditCard size={20} className="text-brand" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Square payments</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Connect your Square application so clients can pay by card from the portal. Values are stored encrypted on the server;
                      environment variables still apply as a fallback.
                    </p>
                  </div>
                </div>

                <div
                  className={`rounded-lg border px-4 py-3 mb-6 text-sm ${
                    squarePaymentsReady
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200/90'
                      : 'border-amber-500/30 bg-amber-500/5 text-amber-100/90'
                  }`}
                >
                  {squarePaymentsReady
                    ? 'Square is ready for checkout (access token and location ID are set).'
                    : 'Add an access token and location ID to enable card checkout.'}
                </div>

                <label className="label">Application access token</label>
                <p className="text-xs text-slate-600 mb-1.5">
                  From{' '}
                  <a
                    href="https://developer.squareup.com/apps"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 hover:underline"
                  >
                    Square Developer
                  </a>
                  — paste a new token here to replace the saved one. Leave blank to keep the current token.
                </p>
                <input
                  type="password"
                  className="input font-mono text-sm"
                  value={squareAccessTokenDraft}
                  onChange={(e) => setSquareAccessTokenDraft(e.target.value)}
                  placeholder={squareAccessTokenSaved ? '•••••••• (saved — enter new token to replace)' : 'Sandbox or production access token'}
                  autoComplete="off"
                />
                {squareAccessTokenSaved ? (
                  <button
                    type="button"
                    className="btn-ghost text-xs text-rose-400 mt-2"
                    disabled={savingSquare}
                    onClick={removeSquareAccessToken}
                  >
                    Remove saved access token
                  </button>
                ) : null}

                <label className="label mt-6">Location ID</label>
                <p className="text-xs text-slate-600 mb-1.5">Square Dashboard → Locations — copy the location ID used for online payments.</p>
                <input
                  className="input font-mono text-sm"
                  value={squareLocationId}
                  onChange={(e) => setSquareLocationId(e.target.value)}
                  placeholder="e.g. LXXXXXXXXXXXXX"
                />

                <label className="label mt-6">Environment</label>
                <select
                  className="input text-sm"
                  value={squareEnvironment}
                  onChange={(e) => setSquareEnvironment(e.target.value)}
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </select>

                <div className="mt-10 pt-8 border-t border-surface-border">
                  <h3 className="text-base font-semibold text-white mb-1">Webhooks (server-wide)</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    Used to mark Square card payments as completed when Square notifies your API. Set the subscription URL in the Square
                    Developer console to match your public API, e.g.{' '}
                    <code className="text-slate-400 text-xs">https://your-api.example.com/api/payments/square/webhook</code>.
                  </p>

                  <label className="label">Notification URL (must match Square webhook subscription)</label>
                  <input
                    className="input font-mono text-sm"
                    value={squareWebhookUrl}
                    onChange={(e) => setSquareWebhookUrl(e.target.value)}
                    placeholder="https://your-api.example.com/api/payments/square/webhook"
                  />

                  <label className="label mt-6">Webhook signature key</label>
                  <p className="text-xs text-slate-600 mb-1.5">From the webhook subscription in Square Developer. Leave blank to keep the saved key.</p>
                  <input
                    type="password"
                    className="input font-mono text-sm"
                    value={squareWebhookSecretDraft}
                    onChange={(e) => setSquareWebhookSecretDraft(e.target.value)}
                    placeholder={squareWebhookSecretSet ? '•••••••• (saved — enter new key to replace)' : 'Signature key'}
                    autoComplete="off"
                  />
                  {squareWebhookSecretSet ? (
                    <button
                      type="button"
                      className="btn-ghost text-xs text-rose-400 mt-2"
                      disabled={savingSquare}
                      onClick={removeSquareWebhookSecret}
                    >
                      Remove saved signing secret
                    </button>
                  ) : null}
                </div>

                <button type="button" className="btn-primary mt-8" disabled={savingSquare} onClick={saveSquareSettings}>
                  {savingSquare ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {savingSquare ? 'Saving…' : 'Save Square settings'}
                </button>
              </div>
            )}

            {activeSection === 'integrations' && (
              <div className="card">
                <div className="flex items-start gap-3 mb-4">
                  <div className="mt-0.5 rounded-lg bg-surface-overlay p-2 border border-surface-border">
                    <Plug size={20} className="text-brand" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Integrations</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Cloud sync secret is stored encrypted on this server.{' '}
                      <code className="text-brand-light bg-surface-overlay px-1 py-0.5 rounded text-xs">SYNC_SECRET</code> in{' '}
                      <code className="text-brand-light bg-surface-overlay px-1 py-0.5 rounded text-xs">server/.env</code> is used only
                      when nothing is saved here.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="label">Sync secret</label>
                  <p className="text-xs text-slate-600 mb-1.5">
                    Bearer token for{' '}
                    <code className="text-slate-500">/api/public/bookings</code> and local → cloud booking sync. Must match on both ends.
                  </p>
                  <input
                    type="password"
                    className="input font-mono text-sm"
                    value={syncSecretDraft}
                    onChange={(e) => setSyncSecretDraft(e.target.value)}
                    placeholder={
                      integrationMeta.sync_secret?.configured && integrationMeta.sync_secret?.preview
                        ? `${integrationMeta.sync_secret.preview} (saved — enter new to replace)`
                        : 'Long random string'
                    }
                    autoComplete="off"
                  />
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!!savingIntegrationField}
                      onClick={() => saveIntegrationField('sync_secret')}
                    >
                      {savingIntegrationField === 'sync_secret' ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Save size={16} />
                      )}
                      {savingIntegrationField === 'sync_secret' ? 'Saving…' : 'Save'}
                    </button>
                    {integrationMeta.sync_secret?.configured ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs text-rose-400"
                        disabled={!!savingIntegrationField}
                        onClick={() => removeIntegrationField('sync_secret')}
                      >
                        Remove stored secret
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className="fixed bottom-6 right-6 w-11 h-11 rounded-full bg-surface-raised border border-surface-border text-slate-400 hover:text-white hover:border-brand/40 shadow-lg flex items-center justify-center z-40"
        title="Help"
        aria-label="Help"
      >
        <CircleHelp size={20} />
      </button>

      {sigModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="card w-full max-w-lg border border-surface-border shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-2">Edit email signature</h2>
            <p className="text-xs text-slate-500 mb-4">One line per row. URLs will show as links in the preview.</p>
            <textarea
              className="input min-h-[200px] font-mono text-sm resize-y"
              value={sigDraft}
              onChange={(e) => setSigDraft(e.target.value)}
              placeholder={'Your name\nCompany type\nStudio LLC\nyoursite.com\n(555) 555-0100'}
            />
            <div className="flex gap-3 justify-end mt-5">
              <button type="button" className="btn-secondary" disabled={savingSig} onClick={() => setSigModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={savingSig} onClick={saveEmailSignature}>
                {savingSig ? 'Saving…' : 'Save signature'}
              </button>
            </div>
          </div>
        </div>
      )}

      {newTplOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="card w-full max-w-md border border-surface-border shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-4">New email template</h2>
            <label className="label">Template name</label>
            <input
              className="input"
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              placeholder="e.g. Booking follow-up"
              autoFocus
            />
            <div className="flex gap-3 justify-end mt-6">
              <button type="button" className="btn-secondary" disabled={newTplSaving} onClick={() => { setNewTplOpen(false); setNewTplName(''); }}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={newTplSaving} onClick={createNewTemplate}>
                {newTplSaving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pwdOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="card w-full max-w-md border border-surface-border shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-4">Change password</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Current password</label>
                <input type="password" className="input" value={pwdCurrent} onChange={(e) => setPwdCurrent(e.target.value)} autoComplete="current-password" />
              </div>
              <div>
                <label className="label">New password</label>
                <input type="password" className="input" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} autoComplete="new-password" />
              </div>
              <div>
                <label className="label">Confirm new password</label>
                <input type="password" className="input" value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button type="button" className="btn-secondary" disabled={pwdSaving} onClick={() => setPwdOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={pwdSaving} onClick={submitPassword}>
                {pwdSaving ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="card w-full max-w-md border border-red-500/30 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete account?</h2>
            <p className="text-sm text-slate-400 mb-4">
              This permanently removes your account, clients, bookings, and related data. This cannot be undone.
            </p>
            <div>
              <label className="label">Confirm with your password</label>
              <input type="password" className="input" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button type="button" className="btn-secondary" disabled={deleteBusy} onClick={() => { setDeleteOpen(false); setDeletePassword(''); }}>
                Cancel
              </button>
              <button type="button" className="btn-primary bg-red-600 hover:bg-red-500 border-0" disabled={deleteBusy} onClick={submitDeleteAccount}>
                {deleteBusy ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
