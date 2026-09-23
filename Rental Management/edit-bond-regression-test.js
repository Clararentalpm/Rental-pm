#!/usr/bin/env node
/**
 * Edit Bond — correct existing bond in place (no duplicate Bond Paid).
 * Tests 1–7 from the Edit Recorded Bond requirement.
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
sandbox.today = () => '2026-09-16';

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
    tenants: [{ id: 10, name: 'Jiawen' }],
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
        id: 1,
        tenancy_id: 100,
        amount: 500,
        original_currency: 'AUD',
        currency: 'AUD',
        received: true,
        refunded: false,
        received_date: '2026-09-16',
        received_via: 'Cash',
        bond_type: 'rental_bond',
        notes: '',
        remaining_amount: 500,
        refund_amount: 0,
        forfeited_amount: 0,
        deduction_amount: 0,
        ...extra,
      },
    ],
    bondRefundEvents: [],
    bondEvents: [],
    payments: [],
    paymentActions: [],
    profiles: [{ id: 'u1', display_name: 'Owner', role: 'owner' }],
  });
}

check('UI Edit Bond + Record Refund labels + planBondEdit helper', () => {
  assert(/Edit Bond/.test(html), 'Edit Bond button');
  assert(/Record Refund/.test(html), 'Record Refund button');
  assert(/planBondEdit/.test(html), 'planBondEdit');
  assert(/validateBondAmountEdit/.test(html), 'validateBondAmountEdit');
  assert(/action:'edit_bond'/.test(html) || /action:"edit_bond"/.test(html) || /'edit_bond'/.test(html), 'edit_bond audit action');
});

check('TEST 1 Record $500 → Edit to $550 → one bond, amount 550', () => {
  seedBond();
  const plan = sandbox.planBondEdit(sandbox.state.bonds[0], {
    amount: 550,
    received_date: '2026-09-16',
    received_via: 'Cash',
    edit_reason: 'Typo correction',
  });
  assert(plan.ok === true, plan.error || 'ok');
  assert(plan.patch.amount === 550, 'patch amount');
  assert(plan.patch.remaining_amount === 550, 'remaining synced');
  assert(plan.audit.previous_amount === 500 && plan.audit.new_amount === 550, 'audit amounts');
  assert(/500 → 550/.test(plan.audit.notes), `audit notes ${plan.audit.notes}`);
  // Simulate applying patch to the same record (not insert)
  Object.assign(sandbox.state.bonds[0], plan.patch);
  assert(sandbox.state.bonds.length === 1, 'still one bond');
  assert(sandbox.bondRemaining(sandbox.state.bonds[0]) === 550, 'remaining display 550');
  assert(sandbox.bondBucket(sandbox.state.bonds[0]) === 'open', 'stays open');
});

check('TEST 2 Edit payment method / date / reference updates same record', () => {
  seedBond();
  const plan = sandbox.planBondEdit(sandbox.state.bonds[0], {
    amount: 500,
    received_date: '2026-09-15',
    received_via: 'EFT',
    reference: 'TX-99',
    notes: 'Corrected method',
  });
  assert(plan.ok, plan.error);
  assert(plan.patch.received_date === '2026-09-15', 'date');
  assert(plan.patch.received_via === 'EFT', 'method');
  assert(/BOND_REFERENCE:TX-99/.test(plan.patch.notes || ''), 'reference in notes');
  assert(plan.changes.some((c) => c.field === 'received_via'), 'via change audited');
  assert(plan.changes.some((c) => c.field === 'reference'), 'ref change audited');
});

check('TEST 3 Consistent amount via bondForTenancy / remaining / status', () => {
  seedBond();
  const plan = sandbox.planBondEdit(sandbox.state.bonds[0], { amount: 550 });
  Object.assign(sandbox.state.bonds[0], plan.patch);
  const b = sandbox.bondForTenancy(100);
  assert(b.id === 1 && Number(b.amount) === 550, 'tenancy bond SoT');
  assert(sandbox.bondRemaining(b) === 550, 'remaining');
  assert(sandbox.bondDepositStatus(b) === 'Held' || /Held/i.test(sandbox.bondDepositStatus(b)), 'status');
});

check('TEST 4 Audit history old → new', () => {
  seedBond();
  const plan = sandbox.planBondEdit(sandbox.state.bonds[0], {
    amount: 550,
    edit_reason: 'Wrong amount entered',
  });
  assert(plan.audit.action === 'edit_bond', 'action');
  assert(plan.audit.previous_amount === 500, 'old');
  assert(plan.audit.new_amount === 550, 'new');
  assert(/Wrong amount entered/.test(plan.audit.notes), 'reason in audit');
});

check('TEST 5 No refund → edit allowed', () => {
  seedBond({ refund_amount: 0, forfeited_amount: 0, deduction_amount: 0 });
  assert(sandbox.validateBondAmountEdit(sandbox.state.bonds[0], 550) === '', 'allowed');
  assert(sandbox.planBondEdit(sandbox.state.bonds[0], { amount: 450 }).ok === true, 'reduce ok');
});

check('TEST 6 Partial/full refund → inconsistent edit blocked', () => {
  seedBond({ refund_amount: 400, remaining_amount: 100 });
  const err = sandbox.validateBondAmountEdit(sandbox.state.bonds[0], 300);
  assert(!!err, 'blocked when amount < refunded');
  assert(/400/.test(err), err);
  const plan = sandbox.planBondEdit(sandbox.state.bonds[0], { amount: 300 });
  assert(plan.ok === false, 'plan blocked');
  // Allowed when new amount still covers outflows
  const ok = sandbox.planBondEdit(sandbox.state.bonds[0], { amount: 450 });
  assert(ok.ok === true, '450 ok');
  assert(ok.patch.remaining_amount === 50, `remaining ${ok.patch.remaining_amount}`);
  assert(!!ok.warning, 'warning when outflows exist');
});

check('TEST 7 Edit does not invent duplicate bond/tenant/stay', () => {
  seedBond();
  const before = {
    bonds: sandbox.state.bonds.length,
    tenants: sandbox.state.tenants.length,
    tenancies: sandbox.state.tenancies.length,
  };
  const plan = sandbox.planBondEdit(sandbox.state.bonds[0], { amount: 550 });
  Object.assign(sandbox.state.bonds[0], plan.patch);
  assert(sandbox.state.bonds.length === before.bonds, 'no new bond');
  assert(sandbox.state.tenants.length === before.tenants, 'no new tenant');
  assert(sandbox.state.tenancies.length === before.tenancies, 'no new stay');
  assert(sandbox.bondBucket(sandbox.state.bonds[0]) === 'open', 'bucket unchanged');
});

check('Full forfeit: cannot reduce below forfeited', () => {
  seedBond({
    amount: 500,
    forfeited_amount: 500,
    remaining_amount: 0,
    deposit_status: 'Forfeited / Retained',
  });
  assert(!!sandbox.validateBondAmountEdit(sandbox.state.bonds[0], 400), 'block');
  assert(sandbox.planBondEdit(sandbox.state.bonds[0], { amount: 500 }).ok === true, 'same amount ok');
});

console.log(`\n${passed}/9 passed`);
if (process.exitCode) process.exit(1);
console.log('ALL PASS — edit recorded bond');
