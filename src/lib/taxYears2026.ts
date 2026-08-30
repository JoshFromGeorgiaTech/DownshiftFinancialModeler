// 2026 single-filer federal tax law constants (this model treats an unmarried
// couple as two single filers — see CLAUDE.md "Domain notes").
// When brackets/thresholds update for a new tax year, add a new taxYearsYYYY.js
// alongside this one rather than editing these values in place.
export const SINGLE_STD_DEDUCTION = 16100;
export const SINGLE_ADDL_MEDICARE_THRESHOLD = 200000;
export const SS_WAGE_BASE = 184500;
export const FEDERAL_SINGLE_BRACKETS: [number, number, number][] = [
  [0, 12400, 0.10],
  [12400, 50400, 0.12],
  [50400, 105700, 0.22],
  [105700, 201775, 0.24],
  [201775, 256225, 0.32],
  [256225, 640600, 0.35],
  [640600, Infinity, 0.37],
];

// Long-term capital gains brackets stack on top of ordinary taxable income (not from
// zero) — the 0%/15%/20% rate is determined by where ordinary income + gain lands.
export const LTCG_SINGLE_BRACKETS: [number, number, number][] = [
  [0, 49450, 0.00],
  [49450, 546300, 0.15],
  [546300, Infinity, 0.20],
];
