const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const iconSvg = fs.readFileSync('icon.svg', 'utf8');
const serviceWorker = fs.readFileSync('sw.js', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\nrender\(\);\s*$/, '');

function pngDimensions(path) {
  const buffer = fs.readFileSync(path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function createHarness(options = {}) {
  const storage = new Map(Object.entries(options.storage || {}));
  const downloads = [];
  const writes = [];
  const alerts = [];
  const confirms = [...(options.confirms || [])];
  const listeners = {};
  const elements = new Map();

  const makeElement = id => ({
    id,
    hidden: true,
    textContent: '',
    value: '',
    style: {},
    dataset: {},
    classList: {
      values: new Set(),
      toggle(name, force) {
        if (force) this.values.add(name);
        else this.values.delete(name);
      },
      contains(name) {
        return this.values.has(name);
      },
    },
    setAttribute(name, value) {
      this[name] = String(value);
    },
    getAttribute(name) {
      return this[name] == null ? null : this[name];
    },
    appendChild(child) {
      child.parentNode = this;
    },
    removeChild(child) {
      if (child.parentNode === this) child.parentNode = null;
    },
    click() {
      this.clicked = true;
      if (this.download) downloads.push({ download: this.download, href: this.href });
    },
  });

  const body = makeElement('body');
  const document = {
    body,
    documentElement: makeElement('html'),
    createElement(tag) {
      const element = makeElement(tag);
      element.tagName = tag.toUpperCase();
      return element;
    },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    },
  };

  const context = {
    console,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    window: {
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
    },
    document,
    confirm(message) {
      context.lastConfirm = message;
      return confirms.length ? confirms.shift() : true;
    },
    alert(message) {
      alerts.push(message);
    },
    Blob: function Blob(parts, options) {
      this.parts = parts;
      this.type = options && options.type;
    },
    URL: {
      createObjectURL() {
        return 'blob:budget';
      },
      revokeObjectURL() {},
    },
    Date,
    JSON,
    Number,
    String,
    Object,
    Array,
    Math,
    RegExp,
    Set,
    Promise,
    parseFloat,
    parseInt,
    isNaN,
  };

  vm.createContext(context);
  vm.runInContext(script, context);

  context.__harness = { storage, downloads, writes, alerts, listeners, elements };
  context.makeFile = (name, value) => ({
    name,
    async text() {
      return JSON.stringify(value);
    },
  });
  context.makeHandle = name => ({
    name,
    async createWritable() {
      return {
        async write(value) {
          writes.push({ name, value });
        },
        async close() {},
      };
    },
  });

  return context;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  assert(!html.includes('data-tab="settings"'), 'Settings tab should not be present in the main navigation.');
  assert(!html.includes('renderSettings'), 'Settings renderer should be removed after moving income to Dashboard.');
  assert(!html.includes('>Save As<'), 'Save As should not be exposed as a separate command.');
  assert(!html.includes('saveBudgetAs'), 'Save As handler should not remain as a public workflow.');
  assert(html.includes('person-income-input'), 'Dashboard summary cards should expose household income entry.');
  assert(html.includes('theme-btn'), 'Header should include the light/dark theme toggle.');
  assert(html.includes('class="brand-logo"') && html.includes('href="#brand-mark"'), 'The app shell should use the inline piggy-bank vector mark.');
  assert(html.includes('href="#icon-home"') && html.includes('href="#icon-save"'), 'Navigation and file actions should use the shared outline icon set.');
  assert(iconSvg.includes('id="gold"') && iconSvg.includes('id="bars"'), 'The vector app mark should contain the gold coin and growth bars.');
  assert(!iconSvg.includes('<filter') && !iconSvg.includes('filter='), 'The app mark should avoid filters that rasterize softly on mobile Safari.');
  assert(JSON.stringify(manifest).includes('#173d2d') && manifest.name === 'Budget - Family Finances', 'The PWA manifest should match the updated brand.');
  assert(pngDimensions('icon-192.png').width === 192 && pngDimensions('icon-512.png').width === 512, 'PWA icons should be rendered at their declared sizes.');
  assert(html.includes('data-tab="pay"'), 'Navigation should include the Pay Periods tab.');
  assert(html.includes('renderPayPeriods'), 'Pay Periods should have a dedicated renderer.');
  assert(html.includes('class="sidebar"') && html.includes('class="workspace"'), 'The responsive app shell should include a desktop sidebar and workspace.');
  assert(html.includes('--bg: #f6f1e7') && html.includes('--sidebar-bg: #173d2d'), 'The light theme should use the warm editorial palette.');
  assert(html.includes('font-family: var(--display-font)') && html.includes('household-summary'), 'The dashboard should include editorial display type and the emphasized household summary.');
  assert(html.includes('.summary-row { grid-template-columns: 1fr; }'), 'Phone layouts should stack the two household member cards.');
  assert(html.includes('min-width: 0; max-width: 100%;'), 'Form controls should stay inside narrow mobile grid columns.');
  assert(html.includes('.form-input[type="date"] { padding-left: 0; padding-right: 0; }'), 'Date controls should avoid the iOS width-plus-padding overflow bug.');
  assert(html.includes('.pay-person-fields { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(120px, 1fr); gap: 10px; }'), 'Payday and transfer fields should use matching mobile column geometry.');
  assert(html.includes('ledger-table'), 'Expanded desktop ledgers should include a transaction table.');
  assert(html.includes('grid-template-columns: minmax(180px, 1fr) 330px 18px;'), 'Desktop period headers should reserve stable columns for summary totals.');
  assert(!html.includes('.period-head-summary { display: none; }'), 'Phone layouts should keep collapsed period summaries visible.');
  assert(html.includes('.pay-month-head { grid-template-columns: minmax(0, 1fr) 18px; align-items: center; gap: 8px; }'), 'Phone layouts should stack monthly reconciliation beneath the month label while reserving the month chevron.');
  assert(html.includes('expense-table-head'), 'Desktop expense lists should include table headers.');
  assert(html.includes('updatePayTransfer'), 'Pay setup should expose the recurring actual transfer.');
  assert(html.includes("navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })"), 'The app should register its updater without reusing a stale worker script.');
  assert(serviceWorker.includes("fetch(request, { cache: 'no-store' })"), 'The app updater should request the current shell before using its offline cache.');
  assert(serviceWorker.includes("request.mode === 'navigate'"), 'The app updater should retain an offline navigation fallback.');
  assert(html.includes('<option value="weekly"'), 'Expense frequency should include Weekly.');

  const legacy = {
    names: { papa: 'A', mama: 'B' },
    income: { papa: 6000, mama: 5000 },
    bills: [{ id: 99, name: 'Mortgage', amount: 2200, dueDay: 1, person: 'papa', freq: 'monthly', cat: 'housing' }],
    subscriptions: [{ id: 7, name: 'Music', amount: 12, dueDay: 9, freq: 'monthly', cat: 'media' }],
  };

  const migration = createHarness();
  vm.runInContext(`data = normalizeBudget(${JSON.stringify(legacy)});`, migration);
  const saved = JSON.parse(vm.runInContext('serializeBudget()', migration));
  assert(Array.isArray(saved.expenses), 'Serialized v2 budget should contain expenses.');
  assert(saved.expenses.length === 2, 'Legacy bills/subscriptions should migrate into expenses.');
  assert(!Object.hasOwn(saved, 'bills'), 'Serialized v2 budget should not contain bills.');
  assert(!Object.hasOwn(saved, 'subscriptions'), 'Serialized v2 budget should not contain subscriptions.');
  assert(saved.expenses.map(item => item.type).join(',') === 'bill,subscription', 'Migrated expenses should keep item types.');
  assert(saved.schemaVersion === 6, 'Serialized budgets should use schema version 6.');
  assert(saved.paySchedule.transfer.amount === 0, 'Older budgets should default to no recorded payday transfer.');
  assert(saved.expenses[1].person === 'unassigned', 'Legacy subscriptions should be preserved for explicit person assignment.');

  const annualMigration = createHarness();
  vm.runInContext(`data = normalizeBudget({
    schemaVersion: 2,
    expenses: [{ id: 1, type: 'bill', name: 'Insurance', amount: 100, dueDay: 15, dueMonth: 8, person: 'papa', freq: 'yearly', cat: 'insurance' }]
  });`, annualMigration);
  assert(vm.runInContext('data.expenses[0].amount', annualMigration) === 1200, 'Version 2 yearly averages should migrate to actual annual payments.');
  assert(vm.runInContext('monthlyEquiv(data.expenses[0])', annualMigration) === 100, 'Migrated annual payments should retain their monthly equivalent.');
  const migratedAnnualSave = JSON.parse(vm.runInContext('serializeBudget()', annualMigration));
  vm.runInContext(`data = normalizeBudget(${JSON.stringify(migratedAnnualSave)});`, annualMigration);
  assert(vm.runInContext('data.expenses[0].amount', annualMigration) === 1200, 'Saved annual payments should not be converted twice.');

  const currentAnnual = createHarness();
  vm.runInContext(`data = normalizeBudget({
    schemaVersion: 3,
    expenses: [{ id: 1, type: 'subscription', name: 'Software', amount: 240, dueDay: 1, dueMonth: 9, person: 'mama', freq: 'yearly', cat: 'tech' }]
  });`, currentAnnual);
  assert(vm.runInContext('data.expenses[0].amount', currentAnnual) === 240, 'Version 3 annual payments should not be multiplied again.');
  assert(vm.runInContext('data.expenses[0].person', currentAnnual) === 'mama', 'Subscription responsibility should be preserved.');
  assert(vm.runInContext('data.paySchedule.transfer.amount', currentAnnual) === 0, 'Version 3 budgets should gain a zero transfer without changing totals.');

  const sharedPaydayMigration = createHarness();
  vm.runInContext(`data = normalizeBudget({
    schemaVersion: 5,
    paySchedule: {
      cadence: 'biweekly',
      anchorDate: '2026-08-07',
      paychecks: { papa: 2500, mama: 1800 },
      transfer: { from: 'papa', amount: 300 }
    }
  });`, sharedPaydayMigration);
  assert(vm.runInContext('data.paySchedule.anchorDates.papa', sharedPaydayMigration) === '2026-08-07', 'The shared payday should migrate to Papa.');
  assert(vm.runInContext('data.paySchedule.anchorDates.mama', sharedPaydayMigration) === '2026-08-07', 'The shared payday should migrate to Mama.');
  const migratedPaydaySave = JSON.parse(vm.runInContext('serializeBudget()', sharedPaydayMigration));
  assert(!Object.hasOwn(migratedPaydaySave.paySchedule, 'anchorDate'), 'Saved version 6 budgets should omit the legacy shared payday.');

  const formFlow = createHarness();
  const newBillForm = vm.runInContext('itemForm("bill", null)', formFlow);
  const yearlyBillForm = vm.runInContext('itemForm("bill", { id: 1, type: "bill", name: "Taxes", amount: 100, dueDay: 1, dueMonth: 4, person: "papa", freq: "yearly", cat: "misc" })', formFlow);
  const weeklyBillForm = vm.runInContext('itemForm("bill", { id: 2, type: "bill", name: "Loan2", amount: 100, dueDay: 0, weekday: 5, person: "papa", freq: "weekly", cat: "debt" })', formFlow);
  assert(newBillForm.includes('id="nb-duemonth-field" hidden'), 'Monthly bill form should hide the yearly-only due month field.');
  assert(yearlyBillForm.includes('id="eb-duemonth-field" >'), 'Yearly bill form should show the due month field.');
  assert(yearlyBillForm.includes('Annual payment'), 'Yearly forms should request the actual annual payment.');
  assert(weeklyBillForm.includes('Weekly payment'), 'Weekly forms should request the actual weekly payment.');
  assert(weeklyBillForm.includes('id="eb-dueday-field" hidden'), 'Weekly forms should hide the monthly due-day field.');
  assert(weeklyBillForm.includes('id="eb-weekday-field" >'), 'Weekly forms should show the weekday selector.');
  assert(weeklyBillForm.includes('<option value="5" selected>Friday</option>'), 'Weekly forms should preserve Friday as the payment day.');

  const periodFlow = createHarness();
  vm.runInContext(`data = normalizeBudget({
    schemaVersion: 6,
    names: { papa: 'Alex', mama: 'Sam' },
    income: { papa: 0, mama: 0 },
    paySchedule: {
      cadence: 'biweekly',
      anchorDates: { papa: '2026-08-07', mama: '2026-08-14' },
      paychecks: { papa: 2500, mama: 1800 },
      transfer: { from: 'papa', amount: 300 }
    },
    expenses: [
      { id: 1, type: 'bill', name: 'Mortgage', amount: 1000, dueDay: 10, person: 'papa', freq: 'monthly', cat: 'housing' },
      { id: 2, type: 'subscription', name: 'Annual Software', amount: 600, dueDay: 15, dueMonth: 8, person: 'mama', freq: 'yearly', cat: 'tech' },
      { id: 3, type: 'subscription', name: 'Undated', amount: 20, dueDay: 0, person: 'mama', freq: 'monthly', cat: 'media' },
      { id: 4, type: 'bill', name: 'Loan2', amount: 100, dueDay: 0, weekday: 5, person: 'papa', freq: 'weekly', cat: 'debt' }
    ]
  });`, periodFlow);
  assert(Math.abs(vm.runInContext('monthlyIncome("papa")', periodFlow) - (2500 * 26 / 12)) < 0.001, 'Biweekly paycheck should derive monthly average income.');
  assert(vm.runInContext('dateKey(payPeriodStarts("papa", 1, new Date(2026, 7, 12))[0])', periodFlow) === '2026-08-07', 'Papa payday should anchor Papa\'s current 14-day period.');
  assert(vm.runInContext('dateKey(payPeriodStarts("mama", 1, new Date(2026, 7, 15))[0])', periodFlow) === '2026-08-14', 'Mama payday should independently anchor Mama\'s current 14-day period.');
  assert(vm.runInContext('payPeriodCountForRange(12)', periodFlow) === 26, 'The one-year ledger range should contain 26 pay periods.');
  assert(vm.runInContext('paydaysInMonth("papa", new Date(2026, 9, 1)).length', periodFlow) === 3, 'October 2026 should be detected as a three-paycheck month for Papa.');
  assert(vm.runInContext('paydaysInMonth("papa", new Date(2026, 7, 1)).length', periodFlow) === 2, 'A normal month should not be marked as a three-paycheck month.');
  assert(vm.runInContext('expenseOccurrences("papa", parseLocalDate("2026-08-07"), parseLocalDate("2026-08-21")).filter(item => item.expense.name === "Loan2").length', periodFlow) === 2, 'A Friday weekly bill should occur twice in a biweekly period.');
  assert(vm.runInContext('ledgerForPeriod("papa", parseLocalDate("2026-08-07")).expenseOutgoing', periodFlow) === 1200, 'Papa ledger should include monthly and both weekly transactions in the period.');
  assert(vm.runInContext('ledgerForPeriod("papa", parseLocalDate("2026-08-07")).outgoing', periodFlow) === 1500, 'Papa outgoing should include expenses and the actual payday transfer.');
  assert(vm.runInContext('ledgerForPeriod("papa", parseLocalDate("2026-08-07")).transferOut', periodFlow) === 300, 'The sender should record the transfer as Money Out.');
  assert(vm.runInContext('ledgerForPeriod("mama", parseLocalDate("2026-08-14")).outgoing', periodFlow) === 600, 'Mama ledger should include Mama annual payments in the period.');
  assert(vm.runInContext('ledgerForPeriod("mama", parseLocalDate("2026-08-14")).income', periodFlow) === 2100, 'The receiver should include the transfer in Money In.');
  assert(vm.runInContext('ledgerForPeriod("mama", parseLocalDate("2026-08-14")).transferIn', periodFlow) === 300, 'The receiver should record the transfer as Money In.');
  assert(vm.runInContext('dateKey(ledgerForPeriod("mama", parseLocalDate("2026-08-14")).transferDates[0])', periodFlow) === '2026-08-21', 'The receiver should record the transfer on the sender\'s payday.');
  assert(vm.runInContext('ledgerForPeriod("mama", parseLocalDate("2026-08-14")).items.length', periodFlow) === 1, 'Undated monthly expenses should not be placed on an invented date.');
  assert(vm.runInContext('monthlyReconciliation("papa", parseLocalDate("2026-08-07")).income', periodFlow) === 5000, 'Papa monthly reconciliation should include both August paychecks.');
  assert(vm.runInContext('monthlyReconciliation("papa", parseLocalDate("2026-08-07")).outgoing', periodFlow) === 2000, 'Papa monthly reconciliation should include calendar-month expenses and both payday transfers.');
  assert(vm.runInContext('monthlyReconciliation("papa", parseLocalDate("2026-08-07")).net', periodFlow) === 3000, 'Papa monthly reconciliation should net the complete calendar month.');
  assert(vm.runInContext('monthlyReconciliation("mama", parseLocalDate("2026-08-07")).income', periodFlow) === 4200, 'Mama monthly reconciliation should include her paychecks and transfers on Papa\'s separate payday schedule.');
  assert(vm.runInContext('monthlyReconciliation("mama", parseLocalDate("2026-08-07")).outgoing', periodFlow) === 600, 'Mama monthly reconciliation should include annual expenses due during the month.');
  assert(vm.runInContext('monthlyReconciliation("mama", parseLocalDate("2026-10-01")).income', periodFlow) === 4500, 'A receiver with two paychecks should still reconcile all three transfers from a sender\'s three-paycheck month.');
  assert(vm.runInContext(`expenseOccursOn({ freq: 'monthly', dueDay: 31 }, new Date(2027, 1, 28))`, periodFlow), 'End-of-month expenses should clamp to the last calendar day.');
  assert(vm.runInContext(`expenseOccursOn({ freq: 'weekly', weekday: 5 }, new Date(2026, 7, 7))`, periodFlow), 'Weekly expenses should occur on the selected weekday.');
  assert(!vm.runInContext(`expenseOccursOn({ freq: 'weekly', weekday: 5 }, new Date(2026, 7, 8))`, periodFlow), 'Weekly expenses should not occur on other weekdays.');
  assert(Math.abs(vm.runInContext(`monthlyEquiv({ freq: 'weekly', amount: 100 })`, periodFlow) - (100 * 52 / 12)) < 0.001, 'Weekly payments should derive their monthly equivalent from 52 occurrences.');
  assert(Math.abs(vm.runInContext('monthlyToBiweekly(1300)', periodFlow) - 600) < 0.001, 'Monthly transfer guidance should convert to 26 equal biweekly payments.');
  assert(vm.runInContext('parseLocalDate("2026-02-31")', periodFlow) === null, 'Invalid calendar dates should not become pay schedule anchors.');
  const initialPayHtml = vm.runInContext('renderPayPeriods()', periodFlow);
  assert(initialPayHtml.includes('segment-btn papa active'), 'Pay Periods should default to Papa as the selected ledger.');
  assert(initialPayHtml.includes('onclick="setLedgerRange(3)"') && initialPayHtml.includes('3 Months'), 'Pay Periods should expose the remembered horizon control.');
  assert(initialPayHtml.includes('<section class="ledger papa">') && !initialPayHtml.includes('<section class="ledger mama">'), 'Pay Periods should render only the selected person ledger.');
  assert((initialPayHtml.match(/class="period-head"[^>]*aria-expanded="true"/g) || []).length === 1, 'Only the current pay period should be expanded initially.');
  assert(initialPayHtml.includes('period-title-row') && initialPayHtml.includes('<span class="period-badge">Current</span>'), 'The current marker should sit with the payday title.');
  assert(initialPayHtml.includes('period-head-summary') && initialPayHtml.includes('Incoming') && initialPayHtml.includes('Remaining'), 'Collapsed periods should include their three summary totals.');
  assert(initialPayHtml.includes('pay-month-summary') && initialPayHtml.includes('Monthly reconciliation') && initialPayHtml.includes('$3,000'), 'Month headings should show calendar-month incoming, outgoing, and net reconciliation.');
  assert(initialPayHtml.includes('class="pay-month-head') && initialPayHtml.includes('onclick="togglePayMonth('), 'Each month heading should control a second collapse level.');
  assert((initialPayHtml.match(/Known payday/g) || []).length === 2, 'Pay setup should show a known payday for each person.');
  assert(initialPayHtml.includes('value="2026-08-07"') && initialPayHtml.includes('value="2026-08-14"'), 'Pay setup should show each person\'s own payday.');
  assert(initialPayHtml.includes('Actual amount each sender payday'), 'Pay setup should label the recurring transfer amount clearly.');

  vm.runInContext('togglePayMonth(payMonthStateKey("papa", parseLocalDate("2026-08-07")))', periodFlow);
  const collapsedMonthHtml = vm.runInContext('renderPayPeriods()', periodFlow);
  assert(vm.runInContext('collapsedPayMonths.size', periodFlow) === 1, 'Collapsing a month should remember its state.');
  assert(collapsedMonthHtml.includes('August 2026') && collapsedMonthHtml.includes('Monthly reconciliation'), 'A collapsed month should retain its heading and reconciliation.');
  assert(!collapsedMonthHtml.includes('Payday Aug 7') && !collapsedMonthHtml.includes('Payday Aug 21'), 'A collapsed month should hide all of its pay-period cards.');
  vm.runInContext('togglePayMonth(payMonthStateKey("papa", parseLocalDate("2026-08-07")))', periodFlow);

  vm.runInContext('setAllPayPeriods(true)', periodFlow);
  const papaPayHtml = vm.runInContext('renderPayPeriods()', periodFlow);
  assert(papaPayHtml.includes('Transfer to Sam') && papaPayHtml.includes('-$300'), 'The sender ledger should show the actual payday transfer as Money Out.');
  assert((papaPayHtml.match(/Loan2/g) || []).length >= 2, 'Expanded Pay Periods should show both Friday Loan2 transactions.');
  assert((papaPayHtml.match(/class="period-head"[^>]*aria-expanded="true"/g) || []).length === 7, 'Expand all should open every displayed three-month period.');

  vm.runInContext('setLedgerPerson("mama")', periodFlow);
  vm.runInContext('setAllPayPeriods(true)', periodFlow);
  const mamaPayHtml = vm.runInContext('renderPayPeriods()', periodFlow);
  assert(mamaPayHtml.includes('<section class="ledger mama">') && !mamaPayHtml.includes('<section class="ledger papa">'), 'The ledger selector should switch to Mama without showing a combined view.');
  assert(mamaPayHtml.includes('Annual Software') && mamaPayHtml.includes('$600'), 'The selected ledger should surface actual annual charges.');
  assert(mamaPayHtml.includes('Transfer from Alex') && mamaPayHtml.includes('+$300'), 'The receiver ledger should show the actual payday transfer as Money In.');
  assert(periodFlow.__harness.storage.get('budget_ledger_person') === 'mama', 'The selected ledger person should be remembered locally.');

  vm.runInContext('setLedgerRange(12)', periodFlow);
  const yearPayHtml = vm.runInContext('renderPayPeriods()', periodFlow);
  assert((yearPayHtml.match(/class="period-card/g) || []).length === 26, 'The one-year view should render 26 collapsed pay periods.');
  assert(yearPayHtml.includes('three-paycheck') && yearPayHtml.includes('3 paychecks'), 'The one-year view should highlight three-paycheck month headings.');
  assert(periodFlow.__harness.storage.get('budget_ledger_range') === '12', 'The selected ledger horizon should be remembered locally.');

  vm.runInContext('setAllPayPeriods(false)', periodFlow);
  assert(vm.runInContext('expandedPayPeriods.size', periodFlow) === 0, 'Collapse all should close every pay period.');
  const collapsedAllPayHtml = vm.runInContext('renderPayPeriods()', periodFlow);
  assert(!collapsedAllPayHtml.includes('class="period-card'), 'Collapse all should also hide every month\'s pay-period cards.');
  assert((collapsedAllPayHtml.match(/class="pay-month-head[^>]*aria-expanded="false"/g) || []).length >= 12, 'Collapse all should close every displayed month while retaining its heading.');
  assert(collapsedAllPayHtml.includes('Monthly reconciliation'), 'Collapse all should keep monthly reconciliation summaries visible.');
  vm.runInContext('setAllPayPeriods(true)', periodFlow);
  const expandedAllPayHtml = vm.runInContext('renderPayPeriods()', periodFlow);
  assert((expandedAllPayHtml.match(/class="period-card/g) || []).length === 26, 'Expand all should restore every month and pay period in the one-year view.');
  assert((expandedAllPayHtml.match(/class="pay-month-head[^>]*aria-expanded="false"/g) || []).length === 0, 'Expand all should reopen every displayed month.');
  const homeGuidanceHtml = vm.runInContext('renderHome()', periodFlow);
  assert(homeGuidanceHtml.includes('Suggested/mo') && homeGuidanceHtml.includes('Suggested/payday'), 'Dashboard should show monthly and biweekly calculated transfer guidance.');
  const periodSaved = JSON.parse(vm.runInContext('serializeBudget()', periodFlow));
  assert(periodSaved.paySchedule.transfer.from === 'papa' && periodSaved.paySchedule.transfer.amount === 300, 'Actual transfer settings should be saved with the budget.');
  assert(periodSaved.paySchedule.anchorDates.papa === '2026-08-07' && periodSaved.paySchedule.anchorDates.mama === '2026-08-14', 'Each known payday should be saved independently.');
  assert(!Object.hasOwn(periodSaved.paySchedule, 'anchorDate'), 'Current saves should not retain the legacy shared payday.');
  assert(periodSaved.expenses.find(item => item.name === 'Loan2').weekday === 5, 'Weekly payment day should be saved with the expense.');
  vm.runInContext(`data.paySchedule.transfer = { from: 'mama', amount: 125 };`, periodFlow);
  assert(vm.runInContext('ledgerForPeriod("papa", parseLocalDate("2026-08-07")).transferIn', periodFlow) === 125, 'Reversing direction should make Papa the transfer receiver.');
  assert(vm.runInContext('ledgerForPeriod("mama", parseLocalDate("2026-08-14")).transferOut', periodFlow) === 125, 'Reversing direction should make Mama the transfer sender.');
  assert(!vm.runInContext('renderHome()', periodFlow).includes('undefined'), 'Dashboard should render assigned and annual expenses cleanly.');
  const billsHtml = vm.runInContext('renderBills()', periodFlow);
  assert(billsHtml.includes('Weekly Bills') && billsHtml.includes('$100/wk'), 'Bills should include the actual weekly payment.');
  assert(billsHtml.includes('$5,200/yr') && billsHtml.includes('~$433/mo'), 'Weekly bills should show annual and monthly equivalents.');
  assert(vm.runInContext('renderPayPeriods()', periodFlow).includes('1 needs a due day'), 'Weekly items should not trigger the missing monthly due-day warning.');
  assert(!vm.runInContext('renderBills()', periodFlow).includes('undefined'), 'Bills should render the version 6 data model cleanly.');
  assert(!vm.runInContext('renderSubs()', periodFlow).includes('undefined'), 'Subscriptions should render the version 6 data model cleanly.');

  const shellFlow = createHarness();
  vm.runInContext('render()', shellFlow);
  assert(shellFlow.__harness.elements.get('main').innerHTML.includes('person-income-input'), 'Dashboard should render card-level income inputs.');
  assert(shellFlow.__harness.elements.get('edit-btn').style.display === 'none', 'Home should not show a dead edit/delete control.');
  assert(shellFlow.__harness.elements.get('theme-label').textContent === 'Dark', 'Theme toggle should default to offering dark mode.');
  vm.runInContext('toggleTheme()', shellFlow);
  assert(shellFlow.__harness.elements.get('theme-label').textContent === 'Light', 'Theme toggle should switch to offering light mode in dark mode.');
  assert(shellFlow.__harness.elements.get('theme-icon').getAttribute('href') === '#icon-sun', 'Theme toggle should switch to the sun icon in dark mode.');
  assert(shellFlow.__harness.storage.get('budget_theme') === 'dark', 'Theme selection should be saved.');
  vm.runInContext('switchTab("pay")', shellFlow);
  assert(shellFlow.__harness.elements.get('main').innerHTML.includes('Pay Schedules'), 'Pay tab should expose separate biweekly schedules.');
  assert((shellFlow.__harness.elements.get('main').innerHTML.match(/Known payday/g) || []).length === 2, 'Pay tab should expose a known payday for each person.');
  assert(shellFlow.__harness.elements.get('main').innerHTML.includes('Actual amount each sender payday'), 'Pay tab should expose the recurring transfer amount.');
  assert(shellFlow.__harness.elements.get('edit-btn').style.display === 'none', 'Pay tab should not show the bill delete control.');
  vm.runInContext('switchTab("bills")', shellFlow);
  assert(shellFlow.__harness.elements.get('edit-btn').style.display === 'flex', 'Bills should show the contextual delete control.');

  const dirtyGuard = createHarness({ confirms: [false] });
  vm.runInContext(`data.expenses.push({ id: 1, type: 'bill', name: 'Rent', amount: 1200, dueDay: 1, dueMonth: 1, person: 'papa', freq: 'monthly', cat: 'housing' }); isDirty = true;`, dirtyGuard);
  await vm.runInContext('newBudget()', dirtyGuard);
  assert(dirtyGuard.lastConfirm.includes('unsaved changes'), 'New should warn before discarding unsaved changes.');
  assert(vm.runInContext('data.expenses.length', dirtyGuard) === 1, 'Dismissing New warning should keep current data.');

  const newFlow = createHarness({ confirms: [true] });
  vm.runInContext(`data.expenses.push({ id: 1, type: 'bill', name: 'Rent', amount: 1200, dueDay: 1, dueMonth: 1, person: 'papa', freq: 'monthly', cat: 'housing' }); isDirty = true;`, newFlow);
  await vm.runInContext('newBudget()', newFlow);
  assert(vm.runInContext('data.expenses.length', newFlow) === 0, 'Accepting New should create a blank budget.');
  assert(vm.runInContext('documentName', newFlow) === 'Untitled Budget.budget.json', 'New should reset the document name.');
  assert(vm.runInContext('isDirty', newFlow) === false, 'New should start as a clean blank budget.');

  const openFlow = createHarness();
  vm.runInContext('fileHandle = makeHandle("opened.budget.json");', openFlow);
  await vm.runInContext(`loadBudgetFromFile(makeFile("opened.budget.json", ${JSON.stringify(legacy)}), fileHandle)`, openFlow);
  assert(vm.runInContext('documentName', openFlow) === 'opened.budget.json', 'Open should adopt the selected file name.');
  assert(vm.runInContext('isDirty', openFlow) === false, 'Open should start clean.');
  assert(vm.runInContext('data.expenses.length', openFlow) === 2, 'Open should normalize loaded budget data.');

  vm.runInContext('data.expenses[0].amount = 2300; markDirty();', openFlow);
  await vm.runInContext('saveBudget()', openFlow);
  assert(openFlow.__harness.writes.length === 1, 'Save should write through the current file handle.');
  assert(vm.runInContext('isDirty', openFlow) === false, 'Successful Save should clear dirty state.');

  const saveFallbackFlow = createHarness();
  vm.runInContext('data.expenses.push({ id: 1, type: "subscription", name: "Music", amount: 12, dueDay: 9, dueMonth: 1, freq: "monthly", cat: "media" }); markDirty();', saveFallbackFlow);
  await vm.runInContext('saveBudget()', saveFallbackFlow);
  assert(saveFallbackFlow.__harness.downloads.length === 1, 'Save fallback should download one budget file.');
  assert(saveFallbackFlow.__harness.downloads[0].download.endsWith('.json'), 'Save fallback download should use a JSON file name.');
  assert(vm.runInContext('isDirty', saveFallbackFlow) === false, 'Save fallback should clear dirty state after download starts.');

  const unloadFlow = createHarness();
  vm.runInContext('isDirty = true;', unloadFlow);
  const event = { preventDefaultCalled: false, preventDefault() { this.preventDefaultCalled = true; } };
  unloadFlow.__harness.listeners.beforeunload(event);
  assert(event.preventDefaultCalled && event.returnValue === '', 'beforeunload should warn while dirty.');

  console.log('workflow verification passed');
}

run().catch(error => {
  console.error(error.message);
  process.exit(1);
});
