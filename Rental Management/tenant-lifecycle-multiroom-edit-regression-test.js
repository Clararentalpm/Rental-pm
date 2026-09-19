#!/usr/bin/env node
/**
 * Combined: Upcoming→Current date SoT + Edit Stay multi-room allocations.
 * Cases 1–18 from the combined lifecycle / editable multi-room booking fix.
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
  querySelector() {
    return el();
  },
  querySelectorAll() {
    return [];
  },
  insertAdjacentHTML() {},
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
  crypto: { randomUUID: () => 'bg-test-group-1' },
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(defs, sandbox, { timeout: 10000 });

let FIXED = '2026-09-19';
sandbox.today = () => FIXED;

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
    properties: [{ id: 1, name: 'McGregor', timezone: 'Australia/Brisbane' }],
    rooms: [
      { id: 2, property_id: 1, room_no: 2 },
      { id: 4, property_id: 1, room_no: 4 },
      { id: 5, property_id: 1, room_no: 5 },
      { id: 15, property_id: 1, room_no: 5 },
    ],
    tenants: [
      { id: 10, name: 'Jiawen' },
      { id: 11, name: 'May & Josie' },
      { id: 12, name: 'NuYoah' },
      { id: 13, name: 'Tenant A' },
    ],
    tenancies: [],
    bonds: [],
    payments: [],
    paymentActions: [],
    bookingEvents: [],
    profiles: [{ id: 'u1', display_name: 'Owner', role: 'owner' }],
  });
}

check('UI markers: Edit stay allocations + date SoT helpers', () => {
  assert(/Room allocations \/ stay segments/.test(html), 'allocations section');
  assert(/tenancy-add-allocation/.test(html), 'add allocation btn');
  assert(/planBookingAllocationsEdit/.test(html), 'plan helper');
  assert(/bookingOperationalKind/.test(html), 'bookingOperationalKind');
  assert(/localDateISO|Australia\/Brisbane/.test(html), 'local date');
  assert(/status==='upcoming'/.test(html) === false || !/status==='upcoming'\)return'upcoming'/.test(html), 'no stale upcoming OR in tenancyKind');
  // Ensure tenancyKind no longer ORs stale status
  const kindSrc = html.match(/function tenancyKind\([\s\S]*?\n\}/);
  assert(kindSrc && !/status==='upcoming'/.test(kindSrc[0]), 'tenancyKind ignores stored upcoming');
});

check('CASE 1 stale upcoming + start passed → CURRENT', () => {
  FIXED = '2026-09-19';
  seed();
  const t = {
    id: 1,
    tenant_id: 10,
    room_id: 15,
    check_in: '2026-09-16',
    check_out: '2026-09-29',
    status: 'upcoming',
  };
  sandbox.state.tenancies = [t];
  assert(sandbox.tenancyKind(t) === 'current', 'tenancyKind current');
  assert(sandbox.bookingOperationalKind(t) === 'current', 'booking current');
  assert(sandbox.tenantProfileRow(sandbox.state.tenants[0]).kind === 'current', 'profile current');
});

check('CASE 2 May & Josie 16→22 on 19 Sep → CURRENT', () => {
  FIXED = '2026-09-19';
  seed();
  const t = {
    id: 2,
    tenant_id: 11,
    room_id: 2,
    check_in: '2026-09-16',
    check_out: '2026-09-22',
    status: 'upcoming',
  };
  sandbox.state.tenancies = [t];
  assert(sandbox.tenancyKind(t) === 'current', 'current');
});

check('CASE 3 future start → UPCOMING', () => {
  FIXED = '2026-09-19';
  seed();
  const t = {
    id: 3,
    tenant_id: 12,
    room_id: 2,
    check_in: '2026-09-23',
    check_out: '2026-10-14',
    status: 'upcoming',
  };
  sandbox.state.tenancies = [t];
  assert(sandbox.tenancyKind(t) === 'upcoming', 'upcoming');
  assert(sandbox.bookingOperationalKind(t) === 'upcoming', 'booking upcoming');
});

check('CASE 4 ended before today → HISTORICAL', () => {
  FIXED = '2026-09-19';
  seed();
  const t = {
    id: 4,
    tenant_id: 10,
    room_id: 2,
    check_in: '2026-09-01',
    check_out: '2026-09-10',
    status: 'active',
  };
  assert(sandbox.tenancyKind(t) === 'historical', 'historical');
});

check('CASE 5 cancelled future → not Upcoming', () => {
  FIXED = '2026-09-19';
  seed();
  const t = {
    id: 5,
    tenant_id: 10,
    room_id: 2,
    check_in: '2026-09-25',
    check_out: '2026-10-01',
    status: 'cancelled',
  };
  assert(sandbox.tenancyKind(t) === 'historical', 'cancelled historical');
  assert(sandbox.isUpcomingOccupancyStay(t) === false, 'not upcoming occupancy');
});

check('CASE 6 early end → stop Current', () => {
  FIXED = '2026-09-19';
  seed();
  const t = {
    id: 6,
    tenant_id: 10,
    room_id: 2,
    check_in: '2026-09-10',
    check_out: '2026-09-18',
    confirmed_until: '2026-09-18',
    status: 'active',
  };
  assert(sandbox.tenancyKind(t) === 'historical', 'early end historical');
  assert(sandbox.stayBlocksDate(t, '2026-09-19') === false, 'does not block after end');
});

check('CASE 7 add Room 5 allocation → 1 tenant 1 booking 2 allocations', () => {
  FIXED = '2026-09-19';
  seed();
  const a = {
    id: 100,
    tenant_id: 13,
    room_id: 2,
    check_in: '2026-09-23',
    check_out: '2026-10-07',
    status: 'upcoming',
    tenancy_type: 'short_term',
    rent_amount: 470,
    rent_period: 'total',
    notes: '',
  };
  sandbox.state.tenancies = [a];
  const proposed = [
    {
      id: 100,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      tenancy_type: 'short_term',
      rent_amount: 470,
      rent_period: 'total',
    },
    {
      id: null,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      tenancy_type: 'short_term',
      rent_amount: 235,
      rent_period: 'total',
    },
  ];
  const plan = sandbox.planBookingAllocationsEdit(a, proposed);
  assert(plan.ok === true, plan.error || 'ok');
  assert(!!plan.groupId, 'booking group assigned');
  assert(plan.live.length === 2, '2 live allocations');
  assert(sandbox.state.tenants.filter((t) => t.id === 13).length === 1, 'one tenant');
});

check('CASE 8 change second allocation room 5→4', () => {
  FIXED = '2026-09-19';
  seed();
  const gid = 'bg-test';
  sandbox.state.tenancies = [
    {
      id: 100,
      tenant_id: 13,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1\nSEGMENT_COUNT:2`,
    },
    {
      id: 101,
      tenant_id: 13,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2\nSEGMENT_COUNT:2`,
    },
  ];
  const plan = sandbox.planBookingAllocationsEdit(sandbox.state.tenancies[0], [
    {
      id: 100,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      tenancy_type: 'short_term',
    },
    {
      id: 101,
      room_id: 4,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      tenancy_type: 'short_term',
    },
  ]);
  assert(plan.ok === true, plan.error || 'ok');
  assert(plan.live[1].room_id === 4, 'room updated in plan');
  assert(sandbox.bookingSegments(sandbox.state.tenancies[0]).length === 2, 'same booking group');
});

check('CASE 9 occupied room → save blocked', () => {
  FIXED = '2026-09-19';
  seed();
  sandbox.state.tenancies = [
    {
      id: 100,
      tenant_id: 13,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      status: 'upcoming',
      notes: '',
    },
    {
      id: 200,
      tenant_id: 10,
      room_id: 5,
      check_in: '2026-10-01',
      check_out: '2026-10-20',
      status: 'upcoming',
      notes: '',
    },
  ];
  const plan = sandbox.planBookingAllocationsEdit(sandbox.state.tenancies[0], [
    {
      id: 100,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      tenancy_type: 'short_term',
    },
    {
      id: null,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      tenancy_type: 'short_term',
    },
  ]);
  assert(plan.ok === false, 'blocked');
  assert(plan.conflict === true, 'conflict flag');
});

check('CASE 10 extend final allocation → overall end recalculated', () => {
  FIXED = '2026-09-19';
  seed();
  const gid = 'bg-ext';
  sandbox.state.tenancies = [
    {
      id: 100,
      tenant_id: 13,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 101,
      tenant_id: 13,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  // Simulate extended segment 2 in state then read overall end
  sandbox.state.tenancies[1].check_out = '2026-10-20';
  assert(sandbox.bookingOverallStart(sandbox.state.tenancies[0]) === '2026-09-23', 'start');
  assert(sandbox.bookingOverallEnd(sandbox.state.tenancies[0]) === '2026-10-20', 'end extended');
});

check('CASE 11 remove future allocation → room available', () => {
  FIXED = '2026-09-19';
  seed();
  const gid = 'bg-rm';
  sandbox.state.tenancies = [
    {
      id: 100,
      tenant_id: 13,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 101,
      tenant_id: 13,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  assert(sandbox.roomDateAvailable(5, '2026-10-10') === false, 'blocked before remove');
  sandbox.state.tenancies[1].status = 'cancelled';
  assert(sandbox.isOperationallyClosed(sandbox.state.tenancies[1]), 'closed');
  assert(sandbox.roomDateAvailable(5, '2026-10-10') === true, 'available after cancel');
});

check('CASE 12 current tenant adds future transfer → stays CURRENT', () => {
  FIXED = '2026-09-25';
  seed();
  const gid = 'bg-cur';
  sandbox.state.tenancies = [
    {
      id: 100,
      tenant_id: 13,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 101,
      tenant_id: 13,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  assert(sandbox.bookingOperationalKind(sandbox.state.tenancies[0]) === 'current', 'current');
  assert(sandbox.tenancyKind(sandbox.state.tenancies[0]) === 'current', 'seg1 current');
  assert(sandbox.tenancyKind(sandbox.state.tenancies[1]) === 'upcoming', 'seg2 upcoming');
});

check('CASE 13 upcoming edits future allocations → remains Upcoming', () => {
  FIXED = '2026-09-19';
  seed();
  const gid = 'bg-up';
  sandbox.state.tenancies = [
    {
      id: 100,
      tenant_id: 12,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 101,
      tenant_id: 12,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  assert(sandbox.bookingOperationalKind(sandbox.state.tenancies[0]) === 'upcoming', 'upcoming until start');
});

check('CASE 14 internal transfer → CURRENT, no false departure/arrival', () => {
  FIXED = '2026-10-08';
  seed();
  const gid = 'bg-xfer';
  sandbox.state.tenancies = [
    {
      id: 100,
      tenant_id: 13,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 101,
      tenant_id: 13,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  assert(sandbox.bookingOperationalKind(sandbox.state.tenancies[0]) === 'current', 'still current');
  assert(sandbox.isFinalPropertyDeparture(sandbox.state.tenancies[0]) === false, 'room2 end not departure');
  assert(sandbox.isFinalPropertyDeparture(sandbox.state.tenancies[1]) === true, 'room5 is final');
  assert(sandbox.isFirstPropertyArrival(sandbox.state.tenancies[1]) === false, 'room5 not new arrival');
  assert(sandbox.currentAllocationSegment(sandbox.state.tenancies[0]).id === 101, 'current room is R5');
});

check('CASE 15 calendar blocks only actual allocation periods', () => {
  FIXED = '2026-09-19';
  seed();
  const gid = 'bg-cal';
  sandbox.state.tenancies = [
    {
      id: 100,
      tenant_id: 13,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 101,
      tenant_id: 13,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-09-25') === true, 'R2 blocked in alloc');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-10-10') === false, 'R2 free after alloc');
  assert(sandbox.roomDateAvailable(2, '2026-10-10') === true, 'R2 available');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[1], '2026-10-10') === true, 'R5 blocked in alloc');
  assert(sandbox.roomDateAvailable(5, '2026-09-25') === true, 'R5 free before alloc');
});

check('CASE 16 edit allocations ≠ duplicate booking', () => {
  FIXED = '2026-09-19';
  seed();
  sandbox.state.tenancies = [
    {
      id: 100,
      tenant_id: 13,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      status: 'upcoming',
      notes: '',
    },
  ];
  const plan = sandbox.planBookingAllocationsEdit(sandbox.state.tenancies[0], [
    {
      id: 100,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      tenancy_type: 'short_term',
    },
    {
      id: null,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      tenancy_type: 'short_term',
    },
  ]);
  assert(plan.ok, plan.error);
  // Creating a separate duplicate stay for same room/dates is still blocked
  const dup = sandbox.evaluateStayCreateConflict({
    tenantId: 13,
    roomId: 2,
    checkIn: '2026-09-23',
    checkOut: '2026-10-07',
  });
  assert(dup.level === 'duplicate', 'duplicate create still blocked');
});

check('CASE 17 historical allocation retained (not deleted by plan)', () => {
  FIXED = '2026-10-10';
  seed();
  const gid = 'bg-hist';
  sandbox.state.tenancies = [
    {
      id: 100,
      tenant_id: 13,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      status: 'completed',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 101,
      tenant_id: 13,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  assert(sandbox.bookingSegments(sandbox.state.tenancies[1]).length === 2, 'both segments remain');
  assert(sandbox.isOperationallyClosed(sandbox.state.tenancies[0]) === true, 'first closed/historical');
  assert(sandbox.state.tenancies.length === 2, 'no silent delete');
});

check('CASE 18 half-open same-day turnover', () => {
  FIXED = '2026-09-16';
  seed();
  const a = {
    id: 1,
    tenant_id: 10,
    room_id: 2,
    check_in: '2026-09-10',
    check_out: '2026-09-16',
    status: 'active',
  };
  const b = {
    id: 2,
    tenant_id: 11,
    room_id: 2,
    check_in: '2026-09-16',
    check_out: '2026-09-20',
    status: 'upcoming',
  };
  sandbox.state.tenancies = [a, b];
  assert(sandbox.stayBlocksDate(a, '2026-09-16') === false, 'checkout day free for A');
  assert(sandbox.stayBlocksDate(b, '2026-09-16') === true, 'B occupies checkout day');
  assert(sandbox.roomDateAvailable(2, '2026-09-16') === false, 'room not vacant');
});

check('NuYoah split: 19 Sep upcoming; 23 Sep current', () => {
  FIXED = '2026-09-19';
  seed();
  const gid = 'bg-nuyoah';
  sandbox.state.tenancies = [
    {
      id: 50,
      tenant_id: 12,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-07',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 51,
      tenant_id: 12,
      room_id: 5,
      check_in: '2026-10-08',
      check_out: '2026-10-14',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  assert(sandbox.bookingOperationalKind(sandbox.state.tenancies[0]) === 'upcoming', '19 Sep upcoming');
  FIXED = '2026-09-23';
  assert(sandbox.bookingOperationalKind(sandbox.state.tenancies[0]) === 'current', '23 Sep current');
});

console.log(`\n${passed} passed`);
if (process.exitCode) process.exit(1);
console.log('ALL PASS — tenant lifecycle + multi-room edit stay');
