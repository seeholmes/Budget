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

  const formFlow = createHarness();
  const newBillForm = vm.runInContext('itemForm("bill", null)', formFlow);
  const yearlyBillForm = vm.runInContext('itemForm("bill", { id: 1, type: "bill", name: "Taxes", amount: 100, dueDay: 1, dueMonth: 4, person: "papa", freq: "yearly", cat: "misc" })', formFlow);
  assert(newBillForm.includes('id="nb-duemonth-field" hidden'), 'Monthly bill form should hide the yearly-only due month field.');
  assert(yearlyBillForm.includes('id="eb-duemonth-field" >'), 'Yearly bill form should show the due month field.');

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

  const saveAsFlow = createHarness();
  vm.runInContext('data.expenses.push({ id: 1, type: "subscription", name: "Music", amount: 12, dueDay: 9, dueMonth: 1, freq: "monthly", cat: "media" }); markDirty();', saveAsFlow);
  await vm.runInContext('saveBudgetAs()', saveAsFlow);
  assert(saveAsFlow.__harness.downloads.length === 1, 'Save As fallback should download one budget file.');
  assert(saveAsFlow.__harness.downloads[0].download.endsWith('.json'), 'Save As download should use a JSON file name.');
  assert(vm.runInContext('isDirty', saveAsFlow) === false, 'Save As fallback should clear dirty state after download starts.');

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
