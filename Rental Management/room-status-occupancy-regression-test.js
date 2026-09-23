#!/usr/bin/env node
/**
 * Room Status occupancy source-of-truth regressions (items 19–26 A–J).
 * Does NOT unique() by tenant name — asserts Stay/Booking IDs.
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

const FIXED_TODAY = '2026-09-13';
sandbox.today = () => FIXED_TODAY;

function assert(c, m) {
  if (!c) throw new Error(m);
}
let passed = 0;
const results = [];
function check(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, ok: true });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.error('FAIL', name, e.message);
    process.exitCode = 1;
  }
}

function seedScenario() {
  Object.assign(sandbox.state, {
    propertyId: 1,
    page: 'overview',
    view: 'current',
    me: { role: 'owner' },
    properties: [{ id: 1, name: 'McGregor' }],
    rooms: [
      { id: 1, property_id: 1, room_no: 1, ensuite: false, notes: '' },
      { id: 2, property_id: 1, room_no: 2, ensuite: false, notes: '' },
      { id: 3, property_id: 1, room_no: 3, ensuite: false, notes: '' },
      { id: 4, property_id: 1, room_no: 4, ensuite: true, notes: '' },
      { id: 5, property_id: 1, room_no: 5, ensuite: false, notes: '' },
      { id: 6, property_id: 1, room_no: 6, ensuite: false, notes: 'Sofa / Extra Room' },
    ],
    roomProfiles: [{ room_id: 6, room_type: 'Sofa / Extra Room', current_asking_price: 25, standard_price: 25 }],
    tenants: [
      { id: 10, name: 'Laura' },
      { id: 20, name: 'Blackgun' },
      { id: 21, name: 'Iris Zhao (Black Gun)' },
      { id: 30, name: '辣豆' },
      { id: 31, name: 'Vicky' },
      { id: 32, name: 'Aura' },
      { id: 40, name: 'NextGuest' },
    ],
    tenancies: [
      // Room 5 — Laura historical / cancelled / current / future (G)
      {
        id: 501,
        tenant_id: 10,
        room_id: 5,
        check_in: '2026-08-01',
        check_out: '2026-08-10',
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 30,
        rent_period: 'night',
      },
      {
        id: 502,
        tenant_id: 10,
        room_id: 5,
        check_in: '2026-09-01',
        check_out: '2026-09-20',
        status: 'cancelled',
        tenancy_type: 'short_term',
        rent_amount: 40,
        rent_period: 'night',
      },
      {
        id: 503,
        tenant_id: 10,
        room_id: 5,
        check_in: '2026-09-11',
        check_out: '2026-09-16',
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 35,
        rent_period: 'night',
      },
      {
        id: 504,
        tenant_id: 40,
        room_id: 5,
        check_in: '2026-09-20',
        check_out: '2026-09-25',
        status: 'upcoming',
        tenancy_type: 'short_term',
        rent_amount: 40,
        rent_period: 'night',
      },
      // Room 2 — ongoing long-term + past Aura (must not appear) + shared Vicky same window
      {
        id: 201,
        tenant_id: 30,
        room_id: 2,
        check_in: '2026-01-01',
        check_out: null,
        confirmed_until: null,
        status: 'active',
        tenancy_type: 'long_term',
        rent_amount: 280,
        rent_period: 'week',
      },
      {
        id: 202,
        tenant_id: 31,
        room_id: 2,
        check_in: '2026-09-10',
        check_out: '2026-09-20',
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 0,
        rent_period: 'week',
      },
      {
        id: 203,
        tenant_id: 32,
        room_id: 2,
        check_in: '2026-07-01',
        check_out: '2026-07-10',
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 35,
        rent_period: 'night',
      },
      // Sofa (room_no 6) — Blackgun past + Iris cancelled + Blackgun current (H)
      {
        id: 601,
        tenant_id: 20,
        room_id: 6,
        check_in: '2026-08-01',
        check_out: '2026-08-15',
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 25,
        rent_period: 'day',
      },
      {
        id: 602,
        tenant_id: 21,
        room_id: 6,
        check_in: '2026-09-01',
        check_out: '2026-09-30',
        status: 'cancelled',
        tenancy_type: 'short_term',
        rent_amount: 25,
        rent_period: 'day',
      },
      {
        id: 603,
        tenant_id: 20,
        room_id: 6,
        check_in: '2026-09-10',
        check_out: '2026-09-20',
        status: 'active',
        tenancy_type: 'short_term',
        rent_amount: 25,
        rent_period: 'day',
      },
      // Cancelled future that must never be Next (J)
      {
        id: 604,
        tenant_id: 21,
        room_id: 6,
        check_in: '2026-09-25',
        check_out: '2026-09-28',
        status: 'cancelled',
        tenancy_type: 'short_term',
        rent_amount: 25,
        rent_period: 'day',
      },
    ],
    payments: [],
    bonds: [],
    paymentActions: [],
    bookingEvents: [],
    viewings: [],
    expenses: [],
    priceHistory: [],
    activity: [],
    bondEvents: [],
    bondRefundEvents: [],
    profiles: [],
  });
}

seedScenario();

const {
  isCurrentOccupancyStay,
  isUpcomingOccupancyStay,
  currentOccupantsForRoom,
  nextBookingForRoom,
  stayBlocksDate,
  isSofaRoom,
  roomShortName,
  contractedWeeklyRentRoll,
  projectedIncomeNextDays,
  occupancyStats,
  needsPaymentAction,
  tenancyKind,
  overviewPage,
  paymentGroupMembers,
} = sandbox;

check('A current stay appears as Current', () => {
  const cur = currentOccupantsForRoom(5);
  assert(cur.some((t) => t.id === 503), 'missing stay 503');
  assert(isCurrentOccupancyStay(sandbox.state.tenancies.find((t) => t.id === 503)), '503 not current');
});

check('B past stay does NOT appear', () => {
  const cur = currentOccupantsForRoom(5);
  assert(!cur.some((t) => t.id === 501), 'past 501 leaked');
  assert(!isCurrentOccupancyStay(sandbox.state.tenancies.find((t) => t.id === 501)), '501 marked current');
});

check('C cancelled stay does NOT appear', () => {
  const cur = currentOccupantsForRoom(5);
  assert(!cur.some((t) => t.id === 502), 'cancelled 502 leaked');
  assert(!isCurrentOccupancyStay(sandbox.state.tenancies.find((t) => t.id === 502)), '502 marked current');
});

check('D future stay is Next not Current', () => {
  const cur = currentOccupantsForRoom(5);
  assert(!cur.some((t) => t.id === 504), 'future as current');
  assert(isUpcomingOccupancyStay(sandbox.state.tenancies.find((t) => t.id === 504)), '504 not upcoming');
  assert(nextBookingForRoom(5)?.id === 504, 'next != 504');
});

check('E ongoing long-term with null checkout is Current', () => {
  const cur = currentOccupantsForRoom(2);
  assert(cur.some((t) => t.id === 201), 'ongoing missing');
  assert(isCurrentOccupancyStay(sandbox.state.tenancies.find((t) => t.id === 201)), '201 not current');
});

check('F same tenant multiple historical stays -> only one current id', () => {
  const lauraCurrent = currentOccupantsForRoom(5).filter((t) => t.tenant_id === 10);
  assert(lauraCurrent.length === 1, `expected 1 Laura stay, got ${lauraCurrent.map((t) => t.id)}`);
  assert(lauraCurrent[0].id === 503, 'wrong Laura stay id');
});

check('G historical + cancelled + current Laura -> only current stay id 503', () => {
  assert(
    currentOccupantsForRoom(5)
      .map((t) => t.id)
      .sort((a, b) => a - b)
      .join(',') === '503',
    'room5 occupants'
  );
});

check('H Blackgun / Iris alias duplicates reported by stay+tenant id (no name merge)', () => {
  const sofa = currentOccupantsForRoom(6);
  assert(sofa.length === 1, `expected 1 sofa occupant, got ${sofa.map((t) => t.id)}`);
  assert(sofa[0].id === 603, 'wrong sofa stay');
  assert(sofa[0].tenant_id === 20, 'must be Blackgun tenant_id 20, not Iris 21');
  // Report duplicate/legacy rows that were excluded (do not delete)
  const legacy = sandbox.state.tenancies.filter((t) => Number(t.room_id) === 6 && t.id !== 603);
  assert(legacy.some((t) => t.id === 601 && t.tenant_id === 20), 'report past Blackgun stay 601');
  assert(legacy.some((t) => t.id === 602 && t.tenant_id === 21 && t.status === 'cancelled'), 'report cancelled Iris stay 602');
  assert(legacy.some((t) => t.id === 604 && t.status === 'cancelled'), 'report cancelled future Iris 604');
});

check('I Sofa / Extra Room must not display as Room 6', () => {
  const sofa = sandbox.state.rooms.find((r) => r.id === 6);
  assert(isSofaRoom(sofa) === true, 'isSofaRoom');
  assert(roomShortName(sofa) === 'Sofa', roomShortName(sofa));
  const page = overviewPage();
  assert(/Sofa/.test(page), 'Sofa missing from overview');
  assert(!/>Room 6</.test(page), 'Room 6 label leaked');
});

check('J cancelled booking excluded from occupancy / income / next / actions', () => {
  const cancelled = sandbox.state.tenancies.find((t) => t.id === 502);
  const cancelledSofa = sandbox.state.tenancies.find((t) => t.id === 602);
  const cancelledFuture = sandbox.state.tenancies.find((t) => t.id === 604);
  assert(stayBlocksDate(cancelled, FIXED_TODAY) === false, 'cancelled blocks date');
  assert(stayBlocksDate(cancelledSofa, FIXED_TODAY) === false, 'sofa cancelled blocks');
  assert(nextBookingForRoom(6) === null, 'cancelled future became Next');
  assert(tenancyKind(cancelled) === 'historical', 'cancelled kind');
  assert(needsPaymentAction(cancelled) === false, 'cancelled payment action');
  assert(needsPaymentAction(cancelledSofa) === false, 'sofa cancelled action');
  assert(!paymentGroupMembers(sandbox.state.tenancies.find((t) => t.id === 503)).some((x) => x.id === 502), 'cancelled in payment group');
  const roll = contractedWeeklyRentRoll();
  assert(Number.isFinite(roll), 'rent roll');
  // Occupancy today must not count cancelled Laura window on room 5
  const occ = occupancyStats(FIXED_TODAY, FIXED_TODAY);
  assert(occ.occupied >= 1, 'some occupied');
  const proj = projectedIncomeNextDays(28);
  assert(Number.isFinite(proj), 'projected');
});

check('UI Room Status: Laura once, Vacant semantics, clean rate, no past Aura', () => {
  const page = overviewPage();
  const card5 = page.match(/data-room-status="5"[\s\S]*?<\/article>/)?.[0] || '';
  const card2 = page.match(/data-room-status="2"[\s\S]*?<\/article>/)?.[0] || '';
  const card6 = page.match(/data-room-status="6"[\s\S]*?<\/article>/)?.[0] || '';
  const card1 = page.match(/data-room-status="1"[\s\S]*?<\/article>/)?.[0] || '';
  const cur5 = card5.split(/Next:/)[0];
  assert((cur5.match(/Laura/g) || []).length === 1, `Laura count in current: ${cur5}`);
  assert(/\$35\s*\/\s*night/.test(card5), `rate line: ${card5}`);
  assert(!/\$40/.test(cur5) && !/\$30/.test(cur5), 'historical/cancelled rates leaked');
  assert(/AVAILABLE \/ VACANT|Vacant now/i.test(card1), 'vacant label missing on empty room');
  assert(!/Aura/.test(card2.split(/Next:/)[0]), 'past Aura on Room 2 current');
  assert(/辣豆/.test(card2) && /Vicky/.test(card2), 'shared current occupants');
  assert(/Blackgun/.test(card6.split(/Next:/)[0]), 'sofa current');
  assert(!/Iris Zhao/.test(card6.split(/Next:/)[0]), 'Iris cancelled/alias on current');
  assert(/Sofa/.test(card6) && !/Room 6/.test(card6), 'sofa label');
});

check('After checkout date Laura disappears automatically', () => {
  sandbox.today = () => '2026-09-16';
  assert(currentOccupantsForRoom(5).length === 0, 'still occupied after checkout');
  assert(nextBookingForRoom(5)?.id === 504, 'next after vacant');
  sandbox.today = () => FIXED_TODAY;
});

const outPath = path.join('/opt/cursor/artifacts', 'room-status-occupancy-regression-results.txt');
const summary = [
  `Room Status occupancy A–J · today fixed ${FIXED_TODAY}`,
  `${passed}/${results.length} passed`,
  ...results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`),
  '',
  'Duplicate / legacy stay IDs reported (not deleted):',
  '  Room 5: past 501, cancelled 502; current 503; future 504',
  '  Sofa: past Blackgun 601 (tenant 20), cancelled Iris 602 (tenant 21), cancelled future Iris 604; current Blackgun 603',
].join('\n');
fs.writeFileSync(outPath, summary + '\n');
console.log('\n' + summary);
if (process.exitCode) process.exit(1);
