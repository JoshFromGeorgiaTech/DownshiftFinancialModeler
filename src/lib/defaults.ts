import { colors } from "./colors.js";
import type { Defaults } from "../types.js";

export const DEFAULTS: Defaults = {
  person1Name: "Person 1", person2Name: "Person 2",
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
