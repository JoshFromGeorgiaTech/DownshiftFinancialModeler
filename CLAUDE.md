# Scenario Modeler — Context for Claude Code

## What this is

A single-page React tool for modeling early-retirement and career-downshift scenarios. It compares 2–3 configurable "downshift" paths against a "never downshift" baseline, and answers one question the mainstream FI calculators get wrong:

> Not "will I have enough money?" but "will I be able to *reach* the money I have?"

That distinction is the whole point of the tool. A household can hold $3M and still be unable to pay rent at 44, because most of it is locked in pre-59½ retirement accounts. The model surfaces that as a **shortfall**: a year where cash, taxable, Roth basis, and seasoned Roth conversions are all exhausted and the account holder isn't old enough to touch the rest.

**This is a scenario-comparison instrument, not a forecaster.** Every projection is a single deterministic path. Treat relative differences between scenarios as meaningful; treat absolute dollar endpoints as fiction.

## Stack

- React 18 + Vite + TypeScript (`strict` mode), built as a static site and deployed to GitHub Pages
- `recharts` for charts
- `lucide-react` for icons
- CSS Modules for styling (`*.module.css`, co-located with each component) plus global design tokens as CSS custom properties in `src/index.css`. A handful of genuinely per-instance dynamic values (the Toggle `accent` prop, a scenario's data-driven color) are still set inline via CSS custom properties rather than static classes — that's the intended exception, not leftover inline styling. `src/lib/colors.ts` is a *second* copy of the same palette values, kept in sync by hand, because JS-only consumers (recharts stroke/fill props, `Scenario.color`) need real color strings, not CSS classes.
- No backend, no build-time data, everything client-side
- Persistence via a three-tier storage adapter (see below)
- `vitest` for unit tests (`npm test`), targeting the pure logic in `src/lib/`; `npm run typecheck` runs `tsc --noEmit` standalone (also runs before `npm run build`)

## Architecture

Originally a single file (`scenario-modeler.jsx`, kept at the repo root for reference/artifact-paste use — see note below); the simulation, tax, mortgage, and storage logic has since been split out of the React tree into plain TypeScript modules under `src/lib/` so they're unit-testable without rendering anything. Layout:

- `src/lib/taxYears2026.ts` — 2026 federal bracket/threshold constants. A new tax year gets its own `taxYearsYYYY.ts` rather than editing this in place.
- `src/lib/tax.ts` — `federalTaxSingle`, `conversionTax`, `grossUpTraditional`, `capitalGainsTax`, `grossUpTaxable`, `computeNetForPerson`
- `src/lib/swr.ts` — `swrForHorizon`, the SWR-vs-horizon anchor table
- `src/lib/mortgage.ts` — `monthlyPI`, `remainingBalance`, `computeMortgageSnapshot` (the live "at purchase" panel), `buildHousingSchedule` (the per-year housing cost/equity array the simulation consumes)
- `src/lib/simulate.ts` — `simulateScenario(params, housingByYear, downshift)`, the core year-by-year engine (see below)
- `src/lib/storage.ts`, `src/lib/format.ts`, `src/lib/colors.ts`, `src/lib/defaults.ts` — storage adapter, `fmtMoney`, design tokens, `DEFAULTS`
- `src/types.ts` — shared interfaces (`SimParams`, `Scenario`, `SimResult`, etc.) used across `src/lib/*`, the components, and the tests
- `src/components/` — presentational pieces: `Field`, `Toggle`, `Readout`, `GroupHeader`, `ScenarioCard`, `Markers` (chart dot shapes), each with a co-located `*.module.css`
- `src/ScenarioModeler.tsx` — all React state, the load/save effects, and the `useMemo` blocks that call into `src/lib/*` and assemble the JSX; styled via `ScenarioModeler.module.css`
- `test/` — vitest specs, one file per `src/lib/*` module, plus `simulate.test.ts` exercising the invariants below directly

**scenario-modeler.jsx at the repo root is now stale** relative to `src/` — it was the pre-split monolith and is kept only in case a single-file artifact-paste deploy is needed again. Treat `src/` as the source of truth; don't edit the root file expecting it to affect the built app.

### The core simulation

`simulateScenario(params, housingByYear, downshift)` in `src/lib/simulate.ts` runs one scenario year-by-year and returns `{ rows, firstShortfallYear, fiYear, fiSwr, totalConverted, totalWithdrawalTax }`. `ScenarioModeler`'s main `useMemo` builds `housingByYear` once via `buildHousingSchedule` and calls `simulateScenario` once for the baseline (downshift years all beyond the horizon) and once per enabled scenario.

Per-year sequence, and the order matters:

1. Compute expenses (living + phase-aware childcare + housing + one-time down payment + uninsured healthcare if applicable)
2. Compute each person's gross wage for the year based on their downshift/retirement stage
3. Run the Roth conversion ladder if enabled, charging its tax against this year's cashflow
4. Compute net take-home (pretax 401k/HSA reduce taxable income; FICA still applies to full gross)
5. `cashflow = income − expenses − conversionTax`
6. **Surplus:** fill Roth target, remainder to taxable
7. **Deficit:** drain in strict order — cash → taxable → Roth basis → seasoned conversions → (only past penalty-free age) Traditional (grossed up for tax) → Roth earnings
8. Anything still unfunded becomes negative taxable balance (modeled debt) and sets `firstShortfallYear`
9. Apply growth with a mid-year convention

## Invariants — break these and the model silently lies

These were all real bugs found by numeric audit, not by reading the code. Preserve them.

- **Clamp every withdrawal source at zero.** `Math.min(Math.max(balance, 0), need)`. A negative balance must supply nothing. Without the clamp, debt inflates `need` and causes massive phantom over-withdrawal from Traditional.
- **Mid-year convention on all flows.** `balance * (1 + g) + change * (1 + g/2)`. Granting full-year growth on money spent in January overstated results by ~$311K over 25 years.
- **The FI threshold uses recurring expenses only.** A one-time down payment must not be multiplied by the SWR divisor — it spikes the bar by 25–30× a lump sum for one year.
- **Housing is added, never delta'd.** `Living expenses` is defined as *excluding* housing; the actual housing cost (rent, or full mortgage+tax+insurance+PMI) is added every year. An earlier delta-based version double-counted or under-counted depending on an unstated assumption.
- **Traditional withdrawals must be grossed up.** Withdrawing $X nets less than $X. `grossUpTraditional` iterates to convergence and caps at the available balance.
- **Taxable sales must be grossed up for capital gains tax, and basis tracks separately from balance.** Same shape as the Traditional gross-up (`grossUpTaxable`/`capitalGainsTax`), but only the gain fraction (`1 - taxableBasis/taxable`) is taxable, at LTCG rates. `taxableBasis` grows only from new contributions, never from investment growth — mirrors how `rothBasis` doesn't grow with Roth's own returns.
- **Pretax contributions reduce taxable income but not FICA wages.** Both halves of that are correct and load-bearing.
- **Nominal mortgage P&I is deflated; tax/insurance are not.** The model runs in real dollars. A fixed mortgage payment shrinks in real terms; costs that scale with home value don't. The loan balance is nominal too (it's a fixed contract amount, same as P&I) — `buildHousingSchedule` deflates it before comparing it against the real-dollar `homeValue` for equity and the PMI LTV check, while leaving the PMI dollar *amount* itself on the nominal balance (like P&I, it gets deflated alongside P&I afterward). Mixing nominal and real here previously understated home equity by tens of thousands of dollars and over-extended the PMI window — see `test/mortgage.test.ts`'s deflation tests before changing this.

## Domain notes

- **Everything is in real (inflation-adjusted) dollars.** Flat income over 30 years is intentional. The `inflationRate` input exists *only* to deflate nominal mortgage payments.
- **Filers are modeled as two single filers**, not married-filing-jointly. Changing this is a real feature request, not a bug.
- **SWR scales with horizon** via `swrForHorizon`, interpolating published anchors (≈4.0% at 30 years, ≈3.4% at 50, ≈3.3% beyond). The flat 4%/25× rule is calibrated for a 30-year retirement and is wrong for someone retiring at 45. `swrAdjust` shifts the curve because the research genuinely disagrees.
- **The Roth conversion ladder** converts Traditional→Roth pre-59½, pays ordinary income tax that year, and unlocks each batch after a seasoning period (5 years under current law, each year's conversion on its own clock). Seasoned conversions are drawn after Roth basis. This is the single highest-impact lever in the model. It's also gated on both people being off full income (the same `!p1Active && !p2Active` condition as the uninsured-healthcare surcharge) — converting while either person still draws a full salary defeats the point, since it stacks ordinary income on their highest marginal bracket instead of a genuinely low-income year. The baseline ("never downshift") therefore never converts at all, and an asymmetric scenario (one person downshifts, the other doesn't) waits for both.
- **Roth ordering rules are three tiers:** contributions (always accessible) → conversions (own 5-year clock, FIFO) → earnings (59½ + 5 years). The model's `rothBasis` tracks tier 1 and the `conversions` queue tracks tier 2.
- **Taxable-account sales owe long-term capital gains tax**, always — the model doesn't distinguish short- vs. long-term holding periods, it just assumes LTCG treatment throughout (federal 0/15/20% brackets stacked on the gain on top of that year's wages, plus GA's flat rate on the gain since Georgia has no capital-gains preference). Basis is tracked as a single running average, not per-lot, so every sale is assumed to carry the account's current basis/balance ratio — no loss-harvesting, no picking specific lots.

## Storage

`storage` detects its environment on every call and falls back cleanly:

1. `window.storage` — host-provided async API (Claude artifact runtime)
2. `localStorage` — normal browser deploy
3. In-memory `Map` — sandboxed iframe or blocked storage

`localStorage` is deliberately *not* first: it fails inside Claude artifacts. The detection uses a write-probe rather than feature detection, because Safari private mode exposes the API but throws on write.

## Known gaps (ranked — good starting work)

1. **No sequence-of-returns risk.** Deterministic projections are optimistic by construction; a fixed return is more favorable than the same average delivered volatilely. This is the largest methodological hole, and it bites hardest for long drawdowns starting in one's 30s. Minimum viable fix: a "force a −30% year at the downshift date" stress button. Fuller fix: Monte Carlo, or a return haircut by confidence level.
2. **No RMDs at 73.** Forces taxable income exactly when it's least wanted, and is a main argument for converting harder in one's 50s. Interacts directly with the ladder.
3. **No mega backdoor Roth.** Large after-tax 401(k) contributions converted in-plan. Material for big-tech employees.
4. **RSU income modeled as plain salary.** No vest schedule, no concentration risk.
5. **Social Security is asymmetric** — FICA is paid, benefits are never received.
6. Missing inputs: salary growth, college/529, one-time events, ACA premium modeling, state moves, mortgage interest deduction, emergency-fund floor, Rule of 55, 72(t)/SEPP.

## Working conventions

- **Verify numerically, don't eyeball.** Every bug in the invariants list was invisible on inspection and obvious under a standalone script. When changing simulation logic, extract it to a scratch file and print a year-by-year table.
- **Tests live in `test/`, run with `npm test`.** Coverage: mortgage balance reaches exactly 0 at term, withdrawal waterfall ordering, known-good tax cases, FI threshold ignores one-time costs, mid-year growth convention, zero-balance clamping. Add a test alongside any change to `src/lib/*` — that's the whole point of the split.
- Tax constants live in `src/lib/taxYears2026.ts`, versioned by year — an annual update is a new `taxYearsYYYY.ts` file, not an edit to this one.
- **When adding an input:** it must be added in six places — `DEFAULTS`, a `useState`, the load effect, the save payload *and* its dependency array, `handleReset`, and the main `useMemo` dependency array. Missing the last one causes stale-render bugs that look like the math is wrong.
- **Keep the methodology disclaimer current.** It's long on purpose. If a change alters what the model assumes, the disclaimer changes in the same commit.
- Prefer honesty about limitations over impressive-looking output. The tool's value is that it tells the truth about a tradeoff, including when the answer is "this doesn't matter."
