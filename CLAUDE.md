# Scenario Modeler — Context for Claude Code

## What this is

A single-page React tool for modeling early-retirement and career-downshift scenarios. It compares 2–3 configurable "downshift" paths against a "never downshift" baseline, and answers one question the mainstream FI calculators get wrong:

> Not "will I have enough money?" but "will I be able to *reach* the money I have?"

That distinction is the whole point of the tool. A household can hold $3M and still be unable to pay rent at 44, because most of it is locked in pre-59½ retirement accounts. The model surfaces that as a **shortfall**: a year where cash, taxable, Roth basis, and seasoned Roth conversions are all exhausted and the account holder isn't old enough to touch the rest.

**This is a scenario-comparison instrument, not a forecaster.** Every projection is a single deterministic path. Treat relative differences between scenarios as meaningful; treat absolute dollar endpoints as fiction.

## Stack

- React (single file, hooks, no router, no state library)
- `recharts` for charts
- `lucide-react` for icons
- Inline styles, no CSS framework — a `colors` object at the top is the design system
- No backend, no build-time data, everything client-side
- Persistence via a three-tier storage adapter (see below)

## Architecture

It's one file. That's deliberate for now but is the first thing to split if the project grows. Reading order:

1. **Tax constants and helpers** (top) — 2026 brackets, `federalTaxSingle`, `conversionTax`, `grossUpTraditional`, `computeNetForPerson`, `swrForHorizon`
2. **`storage` adapter** — environment-detecting persistence
3. **`DEFAULTS`** — every input's starting value in one object
4. **Presentational components** — `Field`, `Toggle`, `Readout`, `GroupHeader`, `ScenarioCard`
5. **`ScenarioModeler`** — all state, the load/save effects, and the two `useMemo` blocks that do the real work
6. **JSX** — input panels, two charts, readout row, long methodology disclaimer

### The core simulation

Inside the main `useMemo`, `simulate(year1, pct1, retireYear1, year2, pct2, retireYear2)` runs one scenario year-by-year and returns `{ rows, firstShortfallYear, fiYear, fiSwr, totalConverted, totalWithdrawalTax }`. It's called once for the baseline and once per enabled scenario.

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
- **Pretax contributions reduce taxable income but not FICA wages.** Both halves of that are correct and load-bearing.
- **Nominal mortgage P&I is deflated; tax/insurance are not.** The model runs in real dollars. A fixed mortgage payment shrinks in real terms; costs that scale with home value don't.

## Domain notes

- **Everything is in real (inflation-adjusted) dollars.** Flat income over 30 years is intentional. The `inflationRate` input exists *only* to deflate nominal mortgage payments.
- **Filers are modeled as two single filers**, not married-filing-jointly. Changing this is a real feature request, not a bug.
- **SWR scales with horizon** via `swrForHorizon`, interpolating published anchors (≈4.0% at 30 years, ≈3.4% at 50, ≈3.3% beyond). The flat 4%/25× rule is calibrated for a 30-year retirement and is wrong for someone retiring at 45. `swrAdjust` shifts the curve because the research genuinely disagrees.
- **The Roth conversion ladder** converts Traditional→Roth pre-59½, pays ordinary income tax that year, and unlocks each batch after a seasoning period (5 years under current law, each year's conversion on its own clock). Seasoned conversions are drawn after Roth basis. This is the single highest-impact lever in the model.
- **Roth ordering rules are three tiers:** contributions (always accessible) → conversions (own 5-year clock, FIFO) → earnings (59½ + 5 years). The model's `rothBasis` tracks tier 1 and the `conversions` queue tracks tier 2.

## Storage

`storage` detects its environment on every call and falls back cleanly:

1. `window.storage` — host-provided async API (Claude artifact runtime)
2. `localStorage` — normal browser deploy
3. In-memory `Map` — sandboxed iframe or blocked storage

`localStorage` is deliberately *not* first: it fails inside Claude artifacts. The detection uses a write-probe rather than feature detection, because Safari private mode exposes the API but throws on write.

## Known gaps (ranked — good starting work)

1. **No sequence-of-returns risk.** Deterministic projections are optimistic by construction; a fixed return is more favorable than the same average delivered volatilely. This is the largest methodological hole, and it bites hardest for long drawdowns starting in one's 30s. Minimum viable fix: a "force a −30% year at the downshift date" stress button. Fuller fix: Monte Carlo, or a return haircut by confidence level.
2. **No RMDs at 73.** Forces taxable income exactly when it's least wanted, and is a main argument for converting harder in one's 50s. Interacts directly with the ladder.
3. **No capital gains tax on taxable sales.** Roughly a $3–8K/yr effect; needs lot-level basis tracking to do properly.
4. **No mega backdoor Roth.** Large after-tax 401(k) contributions converted in-plan. Material for big-tech employees.
5. **RSU income modeled as plain salary.** No vest schedule, no concentration risk.
6. **Social Security is asymmetric** — FICA is paid, benefits are never received.
7. Missing inputs: salary growth, college/529, one-time events, ACA premium modeling, state moves, mortgage interest deduction, emergency-fund floor, Rule of 55, 72(t)/SEPP.

## Working conventions

- **Verify numerically, don't eyeball.** Every bug in the invariants list was invisible on inspection and obvious under a standalone script. When changing simulation logic, extract it to a scratch file and print a year-by-year table.
- **There are no tests yet. Adding them is high-value.** Start with: mortgage balance reaches exactly 0 at term; withdrawal waterfall ordering; known-good tax cases; FI threshold ignores one-time costs.
- **Tax constants are inline and should be extracted** to a versioned `taxYears.js` so annual updates are a data edit.
- **When adding an input:** it must be added in six places — `DEFAULTS`, a `useState`, the load effect, the save payload *and* its dependency array, `handleReset`, and the main `useMemo` dependency array. Missing the last one causes stale-render bugs that look like the math is wrong.
- **Keep the methodology disclaimer current.** It's long on purpose. If a change alters what the model assumes, the disclaimer changes in the same commit.
- Prefer honesty about limitations over impressive-looking output. The tool's value is that it tells the truth about a tradeoff, including when the answer is "this doesn't matter."
