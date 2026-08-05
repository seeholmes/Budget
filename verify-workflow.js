const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\nrender\(\);\s*$/, '');

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
  assert(html.includes('data-tab="pay"'), 'Navigation should include the Pay Periods tab.');
  assert(html.includes('renderPayPeriods'), 'Pay Periods should have a dedicated renderer.');
  assert(html.includes('class="sidebar"') && html.includes('class="workspace"'), 'The responsive app shell should include a desktop sidebar and workspace.');
  assert(html.includes('ledger-table'), 'Expanded desktop ledgers should include a transaction table.');
  assert(html.includes('expense-table-head'), 'Desktop expense lists should include table headers.');
  assert(html.includes('updatePayTransfer'), 'Pay setup should expose the recurring actual transfer.');
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
  assert(saved.schemaVersion === 5, 'Serialized budgets should use schema version 5.');
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
    schemaVersion: 5,
    names: { papa: 'Alex', mama: 'Sam' },
    income: { papa: 0, mama: 0 },
    paySchedule: {
      cadence: 'biweekly',
      anchorDate: '2026-08-07',
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
  assert(vm.runInContext('dateKey(payPeriodStarts(1, new Date(2026, 7, 12))[0])', periodFlow) === '2026-08-07', 'Known payday should anchor the current 14-day period.');
  assert(vm.runInContext('expenseOccurrences("papa", parseLocalDate("2026-08-07"), parseLocalDate("2026-08-21")).filter(item => item.expense.name === "Loan2").length', periodFlow) === 2, 'A Friday weekly bill should occur twice in a biweekly period.');
  assert(vm.runInContext('ledgerForPeriod("papa", parseLocalDate("2026-08-07")).expenseOutgoing', periodFlow) === 1200, 'Papa ledger should include monthly and both weekly transactions in the period.');
  assert(vm.runInContext('ledgerForPeriod("papa", parseLocalDate("2026-08-07")).outgoing', periodFlow) === 1500, 'Papa outgoing should include expenses and the actual payday transfer.');
  assert(vm.runInContext('ledgerForPeriod("papa", parseLocalDate("2026-08-07")).transferOut', periodFlow) === 300, 'The sender should record the transfer as Money Out.');
  assert(vm.runInContext('ledgerForPeriod("mama", parseLocalDate("2026-08-07")).outgoing', periodFlow) === 600, 'Mama ledger should include Mama annual payments in the period.');
  assert(vm.runInContext('ledgerForPeriod("mama", parseLocalDate("2026-08-07")).income', periodFlow) === 2100, 'The receiver should include the transfer in Money In.');
  assert(vm.runInContext('ledgerForPeriod("mama", parseLocalDate("2026-08-07")).transferIn', periodFlow) === 300, 'The receiver should record the transfer as Money In.');
  assert(vm.runInContext('ledgerForPeriod("mama", parseLocalDate("2026-08-07")).items.length', periodFlow) === 1, 'Undated monthly expenses should not be placed on an invented date.');
  assert(vm.runInContext(`expenseOccursOn({ freq: 'monthly', dueDay: 31 }, new Date(2027, 1, 28))`, periodFlow), 'End-of-month expenses should clamp to the last calendar day.');
  assert(vm.runInContext(`expenseOccursOn({ freq: 'weekly', weekday: 5 }, new Date(2026, 7, 7))`, periodFlow), 'Weekly expenses should occur on the selected weekday.');
  assert(!vm.runInContext(`expenseOccursOn({ freq: 'weekly', weekday: 5 }, new Date(2026, 7, 8))`, periodFlow), 'Weekly expenses should not occur on other weekdays.');
  assert(Math.abs(vm.runInContext(`monthlyEquiv({ freq: 'weekly', amount: 100 })`, periodFlow) - (100 * 52 / 12)) < 0.001, 'Weekly payments should derive their monthly equivalent from 52 occurrences.');
  assert(vm.runInContext('parseLocalDate("2026-02-31")', periodFlow) === null, 'Invalid calendar dates should not become pay schedule anchors.');
  const initialPayHtml = vm.runInContext('renderPayPeriods()', periodFlow);
  assert(initialPayHtml.includes('segment-btn papa active'), 'Pay Periods should default to Papa as the selected ledger.');
  assert(initialPayHtml.includes('<section class="ledger papa">') && !initialPayHtml.includes('<section class="ledger mama">'), 'Pay Periods should render only the selected person ledger.');
  assert((initialPayHtml.match(/aria-expanded="true"/g) || []).length === 1, 'Only the current pay period should be expanded initially.');
  assert(initialPayHtml.includes('Actual amount each payday'), 'Pay setup should label the recurring transfer amount clearly.');

  vm.runInContext('setAllPayPeriods(true)', periodFlow);
  const papaPayHtml = vm.runInContext('renderPayPeriods()', periodFlow);
  assert(papaPayHtml.includes('Transfer to Sam') && papaPayHtml.includes('-$300'), 'The sender ledger should show the actual payday transfer as Money Out.');
  assert((papaPayHtml.match(/Loan2/g) || []).length >= 2, 'Expanded Pay Periods should show both Friday Loan2 transactions.');
  assert((papaPayHtml.match(/aria-expanded="true"/g) || []).length === 6, 'Expand all should open every displayed period.');

  vm.runInContext('setLedgerPerson("mama")', periodFlow);
  const mamaPayHtml = vm.runInContext('renderPayPeriods()', periodFlow);
  assert(mamaPayHtml.includes('<section class="ledger mama">') && !mamaPayHtml.includes('<section class="ledger papa">'), 'The ledger selector should switch to Mama without showing a combined view.');
  assert(mamaPayHtml.includes('Annual Software') && mamaPayHtml.includes('$600'), 'The selected ledger should surface actual annual charges.');
  assert(mamaPayHtml.includes('Transfer from Alex') && mamaPayHtml.includes('+$300'), 'The receiver ledger should show the actual payday transfer as Money In.');
  assert(periodFlow.__harness.storage.get('budget_ledger_person') === 'mama', 'The selected ledger person should be remembered locally.');

  vm.runInContext('setAllPayPeriods(false)', periodFlow);
  assert(vm.runInContext('expandedPayPeriods.size', periodFlow) === 0, 'Collapse all should close every pay period.');
  assert(vm.runInContext('renderHome()', periodFlow).includes('Suggested/mo'), 'Dashboard should retain the calculated transfer as guidance.');
  const periodSaved = JSON.parse(vm.runInContext('serializeBudget()', periodFlow));
  assert(periodSaved.paySchedule.transfer.from === 'papa' && periodSaved.paySchedule.transfer.amount === 300, 'Actual transfer settings should be saved with the budget.');
  assert(periodSaved.expenses.find(item => item.name === 'Loan2').weekday === 5, 'Weekly payment day should be saved with the expense.');
  vm.runInContext(`data.paySchedule.transfer = { from: 'mama', amount: 125 };`, periodFlow);
  assert(vm.runInContext('ledgerForPeriod("papa", parseLocalDate("2026-08-07")).transferIn', periodFlow) === 125, 'Reversing direction should make Papa the transfer receiver.');
  assert(vm.runInContext('ledgerForPeriod("mama", parseLocalDate("2026-08-07")).transferOut', periodFlow) === 125, 'Reversing direction should make Mama the transfer sender.');
  assert(!vm.runInContext('renderHome()', periodFlow).includes('undefined'), 'Dashboard should render assigned and annual expenses cleanly.');
  const billsHtml = vm.runInContext('renderBills()', periodFlow);
  assert(billsHtml.includes('Weekly Bills') && billsHtml.includes('$100/wk'), 'Bills should include the actual weekly payment.');
  assert(billsHtml.includes('$5,200/yr') && billsHtml.includes('~$433/mo'), 'Weekly bills should show annual and monthly equivalents.');
  assert(vm.runInContext('renderPayPeriods()', periodFlow).includes('1 needs a due day'), 'Weekly items should not trigger the missing monthly due-day warning.');
  assert(!vm.runInContext('renderBills()', periodFlow).includes('undefined'), 'Bills should render the version 5 data model cleanly.');
  assert(!vm.runInContext('renderSubs()', periodFlow).includes('undefined'), 'Subscriptions should render the version 5 data model cleanly.');

  const shellFlow = createHarness();
  vm.runInContext('render()', shellFlow);
  assert(shellFlow.__harness.elements.get('main').innerHTML.includes('person-income-input'), 'Dashboard should render card-level income inputs.');
  assert(shellFlow.__harness.elements.get('edit-btn').style.display === 'none', 'Home should not show a dead edit/delete control.');
  assert(shellFlow.__harness.elements.get('theme-btn').textContent === 'Dark', 'Theme toggle should default to offering dark mode.');
  vm.runInContext('toggleTheme()', shellFlow);
  assert(shellFlow.__harness.elements.get('theme-btn').textContent === 'Light', 'Theme toggle should switch to offering light mode in dark mode.');
  assert(shellFlow.__harness.storage.get('budget_theme') === 'dark', 'Theme selection should be saved.');
  vm.runInContext('switchTab("pay")', shellFlow);
  assert(shellFlow.__harness.elements.get('main').innerHTML.includes('Shared Pay Schedule'), 'Pay tab should expose the shared biweekly setup.');
  assert(shellFlow.__harness.elements.get('main').innerHTML.includes('Actual amount each payday'), 'Pay tab should expose the recurring transfer amount.');
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
