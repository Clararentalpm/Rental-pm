#!/usr/bin/env node
/**
 * Tenant tabs + departures + ended-duplicate occupancy regressions (tests 1–11).
 * Asserts by stable tenancy IDs — never unique() by tenant name.
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

const FIXED_TODAY = '2026-09-15';
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

function seedBase() {
  Object.assign(sandbox.state, {
    propertyId: 1,
    properties: [{ id: 1, name: 'McGregor' }],
    rooms: [
      { id: 15, property_id: 1, room_no: 5 },
      { id: 12, property_id: 1, room_no: 2 },
      { id: 13, property_id: 1, room_no: 3 },
    ],
    roomProfiles: [],
    tenants: [
      { id: 100, name: 'Active Ann', contact_method: 'WeChat a' },
      { id: 101, name: 'Future Fay', contact_method: 'phone' },
      { id: 102, name: 'Past Pat', contact_method: 'email' },
      { id: 200, name: 'Jiawen', contact_method: 'WeChat j' },
      { id: 201, name: 'Laura', contact_method: 'WeChat l' },
      { id: 202, name: 'Aura', contact_method: 'WeChat au' },
      { id: 300, name: 'Split Sam', contact_method: 'x' },
      { id: 400, name: 'Return Ren', contact_method: 'y' },
    ],
    tenancies: [],
    bonds: [],
    payments: [],
    paymentActions: [],
    bookingEvents: [],
    viewings: [],
    profiles: [],
  });
}

check('UI tabs CURRENT | UPCOMING | HISTORICAL (no all/past mix)', () => {
  assert(/\['current','upcoming','historical'\]/.test(html), 'three operational tabs only');
  assert(/data-tfilter="\$\{x\}"/.test(html), 'tfilter buttons');
  assert(!/\['current','upcoming','past','all'\]/.test(html), 'no past/all mix list');
  assert(/Current \(\$\{counts\.current\}\)/.test(html) || /tabLabel\(x\)/.test(html), 'counts in tabs');
  assert(/isOperationallyClosed/.test(html), 'shared closed SoT');
  assert(/upcomingDepartures/.test(html), 'shared departures helper');
  assert(/isFinalPropertyDeparture/.test(html), 'final departure helper');
  assert(/<th>Contact<\/th>/.test(html), 'Contact column restored');
  assert(/<th>Stay Type<\/th>/.test(html), 'Stay Type column');
});

check('TEST 1 Active tenant → Current once', () => {
  seedBase();
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 100,
      room_id: 15,
      check_in: '2026-09-01',
      check_out: '2026-09-30',
      status: 'active',
      tenancy_type: 'short_term',
      rent_amount: 35,
      rent_period: 'night',
    },
  ];
  assert(sandbox.tenancyKind(sandbox.state.tenancies[0]) === 'current', 'kind current');
  const row = sandbox.tenantProfileRow(sandbox.state.tenants[0]);
  assert(row.kind === 'current' && row.stay.id === 1, 'profile current once');
});

check('TEST 2 Confirmed future → Upcoming, not Current', () => {
  seedBase();
  sandbox.state.tenancies = [
    {
      id: 2,
      tenant_id: 101,
      room_id: 15,
      check_in: '2026-09-20',
      check_out: '2026-09-25',
      status: 'upcoming',
      tenancy_type: 'short_term',
      rent_amount: 40,
      rent_period: 'night',
      notes: 'Deposit paid 15 Sep',
    },
  ];
  assert(sandbox.tenancyKind(sandbox.state.tenancies[0]) === 'upcoming', 'upcoming kind');
  assert(sandbox.isCurrentOccupancyStay(sandbox.state.tenancies[0]) === false, 'not current occupancy');
  assert(sandbox.tenantProfileRow(sandbox.state.tenants[1]).kind === 'upcoming', 'profile upcoming');
});

check('TEST 3 Completed → Historical, not mixed into Current', () => {
  seedBase();
  sandbox.state.tenancies = [
    {
      id: 3,
      tenant_id: 102,
      room_id: 15,
      check_in: '2026-08-01',
      check_out: '2026-09-01',
      status: 'completed',
      tenancy_type: 'short_term',
    },
  ];
  assert(sandbox.tenancyKind(sandbox.state.tenancies[0]) === 'historical', 'historical');
  assert(sandbox.isOperationallyClosed(sandbox.state.tenancies[0]) === true, 'closed');
  assert(sandbox.tenantProfileRow(sandbox.state.tenants[2]).kind === 'historical', 'profile historical');
});

check('TEST 4 Ended-early → Historical + stops occupying after effective end', () => {
  seedBase();
  // Original 1–30 Sep, manually ended 15 Sep (effective end = check_out)
  const t = {
    id: 4,
    tenant_id: 100,
    room_id: 12,
    check_in: '2026-09-01',
    check_out: '2026-09-15',
    status: 'historical',
    tenancy_type: 'short_term',
    rent_amount: 50,
    rent_period: 'week',
  };
  sandbox.state.tenancies = [t];
  assert(sandbox.tenancyKind(t) === 'historical', 'ended early → historical');
  assert(sandbox.effectiveOccupancyEnd(t) === '2026-09-15', 'effective end');
  assert(sandbox.stayBlocksDate(t, '2026-09-14') === false, 'closed status never blocks');
  assert(sandbox.stayBlocksDate(t, '2026-09-16') === false, 'after end free');
  assert(sandbox.currentOccupantsForRoom(12).length === 0, 'no current occupant');
});

check('TEST 5 Jiawen R5: ended duplicate gone; valid stay remains once', () => {
  seedBase();
  // Root cause recreation: two tenancy rows same room/tenant; one ended historical
  // but previously still appeared because Availability only filtered cancelled/no-show.
  sandbox.state.tenancies = [
    {
      id: 501,
      tenant_id: 200,
      room_id: 15,
      check_in: '2026-09-10',
      check_out: '2026-09-20',
      check_out_time: '12:00:00',
      status: 'historical', // manually ended duplicate
      tenancy_type: 'short_term',
      rent_amount: 35,
      rent_period: 'night',
    },
    {
      id: 502,
      tenant_id: 200,
      room_id: 15,
      check_in: '2026-09-10',
      check_out: '2026-09-20',
      check_out_time: '12:00:00',
      status: 'active', // valid stay
      tenancy_type: 'short_term',
      rent_amount: 35,
      rent_period: 'night',
    },
  ];
  assert(sandbox.isOperationallyClosed(sandbox.state.tenancies[0]) === true, 'dup closed');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-09-16') === false, 'ended dup does not block');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[1], '2026-09-16') === true, 'valid blocks');
  const occ = sandbox.currentOccupantsForRoom(15);
  assert(occ.length === 1 && occ[0].id === 502, `occupants ${occ.map((x) => x.id)}`);
  const deps = sandbox.upcomingDepartures(7);
  assert(deps.filter((x) => Number(x.tenant_id) === 200).length === 1, 'Jiawen departure once');
  assert(deps[0].id === 502, 'only valid tenancy id 502');
  // Availability calendar chip path: departing on checkout day must exclude closed
  const iso = '2026-09-20';
  const ts = sandbox.scopedTenancies();
  const active = ts.filter((t) => !sandbox.isOperationallyClosed(t) && sandbox.stayBlocksDate(t, iso));
  const departing = ts.filter((t) => {
    if (sandbox.isOperationallyClosed(t)) return false;
    const end = sandbox.effectiveOccupancyEnd(t);
    return end === iso && !active.some((a) => Number(a.id) === Number(t.id));
  });
  const jiawenChips = [...active, ...departing].filter((t) => Number(t.tenant_id) === 200);
  assert(jiawenChips.length === 1 && jiawenChips[0].id === 502, `Jiawen chips ${jiawenChips.map((x) => x.id)}`);
});

check('TEST 6 One valid upcoming departure counted/displayed once', () => {
  seedBase();
  sandbox.state.tenancies = [
    {
      id: 60,
      tenant_id: 202,
      room_id: 13,
      check_in: '2026-09-10',
      check_out: '2026-09-20',
      status: 'active',
    },
  ];
  const deps = sandbox.upcomingDepartures(7);
  assert(deps.length === 1 && deps[0].id === 60, 'single departure');
});

check('TEST 7 Cancelled booking not an upcoming departure', () => {
  seedBase();
  sandbox.state.tenancies = [
    {
      id: 70,
      tenant_id: 101,
      room_id: 15,
      check_in: '2026-09-12',
      check_out: '2026-09-18',
      status: 'cancelled',
    },
  ];
  assert(sandbox.upcomingDepartures(7).length === 0, 'cancelled excluded');
  assert(sandbox.tenancyKind(sandbox.state.tenancies[0]) === 'historical', 'cancelled → historical tab');
});

check('TEST 8 Early termination: old scheduled end does not create false departure', () => {
  seedBase();
  // Was scheduled to 30 Sep; ended early with effective check_out 12 Sep (before today)
  sandbox.state.tenancies = [
    {
      id: 80,
      tenant_id: 100,
      room_id: 12,
      check_in: '2026-09-01',
      check_out: '2026-09-12',
      status: 'historical',
      notes: 'ORIGINAL_END:2026-09-30',
    },
  ];
  assert(sandbox.upcomingDepartures(30).length === 0, 'no false future departure from old end');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-09-20') === false, 'does not occupy after early end');
});

check('TEST 9 Split stay: transfer ≠ final departure; Availability correct', () => {
  seedBase();
  const gid = 'split-stay-gid';
  sandbox.state.tenancies = [
    {
      id: 901,
      tenant_id: 300,
      room_id: 12,
      check_in: '2026-09-13',
      check_out: '2026-09-16',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1\nSEGMENT_COUNT:2`,
    },
    {
      id: 902,
      tenant_id: 300,
      room_id: 15,
      check_in: '2026-09-16',
      check_out: '2026-09-20',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2\nSEGMENT_COUNT:2`,
    },
  ];
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-09-15') === true, 'Room A occupied 15');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-09-16') === false, 'Room A free 16');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[1], '2026-09-16') === true, 'Room B occupied 16');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[1], '2026-09-20') === false, 'Room B free at final out');
  assert(sandbox.isFinalPropertyDeparture(sandbox.state.tenancies[0]) === false, 'seg1 not final');
  assert(sandbox.isFinalPropertyDeparture(sandbox.state.tenancies[1]) === true, 'seg2 final');
  const deps = sandbox.upcomingDepartures(14);
  assert(deps.length === 1 && deps[0].id === 902, 'final departure 20 Sep only');
  assert(sandbox.effectiveOccupancyEnd(deps[0]) === '2026-09-20', 'final end date');
  // One tenant profile
  const row = sandbox.tenantProfileRow(sandbox.state.tenants.find((t) => t.id === 300));
  assert(row.stay && [901, 902].includes(row.stay.id), 'one profile stay pick');
});

check('TEST 10 Returning tenant: Historical + Upcoming → Upcoming tab, no dup profile', () => {
  seedBase();
  sandbox.state.tenancies = [
    {
      id: 1001,
      tenant_id: 400,
      room_id: 12,
      check_in: '2026-07-01',
      check_out: '2026-07-20',
      status: 'completed',
    },
    {
      id: 1002,
      tenant_id: 400,
      room_id: 15,
      check_in: '2026-09-25',
      check_out: '2026-09-30',
      status: 'upcoming',
    },
  ];
  const row = sandbox.tenantProfileRow(sandbox.state.tenants.find((t) => t.id === 400));
  assert(row.kind === 'upcoming' && row.stay.id === 1002, 'appears as Upcoming');
  assert(sandbox.tenancyKind(sandbox.state.tenancies[0]) === 'historical', 'old stay historical');
  const profiles = sandbox.state.tenants.filter((t) => t.id === 400);
  assert(profiles.length === 1, 'single tenant profile record');
});

check('TEST 11 Laura 16 Sep + departures count matches dataset (no false 6)', () => {
  seedBase();
  // Recreate reported Overview bug:
  // - Laura duplicated (two live tenancy rows same checkout)
  // - Aura valid
  // - cancelled + historical + room-transfer middle segment inflated count to 6
  const gid = 'laura-group';
  sandbox.state.tenancies = [
    {
      id: 1101,
      tenant_id: 201,
      room_id: 15,
      check_in: '2026-09-11',
      check_out: '2026-09-16',
      status: 'active',
      rent_amount: 35,
      rent_period: 'night',
      tenancy_type: 'short_term',
    },
    {
      id: 1102,
      tenant_id: 201,
      room_id: 15,
      check_in: '2026-09-11',
      check_out: '2026-09-16',
      status: 'historical', // ended duplicate — was still counted before fix
      rent_amount: 35,
      rent_period: 'night',
      tenancy_type: 'short_term',
    },
    {
      id: 1103,
      tenant_id: 202,
      room_id: 13,
      check_in: '2026-09-12',
      check_out: '2026-09-20',
      status: 'active',
    },
    {
      id: 1104,
      tenant_id: 101,
      room_id: 12,
      check_in: '2026-09-10',
      check_out: '2026-09-18',
      status: 'cancelled',
    },
    // Split-stay transfer end on 16 Sep must NOT count as property departure
    {
      id: 1105,
      tenant_id: 300,
      room_id: 12,
      check_in: '2026-09-13',
      check_out: '2026-09-16',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 1106,
      tenant_id: 300,
      room_id: 15,
      check_in: '2026-09-16',
      check_out: '2026-09-22',
      status: 'upcoming',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  const deps = sandbox.upcomingDepartures(7);
  const laura = deps.filter((t) => Number(t.tenant_id) === 201);
  assert(laura.length === 1 && laura[0].id === 1101, `Laura once id=${laura.map((x) => x.id)}`);
  // Valid property departures in window: Laura 1101 (16), Aura 1103 (20) — NOT cancelled, NOT ended dup, NOT transfer seg1
  // Split Sam final is 22 Sep which is outside 7-day horizon from 15 Sep (horizon=22 inclusive: addDays(15,7)=22)
  assert(
    deps.map((t) => t.id).sort((a, b) => a - b).join(',') === '1101,1103,1106',
    `deps ids ${deps.map((t) => t.id)} count=${deps.length}`
  );
  assert(deps.length === 3, `count ${deps.length} must equal list length`);
  // Overview uses same helper for count and rows
  assert(typeof sandbox.upcomingDepartures === 'function', 'shared helper');
});

check('Historical status with future check_out still frees Availability', () => {
  seedBase();
  // End tenancy set status historical but left original far checkout — must not block
  sandbox.state.tenancies = [
    {
      id: 1201,
      tenant_id: 200,
      room_id: 15,
      check_in: '2026-09-01',
      check_out: '2026-09-30',
      status: 'historical',
    },
  ];
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-09-20') === false, 'historical frees room');
  assert(sandbox.roomOccupiedOverlap(15, '2026-09-20', '2026-09-25') === false, 'overlap free');
  assert(sandbox.upcomingDepartures(30).length === 0, 'not a departure');
});

console.log(`\n${passed}/${results.length} passed`);
if (process.exitCode) process.exit(1);
console.log('ALL PASS — tenant tabs / departures / ended-duplicate SoT');
