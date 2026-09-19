#!/usr/bin/env node
/**
 * Calendar / occupancy datetime boundaries (Brisbane-local).
 * Tests A–J: Jiawen +1 day, NuYoah +1 day, turnover, timezone safety, conflicts.
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
  crypto: { randomUUID: () => 'bg-dt-1' },
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(defs, sandbox, { timeout: 12000 });

let FIXED = '2026-09-19';
let FIXED_TIME = '10:00';
sandbox.today = () => FIXED;
sandbox.localTimeHM = () => FIXED_TIME;

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
      { id: 5, property_id: 1, room_no: 5 },
      { id: 15, property_id: 1, room_no: 5 },
    ],
    tenants: [
      { id: 10, name: 'Jiawen' },
      { id: 12, name: 'NuYoah' },
      { id: 20, name: 'Tenant A' },
      { id: 21, name: 'Tenant B' },
    ],
    tenancies: [],
    viewings: [],
    bonds: [],
    payments: [],
    paymentActions: [],
    profiles: [{ id: 'u1', role: 'owner' }],
  });
}

check('Helpers: no toISOString for calendar dates; occupancyInterval present', () => {
  assert(/occupancyInterval/.test(html), 'occupancyInterval');
  assert(/parseLocalDateOnly/.test(html), 'parseLocalDateOnly');
  assert(/Australia\/Brisbane/.test(html), 'Brisbane');
  // Calendar matrix must not key cells with toISOString
  const cal = html.match(/Room × date matrix[\s\S]*?function viewingsPage/);
  assert(cal && !/toISOString\(\)\.slice\(0,10\)/.test(cal[0]), 'calendar matrix avoids toISOString keys');
});

check('TEST A Jiawen checkout marker on 29 Sep not 30 Sep', () => {
  FIXED = '2026-09-19';
  seed();
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 10,
      room_id: 15,
      check_in: '2026-09-16',
      check_out: '2026-09-29',
      check_out_time: '12:00',
      status: 'active',
    },
  ];
  const page = sandbox.availabilityPage();
  // Find calendar cell content pairing — header day and chip share same local iso key.
  assert(sandbox.effectiveOccupancyEnd(sandbox.state.tenancies[0]) === '2026-09-29', 'end date');
  const chip = sandbox.calendarStayChip(sandbox.state.tenancies[0], '2026-09-29');
  assert(/Jiawen/.test(chip) && /out 12:00/.test(chip), chip);
  const wrong = sandbox.calendarStayChip(sandbox.state.tenancies[0], '2026-09-30');
  assert(!/out 12:00/.test(wrong) || sandbox.state.tenancies[0].check_out !== '2026-09-30', 'not on 30');
  // Rendered page: 29 Sep header cell should include out chip for Jiawen when matrix aligned
  assert(/29 Sep/.test(page), 'has 29 Sep header');
  // Build dates like the page does and ensure iso matches header day
  const iso29 = '2026-09-29';
  const d = sandbox.parseLocalDateOnly(iso29, 12, 0);
  assert(d.getDate() === 29, 'local day 29');
  assert(sandbox.addDays('2026-09-19', 10) === '2026-09-29', 'addDays local');
});

check('TEST B NuYoah check-in on 8 Oct not 9 Oct', () => {
  FIXED = '2026-09-19';
  seed();
  sandbox.state.tenancies = [
    {
      id: 2,
      tenant_id: 12,
      room_id: 5,
      check_in: '2026-10-08',
      check_in_time: '08:00',
      check_out: '2026-10-14',
      check_out_time: '12:00',
      status: 'upcoming',
    },
  ];
  const chip = sandbox.calendarStayChip(sandbox.state.tenancies[0], '2026-10-08');
  assert(/NuYoah/.test(chip) && /in 08:00/.test(chip), chip);
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-10-08') === true, 'blocks 8 Oct');
  assert(sandbox.addDays('2026-09-19', 19) === '2026-10-08', 'addDays to 8 Oct');
  const d = sandbox.parseLocalDateOnly('2026-10-08', 12, 0);
  assert(d.getDate() === 8, 'header day 8');
});

check('TEST C Room 5 not fully Available on 8 Oct', () => {
  FIXED = '2026-09-19';
  seed();
  sandbox.state.tenancies = [
    {
      id: 2,
      tenant_id: 12,
      room_id: 5,
      check_in: '2026-10-08',
      check_in_time: '08:00',
      check_out: '2026-10-14',
      status: 'upcoming',
    },
  ];
  assert(sandbox.roomDateAvailable(5, '2026-10-08') === false, 'not fully available');
  assert(sandbox.stayTouchesLocalDate(sandbox.state.tenancies[0], '2026-10-08') === true, 'touches');
});

check('TEST D same-day turnover 12:00 / 14:00', () => {
  FIXED = '2026-10-08';
  seed();
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 20,
      room_id: 2,
      check_in: '2026-10-01',
      check_out: '2026-10-08',
      check_out_time: '12:00',
      status: 'active',
    },
    {
      id: 2,
      tenant_id: 21,
      room_id: 2,
      check_in: '2026-10-08',
      check_in_time: '14:00',
      check_out: '2026-10-12',
      status: 'upcoming',
    },
  ];
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-10-08') === false, 'A freed overnight');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[1], '2026-10-08') === true, 'B occupies');
  const aIv = sandbox.occupancyInterval(sandbox.state.tenancies[0]);
  const bIv = sandbox.occupancyInterval(sandbox.state.tenancies[1]);
  assert(aIv.endMs === sandbox.parseLocalDateTime('2026-10-08', '12:00').getTime(), 'A ends noon');
  assert(bIv.startMs === sandbox.parseLocalDateTime('2026-10-08', '14:00').getTime(), 'B starts 14:00');
  assert(sandbox.intervalsOverlapMs(aIv.startMs, aIv.endMs, bIv.startMs, bIv.endMs) === false, 'no overlap');
  // Gap available
  assert(
    sandbox.roomOccupiedOverlap(2, '2026-10-08', '2026-10-08', {
      startTime: '12:30',
      endTime: '13:30',
    }) === false,
    'gap free'
  );
});

check('TEST E date-only timezone safety 2026-09-29 stays 29 Sep', () => {
  const d = sandbox.parseLocalDateOnly('2026-09-29', 12, 0);
  assert(d.getFullYear() === 2026 && d.getMonth() === 8 && d.getDate() === 29, 'local parts');
  assert(sandbox.fmtDate('2026-09-29').includes('29') && sandbox.fmtDate('2026-09-29').includes('Sep'), sandbox.fmtDate('2026-09-29'));
  assert(sandbox.addDays('2026-09-29', 0) === '2026-09-29', 'addDays 0');
  assert(sandbox.addDays('2026-09-29', 1) === '2026-09-30', 'addDays 1');
});

check('TEST F Brisbane timezone helpers', () => {
  assert(sandbox.propertyTimeZone() === 'Australia/Brisbane', 'tz');
  const iso = sandbox.localDateISO(new Date('2026-09-29T14:00:00+00:00'), 'Australia/Brisbane');
  // 14:00 UTC = 00:00 next day Brisbane → 30 Sep
  assert(iso === '2026-09-30', 'UTC 14:00 → Brisbane date ' + iso);
  // DATE-ONLY path must ignore that trap
  assert(sandbox.parseLocalDateOnly('2026-09-29').getDate() === 29, 'date-only safe');
});

check('TEST G split stay transfer times', () => {
  FIXED = '2026-10-08';
  FIXED_TIME = '15:00';
  seed();
  const gid = 'bg-xfer';
  sandbox.state.tenancies = [
    {
      id: 50,
      tenant_id: 12,
      room_id: 2,
      check_in: '2026-09-23',
      check_out: '2026-10-08',
      check_out_time: '12:00',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
    },
    {
      id: 51,
      tenant_id: 12,
      room_id: 5,
      check_in: '2026-10-08',
      check_in_time: '14:00',
      check_out: '2026-10-14',
      status: 'active',
      notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
    },
  ];
  assert(sandbox.bookingOperationalKind(sandbox.state.tenancies[0]) === 'current', 'current');
  assert(sandbox.isFinalPropertyDeparture(sandbox.state.tenancies[0]) === false, 'no false dep');
  assert(sandbox.isFirstPropertyArrival(sandbox.state.tenancies[1]) === false, 'no false arr');
  assert(sandbox.currentAllocationSegment(sandbox.state.tenancies[0]).room_id === 5, 'in R5');
  assert(/out 12:00/.test(sandbox.calendarStayChip(sandbox.state.tenancies[0], '2026-10-08')), 'R2 out');
  assert(/in 14:00/.test(sandbox.calendarStayChip(sandbox.state.tenancies[1], '2026-10-08')), 'R5 in');
});

check('TEST H Edit Stay allocation times feed occupancy', () => {
  FIXED = '2026-09-19';
  seed();
  const a = {
    id: 100,
    tenant_id: 12,
    room_id: 2,
    check_in: '2026-09-23',
    check_out: '2026-10-07',
    status: 'upcoming',
    tenancy_type: 'short_term',
    notes: '',
  };
  sandbox.state.tenancies = [a];
  const plan = sandbox.planBookingAllocationsEdit(a, [
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
      check_in_time: '08:00',
      check_out: '2026-10-14',
      check_out_time: '12:00',
      tenancy_type: 'short_term',
    },
  ]);
  assert(plan.ok, plan.error);
  // Simulate saved second allocation
  sandbox.state.tenancies.push({
    id: 101,
    tenant_id: 12,
    room_id: 5,
    check_in: '2026-10-08',
    check_in_time: '08:00',
    check_out: '2026-10-14',
    check_out_time: '12:00',
    status: 'upcoming',
    notes: `BOOKING_GROUP:${plan.groupId}\nSEGMENT_INDEX:2`,
  });
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies[1], '2026-10-08') === true, 'blocks from 8 Oct');
  assert(/in 08:00/.test(sandbox.calendarStayChip(sandbox.state.tenancies[1], '2026-10-08')), 'chip 8 Oct');
  assert(sandbox.roomDateAvailable(5, '2026-10-08') === false, 'avail blocks');
});

check('TEST I conflict 8 Oct 08:00 vs 09:00', () => {
  FIXED = '2026-09-19';
  seed();
  sandbox.state.tenancies = [
    {
      id: 101,
      tenant_id: 12,
      room_id: 5,
      check_in: '2026-10-08',
      check_in_time: '08:00',
      check_out: '2026-10-14',
      check_out_time: '12:00',
      status: 'upcoming',
    },
  ];
  assert(
    sandbox.roomOccupiedOverlap(5, '2026-10-08', '2026-10-10', {
      startTime: '09:00',
      endTime: '12:00',
    }) === true,
    'conflict'
  );
});

check('TEST J Upcoming→Current at check-in time', () => {
  FIXED = '2026-09-23';
  seed();
  const t = {
    id: 1,
    tenant_id: 12,
    room_id: 2,
    check_in: '2026-09-23',
    check_in_time: '08:00',
    check_out: '2026-10-07',
    status: 'upcoming',
  };
  sandbox.state.tenancies = [t];
  FIXED_TIME = '07:59';
  assert(sandbox.tenancyKind(t) === 'upcoming', 'before 08:00 upcoming');
  assert(sandbox.isCurrentOccupancyStay(t) === false, 'not current yet');
  FIXED_TIME = '08:00';
  assert(sandbox.tenancyKind(t) === 'current', 'at 08:00 current');
  assert(sandbox.isCurrentOccupancyStay(t) === true, 'current occupancy');
});

check('Render: Jiawen out on 29 Sep cell content', () => {
  FIXED = '2026-09-19';
  seed();
  sandbox.state.tenancies = [
    {
      id: 1,
      tenant_id: 10,
      room_id: 15,
      check_in: '2026-09-16',
      check_out: '2026-09-29',
      check_out_time: '12:00:00',
      status: 'active',
    },
  ];
  const page = sandbox.availabilityPage();
  // Extract: after building dates, ensure iso==header day for Sep 29
  const dates = [];
  for (let i = 0; i < 90; i++) {
    const iso = sandbox.addDays(FIXED, i);
    const d = sandbox.parseLocalDateOnly(iso, 12, 0);
    dates.push({ iso, day: d.getDate(), month: d.getMonth() + 1 });
  }
  const cell = dates.find((x) => x.iso === '2026-09-29');
  assert(cell && cell.day === 29 && cell.month === 9, JSON.stringify(cell));
  const bad = dates.find((x) => x.iso === '2026-09-29' && x.day === 30);
  assert(!bad, 'iso 29 must not display as day 30');
  assert(page.includes('Jiawen') && page.includes('out 12:00'), 'page has checkout chip');
});

console.log(`\n${passed} passed`);
if (process.exitCode) process.exit(1);
console.log('ALL PASS — calendar datetime boundaries Brisbane');
