# Budget

A small browser/PWA family budget tracker.

## Workflow

Use the document toolbar in the header for the normal file workflow:

- New starts a blank budget after warning about unsaved changes.
- Open loads an existing `.json` budget file.
- Save writes back to the current file when the browser supports file handles; otherwise it downloads the budget file.

The header shows the current file name and marks it as Unsaved after any budget edit. On smaller screens, the same file actions are available from the File button. The app warns before closing the browser tab with unsaved changes and before New or Open would discard edits.

Household names and monthly net income are edited directly in the Papa and Mama Dashboard cards. Bills are managed on the Bills tab. Subscriptions are managed on the Subscriptions tab. The header includes a saved light/dark mode toggle.

## Data Compatibility

Version 2 stores budget items once in a single `expenses` array with a `type` of `bill` or `subscription`.

Older app data and older backup files with separate `bills` and `subscriptions` arrays are migrated when loaded. Existing local `budget_v1` browser data is also recovered on first launch and marked unsaved so it can be saved into the new file workflow.

## Verification

Run the workflow verifier from the project root:

```bash
node verify-workflow.js
```

It checks legacy migration, single-source serialization, dirty-state warnings, Open, Save, save fallback, and close-warning behavior.
