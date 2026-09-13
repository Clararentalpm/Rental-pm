#!/usr/bin/env node
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
      { id: 1, property_id: 1, room_no: 2, ensuite: false, notes: '' },
      { id: 2, property_id: 1, room_no: 5, ensuite: false, notes: '' },
      { id: 4, property_id: 2, room_no: 4, ensuite: false, notes: '' },
      { id: 14, property_id: 1, room_no: 4, ensuite: true, notes: '' },
    ],
    tenants: [
      { id: 10, name: 'Iris Zhao' },
      { id: 11, name: 'LaDou' },
      { id: 12, name: 'Vicky' },
    ],
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
    roomProfiles: [],
    page: 'overview',
  });
}

check('checkout half-open 11->14 Sep', () => {
  seed();
  const t = {
    id: 1,
    tenant_id: 10,
    room_id: 2,
    check_in: '2026-09-11',
    check_out: '2026-09-14',
    status: 'active',
    tenancy_type: 'short_term',
    rent_amount: 35,
    rent_period: 'night',
  };
  sandbox.state.tenancies = [t];
  assert(sandbox.stayBlocksDate(t, '2026-09-11') === true, '11');
  assert(sandbox.stayBlocksDate(t, '2026-09-12') === true, '12');
  assert(sandbox.stayBlocksDate(t, '2026-09-13') === true, '13');
  assert(sandbox.stayBlocksDate(t, '2026-09-14') === false, '14 free');
  assert(sandbox.stayBlocksDate(t, '2026-09-15') === false, '15 free');
  assert(sandbox.stayNights(t) === 3, '3 nights');
});

check('displayPaymentNotes strips metadata', () => {
  assert(sandbox.displayPaymentNotes({ notes: 'IDEMPOTENCY_KEY:abc' }) === '', 'idem');
  assert(sandbox.displayPaymentNotes({ notes: 'ACTION_ID:1' }) === '', 'action');
  assert(sandbox.displayPaymentNotes({ notes: 'PAYMENT_CURRENCY:AUD' }) === '', 'cur');
  assert(sandbox.displayPaymentNotesOrDash({ notes: '' }) === '—', 'dash');
  assert(sandbox.displayPaymentNotes({ notes: 'Paid cash' }) === 'Paid cash', 'user');
});

check('tenancy blockers', () => {
  seed();
  sandbox.state.payments = [{ id: 1, tenancy_id: 1, amount: 100, status: 'paid', notes: '' }];
  sandbox.state.bonds = [];
  sandbox.state.paymentActions = [];
  sandbox.state.bookingEvents = [];
  assert(sandbox.tenancyHasRecordedPayments(1) === true, 'has');
  assert(sandbox.tenancyDeleteBlockers(1).some((b) => /payment/i.test(b)), 'blocker');
});

check('financial KPIs', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 1,
      room_id: 1,
      tenant_id: 11,
      check_in: '2026-01-01',
      check_out: null,
      status: 'active',
      tenancy_type: 'long_term',
      rent_amount: 280,
      rent_period: 'week',
    },
  ];
  sandbox.state.payments = [
    { id: 1, tenancy_id: 1, amount: 280, status: 'paid', received_date: '2026-09-10', notes: '' },
  ];
  assert(sandbox.contractedWeeklyRentRoll() >= 280, 'roll');
  const wb = sandbox.weekBounds('2026-09-13');
  assert(sandbox.actualRentalIncomeInRange(wb.start, wb.end) === 280, 'actual');
  const occ = sandbox.occupancyStats('2026-09-13', '2026-09-13');
  assert(occ.occupancyPct > 0 || occ.occupied > 0, 'occ');
  const tipHtml = sandbox.tip('Weekly equivalent of active rental agreements.');
  assert(tipHtml.includes('kpi-tip') && tipHtml.includes('Weekly equivalent'), 'tip');
});

check('demand signal', () => {
  assert(/strong/i.test(sandbox.demandSignal({ occupancyPct: 0.92, vacancyPct: 0.08 }).label), 'strong');
  assert(/weak/i.test(sandbox.demandSignal({ occupancyPct: 0.4, vacancyPct: 0.5 }).label), 'weak');
});

check('SMS not configured', () => {
  assert(sandbox.smsServiceConfigured() === false, 'sms');
});

check('UI markers', () => {
  for (const m of [
    'find-result-panel',
    'AVAILABLE FOR SELECTED PERIOD',
    'PARTIALLY AVAILABLE',
    'NOT AVAILABLE',
    'edit-bond',
    'openBondEdit',
    'deleteStay',
    'This stay has recorded payments',
    'schedule-search',
    'SMS service not configured',
    'Historical performance',
    'Contracted weekly rent roll',
    'name="ensuite"',
    'send-viewing-sms',
    'dataset.busy',
    'identical inspection',
  ]) {
    assert(html.includes(m), m);
  }
});

check('Carindale SQL', () => {
  const sql = fs.readFileSync(path.join(__dirname, 'supabase_carindale_room4_ensuite_fix.sql'), 'utf8');
  assert(/ensuite\s*=\s*false/i.test(sql), 'ensuite false');
  assert(/Carindale/i.test(sql), 'carindale');
  assert(/McGregor/i.test(sql), 'mcgregor');
});

check('Black Gun checkout day', () => {
  seed();
  const t = {
    id: 99,
    tenant_id: 10,
    room_id: 2,
    check_in: '2026-09-11',
    check_out: '2026-09-14',
    status: 'active',
    tenancy_type: 'short_term',
    rent_amount: 35,
    rent_period: 'night',
    notes: 'Black Gun',
  };
  sandbox.state.tenancies = [t];
  assert(sandbox.stayBlocksDate(t, '2026-09-14') === false, '14');
  assert(sandbox.stayBlocksDate(t, '2026-09-15') === false, '15');
});

check('room status current occupants exclude past/cancelled/future', () => {
  seed();
  const today = sandbox.today();
  Object.assign(sandbox.state, {
    propertyId: 1,
    properties: [{ id: 1, name: 'McGregor' }],
    rooms: [
      { id: 2, property_id: 1, room_no: 2, ensuite: false, notes: '' },
      { id: 5, property_id: 1, room_no: 5, ensuite: false, notes: '' },
      { id: 6, property_id: 1, room_no: 6, ensuite: false, notes: '' },
    ],
    roomProfiles: [{ room_id: 6, room_type: 'Sofa' }],
    tenants: [
      { id: 1, name: 'Laura' },
      { id: 4, name: 'LaDou' },
      { id: 5, name: 'Vicky' },
      { id: 6, name: 'Aura' },
      { id: 7, name: 'May' },
      { id: 3, name: 'Iris' },
    ],
    tenancies: [
      {
        id: 101,
        tenant_id: 1,
        room_id: 5,
        check_in: '2026-08-01',
        check_out: '2026-08-10',
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 35,
        rent_period: 'night',
      },
      {
        id: 102,
        tenant_id: 1,
        room_id: 5,
        check_in: '2026-08-15',
        check_out: '2026-08-20',
        status: 'cancelled',
        tenancy_type: 'short_term',
        rent_amount: 35,
        rent_period: 'night',
      },
      {
        id: 103,
        tenant_id: 1,
        room_id: 5,
        check_in: today,
        check_out: sandbox.addDays(today, 5),
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 35,
        rent_period: 'night',
      },
      {
        id: 104,
        tenant_id: 1,
        room_id: 5,
        check_in: sandbox.addDays(today, 10),
        check_out: sandbox.addDays(today, 15),
        status: 'upcoming',
        tenancy_type: 'short_term',
        rent_amount: 35,
        rent_period: 'night',
      },
      {
        id: 201,
        tenant_id: 4,
        room_id: 2,
        check_in: sandbox.addDays(today, -3),
        check_out: sandbox.addDays(today, 4),
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 280,
        rent_period: 'week',
      },
      {
        id: 202,
        tenant_id: 5,
        room_id: 2,
        check_in: sandbox.addDays(today, -3),
        check_out: sandbox.addDays(today, 4),
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 0,
        rent_period: 'week',
      },
      {
        id: 203,
        tenant_id: 6,
        room_id: 2,
        check_in: sandbox.addDays(today, -20),
        check_out: sandbox.addDays(today, -1),
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 35,
        rent_period: 'night',
      },
      {
        id: 301,
        tenant_id: 3,
        room_id: 6,
        check_in: sandbox.addDays(today, -10),
        check_out: sandbox.addDays(today, -2),
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 25,
        rent_period: 'day',
      },
      {
        id: 303,
        tenant_id: 3,
        room_id: 6,
        check_in: sandbox.addDays(today, 2),
        check_out: sandbox.addDays(today, 5),
        status: 'upcoming',
        tenancy_type: 'short_term',
        rent_amount: 25,
        rent_period: 'day',
      },
      {
        id: 401,
        tenant_id: 7,
        room_id: 5,
        check_in: '2020-01-01',
        check_out: null,
        status: 'active',
        tenancy_type: 'long_term',
        rent_amount: 210,
        rent_period: 'week',
      },
    ],
  });
  assert(sandbox.isSofaRoom(sandbox.state.rooms.find((r) => r.id === 6)) === true, 'sofa');
  assert(sandbox.roomShortName(sandbox.state.rooms.find((r) => r.id === 6)) === 'Sofa', 'sofa label');
  const r5 = sandbox.currentOccupantsForRoom(5).map((t) => t.id).sort((a, b) => a - b);
  assert(JSON.stringify(r5) === JSON.stringify([103, 401]), 'room5 current');
  assert(sandbox.nextBookingForRoom(5)?.id === 104, 'room5 next');
  const r2 = sandbox.currentOccupantsForRoom(2).map((t) => t.id).sort((a, b) => a - b);
  assert(JSON.stringify(r2) === JSON.stringify([201, 202]), 'room2 current');
  assert(sandbox.currentOccupantsForRoom(6).length === 0, 'sofa vacant');
  assert(sandbox.nextBookingForRoom(6)?.id === 303, 'sofa next');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies.find((t) => t.id === 102), today) === false, 'cancelled no block');
});

console.log('\n' + passed + ' checks passed');
if (process.exitCode) process.exit(1);
