# BudgetBuddy

**Created by [@jmsgnnr](https://github.com/jmsgnnr).**

A free, standalone, browser-only field guide to financial stability. **Five short questions, one at a time:** how much you take home, what necessities cost, what you spend for fun, whether you have debt, and your emergency cash savings. BudgetBuddy then shows a clear next move and a six-month savings runway. No bank login required.

The questions unfold as a keyboard-accessible accordion. Completed answers become editable summaries. Pay frequency supports weekly, biweekly, twice monthly, monthly, and yearly income, with a consistent monthly equivalent. Existing saved plans are migrated in the browser. See [the guided onboarding brief](docs/GUIDED_ONBOARDING_V2.md).

**Live app:** https://jmsgnnr.github.io/budgetbuddy/

## What it does

- Calculate monthly take-home surplus after essential expenses, discretionary spending and minimum debt payments.
- Track the first $500–$1,000 emergency buffer and a longer-term cash reserve target of **six months of essential living expenses**.
- See current savings runway (six bold month segments), outstanding debt and debt payoff order (avalanche vs snowball).
- Compare optional spending reductions and approximate emergency-savings timelines.
- Save data **in this browser only**, export a JSON backup or erase it with confirmation.
- Try clearly fictional demo numbers without entering any personal financial data.

There are **no bank connections, accounts, finance APIs, third-party analytics, or transmitted budget entries**. The public website itself is served by GitHub Pages. Do not use this app on shared devices if you cannot control browser localStorage; downloaded JSON backups contain entered data.

## Important limitations

The six-month cash reserve estimate uses the *essential living expenses you enter*. Separately entered required debt minimums are **not automatically included in the six-month goal**. Add them to your essential-cost estimate if you want to plan for those payments continuing. Debt payoff time, inflation, emergencies and changes in income/expenses are not included in the simple savings timeline. Three to six months of expenses is a common planning range, but the right reserve depends on circumstances. This is an educational tool, not financial advice or a guaranteed outcome.

## Local development

Run a static file server (needed for ES modules) from this directory and open the displayed URL:

```bash
python -m http.server 8762
```

Tests use the built-in Node test runner and require no packages:

```bash
node --test tests/finance.test.mjs
node --check app.mjs
node --check finance.mjs
```

## Source and provenance

This repo contains **only the public standalone app**. It was exported from an approved MVP originally developed in a *separate private planning repository*. That private repository's original personal checklist, screenshots, internal roadmap and other notes are intentionally **not redistributed here**. This public source uses fictional demo figures.

Project by [@jmsgnnr](https://github.com/jmsgnnr). Contributions and bug reports welcome via GitHub issues.
