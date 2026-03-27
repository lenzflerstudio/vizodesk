/** Illustrative state income rates — must match client/src/data/usStateTaxRates.js logic */
const RATES = {
  AL: 0.052, AK: 0, AZ: 0.025, AR: 0.055, CA: 0.092, CO: 0.044, CT: 0.06, DE: 0.066, DC: 0.089,
  FL: 0, GA: 0.055, HI: 0.075, ID: 0.058, IL: 0.0495, IN: 0.0315, IA: 0.06, KS: 0.057, KY: 0.04,
  LA: 0.055, ME: 0.068, MD: 0.062, MA: 0.05, MI: 0.0425, MN: 0.088, MS: 0.05, MO: 0.054, MT: 0.059,
  NE: 0.065, NV: 0, NH: 0, NJ: 0.063, NM: 0.059, NY: 0.068, NC: 0.0475, ND: 0.025, OH: 0.035,
  OK: 0.05, OR: 0.087, PA: 0.0307, RI: 0.059, SC: 0.065, SD: 0, TN: 0, TX: 0, UT: 0.0465, VT: 0.066,
  VA: 0.0575, WA: 0, WV: 0.055, WI: 0.062, WY: 0,
};

function getStateRate(code) {
  if (!code) return 0;
  return RATES[String(code).toUpperCase()] ?? 0;
}

module.exports = { getStateRate };
