import { describe, it, expect } from "vitest";
import { federalTaxSingle, computeNetForPerson, conversionTax, grossUpTraditional, capitalGainsTax, grossUpTaxable } from "../src/lib/tax.js";
import { SINGLE_STD_DEDUCTION, SS_WAGE_BASE, LTCG_SINGLE_BRACKETS } from "../src/lib/taxYears2026.js";

describe("federalTaxSingle", () => {
  it("is zero below the first bracket", () => {
    expect(federalTaxSingle(0)).toBe(0);
  });

  it("taxes only the marginal slice in each bracket", () => {
    // $12,400 at 10% + $2,000 into the 12% bracket
    const tax = federalTaxSingle(14400);
    expect(tax).toBeCloseTo(12400 * 0.10 + 2000 * 0.12, 6);
  });

  it("matches a known multi-bracket case", () => {
    // 12400*.10 + 38000*.12 + 55300*.22 + 96075*.24 + 54450*.32 + rest*.35 up to 300000
    const tax = federalTaxSingle(300000);
    const expected =
      (50400 - 12400) * 0.12 + 12400 * 0.10 +
      (105700 - 50400) * 0.22 +
      (201775 - 105700) * 0.24 +
      (256225 - 201775) * 0.32 +
      (300000 - 256225) * 0.35;
    expect(tax).toBeCloseTo(expected, 6);
  });
});

describe("computeNetForPerson", () => {
  it("charges FICA on full gross even when pretax contributions reduce taxable income", () => {
    const gross = 170000;
    const contrib = 23000;
    const result = computeNetForPerson(gross, 0, contrib);
    expect(result.ssTax).toBeCloseTo(Math.min(gross, SS_WAGE_BASE) * 0.062, 6);
    expect(result.medicareTax).toBeCloseTo(gross * 0.0145, 6);
  });

  it("reduces taxable income (and federal tax) by the pretax contribution", () => {
    const gross = 100000;
    const withContrib = computeNetForPerson(gross, 0, 20000);
    const withoutContrib = computeNetForPerson(gross, 0, 0);
    expect(withContrib.federalTax).toBeLessThan(withoutContrib.federalTax);
    // FICA must be identical regardless of the pretax election
    expect(withContrib.ssTax).toBeCloseTo(withoutContrib.ssTax, 6);
    expect(withContrib.medicareTax).toBeCloseTo(withoutContrib.medicareTax, 6);
  });

  it("never lets pretax contributions exceed gross", () => {
    const result = computeNetForPerson(10000, 0, 999999);
    expect(result.contrib).toBe(10000);
  });

  it("applies the additional 0.9% Medicare surtax above the threshold", () => {
    const gross = 250000;
    const result = computeNetForPerson(gross, 0, 0);
    const expectedMedicare = gross * 0.0145 + (gross - 200000) * 0.009;
    expect(result.medicareTax).toBeCloseTo(expectedMedicare, 6);
  });

  it("caps Social Security tax at the wage base", () => {
    const result = computeNetForPerson(500000, 0, 0);
    expect(result.ssTax).toBeCloseTo(SS_WAGE_BASE * 0.062, 6);
  });
});

describe("conversionTax", () => {
  it("is zero for a non-positive conversion", () => {
    expect(conversionTax(100000, 0, 0, 5)).toBe(0);
    expect(conversionTax(100000, 0, -5, 5)).toBe(0);
  });

  it("is the marginal federal + state cost of stacking the conversion on top of wages", () => {
    const gross = 40000, pretax = 5000, conv = 20000, ga = 5.5;
    const base = Math.max(0, gross - pretax - SINGLE_STD_DEDUCTION);
    const expectedFederal = federalTaxSingle(base + conv) - federalTaxSingle(base);
    const expectedState = conv * (ga / 100);
    expect(conversionTax(gross, pretax, conv, ga)).toBeCloseTo(expectedFederal + expectedState, 6);
  });
});

describe("grossUpTraditional", () => {
  it("returns zero for a non-positive need", () => {
    expect(grossUpTraditional(0, 0, 0, 0, 0, 5, 100000)).toEqual({ gross: 0, tax: 0, net: 0 });
  });

  it("nets out to at least the requested amount when balance is unconstrained", () => {
    const need = 50000;
    const result = grossUpTraditional(need, 0, 0, 0, 0, 5.5, Infinity);
    expect(result.net).toBeCloseTo(need, 0);
    expect(result.gross).toBeGreaterThan(need); // withdrawing $X nets less than $X
  });

  it("caps the gross withdrawal at the available balance, even if that underfunds the need", () => {
    const need = 50000;
    const available = 10000;
    const result = grossUpTraditional(need, 0, 0, 0, 0, 5.5, available);
    expect(result.gross).toBe(available);
    expect(result.net).toBeLessThan(need);
  });
});

describe("capitalGainsTax", () => {
  it("is zero for a non-positive gain", () => {
    expect(capitalGainsTax(100000, 0, 0, 5)).toBe(0);
    expect(capitalGainsTax(100000, 0, -5, 5)).toBe(0);
  });

  it("stays in the 0% federal bracket when ordinary income + gain is below the first LTCG threshold", () => {
    const ltcg0Top = LTCG_SINGLE_BRACKETS[0][1];
    expect(capitalGainsTax(0, 0, ltcg0Top - 1000, 0)).toBe(0);
  });

  it("taxes only the slice of the gain that spills above the 0% threshold", () => {
    const ltcg0Top = LTCG_SINGLE_BRACKETS[0][1];
    const spillover = 10000;
    // Ordinary income is 0, so the gain itself straddles the 0%/15% boundary.
    const tax = capitalGainsTax(0, 0, ltcg0Top + spillover, 0);
    expect(tax).toBeCloseTo(spillover * 0.15, 6);
  });

  it("stacks the gain on top of ordinary wages for the federal rate, and applies GA's flat rate to the full gain", () => {
    const gross = 60000, pretax = 5000, gain = 20000, ga = 5.5;
    const base = Math.max(0, gross - pretax - SINGLE_STD_DEDUCTION);
    const bracketTax = (income: number) => {
      let tax = 0;
      for (const [lo, hi, rate] of LTCG_SINGLE_BRACKETS) {
        if (income > lo) tax += (Math.min(income, hi) - lo) * rate;
        else break;
      }
      return tax;
    };
    const expectedFederal = bracketTax(base + gain) - bracketTax(base);
    const expectedState = gain * (ga / 100);
    expect(capitalGainsTax(gross, pretax, gain, ga)).toBeCloseTo(expectedFederal + expectedState, 6);
  });
});

describe("grossUpTaxable", () => {
  it("returns zero for a non-positive need", () => {
    expect(grossUpTaxable(0, 0, 0, 0, 0, 5, 100000, 0.5)).toEqual({ gross: 0, tax: 0, net: 0 });
  });

  it("nets exactly the requested amount when the sale is all basis (no gain)", () => {
    const need = 50000;
    const result = grossUpTaxable(need, 0, 0, 0, 0, 5.5, Infinity, 0);
    expect(result.gross).toBeCloseTo(need, 6);
    expect(result.tax).toBe(0);
    expect(result.net).toBeCloseTo(need, 6);
  });

  it("nets less than the requested amount when the sale is all gain, above the 0% bracket", () => {
    const need = 100000; // pure gain, well past the ~49,450 0% LTCG threshold
    const result = grossUpTaxable(need, 0, 0, 0, 0, 5.5, Infinity, 1);
    expect(result.gross).toBeGreaterThan(need); // selling $X of pure gain nets less than $X
    expect(result.tax).toBeGreaterThan(0);
    expect(result.net).toBeCloseTo(need, 0);
  });

  it("owes no tax when the sale is all gain but stays inside the 0% LTCG bracket", () => {
    const need = 20000;
    const result = grossUpTaxable(need, 0, 0, 0, 0, 0, Infinity, 1);
    expect(result.gross).toBeCloseTo(need, 6);
    expect(result.tax).toBe(0);
  });

  it("caps the gross sale at the available balance, even if that underfunds the need", () => {
    const need = 100000;
    const available = 10000;
    const result = grossUpTaxable(need, 0, 0, 0, 0, 5.5, available, 1);
    expect(result.gross).toBe(available);
    expect(result.net).toBeLessThan(need);
  });
});
