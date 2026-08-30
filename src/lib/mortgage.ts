// NOTE: `remainingBalance` returns a NOMINAL-dollar figure (loan contracts are nominal),
// while `homeValue` in buildHousingSchedule is treated as already real-dollar (appreciationRate
// is a real rate, per CLAUDE.md's mortgage-deflation invariant). Equity/LTV below subtract the
// nominal balance from the real home value without deflating the balance first — a known,
// tracked bug (understates equity, over-extends the PMI window at low down payments). Preserved
// as-is here since this module is a behavior-preserving extraction; see project notes for the fix.

import type { MortgageSnapshotInputs, MortgageSnapshot, HousingScheduleInputs, HousingYearRow } from "../types.js";

export function monthlyPI(loanAmount: number, annualRatePct: number, termYears: number): number {
  const totalMonths = termYears * 12;
  const monthlyRate = annualRatePct / 100 / 12;
  return monthlyRate === 0
    ? loanAmount / totalMonths
    : loanAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -totalMonths));
}

export function remainingBalance(loanAmount: number, annualRatePct: number, termYears: number, monthsElapsed: number): number {
  const totalMonths = termYears * 12;
  const monthlyRate = annualRatePct / 100 / 12;
  if (monthsElapsed <= 0) return loanAmount;
  if (monthsElapsed >= totalMonths) return 0;
  if (monthlyRate === 0) return loanAmount * (1 - monthsElapsed / totalMonths);
  return loanAmount * ((Math.pow(1 + monthlyRate, totalMonths) - Math.pow(1 + monthlyRate, monthsElapsed)) /
    (Math.pow(1 + monthlyRate, totalMonths) - 1));
}

// Live "at purchase" snapshot shown in the House panel — kk=0, so nominal and real coincide.
export function computeMortgageSnapshot({
  housePrice, downPaymentPct, mortgageRate, loanTermYears, propertyTaxRate, insMaintPct, currentHousingCost,
}: MortgageSnapshotInputs): MortgageSnapshot {
  const loanAmount = housePrice * (1 - downPaymentPct / 100);
  const monthlyPIAmt = monthlyPI(loanAmount, mortgageRate, loanTermYears);
  const monthlyTax = housePrice * propertyTaxRate / 100 / 12;
  const monthlyInsMaint = housePrice * insMaintPct / 100 / 12;
  const ltv = loanAmount / housePrice;
  const monthlyPMI = ltv > 0.8 ? loanAmount * 0.005 / 12 : 0;
  const monthlyTotal = monthlyPIAmt + monthlyTax + monthlyInsMaint + monthlyPMI;
  const downPaymentAmount = housePrice * downPaymentPct / 100;
  return {
    loanAmount, monthlyPI: monthlyPIAmt, monthlyTax, monthlyInsMaint, monthlyPMI, monthlyTotal, downPaymentAmount,
    annualDelta: monthlyTotal * 12 - currentHousingCost,
  };
}

// Per-year housing cost/equity for y = 0..horizon, used by the simulation engine.
// Before houseYear (or if houseOn is false): flat `currentHousingCost`, no equity.
// From houseYear on: nominal P&I+PMI deflated to real dollars, tax/insurance left
// to scale with (real) home value, one-time down payment charged in the purchase year.
export function buildHousingSchedule({
  horizon, houseOn, houseYear, housePrice, downPaymentPct, mortgageRate, loanTermYears,
  appreciationRate, propertyTaxRate, insMaintPct, inflationRate, currentHousingCost,
}: HousingScheduleInputs): HousingYearRow[] {
  const loanAmount = housePrice * (1 - downPaymentPct / 100);
  const downPaymentAmount = housePrice * downPaymentPct / 100;
  const monthlyPIAmt = monthlyPI(loanAmount, mortgageRate, loanTermYears);

  const housingByYear: HousingYearRow[] = [];
  for (let y = 0; y <= horizon; y++) {
    if (houseOn && y >= houseYear) {
      const kk = y - houseYear;
      const homeValue = housePrice * Math.pow(1 + appreciationRate / 100, kk);
      const balance = remainingBalance(loanAmount, mortgageRate, loanTermYears, kk * 12);
      const monthlyTax = homeValue * propertyTaxRate / 100 / 12;
      const monthlyInsMaint = homeValue * insMaintPct / 100 / 12;
      const ltv = homeValue > 0 ? balance / homeValue : 0;
      const monthlyPMI = ltv > 0.8 ? balance * 0.005 / 12 : 0;
      const deflator = Math.pow(1 + inflationRate / 100, -kk);
      const annualCost = ((monthlyPIAmt + monthlyPMI) * deflator + monthlyTax + monthlyInsMaint) * 12;
      housingByYear.push({
        housingCost: annualCost,
        oneTime: y === houseYear ? downPaymentAmount : 0,
        equity: homeValue - balance,
      });
    } else {
      housingByYear.push({ housingCost: currentHousingCost, oneTime: 0, equity: 0 });
    }
  }
  return housingByYear;
}
