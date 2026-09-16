#!/usr/bin/env node
/**
 * Duplicate stay prevention — Tests A–H.
 * Shared evaluateStayCreateConflict / insertTenancySafe / inspection link reuse.
 * Never asserts unique-by-tenant-name.
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
  document: {
    querySelector: el,
    querySelectorAll: () => [],
    getElementById: el,
  },
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
sandbox.today = () => '2026-09-15';

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

function seed() {
  Object.assign(sandbox.state, {
    propertyId: 1,
    properties: [{ id: 1, name: 'McGregor' }],
    rooms: [
      { id: 15, property_id: 1, room_no: 5 },
      { id: 12, property_id: 1, room_no: 2 },
      { id: 13, property_id: 1, room_no: 3 },
    ],
    roomProfiles: [],
    tenants: [{ id: 200, name: 'Jiawen', contact_method: 'wx' }],
    tenancies: [],
    bonds: [],
    payments: [],
    paymentActions: [],
    bookingEvents: [],
    viewings: [],
    profiles: [],
  });
}

check('helpers present in UI', () => {
  assert(/evaluateStayCreateConflict/.test(html), 'evaluateStayCreateConflict');
  assert(/insertTenancySafe/.test(html), 'insertTenancySafe');
  assert(/findReusableStayForInspection/.test(html), 'findReusableStayForInspection');
  assert(/stay-conflict-dialog/.test(html), 'conflict dialog');
  assert(/An existing stay may already exist/.test(html), 'warning copy');
});

check('TEST A Inspection stay then + New Stay same tenant/room/dates → blocked', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 501,
      tenant_id: 200,
      room_id: 15,
      check_in: '2026-09-20',
      check_out: '2026-09-30',
      status: 'upcoming',
      notes: 'SOURCE:inspection_deposit\nVIEWING_ID:88',
    },
  ];
  const c = sandbox.evaluateStayCreateConflict({
    tenantId: 200,
    roomId: 15,
    checkIn: '2026-09-20',
    checkOut: '2026-09-30',
  });
  assert(c.level === 'duplicate', `level=${c.level}`);
  assert(c.matches[0].id === 501, 'points at existing stay id');
  let threw = false;
  try {
    sandbox.assertCanCreateStay({
      tenant_id: 200,
      room_id: 15,
      check_in: '2026-09-20',
      check_out: '2026-09-30',
      status: 'upcoming',
    });
  } catch (e) {
    threw = true;
    assert(e.stayConflict?.level === 'duplicate', 'error carries conflict');
  }
  assert(threw, 'assertCanCreateStay throws');
});

check('TEST B Manual stay first → Inspection deposit links existing (no second stay)', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 502,
      tenant_id: 200,
      room_id: 15,
      check_in: '2026-09-20',
      check_out: '2026-09-30',
      status: 'upcoming',
      notes: 'SOURCE:manual_stay',
    },
  ];
  sandbox.state.viewings = [
    {
      id: 90,
      visitor_name: 'Jiawen',
      property_id: 1,
      room_id: 15,
      intended_check_in: '2026-09-20',
      intended_check_out: '2026-09-30',
      deposit_amount: 200,
      deposit_currency: 'AUD',
      notes: '',
      status: 'scheduled',
    },
  ];
  const plan = sandbox.buildConfirmDepositStayPlan(sandbox.state.viewings[0], {
    amount: 200,
    check_in: '2026-09-20',
    check_out: '2026-09-30',
    room_id: 15,
  });
  assert(plan.idempotent === true, 'idempotent link');
  assert(plan.linkedExistingStay === true, 'linkedExistingStay');
  assert(plan.tenancy.id === 502, 'reuses stay 502');
  assert(String(plan.viewingPatch.notes).includes('TENANCY_ID:502'), 'TENANCY_ID linked');
  assert(sandbox.state.tenancies.length === 1, 'still one stay in state');
});

check('TEST C Substantial overlap same tenant/room → conflict', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 503,
      tenant_id: 200,
      room_id: 15,
      check_in: '2026-09-20',
      check_out: '2026-09-30',
      status: 'upcoming',
    },
  ];
  const c = sandbox.evaluateStayCreateConflict({
    tenantId: 200,
    roomId: 15,
    checkIn: '2026-09-22',
    checkOut: '2026-09-30',
  });
  assert(c.level === 'overlap' || c.level === 'extension', `level=${c.level}`);
  assert(c.matches[0].id === 503, 'match id');
});

check('TEST D Non-overlapping future stay same tenant → allowed', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 504,
      tenant_id: 200,
      room_id: 12,
      check_in: '2026-09-01',
      check_out: '2026-09-10',
      status: 'upcoming',
    },
  ];
  const c = sandbox.evaluateStayCreateConflict({
    tenantId: 200,
    roomId: 13,
    checkIn: '2026-10-20',
    checkOut: '2026-10-30',
  });
  assert(c.level === 'none', `level=${c.level}`);
});

check('TEST E Returning historical + new future → allowed', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 505,
      tenant_id: 200,
      room_id: 12,
      check_in: '2026-07-01',
      check_out: '2026-07-20',
      status: 'completed',
    },
  ];
  const c = sandbox.evaluateStayCreateConflict({
    tenantId: 200,
    roomId: 15,
    checkIn: '2026-09-25',
    checkOut: '2026-09-30',
  });
  assert(c.level === 'none', 'historical ignored');
  assert(sandbox.isOperationallyClosed(sandbox.state.tenancies[0]) === true, 'historical closed');
});

check('TEST F Split stay multi-segment → not treated as duplicate', () => {
  seed();
  const gid = 'split-prevent-1';
  sandbox.state.tenancies = [
    {
      id: 601,
      tenant_id: 200,
      room_id: 12,
      check_in: '2026-09-13',
      check_out: '2026-09-16',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
  ];
  // Creating second segment of same journey in one multi-segment save: skipContinuation
  const c = sandbox.evaluateStayCreateConflict(
    {
      tenantId: 200,
      roomId: 13,
      checkIn: '2026-09-16',
      checkOut: '2026-09-20',
    },
    { pendingSegments: [{}, {}], skipContinuation: true }
  );
  assert(c.level === 'none', `split allowed level=${c.level}`);
});

check('TEST G Extension detected → open/extend existing, not new stay', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 701,
      tenant_id: 200,
      room_id: 15,
      check_in: '2026-09-20',
      check_out: '2026-09-30',
      status: 'upcoming',
    },
  ];
  const c = sandbox.evaluateStayCreateConflict({
    tenantId: 200,
    roomId: 15,
    checkIn: '2026-09-20',
    checkOut: '2026-10-05',
  });
  assert(c.level === 'extension', `level=${c.level}`);
  assert(c.matches[0].id === 701, 'extend stay 701');
});

check('TEST H Same/similar name different Tenant IDs → not name-deduped', () => {
  seed();
  sandbox.state.tenants = [
    { id: 200, name: 'Jiawen' },
    { id: 201, name: 'Jiawen' },
  ];
  sandbox.state.tenancies = [
    {
      id: 801,
      tenant_id: 200,
      room_id: 15,
      check_in: '2026-09-20',
      check_out: '2026-09-30',
      status: 'upcoming',
    },
  ];
  assert(sandbox.findTenantByExactName('Jiawen') === null, 'ambiguous name → null singular');
  assert(sandbox.findTenantsByExactName('Jiawen').length === 2, 'both IDs kept');
  // Different tenant id with same dates/room must NOT be blocked by name
  const c = sandbox.evaluateStayCreateConflict({
    tenantId: 201,
    roomId: 15,
    checkIn: '2026-09-20',
    checkOut: '2026-09-30',
  });
  assert(c.level === 'none', 'other Tenant ID not blocked by name');
  let amb = false;
  try {
    sandbox.resolveTenantForStayCreate({ name: 'Jiawen' });
  } catch (e) {
    amb = e.code === 'ambiguous_tenant';
  }
  assert(amb, 'resolve requires explicit Tenant ID when names collide');
});

check('resolveTenant reuses single exact-name match by ID', () => {
  seed();
  const r = sandbox.resolveTenantForStayCreate({ name: 'Jiawen' });
  assert(r.reuse && r.tenant.id === 200, 'reuse tenant 200');
});

console.log(`\n${passed}/10 passed`);
if (process.exitCode) process.exit(1);
console.log('ALL PASS — duplicate stay prevention A–H');
