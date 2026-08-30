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

  // KNOWN BUG (tracked, not yet fixed): `equity` subtracts a nominal loan balance from a
  // real-dollar home value without deflating the balance first, understating equity more
  // as years pass. This test pins the CURRENT (buggy) behavior so a future fix is a visible,
  // deliberate change to this assertion rather than a silent regression.
  it("[known bug] currently mixes nominal balance with real home value in equity", () => {
    const schedule = buildHousingSchedule(base);
    const kk = 10 - base.houseYear; // years since purchase at the last row
    const homeValueReal = base.housePrice * Math.pow(1 + base.appreciationRate / 100, kk);
    const loanAmount = base.housePrice * (1 - base.downPaymentPct / 100);
    const nominalBalance = remainingBalance(loanAmount, base.mortgageRate, base.loanTermYears, kk * 12);
    const deflator = Math.pow(1 + base.inflationRate / 100, -kk);
    const correctRealBalance = nominalBalance * deflator;

    const codedEquity = schedule[10].equity;
    expect(codedEquity).toBeCloseTo(homeValueReal - nominalBalance, 2); // current (buggy) behavior
    expect(codedEquity).toBeLessThan(homeValueReal - correctRealBalance); // understates true equity
  });
});
