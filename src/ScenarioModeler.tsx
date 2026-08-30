import { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceDot, ReferenceLine, ReferenceArea, ResponsiveContainer
} from "recharts";
import { Baby, Home, Wallet, Target, TrendingUp, AlertTriangle, CheckCircle2, GitBranch, HeartPulse, RotateCcw, Landmark } from "lucide-react";

import { storage, STORAGE_KEY } from "./lib/storage.js";
import { fmtMoney } from "./lib/format.js";
import { colors } from "./lib/colors.js";
import { DEFAULTS } from "./lib/defaults.js";
import { computeNetForPerson } from "./lib/tax.js";
import { computeMortgageSnapshot, buildHousingSchedule } from "./lib/mortgage.js";
import { simulateScenario } from "./lib/simulate.js";
import type { SimParams } from "./types.js";

import { Field } from "./components/Field.js";
import { Toggle } from "./components/Toggle.js";
import { Readout } from "./components/Readout.js";
import { GroupHeader } from "./components/GroupHeader.js";
import { ScenarioCard } from "./components/ScenarioCard.js";
import { NameFields } from "./components/NameFields.js";
import { DiamondMarker, SquareMarker, WarningMarker } from "./components/Markers.js";

import shared from "./styles/shared.module.css";
import styles from "./ScenarioModeler.module.css";

export default function ScenarioModeler() {
  const [person1Name, setPerson1Name] = useState(DEFAULTS.person1Name);
  const [person2Name, setPerson2Name] = useState(DEFAULTS.person2Name);
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
  const [taxableBasis0, setTaxableBasis0] = useState(DEFAULTS.taxableBasis0);
  const [cash0, setCash0] = useState(DEFAULTS.cash0);
  const [hsa0, setHsa0] = useState(DEFAULTS.hsa0);

  const [trad1TargetPre, setTrad1TargetPre] = useState(DEFAULTS.trad1TargetPre);
  const [trad1TargetPost, setTrad1TargetPost] = useState(DEFAULTS.trad1TargetPost);
  const [trad2TargetPre, setTrad2TargetPre] = useState(DEFAULTS.trad2TargetPre);
  const [trad2TargetPost, setTrad2TargetPost] = useState(DEFAULTS.trad2TargetPost);
  const [roth1TargetPre, setRoth1TargetPre] = useState(DEFAULTS.roth1TargetPre);
  const [roth1TargetPost, setRoth1TargetPost] = useState(DEFAULTS.roth1TargetPost);
  const [roth2TargetPre, setRoth2TargetPre] = useState(DEFAULTS.roth2TargetPre);
  const [roth2TargetPost, setRoth2TargetPost] = useState(DEFAULTS.roth2TargetPost);
  const [hsa1TargetPre, setHsa1TargetPre] = useState(DEFAULTS.hsa1TargetPre);
  const [hsa1TargetPost, setHsa1TargetPost] = useState(DEFAULTS.hsa1TargetPost);
  const [hsa2TargetPre, setHsa2TargetPre] = useState(DEFAULTS.hsa2TargetPre);
  const [hsa2TargetPost, setHsa2TargetPost] = useState(DEFAULTS.hsa2TargetPost);
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
          if (d.person1Name !== undefined) setPerson1Name(d.person1Name);
          if (d.person2Name !== undefined) setPerson2Name(d.person2Name);
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
          if (d.taxableBasis0 !== undefined) setTaxableBasis0(d.taxableBasis0);
          if (d.cash0 !== undefined) setCash0(d.cash0);
          if (d.hsa0 !== undefined) setHsa0(d.hsa0);
          // Pre/post-downshift, per-person contribution targets replaced the old single
          // combined tradTarget/rothTarget/hsaTarget fields. Migrate old saved data by
          // splitting the combined value evenly across both people and both phases.
          if (d.trad1TargetPre !== undefined) setTrad1TargetPre(d.trad1TargetPre);
          else if (d.tradTarget !== undefined) setTrad1TargetPre(d.tradTarget / 2);
          if (d.trad1TargetPost !== undefined) setTrad1TargetPost(d.trad1TargetPost);
          else if (d.tradTarget !== undefined) setTrad1TargetPost(d.tradTarget / 2);
          if (d.trad2TargetPre !== undefined) setTrad2TargetPre(d.trad2TargetPre);
          else if (d.tradTarget !== undefined) setTrad2TargetPre(d.tradTarget / 2);
          if (d.trad2TargetPost !== undefined) setTrad2TargetPost(d.trad2TargetPost);
          else if (d.tradTarget !== undefined) setTrad2TargetPost(d.tradTarget / 2);
          if (d.roth1TargetPre !== undefined) setRoth1TargetPre(d.roth1TargetPre);
          else if (d.rothTarget !== undefined) setRoth1TargetPre(d.rothTarget / 2);
          if (d.roth1TargetPost !== undefined) setRoth1TargetPost(d.roth1TargetPost);
          else if (d.rothTarget !== undefined) setRoth1TargetPost(d.rothTarget / 2);
          if (d.roth2TargetPre !== undefined) setRoth2TargetPre(d.roth2TargetPre);
          else if (d.rothTarget !== undefined) setRoth2TargetPre(d.rothTarget / 2);
          if (d.roth2TargetPost !== undefined) setRoth2TargetPost(d.roth2TargetPost);
          else if (d.rothTarget !== undefined) setRoth2TargetPost(d.rothTarget / 2);
          if (d.hsa1TargetPre !== undefined) setHsa1TargetPre(d.hsa1TargetPre);
          else if (d.hsaTarget !== undefined) setHsa1TargetPre(d.hsaTarget / 2);
          if (d.hsa1TargetPost !== undefined) setHsa1TargetPost(d.hsa1TargetPost);
          else if (d.hsaTarget !== undefined) setHsa1TargetPost(d.hsaTarget / 2);
          if (d.hsa2TargetPre !== undefined) setHsa2TargetPre(d.hsa2TargetPre);
          else if (d.hsaTarget !== undefined) setHsa2TargetPre(d.hsaTarget / 2);
          if (d.hsa2TargetPost !== undefined) setHsa2TargetPost(d.hsa2TargetPost);
          else if (d.hsaTarget !== undefined) setHsa2TargetPost(d.hsaTarget / 2);
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
      person1Name, person2Name,
      startAge, income1, income2, gaRate, expenses, growthRate, horizon, penaltyFreeAge,
      kidsOn, numKids, infantCost, infantYears, laterCost, kidsStartYear, kidsDuration,
      trad0, roth0, rothBasis0, taxable0, taxableBasis0, cash0, hsa0,
      trad1TargetPre, trad1TargetPost, trad2TargetPre, trad2TargetPost,
      roth1TargetPre, roth1TargetPost, roth2TargetPre, roth2TargetPost,
      hsa1TargetPre, hsa1TargetPost, hsa2TargetPre, hsa2TargetPost,
      employerMatchPct, employerMatchCapPct, inflationRate, planningEndAge, swrAdjust, ladderOn, convertPerPerson, seasoningYears,
      houseOn, housePrice, downPaymentPct, mortgageRate, loanTermYears, propertyTaxRate,
      insMaintPct, currentHousingCost, appreciationRate, houseYear,
      uninsuredOn, medCostPerAdult, numUninsuredAdults, scenarios,
    };
    const t = setTimeout(() => {
      storage.set(STORAGE_KEY, JSON.stringify(data));
    }, 500);
    return () => clearTimeout(t);
  }, [loaded, person1Name, person2Name, startAge, income1, income2, gaRate, expenses, growthRate, horizon, penaltyFreeAge,
      kidsOn, numKids, infantCost, infantYears, laterCost, kidsStartYear, kidsDuration,
      trad0, roth0, rothBasis0, taxable0, taxableBasis0, cash0, hsa0,
      trad1TargetPre, trad1TargetPost, trad2TargetPre, trad2TargetPost,
      roth1TargetPre, roth1TargetPost, roth2TargetPre, roth2TargetPost,
      hsa1TargetPre, hsa1TargetPost, hsa2TargetPre, hsa2TargetPost,
      employerMatchPct, employerMatchCapPct, inflationRate, planningEndAge, swrAdjust, ladderOn, convertPerPerson, seasoningYears,
      houseOn, housePrice, downPaymentPct, mortgageRate, loanTermYears, propertyTaxRate,
      insMaintPct, currentHousingCost, appreciationRate, houseYear,
      uninsuredOn, medCostPerAdult, numUninsuredAdults, scenarios]);

  const handleReset = () => {
    storage.remove(STORAGE_KEY);
    setPerson1Name(DEFAULTS.person1Name); setPerson2Name(DEFAULTS.person2Name);
    setStartAge(DEFAULTS.startAge); setIncome1(DEFAULTS.income1); setIncome2(DEFAULTS.income2);
    setGaRate(DEFAULTS.gaRate);
    setExpenses(DEFAULTS.expenses); setGrowthRate(DEFAULTS.growthRate); setHorizon(DEFAULTS.horizon);
    setPenaltyFreeAge(DEFAULTS.penaltyFreeAge);
    setKidsOn(DEFAULTS.kidsOn); setNumKids(DEFAULTS.numKids);
    setInfantCost(DEFAULTS.infantCost); setInfantYears(DEFAULTS.infantYears); setLaterCost(DEFAULTS.laterCost);
    setKidsStartYear(DEFAULTS.kidsStartYear); setKidsDuration(DEFAULTS.kidsDuration);
    setTrad0(DEFAULTS.trad0); setRoth0(DEFAULTS.roth0); setRothBasis0(DEFAULTS.rothBasis0);
    setTaxable0(DEFAULTS.taxable0); setTaxableBasis0(DEFAULTS.taxableBasis0); setCash0(DEFAULTS.cash0); setHsa0(DEFAULTS.hsa0);
    setTrad1TargetPre(DEFAULTS.trad1TargetPre); setTrad1TargetPost(DEFAULTS.trad1TargetPost);
    setTrad2TargetPre(DEFAULTS.trad2TargetPre); setTrad2TargetPost(DEFAULTS.trad2TargetPost);
    setRoth1TargetPre(DEFAULTS.roth1TargetPre); setRoth1TargetPost(DEFAULTS.roth1TargetPost);
    setRoth2TargetPre(DEFAULTS.roth2TargetPre); setRoth2TargetPost(DEFAULTS.roth2TargetPost);
    setHsa1TargetPre(DEFAULTS.hsa1TargetPre); setHsa1TargetPost(DEFAULTS.hsa1TargetPost);
    setHsa2TargetPre(DEFAULTS.hsa2TargetPre); setHsa2TargetPost(DEFAULTS.hsa2TargetPost);
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

  // Live tax snapshot at full income today — uses each person's pre-downshift targets.
  const taxSnapshot = useMemo(() => {
    const p1TradContrib = Math.min(trad1TargetPre, income1);
    const p1HsaContrib = Math.min(hsa1TargetPre, Math.max(0, income1 - p1TradContrib));
    const p2TradContrib = Math.min(trad2TargetPre, income2);
    const p2HsaContrib = Math.min(hsa2TargetPre, Math.max(0, income2 - p2TradContrib));
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
  }, [income1, income2, gaRate, trad1TargetPre, trad2TargetPre, hsa1TargetPre, hsa2TargetPre]);

  // Live mortgage snapshot (at purchase), shown in the House panel
  const mortgageSnapshot = useMemo(() => computeMortgageSnapshot({
    housePrice, downPaymentPct, mortgageRate, loanTermYears, propertyTaxRate, insMaintPct, currentHousingCost,
  }), [housePrice, downPaymentPct, mortgageRate, loanTermYears, propertyTaxRate, insMaintPct, currentHousingCost]);

  const { rows, baselineFiYear, baselineFiSwr, summaries, equityAtHorizon } = useMemo(() => {
    const housingByYear = buildHousingSchedule({
      horizon, houseOn, houseYear, housePrice, downPaymentPct, mortgageRate, loanTermYears,
      appreciationRate, propertyTaxRate, insMaintPct, inflationRate, currentHousingCost,
    });

    const simParams: SimParams = {
      startAge, income1, income2, gaRate, expenses, growthRate, horizon, penaltyFreeAge,
      kidsOn, numKids, infantCost, infantYears, laterCost, kidsStartYear, kidsDuration,
      trad0, roth0, rothBasis0, taxable0, taxableBasis0, cash0, hsa0,
      trad1TargetPre, trad1TargetPost, trad2TargetPre, trad2TargetPost,
      roth1TargetPre, roth1TargetPost, roth2TargetPre, roth2TargetPost,
      hsa1TargetPre, hsa1TargetPost, hsa2TargetPre, hsa2TargetPost,
      employerMatchPct, employerMatchCapPct,
      planningEndAge, swrAdjust, ladderOn, convertPerPerson, seasoningYears,
      uninsuredOn, medCostPerAdult, numUninsuredAdults,
    };

    const baseline = simulateScenario(simParams, housingByYear, {
      year1: horizon + 1, pct1: 100, retireYear1: horizon + 1,
      year2: horizon + 1, pct2: 100, retireYear2: horizon + 1,
    });
    const active = scenarios.filter((s) => s.enabled);
    const results = active.map((s) => ({
      ...s,
      sim: simulateScenario(simParams, housingByYear, {
        year1: s.year1, pct1: s.incomePct1, retireYear1: s.retireYear1,
        year2: s.year2, pct2: s.incomePct2, retireYear2: s.retireYear2,
      }),
    }));

    type MergedRow = { year: number; baseline: number; baselineAccessible: number; [scenarioId: string]: number };
    const merged: MergedRow[] = [];
    for (let y = 0; y <= horizon; y++) {
      const row: MergedRow = { year: y, baseline: baseline.rows[y].total, baselineAccessible: baseline.rows[y].accessible };
      results.forEach((s) => { row[s.id] = s.sim.rows[y].total; row[`${s.id}_accessible`] = s.sim.rows[y].accessible; });
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
      kidsStartYear, kidsDuration, trad0, roth0, rothBasis0, taxable0, taxableBasis0, cash0, hsa0,
      trad1TargetPre, trad1TargetPost, trad2TargetPre, trad2TargetPost,
      roth1TargetPre, roth1TargetPost, roth2TargetPre, roth2TargetPost,
      hsa1TargetPre, hsa1TargetPost, hsa2TargetPre, hsa2TargetPost,
      employerMatchPct, employerMatchCapPct, inflationRate, planningEndAge, swrAdjust, ladderOn, convertPerPerson, seasoningYears,
      houseOn, housePrice, downPaymentPct, mortgageRate, loanTermYears, propertyTaxRate, insMaintPct,
      currentHousingCost, appreciationRate, houseYear, uninsuredOn, medCostPerAdult, numUninsuredAdults, scenarios]);

  const baselineEnd = rows[rows.length - 1].baseline;
  const p1 = person1Name.trim() || "Person 1";
  const p2 = person2Name.trim() || "Person 2";

  // The accessible-funds chart is only interesting up through the penalty-free age — past that,
  // "accessible" jumps to equal total net worth for everyone at once, which both trivializes the
  // chart's point and dwarfs the pre-59½ scenario lines it's meant to show.
  const accessibleCutoff = Math.max(1, Math.min(rows.length, penaltyFreeAge - startAge));
  const accessibleRows = rows.slice(0, accessibleCutoff);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.headerRow}>
          <div>
            <div className={`${shared.eyebrow} ${styles.eyebrowAmber}`}>Scenario Modeler</div>
            <h1 className={styles.title}>
              Downshift timing, compared
            </h1>
            <p className={styles.subtitle}>
              The dashed line never downshifts or retires. Toggle scenarios A–C to test different downshift years, income levels, and full retirement years against it and each other.
              {justRestored && <span className={styles.mintText}> · Restored your last inputs.</span>}
              {backend === "memory" && <span className={styles.coralText}> · Storage unavailable here — inputs won't persist after reload.</span>}
            </p>
          </div>
          <button onClick={handleReset} className={styles.resetButton}>
            <RotateCcw size={12} /> Reset to defaults
          </button>
        </div>

        <div className={styles.namesRow}>
          <NameFields
            person1Name={person1Name}
            person2Name={person2Name}
            onChangePerson1Name={setPerson1Name}
            onChangePerson2Name={setPerson2Name}
          />
        </div>

        <div className={styles.sections}>
          <div className={styles.panel} data-hint-boundary>
            <div className={styles.panelGrid}>
              <div>
                <GroupHeader icon={<TrendingUp size={13} />}>Income &amp; expenses</GroupHeader>
                <div className={styles.fieldStack}>
                  <Field label="Current age" value={startAge} onChange={setStartAge} min={18} max={65} step={1} />
                  <Field label={`${p1} gross salary`} value={income1} onChange={setIncome1} min={40000} max={600000} step={5000} prefix="$" hint="Gross, before any taxes or deductions. The model computes take-home itself using 2026 federal brackets, FICA, and your state tax rate, filing each of you as single." />
                  <Field label={`${p2} gross salary`} value={income2} onChange={setIncome2} min={40000} max={600000} step={5000} prefix="$" hint="Gross, before any taxes or deductions. The model computes take-home itself using 2026 federal brackets, FICA, and your state tax rate, filing each of you as single." />
                  <Field label="GA state tax rate" value={gaRate} onChange={setGaRate} min={0} max={10} step={0.1} suffix="%" hint="A flat state income tax rate, applied to the same taxable income base as federal. Change it if you move — the model has no other state-specific logic." />
                  <Field label="Living expenses (excl. housing)" value={expenses} onChange={setExpenses} min={40000} max={400000} step={2000} prefix="$" hint="Everything except housing: food, transport, travel, insurance, discretionary. Housing is added separately every year — current rent before a purchase, full mortgage cost after — so don't include rent or a mortgage here or it'll be counted twice." />
                  <Field label="Expected real return" value={growthRate} onChange={setGrowthRate} min={2} max={10} step={0.5} suffix="%" hint="Inflation-adjusted, not nominal. 6% real is roughly a 8–9% nominal return minus ~2.5% inflation. Everything in this model is in today's dollars, so use the real number." />
                  <Field label="Modeling horizon" value={horizon} onChange={setHorizon} min={10} max={40} step={1} suffix=" yrs" hint="How many years the chart covers. Separate from 'Plan through age', which is about how long your money must last and drives the safe withdrawal rate." />
                  <Field label="Penalty-free access age" value={penaltyFreeAge} onChange={setPenaltyFreeAge} min={50} max={65} step={1} hint="When Traditional and Roth earnings become reachable without a 10% penalty — 59½ under current law. Before this age they're locked, which is what creates the bridge problem the shortfall warnings flag." />
                </div>
              </div>

              <div>
                <div className={styles.toggleSpacing}>
                  <Toggle label="Kids" icon={<Baby size={14} />} checked={kidsOn} onChange={setKidsOn} />
                </div>
                <div className={styles.fieldStack}>
                  <Field label="Number of kids" value={numKids} onChange={setNumKids} min={1} max={4} step={1} disabled={!kidsOn} />
                  <Field label="Infant/toddler rate per kid / yr" value={infantCost} onChange={setInfantCost} min={0} max={60000} step={1000} prefix="$" disabled={!kidsOn} hint="The expensive early years. Full-time infant/toddler center care commonly runs $15–22k/yr per child in higher cost-of-living areas." />
                  <Field label="Infant rate applies until kid age" value={infantYears} onChange={setInfantYears} min={0} max={10} step={1} disabled={!kidsOn} hint="Measured from the child's birth, not from today. Many states offer free public pre-K starting at age 4, which is why that's a reasonable default." />
                  <Field label="School-age rate per kid / yr" value={laterCost} onChange={setLaterCost} min={0} max={40000} step={500} prefix="$" disabled={!kidsOn} hint="Before/after-school care plus summer camp, typically $6–10k/yr. Childcare only — food, healthcare, activities, and college aren't modeled anywhere." />
                  <Field label="First kid arrives in" value={kidsStartYear} onChange={setKidsStartYear} min={0} max={15} step={1} suffix=" yrs from now" disabled={!kidsOn} hint="Years from today. This is a point on your timeline; the two 'kid age' fields are measured from the child's birth instead." />
                  <Field label="Support each kid until age" value={kidsDuration} onChange={setKidsDuration} min={1} max={30} step={1} disabled={!kidsOn} hint="The child's age when costs stop, not a duration from today." />
                </div>

                <div className={styles.miniSection}>
                  <div className={styles.miniHeader}>
                    <Landmark size={13} /><span className={shared.eyebrow}>Take-home today</span>
                  </div>
                  <div className={styles.miniCard}>
                    <div className={styles.miniRow}>
                      <span>Gross combined</span><span className={styles.miniValue}>{fmtMoney(taxSnapshot.grossCombined, true)}</span>
                    </div>
                    <div className={styles.miniRow}>
                      <span>Pretax 401k/HSA</span><span className={styles.miniValue}>−{fmtMoney(taxSnapshot.pretaxCombined, true)}</span>
                    </div>
                    <div className={styles.miniRow}>
                      <span>Federal (single ea.)</span><span className={styles.miniValue}>−{fmtMoney(taxSnapshot.federalCombined, true)}</span>
                    </div>
                    <div className={styles.miniRow}>
                      <span>FICA (SS + Medicare)</span><span className={styles.miniValue}>−{fmtMoney(taxSnapshot.ficaCombined, true)}</span>
                    </div>
                    <div className={styles.miniRow}>
                      <span>GA state ({gaRate}%)</span><span className={styles.miniValue}>−{fmtMoney(taxSnapshot.gaCombined, true)}</span>
                    </div>
                    <div className={styles.miniRowTotal}>
                      <span>Net take-home</span><span>{fmtMoney(taxSnapshot.netCombined, true)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <GroupHeader icon={<Wallet size={13} />}>Accounts</GroupHeader>
                <div className={styles.fieldStackTight}>
                  <Field label="Traditional balance" value={trad0} onChange={setTrad0} min={0} max={1500000} step={10000} prefix="$" />
                  <Field label="Roth balance" value={roth0} onChange={setRoth0} min={0} max={1000000} step={5000} prefix="$" />
                  <Field label="Roth basis (contributions)" value={rothBasis0} onChange={setRothBasis0} min={0} max={roth0} step={5000} prefix="$" hint="How much of the Roth balance is your own contributions rather than growth. This matters a lot: contributions can be withdrawn tax- and penalty-free at any age, so this number is a large part of your pre-59½ runway. Growth cannot." />
                  <Field label="Taxable — invested" value={taxable0} onChange={setTaxable0} min={0} max={2000000} step={10000} prefix="$" />
                  <Field label="Taxable cost basis" value={taxableBasis0} onChange={setTaxableBasis0} min={0} max={taxable0} step={10000} prefix="$" hint="How much of the taxable balance is what you originally put in, versus investment growth. The gap between this and the balance above is unrealized gain — selling to cover a shortfall owes long-term capital gains tax on that gain, split evenly across both filers and stacked on top of any wages that year." />
                  <Field label="Taxable — cash (money market)" value={cash0} onChange={setCash0} min={0} max={500000} step={5000} prefix="$" hint="Assumed to yield roughly inflation, so it holds flat in real terms rather than growing. Drawn down first in a shortfall year." />
                  <Field label="HSA balance" value={hsa0} onChange={setHsa0} min={0} max={200000} step={2000} prefix="$" />
                </div>
              </div>

              <div>
                <GroupHeader icon={<Wallet size={13} />}>Contribution targets / yr — pre-downshift</GroupHeader>
                <div className={styles.fieldStack}>
                  <Field label={`${p1} Traditional`} value={trad1TargetPre} onChange={setTrad1TargetPre} min={0} max={50000} step={1000} prefix="$" hint="This person's own IRS elective-deferral limit while still on full income. Capped each year at that person's actual gross." />
                  <Field label={`${p1} Roth`} value={roth1TargetPre} onChange={setRoth1TargetPre} min={0} max={15000} step={500} prefix="$" hint="This person's own IRA/Roth target. Filled from whatever household cashflow surplus remains after expenses." />
                  <Field label={`${p1} HSA`} value={hsa1TargetPre} onChange={setHsa1TargetPre} min={0} max={10000} step={250} prefix="$" />
                  <Field label={`${p2} Traditional`} value={trad2TargetPre} onChange={setTrad2TargetPre} min={0} max={50000} step={1000} prefix="$" />
                  <Field label={`${p2} Roth`} value={roth2TargetPre} onChange={setRoth2TargetPre} min={0} max={15000} step={500} prefix="$" />
                  <Field label={`${p2} HSA`} value={hsa2TargetPre} onChange={setHsa2TargetPre} min={0} max={10000} step={250} prefix="$" />
                </div>
              </div>

              <div>
                <GroupHeader icon={<Wallet size={13} />}>Contribution targets / yr — post-downshift</GroupHeader>
                <div className={styles.fieldStack}>
                  <Field label={`${p1} Traditional`} value={trad1TargetPost} onChange={setTrad1TargetPost} min={0} max={50000} step={1000} prefix="$" hint="Applies once this person is off full income — downshifted or fully retired. Often lower than the pre-downshift target since a reduced or zero salary can't fund the same deferral, or MAGI drops enough to favor Roth instead." />
                  <Field label={`${p1} Roth`} value={roth1TargetPost} onChange={setRoth1TargetPost} min={0} max={15000} step={500} prefix="$" hint="Applies once this person is off full income. Lower earned income during this window often means less to contribute — but a lower MAGI can also newly qualify for direct Roth IRA contributions this person didn't qualify for at full salary." />
                  <Field label={`${p1} HSA`} value={hsa1TargetPost} onChange={setHsa1TargetPost} min={0} max={10000} step={250} prefix="$" />
                  <Field label={`${p2} Traditional`} value={trad2TargetPost} onChange={setTrad2TargetPost} min={0} max={50000} step={1000} prefix="$" />
                  <Field label={`${p2} Roth`} value={roth2TargetPost} onChange={setRoth2TargetPost} min={0} max={15000} step={500} prefix="$" />
                  <Field label={`${p2} HSA`} value={hsa2TargetPost} onChange={setHsa2TargetPost} min={0} max={10000} step={250} prefix="$" />
                </div>
              </div>

              <div>
                <GroupHeader icon={<Wallet size={13} />}>Plan settings</GroupHeader>
                <div className={styles.fieldStack}>
                  <Field label="Employer match rate" value={employerMatchPct} onChange={setEmployerMatchPct} min={0} max={100} step={5} suffix="%" />
                  <Field label="Match capped at" value={employerMatchCapPct} onChange={setEmployerMatchCapPct} min={0} max={15} step={0.5} suffix="% of pay" hint="The employer match ceiling as a percent of that person's pay. Set high if your plan matches up to the IRS limit rather than a percentage of salary." />
                  <Field label="Inflation (erodes mortgage)" value={inflationRate} onChange={setInflationRate} min={0} max={6} step={0.1} suffix="%" hint="Used only to deflate the fixed nominal mortgage payment into real dollars. It does not inflate expenses or income — those are already in today's dollars." />
                  <Field label="Plan through age" value={planningEndAge} onChange={setPlanningEndAge} min={70} max={105} step={1} hint="How long the money must last. Combined with your age, this sets the safe withdrawal rate: a 50-year horizon needs a lower rate than a 30-year one." />
                  <Field label="SWR adjustment" value={swrAdjust} onChange={setSwrAdjust} min={-1} max={1} step={0.1} suffix=" pts" hint="Shifts the safe withdrawal rate curve in percentage points. The research genuinely disagrees — Bengen now argues 4.2% works over 50 years, Morningstar published 3.7%, and the FIRE consensus sits at 3.25–3.5%. Default (0) is the conservative middle. Try +0.7 for the optimistic case." />
                </div>
              </div>
            </div>
          </div>

          <div className={styles.panel} data-hint-boundary>
            <div className={styles.toggleSpacing}>
              <Toggle label="House purchase" icon={<Home size={14} />} checked={houseOn} onChange={setHouseOn} />
            </div>
            <div className={styles.panelGrid}>
              <div className={styles.fieldStack}>
                <Field label="Home price" value={housePrice} onChange={setHousePrice} min={200000} max={1500000} step={10000} prefix="$" disabled={!houseOn} />
                <Field label="Down payment" value={downPaymentPct} onChange={setDownPaymentPct} min={5} max={50} step={5} suffix="%" disabled={!houseOn} />
                <Field label="Buying in" value={houseYear} onChange={setHouseYear} min={0} max={15} step={1} suffix=" yrs" disabled={!houseOn} />
              </div>
              <div className={styles.fieldStack}>
                <Field label="Mortgage rate (30yr avg today ~6.7%)" value={mortgageRate} onChange={setMortgageRate} min={4} max={9} step={0.05} suffix="%" disabled={!houseOn} hint="Nominal rate, as quoted. The model deflates the resulting fixed payment into real dollars using your inflation assumption." />
                <Field label="Loan term" value={loanTermYears} onChange={setLoanTermYears} min={15} max={30} step={5} suffix=" yrs" disabled={!houseOn} />
                <Field label="Appreciation" value={appreciationRate} onChange={setAppreciationRate} min={0} max={8} step={0.5} suffix="%/yr" disabled={!houseOn} hint="Real appreciation, above inflation. Historical US real home appreciation is closer to ~1%/yr — 3.5% is a nominal figure and will overstate your equity if used here." />
              </div>
              <div className={styles.fieldStack}>
                <Field label="Property tax rate" value={propertyTaxRate} onChange={setPropertyTaxRate} min={0.3} max={2.5} step={0.1} suffix="%" disabled={!houseOn} />
                <Field label="Insurance + maintenance" value={insMaintPct} onChange={setInsMaintPct} min={0.3} max={3} step={0.1} suffix="%" disabled={!houseOn} hint="Annual cost as a percent of current home value, so it scales as the home appreciates. 1–2% is typical." />
                <Field label="Current housing cost / yr (rent)" value={currentHousingCost} onChange={setCurrentHousingCost} min={0} max={80000} step={1000} prefix="$" hint="What you pay for housing today. Used every year before a purchase, and for the whole projection if the house is toggled off." />
              </div>
              <div className={styles.snapshotCard} data-dim={!houseOn || undefined}>
                <div className={`${shared.eyebrow} ${styles.snapshotHeader}`}>At purchase, per month</div>
                <div className={styles.miniRow}>
                  <span>Principal + interest</span><span className={styles.miniValue}>{fmtMoney(mortgageSnapshot.monthlyPI)}</span>
                </div>
                <div className={styles.miniRow}>
                  <span>Property tax</span><span className={styles.miniValue}>{fmtMoney(mortgageSnapshot.monthlyTax)}</span>
                </div>
                <div className={styles.miniRow}>
                  <span>Insurance + maint.</span><span className={styles.miniValue}>{fmtMoney(mortgageSnapshot.monthlyInsMaint)}</span>
                </div>
                {mortgageSnapshot.monthlyPMI > 0 && (
                  <div className={styles.miniRow}>
                    <span>PMI (LTV &gt; 80%)</span><span className={styles.miniValue}>{fmtMoney(mortgageSnapshot.monthlyPMI)}</span>
                  </div>
                )}
                <div className={styles.miniRowTotal}>
                  <span>Total / mo</span><span>{fmtMoney(mortgageSnapshot.monthlyTotal)}</span>
                </div>
                <div className={styles.miniRowNote}>
                  <span>vs. current, / yr</span><span>+{fmtMoney(mortgageSnapshot.annualDelta)}</span>
                </div>
                <div className={styles.miniRowSub}>
                  <span>Down payment</span><span className={styles.miniValue}>{fmtMoney(mortgageSnapshot.downPaymentAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.panel} data-hint-boundary>
            <GroupHeader icon={<GitBranch size={13} />}>Downshift scenarios</GroupHeader>

            <div className={styles.subsection}>
              <div className={styles.toggleSpacing}>
                <Toggle label="Roth conversion ladder" icon={<Landmark size={14} />} checked={ladderOn} onChange={setLadderOn} accent={colors.mint} hint="Converts Traditional to Roth once both of you are off full income, paying ordinary income tax now (at your new, lower bracket) so the money becomes penalty-free after seasoning. This is the standard way to reach retirement money before 59½ and is usually the highest-impact lever in the model." />
              </div>
              <div className={styles.panelGridNarrow}>
                <Field label="Convert per person / yr" value={convertPerPerson} onChange={setConvertPerPerson} min={0} max={120000} step={1000} prefix="$" disabled={!ladderOn} hint="How much Traditional to convert to Roth each year before penalty-free age. Above roughly $66k per person you leave the 12% federal bracket and the rate arbitrage shrinks sharply." />
                <Field label="Seasoning period" value={seasoningYears} onChange={setSeasoningYears} min={0} max={10} step={1} suffix=" yrs" disabled={!ladderOn} hint="How long a conversion must age before it's penalty-free — 5 years under current law. Each year's conversion carries its own clock, which is why the ladder is built annually." />
              </div>
            </div>

            <div className={styles.subsection}>
              <div className={styles.toggleSpacing}>
                <Toggle label="No employer coverage after downshift" icon={<HeartPulse size={14} />} checked={uninsuredOn} onChange={setUninsuredOn} accent={colors.violet} hint="Applies once neither person is still at full income. If one of you stays full-time, the household keeps employer coverage and this cost doesn't apply." />
              </div>
              <div className={styles.panelGridNarrow}>
                <Field label="Avg. medical cost / uninsured adult / yr" value={medCostPerAdult} onChange={setMedCostPerAdult} min={0} max={15000} step={100} prefix="$" disabled={!uninsuredOn} hint="An average, not a budget. Averages are pulled down by people who skip care when uninsured; the real risk is the tail — one ER visit or diagnosis can run five to six figures. If you'd actually buy ACA coverage, model the premium instead." />
                <Field label="Adults without coverage" value={numUninsuredAdults} onChange={setNumUninsuredAdults} min={0} max={4} step={1} disabled={!uninsuredOn} />
              </div>
            </div>

            <div className={styles.panelGrid}>
              {scenarios.map((s) => (
                <ScenarioCard
                  key={s.id}
                  s={s}
                  person1Name={p1}
                  person2Name={p2}
                  onChange={(field, value) => setScenarios((prev) => prev.map((sc) => (sc.id === s.id ? { ...sc, [field]: value } : sc)))}
                />
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <GroupHeader icon={<Wallet size={13} />}>Accessible funds</GroupHeader>
            <p className={styles.subtitle}>
              Cash, taxable, Roth basis, and seasoned conversions — the money actually reachable before {penaltyFreeAge},
              not total net worth. This is where a scenario that looks fine on the charts below can still run out of
              reachable money. Cuts off at age {penaltyFreeAge}, when Traditional and Roth growth unlock for everyone at
              once and "accessible" stops being the binding constraint.
            </p>
            <div className={styles.chartTall}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={accessibleRows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="year" tickFormatter={(y) => `+${y}y`} stroke={colors.subtext} fontSize={11} tickLine={false} axisLine={{ stroke: colors.panelBorder }} />
                  <YAxis tickFormatter={(v) => fmtMoney(v, true)} stroke={colors.subtext} fontSize={11} tickLine={false} axisLine={false} width={58} />
                  <Tooltip
                    formatter={(value, name) => [fmtMoney(Number(value)), name]}
                    labelFormatter={(y) => `Year +${y} (age ${startAge + y})`}
                    contentStyle={{ background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Space Grotesk', sans-serif" }} />
                  <ReferenceArea y2={0} fill={colors.coral} fillOpacity={0.08} />
                  <ReferenceLine y={0} stroke={colors.coral} strokeDasharray="4 4" label={{ value: "out of accessible funds", position: "insideBottomLeft", fill: colors.coral, fontSize: 11 }} />
                  <Line type="monotone" dataKey="baselineAccessible" name="Never downshift" stroke={colors.coral} strokeDasharray="5 4" strokeWidth={2} dot={false} />
                  {summaries.map((s) => (
                    <Line key={s.id} type="monotone" dataKey={`${s.id}_accessible`} name={s.label} stroke={s.color} strokeWidth={2.5} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.panel}>
            <GroupHeader icon={<GitBranch size={13} />}>Downshift scenarios, compared</GroupHeader>
            <div className={styles.chartLegend}>
              <span className={styles.legendDiamond} /> downshift
              <span className={styles.legendSquare} /> full retirement
              <span className={styles.legendCircle} /> FI reached
              <span className={styles.legendTriangle} /> shortfall
            </div>
            <div className={styles.chartTall}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="year" tickFormatter={(y) => `+${y}y`} stroke={colors.subtext} fontSize={11} tickLine={false} axisLine={{ stroke: colors.panelBorder }} />
                  <YAxis tickFormatter={(v) => fmtMoney(v, true)} stroke={colors.subtext} fontSize={11} tickLine={false} axisLine={false} width={58} />
                  <Tooltip
                    formatter={(value, name) => [fmtMoney(Number(value)), name]}
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
                  {summaries.map((s) => s.shortfallYear !== null && s.shortfallYear <= horizon && (
                    <ReferenceLine key={`sf-line-${s.id}`} x={s.shortfallYear} stroke={colors.coral} strokeDasharray="4 4" strokeOpacity={0.5} />
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
                    if (s.shortfallYear !== null && s.shortfallYear <= horizon) {
                      marks.push(<ReferenceDot key={`sf-${s.id}`} x={s.shortfallYear} y={rows[s.shortfallYear][s.id]} fill={colors.coral} shape={WarningMarker} />);
                    }
                    return marks;
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.panel}>
            <GroupHeader icon={<Target size={13} />}>Reference — never downshift or retire</GroupHeader>
            <div className={styles.chartShort}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="year" tickFormatter={(y) => `+${y}y`} stroke={colors.subtext} fontSize={11} tickLine={false} axisLine={{ stroke: colors.panelBorder }} />
                  <YAxis tickFormatter={(v) => fmtMoney(v, true)} stroke={colors.coral} fontSize={11} tickLine={false} axisLine={false} width={58} />
                  <Tooltip
                    formatter={(value, name) => [fmtMoney(Number(value)), name]}
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

          <div className={styles.readoutsGrid}>
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
                label={`${s.label} · ${p1} +${s.year1}y@${s.incomePct1}% · ${p2} +${s.year2}y@${s.incomePct2}%`}
                value={s.shortfallYear !== null ? `Shortfall at +${s.shortfallYear}y` : "Bridge fully covered"}
                accent={s.shortfallYear !== null ? colors.coral : colors.mint}
                sub={`Retire: ${p1} age ${startAge + s.retireYear1} · ${p2} age ${startAge + s.retireYear2} · FI: ${s.fiYear !== null ? `+${s.fiYear}y @ ${s.fiSwr!.toFixed(2)}% SWR` : `beyond ${horizon}y`}${ladderOn ? ` · converted ${fmtMoney(s.totalConverted, true)}` : ""} · Liquid at +${horizon}y: ${fmtMoney(s.end, true)}`}
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

        <p className={styles.disclaimer}>
          Income fields are now gross salary — federal income tax, FICA (Social Security + Medicare), and Georgia state
          tax are computed and subtracted every year, using 2026 law: single-filer federal brackets and the $16,100
          single standard deduction for each of you separately (since you're not married, each of you files as single,
          not jointly), the $184,500 Social Security wage base, 1.45% Medicare plus 0.9% Additional Medicare Tax above
          $200,000 individually, and your Georgia rate applied to the same taxable-income base. Traditional 401k, HSA, and Roth
          contribution targets are set per person (matching how the IRS limits actually work — each person has their own
          elective-deferral, HSA, and IRA limit) and each has a separate pre- and post-downshift target, since a person
          who's downshifted or gone part-time often can't max a 401k on the reduced income, or newly qualifies for direct
          Roth contributions once their own MAGI drops. Each person's own target switches the moment THEY go off full
          income — downshift or retirement, whichever comes first — regardless of what the other person is doing.
          Traditional and HSA contributions are pretax and capped at that person's own gross, subtracted before
          federal/state tax is calculated, the same way a real paycheck works; FICA still applies to full gross either
          way, since 401k/HSA elections don't reduce Social Security or Medicare wages. These
          thresholds are held flat in the model's real (inflation-adjusted) dollars, which is a reasonable approximation
          since most of them are themselves inflation-indexed by law in reality. Not modeled: state/local beyond GA,
          itemizing, credits (child tax credit, EITC), or NIIT. The net worth chart's "total" still counts a Traditional
          dollar the same as a Roth dollar even though it isn't spendable without the withdrawal tax computed elsewhere
          in this model — actual withdrawals are taxed, but the running balance itself is shown pre-tax. If you get
          married, married-filing-jointly brackets are wider at your combined income, so total tax would very likely
          drop from what's shown now.
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
          Selling invested taxable assets to cover a shortfall owes long-term capital gains tax on the gain portion — federal
          0/15/20% brackets stacked on top of that year's wages, plus Georgia's flat rate on the gain (Georgia has no
          preferential capital-gains rate). "Taxable cost basis" sets how much of the starting balance is contributions
          versus already-accrued growth; every later contribution adds fresh basis dollar-for-dollar, and every sale draws
          down basis at the account's current average gain ratio, same as a mutual fund's average-cost method — there's no
          lot-level tracking or loss-harvesting, and every gain is treated as long-term regardless of how recently it was
          contributed. The gross-up works the same way as a Traditional withdrawal: sell enough that what's left over after
          tax covers the need.
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
          The Roth conversion ladder is the standard mechanism for reaching Traditional money before 59&frac12;. It only
          runs once BOTH of you are off full income (downshifted or retired) &mdash; the same condition that triggers the
          uninsured-healthcare surcharge &mdash; since converting while either of you still draws a full salary stacks
          ordinary income on your highest bracket instead of a genuinely low-income year, defeating the point. So the
          "never downshift" baseline never converts at all, and an asymmetric scenario waits for whichever of you downshifts
          last. Once active, each year before penalty-free age the model converts up to the per-person amount from
          Traditional to Roth, pays ordinary income tax on it that year (federal + GA, no FICA), and makes it penalty-free
          accessible after the seasoning period &mdash; five years under current law, with each year's conversion carrying
          its own clock. Seasoned conversions are drawn after Roth basis and before anything age-restricted. The point of
          the ladder is rate arbitrage: convert during low-income years at 12&ndash;17% instead of deducting at your
          previous 29.5% marginal. Converting more than about \$66k per person in a year pushes you out of the 12% federal
          bracket and the arbitrage shrinks sharply. Two alternatives the model does NOT simulate: 72(t)/SEPP substantially
          equal periodic payments, which unlock a Traditional balance at any age but lock you into a rigid payment schedule;
          and the Rule of 55, which lets you tap the 401(k) of the employer you leave in or after the year you turn 55.
          <br /><br />
          Traditional withdrawals after the penalty-free age are taxed as ordinary income, so the model grosses them
          up &mdash; pulling enough to leave the needed amount after federal and Georgia tax, stacked on top of any wages
          that year and split across both filers. Qualified Roth withdrawals stay tax-free, which is the point of the
          ladder: you pay once, at a low rate, in a low-income year. Still not modeled on the withdrawal side: RMDs
          starting at 73 (which force taxable income whether you want it or not, and are the main reason to convert
          more aggressively earlier) and NIIT.
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
