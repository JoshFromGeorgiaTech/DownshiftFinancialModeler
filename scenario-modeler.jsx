import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceDot, ResponsiveContainer
} from "recharts";
import { Baby, Home, Wallet, Target, TrendingUp, AlertTriangle, CheckCircle2, GitBranch, HeartPulse, RotateCcw, Landmark } from "lucide-react";

const STORAGE_KEY = "scenario-modeler-inputs";

// Storage adapter. Prefers the host-provided async `window.storage` when present
// (Claude artifact runtime), falls back to localStorage for a normal browser
// deploy (GitHub Pages, Vercel, local file), and finally to an in-memory map so
// the app still runs in a sandboxed iframe with storage disabled.
// Everything is async so callers don't care which backend is live.
const memoryStore = new Map();

const storage = {
  backend: "memory",

  _detect() {
    if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") {
      return "host";
    }
    try {
      const probe = "__st_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return "local";
    } catch (e) {
      return "memory";
    }
  },

  async get(key) {
    const backend = this._detect();
    this.backend = backend;
    try {
      if (backend === "host") {
        const res = await window.storage.get(key, false);
        return res && res.value ? res.value : null;
      }
      if (backend === "local") return window.localStorage.getItem(key);
      return memoryStore.get(key) ?? null;
    } catch (e) {
      return null;
    }
  },

  async set(key, value) {
    const backend = this._detect();
    this.backend = backend;
    try {
      if (backend === "host") return await window.storage.set(key, value, false);
      if (backend === "local") return window.localStorage.setItem(key, value);
      memoryStore.set(key, value);
    } catch (e) {
      // Quota exceeded or storage blocked — non-fatal, inputs just won't persist.
    }
  },

  async remove(key) {
    const backend = this._detect();
    try {
      if (backend === "host") return await window.storage.delete(key, false);
      if (backend === "local") return window.localStorage.removeItem(key);
      memoryStore.delete(key);
    } catch (e) {
      // no-op
    }
  },
};

const fmtMoney = (n, compact = false) => {
  if (compact) {
    if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
    if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}K`;
    return `$${Math.round(n)}`;
  }
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
};

// --- 2026 tax law constants (single filer, since this models an unmarried couple) ---
const SINGLE_STD_DEDUCTION = 16100;
const SINGLE_ADDL_MEDICARE_THRESHOLD = 200000;
const SS_WAGE_BASE = 184500;
const FEDERAL_SINGLE_BRACKETS = [
  [0, 12400, 0.10],
  [12400, 50400, 0.12],
  [50400, 105700, 0.22],
  [105700, 201775, 0.24],
  [201775, 256225, 0.32],
  [256225, 640600, 0.35],
  [640600, Infinity, 0.37],
];

function federalTaxSingle(taxableIncome) {
  let tax = 0;
  for (const [lo, hi, rate] of FEDERAL_SINGLE_BRACKETS) {
    if (taxableIncome > lo) tax += (Math.min(taxableIncome, hi) - lo) * rate;
    else break;
  }
  return tax;
}

// Safe withdrawal rate as a function of how many years the money must last.
// Anchors from the literature: Bengen's original 4% was calibrated to a 30-year
// horizon; ~3.5% is the "absolute safe" rate that survived 50-year periods
// historically; 3.25-3.5% is the common recommendation for 40+ year FIRE horizons.
// Shorter horizons support materially more.
const SWR_ANCHORS = [[10, 7.5], [20, 4.8], [30, 4.0], [40, 3.6], [50, 3.4], [60, 3.3]];
function swrForHorizon(years) {
  if (years <= SWR_ANCHORS[0][0]) return SWR_ANCHORS[0][1];
  const last = SWR_ANCHORS[SWR_ANCHORS.length - 1];
  if (years >= last[0]) return last[1];
  for (let i = 0; i < SWR_ANCHORS.length - 1; i++) {
    const [y0, r0] = SWR_ANCHORS[i], [y1, r1] = SWR_ANCHORS[i + 1];
    if (years >= y0 && years <= y1) return r0 + (r1 - r0) * ((years - y0) / (y1 - y0));
  }
  return last[1];
}

// Incremental tax cost of converting `conv` dollars of Traditional to Roth, stacked
// on top of that person's wage income for the year. Conversions are ordinary income;
// they are NOT subject to FICA.
function conversionTax(gross, pretaxContrib, conv, gaRatePct) {
  if (conv <= 0) return 0;
  const base = Math.max(0, gross - Math.min(pretaxContrib, gross) - SINGLE_STD_DEDUCTION);
  const withConv = base + conv;
  return (federalTaxSingle(withConv) - federalTaxSingle(base)) + conv * (gaRatePct / 100);
}

// A Traditional withdrawal is ordinary income, so pulling $X leaves less than $X to
// spend. Solve for the gross withdrawal whose after-tax proceeds equal `needNet`.
// Tax stacks on top of whatever wages exist that year, split evenly across both people.
// Fixed-point iteration converges in a few passes since the tax function is monotonic
// and its slope is always < 1.
function grossUpTraditional(needNet, w1, pre1, w2, pre2, gaRatePct, available) {
  if (needNet <= 0) return { gross: 0, tax: 0, net: 0 };
  let gross = needNet;
  for (let i = 0; i < 12; i++) {
    const half = gross / 2;
    const tax = conversionTax(w1, pre1, half, gaRatePct) + conversionTax(w2, pre2, half, gaRatePct);
    const next = needNet + tax;
    if (Math.abs(next - gross) < 1) { gross = next; break; }
    gross = next;
  }
  gross = Math.min(gross, available);
  const half = gross / 2;
  const tax = conversionTax(w1, pre1, half, gaRatePct) + conversionTax(w2, pre2, half, gaRatePct);
  return { gross, tax, net: gross - tax };
}

function computeNetForPerson(gross, gaRatePct, pretaxContrib = 0) {
  const contrib = Math.min(pretaxContrib, gross);
  const taxableIncome = Math.max(0, gross - contrib - SINGLE_STD_DEDUCTION);
  const federalTax = federalTaxSingle(taxableIncome);
  const ssTax = Math.min(gross, SS_WAGE_BASE) * 0.062;
  const medicareTax = gross * 0.0145 + Math.max(0, gross - SINGLE_ADDL_MEDICARE_THRESHOLD) * 0.009;
  const gaTax = taxableIncome * (gaRatePct / 100);
  const totalTax = federalTax + ssTax + medicareTax + gaTax;
  return { gross, contrib, federalTax, ssTax, medicareTax, gaTax, totalTax, net: gross - contrib - totalTax };
}

const colors = {
  bg: "#0B1220",
  panel: "#121B2E",
  panelBorder: "rgba(255,255,255,0.08)",
  grid: "rgba(255,255,255,0.07)",
  text: "#E8ECF3",
  subtext: "#8593AD",
  amber: "#D8A34C",
  coral: "#C97064",
  mint: "#6FA98A",
  steel: "#6E9BD1",
  violet: "#9B87C4",
};

const DEFAULTS = {
  startAge: 29, income1: 170000, income2: 150000, gaRate: 5.5, expenses: 110000, growthRate: 6, horizon: 30, penaltyFreeAge: 59,
  kidsOn: true, numKids: 2, infantCost: 18000, infantYears: 4, laterCost: 8000, kidsStartYear: 3, kidsDuration: 22,
  trad0: 450000, roth0: 150000, rothBasis0: 90000, taxable0: 540000, cash0: 60000, hsa0: 50000,
  tradTarget: 46000, rothTarget: 14000, hsaTarget: 8300, employerMatchPct: 50, employerMatchCapPct: 6,
  inflationRate: 2.5, planningEndAge: 95, swrAdjust: 0,
  ladderOn: true, convertPerPerson: 33000, seasoningYears: 5,
  houseOn: true, housePrice: 650000, downPaymentPct: 20, mortgageRate: 6.6, loanTermYears: 30,
  propertyTaxRate: 1.0, insMaintPct: 1.3, currentHousingCost: 30000, appreciationRate: 3.5, houseYear: 2,
  uninsuredOn: true, medCostPerAdult: 2600, numUninsuredAdults: 2,
  scenarios: [
    { id: "a", label: "Downshift A", color: colors.amber, enabled: true, year1: 4, incomePct1: 40, retireYear1: 20, year2: 4, incomePct2: 100, retireYear2: 25 },
    { id: "b", label: "Downshift B", color: colors.mint, enabled: true, year1: 8, incomePct1: 40, retireYear1: 22, year2: 8, incomePct2: 40, retireYear2: 22 },
    { id: "c", label: "Downshift C", color: colors.steel, enabled: false, year1: 10, incomePct1: 100, retireYear1: 24, year2: 6, incomePct2: 30, retireYear2: 18 },
  ],
};

const eyebrow = {
  fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
  color: colors.subtext, fontFamily: "'Space Grotesk', sans-serif",
};

function Field({ label, value, onChange, min, max, step, prefix = "", suffix = "", disabled }) {
  const handleTextChange = (e) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") { onChange(0); return; }
    const num = Number(raw);
    if (!Number.isNaN(num)) onChange(num);
  };
  const handleBlur = (e) => {
    const num = Number(e.target.value);
    const clamped = Number.isNaN(num) ? min : Math.min(max, Math.max(min, num));
    onChange(clamped);
  };
  const width = `${Math.max(String(value).length, 2) + 2}ch`;

  return (
    <div style={{ opacity: disabled ? 0.35 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={eyebrow}>{label}</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: colors.amber }}>
          {prefix && <span>{prefix}</span>}
          <input
            type="number"
            inputMode="decimal"
            value={value}
            step={step}
            disabled={disabled}
            onChange={handleTextChange}
            onBlur={handleBlur}
            style={{
              width, background: "transparent", border: "none",
              borderBottom: `1px solid ${colors.panelBorder}`, color: colors.amber,
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, textAlign: "right",
              outline: "none", padding: "0 2px",
            }}
          />
          {suffix && <span>{suffix}</span>}
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: colors.amber }}
      />
    </div>
  );
}

function Toggle({ label, icon, checked, onChange, accent = colors.amber }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
        borderRadius: 8, border: `1px solid ${checked ? accent : colors.panelBorder}`,
        background: checked ? `${accent}1a` : "transparent",
        color: checked ? accent : colors.subtext,
        cursor: "pointer", width: "100%", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13,
      }}
    >
      {icon}<span>{label}</span>
      <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
        {checked ? "ON" : "OFF"}
      </span>
    </button>
  );
}

function Readout({ icon, label, value, accent, sub }) {
  return (
    <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: colors.subtext, marginBottom: 6 }}>
        {icon}<span style={eyebrow}>{label}</span>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, color: accent }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: colors.subtext, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function GroupHeader({ icon, children }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, ...eyebrow }}>{icon}{children}</div>;
}

function DiamondMarker({ cx, cy, fill }) {
  return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={colors.bg} stroke={fill} strokeWidth={2} transform={`rotate(45 ${cx} ${cy})`} />;
}

function SquareMarker({ cx, cy, fill }) {
  return <rect x={cx - 5} y={cy - 5} width={10} height={10} fill={fill} stroke={colors.bg} strokeWidth={2} />;
}

function ScenarioCard({ s, onChange }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Toggle label={s.label} icon={<span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, display: "inline-block" }} />}
          checked={s.enabled} onChange={(v) => onChange("enabled", v)} accent={s.color} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.subtext, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 8 }}>Person 1</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Downshift in" value={s.year1} onChange={(v) => onChange("year1", v)} min={0} max={30} step={1} suffix=" yrs" disabled={!s.enabled} />
            <Field label="Income after" value={s.incomePct1} onChange={(v) => onChange("incomePct1", v)} min={0} max={100} step={5} suffix="%" disabled={!s.enabled} />
            <Field label="Retire fully in" value={s.retireYear1} onChange={(v) => onChange("retireYear1", v)} min={0} max={45} step={1} suffix=" yrs" disabled={!s.enabled} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.subtext, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 8 }}>Person 2</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Downshift in" value={s.year2} onChange={(v) => onChange("year2", v)} min={0} max={30} step={1} suffix=" yrs" disabled={!s.enabled} />
            <Field label="Income after" value={s.incomePct2} onChange={(v) => onChange("incomePct2", v)} min={0} max={100} step={5} suffix="%" disabled={!s.enabled} />
            <Field label="Retire fully in" value={s.retireYear2} onChange={(v) => onChange("retireYear2", v)} min={0} max={45} step={1} suffix=" yrs" disabled={!s.enabled} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScenarioModeler() {
  const [startAge, setStartAge] = useState(DEFAULTS.startAge);
  const [income1, setIncome1] = useState(DEFAULTS.income1);
  const [income2, setIncome2] = useState(DEFAULTS.income2);
  const [gaRate, setGaRate] = useState(DEFAULTS.gaRate);
  const [expenses, setExpenses] = useState(DEFAULTS.expenses);
  const [growthRate, setGrowthRate] = useState(DEFAULTS.growthRate);
  const [horizon, setHorizon] = useState(DEFAULTS.horizon);
  const [penaltyFreeAge, setPenaltyFreeAge] = useState(DEFAULTS.penaltyFreeAge);

  const [kidsOn, setKidsOn] = useState(DEFAULTS.kidsOn);
  const [numKids, setNumKids] = useState(DEFAULTS.numKids);
  const [infantCost, setInfantCost] = useState(DEFAULTS.infantCost);
  const [infantYears, setInfantYears] = useState(DEFAULTS.infantYears);
  const [laterCost, setLaterCost] = useState(DEFAULTS.laterCost);
  const [kidsStartYear, setKidsStartYear] = useState(DEFAULTS.kidsStartYear);
  const [kidsDuration, setKidsDuration] = useState(DEFAULTS.kidsDuration);

  const [trad0, setTrad0] = useState(DEFAULTS.trad0);
  const [roth0, setRoth0] = useState(DEFAULTS.roth0);
  const [rothBasis0, setRothBasis0] = useState(DEFAULTS.rothBasis0);
  const [taxable0, setTaxable0] = useState(DEFAULTS.taxable0);
  const [cash0, setCash0] = useState(DEFAULTS.cash0);
  const [hsa0, setHsa0] = useState(DEFAULTS.hsa0);

  const [tradTarget, setTradTarget] = useState(DEFAULTS.tradTarget);
  const [rothTarget, setRothTarget] = useState(DEFAULTS.rothTarget);
  const [hsaTarget, setHsaTarget] = useState(DEFAULTS.hsaTarget);
  const [employerMatchPct, setEmployerMatchPct] = useState(DEFAULTS.employerMatchPct);
  const [employerMatchCapPct, setEmployerMatchCapPct] = useState(DEFAULTS.employerMatchCapPct);
  const [inflationRate, setInflationRate] = useState(DEFAULTS.inflationRate);
  const [planningEndAge, setPlanningEndAge] = useState(DEFAULTS.planningEndAge);
  const [swrAdjust, setSwrAdjust] = useState(DEFAULTS.swrAdjust);
  const [ladderOn, setLadderOn] = useState(DEFAULTS.ladderOn);
  const [convertPerPerson, setConvertPerPerson] = useState(DEFAULTS.convertPerPerson);
  const [seasoningYears, setSeasoningYears] = useState(DEFAULTS.seasoningYears);

  const [houseOn, setHouseOn] = useState(DEFAULTS.houseOn);
  const [housePrice, setHousePrice] = useState(DEFAULTS.housePrice);
  const [downPaymentPct, setDownPaymentPct] = useState(DEFAULTS.downPaymentPct);
  const [mortgageRate, setMortgageRate] = useState(DEFAULTS.mortgageRate);
  const [loanTermYears, setLoanTermYears] = useState(DEFAULTS.loanTermYears);
  const [propertyTaxRate, setPropertyTaxRate] = useState(DEFAULTS.propertyTaxRate);
  const [insMaintPct, setInsMaintPct] = useState(DEFAULTS.insMaintPct);
  const [currentHousingCost, setCurrentHousingCost] = useState(DEFAULTS.currentHousingCost);
  const [appreciationRate, setAppreciationRate] = useState(DEFAULTS.appreciationRate);
  const [houseYear, setHouseYear] = useState(DEFAULTS.houseYear);

  const [uninsuredOn, setUninsuredOn] = useState(DEFAULTS.uninsuredOn);
  const [medCostPerAdult, setMedCostPerAdult] = useState(DEFAULTS.medCostPerAdult);
  const [numUninsuredAdults, setNumUninsuredAdults] = useState(DEFAULTS.numUninsuredAdults);

  const [scenarios, setScenarios] = useState(DEFAULTS.scenarios);

  const [loaded, setLoaded] = useState(false);
  const [justRestored, setJustRestored] = useState(false);
  const [backend, setBackend] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await storage.get(STORAGE_KEY);
        if (!cancelled && raw) {
          const d = JSON.parse(raw);
          if (d.startAge !== undefined) setStartAge(d.startAge);
          if (d.income1 !== undefined) setIncome1(d.income1);
          if (d.income2 !== undefined) setIncome2(d.income2);
          if (d.gaRate !== undefined) setGaRate(d.gaRate);
          if (d.expenses !== undefined) setExpenses(d.expenses);
          if (d.growthRate !== undefined) setGrowthRate(d.growthRate);
          if (d.horizon !== undefined) setHorizon(d.horizon);
          if (d.penaltyFreeAge !== undefined) setPenaltyFreeAge(d.penaltyFreeAge);
          if (d.kidsOn !== undefined) setKidsOn(d.kidsOn);
          if (d.numKids !== undefined) setNumKids(d.numKids);
          if (d.infantCost !== undefined) setInfantCost(d.infantCost);
          if (d.infantYears !== undefined) setInfantYears(d.infantYears);
          if (d.laterCost !== undefined) setLaterCost(d.laterCost);
          if (d.kidsStartYear !== undefined) setKidsStartYear(d.kidsStartYear);
          if (d.kidsDuration !== undefined) setKidsDuration(d.kidsDuration);
          if (d.trad0 !== undefined) setTrad0(d.trad0);
          if (d.roth0 !== undefined) setRoth0(d.roth0);
          if (d.rothBasis0 !== undefined) setRothBasis0(d.rothBasis0);
          if (d.taxable0 !== undefined) setTaxable0(d.taxable0);
          if (d.cash0 !== undefined) setCash0(d.cash0);
          if (d.hsa0 !== undefined) setHsa0(d.hsa0);
          if (d.tradTarget !== undefined) setTradTarget(d.tradTarget);
          if (d.rothTarget !== undefined) setRothTarget(d.rothTarget);
          if (d.hsaTarget !== undefined) setHsaTarget(d.hsaTarget);
          if (d.employerMatchPct !== undefined) setEmployerMatchPct(d.employerMatchPct);
          if (d.employerMatchCapPct !== undefined) setEmployerMatchCapPct(d.employerMatchCapPct);
          if (d.inflationRate !== undefined) setInflationRate(d.inflationRate);
          if (d.planningEndAge !== undefined) setPlanningEndAge(d.planningEndAge);
          if (d.swrAdjust !== undefined) setSwrAdjust(d.swrAdjust);
          if (d.ladderOn !== undefined) setLadderOn(d.ladderOn);
          if (d.convertPerPerson !== undefined) setConvertPerPerson(d.convertPerPerson);
          if (d.seasoningYears !== undefined) setSeasoningYears(d.seasoningYears);
          if (d.houseOn !== undefined) setHouseOn(d.houseOn);
          if (d.housePrice !== undefined) setHousePrice(d.housePrice);
          if (d.downPaymentPct !== undefined) setDownPaymentPct(d.downPaymentPct);
          if (d.mortgageRate !== undefined) setMortgageRate(d.mortgageRate);
          if (d.loanTermYears !== undefined) setLoanTermYears(d.loanTermYears);
          if (d.propertyTaxRate !== undefined) setPropertyTaxRate(d.propertyTaxRate);
          if (d.insMaintPct !== undefined) setInsMaintPct(d.insMaintPct);
          if (d.currentHousingCost !== undefined) setCurrentHousingCost(d.currentHousingCost);
          if (d.appreciationRate !== undefined) setAppreciationRate(d.appreciationRate);
          if (d.houseYear !== undefined) setHouseYear(d.houseYear);
          if (d.uninsuredOn !== undefined) setUninsuredOn(d.uninsuredOn);
          if (d.medCostPerAdult !== undefined) setMedCostPerAdult(d.medCostPerAdult);
          if (d.numUninsuredAdults !== undefined) setNumUninsuredAdults(d.numUninsuredAdults);
          if (Array.isArray(d.scenarios) && d.scenarios.length) setScenarios(d.scenarios);
          setJustRestored(true);
        }
      } catch (e) {
        // nothing saved yet — start from defaults
      } finally {
        if (!cancelled) { setBackend(storage.backend); setLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const data = {
      startAge, income1, income2, gaRate, expenses, growthRate, horizon, penaltyFreeAge,
      kidsOn, numKids, infantCost, infantYears, laterCost, kidsStartYear, kidsDuration,
      trad0, roth0, rothBasis0, taxable0, cash0, hsa0, tradTarget, rothTarget, hsaTarget,
      employerMatchPct, employerMatchCapPct, inflationRate, planningEndAge, swrAdjust, ladderOn, convertPerPerson, seasoningYears,
      houseOn, housePrice, downPaymentPct, mortgageRate, loanTermYears, propertyTaxRate,
      insMaintPct, currentHousingCost, appreciationRate, houseYear,
      uninsuredOn, medCostPerAdult, numUninsuredAdults, scenarios,
    };
    const t = setTimeout(() => {
      storage.set(STORAGE_KEY, JSON.stringify(data));
    }, 500);
    return () => clearTimeout(t);
  }, [loaded, startAge, income1, income2, gaRate, expenses, growthRate, horizon, penaltyFreeAge,
      kidsOn, numKids, infantCost, infantYears, laterCost, kidsStartYear, kidsDuration,
      trad0, roth0, rothBasis0, taxable0, cash0, hsa0, tradTarget, rothTarget, hsaTarget,
      employerMatchPct, employerMatchCapPct, inflationRate, planningEndAge, swrAdjust, ladderOn, convertPerPerson, seasoningYears,
      houseOn, housePrice, downPaymentPct, mortgageRate, loanTermYears, propertyTaxRate,
      insMaintPct, currentHousingCost, appreciationRate, houseYear,
      uninsuredOn, medCostPerAdult, numUninsuredAdults, scenarios]);

  const handleReset = () => {
    storage.remove(STORAGE_KEY);
    setStartAge(DEFAULTS.startAge); setIncome1(DEFAULTS.income1); setIncome2(DEFAULTS.income2);
    setGaRate(DEFAULTS.gaRate);
    setExpenses(DEFAULTS.expenses); setGrowthRate(DEFAULTS.growthRate); setHorizon(DEFAULTS.horizon);
    setPenaltyFreeAge(DEFAULTS.penaltyFreeAge);
    setKidsOn(DEFAULTS.kidsOn); setNumKids(DEFAULTS.numKids);
    setInfantCost(DEFAULTS.infantCost); setInfantYears(DEFAULTS.infantYears); setLaterCost(DEFAULTS.laterCost);
    setKidsStartYear(DEFAULTS.kidsStartYear); setKidsDuration(DEFAULTS.kidsDuration);
    setTrad0(DEFAULTS.trad0); setRoth0(DEFAULTS.roth0); setRothBasis0(DEFAULTS.rothBasis0);
    setTaxable0(DEFAULTS.taxable0); setCash0(DEFAULTS.cash0); setHsa0(DEFAULTS.hsa0);
    setTradTarget(DEFAULTS.tradTarget); setRothTarget(DEFAULTS.rothTarget); setHsaTarget(DEFAULTS.hsaTarget);
    setEmployerMatchPct(DEFAULTS.employerMatchPct); setEmployerMatchCapPct(DEFAULTS.employerMatchCapPct);
    setInflationRate(DEFAULTS.inflationRate);
    setPlanningEndAge(DEFAULTS.planningEndAge); setSwrAdjust(DEFAULTS.swrAdjust);
    setLadderOn(DEFAULTS.ladderOn); setConvertPerPerson(DEFAULTS.convertPerPerson); setSeasoningYears(DEFAULTS.seasoningYears);
    setHouseOn(DEFAULTS.houseOn); setHousePrice(DEFAULTS.housePrice); setDownPaymentPct(DEFAULTS.downPaymentPct);
    setMortgageRate(DEFAULTS.mortgageRate); setLoanTermYears(DEFAULTS.loanTermYears);
    setPropertyTaxRate(DEFAULTS.propertyTaxRate); setInsMaintPct(DEFAULTS.insMaintPct);
    setCurrentHousingCost(DEFAULTS.currentHousingCost); setAppreciationRate(DEFAULTS.appreciationRate);
    setHouseYear(DEFAULTS.houseYear);
    setUninsuredOn(DEFAULTS.uninsuredOn); setMedCostPerAdult(DEFAULTS.medCostPerAdult);
    setNumUninsuredAdults(DEFAULTS.numUninsuredAdults);
    setScenarios(DEFAULTS.scenarios);
  };

  // Live tax snapshot at full income today
  const taxSnapshot = useMemo(() => {
    const p1TradContrib = Math.min(tradTarget / 2, income1);
    const p1HsaContrib = Math.min(hsaTarget / 2, Math.max(0, income1 - p1TradContrib));
    const p2TradContrib = Math.min(tradTarget / 2, income2);
    const p2HsaContrib = Math.min(hsaTarget / 2, Math.max(0, income2 - p2TradContrib));
    const p1 = computeNetForPerson(income1, gaRate, p1TradContrib + p1HsaContrib);
    const p2 = computeNetForPerson(income2, gaRate, p2TradContrib + p2HsaContrib);
    return {
      grossCombined: income1 + income2,
      pretaxCombined: p1TradContrib + p1HsaContrib + p2TradContrib + p2HsaContrib,
      federalCombined: p1.federalTax + p2.federalTax,
      ficaCombined: p1.ssTax + p1.medicareTax + p2.ssTax + p2.medicareTax,
      gaCombined: p1.gaTax + p2.gaTax,
      netCombined: p1.net + p2.net,
    };
  }, [income1, income2, gaRate, tradTarget, hsaTarget]);

  // Live mortgage snapshot (at purchase), shown in the House panel
  const mortgageSnapshot = useMemo(() => {
    const loanAmount = housePrice * (1 - downPaymentPct / 100);
    const totalMonths = loanTermYears * 12;
    const monthlyRate = mortgageRate / 100 / 12;
    const monthlyPI = monthlyRate === 0
      ? loanAmount / totalMonths
      : loanAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -totalMonths));
    const monthlyTax = housePrice * propertyTaxRate / 100 / 12;
    const monthlyInsMaint = housePrice * insMaintPct / 100 / 12;
    const ltv = loanAmount / housePrice;
    const monthlyPMI = ltv > 0.8 ? loanAmount * 0.005 / 12 : 0;
    const monthlyTotal = monthlyPI + monthlyTax + monthlyInsMaint + monthlyPMI;
    const downPaymentAmount = housePrice * downPaymentPct / 100;
    return { loanAmount, monthlyPI, monthlyTax, monthlyInsMaint, monthlyPMI, monthlyTotal, downPaymentAmount,
      annualDelta: monthlyTotal * 12 - currentHousingCost };
  }, [housePrice, downPaymentPct, mortgageRate, loanTermYears, propertyTaxRate, insMaintPct, currentHousingCost]);

  const { rows, baselineFiYear, baselineFiSwr, summaries, equityAtHorizon } = useMemo(() => {
    const loanAmount = housePrice * (1 - downPaymentPct / 100);
    const totalMonths = loanTermYears * 12;
    const monthlyRate = mortgageRate / 100 / 12;
    const monthlyPI = monthlyRate === 0
      ? loanAmount / totalMonths
      : loanAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -totalMonths));
    const downPaymentAmount = housePrice * downPaymentPct / 100;

    function remainingBalance(monthsElapsed) {
      if (monthsElapsed <= 0) return loanAmount;
      if (monthsElapsed >= totalMonths) return 0;
      if (monthlyRate === 0) return loanAmount * (1 - monthsElapsed / totalMonths);
      return loanAmount * ((Math.pow(1 + monthlyRate, totalMonths) - Math.pow(1 + monthlyRate, monthsElapsed)) /
        (Math.pow(1 + monthlyRate, totalMonths) - 1));
    }

    const housingByYear = [];
    for (let y = 0; y <= horizon; y++) {
      if (houseOn && y >= houseYear) {
        const kk = y - houseYear;
        const homeValue = housePrice * Math.pow(1 + appreciationRate / 100, kk);
        const balance = remainingBalance(kk * 12);
        const monthlyTax = homeValue * propertyTaxRate / 100 / 12;
        const monthlyInsMaint = homeValue * insMaintPct / 100 / 12;
        const ltv = homeValue > 0 ? balance / homeValue : 0;
        const monthlyPMI = ltv > 0.8 ? balance * 0.005 / 12 : 0;
        // P&I and PMI are fixed NOMINAL dollars; this model runs in real dollars, so inflation
        // erodes them every year. Tax/insurance/maintenance scale with the home, so they stay real.
        const deflator = Math.pow(1 + inflationRate / 100, -kk);
        const annualCost = ((monthlyPI + monthlyPMI) * deflator + monthlyTax + monthlyInsMaint) * 12;
        housingByYear.push({
          housingCost: annualCost,
          oneTime: y === houseYear ? downPaymentAmount : 0,
          equity: homeValue - balance,
        });
      } else {
        housingByYear.push({ housingCost: currentHousingCost, oneTime: 0, equity: 0 });
      }
    }

    function simulate(year1, pct1, retireYear1, year2, pct2, retireYear2) {
      let trad = trad0, roth = roth0, rothBasis = Math.min(rothBasis0, roth0), taxable = taxable0, cash = cash0, hsa = hsa0;
      let firstShortfallYear = null;
      let fiYear = null;
      let fiSwr = null;
      const conversions = []; // { availableYear, amount } — seasoned conversions become penalty-free
      let totalConverted = 0;
      let totalWithdrawalTax = 0;
      const out = [];

      for (let y = 0; y <= horizon; y++) {
        let planExpenses = expenses;
        if (kidsOn && y >= kidsStartYear && y < kidsStartYear + kidsDuration) {
          const kidAge = y - kidsStartYear;
          planExpenses += numKids * (kidAge < infantYears ? infantCost : laterCost);
        }
        planExpenses += housingByYear[y].housingCost;

        const p1Active = y < retireYear1 && (y < year1 || pct1 === 100);
        const p2Active = y < retireYear2 && (y < year2 || pct2 === 100);
        if (uninsuredOn && !p1Active && !p2Active) planExpenses += medCostPerAdult * numUninsuredAdults;

        const recurringExpenses = planExpenses; // FI target uses this — a one-time down payment isn't an ongoing burn rate
        planExpenses += housingByYear[y].oneTime;

        const p1Gross = y >= retireYear1 ? 0 : (y < year1 ? income1 : income1 * (pct1 / 100));
        const p2Gross = y >= retireYear2 ? 0 : (y < year2 ? income2 : income2 * (pct2 / 100));

        // Traditional/HSA are pretax payroll elections — split evenly across the two incomes,
        // each capped at that person's own gross (can't contribute more than you earn that year).
        const p1TradContrib = Math.min(tradTarget / 2, p1Gross);
        const p1HsaContrib = Math.min(hsaTarget / 2, Math.max(0, p1Gross - p1TradContrib));
        const p2TradContrib = Math.min(tradTarget / 2, p2Gross);
        const p2HsaContrib = Math.min(hsaTarget / 2, Math.max(0, p2Gross - p2TradContrib));
        const p1Net = computeNetForPerson(p1Gross, gaRate, p1TradContrib + p1HsaContrib).net;
        const p2Net = computeNetForPerson(p2Gross, gaRate, p2TradContrib + p2HsaContrib).net;

        const age = startAge + y;
        const penaltyFree = age >= penaltyFreeAge;

        // --- Roth conversion ladder ---
        // Convert Traditional -> Roth during low-income years. The converted amount is
        // ordinary income now, but becomes penalty-free accessible after seasoning.
        // Pointless once penalty-free age is reached, so it stops there.
        let converted = 0, convTax = 0;
        if (ladderOn && !penaltyFree && trad > 0) {
          const c1 = Math.min(convertPerPerson, Math.max(0, trad / 2));
          const c2 = Math.min(convertPerPerson, Math.max(0, trad / 2));
          converted = Math.min(c1 + c2, trad);
          convTax = conversionTax(p1Gross, p1TradContrib + p1HsaContrib, c1, gaRate)
                  + conversionTax(p2Gross, p2TradContrib + p2HsaContrib, c2, gaRate);
          conversions.push({ availableYear: y + seasoningYears, amount: converted });
          totalConverted += converted;
        }

        const planIncome = p1Net + p2Net;
        const cashflow = planIncome - planExpenses - convTax;

        // Employer match: matchPct of your deferral, capped at matchCapPct of that person's gross.
        // Free money, lands in Traditional, and is NOT taxable income to you.
        const matchFor = (gross, deferral) =>
          Math.min(deferral * (employerMatchPct / 100), gross * (employerMatchCapPct / 100));
        const employerMatch = matchFor(p1Gross, p1TradContrib) + matchFor(p2Gross, p2TradContrib);

        let tradWithdrawalTax = 0;
        let tradChange = p1TradContrib + p2TradContrib + employerMatch - converted;
        const hsaChange = p1HsaContrib + p2HsaContrib;
        let rothChange = 0, rothBasisChange = 0, taxableChange = 0, cashChange = 0, shortfall = 0;

        if (cashflow >= 0) {
          let remaining = cashflow;
          rothChange = Math.min(rothTarget, remaining); remaining -= rothChange;
          rothBasisChange = rothChange;
          taxableChange = remaining;
        } else {
          let need = -cashflow;
          // Each source can only supply what it actually holds; a negative balance (debt carried
          // from a prior shortfall) supplies nothing, so clamp at 0 rather than letting Math.min
          // return the negative and inflate `need`.
          const fromCash = Math.min(Math.max(cash, 0), need);
          cashChange = -fromCash; need -= fromCash;

          const fromTaxable = Math.min(Math.max(taxable, 0), need);
          taxableChange = -fromTaxable; need -= fromTaxable;

          const fromRothBasis = Math.min(Math.max(rothBasis, 0), need);
          rothChange -= fromRothBasis; rothBasisChange -= fromRothBasis; need -= fromRothBasis;

          // Seasoned conversions: penalty-free once they've aged past the seasoning window,
          // oldest first. This is the ladder actually paying out.
          for (const c of conversions) {
            if (need <= 0) break;
            if (c.availableYear <= y && c.amount > 0) {
              const take = Math.min(c.amount, need);
              c.amount -= take; rothChange -= take; need -= take;
            }
          }

          if (need > 0 && penaltyFree) {
            // Ordinary income tax applies, so gross up: withdrawing $X nets less than $X.
            const gu = grossUpTraditional(
              need, p1Gross, p1TradContrib + p1HsaContrib,
              p2Gross, p2TradContrib + p2HsaContrib, gaRate, Math.max(trad, 0)
            );
            tradChange -= gu.gross;
            tradWithdrawalTax += gu.tax;
            need -= gu.net;
          }
          if (need > 0 && penaltyFree) {
            const rothGrowthAvail = Math.max(roth - Math.max(rothBasis, 0), 0);
            const fromRothGrowth = Math.min(rothGrowthAvail, need);
            rothChange -= fromRothGrowth; need -= fromRothGrowth;
          }
          shortfall = need;
          if (need > 0) taxableChange -= need; // no accessible funds left — surfaces as negative (debt), not silently absorbed
        }

        totalWithdrawalTax += tradWithdrawalTax;
        const total = trad + roth + taxable + cash + hsa;
        if (shortfall > 1 && firstShortfallYear === null) firstShortfallYear = y;
        const yearsToFund = Math.max(1, planningEndAge - age);
        const swr = Math.max(0.5, swrForHorizon(yearsToFund) + swrAdjust);
        if (fiYear === null && total >= recurringExpenses * (100 / swr)) { fiYear = y; fiSwr = swr; }
        out.push({ year: y, total: Math.round(total) });

        // Mid-year convention: contributions and withdrawals happen throughout the year, not on
        // Jan 1, so they earn (or forgo) roughly half a year of return — not a full year.
        const g = growthRate / 100;
        const midYear = 1 + g / 2;
        trad = trad * (1 + g) + tradChange * midYear;
        roth = roth * (1 + g) + (rothChange + converted) * midYear;
        rothBasis = Math.max(0, rothBasis + rothBasisChange);
        taxable = taxable * (1 + g) + taxableChange * midYear;
        cash = cash + cashChange;
        hsa = hsa * (1 + g) + hsaChange * midYear;
      }
      return { rows: out, firstShortfallYear, fiYear, fiSwr, totalConverted, totalWithdrawalTax };
    }

    const baseline = simulate(horizon + 1, 100, horizon + 1, horizon + 1, 100, horizon + 1);
    const active = scenarios.filter((s) => s.enabled);
    const results = active.map((s) => ({ ...s, sim: simulate(s.year1, s.incomePct1, s.retireYear1, s.year2, s.incomePct2, s.retireYear2) }));

    const merged = [];
    for (let y = 0; y <= horizon; y++) {
      const row = { year: y, baseline: baseline.rows[y].total };
      results.forEach((s) => { row[s.id] = s.sim.rows[y].total; });
      merged.push(row);
    }

    return {
      rows: merged,
      baselineFiYear: baseline.fiYear,
      baselineFiSwr: baseline.fiSwr,
      summaries: results.map((s) => ({
        id: s.id, label: s.label, color: s.color, year1: s.year1, incomePct1: s.incomePct1, retireYear1: s.retireYear1,
        year2: s.year2, incomePct2: s.incomePct2, retireYear2: s.retireYear2,
        end: s.sim.rows[horizon].total, fiYear: s.sim.fiYear, fiSwr: s.sim.fiSwr, shortfallYear: s.sim.firstShortfallYear,
        totalConverted: s.sim.totalConverted, totalWithdrawalTax: s.sim.totalWithdrawalTax,
      })),
      equityAtHorizon: housingByYear[horizon].equity,
    };
  }, [startAge, income1, income2, gaRate, expenses, growthRate, horizon, penaltyFreeAge, kidsOn, numKids, infantCost, infantYears, laterCost,
      kidsStartYear, kidsDuration, trad0, roth0, rothBasis0, taxable0, cash0, hsa0, tradTarget, rothTarget, hsaTarget,
      employerMatchPct, employerMatchCapPct, inflationRate, planningEndAge, swrAdjust, ladderOn, convertPerPerson, seasoningYears,
      houseOn, housePrice, downPaymentPct, mortgageRate, loanTermYears, propertyTaxRate, insMaintPct,
      currentHousingCost, appreciationRate, houseYear, uninsuredOn, medCostPerAdult, numUninsuredAdults,
      planningEndAge, swrAdjust, ladderOn, convertPerPerson, seasoningYears, scenarios]);

  const baselineEnd = rows[rows.length - 1].baseline;

  return (
    <div style={{
      background: colors.bg, color: colors.text, minHeight: "100vh",
      fontFamily: "'Inter', sans-serif", padding: "24px 16px",
      backgroundImage: `linear-gradient(${colors.grid} 1px, transparent 1px), linear-gradient(90deg, ${colors.grid} 1px, transparent 1px)`,
      backgroundSize: "28px 28px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');
        input[type=range] { height: 4px; -webkit-appearance: none; background: rgba(255,255,255,0.12); border-radius: 2px; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
          background: ${colors.amber}; cursor: pointer; margin-top: -5px;
        }
        input[type=range]::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%; border: none;
          background: ${colors.amber}; cursor: pointer;
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; appearance: textfield; }
      `}</style>

      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ marginBottom: 22, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ ...eyebrow, color: colors.amber }}>Scenario Modeler</div>
            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 26, margin: "4px 0 0" }}>
              Downshift timing, compared
            </h1>
            <p style={{ color: colors.subtext, fontSize: 14, marginTop: 4, maxWidth: 620 }}>
              The dashed line never downshifts or retires. Toggle scenarios A–C to test different downshift years, income levels, and full retirement years against it and each other.
              {justRestored && <span style={{ color: colors.mint }}> · Restored your last inputs.</span>}
              {backend === "memory" && <span style={{ color: colors.coral }}> · Storage unavailable here — inputs won't persist after reload.</span>}
            </p>
          </div>
          <button
            onClick={handleReset}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8,
              border: `1px solid ${colors.panelBorder}`, background: "transparent", color: colors.subtext,
              fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            <RotateCcw size={12} /> Reset to defaults
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 22 }}>
              <div>
                <GroupHeader icon={<TrendingUp size={13} />}>Income &amp; expenses</GroupHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Field label="Current age" value={startAge} onChange={setStartAge} min={18} max={65} step={1} />
                  <Field label="Person 1 gross salary" value={income1} onChange={setIncome1} min={40000} max={600000} step={5000} prefix="$" />
                  <Field label="Person 2 gross salary" value={income2} onChange={setIncome2} min={40000} max={600000} step={5000} prefix="$" />
                  <Field label="GA state tax rate" value={gaRate} onChange={setGaRate} min={0} max={10} step={0.1} suffix="%" />
                  <Field label="Living expenses (excl. housing)" value={expenses} onChange={setExpenses} min={40000} max={400000} step={2000} prefix="$" />
                  <Field label="Expected real return" value={growthRate} onChange={setGrowthRate} min={2} max={10} step={0.5} suffix="%" />
                  <Field label="Modeling horizon" value={horizon} onChange={setHorizon} min={10} max={40} step={1} suffix=" yrs" />
                  <Field label="Penalty-free access age" value={penaltyFreeAge} onChange={setPenaltyFreeAge} min={50} max={65} step={1} />
                </div>
              </div>

              <div>
                <div style={{ marginBottom: 12 }}>
                  <Toggle label="Kids" icon={<Baby size={14} />} checked={kidsOn} onChange={setKidsOn} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Field label="Number of kids" value={numKids} onChange={setNumKids} min={1} max={4} step={1} disabled={!kidsOn} />
                  <Field label="Infant/toddler rate per kid / yr" value={infantCost} onChange={setInfantCost} min={0} max={60000} step={1000} prefix="$" disabled={!kidsOn} />
                  <Field label="Infant rate applies until kid age" value={infantYears} onChange={setInfantYears} min={0} max={10} step={1} disabled={!kidsOn} />
                  <Field label="School-age rate per kid / yr" value={laterCost} onChange={setLaterCost} min={0} max={40000} step={500} prefix="$" disabled={!kidsOn} />
                  <Field label="First kid arrives in" value={kidsStartYear} onChange={setKidsStartYear} min={0} max={15} step={1} suffix=" yrs from now" disabled={!kidsOn} />
                  <Field label="Support each kid until age" value={kidsDuration} onChange={setKidsDuration} min={1} max={30} step={1} disabled={!kidsOn} />
                </div>

                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: colors.subtext, marginBottom: 8 }}>
                    <Landmark size={13} /><span style={eyebrow}>Take-home today</span>
                  </div>
                  <div style={{
                    background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 10, padding: 12,
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: colors.subtext }}>
                      <span>Gross combined</span><span style={{ color: colors.text }}>{fmtMoney(taxSnapshot.grossCombined, true)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: colors.subtext }}>
                      <span>Pretax 401k/HSA</span><span style={{ color: colors.text }}>−{fmtMoney(taxSnapshot.pretaxCombined, true)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: colors.subtext }}>
                      <span>Federal (single ea.)</span><span style={{ color: colors.text }}>−{fmtMoney(taxSnapshot.federalCombined, true)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: colors.subtext }}>
                      <span>FICA (SS + Medicare)</span><span style={{ color: colors.text }}>−{fmtMoney(taxSnapshot.ficaCombined, true)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: colors.subtext }}>
                      <span>GA state ({gaRate}%)</span><span style={{ color: colors.text }}>−{fmtMoney(taxSnapshot.gaCombined, true)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.panelBorder}`, color: colors.amber }}>
                      <span>Net take-home</span><span>{fmtMoney(taxSnapshot.netCombined, true)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <GroupHeader icon={<Wallet size={13} />}>Accounts</GroupHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Field label="Traditional balance" value={trad0} onChange={setTrad0} min={0} max={1500000} step={10000} prefix="$" />
                  <Field label="Roth balance" value={roth0} onChange={setRoth0} min={0} max={1000000} step={5000} prefix="$" />
                  <Field label="Roth basis (contributions)" value={rothBasis0} onChange={setRothBasis0} min={0} max={roth0} step={5000} prefix="$" />
                  <Field label="Taxable — invested" value={taxable0} onChange={setTaxable0} min={0} max={2000000} step={10000} prefix="$" />
                  <Field label="Taxable — cash (money market)" value={cash0} onChange={setCash0} min={0} max={500000} step={5000} prefix="$" />
                  <Field label="HSA balance" value={hsa0} onChange={setHsa0} min={0} max={200000} step={2000} prefix="$" />
                </div>
              </div>

              <div>
                <GroupHeader icon={<Wallet size={13} />}>Contribution targets / yr</GroupHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Field label="Traditional" value={tradTarget} onChange={setTradTarget} min={0} max={100000} step={1000} prefix="$" />
                  <Field label="Roth" value={rothTarget} onChange={setRothTarget} min={0} max={40000} step={1000} prefix="$" />
                  <Field label="HSA" value={hsaTarget} onChange={setHsaTarget} min={0} max={20000} step={500} prefix="$" />
                  <Field label="Employer match rate" value={employerMatchPct} onChange={setEmployerMatchPct} min={0} max={100} step={5} suffix="%" />
                  <Field label="Match capped at" value={employerMatchCapPct} onChange={setEmployerMatchCapPct} min={0} max={15} step={0.5} suffix="% of pay" />
                  <Field label="Inflation (erodes mortgage)" value={inflationRate} onChange={setInflationRate} min={0} max={6} step={0.1} suffix="%" />
                  <Field label="Plan through age" value={planningEndAge} onChange={setPlanningEndAge} min={70} max={105} step={1} />
                  <Field label="SWR adjustment" value={swrAdjust} onChange={setSwrAdjust} min={-1} max={1} step={0.1} suffix=" pts" />
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20 }}>
            <div style={{ marginBottom: 12 }}>
              <Toggle label="House purchase" icon={<Home size={14} />} checked={houseOn} onChange={setHouseOn} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 22 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Home price" value={housePrice} onChange={setHousePrice} min={200000} max={1500000} step={10000} prefix="$" disabled={!houseOn} />
                <Field label="Down payment" value={downPaymentPct} onChange={setDownPaymentPct} min={5} max={50} step={5} suffix="%" disabled={!houseOn} />
                <Field label="Buying in" value={houseYear} onChange={setHouseYear} min={0} max={15} step={1} suffix=" yrs" disabled={!houseOn} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Mortgage rate (30yr avg today ~6.7%)" value={mortgageRate} onChange={setMortgageRate} min={4} max={9} step={0.05} suffix="%" disabled={!houseOn} />
                <Field label="Loan term" value={loanTermYears} onChange={setLoanTermYears} min={15} max={30} step={5} suffix=" yrs" disabled={!houseOn} />
                <Field label="Appreciation" value={appreciationRate} onChange={setAppreciationRate} min={0} max={8} step={0.5} suffix="%/yr" disabled={!houseOn} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Property tax rate" value={propertyTaxRate} onChange={setPropertyTaxRate} min={0.3} max={2.5} step={0.1} suffix="%" disabled={!houseOn} />
                <Field label="Insurance + maintenance" value={insMaintPct} onChange={setInsMaintPct} min={0.3} max={3} step={0.1} suffix="%" disabled={!houseOn} />
                <Field label="Current housing cost / yr (rent)" value={currentHousingCost} onChange={setCurrentHousingCost} min={0} max={80000} step={1000} prefix="$" />
              </div>
              <div style={{
                background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 10, padding: 14,
                opacity: houseOn ? 1 : 0.35, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5,
              }}>
                <div style={{ ...eyebrow, marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>At purchase, per month</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: colors.subtext }}>
                  <span>Principal + interest</span><span style={{ color: colors.text }}>{fmtMoney(mortgageSnapshot.monthlyPI)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: colors.subtext }}>
                  <span>Property tax</span><span style={{ color: colors.text }}>{fmtMoney(mortgageSnapshot.monthlyTax)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: colors.subtext }}>
                  <span>Insurance + maint.</span><span style={{ color: colors.text }}>{fmtMoney(mortgageSnapshot.monthlyInsMaint)}</span>
                </div>
                {mortgageSnapshot.monthlyPMI > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: colors.subtext }}>
                    <span>PMI (LTV &gt; 80%)</span><span style={{ color: colors.text }}>{fmtMoney(mortgageSnapshot.monthlyPMI)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.panelBorder}`, color: colors.amber }}>
                  <span>Total / mo</span><span>{fmtMoney(mortgageSnapshot.monthlyTotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, color: colors.coral }}>
                  <span>vs. current, / yr</span><span>+{fmtMoney(mortgageSnapshot.annualDelta)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, color: colors.subtext }}>
                  <span>Down payment</span><span style={{ color: colors.text }}>{fmtMoney(mortgageSnapshot.downPaymentAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20 }}>
            <GroupHeader icon={<GitBranch size={13} />}>Downshift scenarios</GroupHeader>

            <div style={{ marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${colors.panelBorder}` }}>
              <div style={{ marginBottom: 12 }}>
                <Toggle label="Roth conversion ladder" icon={<Landmark size={14} />} checked={ladderOn} onChange={setLadderOn} accent={colors.mint} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 22 }}>
                <Field label="Convert per person / yr" value={convertPerPerson} onChange={setConvertPerPerson} min={0} max={120000} step={1000} prefix="$" disabled={!ladderOn} />
                <Field label="Seasoning period" value={seasoningYears} onChange={setSeasoningYears} min={0} max={10} step={1} suffix=" yrs" disabled={!ladderOn} />
              </div>
            </div>

            <div style={{ marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${colors.panelBorder}` }}>
              <div style={{ marginBottom: 12 }}>
                <Toggle label="No employer coverage after downshift" icon={<HeartPulse size={14} />} checked={uninsuredOn} onChange={setUninsuredOn} accent={colors.violet} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 22 }}>
                <Field label="Avg. medical cost / uninsured adult / yr" value={medCostPerAdult} onChange={setMedCostPerAdult} min={0} max={15000} step={100} prefix="$" disabled={!uninsuredOn} />
                <Field label="Adults without coverage" value={numUninsuredAdults} onChange={setNumUninsuredAdults} min={0} max={4} step={1} disabled={!uninsuredOn} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 22 }}>
              {scenarios.map((s) => (
                <ScenarioCard key={s.id} s={s} onChange={(field, value) => setScenarios((prev) => prev.map((sc) => (sc.id === s.id ? { ...sc, [field]: value } : sc)))} />
              ))}
            </div>
          </div>

          <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20 }}>
            <GroupHeader icon={<GitBranch size={13} />}>Downshift scenarios, compared</GroupHeader>
            <div style={{ fontSize: 11, color: colors.subtext, marginBottom: 10, marginTop: -6 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, background: colors.bg, border: `2px solid ${colors.text}`, transform: "rotate(45deg)", marginRight: 5 }} /> downshift
              <span style={{ display: "inline-block", width: 10, height: 10, background: colors.text, marginLeft: 16, marginRight: 5, verticalAlign: "middle" }} /> full retirement
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: colors.text, marginLeft: 16, marginRight: 5, verticalAlign: "middle" }} /> FI reached
            </div>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="year" tickFormatter={(y) => `+${y}y`} stroke={colors.subtext} fontSize={11} tickLine={false} axisLine={{ stroke: colors.panelBorder }} />
                  <YAxis tickFormatter={(v) => fmtMoney(v, true)} stroke={colors.subtext} fontSize={11} tickLine={false} axisLine={false} width={58} />
                  <Tooltip
                    formatter={(value, name) => [fmtMoney(value), name]}
                    labelFormatter={(y) => `Year +${y} (age ${startAge + y})`}
                    contentStyle={{ background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Space Grotesk', sans-serif" }} />
                  {summaries.map((s) => (
                    <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={s.color} strokeWidth={2.5} dot={false} />
                  ))}
                  {summaries.map((s) => s.fiYear !== null && (
                    <ReferenceDot key={`fi-${s.id}`} x={s.fiYear} y={rows[s.fiYear][s.id]} r={5} fill={s.color} stroke={colors.bg} strokeWidth={2} />
                  ))}
                  {summaries.flatMap((s) => {
                    const marks = [];
                    if (s.incomePct1 < 100 && s.year1 <= horizon) {
                      marks.push(<ReferenceDot key={`d1-${s.id}`} x={s.year1} y={rows[s.year1][s.id]} fill={s.color} shape={DiamondMarker} />);
                    }
                    if (s.incomePct2 < 100 && s.year2 <= horizon) {
                      marks.push(<ReferenceDot key={`d2-${s.id}`} x={s.year2} y={rows[s.year2][s.id]} fill={s.color} shape={DiamondMarker} />);
                    }
                    if (s.retireYear1 <= horizon) {
                      marks.push(<ReferenceDot key={`r1-${s.id}`} x={s.retireYear1} y={rows[s.retireYear1][s.id]} fill={s.color} shape={SquareMarker} />);
                    }
                    if (s.retireYear2 <= horizon) {
                      marks.push(<ReferenceDot key={`r2-${s.id}`} x={s.retireYear2} y={rows[s.retireYear2][s.id]} fill={s.color} shape={SquareMarker} />);
                    }
                    return marks;
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20 }}>
            <GroupHeader icon={<Target size={13} />}>Reference — never downshift or retire</GroupHeader>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="year" tickFormatter={(y) => `+${y}y`} stroke={colors.subtext} fontSize={11} tickLine={false} axisLine={{ stroke: colors.panelBorder }} />
                  <YAxis tickFormatter={(v) => fmtMoney(v, true)} stroke={colors.coral} fontSize={11} tickLine={false} axisLine={false} width={58} />
                  <Tooltip
                    formatter={(value, name) => [fmtMoney(value), name]}
                    labelFormatter={(y) => `Year +${y} (age ${startAge + y})`}
                    contentStyle={{ background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="baseline" name="Never downshift" stroke={colors.coral} strokeWidth={2} dot={false} />
                  {baselineFiYear !== null && (
                    <ReferenceDot x={baselineFiYear} y={rows[baselineFiYear].baseline} r={4} fill={colors.coral} stroke={colors.bg} strokeWidth={2} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <Readout
              icon={<Target size={14} />}
              label="Never downshift — FI year"
              value={baselineFiYear !== null ? `+${baselineFiYear}y (age ${startAge + baselineFiYear})` : `Beyond ${horizon}y`}
              accent={colors.coral}
              sub={`${baselineFiSwr ? `at ${baselineFiSwr.toFixed(2)}% SWR (${(100 / baselineFiSwr).toFixed(0)}x) · ` : ""}Liquid at +${horizon}y: ${fmtMoney(baselineEnd, true)}`}
            />
            {summaries.map((s) => (
              <Readout
                key={s.id}
                icon={s.shortfallYear !== null ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                label={`${s.label} · P1 +${s.year1}y@${s.incomePct1}% · P2 +${s.year2}y@${s.incomePct2}%`}
                value={s.shortfallYear !== null ? `Shortfall at +${s.shortfallYear}y` : "Bridge fully covered"}
                accent={s.shortfallYear !== null ? colors.coral : colors.mint}
                sub={`Retire: P1 age ${startAge + s.retireYear1} · P2 age ${startAge + s.retireYear2} · FI: ${s.fiYear !== null ? `+${s.fiYear}y @ ${s.fiSwr.toFixed(2)}% SWR` : `beyond ${horizon}y`}${ladderOn ? ` · converted ${fmtMoney(s.totalConverted, true)}` : ""} · Liquid at +${horizon}y: ${fmtMoney(s.end, true)}`}
              />
            ))}
            <Readout
              icon={<Home size={14} />}
              label="Home equity"
              value={houseOn ? fmtMoney(equityAtHorizon, true) : "House off"}
              accent={colors.violet}
              sub={houseOn ? `at +${horizon}y — illiquid, excluded from FI and liquid totals above` : ""}
            />
          </div>
        </div>

        <p style={{ color: colors.subtext, fontSize: 12, marginTop: 22, lineHeight: 1.6 }}>
          Income fields are now gross salary — federal income tax, FICA (Social Security + Medicare), and Georgia state
          tax are computed and subtracted every year, using 2026 law: single-filer federal brackets and the $16,100
          single standard deduction for each of you separately (since you're not married, each of you files as single,
          not jointly), the $184,500 Social Security wage base, 1.45% Medicare plus 0.9% Additional Medicare Tax above
          $200,000 individually, and your Georgia rate applied to the same taxable-income base. Traditional 401k and HSA
          contributions are pretax — they're split evenly across both incomes (each capped at that person's own gross)
          and subtracted before federal/state tax is calculated, the same way a real paycheck works; FICA still applies
          to full gross either way, since 401k/HSA elections don't reduce Social Security or Medicare wages. These
          thresholds are held flat in the model's real (inflation-adjusted) dollars, which is a reasonable approximation
          since most of them are themselves inflation-indexed by law in reality. Not modeled: state/local beyond GA,
          itemizing, credits (child tax credit, EITC), NIIT, capital gains tax on selling taxable investments, or tax on
          Traditional withdrawals in retirement — a Traditional dollar still spends like a tax-free dollar once it's in
          the account, which is the biggest remaining gap. If you get married, married-filing-jointly brackets are wider
          at your combined income, so total tax would very likely drop from what's shown now.
          <br /><br />
          Mortgage rate defaults to roughly today's national average 30-year fixed (~6.6–6.7% as of Aug 2026, per Freddie Mac);
          adjust for your actual quote. Property tax and insurance scale with an appreciating home value; PMI applies while
          loan-to-value is above 80% and drops off automatically. The down payment and any shortfall-year housing costs are
          funded the same way as everything else — taxable first, then Roth basis, then (past the penalty-free age) Traditional
          and remaining Roth growth. FI and "liquid net worth" figures exclude home equity, since it isn't spendable without
          selling or borrowing against it. Ignores withdrawal taxes, RMDs, refinancing, and closing costs. "Living expenses"
          is deliberately housing-exclusive — actual housing cost is added on top every year: your current rent before a
          purchase, the real mortgage/tax/insurance/PMI cost from the purchase year on. No delta, no assumption about
          whether rent was already baked into your expenses number — each dollar of housing is counted exactly once,
          whichever phase you're in.
          <br /><br />
          Each person has two stages: downshift (income drops to a percentage — e.g. going part-time) and full retirement
          (income drops to zero). Leave "Income after" at 100% and the downshift year does nothing on its own — that
          person's income only actually changes at their retirement year. Set retirement earlier than downshift and it
          simply skips the downshift phase and retires outright at that year.
          <br /><br />
          Taxable cash sitting in a money market fund is assumed to yield roughly inflation — so, in the real (inflation-adjusted)
          dollars this whole model runs in, it holds flat rather than growing. In a shortfall year, that cash is drawn down
          first — before the invested taxable balance, Roth contributions, or anything else — since it's the part of the
          portfolio actually meant to be spent short-term.
          <br /><br />
          The uninsured healthcare line applies once neither person is still at full income (whichever of downshift or
          retirement takes them off it first) — it isn't a real budget for going without coverage. Averages like this are
          pulled down by the large share of people who simply forgo care; the real risk of no insurance is the tail, not
          the average — a single ER visit, surgery, or diagnosis can run
          five to six figures at uninsured, non-negotiated rates. If you're modeling a real coverage gap, ACA marketplace
          premiums — often subsidized once household income drops — are usually a more realistic line item than this one.
          <br /><br />
          The FI threshold is no longer a flat 25&times;. It now scales with how long the money has to last:
          the model takes "Plan through age" minus your age at that point and interpolates a safe withdrawal
          rate from published anchors &mdash; roughly 4.0% for a 30-year horizon (Bengen's original calibration),
          ~3.5% for 50 years (the "absolute safe" rate that survived every historical 50-year period), and
          ~3.3% beyond that, which is in line with the 3.25&ndash;3.5% commonly recommended for 40+ year FIRE
          horizons. Retiring at 45 therefore requires about 29&times; expenses rather than 25&times;. The research is
          genuinely split &mdash; Bengen's recent work argues for materially higher rates (4.2% even over 50 years)
          while Morningstar's forward-looking estimates have run lower (3.7%) &mdash; so the "SWR adjustment"
          field shifts the whole curve up or down in percentage points if you want to plan against a more
          optimistic or more conservative stance. Each scenario readout shows the exact rate and multiple used
          at its crossover. This threshold uses recurring annual expenses only — a one-time cost like the down payment is
          excluded from that multiplier, even though it's still subtracted from that year's cash. Otherwise a single large
          lump-sum year would spike the FI bar by 25x that amount and could wrongly hide FI being reached right around a
          house purchase.
          <br /><br />
          Contributions and withdrawals use a mid-year convention — they earn (or forgo) roughly half a year of return
          rather than a full year, since they happen throughout the year rather than on January 1. Employer match is
          modeled as a percentage of your Traditional deferral capped at a percentage of pay, lands in Traditional, and
          isn't taxable income to you. Kid costs run in two phases: an expensive infant/toddler stretch, then a cheaper
          school-age rate once the child is in grade school, ending after "Years of support each." Atlanta reference
          points for 2026: infant center care runs roughly $15k&ndash;22k/yr, Georgia's lottery-funded Pre-K is free for all
          4-year-olds, and school-age before/after care plus summer camp lands around $6k&ndash;10k/yr. These are childcare
          costs only &mdash; food, healthcare, activities, and college are separate and not modeled. The mortgage's principal, interest,
          and PMI are fixed nominal dollars, so they're deflated by your inflation assumption each year: in real terms
          a fixed mortgage payment shrinks over time, while property tax, insurance, and maintenance scale with the
          home and stay real.
          <br /><br />
          The Roth conversion ladder is the standard mechanism for reaching Traditional money before 59&frac12;. Each year
          before penalty-free age, the model converts up to the per-person amount from Traditional to Roth, pays ordinary
          income tax on it that year (federal + GA, no FICA), and makes it penalty-free accessible after the seasoning
          period &mdash; five years under current law, with each year's conversion carrying its own clock. Seasoned
          conversions are drawn after Roth basis and before anything age-restricted. The point of the ladder is rate
          arbitrage: convert during low-income downshift years at 12&ndash;17% instead of deducting at your current 29.5%
          marginal. Converting more than about \$66k per person in a year pushes you out of the 12% federal bracket and
          the arbitrage shrinks sharply. Two alternatives the model does NOT simulate: 72(t)/SEPP substantially equal
          periodic payments, which unlock a Traditional balance at any age but lock you into a rigid payment schedule;
          and the Rule of 55, which lets you tap the 401(k) of the employer you leave in or after the year you turn 55.
          <br /><br />
          Traditional withdrawals after the penalty-free age are taxed as ordinary income, so the model grosses them
          up &mdash; pulling enough to leave the needed amount after federal and Georgia tax, stacked on top of any wages
          that year and split across both filers. Qualified Roth withdrawals stay tax-free, which is the point of the
          ladder: you pay once, at a low rate, in a low-income year. Still not modeled on the withdrawal side: RMDs
          starting at 73 (which force taxable income whether you want it or not, and are the main reason to convert
          more aggressively earlier), NIIT, and capital gains tax on taxable-account sales.
          <br /><br />
          Once cash, taxable, Roth basis, seasoned conversions, and (if age allows) Traditional and Roth growth are all exhausted in a shortfall
          year, whatever's still unfunded shows up as negative taxable balance — a stand-in for having to borrow to cover
          the gap — so the line actually dips or drops instead of quietly flatlining at zero. That debt compounds at the
          same rate as everything else here, which is generous; real short-term borrowing (credit cards, margin) usually
          costs far more than an index fund returns, so an ongoing shortfall is worse than the chart shows, not better.
          <br /><br />
          Your inputs auto-save as you go and reload automatically next time — including across edits I make here.
        </p>
      </div>
    </div>
  );
}
