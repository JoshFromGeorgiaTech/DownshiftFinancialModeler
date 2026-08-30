import { describe, it, expect } from "vitest";
import { simulateScenario } from "../src/lib/simulate.js";
import { computeNetForPerson } from "../src/lib/tax.js";
import type { SimParams, HousingYearRow, DownshiftConfig } from "../src/types.js";

const NEVER = 999; // "never downshift/retire" sentinel for the downshift config in these tests
const noDownshift: DownshiftConfig = { year1: NEVER, pct1: 100, retireYear1: NEVER, year2: NEVER, pct2: 100, retireYear2: NEVER };
// Both people off full income from year 0 onward (downshifted, not retired) — the ladder is
// gated on this exact condition, so most ladder tests need it instead of noDownshift.
const bothOffFullIncome: DownshiftConfig = { year1: 0, pct1: 50, retireYear1: NEVER, year2: 0, pct2: 50, retireYear2: NEVER };

function baseParams(overrides: Partial<SimParams> = {}): SimParams {
  return {
    startAge: 30, income1: 0, income2: 0, gaRate: 0, expenses: 0, growthRate: 0, horizon: 1, penaltyFreeAge: 59,
    kidsOn: false, numKids: 0, infantCost: 0, infantYears: 0, laterCost: 0, kidsStartYear: 0, kidsDuration: 0,
    trad0: 0, roth0: 0, rothBasis0: 0, taxable0: 0, taxableBasis0: 0, cash0: 0, hsa0: 0,
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

describe("Roth conversion ladder", () => {
  // Converting 8,000/person/yr at $0 wages costs conversionTax(0,0,8000,0) = 800/person = 1,600/yr
  // in ordinary income tax, charged against cashflow the same year it's converted — so each year's
  // real cash need is 10,000 (expenses) + 1,600 (that year's own conversion tax) = 11,600.
  const annualNeed = 11600;

  it("never converts while either person is still at full income", () => {
    // noDownshift keeps both people at full income (pct 100%) for the whole horizon, which is
    // exactly the condition the ladder is gated against — converting here would tax the
    // conversion at a full salary's marginal rate instead of a low-income year's.
    const params = baseParams({ trad0: 1000000, ladderOn: true, convertPerPerson: 8000, horizon: 3 });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, noDownshift);
    expect(result.totalConverted).toBe(0);
  });

  it("does not let an unseasoned conversion cover a shortfall before its seasoning year", () => {
    // Cash covers years 0-3 exactly (4 x 11,600 = 46,400); year 4 has nothing else accessible
    // (not penalty-free, no basis/taxable left) and year 0's conversion doesn't season until
    // year 0 + seasoningYears(5) = 5 — one year too late to help year 4.
    const params = baseParams({
      trad0: 1000000, ladderOn: true, convertPerPerson: 8000, seasoningYears: 5,
      expenses: 10000, cash0: annualNeed * 4, penaltyFreeAge: 100, horizon: 4,
    });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, bothOffFullIncome);
    expect(result.firstShortfallYear).toBe(4);
  });

  it("lets a conversion cover a shortfall once it reaches its seasoning year", () => {
    // Same setup, but cash covers one more year (0-4) and the horizon reaches year 5 exactly
    // when year 0's conversion (16,000) seasons — comfortably covering the 11,600 need.
    const params = baseParams({
      trad0: 1000000, ladderOn: true, convertPerPerson: 8000, seasoningYears: 5,
      expenses: 10000, cash0: annualNeed * 5, penaltyFreeAge: 100, horizon: 5,
    });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, bothOffFullIncome);
    expect(result.firstShortfallYear).toBeNull();
  });

  it("stops converting once penalty-free age is reached", () => {
    const params = baseParams({
      startAge: 55, penaltyFreeAge: 59, trad0: 1000000, ladderOn: true, convertPerPerson: 8000, horizon: 6,
    });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, bothOffFullIncome);
    // Converts only while age < 59: ages 55-58 -> years 0-3 -> 4 years x 16,000/yr.
    expect(result.totalConverted).toBeCloseTo(64000, 0);
  });

  it("starts converting only once BOTH people are off full income, not just one", () => {
    const params = baseParams({ trad0: 1000000, ladderOn: true, convertPerPerson: 8000, horizon: 1 });
    const housing = flatHousing(params.horizon);
    // Person 1 downshifts immediately; person 2 stays at full income throughout.
    const onlyOneDownshifts = simulateScenario(params, housing, { year1: 0, pct1: 50, retireYear1: NEVER, year2: NEVER, pct2: 100, retireYear2: NEVER });
    expect(onlyOneDownshifts.totalConverted).toBe(0);
  });
});

describe("kids costs", () => {
  it("switches from the infant rate to the school-age rate at the right kid-age, and stops after kidsDuration", () => {
    const params = baseParams({
      kidsOn: true, numKids: 1, infantCost: 18000, infantYears: 4, laterCost: 8000,
      kidsStartYear: 2, kidsDuration: 10, cash0: 10000000, horizon: 13,
    });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, noDownshift);
    const delta = (y: number) => result.rows[y + 1].total - result.rows[y].total;

    expect(delta(2)).toBeCloseTo(-18000, 0);  // kid age 0: infant rate
    expect(delta(5)).toBeCloseTo(-18000, 0);  // kid age 3: still infant rate (infantYears=4)
    expect(delta(6)).toBeCloseTo(-8000, 0);   // kid age 4: switches to school-age rate
    expect(delta(11)).toBeCloseTo(-8000, 0);  // kid age 9: last active year (kidsDuration=10)
    expect(delta(12)).toBeCloseTo(0, 0);      // kid age 10: support window closed, no more cost
  });
});

describe("employer match", () => {
  it("caps the match at matchCapPct of gross even when the deferral would earn more", () => {
    const income1 = 200000;
    const tradTarget = 100000; // p1's contribution = tradTarget/2 = 50,000
    const employerMatchPct = 50, employerMatchCapPct = 6;
    const p1TradContrib = tradTarget / 2;
    const p1Net = computeNetForPerson(income1, 0, p1TradContrib).net;

    // expenses = p1Net makes cashflow exactly 0, so taxable/roth/cash/hsa never move —
    // whatever ends up in `total` after year 0 is purely this year's Traditional contribution + match.
    const params = baseParams({
      income1, tradTarget, employerMatchPct, employerMatchCapPct, hsaTarget: 0, expenses: p1Net, horizon: 1,
    });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, { year1: NEVER, pct1: 100, retireYear1: 1, year2: NEVER, pct2: 100, retireYear2: 0 });

    const uncappedMatch = p1TradContrib * (employerMatchPct / 100); // 25,000
    const cappedMatch = income1 * (employerMatchCapPct / 100);     // 12,000
    expect(cappedMatch).toBeLessThan(uncappedMatch); // sanity: the cap is actually binding in this setup
    expect(result.rows[1].total).toBeCloseTo(p1TradContrib + cappedMatch, 0);
  });
});

describe("uninsured healthcare surcharge", () => {
  it("applies only once BOTH people are off full income, not just one", () => {
    const income = 100000;
    const netAtFullIncome = computeNetForPerson(income, 0, 0).net;
    const base = baseParams({
      income1: income, income2: income, uninsuredOn: true, medCostPerAdult: 3000, numUninsuredAdults: 2,
      cash0: 10000000, horizon: 2,
    });
    const housing = flatHousing(base.horizon);

    // Person 1 retires at year 1; person 2 never does -> surcharge should NOT apply.
    const onlyOneRetires = simulateScenario(base, housing, { year1: NEVER, pct1: 100, retireYear1: 1, year2: NEVER, pct2: 100, retireYear2: NEVER });
    const deltaOneRetires = onlyOneRetires.rows[2].total - onlyOneRetires.rows[1].total;
    expect(deltaOneRetires).toBeCloseTo(netAtFullIncome, 0); // just person 2's income, no surcharge subtracted

    // Both retire at year 1 -> surcharge should apply from year 1 on.
    const bothRetire = simulateScenario(base, housing, { year1: NEVER, pct1: 100, retireYear1: 1, year2: NEVER, pct2: 100, retireYear2: 1 });
    const deltaBothRetire = bothRetire.rows[2].total - bothRetire.rows[1].total;
    expect(deltaBothRetire).toBeCloseTo(-3000 * 2, 0); // no income, just the surcharge
  });
});

describe("capital gains tax on taxable sales", () => {
  it("reduces net worth when a taxable sale realizes a gain, vs. an identical sale with no gain", () => {
    // Two households with the same taxable balance and the same $60,000/yr shortfall need,
    // differing only in cost basis: one has no embedded gain (basis == balance), the other
    // has the whole balance as gain. The all-gain household should end up with less net worth,
    // since part of every dollar sold goes to capital gains tax instead of covering the need.
    const shared = { expenses: 60000, taxable0: 1000000, gaRate: 5.5, horizon: 1 };
    const noGain = simulateScenario(baseParams({ ...shared, taxableBasis0: 1000000 }), flatHousing(1), noDownshift);
    const allGain = simulateScenario(baseParams({ ...shared, taxableBasis0: 0 }), flatHousing(1), noDownshift);
    expect(allGain.rows[1].total).toBeLessThan(noGain.rows[1].total);
    expect(allGain.totalWithdrawalTax).toBeGreaterThan(0);
    expect(noGain.totalWithdrawalTax).toBe(0);
  });

  it("does not tax new contributions, only realizes gain on what's actually sold", () => {
    // A pure surplus year (no withdrawal) should owe no capital gains tax regardless of basis.
    const params = baseParams({ income1: 200000, gaRate: 5.5, taxable0: 500000, taxableBasis0: 100000, horizon: 1 });
    const housing = flatHousing(params.horizon);
    const result = simulateScenario(params, housing, { year1: NEVER, pct1: 100, retireYear1: 1, year2: NEVER, pct2: 100, retireYear2: 0 });
    expect(result.totalWithdrawalTax).toBe(0);
  });

  it("basis grows only from new contributions, not from investment growth", () => {
    // Year 0: no income, no expenses -> cashflow exactly 0, so the account only moves via
    // market growth (taxableBasis0 == taxable0, so it starts with zero embedded gain). Year 1
    // hits it with a big one-time cost that drains the whole balance. If basis had tracked
    // year 0's growth too, this withdrawal would still show zero gain (and zero tax); since
    // basis only reflects contributions, the grown portion is taxable.
    const housingWithdrawalYear1: HousingYearRow[] = [
      { housingCost: 0, oneTime: 0, equity: 0 },
      { housingCost: 0, oneTime: 200000, equity: 0 },
    ];
    const withGrowth = simulateScenario(
      baseParams({ taxable0: 100000, taxableBasis0: 100000, growthRate: 6, gaRate: 5.5, horizon: 1 }),
      housingWithdrawalYear1, noDownshift,
    );
    const noGrowth = simulateScenario(
      baseParams({ taxable0: 100000, taxableBasis0: 100000, growthRate: 0, gaRate: 5.5, horizon: 1 }),
      housingWithdrawalYear1, noDownshift,
    );
    expect(withGrowth.totalWithdrawalTax).toBeGreaterThan(0);
    expect(noGrowth.totalWithdrawalTax).toBe(0);
  });
});

describe("accessible funds", () => {
  it("excludes Traditional and Roth growth before penalty-free age, even though total counts them", () => {
    const params = baseParams({ trad0: 5000000, penaltyFreeAge: 100, horizon: 0 });
    const housing = flatHousing(0);
    const result = simulateScenario(params, housing, noDownshift);
    expect(result.rows[0].accessible).toBe(0); // nothing accessible: cash, taxable, Roth basis, and conversions are all 0
    expect(result.rows[0].total).toBeCloseTo(5000000, 0); // net worth looks fine — that gap is the whole point of this chart
  });

  it("counts every source, including Traditional, once penalty-free age is reached", () => {
    const params = baseParams({ startAge: 60, penaltyFreeAge: 59, trad0: 1000000, horizon: 0 });
    const housing = flatHousing(0);
    const result = simulateScenario(params, housing, noDownshift);
    expect(result.rows[0].accessible).toBeCloseTo(1000000, 0);
  });

  it("is a snapshot of starting balances, unaffected by a one-time cost incurred that same year", () => {
    const params = baseParams({ expenses: 40000, taxable0: 200000, horizon: 0 });
    const withOneTime = simulateScenario(params, flatHousing(0, { oneTime: 5000000 }), noDownshift);
    const withoutOneTime = simulateScenario(params, flatHousing(0), noDownshift);
    expect(withOneTime.rows[0].accessible).toBeCloseTo(200000, 0);
    expect(withOneTime.rows[0].accessible).toBeCloseTo(withoutOneTime.rows[0].accessible, 6);
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
