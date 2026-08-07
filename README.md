# Oink

A small browser/PWA household budget and cash-flow tracker.

## Workflow

Use the document toolbar in the header for the normal file workflow:

- New starts a blank budget after warning about unsaved changes.
- Open loads an existing `.json` budget file.
- Save writes back to the current file when the browser supports file handles; otherwise it downloads the budget file.

The header shows the current file name and marks it as Unsaved after any budget edit. On smaller screens, the same file actions are available from the File button. The app warns before closing the browser tab with unsaved changes and before New or Open would discard edits.

The installed mobile app uses a network-first app shell so launches pick up the current GitHub Pages release instead of remaining on Safari's cached HTML. The latest successful shell remains available as an offline fallback.

Household names and income are edited directly in the Papa and Mama Overview cards. The Cash Flow tab stores a separate known biweekly payday and net paycheck for each person, then derives each average monthly income automatically. A recurring actual transfer amount and direction can be entered for every sender payday. The transfer appears as outgoing for the sender and incoming for the receiver on that actual date, even when their pay periods differ. The Overview keeps its calculated monthly transfer as guidance and shows its equivalent every-payday amount using `monthly x 12 / 26`.

The Cash Flow tab has remembered Papa/Mama and 3-month/6-month/1-year selectors, and shows one personal ledger at a time. Pay periods are grouped by payday month, with three-paycheck months highlighted. Each month heading reconciles calendar-month incoming, outgoing, and net amounts, smoothing the timing differences between individual biweekly ledgers. Month headings can collapse every paycheck in that month while keeping the reconciliation visible, and each visible pay period can still be collapsed independently. The toolbar's Expand all and Collapse all actions control both levels. The current period opens by default and future pay periods stay collapsed. Expanded desktop ledgers use a transaction table with a running balance; mobile keeps the compact stacked transaction view.

Bills are managed on the Bills tab. Subscriptions are managed on the Subscriptions tab, and every expense is assigned to the person responsible for paying it. Weekly items use the actual weekly payment and a weekday, then appear on that day in every pay-period ledger; monthly and annual equivalents are derived automatically. Annual items use the actual payment amount and appear in the responsible person's ledger and the annual look-ahead. The header includes a saved light/dark mode toggle.

At desktop widths the app uses persistent side navigation, denser expense tables, and a right-side expense editor. Smaller screens retain the bottom navigation and stacked lists.

The visual system uses a warm ivory canvas, forest-green navigation and actions, muted coral expense accents, and serif display type for page headings and key totals. Oink's gold-coin piggy bank with growth bars serves as the app, favicon, sidebar, and mobile-header mark, paired with a consistent outline icon set for navigation and commands. Dense tables, controls, and transaction data remain in a compact sans-serif style. Papa and Mama Overview cards stack on phone-sized screens to keep amounts readable.

## Data Compatibility

Version 6 stores separate biweekly payday anchors for Papa and Mama. Version 5's shared payday is copied into both schedules when an older budget is loaded, preserving the existing ledger dates until either one is changed.

Version 5 adds weekly expenses with a selected weekday. It also stores separate paycheck amounts, the recurring payday transfer, and a person on every bill or subscription. Weekly and yearly expenses store the actual transaction amount while monthly summaries derive the monthly equivalent.

Older app data and backup files are migrated when loaded. Version 2 yearly averages are converted back to annual payments. Existing subscriptions without a person are kept as `unassigned` until Papa or Mama is selected, and older files with separate `bills` and `subscriptions` arrays remain supported. Existing local `budget_v1` browser data is also recovered on first launch and marked unsaved so it can be saved into the new file workflow.

## Verification

Run the workflow verifier from the project root:

```bash
node verify-workflow.js
```

It checks legacy and annual-payment migration, weekly recurrences, recurring transfers, pay-period calculations, person-filtered collapsible ledgers, responsive shell markup, single-source serialization, dirty-state warnings, Open, Save, save fallback, and close-warning behavior.
