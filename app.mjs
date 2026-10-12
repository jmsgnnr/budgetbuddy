import {
  SCHEMA_VERSION,
  STARTER_OPTIONS,
  computePlan,
  demoInput,
  sanitizeLabel,
} from "./finance.mjs";

const STORAGE_KEY = "mubu-stability-planner-v1";

const els = {};

function $(id) {
  return document.getElementById(id);
}

function formatMoney(n) {
  if (!Number.isFinite(n)) return "—";
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

  return {
    income: $("income")?.value ?? "",
    essentials: $("essentials")?.value ?? "",
    wants: $("wants")?.value ?? "",
    currentSavings: $("current-savings")?.value ?? "",
    starterGoal: STARTER_OPTIONS.includes(starterGoal) ? starterGoal : 1000,
    debtMethod: $("debt-method")?.value === "snowball" ? "snowball" : "avalanche",
    emergencyContribution: surplusSlider?.value ?? "0",
    emergencyContributionUserSet: surplusSlider?.dataset.userSet === "1",
    wantsCutScenario: wantsCutSlider?.value ?? "0",
    debts: readDebtsFromDom(),
  };
}

function applyFormState(state) {
  $("income").value = state.income ?? "";
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

  $("emergency-slider").value = state.emergencyContribution ?? "0";
  if (state.emergencyContributionUserSet) $("emergency-slider").dataset.userSet = "1";
  else delete $("emergency-slider").dataset.userSet;
  $("wants-cut-slider").value = state.wantsCutScenario ?? "0";
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
      "Could not save to this browser’s storage. Your plan still works — export a backup if you want to keep it.";
  }
}

function loadFromStorage() {
  const banner = $("storage-banner");
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== SCHEMA_VERSION) return false;
    applyFormState(parsed.form ?? {});
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
  a.download = "mubu-stability-plan.json";
  a.click();
  URL.revokeObjectURL(a.href);
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
  applyFormState({
    income: "",
    essentials: "",
    wants: "",
    currentSavings: "",
    starterGoal: 1000,
    debtMethod: "avalanche",
    emergencyContribution: "0",
    wantsCutScenario: "0",
    debts: [],
  });
  refresh();
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function renderDebtList(plan) {
  const list = $("priority-debts");
  list.innerHTML = "";
  plan.priorityDebts.forEach((d, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${sanitizeLabel(d.label)} — ${formatMoney(d.balance)} at ${d.apr}% APR (min ${formatMoney(d.minimumPayment)})`;
    list.appendChild(li);
  });
  if (plan.priorityDebts.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No debts entered.";
    list.appendChild(li);
  }
}

function refresh() {
  const invalid = [...document.querySelectorAll('.plan-form input[type="number"]')].filter(
    input => input.value !== '' && !input.validity.valid
  );
  const inputWarning = $('input-warning');
  inputWarning.hidden = invalid.length === 0;
  inputWarning.textContent = invalid.length
    ? 'Use zero or positive amounts. Fix the highlighted fields before relying on this estimate.'
    : '';
  const state = readFormState();
  let plan = computePlan(state);

  const surplusEl = $("surplus-value");
  surplusEl.classList.toggle("deficit", plan.deficit);
  setText(surplusEl, formatMoney(plan.surplus));
  setText($("surplus-hint"), plan.deficit
    ? "Negative means your minimum obligations exceed income after essentials and wants."
    : "Unallocated monthly surplus after essentials, wants, and debt minimums.");

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

  // Recalculate after the slider defaults/limits have been applied so visible
  // contributions and goal dates never disagree on the initial render.
  plan = computePlan({ ...state,
    emergencyContribution: slider.value,
    wantsCutScenario: wantsSlider.value,
  });

  setText($("six-month-target"), formatMoney(plan.sixMonthGoal));
  setText($("starter-target"), formatMoney(plan.starterGoal));
  setText($("runway"), plan.runwayMonths === null
    ? "—"
    : `${plan.runwayMonths.toFixed(1)} mo`);
  setText($("starter-pct"), `${Math.round(plan.starterProgress)}%`);
  setText($("six-pct"), `${Math.round(plan.sixMonthProgress)}%`);
  $("starter-bar").style.width = `${plan.starterProgress}%`;
  $("six-bar").style.width = `${plan.sixMonthProgress}%`;

  setText($("debt-total"), formatMoney(plan.totalDebt));
  setText($("debt-apr"), plan.highestApr ? `${plan.highestApr}%` : "—");
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
    setup: "Getting started",
    starter: "Stage 1 — Starter buffer",
    debt: "Stage 2 — Debt payoff",
    reserve: "Stage 3 — Six-month reserve",
    complete: "Goals met (cash reserve)",
  };
  return map[stage] ?? stage;
}

function bindEvents() {
  document.querySelector(".plan-form").addEventListener("input", refresh);
  document.querySelector(".plan-form").addEventListener("change", refresh);

  $("add-debt").addEventListener("click", () => {
    addDebtRow();
    refresh();
  });

  $("load-demo").addEventListener("click", () => {
    applyFormState(demoInput());
    refresh();
  });

  $("export-json").addEventListener("click", exportJson);
  $("clear-data").addEventListener("click", clearStorage);

  $("emergency-slider").addEventListener("input", (e) => {
    e.target.dataset.userSet = "1";
    refresh();
  });
  $("wants-cut-slider").addEventListener("input", refresh);
}

export function initApp() {
  els.root = document.documentElement;
  bindEvents();
  if (!loadFromStorage()) {
    applyFormState({
      income: "",
      essentials: "",
      wants: "",
      currentSavings: "",
      starterGoal: 1000,
      debtMethod: "avalanche",
      emergencyContribution: "0",
      wantsCutScenario: "0",
      debts: [],
    });
  }
  refresh();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initApp);
}
