# Budget

A small browser/PWA family budget tracker.

## Workflow

Use the document toolbar in the header for the normal file workflow:

- New starts a blank budget after warning about unsaved changes.
- Open loads an existing `.json` budget file.
- Save writes back to the current file when the browser supports file handles; otherwise it downloads the budget file.

The header shows the current file name and marks it as Unsaved after any budget edit. On smaller screens, the same file actions are available from the File button. The app warns before closing the browser tab with unsaved changes and before New or Open would discard edits.

Household names and income are edited directly in the Papa and Mama Dashboard cards. The Pay tab stores one shared biweekly payday and a separate net paycheck for each person, then derives average monthly income automatically. Each pay period shows independent incoming, outgoing, and remaining totals for Papa and Mama, followed by a suggested balancing transfer.

Bills are managed on the Bills tab. Subscriptions are managed on the Subscriptions tab, and every expense is assigned to the person responsible for paying it. Annual items use the actual payment amount and appear in both pay-period ledgers and the annual look-ahead. The header includes a saved light/dark mode toggle.

## Data Compatibility

Version 3 stores a shared biweekly pay schedule, separate paycheck amounts, and a person on every bill or subscription. Yearly expenses store the actual annual payment while monthly summaries derive the monthly equivalent.

Older app data and backup files are migrated when loaded. Version 2 yearly averages are converted back to annual payments. Existing subscriptions without a person are kept as `unassigned` until Papa or Mama is selected, and older files with separate `bills` and `subscriptions` arrays remain supported. Existing local `budget_v1` browser data is also recovered on first launch and marked unsaved so it can be saved into the new file workflow.

## Verification

Run the workflow verifier from the project root:

```bash
node verify-workflow.js
```

It checks legacy and annual-payment migration, pay-period calculations, separate ledgers, single-source serialization, dirty-state warnings, Open, Save, save fallback, and close-warning behavior.
