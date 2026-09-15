#!/usr/bin/env node
/**
 * Final regression for PR #16 — workflows A–F.
 * Uses the same VM bootstrap as stay-rent-consistency-test.js / payment-group-test.js.
 * Does not mutate production data.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cut = script.search(/\$\('#nav'\)\.onclick|\$\("#nav"\)\.onclick|\$\('#nav'\)/);
let defs = (cut > 0 ? script.slice(0, cut) : script)
  .replace(/\blet state=/, 'var state=')
  .replace(/\blet resendBusy=/, 'var resendBusy=')
  .replace(/\bconst money=/, 'var money=')
  .replace(/\bconst today=/, 'var today=');

const store = {};
const el = () => ({
  classList: { add() {}, remove() {}, toggle() {}, contains: () => true },
  textContent: '',
  innerHTML: '',
  style: {},
  disabled: false,
  value: '',
  reset() {},
  elements: {},
  onclick: null,
  dataset: {},
  addEventListener() {},
});
const sandbox = {
  console,
  Intl,
  JSON,
  Number,
  String,
  Date,
  Math,
  Promise,
  Error,
  Array,
  Object,
  Map,
  Set,
  RegExp,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  setTimeout,
  clearTimeout,
  URLSearchParams: require('url').URLSearchParams,
  AbortController: class {
    constructor() {
      this.signal = {};
    }
    abort() {}
  },
  localStorage: {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  },
  document: { querySelector: el, querySelectorAll: () => [], getElementById: el },
  window: { __bootTimer: null },
  fetch: async () => ({ ok: true, text: async () => '[]', json: async () => [] }),
  alert() {},
  confirm() {
    return false;
  },
  history: { replaceState() {} },
  location: { hash: '', search: '', pathname: '/', reload() {} },
  FormData: class {
    constructor() {
      this._ = {};
    }
    get(k) {
      return this._[k];
    }
    entries() {
      return Object.entries(this._)[Symbol.iterator]();
    }
  },
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(defs, sandbox, { timeout: 8000 });

// Pin calendar day so paid-through 2026-09-14 still counts as "paid" (not due today).
sandbox.today = () => '2026-09-14';

const S = sandbox.state;
function seed(extra) {
  Object.assign(S, {
    propertyId: 1,
    properties: [{ id: 1, name: 'McGregor' }],
    rooms: [
      { id: 2, property_id: 1, room_no: 2, notes: '' },
      { id: 4, property_id: 1, room_no: 4, notes: '' },
      { id: 5, property_id: 1, room_no: 5, notes: '' },
      { id: 8, property_id: 1, room_no: 8, notes: 'Sofa' },
    ],
    tenants: [
      { id: 1, name: 'Laura Blackgun' },
      { id: 2, name: 'Yan' },
      { id: 3, name: '辣豆' },
      { id: 4, name: 'Vicky' },
      { id: 5, name: 'ShortGuest' },
    ],
    tenancies: [],
    payments: [],
    bonds: [],
    bondRefundEvents: [],
    paymentActions: [],
    paymentActionHistory: [],
    bookingEvents: [],
    paymentActionsError: '',
    profiles: [{ id: 'u1', display_name: 'Owner', role: 'owner' }],
    me: { role: 'owner' },
    viewings: [],
    viewingsError: '',
    activity: [],
    priceHistory: [],
    roomProfiles: [],
    page: 'overview',
    incomeMode: 'weekly',
    actionFilter: 'open',
    tenantFilter: 'current',
    ...(extra || {}),
  });
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

let failed = 0;
function assert(name, cond) {
  if (!cond) {
    console.log('FAIL', name);
    failed += 1;
    process.exitCode = 1;
  } else {
    console.log('PASS', name);
  }
}

console.log('\n=== A. Laura short stay ($35/night) ===');
seed();
const laura = {
  id: 101,
  tenant_id: 1,
  room_id: 5,
  check_in: '2026-09-11',
  check_out: '2026-09-16',
  rent_amount: 35,
  rent_period: 'night',
  tenancy_type: 'short_term',
  status: 'active',
  notes: '',
};
S.tenancies = [laura];
assert('A billable nights = 5 (11→16 Sep)', sandbox.stayNights(laura) === 5);
assert('A stay end = check_out 2026-09-16', sandbox.stayEndDate(laura) === '2026-09-16');
assert('A not ongoing', sandbox.isOngoingStay(laura) === false);
assert('A calculated rent = 175', sandbox.calculatedStayRentSolo(laura) === 175);
assert('A final rent = 175', sandbox.expectedStayTotalSolo(laura) === 175);
assert(
  'A rate label shows $35 / night',
  /35/.test(sandbox.formatRentalRate(laura)) && /night/i.test(sandbox.formatRentalRate(laura))
);
assert('A breakdown nights=5', /5\s*nights?/i.test(sandbox.stayChargeBreakdown(laura).label));

const overrideNotes = sandbox.withRentMeta(laura.notes || '', {
  calculated: 175,
  override: 200,
  overrideBy: 'Owner',
  overrideAt: '2026-09-12T00:00:00.000Z',
  overrideNote: 'manual',
});
const lauraOverride = { ...laura, notes: String(overrideNotes) };
assert('A override persists after reopen (parse)', sandbox.parseRentMeta(lauraOverride.notes).override === 200);
assert('A calculated preserved in meta', sandbox.parseRentMeta(lauraOverride.notes).calculated === 175);
assert('A expected total uses override 200', sandbox.expectedStayTotalSolo(lauraOverride) === 200);

// Status from edited amount
S.tenancies = [lauraOverride];
const lockedOpen = {
  id: 7,
  tenancy_id: 101,
  tenant_id: 1,
  room_id: 5,
  property_id: 1,
  amount: 200,
  due_date: '2026-09-11',
  status: 'open',
  notes: sandbox.withActionMeta('', { originalAmount: 200, amountLocked: true, manualAmount: 200, paymentIds: [] }),
};
S.paymentActions = [lockedOpen];
S.payments = [];
assert('A unpaid remaining 200', sandbox.actionRemainingAmount(lockedOpen) === 200);
assert('A unpaid live status not resolved', sandbox.paymentActionLiveStatus(lockedOpen) !== 'resolved');

S.payments = [
  {
    id: 50,
    tenancy_id: 101,
    amount: 80,
    status: 'paid',
    received_date: '2026-09-12',
    period_start: '2026-09-11',
    period_end: '2026-09-16',
    notes: 'ACTION_ID:7',
  },
];
const lockedPartial = {
  ...lockedOpen,
  notes: sandbox.withActionMeta(lockedOpen.notes, {
    originalAmount: 200,
    amountLocked: true,
    manualAmount: 200,
    paymentIds: [50],
  }),
};
assert('A partial paid 80', sandbox.actionPaidAmount(lockedPartial) === 80);
assert('A partial remaining 120', sandbox.actionRemainingAmount(lockedPartial) === 120);
assert(
  'A partial status partially_paid/overdue/open',
  ['partially_paid', 'overdue', 'due_soon', 'open'].includes(sandbox.paymentActionLiveStatus(lockedPartial))
);

S.payments = [
  {
    id: 50,
    tenancy_id: 101,
    amount: 200,
    status: 'paid',
    received_date: '2026-09-12',
    period_start: '2026-09-11',
    period_end: '2026-09-16',
    notes: 'ACTION_ID:7',
  },
];
const lockedFull = {
  ...lockedOpen,
  notes: sandbox.withActionMeta(lockedOpen.notes, {
    originalAmount: 200,
    amountLocked: true,
    manualAmount: 200,
    paymentIds: [50],
  }),
};
assert('A full remaining 0', sandbox.actionRemainingAmount(lockedFull) === 0);
assert('A full => resolved (Satisfied)', sandbox.paymentActionLiveStatus(lockedFull) === 'resolved');

console.log('\n=== B. McGregor Room 4 — Yan ===');
seed();
const yan = {
  id: 201,
  tenant_id: 2,
  room_id: 4,
  check_in: '2026-08-01',
  check_out: null,
  rent_amount: 220,
  rent_period: 'week',
  payment_cycle_weeks: 1,
  tenancy_type: 'long_term',
  status: 'active',
};
S.tenancies = [yan];
const cashHistory = [
  {
    id: 61,
    tenancy_id: 201,
    amount: 220,
    status: 'paid',
    received_date: '2026-08-10',
    period_start: '2026-08-01',
    period_end: '2026-08-14',
    notes: 'cash rent Room 4',
  },
  {
    id: 62,
    tenancy_id: 201,
    amount: 100,
    status: 'paid',
    received_date: '2026-07-20',
    period_start: '2026-07-15',
    period_end: '2026-07-28',
    notes: 'earlier cash',
  },
];
S.payments = deepClone(cashHistory);
const beforeCash = deepClone(S.payments);
assert('B paidThrough covers period end', sandbox.paidThrough(yan) === '2026-08-14');
assert('B payment matches tenant/stay tenancy_id', S.payments.filter((p) => Number(p.tenancy_id) === 201).length === 2);

// Payment covering the *relevant* rental period must not create a false Overdue on that action.
const yanAction = {
  id: 80,
  tenancy_id: 201,
  amount: 0,
  due_date: '2026-08-01',
  status: 'overdue',
  notes: sandbox.withActionMeta('', {
    originalAmount: 220,
    amountLocked: true,
    manualAmount: 220,
    paymentIds: [61],
  }),
};
S.paymentActions = [yanAction];
assert('B covered action remaining 0', sandbox.actionRemainingAmount(yanAction) === 0);
assert('B covered live status resolved (not overdue)', sandbox.paymentActionLiveStatus(yanAction) === 'resolved');
assert('B coverage summary outstanding 0', sandbox.actionCoverageSummary(yanAction).outstanding === 0);

// Ongoing weekly tenant with only an Aug period covered may still be due for later cycles —
// that is real outstanding rent, not a false overdue on the covered period.
S.payments[0].period_end = '2099-01-01';
assert('B when coverage extends forward, rentState is paid', sandbox.rentState(yan) === 'paid');
S.payments = deepClone(beforeCash); // restore exact cash history for integrity checks
assert('B cash history length unchanged', S.payments.length === beforeCash.length);
assert('B cash amounts unchanged', S.payments.every((p, i) => p.amount === beforeCash[i].amount && p.id === beforeCash[i].id));
assert('B no duplicate payment ids', new Set(S.payments.map((p) => p.id)).size === S.payments.length);

console.log('\n=== C. McGregor Room 2 shared / short-stay ===');
seed();
const lado = {
  id: 10,
  tenant_id: 3,
  room_id: 2,
  check_in: '2026-09-01',
  check_out: '2026-09-20',
  rent_amount: 280,
  rent_period: 'week',
  payment_cycle_weeks: 1,
  status: 'active',
  tenancy_type: 'long_term',
};
const vicky = {
  id: 11,
  tenant_id: 4,
  room_id: 2,
  check_in: '2026-09-01',
  check_out: '2026-09-20',
  rent_amount: 280,
  rent_period: 'week',
  payment_cycle_weeks: 1,
  status: 'active',
  tenancy_type: 'long_term',
};
const shortPaid = {
  id: 13,
  tenant_id: 5,
  room_id: 8,
  check_in: '2026-09-10',
  check_out: '2026-09-17',
  rent_amount: 50,
  rent_period: 'day',
  status: 'active',
  tenancy_type: 'short_term',
};
S.tenancies = [lado, vicky, shortPaid];
S.payments = [
  {
    id: 1,
    tenancy_id: 10,
    amount: 560,
    status: 'paid',
    period_start: '2026-09-01',
    period_end: '2026-09-14',
    received_date: '2026-09-01',
  },
  {
    id: 4,
    tenancy_id: 13,
    amount: 350,
    status: 'paid',
    period_start: '2026-09-10',
    period_end: '2026-09-17',
    received_date: '2026-09-10',
  },
];
assert('C shared group has 2 members', sandbox.paymentGroupMembers(lado).length === 2);
assert('C Vicky paidThrough uses partner payment', sandbox.paidThrough(vicky) === '2026-09-14');
const primaries = [lado, vicky].filter((t) => sandbox.isPaymentGroupPrimary(t));
assert('C exactly one primary', primaries.length === 1);
assert('C group expected sums once (560)', sandbox.paymentGroupExpectedAmount(primaries[0]) === 560);
assert('C covered group rentState paid (not overdue)', sandbox.rentState(lado) === 'paid');
assert('C covered partner not overdue', sandbox.rentState(vicky) !== 'overdue');
assert('C paid short stay expected 350', sandbox.expectedStayTotal(shortPaid) === 350);
assert('C paid short stay isStayFullyPaid', sandbox.isStayFullyPaid(shortPaid) === true);
assert('C paid short stay rentState paid', sandbox.rentState(shortPaid) === 'paid');
assert('C paid short stay not overdue', sandbox.rentState(shortPaid) !== 'overdue');

console.log('\n=== D. Bond / Deposit ===');
seed();
S.tenancies = [laura];
S.bonds = [
  {
    id: 9,
    tenancy_id: 101,
    amount: 200,
    original_currency: 'CNY',
    bond_type: 'booking_deposit',
    received: true,
  },
];
S.bondRefundEvents = [
  {
    id: 1,
    bond_id: 9,
    action: 'received',
    amount: 200,
    currency: 'CNY',
    created_at: '2026-09-01T00:00:00.000Z',
    method: 'cash',
    reference: 'R1',
    notes: 'deposit in',
  },
];
const beforeBonds = deepClone(S.bonds);
const beforeBondEvents = deepClone(S.bondRefundEvents);
const label = sandbox.bondOptionLabel(S.bonds[0]);
assert('D bond label includes tenant name', /Laura/i.test(label));
assert('D bond label includes amount', /200/.test(label));
assert('D bond label not raw id only', !/^#?9$/.test(label.trim()));
assert('D HTML has related_bond_id select', /name="related_bond_id"/.test(html));
assert('D HTML has no Related Bond ID label', !/Related Bond ID/i.test(html));
assert('D HTML uses Bond / Deposit wording', /Bond\s*\/\s*Deposit/i.test(html));
assert('D bond records intact', JSON.stringify(S.bonds) === JSON.stringify(beforeBonds));
assert('D bond action history intact', JSON.stringify(S.bondRefundEvents) === JSON.stringify(beforeBondEvents));

console.log('\n=== E. Income page ===');
seed({
  tenancies: [laura, yan],
  payments: [
    { id: 1, tenancy_id: 101, amount: 175, status: 'paid', received_date: '2026-09-12' },
    { id: 2, tenancy_id: 201, amount: 220, status: 'paid', received_date: '2026-08-10' },
    { id: 3, tenancy_id: 201, amount: 50, status: 'open', received_date: '2026-08-11' },
  ],
  page: 'income',
});
assert('E incomePage is a function', typeof sandbox.incomePage === 'function');
assert('E paymentsPage is a function', typeof sandbox.paymentsPage === 'function');
assert('E income !== payments page fn', sandbox.incomePage !== sandbox.paymentsPage);
const incomeHtml = sandbox.incomePage();
const paymentsHtml = sandbox.paymentsPage();
assert('E income renders Income Dashboard', /Income Dashboard/i.test(incomeHtml));
assert('E income has income-page-only marker', /income-page-only/i.test(incomeHtml));
assert('E income does NOT render Payment Actions heading', !/Payment Actions/i.test(incomeHtml));
assert('E payments page is distinct', /Payment|Reconcile/i.test(paymentsHtml));
assert('E router case income -> incomePage', /case\s+['"]income['"]\s*:\s*html\s*=\s*incomePage\(\)/.test(html));
assert('E router case payments -> paymentsPage', /case\s+['"]payments['"]\s*:\s*html\s*=\s*paymentsPage\(\)/.test(html));
// Totals from paid only: 175+220=395 (status open excluded)
assert('E income total includes paid amounts', /395|\$395/.test(incomeHtml.replace(/,/g, '')));
assert('E income source filters paid status', /status.*paid|paid.*status/i.test(String(sandbox.incomePage)));

console.log('\n=== F. Data integrity ===');
seed();
const stays = [
  {
    id: 101,
    tenant_id: 1,
    room_id: 5,
    check_in: '2026-09-11',
    check_out: '2026-09-16',
    rent_amount: 35,
    rent_period: 'night',
    tenancy_type: 'short_term',
    status: 'active',
  },
  {
    id: 201,
    tenant_id: 2,
    room_id: 4,
    check_in: '2026-08-01',
    check_out: null,
    rent_amount: 220,
    rent_period: 'week',
    status: 'active',
    tenancy_type: 'long_term',
  },
];
const pays = [
  {
    id: 61,
    tenancy_id: 201,
    amount: 220,
    status: 'paid',
    received_date: '2026-08-10',
    period_end: '2026-08-14',
  },
];
S.tenancies = deepClone(stays);
S.payments = deepClone(pays);
const beforeStays = deepClone(S.tenancies);
const beforePays = deepClone(S.payments);
S.tenancies.forEach((t) => {
  sandbox.stayNights(t);
  sandbox.calculatedStayRentSolo(t);
  sandbox.expectedStayTotalSolo(t);
  sandbox.formatRentalRate(t);
  sandbox.tenancyKind(t);
  sandbox.rentState(t);
  sandbox.paidThrough(t);
});
sandbox.withRentMeta('x', { calculated: 1, override: 2 });
sandbox.withActionMeta('y', { originalAmount: 10, amountLocked: true });
assert('F no stay duplication', S.tenancies.length === beforeStays.length);
assert('F no payment duplication', S.payments.length === beforePays.length);
assert('F stays unchanged', JSON.stringify(S.tenancies) === JSON.stringify(beforeStays));
assert('F payment amounts unchanged', JSON.stringify(S.payments) === JSON.stringify(beforePays));
assert('F Yan still current occupancy', sandbox.tenancyKind(S.tenancies[1]) === 'current' || !['historical', 'past'].includes(sandbox.tenancyKind(S.tenancies[1])));

console.log('\n=== Summary ===');
if (failed) {
  console.log(`FAILED: ${failed} assertion(s)`);
  process.exit(1);
}
console.log('ALL PASS');
process.exit(0);
