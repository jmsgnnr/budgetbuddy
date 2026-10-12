import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseAmount,
  sixMonthTarget,
  monthlySurplus,
  monthlyFromPayPeriod,
  resolveMonthlyIncome,
  validateIncomeStep,
  validateAmountStep,
  validateDebtChoiceStep,
  runwayMonths,
  sortDebtsForPriority,
  monthsToSixMonthReserve,
  computePlan,
  determineStage,
  STAGES,
  totalDebtMinimums,
} from "../finance.mjs";

describe("monthlyFromPayPeriod", () => {
  it("converts pay cadences to monthly equivalents", () => {
    assert.equal(monthlyFromPayPeriod(1200, "weekly"), (1200 * 52) / 12);
    assert.equal(monthlyFromPayPeriod(2400, "biweekly"), (2400 * 26) / 12);
    assert.equal(monthlyFromPayPeriod(1500, "semimonthly"), 3000);
    assert.equal(monthlyFromPayPeriod(4200, "monthly"), 4200);
    assert.equal(monthlyFromPayPeriod(60000, "yearly"), 5000);
  });

  it("returns null for invalid amounts or periods", () => {
    assert.equal(monthlyFromPayPeriod(null, "monthly"), null);
    assert.equal(monthlyFromPayPeriod(100, "quarterly"), null);
  });
});

describe("resolveMonthlyIncome", () => {
  it("does not double-convert legacy monthly saves", () => {
    assert.equal(
      resolveMonthlyIncome({
        income: "4200",
        incomePayPeriod: "weekly",
        incomeLegacyMonthly: true,
      }),
      4200
    );
  });

  it("converts raw paycheck amounts for new saves", () => {
    assert.equal(
      resolveMonthlyIncome({
        income: "1000",
        incomePayPeriod: "weekly",
        incomeLegacyMonthly: false,
      }),
      (1000 * 52) / 12
    );
  });
});

describe("onboarding validation", () => {
  it("accepts zero income but not blank or negative", () => {
    assert.equal(validateIncomeStep("0", "monthly"), true);
    assert.equal(validateIncomeStep("", "monthly"), false);
    assert.equal(validateIncomeStep("-1", "monthly"), false);
  });

  it("validates amount steps and debt choice", () => {
    assert.equal(validateAmountStep("0"), true);
    assert.equal(validateAmountStep(""), false);
    assert.equal(validateDebtChoiceStep(true), true);
    assert.equal(validateDebtChoiceStep(false), true);
    assert.equal(validateDebtChoiceStep(null), false);
  });
});

describe("parseAmount", () => {
  it("returns null for blank or invalid", () => {
    assert.equal(parseAmount(""), null);
    assert.equal(parseAmount("  "), null);
    assert.equal(parseAmount("-5"), null);
    assert.equal(parseAmount("abc"), null);
  });

  it("parses nonnegative numbers", () => {
    assert.equal(parseAmount("0"), 0);
    assert.equal(parseAmount(" 42.5 "), 42.5);
  });
});

describe("monthlySurplus and deficits", () => {
  it("computes unallocated surplus", () => {
    const s = monthlySurplus({
      income: 5000,
      essentials: 2000,
      wants: 800,
      debts: [{ minimumPayment: "100" }, { minimumPayment: 50 }],
    });
    assert.equal(s, 2050);
  });

  it("allows negative deficit (does not floor to zero)", () => {
    const s = monthlySurplus({
      income: 3000,
      essentials: 2000,
      wants: 1500,
      debts: [],
    });
    assert.equal(s, -500);
  });
});

describe("six-month reference without mandatory starter threshold", () => {
  it("uses six months of essential expenses", () => {
    assert.equal(sixMonthTarget(1500), 9000);
  });

  it("accepts zero savings and does not impose a $500 or $1,000 minimum", () => {
    const plan = computePlan({
      income: "3000", essentials: "1800", wants: "400", currentSavings: "0",
      debts: [],
    });
    assert.equal(plan.currentSavings, 0);
    assert.equal(plan.sixMonthGoal, 10800);
    assert.equal(plan.sixMonthProgress, 0);
    assert.equal(plan.stage, STAGES.RESERVE);
    assert.doesNotMatch(plan.nextAction, /\\$500|\\$1,000|starter/i);
  });

  it("does not gate debt priority behind a savings balance", () => {
    const plan = computePlan({
      income: "3500", essentials: "1800", wants: "400", currentSavings: "0",
      debts: [{label: "Card", balance: "1500", apr: "24", minimumPayment: "60"}],
    });
    assert.equal(plan.stage, STAGES.DEBT);
    assert.match(plan.nextAction, /Card/);
    assert.doesNotMatch(plan.nextAction, /required savings|\\$500|\\$1,000/i);
  });
});

describe("runway with zero essentials", () => {
  it("returns null when essentials are zero", () => {
    assert.equal(runwayMonths(5000, 0), null);
  });
});

describe("debt priority", () => {
  it("avalanche sorts by APR descending with stable label tie-break", () => {
    const sorted = sortDebtsForPriority(
      [
        { label: "B", balance: 1000, apr: 18, minimumPayment: 30 },
        { label: "A", balance: 500, apr: 24, minimumPayment: 25 },
        { label: "C", balance: 2000, apr: 24, minimumPayment: 40 },
      ],
      "avalanche"
    );
    assert.equal(sorted[0].label, "A");
    assert.equal(sorted[1].label, "C");
  });

  it("snowball sorts by lowest balance", () => {
    const sorted = sortDebtsForPriority(
      [
        { label: "Big", balance: 5000, apr: 10, minimumPayment: 100 },
        { label: "Small", balance: 400, apr: 22, minimumPayment: 25 },
      ],
      "snowball"
    );
    assert.equal(sorted[0].label, "Small");
  });

  it("sums multiple debt minimums", () => {
    assert.equal(
      totalDebtMinimums([
        { minimumPayment: "80" },
        { minimumPayment: "45.5" },
      ]),
      125.5
    );
  });
});

describe("savings contribution and time to six months", () => {
  it("months to six-month reserve from shortfall / contribution", () => {
    const m = monthsToSixMonthReserve({
      currentSavings: 2000,
      essentialMonthly: 1000,
      monthlyContribution: 500,
    });
    assert.equal(m, 8);
  });

  it("returns null when contribution is zero but shortfall remains", () => {
    assert.equal(
      monthsToSixMonthReserve({
        currentSavings: 0,
        essentialMonthly: 1000,
        monthlyContribution: 0,
      }),
      null
    );
  });
});

describe("computePlan integration", () => {
  it("caps emergency contribution at surplus", () => {
    const plan = computePlan({
      income: "4000",
      essentials: "2000",
      wants: "500",
      currentSavings: "0",

      emergencyContribution: "9999",
      debts: [{ minimumPayment: "200" }],
    });
    assert.equal(plan.surplus, 1300);
    assert.equal(plan.emergencyContribution, 1300);
  });

  it("wants cut scenario increases scenario surplus", () => {
    const plan = computePlan({
      income: "4000",
      essentials: "2000",
      wants: "800",
      currentSavings: "1000",

      wantsCutScenario: "200",
      debts: [],
    });
    assert.equal(plan.surplus, 1200);
    assert.equal(plan.scenario.surplus, 1400);
    assert.ok(plan.scenario.monthsToSixMonth <= (plan.monthsToSixMonth ?? Infinity));
  });

  it("missing income treated as zero in plan", () => {
    const plan = computePlan({
      income: "",
      essentials: "1000",
      wants: "0",
      currentSavings: "0",
      debts: [],
    });
    assert.equal(plan.income, 0);
    assert.equal(plan.deficit, true);
  });

  it("blocked stage when deficit", () => {
    const info = determineStage({
      currentSavings: 0,
      essentialMonthly: 1000,

      sixMonthGoal: 6000,
      debts: [],
      surplus: -100,
    });
    assert.equal(info.blocked, true);
    assert.equal(info.stage, STAGES.DEFICIT);
    assert.equal(determineStage({
      currentSavings: 2000,
      essentialMonthly: 1000,

      sixMonthGoal: 6000,
      debts: [{ balance: 500, apr: 20, minimumPayment: 25 }],
      surplus: 200,
    }).stage, STAGES.DEBT);
  });
});

describe("realistic stability dashboard behavior", () => {
  it("does not announce success before income and essentials are entered", () => {
    const plan = computePlan({ income: "", essentials: "", wants: "", currentSavings: "", debts: [] });
    assert.equal(plan.stage, STAGES.SETUP);
    assert.equal(plan.monthsToSixMonth, null);
    assert.equal(plan.scenario.monthsToSixMonth, null);
  });

  it("ignores fully paid or blank debt rows when choosing a payoff target", () => {
    const plan = computePlan({
      income: "3500", essentials: "1800", wants: "500", currentSavings: "1300",
      debts: [
        { label: "", balance: "", apr: "", minimumPayment: "" },
        { label: "Actual credit card", balance: "900", apr: "19", minimumPayment: "30" }
      ]
    });
    assert.equal(plan.priorityDebts.length, 1);
    assert.equal(plan.priorityDebts[0].label, "Actual credit card");
    assert.match(plan.nextAction, /Actual credit card/);
  });

  it("puts savings from a wants reduction into the scenario contribution", () => {
    const plan = computePlan({
      income: "4000", essentials: "2000", wants: "900", currentSavings: "500",
      emergencyContribution: "400", wantsCutScenario: "200", debts: []
    });
    assert.equal(plan.emergencyContribution, 400);
    assert.equal(plan.scenario.emergencyContribution, 600);
    assert.ok(plan.scenario.monthsToSixMonth < plan.monthsToSixMonth);
  });
});
