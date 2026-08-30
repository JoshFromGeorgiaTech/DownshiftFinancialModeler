import { computeNetForPerson, conversionTax, grossUpTraditional, grossUpTaxable } from "./tax.js";
import { swrForHorizon } from "./swr.js";
import type { SimParams, HousingYearRow, DownshiftConfig, SimResult, SimRow } from "../types.js";

interface Conversion {
  availableYear: number;
  amount: number;
}

/**
 * Runs one scenario year-by-year. See CLAUDE.md "The core simulation" for the
 * per-year sequence and "Invariants" for the rules that must not regress.
 *
 * @param params - all scenario-independent inputs (incomes, balances,
 *   contribution targets, kids/housing/healthcare toggles, growth/inflation, etc).
 * @param housingByYear - from buildHousingSchedule(), indexed by year y = 0..horizon.
 * @param downshift - this scenario's downshift/retirement timing. Pass horizon+1
 *   for all six fields to model "never downshift or retire" (the baseline).
 */
export function simulateScenario(params: SimParams, housingByYear: HousingYearRow[], downshift: DownshiftConfig): SimResult {
  const {
    startAge, income1, income2, gaRate, expenses, growthRate, horizon, penaltyFreeAge,
    kidsOn, numKids, infantCost, infantYears, laterCost, kidsStartYear, kidsDuration,
    trad0, roth0, rothBasis0, taxable0, taxableBasis0, cash0, hsa0,
    tradTarget, rothTarget, hsaTarget, employerMatchPct, employerMatchCapPct,
    planningEndAge, swrAdjust, ladderOn, convertPerPerson, seasoningYears,
    uninsuredOn, medCostPerAdult, numUninsuredAdults,
  } = params;
  const { year1, pct1, retireYear1, year2, pct2, retireYear2 } = downshift;

  let trad = trad0, roth = roth0, rothBasis = Math.min(rothBasis0, roth0), taxable = taxable0,
      taxableBasis = Math.min(taxableBasis0, taxable0), cash = cash0, hsa = hsa0;
  let firstShortfallYear: number | null = null;
  let fiYear: number | null = null;
  let fiSwr: number | null = null;
  const conversions: Conversion[] = []; // seasoned conversions become penalty-free
  let totalConverted = 0;
  let totalWithdrawalTax = 0;
  const out: SimRow[] = [];

  for (let y = 0; y <= horizon; y++) {
    let planExpenses = expenses;
    if (kidsOn && y >= kidsStartYear && y < kidsStartYear + kidsDuration) {
      const kidAge = y - kidsStartYear;
      planExpenses += numKids * (kidAge < infantYears ? infantCost : laterCost);
    }
    planExpenses += housingByYear[y].housingCost;

    const p1Active = y < retireYear1 && (y < year1 || pct1 === 100);
    const p2Active = y < retireYear2 && (y < year2 || pct2 === 100);
    if (uninsuredOn && !p1Active && !p2Active) planExpenses += medCostPerAdult * numUninsuredAdults;

    const recurringExpenses = planExpenses; // FI target uses this — a one-time down payment isn't an ongoing burn rate
    planExpenses += housingByYear[y].oneTime;

    const p1Gross = y >= retireYear1 ? 0 : (y < year1 ? income1 : income1 * (pct1 / 100));
    const p2Gross = y >= retireYear2 ? 0 : (y < year2 ? income2 : income2 * (pct2 / 100));

    // Traditional/HSA are pretax payroll elections — split evenly across the two incomes,
    // each capped at that person's own gross (can't contribute more than you earn that year).
    const p1TradContrib = Math.min(tradTarget / 2, p1Gross);
    const p1HsaContrib = Math.min(hsaTarget / 2, Math.max(0, p1Gross - p1TradContrib));
    const p2TradContrib = Math.min(tradTarget / 2, p2Gross);
    const p2HsaContrib = Math.min(hsaTarget / 2, Math.max(0, p2Gross - p2TradContrib));
    const p1Net = computeNetForPerson(p1Gross, gaRate, p1TradContrib + p1HsaContrib).net;
    const p2Net = computeNetForPerson(p2Gross, gaRate, p2TradContrib + p2HsaContrib).net;

    const age = startAge + y;
    const penaltyFree = age >= penaltyFreeAge;

    // --- Roth conversion ladder ---
    // Convert Traditional -> Roth during low-income years. The converted amount is
    // ordinary income now, but becomes penalty-free accessible after seasoning.
    // Pointless once penalty-free age is reached, so it stops there. Also gated on both people
    // being off full income — same condition as the uninsured-healthcare surcharge — since
    // converting while still drawing a full salary defeats the point: it's ordinary income
    // stacked on top of your highest marginal bracket instead of a low-income year's.
    let converted = 0, convTax = 0;
    if (ladderOn && !penaltyFree && !p1Active && !p2Active && trad > 0) {
      const c1 = Math.min(convertPerPerson, Math.max(0, trad / 2));
      const c2 = Math.min(convertPerPerson, Math.max(0, trad / 2));
      converted = Math.min(c1 + c2, trad);
      convTax = conversionTax(p1Gross, p1TradContrib + p1HsaContrib, c1, gaRate)
              + conversionTax(p2Gross, p2TradContrib + p2HsaContrib, c2, gaRate);
      conversions.push({ availableYear: y + seasoningYears, amount: converted });
      totalConverted += converted;
    }

    const planIncome = p1Net + p2Net;
    const cashflow = planIncome - planExpenses - convTax;

    // Employer match: matchPct of your deferral, capped at matchCapPct of that person's gross.
    // Free money, lands in Traditional, and is NOT taxable income to you.
    const matchFor = (gross: number, deferral: number): number =>
      Math.min(deferral * (employerMatchPct / 100), gross * (employerMatchCapPct / 100));
    const employerMatch = matchFor(p1Gross, p1TradContrib) + matchFor(p2Gross, p2TradContrib);

    let tradWithdrawalTax = 0, taxableWithdrawalTax = 0;
    let tradChange = p1TradContrib + p2TradContrib + employerMatch - converted;
    const hsaChange = p1HsaContrib + p2HsaContrib;
    let rothChange = 0, rothBasisChange = 0, taxableChange = 0, taxableBasisChange = 0, cashChange = 0, shortfall = 0;

    if (cashflow >= 0) {
      let remaining = cashflow;
      rothChange = Math.min(rothTarget, remaining); remaining -= rothChange;
      rothBasisChange = rothChange;
      taxableChange = remaining;
      taxableBasisChange = remaining; // fresh contributions carry their own basis dollar-for-dollar
    } else {
      let need = -cashflow;
      // Each source can only supply what it actually holds; a negative balance (debt carried
      // from a prior shortfall) supplies nothing, so clamp at 0 rather than letting Math.min
      // return the negative and inflate `need`.
      const fromCash = Math.min(Math.max(cash, 0), need);
      cashChange = -fromCash; need -= fromCash;

      // Selling taxable assets realizes long-term capital gains on the appreciated portion.
      // Basis is tracked as a running average (no lot-level detail), so each sale is assumed
      // to carry the account's current basis/balance ratio — same gain fraction whether it's
      // the first dollar sold or the last.
      if (need > 0) {
        const availableTaxable = Math.max(taxable, 0);
        const basisFraction = taxable > 0 ? Math.min(1, Math.max(0, taxableBasis / taxable)) : 0;
        const gainFraction = 1 - basisFraction;
        const gu = grossUpTaxable(
          need, p1Gross, p1TradContrib + p1HsaContrib,
          p2Gross, p2TradContrib + p2HsaContrib, gaRate, availableTaxable, gainFraction
        );
        taxableChange -= gu.gross;
        taxableBasisChange -= gu.gross * basisFraction;
        taxableWithdrawalTax += gu.tax;
        need -= gu.net;
      }

      const fromRothBasis = Math.min(Math.max(rothBasis, 0), need);
      rothChange -= fromRothBasis; rothBasisChange -= fromRothBasis; need -= fromRothBasis;

      // Seasoned conversions: penalty-free once they've aged past the seasoning window,
      // oldest first. This is the ladder actually paying out.
      for (const c of conversions) {
        if (need <= 0) break;
        if (c.availableYear <= y && c.amount > 0) {
          const take = Math.min(c.amount, need);
          c.amount -= take; rothChange -= take; need -= take;
        }
      }

      if (need > 0 && penaltyFree) {
        // Ordinary income tax applies, so gross up: withdrawing $X nets less than $X.
        const gu = grossUpTraditional(
          need, p1Gross, p1TradContrib + p1HsaContrib,
          p2Gross, p2TradContrib + p2HsaContrib, gaRate, Math.max(trad, 0)
        );
        tradChange -= gu.gross;
        tradWithdrawalTax += gu.tax;
        need -= gu.net;
      }
      if (need > 0 && penaltyFree) {
        const rothGrowthAvail = Math.max(roth - Math.max(rothBasis, 0), 0);
        const fromRothGrowth = Math.min(rothGrowthAvail, need);
        rothChange -= fromRothGrowth; need -= fromRothGrowth;
      }
      shortfall = need;
      if (need > 0) taxableChange -= need; // no accessible funds left — surfaces as negative (debt), not silently absorbed
    }

    totalWithdrawalTax += tradWithdrawalTax + taxableWithdrawalTax;
    const total = trad + roth + taxable + cash + hsa;
    if (shortfall > 1 && firstShortfallYear === null) firstShortfallYear = y;
    const yearsToFund = Math.max(1, planningEndAge - age);
    const swr = Math.max(0.5, swrForHorizon(yearsToFund) + swrAdjust);
    if (fiYear === null && total >= recurringExpenses * (100 / swr)) { fiYear = y; fiSwr = swr; }

    // Accessible: cash, taxable, Roth basis, and seasoned conversions — the assets reachable
    // before penaltyFreeAge, since Traditional and Roth growth are locked until then. This is
    // what can silently diverge from `total`: net worth can climb while the money you can
    // actually touch runs out.
    const seasonedConversions = conversions.reduce((sum, c) => sum + (c.availableYear <= y ? c.amount : 0), 0);
    const accessible = penaltyFree ? total : cash + taxable + rothBasis + seasonedConversions;

    out.push({ year: y, total: Math.round(total), accessible: Math.round(accessible) });

    // Mid-year convention: contributions and withdrawals happen throughout the year, not on
    // Jan 1, so they earn (or forgo) roughly half a year of return — not a full year.
    const g = growthRate / 100;
    const midYear = 1 + g / 2;
    trad = trad * (1 + g) + tradChange * midYear;
    roth = roth * (1 + g) + (rothChange + converted) * midYear;
    rothBasis = Math.max(0, rothBasis + rothBasisChange);
    taxable = taxable * (1 + g) + taxableChange * midYear;
    taxableBasis = Math.max(0, taxableBasis + taxableBasisChange); // basis doesn't grow — only new contributions add to it
    cash = cash + cashChange;
    hsa = hsa * (1 + g) + hsaChange * midYear;
  }
  return { rows: out, firstShortfallYear, fiYear, fiSwr, totalConverted, totalWithdrawalTax };
}
