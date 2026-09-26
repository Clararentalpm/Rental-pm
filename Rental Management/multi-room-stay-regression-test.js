#!/usr/bin/env node
/**
 * Multi-room inspection + split/multi-room stay regressions (A–Q).
 * Loads helpers from index.html via Node VM (no DB / no migration).
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
      { id: 19, property_id: 2, room_no: 3, ensuite: true, notes: '' },
      { id: 20, property_id: 2, room_no: 4, ensuite: false, notes: '' },
    ],
    roomProfiles: [{ room_id: 18, room_type: 'Sofa / Extra Room', current_asking_price: 25 }],
    tenants: [{ id: 50, name: 'Journey Guest' }, { id: 51, name: 'Solo Guest' }],
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
  });
}

// A — note markers upsert / parse / strip
check('A parse/upsert/strip note markers', () => {
  seed();
  let n = sandbox.upsertNoteMarker('hello', 'ROOM_IDS', '12,15');
  assert(sandbox.parseNoteMarker(n, 'ROOM_IDS') === '12,15', 'parse ROOM_IDS');
  n = sandbox.upsertNoteMarker(n, 'ROOM_IDS', '12,18');
  assert(sandbox.parseNoteMarker(n, 'ROOM_IDS') === '12,18', 'upsert replaces');
  assert(!/\nROOM_IDS:12,15/.test(n), 'old value gone');
  assert(sandbox.stripNoteMarker(n, 'ROOM_IDS') === 'hello', 'strip leaves body');
});

// B — encodeViewingRoomIds sorted unique + always primary-compatible
check('B encodeViewingRoomIds sorted unique', () => {
  seed();
  assert(sandbox.encodeViewingRoomIds([18, 12, 15, 12]) === '12,15,18', 'sorted unique');
  assert(sandbox.encodeViewingRoomIds([]) === '', 'empty');
});

// C — viewingRoomIds from ROOM_IDS marker
check('C viewingRoomIds from ROOM_IDS', () => {
  seed();
  const v = { room_id: 12, notes: 'Prefer quiet\nROOM_IDS:18,12,15' };
  assert(JSON.stringify(sandbox.viewingRoomIds(v)) === JSON.stringify([12, 15, 18]), 'ids from marker');
});

// D — viewingRoomIds fallback to single room_id (legacy compat)
check('D viewingRoomIds fallback single room_id', () => {
  seed();
  const v = { room_id: 15, notes: 'legacy single' };
  assert(JSON.stringify(sandbox.viewingRoomIds(v)) === JSON.stringify([15]), 'fallback');
});

// E — viewingRoomsLabel joins short names
check('E viewingRoomsLabel', () => {
  seed();
  const v = { room_id: 12, notes: 'ROOM_IDS:12,15,18' };
  assert(sandbox.viewingRoomsLabel(v) === 'Room 2, Room 5, Sofa', 'label');
});

// F — mergeViewingNotesWithRooms includes primary + preserves free text
check('F mergeViewingNotesWithRooms', () => {
  seed();
  const n = sandbox.mergeViewingNotesWithRooms('Bring ID', [15, 12, 18]);
  assert(sandbox.parseNoteMarker(n, 'ROOM_IDS') === '12,15,18', 'encoded');
  assert(n.startsWith('Bring ID'), 'user notes kept');
});

// G — single-room inspection remains compatible (no schema change)
check('G single-room inspection compat', () => {
  seed();
  const v = { id: 1, property_id: 1, room_id: 12, visitor_name: 'A', inspection_date: '2026-09-20', inspection_time: '10:00', notes: null };
  assert(sandbox.viewingRoomIds(v).length === 1, 'one room');
  assert(sandbox.viewingRoomsLabel(v) === 'Room 2', 'single label');
  assert(html.includes('viewing-room-multi'), 'multi-select UI present');
  assert(html.includes('viewing-primary-room') || html.includes('name="room_id"'), 'primary room_id field kept');
});

// H — reminder SMS lists all rooms with &
check('H viewingReminderMessage multi-room', () => {
  seed();
  const v = {
    property_id: 1,
    room_id: 12,
    notes: 'ROOM_IDS:12,15,18',
    inspection_date: '2026-09-20',
    inspection_time: '14:30',
  };
  const msg = sandbox.viewingReminderMessage(v);
  assert(/^Room inspection:/.test(msg), 'prefix');
  assert(/McGregor/.test(msg), 'property');
  assert(/Room 2, Room 5 & Sofa/.test(msg), 'rooms joined');
  assert(/14:30/.test(msg), 'time');
});

// I — availability validation names exact conflicting rooms
check('I multi-room availability names conflicts', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 51,
      room_id: 15,
      check_in: '2026-09-20',
      check_out: '2026-09-25',
      status: 'upcoming',
      tenancy_type: 'short_term',
    },
  ];
  const conflicts = sandbox.roomsAvailabilityConflicts([12, 15, 18], '2026-09-21', '2026-09-23');
  assert(JSON.stringify(conflicts) === JSON.stringify([15]), 'only room 15 conflicts');
  const note = sandbox.roomsAvailabilityNote([12, 15, 18], '2026-09-21', '2026-09-23');
  assert(/Room 5/.test(note), 'names Room 5');
  assert(/occupied/.test(note), 'says occupied');
  assert(!/Room 2 look/.test(note) || /Room 5/.test(note), 'does not claim Room 2 alone');
});

// J — booking group markers + segments
check('J bookingGroupId + bookingSegments', () => {
  seed();
  const gid = 'aaa-bbb-ccc';
  sandbox.state.tenancies = [
    {
      id: 201,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-13',
      check_out: '2026-09-16',
      rent_amount: 35,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1\nSEGMENT_COUNT:2`,
    },
    {
      id: 202,
      tenant_id: 50,
      room_id: 15,
      check_in: '2026-09-16',
      check_out: '2026-09-20',
      rent_amount: 40,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2\nSEGMENT_COUNT:2`,
    },
    {
      id: 203,
      tenant_id: 51,
      room_id: 12,
      check_in: '2026-10-01',
      check_out: '2026-10-05',
      rent_amount: 30,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'upcoming',
      notes: '',
    },
  ];
  const t = sandbox.state.tenancies[0];
  assert(sandbox.bookingGroupId(t) === gid, 'group id');
  assert(sandbox.bookingSegments(t).map((x) => x.id).join(',') === '201,202', 'two segments same tenant');
  assert(sandbox.bookingSegments(sandbox.state.tenancies[2]).length === 1, 'solo stay is itself');
});

// K — journey label
check('K bookingJourneyLabel', () => {
  seed();
  const gid = 'journey-1';
  sandbox.state.tenancies = [
    {
      id: 301,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-13',
      check_out: '2026-09-16',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 302,
      tenant_id: 50,
      room_id: 15,
      check_in: '2026-09-16',
      check_out: '2026-09-20',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  const label = sandbox.bookingJourneyLabel(sandbox.state.tenancies[0]);
  assert(/Room 2 → Room 5/.test(label), 'room journey');
  assert(/13 Sep/.test(label) && /20 Sep/.test(label), 'date span');
});

// L — booking group obligation = sum of segment solos
check('L bookingGroupObligation sums solos', () => {
  seed();
  const gid = 'ob-1';
  sandbox.state.tenancies = [
    {
      id: 401,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-13',
      check_out: '2026-09-16',
      rent_amount: 35,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 402,
      tenant_id: 50,
      room_id: 15,
      check_in: '2026-09-16',
      check_out: '2026-09-20',
      rent_amount: 40,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  const a = sandbox.state.tenancies[0];
  const b = sandbox.state.tenancies[1];
  // 3 nights × 35 = 105; 4 nights × 40 = 160; total 265
  assert(sandbox.expectedStayTotalSolo(a) === 105, 'seg1 solo 105');
  assert(sandbox.expectedStayTotalSolo(b) === 160, 'seg2 solo 160');
  assert(sandbox.bookingGroupObligation(a) === 265, 'group 265');
  assert(sandbox.finalAmountDue(a) === 265, 'finalAmountDue uses group');
  assert(sandbox.finalAmountDue(b) === 265, 'same from any segment');
});

// M — only one booking-group primary for schedule / actions
check('M isBookingGroupPrimary single primary', () => {
  seed();
  const gid = 'prim-1';
  sandbox.state.tenancies = [
    {
      id: 501,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-13',
      check_out: '2026-09-16',
      rent_amount: 35,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 502,
      tenant_id: 50,
      room_id: 15,
      check_in: '2026-09-16',
      check_out: '2026-09-20',
      rent_amount: 40,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  const primaries = sandbox.state.tenancies.filter((t) => sandbox.isPaymentGroupPrimary(t));
  assert(primaries.length === 1 && primaries[0].id === 501, 'one primary');
});

// N — single-room stay without BOOKING_GROUP unchanged
check('N single-room stay no BOOKING_GROUP', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 601,
      tenant_id: 51,
      room_id: 12,
      check_in: '2026-09-11',
      check_out: '2026-09-16',
      rent_amount: 35,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'active',
      notes: '',
    },
  ];
  const t = sandbox.state.tenancies[0];
  assert(sandbox.bookingGroupId(t) == null, 'no group');
  assert(sandbox.finalAmountDue(t) === 175, '5 nights × 35');
  assert(sandbox.isPaymentGroupPrimary(t) === true, 'solo primary');
});

// O — half-open checkout occupancy preserved
check('O half-open checkout occupancy', () => {
  seed();
  sandbox.state.tenancies = [
    {
      id: 701,
      tenant_id: 51,
      room_id: 12,
      check_in: '2026-09-11',
      check_out: '2026-09-14',
      status: 'active',
      tenancy_type: 'short_term',
    },
  ];
  const t = sandbox.state.tenancies[0];
  assert(sandbox.stayBlocksDate(t, '2026-09-11') === true, 'check-in occupied');
  assert(sandbox.stayBlocksDate(t, '2026-09-13') === true, 'mid occupied');
  assert(sandbox.stayBlocksDate(t, '2026-09-14') === false, 'checkout exclusive');
  assert(sandbox.isCurrentOccupancyStay(t, '2026-09-14') === false, 'not current on checkout');
});

// P — cancel one future segment does not cancel others
check('P cancel one segment leaves others', () => {
  seed();
  const gid = 'cancel-1';
  sandbox.state.tenancies = [
    {
      id: 801,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-13',
      check_out: '2026-09-16',
      rent_amount: 35,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 802,
      tenant_id: 50,
      room_id: 15,
      check_in: '2026-09-20',
      check_out: '2026-09-25',
      rent_amount: 40,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  // Simulate cancel of segment 2 only
  sandbox.state.tenancies[1].status = 'cancelled';
  sandbox.state.tenancies[1].notes += '\nRENT_TREATMENT:not_payable';
  assert(sandbox.isCancelledOrNoShow(sandbox.state.tenancies[0]) === false, 'seg1 live');
  assert(sandbox.isCancelledOrNoShow(sandbox.state.tenancies[1]) === true, 'seg2 cancelled');
  assert(sandbox.bookingGroupObligation(sandbox.state.tenancies[0]) === 105, 'obligation drops cancelled segment');
  assert(sandbox.bookingSegments(sandbox.state.tenancies[0]).length === 2, 'both still linked');
});

// Q — payments / schedule: group total once, no double-count; paymentGroupMembers still for joint same-room
check('Q payment group totals no double-count', () => {
  seed();
  const gid = 'pay-1';
  sandbox.state.tenancies = [
    {
      id: 901,
      tenant_id: 50,
      room_id: 12,
      check_in: '2026-09-13',
      check_out: '2026-09-16',
      rent_amount: 35,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 902,
      tenant_id: 50,
      room_id: 15,
      check_in: '2026-09-16',
      check_out: '2026-09-20',
      rent_amount: 40,
      rent_period: 'night',
      tenancy_type: 'short_term',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
    // joint same-room payment group (legacy)
    {
      id: 910,
      tenant_id: 50,
      room_id: 18,
      check_in: '2026-10-01',
      check_out: '2026-10-20',
      rent_amount: 100,
      rent_period: 'week',
      payment_cycle_weeks: 1,
      tenancy_type: 'long_term',
      status: 'upcoming',
      notes: '',
    },
    {
      id: 911,
      tenant_id: 51,
      room_id: 18,
      check_in: '2026-10-01',
      check_out: '2026-10-20',
      rent_amount: 100,
      rent_period: 'week',
      payment_cycle_weeks: 1,
      tenancy_type: 'long_term',
      status: 'upcoming',
      notes: '',
    },
  ];
  sandbox.state.payments = [
    { id: 1, tenancy_id: 901, amount: 100, status: 'paid', period_end: '2026-09-16', received_date: '2026-09-13' },
    { id: 2, tenancy_id: 902, amount: 50, status: 'paid', period_end: '2026-09-20', received_date: '2026-09-14' },
  ];
  const a = sandbox.state.tenancies[0];
  assert(sandbox.groupPaymentAmount(a) === 150, 'payments across segments');
  assert(sandbox.paymentDueAmount(a) === 115, '265 - 150 remaining');
  const schedulePrimaries = sandbox.state.tenancies.filter(
    (t) => sandbox.tenancyKind(t) !== 'historical' && sandbox.isPaymentGroupPrimary(t)
  );
  const bookingPrimaries = schedulePrimaries.filter((t) => sandbox.bookingGroupId(t) === gid);
  assert(bookingPrimaries.length === 1, 'one schedule row for booking group');
  assert(sandbox.paymentGroupMembers(sandbox.state.tenancies[2]).length === 2, 'joint same-room still works');
  assert(sandbox.isPaymentGroupPrimary(sandbox.state.tenancies[2]) !== sandbox.isPaymentGroupPrimary(sandbox.state.tenancies[3]), 'joint group one primary');
});

// Extra UI / docs presence checks
check('UI stay segments + docs markers present', () => {
  assert(html.includes('id="stay-segments"'), 'stay-segments container');
  assert(html.includes('stay-add-segment'), 'add segment button');
  assert(html.includes('BOOKING_GROUP'), 'BOOKING_GROUP in code');
  assert(html.includes('ROOM_IDS'), 'ROOM_IDS in code');
  assert(html.includes('SEGMENT_INDEX'), 'SEGMENT_INDEX in code');
});

if (process.exitCode) {
  console.error(`multi-room-stay-regression-test: ${passed} passed, failures above`);
  process.exit(1);
}
console.log(`multi-room-stay-regression-test: ${passed} passed`);
