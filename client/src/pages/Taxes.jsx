import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { US_STATES, getStateByCode } from '../data/usStateTaxRates';
import { estimateTotalTaxes } from '../lib/taxEstimator';
import { Landmark, Loader2, Save, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDelayedLoading } from '../hooks/useDelayedLoading';

function formatMoney(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString()}`;
}

export default function Taxes() {
  const [loading, setLoading] = useState(true);
  const showSpinner = useDelayedLoading(loading);

  const [grossIncome, setGrossIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [homeState, setHomeState] = useState('');
  const [filingStatus, setFilingStatus] = useState('single');
  const [entityType, setEntityType] = useState('sole_prop');
  const [salesTaxPercent, setSalesTaxPercent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.getStats(), api.getSettings()])
      .then(([stats, settings]) => {
        setGrossIncome(Number(stats?.totalRevenue) || 0);
        setExpenses(Number(settings?.tax_ytd_expenses) || 0);
        setHomeState(settings?.tax_home_state || '');
        setFilingStatus(settings?.tax_filing_status === 'married_joint' ? 'married_joint' : 'single');
        setEntityType(settings?.tax_entity_type === 's_corp' ? 's_corp' : 'sole_prop');
        const r = Number(settings?.tax_sales_tax_rate) || 0;
        setSalesTaxPercent(r > 0 ? String((r * 100).toFixed(3).replace(/\.?0+$/, '')) : '');
      })
      .catch(() => toast.error('Failed to load tax data'))
      .finally(() => setLoading(false));
  }, []);

  const stateInfo = homeState ? getStateByCode(homeState) : null;
  const stateRate = stateInfo?.rate ?? 0;

  const salesTaxRateDecimal = Math.max(
    0,
    Math.min(0.25, (parseFloat(String(salesTaxPercent).replace(/,/g, '')) || 0) / 100)
  );

  const estimate = useMemo(
    () =>
      estimateTotalTaxes({
        grossBusinessIncome: grossIncome,
        businessExpenses: expenses,
        stateRate,
        filingStatus,
        entityType,
        salesTaxRate: salesTaxRateDecimal,
      }),
    [grossIncome, expenses, stateRate, filingStatus, entityType, salesTaxRateDecimal]
  );

  const saveAssumptions = async () => {
    if (homeState && !getStateByCode(homeState)) {
      toast.error('Select a valid state');
      return;
    }
    setSaving(true);
    try {
      await api.updateSettings({
        tax_home_state: homeState || '',
        tax_ytd_expenses: expenses,
        tax_filing_status: filingStatus,
        tax_entity_type: entityType,
        tax_sales_tax_rate: salesTaxRateDecimal,
      });
      toast.success('Tax settings saved');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (showSpinner) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  const seLabel =
    entityType === 's_corp'
      ? 'Self-employment tax (off for S-corp in this model)'
      : 'Self-employment tax (SS + Medicare)';

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center">
            <Landmark size={20} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Taxes</h1>
        </div>
        <p className="text-slate-500 text-sm">
          Estimate income taxes from your business revenue; choose filing status and entity. Each completed payment also gets an estimated tax breakdown (see Payments).
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 flex gap-3">
        <Info size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/90 leading-relaxed">
          <strong className="text-amber-100">Not tax advice.</strong> Illustrative numbers only. S-corp mode ignores self-employment tax and does not model officer wages.
          Sales tax here assumes you collect it on gross receipts at the rate you enter — verify nexus and rates with your state.
        </p>
      </div>

      <div className="card space-y-5">
        <h2 className="text-base font-semibold text-white">Your situation</h2>

        <div>
          <label className="label">Federal filing status</label>
          <select
            className="input appearance-none cursor-pointer"
            value={filingStatus}
            onChange={(e) => setFilingStatus(e.target.value)}
          >
            <option value="single">Single</option>
            <option value="married_joint">Married filing jointly</option>
          </select>
        </div>

        <div>
          <label className="label">Business entity (federal estimate)</label>
          <select
            className="input appearance-none cursor-pointer"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          >
            <option value="sole_prop">Sole proprietor / LLC (disregarded)</option>
            <option value="s_corp">S-corp (simplified — no SE tax in this model)</option>
          </select>
        </div>

        <div>
          <label className="label">Home state (work primarily)</label>
          <select
            className="input appearance-none cursor-pointer"
            value={homeState}
            onChange={(e) => setHomeState(e.target.value)}
          >
            <option value="">Select state…</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-600 mt-1.5">
            State income tax uses an illustrative effective rate — not your exact local brackets.
          </p>
        </div>

        <div>
          <label className="label">Sales tax rate you collect (%)</label>
          <input
            type="text"
            inputMode="decimal"
            className="input"
            placeholder="e.g. 8.25"
            value={salesTaxPercent}
            onChange={(e) => setSalesTaxPercent(e.target.value)}
          />
          <p className="text-xs text-slate-600 mt-1.5">
            Applied to gross receipts for planning. Stored per account; each paid booking accrues this % on the payment amount automatically.
          </p>
        </div>

        <div>
          <label className="label">Business gross income (YTD or period)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={grossIncome || ''}
            onChange={(e) => setGrossIncome(parseFloat(e.target.value) || 0)}
          />
          <p className="text-xs text-slate-600 mt-1.5">
            Pre-filled from completed payments in VizoDesk; adjust if you track income elsewhere.
          </p>
        </div>

        <div>
          <label className="label">Deductible business expenses (same period)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={expenses || ''}
            onChange={(e) => setExpenses(parseFloat(e.target.value) || 0)}
          />
        </div>

        <button type="button" className="btn-primary" disabled={saving} onClick={saveAssumptions}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving…' : 'Save tax settings'}
        </button>
      </div>

      <div className="card space-y-6">
        <h2 className="text-base font-semibold text-white">Estimated taxes</h2>
        <p className="text-xs text-slate-500">{estimate.filingNote}</p>
        {!homeState ? (
          <p className="text-sm text-slate-500">Select your state to include state income tax in the total.</p>
        ) : (
          <p className="text-sm text-slate-400">
            <span className="text-white font-medium">{stateInfo.name}</span> illustrative rate{' '}
            <span className="text-slate-300">{(stateRate * 100).toFixed(2)}%</span>
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg bg-surface-overlay/60 border border-surface-border p-4">
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Net profit (after expenses)</p>
            <p className="text-xl font-bold text-white tabular-nums">{formatMoney(estimate.netSelfEmployment)}</p>
          </div>
          <div className="rounded-lg bg-surface-overlay/60 border border-surface-border p-4">
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Income + payroll taxes (est.)</p>
            <p className="text-xl font-bold text-emerald-300 tabular-nums">{formatMoney(estimate.totalEstimated)}</p>
          </div>
        </div>

        {estimate.salesTaxOnCollections > 0 && (
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4 text-sm">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Sales tax on collections (if charged)</p>
            <p className="text-lg font-semibold text-sky-300 tabular-nums">{formatMoney(estimate.salesTaxOnCollections)}</p>
            <p className="text-xs text-slate-500 mt-2">
              Combined planning total: {formatMoney(estimate.totalWithSalesTax)} (income taxes + sales tax pass-through)
            </p>
          </div>
        )}

        <div className="divide-y divide-surface-border border border-surface-border rounded-lg overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 bg-surface-overlay/30">
            <span className="text-slate-300 text-sm">{seLabel}</span>
            <span className="text-white font-semibold tabular-nums">{formatMoney(estimate.selfEmploymentTax.total)}</span>
          </div>
          {entityType !== 's_corp' && (
            <div className="px-4 py-2 pl-6 text-xs text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Social Security (12.4% up to wage base)</span>
                <span className="tabular-nums">{formatMoney(estimate.selfEmploymentTax.socialSecurity)}</span>
              </div>
              <div className="flex justify-between">
                <span>Medicare (2.9%)</span>
                <span className="tabular-nums">{formatMoney(estimate.selfEmploymentTax.medicare)}</span>
              </div>
            </div>
          )}
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-slate-300 text-sm">Federal income tax (est.)</span>
            <span className="text-white font-semibold tabular-nums">{formatMoney(estimate.federalIncomeTax)}</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3 bg-surface-overlay/30">
            <span className="text-slate-300 text-sm">State income tax (est.)</span>
            <span className="text-white font-semibold tabular-nums">{formatMoney(estimate.stateIncomeTax)}</span>
          </div>
        </div>

        <div className="rounded-lg border border-brand/25 bg-brand/5 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Suggested quarterly (income taxes ÷ 4)</p>
          <p className="text-2xl font-bold text-white tabular-nums">{formatMoney(estimate.quarterlySuggested)}</p>
          <p className="text-xs text-slate-500 mt-2">
            IRS estimated tax due dates: typically April, June, September, and January. Confirm with IRS Pub 505.
          </p>
        </div>

        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-300">How this is calculated</summary>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            <li>Net = gross income − expenses (not below $0).</li>
            <li>
              {entityType === 's_corp'
                ? 'S-corp: self-employment tax not applied in this simplified view.'
                : 'SE tax: 92.35% of net × 12.4% SS (capped at 2025 wage base) + 2.9% Medicare.'}
            </li>
            <li>
              Federal taxable ≈ net − ½ SE tax − {formatMoney(estimate.standardDeductionUsed)} standard deduction (
              {filingStatus === 'married_joint' ? 'MFJ' : 'single'}).
            </li>
            <li>2025 federal brackets for {filingStatus === 'married_joint' ? 'married filing jointly' : 'single'}.</li>
            <li>State: illustrative rate × (net − ½ SE tax).</li>
            <li>Sales tax line: gross × your entered % (separate from income tax).</li>
            <li>
              <strong>Per payment:</strong> when a booking is marked paid, VizoDesk stores the marginal change in SE, federal, and state vs. before that payment, plus sales tax on that payment amount.
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
}
