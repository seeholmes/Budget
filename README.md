# Budget

A small browser/PWA family budget tracker.

## Workflow

Use the document toolbar in the header for the normal file workflow:

- New starts a blank budget after warning about unsaved changes.
- Open loads an existing `.json` budget file.
- Save writes back to the current file when the browser supports file handles; otherwise it downloads the budget file.

The header shows the current file name and marks it as Unsaved after any budget edit. On smaller screens, the same file actions are available from the File button. The app warns before closing the browser tab with unsaved changes and before New or Open would discard edits.

Household names and income are edited directly in the Papa and Mama Dashboard cards. The Pay tab stores one shared biweekly payday and a separate net paycheck for each person, then derives average monthly income automatically. A recurring actual transfer amount and direction can be entered for every payday. Each pay period counts that transfer as incoming for the receiver and outgoing for the sender. The Dashboard keeps its calculated monthly transfer as guidance.

The Pay tab has a remembered Papa/Mama selector and shows one personal ledger at a time. The current period opens by default, future periods stay collapsed, and all periods can be expanded or collapsed together. Expanded desktop ledgers use a transaction table with a running balance; mobile keeps the compact stacked transaction view.

Bills are managed on the Bills tab. Subscriptions are managed on the Subscriptions tab, and every expense is assigned to the person responsible for paying it. Weekly items use the actual weekly payment and a weekday, then appear on that day in every pay-period ledger; monthly and annual equivalents are derived automatically. Annual items use the actual payment amount and appear in the responsible person's ledger and the annual look-ahead. The header includes a saved light/dark mode toggle.

At desktop widths the app uses persistent side navigation, denser expense tables, and a right-side expense editor. Smaller screens retain the bottom navigation and stacked lists.

## Data Compatibility

Version 5 adds weekly expenses with a selected weekday. It also stores a shared biweekly pay schedule, separate paycheck amounts, the recurring payday transfer, and a person on every bill or subscription. Weekly and yearly expenses store the actual transaction amount while monthly summaries derive the monthly equivalent.

Older app data and backup files are migrated when loaded. Version 2 yearly averages are converted back to annual payments. Existing subscriptions without a person are kept as `unassigned` until Papa or Mama is selected, and older files with separate `bills` and `subscriptions` arrays remain supported. Existing local `budget_v1` browser data is also recovered on first launch and marked unsaved so it can be saved into the new file workflow.

## Verification

Run the workflow verifier from the project root:

```bash
node verify-workflow.js
```

It checks legacy and annual-payment migration, weekly recurrences, recurring transfers, pay-period calculations, person-filtered collapsible ledgers, responsive shell markup, single-source serialization, dirty-state warnings, Open, Save, save fallback, and close-warning behavior.
