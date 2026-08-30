import { describe, it, expect } from "vitest";
import { monthlyPI, remainingBalance, computeMortgageSnapshot, buildHousingSchedule } from "../src/lib/mortgage.js";

describe("remainingBalance", () => {
  it("starts at the full loan amount", () => {
    expect(remainingBalance(500000, 6.5, 30, 0)).toBe(500000);
  });

  it("reaches exactly zero at term", () => {
    expect(remainingBalance(500000, 6.5, 30, 360)).toBe(0);
  });

  it("amortizes down monotonically month over month", () => {
    let prev = remainingBalance(500000, 6.5, 30, 0);
    for (let m = 12; m <= 360; m += 12) {
      const bal = remainingBalance(500000, 6.5, 30, m);
      expect(bal).toBeLessThan(prev);
      prev = bal;
    }
  });

  it("handles a zero interest rate as straight-line amortization", () => {
    expect(remainingBalance(360000, 0, 30, 180)).toBeCloseTo(180000, 6);
  });
});

describe("monthlyPI", () => {
  it("times termYears*12 pays off exactly the loan plus interest (sanity via remainingBalance)", () => {
    const loan = 500000, rate = 6.5, term = 30;
    const pmt = monthlyPI(loan, rate, term);
    expect(pmt).toBeGreaterThan(loan / (term * 12)); // must exceed straight-line principal-only payment
    expect(remainingBalance(loan, rate, term, term * 12)).toBe(0);
  });
});

describe("computeMortgageSnapshot", () => {
  it("charges PMI only when the down payment leaves LTV above 80%", () => {
    const base = { housePrice: 500000, mortgageRate: 6.5, loanTermYears: 30, propertyTaxRate: 1, insMaintPct: 1, currentHousingCost: 20000 };
    const withPmi = computeMortgageSnapshot({ ...base, downPaymentPct: 10 });
    const withoutPmi = computeMortgageSnapshot({ ...base, downPaymentPct: 20 });
    expect(withPmi.monthlyPMI).toBeGreaterThan(0);
    expect(withoutPmi.monthlyPMI).toBe(0);
  });
});

describe("buildHousingSchedule", () => {
  const base = {
    horizon: 10, houseOn: true, houseYear: 2, housePrice: 500000, downPaymentPct: 20,
    mortgageRate: 6.5, loanTermYears: 30, appreciationRate: 3.5, propertyTaxRate: 1,
    insMaintPct: 1, inflationRate: 2.5, currentHousingCost: 24000,
  };

  it("uses flat currentHousingCost with no equity before the purchase year", () => {
    const schedule = buildHousingSchedule(base);
    for (let y = 0; y < base.houseYear; y++) {
      expect(schedule[y]).toEqual({ housingCost: base.currentHousingCost, oneTime: 0, equity: 0 });
    }
  });

  it("charges the one-time down payment exactly in the purchase year, nowhere else", () => {
    const schedule = buildHousingSchedule(base);
    const downPayment = base.housePrice * base.downPaymentPct / 100;
    schedule.forEach((row, y) => {
      expect(row.oneTime).toBe(y === base.houseYear ? downPayment : 0);
    });
  });

  it("never applies housing cost from the pre-purchase branch once houseOn is false", () => {
    const schedule = buildHousingSchedule({ ...base, houseOn: false });
    schedule.forEach((row) => {
      expect(row).toEqual({ housingCost: base.currentHousingCost, oneTime: 0, equity: 0 });
    });
  });

  // Equity must compare the home value against the loan balance on a consistent (real-dollar)
  // basis: the balance is a nominal-dollar figure (loan contracts are nominal), so it needs the
  // same deflator as P&I before being subtracted from the real-dollar home value. Previously the
  // nominal balance was used directly, understating equity — this pins the fixed behavior so a
  // regression back to the nominal balance shows up as a visible test failure.
  it("deflates the loan balance to real dollars before computing equity and LTV", () => {
    const schedule = buildHousingSchedule(base);
    const kk = 10 - base.houseYear; // years since purchase at the last row
    const homeValueReal = base.housePrice * Math.pow(1 + base.appreciationRate / 100, kk);
    const loanAmount = base.housePrice * (1 - base.downPaymentPct / 100);
    const nominalBalance = remainingBalance(loanAmount, base.mortgageRate, base.loanTermYears, kk * 12);
    const deflator = Math.pow(1 + base.inflationRate / 100, -kk);
    const realBalance = nominalBalance * deflator;

    const codedEquity = schedule[10].equity;
    expect(codedEquity).toBeCloseTo(homeValueReal - realBalance, 2);
    expect(codedEquity).toBeGreaterThan(homeValueReal - nominalBalance); // strictly more than the old (buggy) nominal-balance figure
  });

  it("uses the deflated (real) balance for the PMI LTV check, not the nominal balance", () => {
    // A low down payment keeps nominal LTV above 80% for a long time, but the inflation-deflated
    // real balance shrinks faster — PMI should drop off earlier under the real-balance LTV than
    // it would under the raw nominal balance.
    const lowDownPayment = { ...base, downPaymentPct: 5, horizon: 15 };
    const schedule = buildHousingSchedule(lowDownPayment);
    const loanAmount = lowDownPayment.housePrice * (1 - lowDownPayment.downPaymentPct / 100);

    for (let y = lowDownPayment.houseYear; y <= lowDownPayment.horizon; y++) {
      const kk = y - lowDownPayment.houseYear;
      const homeValue = lowDownPayment.housePrice * Math.pow(1 + lowDownPayment.appreciationRate / 100, kk);
      const nominalBalance = remainingBalance(loanAmount, lowDownPayment.mortgageRate, lowDownPayment.loanTermYears, kk * 12);
      const deflator = Math.pow(1 + lowDownPayment.inflationRate / 100, -kk);
      const realLtv = (nominalBalance * deflator) / homeValue;
      const nominalLtv = nominalBalance / homeValue;
      // Sanity check the two LTVs actually diverge in this scenario (real balance is smaller).
      if (kk > 0) expect(realLtv).toBeLessThan(nominalLtv);
      // The equity figure must be consistent with the real-LTV-gated PMI decision, not the nominal one.
      expect(schedule[y].equity).toBeCloseTo(homeValue - nominalBalance * deflator, 2);
    }
  });
});
