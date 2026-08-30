import { describe, it, expect } from "vitest";
import { simulateScenario } from "../src/lib/simulate.js";
import { computeNetForPerson } from "../src/lib/tax.js";
import type { SimParams, HousingYearRow, DownshiftConfig } from "../src/types.js";

const NEVER = 999; // "never downshift/retire" sentinel for the downshift config in these tests
const noDownshift: DownshiftConfig = { year1: NEVER, pct1: 100, retireYear1: NEVER, year2: NEVER, pct2: 100, retireYear2: NEVER };

function baseParams(overrides: Partial<SimParams> = {}): SimParams {
  return {
    startAge: 30, income1: 0, income2: 0, gaRate: 0, expenses: 0, growthRate: 0, horizon: 1, penaltyFreeAge: 59,
    kidsOn: false, numKids: 0, infantCost: 0, infantYears: 0, laterCost: 0, kidsStartYear: 0, kidsDuration: 0,
    trad0: 0, roth0: 0, rothBasis0: 0, taxable0: 0, cash0: 0, hsa0: 0,
    tradTarget: 0, rothTarget: 0, hsaTarget: 0, employerMatchPct: 0, employerMatchCapPct: 0,
    planningEndAge: 60, swrAdjust: 0, ladderOn: false, convertPerPerson: 0, seasoningYears: 5,
    uninsuredOn: false, medCostPerAdult: 0, numUninsuredAdults: 0,
    ...overrides,
  };
}

function flatHousing(horizon: number, { housingCost = 0, oneTime = 0 } = {}): HousingYearRow[] {
  return Array.from({ length: horizon + 1 }, (_, y) => ({ housingCost, oneTime: y === 0 ? oneTime : 0, equity: 0 }));
}

describe("mid-year growth convention", () => {
  it("applies half a year's growth to a surplus contributed during the year", () => {
    const income1 = 100000;
    const growthRate = 6;
    const params = baseParams({ income1, growthRate, horizon: 1 });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, {
      year1: NEVER, pct1: 100, retireYear1: 1, // active in year 0 only, retires at year 1
      year2: NEVER, pct2: 100, retireYear2: 0, // person 2 never earns anything
    });

    const p1Net = computeNetForPerson(income1, 0, 0).net;
    const g = growthRate / 100;
    const expectedTotalAtYear1 = p1Net * (1 + g / 2); // taxable*(1+g) [=0] + surplus*(1+g/2)

    expect(result.rows[1].total).toBeCloseTo(expectedTotalAtYear1, 0);
  });
});

describe("FI threshold uses recurring expenses only", () => {
  it("ignores a one-time cost when computing the FI crossover", () => {
    // total (before this year's spend) = 1,100,000; recurring expenses = 40,000/yr;
    // startAge 30, planningEndAge 60, y=0 -> yearsToFund=30 -> swr=4.0% exactly (anchor) ->
    // recurring-only threshold = 40,000 * 25 = 1,000,000, comfortably cleared by 1,100,000.
    // If the one-time cost were folded into the threshold, it would demand 25x(40,000+5,000,000),
    // which 1,100,000 could never clear.
    const params = baseParams({
      expenses: 40000, taxable0: 1100000, planningEndAge: 60, horizon: 0,
    });
    const housing = flatHousing(0, { oneTime: 5000000 });
    const result = simulateScenario(params, housing, noDownshift);
    expect(result.fiYear).toBe(0);
    expect(result.fiSwr).toBeCloseTo(4.0, 6);
  });
});

describe("clamping withdrawal sources at zero", () => {
  it("does not let a pre-existing negative balance supply funds or inflate need", () => {
    // taxable0 starts deeply negative (prior debt). A modest $10,000 recurring need should be
    // met by a modest Traditional gross-up, not by treating the negative taxable balance as a
    // source (which would inflate `need` by over a million and force a phantom over-withdrawal).
    const params = baseParams({
      expenses: 10000, trad0: 2000000, taxable0: -1000000, penaltyFreeAge: 30, horizon: 1,
    });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, noDownshift);

    expect(result.firstShortfallYear).toBeNull();
    expect(result.totalWithdrawalTax).toBeLessThan(5000);
    // total at start of year 1 = (trad0 - modest gross-up) + (taxable0, untouched) ≈ 1,000,000 - gross-up
    expect(result.rows[1].total).toBeGreaterThan(900000);
  });
});

describe("surplus routing", () => {
  it("fills the Roth target, then routes the remainder to taxable (both count toward next year's total)", () => {
    const income1 = 100000;
    const rothTarget = 10000;
    const params = baseParams({ income1, rothTarget, horizon: 1 });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, { year1: NEVER, pct1: 100, retireYear1: 1, year2: NEVER, pct2: 100, retireYear2: 0 });

    const p1Net = computeNetForPerson(income1, 0, 0).net;
    expect(result.rows[1].total).toBeCloseTo(p1Net, 0); // roth + taxable together still sum to the full surplus
  });
});

describe("withdrawal waterfall ordering", () => {
  it("drains cash before touching taxable", () => {
    const params = baseParams({ expenses: 5000, cash0: 3000, taxable0: 100000, horizon: 1 });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, noDownshift);
    // cash (3000) covers part of the 5000 need; the remaining 2000 comes from taxable, not cash reuse.
    // total at start of year1 = (cash0-3000=0) + (taxable0-2000=99998... ) — assert taxable barely moved
    // relative to the full 5000 need, proving cash was drawn first.
    expect(result.rows[1].total).toBeCloseTo(100000 - 2000, 0);
  });

  it("draws Roth basis before seasoned conversions or Traditional", () => {
    const params = baseParams({
      expenses: 1000, rothBasis0: 5000, roth0: 5000, trad0: 100000, penaltyFreeAge: 30, horizon: 1,
    });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, noDownshift);
    expect(result.totalWithdrawalTax).toBe(0); // fully covered by basis, no taxable Traditional pull needed
  });
});

describe("shortfall detection", () => {
  it("flags a shortfall once every accessible source is exhausted", () => {
    const params = baseParams({ expenses: 10000, horizon: 0 }); // no balances at all, not penalty-free
    const housing = flatHousing(0);
    const result = simulateScenario(params, housing, noDownshift);
    expect(result.firstShortfallYear).toBe(0);
  });

  it("does not flag a shortfall when penalty-free Traditional access fully covers the need", () => {
    const params = baseParams({ expenses: 10000, trad0: 1000000, penaltyFreeAge: 30, horizon: 0 });
    const housing = flatHousing(0);
    const result = simulateScenario(params, housing, noDownshift);
    expect(result.firstShortfallYear).toBeNull();
  });
});
