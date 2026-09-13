#!/usr/bin/env node
/**
 * Real-data regression: Laura / McGregor Room 5
 * Stay 11→16 Sep 2026 @ $35/night = 5 × $35 = $175
 * Paid $175 → must be Paid/Satisfied with NO active $460 / $635 obligation.
 *
 * Reproduces the production failure mode where a legacy sibling booking ($460)
 * and/or a stale ORIGINAL_AMOUNT:$635 on the Payment Action inflated the due.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cut = script.search(/\$\('#nav'\)\.onclick|\$\("#nav"\)\.onclick|\$\('#nav'\)/);
let defs = (cut > 0 ? script.slice(0, cut) : script)
  .replace(/\blet state=/, 'var state=')
  .replace(/\blet resendBusy=/, 'var resendBusy=')
  .replace(/\bconst money=/, 'var money=');

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

const S = sandbox.state;
function seedLauraScenario({ staleActionOriginal = 635, legacySibling = true, paid = 175 } = {}) {
  Object.assign(S, {
    propertyId: 1,
    properties: [{ id: 1, name: 'McGregor' }],
    rooms: [{ id: 5, property_id: 1, room_no: 5, notes: '' }],
    tenants: [
      { id: 10, name: 'Laura' },
      { id: 11, name: 'Legacy Guest' },
    ],
    tenancies: [
      {
        id: 501,
        tenant_id: 10,
        room_id: 5,
        check_in: '2026-09-11',
        check_out: '2026-09-16',
        rent_amount: 35,
        rent_period: 'night',
        tenancy_type: 'short_term',
        status: 'active',
        notes: '',
      },
    ],
    payments: paid
      ? [
          {
            id: 9001,
            tenancy_id: 501,
            amount: paid,
            status: 'paid',
            received_date: '2026-09-11',
            period_start: '2026-09-11',
            period_end: '2026-09-16',
            notes: 'ACTION_ID:7001',
          },
        ]
      : [],
    paymentActions: [
      {
        id: 7001,
        tenancy_id: 501,
        tenant_id: 10,
        room_id: 5,
        property_id: 1,
        action_type: 'rent_due',
        // Remaining as previously displayed ($460) — stale UI storage
        amount: Math.max(0, staleActionOriginal - paid),
        due_date: '2026-09-11',
        status: 'overdue',
        // Legacy inflated ORIGINAL_AMOUNT as seen in production ($635 = $460 + $175)
        notes: `ORIGINAL_AMOUNT:${staleActionOriginal}\nAMOUNT_LOCKED:1`,
      },
    ],
    paymentActionHistory: [],
    bonds: [],
    bondRefundEvents: [],
    bookingEvents: [],
    paymentActionsError: '',
    profiles: [{ id: 'u1', display_name: 'Owner', role: 'owner' }],
    me: { role: 'owner' },
    viewings: [],
    activity: [],
    priceHistory: [],
    roomProfiles: [],
    page: 'payments',
  });

  if (legacySibling) {
    // Same room + check_in — historically this was summed into expectedStayTotal → $635
    S.tenancies.push({
      id: 502,
      tenant_id: 11,
      room_id: 5,
      check_in: '2026-09-11',
      check_out: '2026-09-16',
      rent_amount: 460,
      rent_period: 'total',
      tenancy_type: 'short_term',
      status: 'historical',
      notes: 'LEGACY_BOOKING_TOTAL:460',
    });
  }
}

let failed = 0;
function assert(name, cond, detail) {
  if (!cond) {
    failed += 1;
    process.exitCode = 1;
    console.log('FAIL', name, detail || '');
  } else {
    console.log('PASS', name);
  }
}

console.log('\n=== Laura short-stay source-of-truth regression ===');
seedLauraScenario();

const laura = S.tenancies.find((t) => t.id === 501);
const action = S.paymentActions[0];

assert('billable nights = 5', sandbox.stayNights(laura) === 5);
assert('calculated rent = 175', sandbox.calculatedStayRentSolo(laura) === 175);
assert('finalAmountDue = 175 (not 460/635)', sandbox.finalAmountDue(laura) === 175);
assert('expectedStayTotal = finalAmountDue', sandbox.expectedStayTotal(laura) === 175);
assert(
  'stay breakdown label has 5 nights × $35',
  /5/.test(sandbox.stayChargeBreakdown(laura).label) && /35/.test(sandbox.stayChargeBreakdown(laura).label)
);

assert('Payment Action original = 175', sandbox.actionOriginalAmount(action, laura) === 175);
assert('Payment Action paid = 175', sandbox.actionPaidAmount(action) === 175);
assert('Payment Action remaining = 0', sandbox.actionRemainingAmount(action) === 0);
assert(
  'Payment Action live status resolved/satisfied',
  sandbox.paymentActionLiveStatus(action) === 'resolved'
);
assert('not overdue', sandbox.paymentActionLiveStatus(action) !== 'overdue');

assert('Rent Due Schedule expected total = 175', sandbox.expectedStayTotal(laura) === 175);
assert('Rent Due Schedule amount expected (balance) = 0', sandbox.paymentDueAmount(laura) === 0);
assert('group paid = 175', sandbox.groupPaymentAmount(laura) === 175);
assert('stay fully paid', sandbox.isStayFullyPaid(laura) === true);
assert('one-off rent state paid', sandbox.oneOffRentState(laura) === 'paid');
assert('rent state paid', sandbox.rentState(laura) === 'paid' || sandbox.rentState(laura) === 'completed');

const coverage = sandbox.actionCoverageSummary(action);
assert('coverage due 175', coverage.due === 175);
assert('coverage paid 175', coverage.paid === 175);
assert('coverage outstanding 0', coverage.outstanding === 0);
assert('no active 460 obligation', coverage.due !== 460 && sandbox.finalAmountDue(laura) !== 460);
assert('no active 635 obligation', coverage.due !== 635 && sandbox.finalAmountDue(laura) !== 635);
assert('legacy sibling still present for audit', S.tenancies.some((t) => t.id === 502 && /LEGACY/.test(t.notes)));

// Also reproduce when legacy sibling is still "active" (same room+check_in) — must not inflate one-off due
seedLauraScenario({ legacySibling: false });
S.tenancies.push({
  id: 503,
  tenant_id: 11,
  room_id: 5,
  check_in: '2026-09-11',
  check_out: '2026-09-16',
  rent_amount: 460,
  rent_period: 'total',
  tenancy_type: 'short_term',
  status: 'active',
  notes: 'ACTIVE_SIBLING_SHOULD_NOT_INFLATE_ONE_OFF',
});
const laura2 = S.tenancies.find((t) => t.id === 501);
assert(
  'active sibling $460 does not inflate one-off finalAmountDue',
  sandbox.finalAmountDue(laura2) === 175
);

console.log('\n=== Manual override synchronisation ===');
seedLauraScenario({ paid: 0, staleActionOriginal: 175, legacySibling: false });
const laura3 = S.tenancies.find((t) => t.id === 501);
// Simulate Payment Action edit → MANUAL_AMOUNT 150 (+ stay override sync)
S.paymentActions[0].notes = sandbox.withActionMeta('', {
  originalAmount: 175,
  amountLocked: true,
  manualAmount: 150,
  paymentIds: [],
});
laura3.notes = sandbox.withRentMeta(laura3.notes, {
  calculated: 175,
  override: 150,
  overrideBy: 'Owner',
  overrideAt: '2026-09-12T00:00:00.000Z',
  overrideNote: 'Synced from Payment Action edit',
});
S.payments = [];
const act3 = S.paymentActions[0];
assert('override finalAmountDue = 150', sandbox.finalAmountDue(laura3) === 150);
assert('override expectedStayTotalSolo = 150', sandbox.expectedStayTotalSolo(laura3) === 150);
assert('override action original = 150', sandbox.actionOriginalAmount(act3, laura3) === 150);
assert('override schedule due = 150', sandbox.paymentDueAmount(laura3) === 150);
assert('override unpaid not resolved', sandbox.paymentActionLiveStatus(act3) !== 'resolved');

S.payments = [
  {
    id: 9002,
    tenancy_id: 501,
    amount: 150,
    status: 'paid',
    received_date: '2026-09-12',
    period_start: '2026-09-11',
    period_end: '2026-09-16',
    notes: 'ACTION_ID:7001',
  },
];
act3.notes = sandbox.withActionMeta(act3.notes, {
  originalAmount: 175,
  amountLocked: true,
  manualAmount: 150,
  paymentIds: [9002],
});
assert('override paid remaining 0', sandbox.actionRemainingAmount(act3) === 0);
assert('override status resolved', sandbox.paymentActionLiveStatus(act3) === 'resolved');
assert('override schedule balance 0', sandbox.paymentDueAmount(laura3) === 0);

console.log('\n=== Summary ===');
if (failed) {
  console.log(`FAILED: ${failed}`);
  process.exit(1);
}
console.log('ALL PASS — Laura obligation is $175; $460/$635 are not active dues.');
process.exit(0);
