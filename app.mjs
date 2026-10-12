import {
  SCHEMA_VERSION,
  STARTER_OPTIONS,
  computePlan,
  demoInput,
  parseAmount,
  resolveMonthlyIncome,
  sanitizeLabel,
  validateAmountStep,
  validateDebtChoiceStep,
  validateIncomeStep,
} from "./finance.mjs";

const STORAGE_KEY = "mubu-stability-planner-v1";
const STEP_COUNT = 5;

const onboarding = {
  activeStep: 1,
  completed: new Set(),
  complete: false,
};

function $(id) {
  return document.getElementById(id);
}

function formatMoney(n) {
  if (!Number.isFinite(n)) return "...";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatMonths(m) {
  if (m === null || m === undefined) return "Not reachable with current contribution";
  if (m === 0) return "Already at or above target";
  return `~${m} month${m === 1 ? "" : "s"} (approximate)`;
}

function readDebtsFromDom() {
  const rows = [...document.querySelectorAll("#debt-list .debt-row")];
  return rows.map((row) => ({
    label: row.querySelector('[data-field="label"]')?.value ?? "",
    balance: row.querySelector('[data-field="balance"]')?.value ?? "",
    apr: row.querySelector('[data-field="apr"]')?.value ?? "",
    minimumPayment: row.querySelector('[data-field="minimum"]')?.value ?? "",
  }));
}

function readFormState() {
  const starterRaw = document.querySelector('input[name="starterGoal"]:checked')?.value;
  const starterGoal = starterRaw ? Number(starterRaw) : 1000;
  const surplusSlider = $("emergency-slider");
  const wantsCutSlider = $("wants-cut-slider");
  const hasDebt = readHasDebtChoice();

  return {
    income: $("income")?.value ?? "",
    incomePayPeriod: $("income-pay-period")?.value ?? "monthly",
    incomeLegacyMonthly: $("income")?.dataset.legacyMonthly === "1",
    essentials: $("essentials")?.value ?? "",
    wants: $("wants")?.value ?? "",
    currentSavings: $("current-savings")?.value ?? "",
    starterGoal: STARTER_OPTIONS.includes(starterGoal) ? starterGoal : 1000,
    hasDebt,
    debtMethod: $("debt-method")?.value === "snowball" ? "snowball" : "avalanche",
    emergencyContribution: surplusSlider?.value ?? "0",
    emergencyContributionUserSet: surplusSlider?.dataset.userSet === "1",
    wantsCutScenario: wantsCutSlider?.value ?? "0",
    debts: readDebtsFromDom(),
    onboardingComplete: onboarding.complete,
    onboardingCompletedSteps: [...onboarding.completed],
  };
}

function readHasDebtChoice() {
  const yes = document.querySelector('.debt-choice-btn[data-debt-choice="yes"]');
  if (yes?.dataset.selected === "1") return true;
  if (document.querySelector('.debt-choice-btn[data-debt-choice="no"]')?.dataset.selected === "1") {
    return false;
  }
  return null;
}

function setHasDebtChoice(value) {
  const yes = document.querySelector('.debt-choice-btn[data-debt-choice="yes"]');
  const no = document.querySelector('.debt-choice-btn[data-debt-choice="no"]');
  yes?.removeAttribute("data-selected");
  no?.removeAttribute("data-selected");
  yes?.classList.remove("is-selected");
  no?.classList.remove("is-selected");
  const debtsPanel = $("debts-section");
  if (value === true) {
    yes.dataset.selected = "1";
    yes.classList.add("is-selected");
    if (debtsPanel) debtsPanel.hidden = false;
    if (!debtListHasRows()) addDebtRow();
  } else if (value === false) {
    no.dataset.selected = "1";
    no.classList.add("is-selected");
    if (debtsPanel) debtsPanel.hidden = true;
  } else if (debtsPanel) {
    // Resetting or loading an unanswered debt step must never expose debt inputs.
    debtsPanel.hidden = true;
  }
}

function applyFormState(state) {
  const incomeEl = $("income");
  incomeEl.value = state.income ?? "";
  if (state.incomeLegacyMonthly) incomeEl.dataset.legacyMonthly = "1";
  else delete incomeEl.dataset.legacyMonthly;

  const periodEl = $("income-pay-period");
  if (periodEl && state.incomePayPeriod) periodEl.value = state.incomePayPeriod;

  $("essentials").value = state.essentials ?? "";
  $("wants").value = state.wants ?? "";
  $("current-savings").value = state.currentSavings ?? "";
  const starter = state.starterGoal ?? 1000;
  const starterRadio = document.querySelector(
    `input[name="starterGoal"][value="${starter}"]`
  );
  if (starterRadio) starterRadio.checked = true;
  $("debt-method").value = state.debtMethod ?? "avalanche";

  const debtList = $("debt-list");
  debtList.innerHTML = "";
  const debts = state.debts?.length ? state.debts : [];
  if (debts.length === 0) addDebtRow();
  else debts.forEach((d) => addDebtRow(d));

  if (state.hasDebt === true) setHasDebtChoice(true);
  else if (state.hasDebt === false) setHasDebtChoice(false);
  else setHasDebtChoice(null);

  $("emergency-slider").value = state.emergencyContribution ?? "0";
  if (state.emergencyContributionUserSet) $("emergency-slider").dataset.userSet = "1";
  else delete $("emergency-slider").dataset.userSet;
  $("wants-cut-slider").value = state.wantsCutScenario ?? "0";

  restoreOnboardingFromState(state);
}

function restoreOnboardingFromState(state) {
  if (state.onboardingComplete) {
    onboarding.complete = true;
    onboarding.completed = new Set([1, 2, 3, 4, 5]);
    onboarding.activeStep = 5;
    return;
  }
  if (Array.isArray(state.onboardingCompletedSteps)) {
    onboarding.completed = new Set(state.onboardingCompletedSteps);
    onboarding.complete = onboarding.completed.size === STEP_COUNT;
    const next = [...Array(STEP_COUNT).keys()]
      .map((i) => i + 1)
      .find((n) => !onboarding.completed.has(n));
    onboarding.activeStep = next ?? STEP_COUNT;
    return;
  }
  if (isLegacyCompleteForm(state)) {
    onboarding.complete = true;
    onboarding.completed = new Set([1, 2, 3, 4, 5]);
    onboarding.activeStep = 5;
  }
}

function isLegacyCompleteForm(form) {
  return (
    parseAmount(form.income) !== null &&
    parseAmount(form.essentials) !== null &&
    parseAmount(form.wants) !== null &&
    parseAmount(form.currentSavings) !== null
  );
}

function inferLegacyHasDebt(form) {
  if (form.hasDebt === true || form.hasDebt === false) return form.hasDebt;
  const debts = form.debts ?? [];
  const hasBalance = debts.some((d) => (parseAmount(d?.balance) ?? 0) > 0);
  return hasBalance ? true : false;
}

function migrateStoredForm(form = {}) {
  const next = { ...form };
  if (next.incomePayPeriod === undefined) {
    next.incomePayPeriod = "monthly";
    next.incomeLegacyMonthly = true;
  }
  if (next.hasDebt === undefined) {
    next.hasDebt = inferLegacyHasDebt(next);
  }
  if (isLegacyCompleteForm(next) && next.onboardingComplete === undefined) {
    next.onboardingComplete = true;
  }
  return next;
}

function monthlyIncomeForPlan(state) {
  const monthly = resolveMonthlyIncome({
    income: state.income,
    incomePayPeriod: state.incomePayPeriod,
    incomeLegacyMonthly: state.incomeLegacyMonthly,
  });
  if (monthly === null) return "";
  return String(monthly);
}

function planInputFromState(state) {
  const debts = state.hasDebt === true ? state.debts : [];
  return {
    ...state,
    income: monthlyIncomeForPlan(state),
    debts,
  };
}

function addDebtRow(data = {}) {
  const row = document.createElement("div");
  row.className = "debt-row";
  row.innerHTML = `
    <label class="sr-only">Debt name</label>
    <input type="text" data-field="label" placeholder="e.g. Credit card" maxlength="80" aria-label="Debt name" />
    <label class="sr-only">Balance</label>
    <input type="number" data-field="balance" min="0" step="0.01" placeholder="Balance" aria-label="Balance" />
    <label class="sr-only">APR percent</label>
    <input type="number" data-field="apr" min="0" step="0.01" placeholder="APR %" aria-label="APR percent" />
    <label class="sr-only">Minimum payment</label>
    <input type="number" data-field="minimum" min="0" step="0.01" placeholder="Min payment" aria-label="Minimum payment" />
    <button type="button" class="btn-icon remove-debt" aria-label="Remove debt">×</button>
  `;
  row.querySelector('[data-field="label"]').value = data.label ?? "";
  row.querySelector('[data-field="balance"]').value = data.balance ?? "";
  row.querySelector('[data-field="apr"]').value = data.apr ?? "";
  row.querySelector('[data-field="minimum"]').value = data.minimumPayment ?? "";
  row.querySelector(".remove-debt").addEventListener("click", () => {
    row.remove();
    if (!debtListHasRows()) addDebtRow();
    refresh();
  });
  $("debt-list").appendChild(row);
}

function debtListHasRows() {
  return document.querySelectorAll("#debt-list .debt-row").length > 0;
}

function collectPersistedState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    form: readFormState(),
  };
}

function saveToStorage() {
  const banner = $("storage-banner");
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectPersistedState()));
    banner.hidden = true;
    banner.textContent = "";
  } catch {
    banner.hidden = false;
    banner.textContent =
      "Could not save to this browser's storage. Your plan still works. Export a backup if you want to keep it.";
  }
}

function loadFromStorage() {
  const banner = $("storage-banner");
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const version = parsed?.schemaVersion;
    if (version !== SCHEMA_VERSION && version !== 1) return false;
    const form = migrateStoredForm(parsed.form ?? {});
    applyFormState(form);
    return true;
  } catch {
    banner.hidden = false;
    banner.textContent =
      "Saved data could not be loaded. Starting with a blank plan.";
    return false;
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(collectPersistedState(), null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "budgetbuddy-plan.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function resetOnboardingState() {
  onboarding.activeStep = 1;
  onboarding.completed = new Set();
  onboarding.complete = false;
}

function clearStorage() {
  if (
    !window.confirm(
      "Erase all saved plan data from this browser? This cannot be undone."
    )
  ) {
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  resetOnboardingState();
  applyFormState({
    income: "",
    incomePayPeriod: "monthly",
    incomeLegacyMonthly: false,
    essentials: "",
    wants: "",
    currentSavings: "",
    starterGoal: 1000,
    hasDebt: null,
    debtMethod: "avalanche",
    emergencyContribution: "0",
    wantsCutScenario: "0",
    debts: [],
    onboardingComplete: false,
    onboardingCompletedSteps: [],
  });
  delete $("income").dataset.legacyMonthly;
  setHasDebtChoice(null);
  refresh();
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function renderDebtList(plan) {
  const list = $("priority-debts");
  list.innerHTML = "";
  plan.priorityDebts.forEach((d) => {
    const li = document.createElement("li");
    li.textContent = `${sanitizeLabel(d.label)} · ${formatMoney(d.balance)} at ${d.apr}% APR (min ${formatMoney(d.minimumPayment)})`;
    list.appendChild(li);
  });
  if (plan.priorityDebts.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No debts in this plan.";
    list.appendChild(li);
  }
}

function stepIsValid(step, state = readFormState()) {
  switch (step) {
    case 1:
      return validateIncomeStep(state.income, state.incomePayPeriod);
    case 2:
    case 3:
    case 5:
      return validateAmountStep(
        step === 2 ? state.essentials : step === 3 ? state.wants : state.currentSavings
      );
    case 4:
      if (!validateDebtChoiceStep(state.hasDebt)) return false;
      if (state.hasDebt === false) return true;
      // An entered negative or out-of-range debt amount must block an unreliable plan.
      return [...document.querySelectorAll('#debt-list input[type="number"]')].every(
        (input) => input.value === "" || input.validity.valid
      );
    default:
      return false;
  }
}

function updateIncomeMonthlyDisplay(state = readFormState()) {
  const monthly = resolveMonthlyIncome({
    income: state.income,
    incomePayPeriod: state.incomePayPeriod,
    incomeLegacyMonthly: state.incomeLegacyMonthly,
  });
  setText($("income-monthly-display"), monthly === null ? "..." : formatMoney(monthly));
}

function buildStepSummary(step, state = readFormState()) {
  switch (step) {
    case 1: {
      const monthly = resolveMonthlyIncome({
        income: state.income,
        incomePayPeriod: state.incomePayPeriod,
        incomeLegacyMonthly: state.incomeLegacyMonthly,
      });
      return monthly === null ? "" : `${formatMoney(monthly)} / month take-home`;
    }
    case 2:
      return `${formatMoney(parseAmount(state.essentials) ?? 0)} essentials / month`;
    case 3:
      return `${formatMoney(parseAmount(state.wants) ?? 0)} fun and extras / month`;
    case 4:
      if (state.hasDebt === false) return "No debt in this plan";
      if (state.hasDebt === true) {
        const count = (state.debts ?? []).filter(
          (d) => (parseAmount(d?.balance) ?? 0) > 0
        ).length;
        return count
          ? `${count} debt${count === 1 ? "" : "s"} · ${state.debtMethod === "snowball" ? "snowball" : "avalanche"}`
          : "Debt listed, details optional";
      }
      return "";
    case 5: {
      const starter = state.starterGoal ?? 1000;
      return `${formatMoney(parseAmount(state.currentSavings) ?? 0)} saved · $${starter} starter target`;
    }
    default:
      return "";
  }
}

function renderOnboardingUi() {
  const progress = $("onboarding-progress");
  const displayStep = onboarding.complete
    ? STEP_COUNT
    : onboarding.activeStep;
  setText(progress, `Step ${String(displayStep).padStart(2, "0")} of 05`);

  for (let step = 1; step <= STEP_COUNT; step += 1) {
    const li = document.querySelector(`.onboarding-step[data-step="${step}"]`);
    const toggle = $(`step-${step}-toggle`);
    const panel = $(`step-${step}-panel`);
    const summaryLine = $(`step-${step}-summary`);
    const editLabel = toggle?.querySelector(".step-edit");
    const question = toggle?.querySelector(".step-question");
    const isComplete = onboarding.completed.has(step);
    const isActive = !onboarding.complete && onboarding.activeStep === step;
    const isLocked = !onboarding.complete && step > onboarding.activeStep && !isComplete;

    li?.classList.toggle("is-complete", isComplete && !isActive);
    li?.classList.toggle("is-active", isActive);
    li?.classList.toggle("is-locked", isLocked);

    if (toggle) {
      toggle.disabled = isLocked;
      toggle.setAttribute("aria-expanded", isActive ? "true" : "false");
    }

    if (panel) panel.hidden = !isActive;
    if (summaryLine) {
      if (isComplete && !isActive) {
        summaryLine.hidden = false;
        summaryLine.textContent = buildStepSummary(step);
      } else {
        summaryLine.hidden = true;
        summaryLine.textContent = "";
      }
    }
    if (question) question.hidden = isComplete && !isActive;
    if (editLabel) editLabel.hidden = !(isComplete && !isActive);

    const continueBtn = panel?.querySelector(".step-continue");
    if (continueBtn) {
      continueBtn.disabled = !stepIsValid(step);
    }
  }

  const planSection = $("plan-results");
  const scenarioSection = $("scenario-section");
  const showPlan = onboarding.complete;
  planSection.hidden = !showPlan;
  scenarioSection.hidden = !showPlan;
  planSection.classList.toggle("is-locked", !showPlan);
  scenarioSection.classList.toggle("is-locked", !showPlan);
}

function openStep(step, { focusHeading = true, editing = false } = {}) {
  if (step < 1 || step > STEP_COUNT) return;
  if (editing) {
    onboarding.complete = false;
    for (let s = step; s <= STEP_COUNT; s += 1) {
      onboarding.completed.delete(s);
    }
  }
  onboarding.activeStep = step;
  renderOnboardingUi();
  if (focusHeading) {
    const panel = $(`step-${step}-panel`);
    const focusTarget =
      panel?.querySelector("input, select, button:not(.step-back)") ?? $(`step-${step}-toggle`);
    focusTarget?.focus();
  }
}

function completeStep(step) {
  if (!stepIsValid(step)) return;
  onboarding.completed.add(step);
  if (step === STEP_COUNT) {
    onboarding.complete = true;
    const incomeEl = $("income");
    if (incomeEl.dataset.legacyMonthly === "1") {
      delete incomeEl.dataset.legacyMonthly;
    }
    renderOnboardingUi();
    refresh();
    $("results-heading")?.focus?.();
    $("plan-results")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    return;
  }
  openStep(step + 1);
  refresh();
}

function refresh() {
  const invalid = [...document.querySelectorAll('#calculator input[type="number"]')].filter(
    (input) => input.value !== "" && !input.validity.valid
  );
  const inputWarning = $("input-warning");
  inputWarning.hidden = invalid.length === 0;
  inputWarning.textContent = invalid.length
    ? "Use zero or positive amounts. Fix the highlighted fields before relying on this estimate."
    : "";

  updateIncomeMonthlyDisplay();
  renderOnboardingUi();

  const state = readFormState();
  if (!onboarding.complete) {
    saveToStorage();
    return;
  }

  let plan = computePlan(planInputFromState(state));
  const monthlyIncome = parseAmount(monthlyIncomeForPlan(state));
  const essentialsAmt = parseAmount(state.essentials);
  const readyForPlan =
    monthlyIncome !== null && essentialsAmt !== null && essentialsAmt > 0;
  document.querySelector(".plan-board")?.classList.toggle("is-empty", !readyForPlan);
  document.querySelector(".scenario-panel")?.classList.toggle("is-empty", !readyForPlan);
  const scenarioEmpty = $("scenario-empty");
  if (scenarioEmpty) scenarioEmpty.hidden = readyForPlan;

  const surplusEl = $("surplus-value");
  surplusEl.classList.toggle("deficit", plan.deficit);
  setText(surplusEl, formatMoney(plan.surplus));
  setText(
    $("surplus-hint"),
    plan.deficit
      ? "Negative means your minimum obligations exceed income after essentials and wants."
      : "Unallocated monthly surplus after essentials, wants, and debt minimums."
  );

  const slider = $("emergency-slider");
  const maxSurplus = Math.max(0, plan.surplus);
  slider.max = String(maxSurplus);
  slider.disabled = maxSurplus <= 0;
  if (!slider.dataset.userSet) {
    slider.value = String(maxSurplus);
  } else if (Number(slider.value) > maxSurplus) {
    slider.value = String(maxSurplus);
  }
  setText($("emergency-slider-label"), formatMoney(Number(slider.value)));

  const wantsSlider = $("wants-cut-slider");
  wantsSlider.max = String(Math.max(0, plan.wants));
  if (Number(wantsSlider.value) > plan.wants) wantsSlider.value = String(plan.wants);
  setText($("wants-cut-label"), formatMoney(Number(wantsSlider.value)));

  plan = computePlan({
    ...planInputFromState(state),
    emergencyContribution: slider.value,
    wantsCutScenario: wantsSlider.value,
  });

  setText($("six-month-target"), formatMoney(plan.sixMonthGoal));
  setText($("starter-target"), formatMoney(plan.starterGoal));
  renderRunwayVisual(plan);
  setText($("starter-pct"), `${Math.round(plan.starterProgress)}%`);
  setText($("six-pct"), `${Math.round(plan.sixMonthProgress)}%`);
  $("starter-bar").style.width = `${plan.starterProgress}%`;
  $("six-bar").style.width = `${plan.sixMonthProgress}%`;

  setText($("debt-total"), formatMoney(plan.totalDebt));
  setText($("debt-apr"), plan.highestApr ? `${plan.highestApr}%` : "...");
  setText($("safe-to-spend"), formatMoney(plan.safeToSpend));
  setText($("next-action"), plan.nextAction);
  setText($("stage-label"), stageLabel(plan.stage));

  setText($("months-current"), formatMonths(plan.monthsToSixMonth));
  setText($("months-scenario"), formatMonths(plan.scenario.monthsToSixMonth));
  setText($("scenario-surplus"), formatMoney(plan.scenario.surplus));

  renderDebtList(plan);
  saveToStorage();
}

function stageLabel(stage) {
  const map = {
    setup: "Getting oriented",
    starter: "Starter cushion",
    debt: "Attack expensive debt",
    reserve: "Fill the reserve",
    complete: "Reserve complete",
  };
  return map[stage] ?? stage;
}

function renderRunwayVisual(plan) {
  const segments = [...document.querySelectorAll("#runway-segments .runway-segment")];
  const filledDisplay = $("runway-filled-display");
  const runwayDetail = $("runway");
  const essentials = plan.essentials;
  const months = plan.runwayMonths;

  let fullMonths = 0;
  let partial = 0;
  let displayMonths = 0;

  if (essentials > 0 && months !== null && Number.isFinite(months)) {
    const capped = Math.min(6, Math.max(0, months));
    fullMonths = Math.floor(capped);
    partial = capped - fullMonths;
    displayMonths = fullMonths;
  }

  segments.forEach((seg, index) => {
    seg.classList.remove("filled", "partial");
    seg.style.removeProperty("--partial");
    if (index < fullMonths) {
      seg.classList.add("filled");
    } else if (index === fullMonths && partial > 0) {
      seg.classList.add("partial");
      seg.style.setProperty("--partial", String(partial));
    }
  });

  if (filledDisplay) {
    filledDisplay.textContent = String(displayMonths).padStart(2, "0");
  }

  if (runwayDetail) {
    if (essentials <= 0 || parseAmount($("essentials")?.value) === null) {
      runwayDetail.textContent = "Enter essentials to measure runway";
    } else if (months === null) {
      runwayDetail.textContent = "Add savings to start the clock";
    } else {
      runwayDetail.textContent = `${months.toFixed(1)} months of essentials in accessible cash`;
    }
  }
}

function bindOnboardingEvents() {
  document.querySelectorAll(".step-continue").forEach((btn) => {
    btn.addEventListener("click", () => {
      completeStep(Number(btn.dataset.step));
    });
  });

  document.querySelectorAll(".step-back").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = Number(btn.dataset.step);
      onboarding.completed.delete(step);
      onboarding.complete = false;
      openStep(step - 1);
    });
  });

  document.querySelectorAll(".step-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const shell = toggle.closest(".step-shell");
      const step = Number(shell?.parentElement?.dataset.step);
      if (!step || toggle.disabled) return;
      if (onboarding.completed.has(step)) {
        openStep(step, { editing: true });
      }
    });
  });

  document.querySelectorAll(".debt-choice-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setHasDebtChoice(btn.dataset.debtChoice === "yes");
      refresh();
    });
  });
}

function bindEvents() {
  document.querySelector("#calculator").addEventListener("input", (e) => {
    if (e.target.id === "income" && e.target.dataset.legacyMonthly === "1") {
      delete e.target.dataset.legacyMonthly;
    }
    refresh();
  });
  document.querySelector("#calculator").addEventListener("change", (e) => {
    if (
      e.target.id === "income-pay-period" &&
      $("income").dataset.legacyMonthly === "1"
    ) {
      delete $("income").dataset.legacyMonthly;
    }
    refresh();
  });

  $("add-debt")?.addEventListener("click", () => {
    addDebtRow();
    refresh();
  });

  $("load-demo").addEventListener("click", () => {
    resetOnboardingState();
    applyFormState(demoInput());
    onboarding.complete = true;
    onboarding.completed = new Set([1, 2, 3, 4, 5]);
    refresh();
  });

  $("export-json").addEventListener("click", exportJson);
  $("clear-data").addEventListener("click", clearStorage);

  $("emergency-slider").addEventListener("input", (e) => {
    e.target.dataset.userSet = "1";
    refresh();
  });
  $("wants-cut-slider").addEventListener("input", refresh);

  bindOnboardingEvents();
}

export function initApp() {
  bindEvents();
  if (!loadFromStorage()) {
    resetOnboardingState();
    applyFormState({
      income: "",
      incomePayPeriod: "monthly",
      incomeLegacyMonthly: false,
      essentials: "",
      wants: "",
      currentSavings: "",
      starterGoal: 1000,
      hasDebt: null,
      debtMethod: "avalanche",
      emergencyContribution: "0",
      wantsCutScenario: "0",
      debts: [],
      onboardingComplete: false,
      onboardingCompletedSteps: [],
    });
    setHasDebtChoice(null);
  }
  refresh();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initApp);
}
