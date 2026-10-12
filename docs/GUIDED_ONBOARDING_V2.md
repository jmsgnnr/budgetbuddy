# BudgetBuddy: Guided Onboarding v2
Created by [@jmsgnnr](https://github.com/jmsgnnr)
Status: scoped implementation branch `feature/guided-onboarding-v2`

## Design principle
The current site has a distinct visual identity but asks too much at once. Preserve the ink/bone/chartreuse pocket-field-guide design. Replace the long dashboard and form page with a **guided accordion**. One clear question group is open at a time. Completed steps collapse to readable one-line summaries with Edit buttons; future steps stay inaccessible until prior answers are intentionally completed. Final plan is the reward, not the first thing shown.

## Required flow and acceptance

**1. Income**: "How much actually lands in your account?" One take-home pay amount, selector for weekly, every 2 weeks, twice monthly, monthly, yearly. Display monthly equivalent. Conversions: amount×52/12, ×26/12, ×2, ×1, ÷12 respectively. Note take-home after taxes. Both 0 and positive numbers are valid; blank/negative/invalid cannot continue. Legacy saved income must restore as monthly and must not be double-converted.

**2. Necessities**: "What does it cost to keep life running?" Monthly total for rent, groceries, utilities, transportation, insurance and essentials. A single amount and short example list; no compulsory itemized budget. $0 allowed but zero essentials cannot show a meaningful six-month runway.

**3. Fun money**: "How much goes toward everything else?" Single monthly amount for dining, subscriptions, shopping, trips and hobbies. $0 valid. No shame or moral language.

**4. Debt**: "Any debt to work around?" Visibly selectable **Yes / No** buttons (keyboard accessible). No skips debt fields and counts no debt in calculations, without erasing saved entries unless user explicitly removes them. Yes expands add/remove rows for label/balance/APR/minimum, and method avalanche/snowball. No requirement to enter debt details if user chooses No. Summaries reflect current effective debt only; changing back to Yes should restore typed data.

**5. Emergency savings**: "How much do you already have set aside?" One cash savings input and starter cushion $500 or $1,000; $0 valid. State this is accessible cash, not investments.

**Outcome: Your plan**: Only after all five groups complete: the existing six-segment months-of-expenses meter, monthly surplus or deficit, one useful next action, starter goal and six-month target, timeline with qualifications. Debt order and scenario sliders as subordinate disclosures. The financial fine print, demo, export and erase controls remain easy to find. Keep `@jmsgnnr` visible.

## UX, data and safety
- Each step has an editable collapsed summary. A single Continue button advances, a Back button reverses, focus moves to the next heading. The progress indicator reflects actual completion (01 of 05 etc.). No decorative progress percentages or giant preview dashboard before input.
- Use buttons/semantics with aria-expanded and aria-controls or accessible details. Keyboard, screen reader, high contrast, reduced-motion and mobile 390px must work. Hidden fields must not be included as required in native form validation.
- Keep original important element IDs or adjust tests with clear rationale: `income`, `essentials`, `wants`, `current-savings`, `debt-list`, `debt-method`, `load-demo`, `emergency-slider`, `wants-cut-slider`, `stage-label`, `surplus-value`, `runway-segments`, `next-action`, `clear-data`, `export-json`.
- Reuse `finance.mjs` engine. Introduce a pure `monthlyFromPayPeriod` helper and tests. Feed normalized monthly income into computePlan and do not normalize twice after storage. Preserve `mubu-stability-planner-v1` localStorage key and migrate older snapshots without data loss. No bank integration, analytics, accounts, third-party fonts or data requests. Keep fictional demo and manual erase confirmation.
- Don't silently display debt when No was chosen. Avoid storing or publishing private user budgets. This is an educational calculator; six-month reserve excludes separately entered debt minimums unless explicitly folded into essentials.
- Keep existing **19** Node unit tests passing, add cadence math tests and validation tests. Run browser smoke tests of blank, No-debt, Yes-debt, back/edit, saves/reloads, demo, results, reset and mobile/desktop.
- User requested direction and agent handoff. This feature branch must be **local only until the lead independently accepts**; no push, PR, merge or public deployment by the implementing agent. No other repo modifications, no extra AI agents, no package installs unless strictly needed. Don't modify the private original `budget-mu` repo.
- Return file changes, tests run, known limitations and any design risk. Prefer concrete implementation over further planning. No em dash (—) in new public UI copy.

## Preferred layout
Desktop: compact title and start prompt, vertical numbered step rail with active question card, optional sticky miniature progress only if it doesn't crowd. Mobile: one big question and clear input without scrolling. Deliberate editorial type, tactile tab borders, one highlight color. Existing graphic six-month runway migrates into the results section. No generic finance SaaS cards.
