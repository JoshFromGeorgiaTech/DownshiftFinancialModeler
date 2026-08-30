import {
  SINGLE_STD_DEDUCTION,
  SINGLE_ADDL_MEDICARE_THRESHOLD,
  SS_WAGE_BASE,
  FEDERAL_SINGLE_BRACKETS,
  LTCG_SINGLE_BRACKETS,
} from "./taxYears2026.js";
import type { NetForPerson, GrossUpResult } from "../types.js";

export function federalTaxSingle(taxableIncome: number): number {
  let tax = 0;
  for (const [lo, hi, rate] of FEDERAL_SINGLE_BRACKETS) {
    if (taxableIncome > lo) tax += (Math.min(taxableIncome, hi) - lo) * rate;
    else break;
  }
  return tax;
}

function ltcgTaxSingle(income: number): number {
  let tax = 0;
  for (const [lo, hi, rate] of LTCG_SINGLE_BRACKETS) {
    if (income > lo) tax += (Math.min(income, hi) - lo) * rate;
    else break;
  }
  return tax;
}

// Incremental federal tax on `gain` dollars of long-term capital gains, stacked on top of
// that person's ordinary income for the year (LTCG brackets apply to ordinary + gain
// combined, so the gain is taxed at whatever rate it falls into above the ordinary base).
// Georgia has no preferential capital-gains rate — gains are taxed as ordinary income at
// the flat state rate, same as everywhere else in this model.
export function capitalGainsTax(gross: number, pretaxContrib: number, gain: number, gaRatePct: number): number {
  if (gain <= 0) return 0;
  const base = Math.max(0, gross - Math.min(pretaxContrib, gross) - SINGLE_STD_DEDUCTION);
  const withGain = base + gain;
  return (ltcgTaxSingle(withGain) - ltcgTaxSingle(base)) + gain * (gaRatePct / 100);
}

// Incremental tax cost of converting `conv` dollars of Traditional to Roth, stacked
// on top of that person's wage income for the year. Conversions are ordinary income;
// they are NOT subject to FICA.
export function conversionTax(gross: number, pretaxContrib: number, conv: number, gaRatePct: number): number {
  if (conv <= 0) return 0;
  const base = Math.max(0, gross - Math.min(pretaxContrib, gross) - SINGLE_STD_DEDUCTION);
  const withConv = base + conv;
  return (federalTaxSingle(withConv) - federalTaxSingle(base)) + conv * (gaRatePct / 100);
}

// A Traditional withdrawal is ordinary income, so pulling $X leaves less than $X to
// spend. Solve for the gross withdrawal whose after-tax proceeds equal `needNet`.
// Tax stacks on top of whatever wages exist that year, split evenly across both people.
// Fixed-point iteration converges in a few passes since the tax function is monotonic
// and its slope is always < 1.
export function grossUpTraditional(
  needNet: number, w1: number, pre1: number, w2: number, pre2: number, gaRatePct: number, available: number
): GrossUpResult {
  if (needNet <= 0) return { gross: 0, tax: 0, net: 0 };
  let gross = needNet;
  for (let i = 0; i < 12; i++) {
    const half = gross / 2;
    const tax = conversionTax(w1, pre1, half, gaRatePct) + conversionTax(w2, pre2, half, gaRatePct);
    const next = needNet + tax;
    if (Math.abs(next - gross) < 1) { gross = next; break; }
    gross = next;
  }
  gross = Math.min(gross, available);
  const half = gross / 2;
  const tax = conversionTax(w1, pre1, half, gaRatePct) + conversionTax(w2, pre2, half, gaRatePct);
  return { gross, tax, net: gross - tax };
}

// A taxable-account sale only owes tax on its gain portion, so pulling $X nets less than $X
// whenever gainFraction > 0. Solve for the gross sale whose after-tax proceeds equal `needNet`,
// same fixed-point approach as grossUpTraditional (gain = gross * gainFraction is split evenly
// across both people, same as a Traditional withdrawal).
export function grossUpTaxable(
  needNet: number, w1: number, pre1: number, w2: number, pre2: number, gaRatePct: number, available: number, gainFraction: number
): GrossUpResult {
  if (needNet <= 0) return { gross: 0, tax: 0, net: 0 };
  let gross = needNet;
  for (let i = 0; i < 12; i++) {
    const halfGain = (gross * gainFraction) / 2;
    const tax = capitalGainsTax(w1, pre1, halfGain, gaRatePct) + capitalGainsTax(w2, pre2, halfGain, gaRatePct);
    const next = needNet + tax;
    if (Math.abs(next - gross) < 1) { gross = next; break; }
    gross = next;
  }
  gross = Math.min(gross, available);
  const halfGain = (gross * gainFraction) / 2;
  const tax = capitalGainsTax(w1, pre1, halfGain, gaRatePct) + capitalGainsTax(w2, pre2, halfGain, gaRatePct);
  return { gross, tax, net: gross - tax };
}

export function computeNetForPerson(gross: number, gaRatePct: number, pretaxContrib = 0): NetForPerson {
  const contrib = Math.min(pretaxContrib, gross);
  const taxableIncome = Math.max(0, gross - contrib - SINGLE_STD_DEDUCTION);
  const federalTax = federalTaxSingle(taxableIncome);
  const ssTax = Math.min(gross, SS_WAGE_BASE) * 0.062;
  const medicareTax = gross * 0.0145 + Math.max(0, gross - SINGLE_ADDL_MEDICARE_THRESHOLD) * 0.009;
  const gaTax = taxableIncome * (gaRatePct / 100);
  const totalTax = federalTax + ssTax + medicareTax + gaTax;
  return { gross, contrib, federalTax, ssTax, medicareTax, gaTax, totalTax, net: gross - contrib - totalTax };
}
