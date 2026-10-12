/**
 * Pure finance calculations for BudgetBuddy.
 * No DOM or storage — safe for Node tests and browser import.
 */

export const SCHEMA_VERSION = 2;

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
  DEFICIT: "deficit",
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
  sixMonthGoal,
  debts,
  surplus,
}) {
  const savings = Math.max(0, currentSavings ?? 0);
  const six = sixMonthGoal ?? sixMonthTarget(essentialMonthly);
  const hasConsumerDebt = totalDebtBalance(debts) > 0;

  if (surplus < 0) {
    return {
      stage: STAGES.DEFICIT,
      blocked: true,
      nextAction:
        "Your monthly spending and debt minimums are higher than your income. Review the gap first. There is no required savings balance to get started.",
    };
  }

  if (hasConsumerDebt) {
    const target = sortDebtsForPriority(debts).find(d => d.balance > 0);
    return {
      stage: STAGES.DEBT,
      blocked: false,
      nextAction: target
        ? `Keep minimum payments current. Consider a cash cushion that fits your life while directing extra money toward "${target.label}" (${target.apr}% APR). No fixed savings minimum is required.`
        : "Keep minimum payments current and build cash savings at your own pace.",
    };
  }

  if (savings < six) {
    return {
      stage: STAGES.RESERVE,
      blocked: false,
      nextAction:
        "Start or grow emergency savings with whatever amount fits your budget. Six months of essentials is a long-term reference, not a required starting balance.",
    };
  }

  return {
    stage: STAGES.COMPLETE,
    blocked: false,
    nextAction:
      "Your cash covers six months of essentials. Review your other obligations and goals before deciding what to do next.",
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
