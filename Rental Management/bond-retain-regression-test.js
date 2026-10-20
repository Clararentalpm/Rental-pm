#!/usr/bin/env node
/**
 * Retain Bond — partial / full retention, repeats, refund-after-partial, over-retention.
 * Administrative ledger only (forfeited_amount); does not invent payments.
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
  .replace(/\blet bondRetainBusy=/, 'var bondRetainBusy=')
  .replace(/\bconst money=/, 'var money=')
  .replace(/\bconst today=/, 'var today=')
  .replace(/\bconst esc=/, 'var esc=')
  .replace(/\bconst fmtDate=/, 'var fmtDate=');

const store = {};
const el = () => ({
  classList: { add() {}, remove() {}, toggle() {}, contains: () => true },
  textContent: '',
  innerHTML: '',
  style: {},
  disabled: false,
  value: '',
  readOnly: false,
  checked: false,
  reset() {},
  elements: {},
  onclick: null,
  dataset: {},
  addEventListener() {},
  showModal() {},
  close() {},
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
    return true;
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
sandbox.today = () => '2026-10-20';

function assert(c, m) {
  if (!c) throw new Error(m);
}
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS', name);
  } catch (e) {
    console.error('FAIL', name, e.message);
    process.exitCode = 1;
  }
}

function seedBond(extra = {}) {
  Object.assign(sandbox.state, {
    propertyId: 1,
    properties: [{ id: 1, name: 'McGregor' }],
    rooms: [{ id: 15, property_id: 1, room_no: 5 }],
    tenants: [{ id: 10, name: 'Retain Guest' }],
    tenancies: [
      {
        id: 100,
        tenant_id: 10,
        room_id: 15,
        check_in: '2026-09-10',
        check_out: '2026-10-10',
        status: 'active',
      },
    ],
    bonds: [
      {
        id: 55,
        tenancy_id: 100,
        amount: 500,
        original_currency: 'AUD',
        currency: 'AUD',
        received: true,
        refunded: false,
        received_date: '2026-09-16',
        bond_type: 'rental_bond',
        notes: '',
        remaining_amount: 500,
        refund_amount: 0,
        forfeited_amount: 0,
        deduction_amount: 0,
        deposit_status: null,
        ...extra,
      },
    ],
    bondRefundEvents: [],
    bondEvents: [],
    bookingEvents: [],
    payments: [],
    paymentActions: [],
    profiles: [{ id: 'staff-1', display_name: 'Alex Staff', role: 'owner' }],
    me: { id: 'staff-1', display_name: 'Alex Staff', role: 'owner' },
  });
}

function applyRetain(plan) {
  assert(plan.ok === true, plan.error || 'plan not ok');
  Object.assign(sandbox.state.bonds[0], plan.patch);
  sandbox.state.bondRefundEvents.push({
    ...plan.event,
    id: sandbox.state.bondRefundEvents.length + 1,
    created_at: '2026-10-20T10:00:00.000Z',
  });
}

check('UI Retain Bond dialog + planBondRetain helper present', () => {
  assert(/Retain Bond/.test(html), 'Retain Bond label');
  assert(/bond-retain-dialog/.test(html), 'retain dialog');
  assert(/planBondRetain/.test(html), 'planBondRetain');
  assert(/bondRetainBusy/.test(html), 'duplicate-submit lock');
  assert(/Administrative record only/.test(html) || /administrative retention only/i.test(html), 'admin-only note');
  assert(/retain_full/.test(html) && /retain_partial/.test(html), 'retain actions');
});

check('Partial retention: amount, reason, staff, balance & status', () => {
  seedBond();
  const plan = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 150,
    reason: 'Cleaning damage',
    staffId: 'staff-1',
    retainedAt: '2026-10-20',
  });
  assert(plan.ok, plan.error);
  assert(plan.summary.original === 500, 'original');
  assert(plan.summary.alreadyRefunded === 0, 'already refunded');
  assert(plan.summary.alreadyRetained === 0, 'already retained');
  assert(plan.summary.retainingNow === 150, 'retaining now');
  assert(plan.summary.remainingAfter === 350, 'remaining after');
  assert(plan.event.action === 'retain_partial', 'event action');
  assert(plan.event.amount === 150, 'event amount');
  assert(plan.event.notes === 'Cleaning damage', 'reason');
  assert(plan.event.created_by === 'staff-1', 'staff');
  assert(plan.patch.forfeited_amount === 150, 'ledger retained');
  assert(plan.patch.forfeited_at === '2026-10-20', 'date');
  assert(plan.patch.forfeiture_reason === 'Cleaning damage', 'reason on bond');
  applyRetain(plan);
  const b = sandbox.state.bonds[0];
  assert(sandbox.bondRemaining(b) === 350, `remaining ${sandbox.bondRemaining(b)}`);
  assert(sandbox.bondRetainedTotal(b) === 150, 'retained total');
  assert(sandbox.bondRefundedTotal(b) === 0, 'refunds unchanged');
  assert(/partial/i.test(sandbox.bondDepositStatus(b)), `status ${sandbox.bondDepositStatus(b)}`);
  assert(sandbox.state.bondRefundEvents.length === 1, 'history row');
  assert(sandbox.staffLabel('staff-1') === 'Alex Staff', 'staff label');
});

check('Full retention: auto uses remaining unpaid/unrefunded balance', () => {
  seedBond({ refund_amount: 100, forfeited_amount: 50, remaining_amount: 350 });
  assert(sandbox.bondRemaining(sandbox.state.bonds[0]) === 350, 'pre remaining');
  const plan = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'full',
    amount: 9999, // ignored for full
    reason: 'Tenant absconded',
    staffId: 'staff-1',
    retainedAt: '2026-10-20',
  });
  assert(plan.ok, plan.error);
  assert(plan.summary.retainingNow === 350, `full retain uses remaining, got ${plan.summary.retainingNow}`);
  assert(plan.event.action === 'retain_full', 'action');
  assert(plan.patch.forfeited_amount === 400, '50+350');
  assert(plan.patch.remaining_amount === 0, 'closed');
  applyRetain(plan);
  const b = sandbox.state.bonds[0];
  assert(sandbox.bondRemaining(b) === 0, 'remaining 0');
  assert(sandbox.bondRefundedTotal(b) === 100, 'prior refund kept');
  assert(sandbox.bondRetainedTotal(b) === 400, 'retained total');
  assert(/retain|forfeit/i.test(sandbox.bondDepositStatus(b)), sandbox.bondDepositStatus(b));
});

check('Repeated retainals accumulate without exceeding bond', () => {
  seedBond();
  applyRetain(
    sandbox.planBondRetain(sandbox.state.bonds[0], {
      mode: 'partial',
      amount: 100,
      reason: 'First keep',
      staffId: 'staff-1',
      retainedAt: '2026-10-20',
    })
  );
  applyRetain(
    sandbox.planBondRetain(sandbox.state.bonds[0], {
      mode: 'partial',
      amount: 75,
      reason: 'Second keep',
      staffId: 'staff-1',
      retainedAt: '2026-10-21',
    })
  );
  const b = sandbox.state.bonds[0];
  assert(sandbox.bondRetainedTotal(b) === 175, `retained ${sandbox.bondRetainedTotal(b)}`);
  assert(sandbox.bondRemaining(b) === 325, `remaining ${sandbox.bondRemaining(b)}`);
  assert(sandbox.state.bondRefundEvents.length === 2, 'two history rows');
  assert(sandbox.state.bondRefundEvents[0].notes === 'First keep', 'first reason');
  assert(sandbox.state.bondRefundEvents[1].notes === 'Second keep', 'second reason');
});

check('Refund after partial retention leaves prior retain + allows remainder refund', () => {
  seedBond();
  applyRetain(
    sandbox.planBondRetain(sandbox.state.bonds[0], {
      mode: 'partial',
      amount: 200,
      reason: 'Damage',
      staffId: 'staff-1',
      retainedAt: '2026-10-20',
    })
  );
  const b = sandbox.state.bonds[0];
  const priorRefund = sandbox.bondRefundedTotal(b);
  const priorRetain = sandbox.bondRetainedTotal(b);
  assert(priorRefund === 0 && priorRetain === 200, 'pre-refund state');
  // Simulate partial refund of remaining (existing refund path math)
  const refundAmt = 150;
  const rem = sandbox.bondRemaining(b);
  assert(rem === 300, '300 refundable before refund');
  b.refund_amount = Number(b.refund_amount || 0) + refundAmt;
  b.remaining_amount = Math.max(0, rem - refundAmt);
  b.remaining_description = `Remaining after partial refund: ${b.remaining_amount}`;
  sandbox.state.bondRefundEvents.push({
    bond_id: b.id,
    action: 'partial_refund',
    amount: refundAmt,
    currency: 'AUD',
    notes: 'Partial refund of remainder',
    created_by: 'staff-1',
    created_at: '2026-10-22T10:00:00.000Z',
  });
  assert(sandbox.bondRetainedTotal(b) === 200, 'retain unchanged by refund');
  assert(sandbox.bondRefundedTotal(b) === 150, 'refund recorded');
  assert(sandbox.bondRemaining(b) === 150, `remaining ${sandbox.bondRemaining(b)}`);
  assert(sandbox.bondCommittedOutflows(b) === 350, 'outflows');
  // Can still refund the last 150
  const last = sandbox.bondRemaining(b);
  b.refund_amount = Number(b.refund_amount || 0) + last;
  b.remaining_amount = 0;
  assert(sandbox.bondRemaining(b) === 0, 'fully settled');
  assert(sandbox.bondRetainedTotal(b) === 200, 'retain still 200');
  assert(sandbox.bondRefundedTotal(b) === 300, 'total refunded 300');
});

check('Over-retention prevented (amount and total vs original)', () => {
  seedBond({ refund_amount: 200, forfeited_amount: 200, remaining_amount: 100 });
  const overAmt = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 150,
    reason: 'Too much',
    staffId: 'staff-1',
  });
  assert(overAmt.ok === false, 'block > remaining');
  assert(/remain|exceed/i.test(overAmt.error || ''), overAmt.error);

  seedBond({ refund_amount: 0, forfeited_amount: 0 });
  const overBond = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 600,
    reason: 'Over original',
    staffId: 'staff-1',
  });
  assert(overBond.ok === false, 'block > original');

  seedBond({ refund_amount: 400, forfeited_amount: 50, remaining_amount: 50 });
  const okFifty = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 50,
    reason: 'Exact remaining',
    staffId: 'staff-1',
  });
  assert(okFifty.ok === true, okFifty.error);
  const tooMuch = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 50.01,
    reason: 'Penny over',
    staffId: 'staff-1',
  });
  assert(tooMuch.ok === false, 'penny over blocked');
});

check('Reason required; zero/negative amount blocked; full with nothing left blocked', () => {
  seedBond();
  assert(
    sandbox.planBondRetain(sandbox.state.bonds[0], { mode: 'partial', amount: 10, reason: '' }).ok === false,
    'reason required'
  );
  assert(
    sandbox.planBondRetain(sandbox.state.bonds[0], { mode: 'partial', amount: 0, reason: 'x' }).ok === false,
    'zero blocked'
  );
  assert(
    sandbox.planBondRetain(sandbox.state.bonds[0], { mode: 'partial', amount: -5, reason: 'x' }).ok === false,
    'negative blocked'
  );
  seedBond({
    amount: 500,
    refund_amount: 300,
    forfeited_amount: 200,
    remaining_amount: 0,
    deposit_status: 'Forfeited / Retained',
  });
  assert(
    sandbox.planBondRetain(sandbox.state.bonds[0], { mode: 'full', reason: 'again' }).ok === false,
    'nothing left'
  );
});

check('Summary fields exposed for confirmation UI', () => {
  seedBond({ refund_amount: 80, forfeited_amount: 20 });
  const plan = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 50,
    reason: 'Confirm summary',
    staffId: 'staff-1',
  });
  assert(plan.ok, plan.error);
  assert(plan.summary.original === 500, 'original');
  assert(plan.summary.alreadyRefunded === 80, 'refunded');
  assert(plan.summary.alreadyRetained === 20, 'retained');
  assert(plan.summary.retainingNow === 50, 'now');
  assert(plan.summary.remainingAfter === 350, 'after');
  assert(typeof sandbox.formatBondRetainSummary === 'function', 'format helper');
  const htmlSummary = sandbox.formatBondRetainSummary(sandbox.state.bonds[0], 'partial', 50);
  assert(/Original bond/.test(htmlSummary), 'original in summary');
  assert(/Already refunded/.test(htmlSummary), 'refunded in summary');
  assert(/Already retained/.test(htmlSummary), 'retained in summary');
  assert(/Amount being retained now/.test(htmlSummary), 'now in summary');
  assert(/Remaining refundable after/.test(htmlSummary), 'after in summary');
});

console.log(`\n${passed}/8 passed`);
if (process.exitCode) process.exit(1);
console.log('ALL PASS — retain bond');
