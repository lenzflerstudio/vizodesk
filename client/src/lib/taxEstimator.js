/**
 * Simplified US tax estimates. Not tax advice.
 * SE: SS wage base 2025 $176,100. Federal 2025-ish brackets.
 */

const SS_WAGE_BASE_2025 = 176100;
const STANDARD_DEDUCTION_SINGLE_2025 = 15750;
const STANDARD_DEDUCTION_MFJ_2025 = 31500;

const FEDERAL_BRACKETS_SINGLE_2025 = [
  { limit: 11925, rate: 0.1 },
  { limit: 48475, rate: 0.12 },
  { limit: 103350, rate: 0.22 },
  { limit: 197300, rate: 0.24 },
  { limit: 250525, rate: 0.32 },
  { limit: 626350, rate: 0.35 },
  { limit: Infinity, rate: 0.37 },
];

const FEDERAL_BRACKETS_MFJ_2025 = [
  { limit: 23850, rate: 0.1 },
  { limit: 96950, rate: 0.12 },
  { limit: 206700, rate: 0.22 },
  { limit: 394600, rate: 0.24 },
  { limit: 501050, rate: 0.32 },
  { limit: 751600, rate: 0.35 },
  { limit: Infinity, rate: 0.37 },
];

function federalIncomeTaxBrackets(taxableOrdinaryIncome, brackets) {
  const t = Math.max(0, taxableOrdinaryIncome);
  let tax = 0;
  let priorLimit = 0;
  for (const { limit, rate } of brackets) {
    const width = Math.min(t, limit) - priorLimit;
    if (width > 0) tax += width * rate;
    priorLimit = limit;
    if (t <= limit) break;
  }
  return tax;
}

export function estimateSelfEmploymentTax(netSelfEmploymentIncome) {
  const net = Math.max(0, netSelfEmploymentIncome);
  const seBase = net * 0.9235;
  const ssWages = Math.min(seBase, SS_WAGE_BASE_2025);
  const socialSecurity = ssWages * 0.124;
  const medicare = seBase * 0.029;
  const total = socialSecurity + medicare;
  return {
    seBase,
    socialSecurity,
    medicare,
    total,
    deductibleHalf: total * 0.5,
  };
}

function zeroSe(netSE) {
  const seBase = netSE * 0.9235;
  return {
    seBase,
    socialSecurity: 0,
    medicare: 0,
    total: 0,
    deductibleHalf: 0,
  };
}

/**
 * @param {object} opts
 * @param {string} [opts.filingStatus] 'single' | 'married_joint'
 * @param {string} [opts.entityType] 'sole_prop' | 's_corp'
 * @param {number} [opts.salesTaxRate] 0–1, applied to gross for "if you collect sales tax" annual line only
 */
export function estimateTotalTaxes({
  grossBusinessIncome,
  businessExpenses,
  stateRate,
  filingStatus = 'single',
  entityType = 'sole_prop',
  salesTaxRate = 0,
}) {
  const gross = Math.max(0, Number(grossBusinessIncome) || 0);
  const exp = Math.max(0, Number(businessExpenses) || 0);
  const netSE = Math.max(0, gross - exp);

  const se = entityType === 's_corp' ? zeroSe(netSE) : estimateSelfEmploymentTax(netSE);

  const std =
    filingStatus === 'married_joint' ? STANDARD_DEDUCTION_MFJ_2025 : STANDARD_DEDUCTION_SINGLE_2025;
  const brackets =
    filingStatus === 'married_joint' ? FEDERAL_BRACKETS_MFJ_2025 : FEDERAL_BRACKETS_SINGLE_2025;

  const federalTaxable = Math.max(0, netSE - se.deductibleHalf - std);
  const federalIncome = federalIncomeTaxBrackets(federalTaxable, brackets);

  const stateBase = Math.max(0, netSE - se.deductibleHalf);
  const stateIncome = Math.max(0, stateBase * Math.max(0, Math.min(1, Number(stateRate) || 0)));

  const incomeTaxTotal = se.total + federalIncome + stateIncome;

  const sr = Math.max(0, Math.min(0.25, Number(salesTaxRate) || 0));
  const salesTaxOnCollections = gross * sr;

  const filingNote =
    entityType === 's_corp'
      ? 'S-corp (simplified: no SE tax modeled; reasonable salary not included)'
      : filingStatus === 'married_joint'
        ? 'Married filing jointly, standard deduction (illustrative)'
        : 'Single filer, standard deduction (illustrative)';

  return {
    grossBusinessIncome: gross,
    businessExpenses: exp,
    netSelfEmployment: netSE,
    selfEmploymentTax: se,
    federalTaxableIncome: federalTaxable,
    federalIncomeTax: federalIncome,
    stateIncomeTax: stateIncome,
    stateRateUsed: stateRate,
    totalEstimated: incomeTaxTotal,
    salesTaxOnCollections,
    salesTaxRateUsed: sr,
    totalWithSalesTax: incomeTaxTotal + salesTaxOnCollections,
    quarterlySuggested: incomeTaxTotal / 4,
    standardDeductionUsed: std,
    filingNote,
    filingStatus,
    entityType,
  };
}
