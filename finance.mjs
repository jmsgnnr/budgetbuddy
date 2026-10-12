/**
 * Pure finance calculations for Mubu Stability Planner.
 * No DOM or storage — safe for Node tests and browser import.
 */

export const SCHEMA_VERSION = 2;
export const STARTER_OPTIONS = [500, 1000];

/** Pay cadence keys stored with raw paycheck amounts. */
export const PAY_PERIODS = [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "yearly",
];

/**
 * Convert a paycheck amount to an approximate monthly equivalent.
 * weekly ×52/12, biweekly ×26/12, semimonthly ×2, monthly ×1, yearly ÷12.
 */
export function monthlyFromPayPeriod(amount, period) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return null;
  }
  const a = Math.max(0, amount);
  switch (period) {
    case "weekly":
      return (a * 52) / 12;
    case "biweekly":
      return (a * 26) / 12;
    case "semimonthly":
      return a * 2;
    case "monthly":
      return a;
    case "yearly":
      return a / 12;
    default:
      return null;
  }
}

/**
 * Resolve stored income to a monthly number for computePlan.
 * Legacy saves stored income already as monthly (no cadence conversion).
 */
export function resolveMonthlyIncome({
  income,
  incomePayPeriod = "monthly",
  incomeLegacyMonthly = false,
}) {
  const raw = parseAmount(income);
  if (raw === null) return null;
  if (incomeLegacyMonthly) return raw;
  const period = PAY_PERIODS.includes(incomePayPeriod) ? incomePayPeriod : "monthly";
  return monthlyFromPayPeriod(raw, period);
}

/** Step validators for guided onboarding (0 is valid where noted). */
export function validateIncomeStep(income, payPeriod = "monthly") {
  const raw = parseAmount(income);
  if (raw === null) return false;
  if (!PAY_PERIODS.includes(payPeriod)) return false;
  return monthlyFromPayPeriod(raw, payPeriod) !== null;
}

export function validateAmountStep(value) {
  return parseAmount(value) !== null;
}

export function validateDebtChoiceStep(hasDebt) {
  return hasDebt === true || hasDebt === false;
}

/** Parse user input to a finite nonnegative number, or null if invalid/blank. */
export function parseAmount(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Sanitize debt label for safe text display (strip control chars, trim length). */
export function sanitizeLabel(raw) {
  if (raw === null || raw === undefined) return "";
  return String(raw)
    .replace(/[\0-\x1f\x7f]/g, "")
    .trim()
    .slice(0, 80);
}

export function sixMonthTarget(essentialMonthly) {
  const e = essentialMonthly ?? 0;
  if (!Number.isFinite(e) || e < 0) return 0;
  return e * 6;
}

/** Starter goal capped at six-month target. */
export function effectiveStarterGoal(starterChoice, sixMonthGoal) {
  const starter = STARTER_OPTIONS.includes(starterChoice) ? starterChoice : 1000;
  const cap = Math.max(0, sixMonthGoal);
  return Math.min(starter, cap);
}

export function totalDebtMinimums(debts) {
  if (!Array.isArray(debts)) return 0;
  return debts.reduce((sum, d) => {
    const min = parseAmount(d?.minimumPayment) ?? 0;
    return sum + min;
  }, 0);
}

export function totalDebtBalance(debts) {
  if (!Array.isArray(debts)) return 0;
  return debts.reduce((sum, d) => {
    const bal = parseAmount(d?.balance) ?? 0;
    return sum + bal;
  }, 0);
}

export function monthlySurplus({ income, essentials, wants, debts }) {
  const inc = income ?? 0;
  const ess = essentials ?? 0;
  const w = wants ?? 0;
  const mins = totalDebtMinimums(debts);
  return inc - ess - w - mins;
}

export function runwayMonths(currentSavings, essentialMonthly) {
  if (!essentialMonthly || essentialMonthly <= 0) return null;
  const s = Math.max(0, currentSavings ?? 0);
  return s / essentialMonthly;
}

export function progressPercent(current, goal) {
  if (!goal || goal <= 0) return current > 0 ? 100 : 0;
  return Math.min(100, (Math.max(0, current ?? 0) / goal) * 100);
}

/** Sort debts for payoff priority (avalanche or snowball). Stable tie-break by label. */
export function sortDebtsForPriority(debts, method = "avalanche") {
  const copy = (debts ?? []).map((d, i) => ({
    ...d,
    _index: i,
    balance: parseAmount(d?.balance) ?? 0,
    apr: parseAmount(d?.apr) ?? 0,
    minimumPayment: parseAmount(d?.minimumPayment) ?? 0,
    label: sanitizeLabel(d?.label) || `Debt ${i + 1}`,
  }));

  if (method === "snowball") {
    copy.sort((a, b) => {
      if (a.balance !== b.balance) return a.balance - b.balance;
      return a.label.localeCompare(b.label) || a._index - b._index;
    });
  } else {
    copy.sort((a, b) => {
      if (b.apr !== a.apr) return b.apr - a.apr;
      const byLabel = a.label.localeCompare(b.label);
      if (byLabel !== 0) return byLabel;
      return a._index - b._index;
    });
  }
  return copy;
}

export function highestAprDebt(debts) {
  const sorted = sortDebtsForPriority(debts, "avalanche");
  return sorted.find((d) => d.balance > 0) ?? null;
}

/** Approximate months to reach six-month reserve at given monthly contribution. */
export function monthsToSixMonthReserve({
  currentSavings,
  essentialMonthly,
  monthlyContribution,
}) {
  const target = sixMonthTarget(essentialMonthly);
  const shortfall = Math.max(0, target - Math.max(0, currentSavings ?? 0));
  const contrib = monthlyContribution ?? 0;
  if (shortfall <= 0) return 0;
  if (contrib <= 0) return null;
  return Math.ceil(shortfall / contrib);
}

export const STAGES = {
  SETUP: "setup",
  STARTER: "starter",
  DEBT: "debt",
  RESERVE: "reserve",
  COMPLETE: "complete",
};

/**
 * Determine current stability stage and next action copy.
 */
export function determineStage({
  currentSavings,
  essentialMonthly,
  starterGoal,
  sixMonthGoal,
  debts,
  surplus,
}) {
  const savings = Math.max(0, currentSavings ?? 0);
  const starter = effectiveStarterGoal(starterGoal, sixMonthGoal);
  const six = sixMonthGoal ?? sixMonthTarget(essentialMonthly);
  const hasConsumerDebt = totalDebtBalance(debts) > 0;

  if (surplus < 0) {
    return {
      stage: STAGES.STARTER,
      blocked: true,
      nextAction:
        "Your plan shows a monthly deficit. Reduce essentials or wants, or increase income, before funding stability goals.",
    };
  }

  if (savings < starter) {
    return {
      stage: STAGES.STARTER,
      blocked: false,
      nextAction: `Build your starter emergency buffer to $${starter.toLocaleString("en-US")} in an accessible savings account.`,
    };
  }

  if (hasConsumerDebt) {
    const target = sortDebtsForPriority(debts).find(d => d.balance > 0);
    return {
      stage: STAGES.DEBT,
      blocked: false,
      nextAction: target
        ? `Keep all minimum payments, then put extra surplus toward "${target.label}" (${target.apr}% APR).`
        : "Keep minimum payments on all debts; avoid new consumer debt.",
    };
  }

  if (savings < six) {
    return {
      stage: STAGES.RESERVE,
      blocked: false,
      nextAction:
        "Grow cash savings toward six months of essential expenses (keep this in bank savings, not investments).",
    };
  }

  return {
    stage: STAGES.COMPLETE,
    blocked: false,
    nextAction:
      "You’ve reached the six-month cash reserve goal. Consider responsible investing only after reviewing your full financial picture (this app does not provide investment advice).",
  };
}

/**
 * Safe-to-spend after reserving essentials and debt minimums for the rest of the month.
 * Does not include discretionary wants — those are already budgeted separately.
 */
export function safeToSpendMonthly({ income, essentials, debts }) {
  const inc = income ?? 0;
  const ess = essentials ?? 0;
  const mins = totalDebtMinimums(debts);
  return inc - ess - mins;
}

/**
 * Build full plan snapshot from raw form inputs.
 */
export function computePlan(input) {
  const income = parseAmount(input.income) ?? 0;
  const essentials = parseAmount(input.essentials) ?? 0;
  const wants = parseAmount(input.wants) ?? 0;
  const currentSavings = parseAmount(input.currentSavings) ?? 0;
  const starterChoice = STARTER_OPTIONS.includes(input.starterGoal)
    ? input.starterGoal
    : 1000;
  const debts = (input.debts ?? []).map((d, i) => ({
    label: sanitizeLabel(d?.label) || `Debt ${i + 1}`,
    balance: parseAmount(d?.balance) ?? 0,
    apr: parseAmount(d?.apr) ?? 0,
    minimumPayment: parseAmount(d?.minimumPayment) ?? 0,
  }));
  const debtMethod = input.debtMethod === "snowball" ? "snowball" : "avalanche";
  const emergencyContribution = parseAmount(input.emergencyContribution);
  const wantsCutScenario = parseAmount(input.wantsCutScenario) ?? 0;

  const sixMonthGoal = sixMonthTarget(essentials);
  const starter = effectiveStarterGoal(starterChoice, sixMonthGoal);
  const surplus = monthlySurplus({ income, essentials, wants, debts });
  const scenarioWants = Math.max(0, wants - wantsCutScenario);
  const scenarioSurplus = monthlySurplus({
    income,
    essentials,
    wants: scenarioWants,
    debts,
  });

  const maxContribution = Math.max(0, surplus);
  const contribution =
    emergencyContribution === null
      ? maxContribution
      : Math.min(Math.max(0, emergencyContribution), maxContribution);

  const scenarioMaxContribution = Math.max(0, scenarioSurplus);
  // Treat the full reduction in discretionary spending as extra savings in the scenario.
  const extraFromCut = Math.max(0, scenarioSurplus - surplus);
  const scenarioContribution = Math.min(contribution + extraFromCut, scenarioMaxContribution);

  const missingCoreInputs = parseAmount(input.income) === null ||
    parseAmount(input.essentials) === null || essentials <= 0;
  const stageInfo = missingCoreInputs
    ? { stage: STAGES.SETUP, blocked: true,
        nextAction: "Enter your monthly take-home income and essential spending to build a realistic plan." }
    : determineStage({
        currentSavings,
        essentialMonthly: essentials,
        starterGoal: starterChoice,
        sixMonthGoal,
        debts,
        surplus,
      });

  const priorityDebts = sortDebtsForPriority(debts, debtMethod).filter(d => d.balance > 0);
  const topDebt = highestAprDebt(debts);

  return {
    income,
    essentials,
    wants,
    currentSavings,
    starterChoice,
    starterGoal: starter,
    sixMonthGoal,
    debts,
    debtMethod,
    surplus,
    deficit: surplus < 0,
    emergencyContribution: contribution,
    maxEmergencyContribution: maxContribution,
    wantsCutScenario,
    scenario: {
      wants: scenarioWants,
      surplus: scenarioSurplus,
      emergencyContribution: scenarioContribution,
      monthsToSixMonth: missingCoreInputs ? null : monthsToSixMonthReserve({
        currentSavings,
        essentialMonthly: essentials,
        monthlyContribution: scenarioContribution,
      }),
    },
    runwayMonths: runwayMonths(currentSavings, essentials),
    starterProgress: progressPercent(currentSavings, starter),
    sixMonthProgress: progressPercent(currentSavings, sixMonthGoal),
    monthsToSixMonth: missingCoreInputs ? null : monthsToSixMonthReserve({
      currentSavings,
      essentialMonthly: essentials,
      monthlyContribution: contribution,
    }),
    totalDebt: totalDebtBalance(debts),
    totalMinimums: totalDebtMinimums(debts),
    priorityDebts,
    highestApr: topDebt?.apr ?? 0,
    safeToSpend: safeToSpendMonthly({ income, essentials, debts }),
    stage: stageInfo.stage,
    blocked: stageInfo.blocked,
    nextAction: stageInfo.nextAction,
  };
}

export function demoInput() {
  return {
    income: "4200",
    incomePayPeriod: "monthly",
    incomeLegacyMonthly: false,
    essentials: "2100",
    wants: "650",
    currentSavings: "350",
    starterGoal: 1000,
    hasDebt: true,
    debtMethod: "avalanche",
    emergencyContribution: null,
    wantsCutScenario: "0",
    onboardingComplete: true,
    debts: [
      {
        label: "Sample credit card",
        balance: "2800",
        apr: "22.9",
        minimumPayment: "85",
      },
      {
        label: "Sample personal loan",
        balance: "4500",
        apr: "11.5",
        minimumPayment: "120",
      },
    ],
  };
}
