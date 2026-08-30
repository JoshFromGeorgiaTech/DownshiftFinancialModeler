// NOTE: `remainingBalance` returns a NOMINAL-dollar figure (loan contracts are nominal), while
// `homeValue` in buildHousingSchedule is treated as already real-dollar (appreciationRate is a
// real rate, per CLAUDE.md's mortgage-deflation invariant). Equity and the PMI LTV check both
// deflate the balance to real dollars first so they're computed against `homeValue` on a
// consistent basis. The PMI dollar *amount* itself is deliberately left on the nominal balance —
// like P&I, it's a nominal premium that then gets deflated alongside P&I in `annualCost`.

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
      const deflator = Math.pow(1 + inflationRate / 100, -kk);
      const balanceReal = balance * deflator;
      const monthlyTax = homeValue * propertyTaxRate / 100 / 12;
      const monthlyInsMaint = homeValue * insMaintPct / 100 / 12;
      const ltv = homeValue > 0 ? balanceReal / homeValue : 0;
      const monthlyPMI = ltv > 0.8 ? balance * 0.005 / 12 : 0;
      const annualCost = ((monthlyPIAmt + monthlyPMI) * deflator + monthlyTax + monthlyInsMaint) * 12;
      housingByYear.push({
        housingCost: annualCost,
        oneTime: y === houseYear ? downPaymentAmount : 0,
        equity: homeValue - balanceReal,
      });
    } else {
      housingByYear.push({ housingCost: currentHousingCost, oneTime: 0, equity: 0 });
    }
  }
  return housingByYear;
}
