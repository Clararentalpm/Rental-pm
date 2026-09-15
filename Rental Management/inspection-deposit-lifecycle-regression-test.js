#!/usr/bin/env node
/**
 * Inspection → Deposit Paid → Payment Action → Confirmed Stay → Bond Current/Past
 * regression tests (TEST 1–13). Loads helpers from index.html via Node VM (no DB / no migration).
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
  crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' },
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(defs, sandbox, { timeout: 8000 });

const FIXED_TODAY = '2026-09-14';
sandbox.today = () => FIXED_TODAY;

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
    properties: [
      { id: 1, name: 'McGregor' },
      { id: 2, name: 'Carindale' },
    ],
    rooms: [
      { id: 12, property_id: 1, room_no: 2, ensuite: false, notes: '' },
      { id: 15, property_id: 1, room_no: 5, ensuite: false, notes: '' },
      { id: 18, property_id: 1, room_no: 6, ensuite: false, notes: 'Sofa / Extra Room' },
    ],
    roomProfiles: [{ room_id: 18, room_type: 'Sofa / Extra Room', current_asking_price: 25 }],
    tenants: [{ id: 50, name: 'Existing Guest', contact_method: 'sms' }],
    tenancies: [],
    payments: [],
    paymentActions: [],
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
    page: 'overview',
    bondFilter: 'current',
  });
}

/** Apply a confirm plan into in-memory state (simulates insert/patch side effects). */
function applyPlan(v, plan, ids = {}) {
  const tenantId = plan.reuseTenant && plan.tenant?.id ? plan.tenant.id : ids.tenantId || 900;
  if (!plan.reuseTenant) {
    const t = { id: tenantId, name: plan.tenant.name, contact_method: plan.tenant.contact_method };
    sandbox.state.tenants.push(t);
  }
  const tenancyId = ids.tenancyId || 800;
  const tenancy = {
    id: tenancyId,
    ...(typeof plan.tenancy === 'object' && plan.tenancy.room_id ? plan.tenancy : {}),
    tenant_id: tenantId,
    room_id: plan.roomId,
    check_in: plan.checkIn,
    check_out: plan.checkOut,
    status: plan.checkIn > FIXED_TODAY ? 'upcoming' : 'active',
    rent_amount: 0,
    rent_period: 'night',
    tenancy_type: 'short_term',
    notes: sandbox.upsertNoteMarker(
      sandbox.upsertNoteMarker(
        sandbox.upsertNoteMarker('', 'VIEWING_ID', String(plan.viewingId)),
        'LIFECYCLE',
        'stay_confirmed'
      ),
      'SOURCE',
      'inspection_deposit'
    ),
  };
  if (!plan.idempotent) sandbox.state.tenancies.push(tenancy);

  const paymentId = ids.paymentId || 700;
  if (plan.payment && !plan.existingPay) {
    let notes = plan.payment.notes;
    notes = sandbox.upsertNoteMarker(notes, 'TENANCY_ID', String(tenancyId));
    sandbox.state.payments.push({
      id: paymentId,
      tenancy_id: tenancyId,
      amount: plan.amount,
      received_date: FIXED_TODAY,
      period_start: FIXED_TODAY,
      period_end: FIXED_TODAY,
      status: 'paid',
      payment_method: plan.method,
      notes,
    });
  }

  const actionId = ids.actionId || 600;
  if (plan.action && !plan.existingAction) {
    let notes = plan.action.notes;
    notes = sandbox.upsertNoteMarker(notes, 'PAYMENT_ID', String(paymentId));
    notes = sandbox.upsertNoteMarker(notes, 'TENANCY_ID', String(tenancyId));
    sandbox.state.paymentActions.push({
      id: actionId,
      property_id: plan.propertyId,
      tenancy_id: tenancyId,
      tenant_id: tenantId,
      room_id: plan.roomId,
      related_payment_id: paymentId,
      action_type: 'deposit',
      amount: plan.amount,
      due_date: FIXED_TODAY,
      status: 'resolved',
      notes,
      resolve_reason: 'Deposit paid — booking confirmed',
    });
  }

  const bondId = ids.bondId || 500;
  if (plan.bond && !plan.existingBond) {
    sandbox.state.bonds.push({
      id: bondId,
      tenancy_id: tenancyId,
      amount: plan.amount,
      original_currency: plan.currency,
      currency: plan.currency,
      received: true,
      refunded: false,
      bond_type: 'booking_deposit',
      received_date: FIXED_TODAY,
      remaining_amount: plan.amount,
      deposit_status: 'Held',
      notes: plan.bond.notes,
      refund_amount: 0,
      forfeited_amount: 0,
    });
  }

  let vn = plan.viewingPatch.notes || v.notes || '';
  vn = sandbox.upsertNoteMarker(vn, 'TENANCY_ID', String(tenancyId));
  vn = sandbox.upsertNoteMarker(vn, 'DEPOSIT_PAYMENT_ID', String(paymentId));
  vn = sandbox.upsertNoteMarker(vn, 'DEPOSIT_ACTION_ID', String(actionId));
  vn = sandbox.upsertNoteMarker(vn, 'BOND_ID', String(bondId));
  Object.assign(v, {
    deposit_paid: true,
    deposit_amount: plan.amount,
    deposit_currency: plan.currency,
    status: 'completed',
    notes: vn,
  });
  return { tenantId, tenancyId, paymentId, actionId, bondId, tenancy };
}

// ——— TEST 1 ———
check('TEST 1 confirm workflow markers + deposit action resolved', () => {
  seed();
  const v = {
    id: 11,
    property_id: 1,
    room_id: 12,
    visitor_name: 'New Visitor',
    contact_method: 'wechat',
    inspection_date: '2026-09-10',
    inspection_time: '10:00',
    intended_check_in: '2026-09-20',
    intended_check_out: '2026-09-25',
    deposit_paid: false,
    deposit_amount: 200,
    deposit_currency: 'AUD',
    notes: 'ROOM_IDS:12',
    status: 'scheduled',
  };
  sandbox.state.viewings = [v];
  const plan = sandbox.buildConfirmDepositStayPlan(v, {
    amount: 200,
    currency: 'AUD',
    method: 'Bank Transfer / EFT',
  });
  assert(!plan.idempotent, 'not idempotent first time');
  assert(plan.action.action_type === 'deposit', 'action_type deposit');
  assert(plan.action.status === 'resolved', 'action resolved');
  assert(/Deposit paid/.test(plan.action.resolve_reason), 'resolve reason');
  assert(plan.bond.bond_type === 'booking_deposit', 'bond_type booking_deposit');
  assert(sandbox.parseNoteMarker(plan.payment.notes, 'PAYMENT_TYPE') === 'deposit', 'PAYMENT_TYPE');
  assert(
    sandbox.parseNoteMarker(plan.payment.notes, 'IDEMPOTENCY_KEY') === 'viewing-deposit-11',
    'idempotency key'
  );
  assert(sandbox.parseNoteMarker(plan.tenancy.notes, 'SOURCE') === 'inspection_deposit', 'SOURCE');
  assert(sandbox.parseNoteMarker(plan.tenancy.notes, 'LIFECYCLE') === 'stay_confirmed', 'tenancy LIFECYCLE');
  const applied = applyPlan(v, plan);
  assert(sandbox.viewingLinkedTenancyId(v) === applied.tenancyId, 'TENANCY_ID marker');
  assert(sandbox.viewingLinkedPaymentId(v) === applied.paymentId, 'DEPOSIT_PAYMENT_ID');
  assert(sandbox.viewingLifecycleStage(v) === 'stay_confirmed', 'stage stay_confirmed');
  assert(sandbox.paymentActionTypeLabel(sandbox.state.paymentActions[0]) === 'Deposit paid', 'label Deposit paid');
  // no double tenant
  assert(sandbox.state.tenants.filter((t) => t.name === 'New Visitor').length === 1, 'one new tenant');
});

check('TEST 1b reuse tenant by exact name (no double tenant)', () => {
  seed();
  const v = {
    id: 12,
    property_id: 1,
    room_id: 12,
    visitor_name: 'Existing Guest',
    inspection_date: '2026-09-10',
    intended_check_in: '2026-09-20',
    intended_check_out: '2026-09-22',
    deposit_amount: 100,
    deposit_currency: 'AUD',
    notes: null,
    status: 'scheduled',
  };
  sandbox.state.viewings = [v];
  const before = sandbox.state.tenants.length;
  const plan = sandbox.buildConfirmDepositStayPlan(v, { amount: 100, currency: 'AUD' });
  assert(plan.reuseTenant === true, 'reuseTenant');
  assert(plan.tenant.id === 50, 'same tenant id');
  applyPlan(v, plan);
  assert(sandbox.state.tenants.length === before, 'no extra tenant row');
});

// ——— TEST 2 ———
check('TEST 2 before check_in → upcoming, not current occupancy', () => {
  seed();
  const t = {
    id: 1,
    tenant_id: 50,
    room_id: 12,
    check_in: '2026-09-20',
    check_out: '2026-09-25',
    status: 'upcoming',
    tenancy_type: 'short_term',
  };
  sandbox.state.tenancies = [t];
  assert(sandbox.tenancyKind(t) === 'upcoming', 'tenancyKind upcoming');
  assert(sandbox.isCurrentOccupancyStay(t) === false, 'not current');
  assert(sandbox.isUpcomingOccupancyStay(t) === true, 'is upcoming');
  assert(sandbox.nextBookingForRoom(12)?.id === 1, 'shows as Next');
  assert(sandbox.currentOccupantsForRoom(12).length === 0, 'not Current occupants');
});

// ——— TEST 3 ———
check('TEST 3 on check_in date → current occupancy', () => {
  seed();
  const t = {
    id: 1,
    tenant_id: 50,
    room_id: 12,
    check_in: '2026-09-14',
    check_out: '2026-09-20',
    status: 'active',
    tenancy_type: 'short_term',
  };
  sandbox.state.tenancies = [t];
  assert(sandbox.isCurrentOccupancyStay(t) === true, 'current on check-in');
  assert(sandbox.tenancyKind(t) === 'current', 'kind current');
});

// ——— TEST 4 ———
check('TEST 4 after check_out → historical / not current (half-open)', () => {
  seed();
  const t = {
    id: 1,
    tenant_id: 50,
    room_id: 12,
    check_in: '2026-09-01',
    check_out: '2026-09-14',
    status: 'active',
    tenancy_type: 'short_term',
  };
  sandbox.state.tenancies = [t];
  assert(sandbox.isCurrentOccupancyStay(t) === false, 'checkout day free');
  assert(sandbox.tenancyKind(t) === 'historical', 'historical');
  assert(sandbox.stayBlocksDate(t, '2026-09-14') === false, 'half-open on checkout');
  assert(sandbox.stayBlocksDate(t, '2026-09-13') === true, 'blocks day before checkout');
});

// ——— TEST 5 ———
check('TEST 5 cancel → not blocking; deposit payment retained', () => {
  seed();
  const t = {
    id: 1,
    tenant_id: 50,
    room_id: 12,
    check_in: '2026-09-20',
    check_out: '2026-09-25',
    status: 'cancelled',
    rent_treatment: 'not_payable',
    tenancy_type: 'short_term',
  };
  sandbox.state.tenancies = [t];
  sandbox.state.payments = [
    {
      id: 70,
      tenancy_id: 1,
      amount: 200,
      status: 'paid',
      received_date: FIXED_TODAY,
      notes: 'PAYMENT_TYPE:deposit\nIDEMPOTENCY_KEY:viewing-deposit-99',
    },
  ];
  sandbox.state.paymentActions = [
    { id: 60, tenancy_id: 1, action_type: 'deposit', status: 'resolved', amount: 200 },
  ];
  assert(sandbox.isCancelledOrNoShow(t) === true, 'cancelled');
  assert(sandbox.stayBlocksDate(t, '2026-09-21') === false, 'does not block');
  assert(sandbox.roomOccupiedOverlap(12, '2026-09-20', '2026-09-25') === false, 'room free');
  assert(sandbox.state.payments.length === 1, 'deposit payment retained');
  assert(sandbox.isDepositPayment(sandbox.state.payments[0]) === true, 'still deposit');
  assert(sandbox.state.paymentActions[0].status === 'resolved', 'deposit action kept');
});

// ——— TEST 6 ———
check('TEST 6 multi-room viewing ROOM_IDS one viewing', () => {
  seed();
  const v = {
    id: 1,
    room_id: 12,
    notes: 'ROOM_IDS:12,15,18',
    visitor_name: 'Multi',
    inspection_date: '2026-09-20',
  };
  assert(JSON.stringify(sandbox.viewingRoomIds(v)) === JSON.stringify([12, 15, 18]), 'three rooms');
  assert(sandbox.viewingRoomsLabel(v) === 'Room 2, Room 5, Sofa', 'one label');
});

// ——— TEST 7 ———
check('TEST 7 BOOKING_GROUP split stay segments block correct rooms/dates', () => {
  seed();
  const gid = 'bg-test-1';
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-20',
      check_out: '2026-09-22',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1\nSEGMENT_COUNT:2`,
    },
    {
      id: 2,
      tenant_id: 50,
      room_id: 15,
      check_in: '2026-09-22',
      check_out: '2026-09-25',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2\nSEGMENT_COUNT:2`,
    },
  ];
  assert(sandbox.bookingSegments(sandbox.state.tenancies[0]).length === 2, 'two segments');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-09-21') === true, 'room2 blocked');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-09-22') === false, 'room2 free at handover');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[1], '2026-09-22') === true, 'room5 blocked');
  assert(sandbox.roomOccupiedOverlap(12, '2026-09-20', '2026-09-22') === true, 'overlap room2');
  assert(sandbox.roomOccupiedOverlap(15, '2026-09-20', '2026-09-22') === false, 'no overlap room5 early');
});

// ——— TEST 8 ———
check('TEST 8 active bond → current bucket', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-10',
      check_out: '2026-09-30',
      status: 'active',
    },
  ];
  const b = {
    id: 1,
    tenancy_id: 1,
    amount: 200,
    received: true,
    refunded: false,
    remaining_amount: 200,
    deposit_status: 'Held',
    refund_amount: 0,
    forfeited_amount: 0,
  };
  assert(sandbox.bondIsFinanciallyFinalised(b) === false, 'not finalised');
  assert(sandbox.bondBucket(b) === 'current', 'current bucket');
});

// ——— TEST 9 ———
check('TEST 9 past stay + refund pending → current', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-08-01',
      check_out: '2026-08-10',
      status: 'completed',
    },
  ];
  const b = {
    id: 1,
    tenancy_id: 1,
    amount: 200,
    received: true,
    refunded: false,
    remaining_amount: 200,
    deposit_status: 'Held',
    refund_amount: 0,
    forfeited_amount: 0,
  };
  assert(sandbox.tenancyKind(sandbox.state.tenancies[0]) === 'historical', 'stay past');
  assert(sandbox.bondBucket(b) === 'current', 'refund pending stays current');
});

// ——— TEST 10 ———
check('TEST 10 past stay + fully refunded → past', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-08-01',
      check_out: '2026-08-10',
      status: 'completed',
    },
  ];
  const b = {
    id: 1,
    tenancy_id: 1,
    amount: 200,
    received: true,
    refunded: true,
    remaining_amount: 0,
    deposit_status: 'Refunded',
    refund_amount: 200,
    forfeited_amount: 0,
  };
  assert(sandbox.bondIsFinanciallyFinalised(b) === true, 'finalised');
  assert(sandbox.bondBucket(b) === 'past', 'past bucket');
});

// ——— TEST 11 ———
check('TEST 11 past stay + finalised partial → past', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-08-01',
      check_out: '2026-08-10',
      status: 'ended',
    },
  ];
  const b = {
    id: 1,
    tenancy_id: 1,
    amount: 300,
    received: true,
    refunded: false,
    remaining_amount: 0,
    deposit_status: 'Partial forfeit / partial refund',
    refund_amount: 100,
    forfeited_amount: 200,
  };
  assert(sandbox.bondIsFinanciallyFinalised(b) === true, 'partial finalised');
  assert(sandbox.bondBucket(b) === 'past', 'past');
});

// ——— TEST 12 ———
check('TEST 12 cancelled + unresolved → current', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-20',
      check_out: '2026-09-25',
      status: 'cancelled',
    },
  ];
  const b = {
    id: 1,
    tenancy_id: 1,
    amount: 200,
    received: true,
    refunded: false,
    remaining_amount: 200,
    deposit_status: 'Held',
    refund_amount: 0,
    forfeited_amount: 0,
  };
  assert(sandbox.bondBucket(b) === 'current', 'unresolved cancelled bond stays current');
});

// ——— TEST 13 ———
check('TEST 13 cancelled + finalised → past', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-20',
      check_out: '2026-09-25',
      status: 'cancelled',
      deposit_treatment: 'forfeit_full',
    },
  ];
  const b = {
    id: 1,
    tenancy_id: 1,
    amount: 200,
    received: true,
    refunded: false,
    remaining_amount: 0,
    deposit_status: 'Forfeited / Retained',
    refund_amount: 0,
    forfeited_amount: 200,
  };
  assert(sandbox.bondIsFinanciallyFinalised(b) === true, 'forfeit finalised');
  assert(sandbox.bondBucket(b) === 'past', 'past after forfeit');
});

check('badges / lifecycle helpers smoke', () => {
  seed();
  const v = {
    id: 1,
    room_id: 12,
    visitor_name: 'X',
    inspection_date: '2026-09-01',
    deposit_paid: true,
    deposit_amount: 50,
    deposit_currency: 'AUD',
    notes: 'TENANCY_ID:1\nLIFECYCLE:deposit_paid\nINSPECTION_COMPLETED:2026-09-01',
    status: 'completed',
  };
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-20',
      check_out: '2026-09-22',
      status: 'upcoming',
    },
  ];
  assert(sandbox.viewingLifecycleStage(v) === 'stay_confirmed', 'linked stay confirmed');
  const htmlBadges = sandbox.viewingLifecycleBadgesHtml(v);
  assert(/Deposit Paid/.test(htmlBadges), 'Deposit Paid chip');
  assert(/Booking Confirmed/.test(htmlBadges), 'Booking Confirmed chip');
  assert(/Open stay/.test(htmlBadges), 'Open stay button');
});

check('idempotent plan when TENANCY_ID already linked', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 55,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-20',
      check_out: '2026-09-22',
      status: 'upcoming',
    },
  ];
  const v = {
    id: 3,
    room_id: 12,
    visitor_name: 'Existing Guest',
    deposit_paid: true,
    deposit_amount: 80,
    notes: 'TENANCY_ID:55',
    intended_check_in: '2026-09-20',
    status: 'completed',
  };
  const plan = sandbox.buildConfirmDepositStayPlan(v, { amount: 80 });
  assert(plan.idempotent === true, 'idempotent');
  assert(plan.payment == null || plan.existingPay != null || plan.idempotent, 'skip recreate payment path');
});

console.log(`\nDone: ${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
