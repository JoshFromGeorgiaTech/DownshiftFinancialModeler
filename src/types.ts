export interface Scenario {
  id: string;
  label: string;
  color: string;
  enabled: boolean;
  year1: number;
  incomePct1: number;
  retireYear1: number;
  year2: number;
  incomePct2: number;
  retireYear2: number;
}

export interface DownshiftConfig {
  year1: number;
  pct1: number;
  retireYear1: number;
  year2: number;
  pct2: number;
  retireYear2: number;
}

export interface HousingYearRow {
  housingCost: number;
  oneTime: number;
  equity: number;
}

export interface SimRow {
  year: number;
  total: number;
  accessible: number;
}

export interface SimResult {
  rows: SimRow[];
  firstShortfallYear: number | null;
  fiYear: number | null;
  fiSwr: number | null;
  totalConverted: number;
  totalWithdrawalTax: number;
}

export interface SimParams {
  startAge: number;
  income1: number;
  income2: number;
  gaRate: number;
  expenses: number;
  growthRate: number;
  horizon: number;
  penaltyFreeAge: number;
  kidsOn: boolean;
  numKids: number;
  infantCost: number;
  infantYears: number;
  laterCost: number;
  kidsStartYear: number;
  kidsDuration: number;
  trad0: number;
  roth0: number;
  rothBasis0: number;
  taxable0: number;
  taxableBasis0: number;
  cash0: number;
  hsa0: number;
  trad1TargetPre: number;
  trad1TargetPost: number;
  trad2TargetPre: number;
  trad2TargetPost: number;
  roth1TargetPre: number;
  roth1TargetPost: number;
  roth2TargetPre: number;
  roth2TargetPost: number;
  hsa1TargetPre: number;
  hsa1TargetPost: number;
  hsa2TargetPre: number;
  hsa2TargetPost: number;
  employerMatchPct: number;
  employerMatchCapPct: number;
  planningEndAge: number;
  swrAdjust: number;
  ladderOn: boolean;
  convertPerPerson: number;
  seasoningYears: number;
  uninsuredOn: boolean;
  medCostPerAdult: number;
  numUninsuredAdults: number;
}

export interface MortgageSnapshotInputs {
  housePrice: number;
  downPaymentPct: number;
  mortgageRate: number;
  loanTermYears: number;
  propertyTaxRate: number;
  insMaintPct: number;
  currentHousingCost: number;
}

export interface MortgageSnapshot {
  loanAmount: number;
  monthlyPI: number;
  monthlyTax: number;
  monthlyInsMaint: number;
  monthlyPMI: number;
  monthlyTotal: number;
  downPaymentAmount: number;
  annualDelta: number;
}

export interface HousingScheduleInputs {
  horizon: number;
  houseOn: boolean;
  houseYear: number;
  housePrice: number;
  downPaymentPct: number;
  mortgageRate: number;
  loanTermYears: number;
  appreciationRate: number;
  propertyTaxRate: number;
  insMaintPct: number;
  inflationRate: number;
  currentHousingCost: number;
}

export interface NetForPerson {
  gross: number;
  contrib: number;
  federalTax: number;
  ssTax: number;
  medicareTax: number;
  gaTax: number;
  totalTax: number;
  net: number;
}

export interface GrossUpResult {
  gross: number;
  tax: number;
  net: number;
}

export interface Defaults extends SimParams, HousingScheduleInputs {
  person1Name: string;
  person2Name: string;
  scenarios: Scenario[];
}
