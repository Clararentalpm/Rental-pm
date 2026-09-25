#!/usr/bin/env node
/**
 * Availability Vacancy / Find Room — same operational allocation SoT as
 * Calendar / Room Status / Current (post–PR #26 Jiawen gap fix).
 * Cases A–J from the Availability canonical occupancy brief.
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
sandbox.today = () => '2026-09-23';
sandbox.localTimeHM = () => '10:00';

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

function seedBase() {
  Object.assign(sandbox.state, {
    propertyId: 1,
    availabilityMode: 'vacancy',
    properties: [
      { id: 1, name: 'McGregor' },
      { id: 2, name: 'Carindale' },
    ],
    rooms: [
      { id: 105, property_id: 1, room_no: 5 },
      { id: 106, property_id: 1, room_no: 6 },
      { id: 205, property_id: 2, room_no: 5 },
    ],
    roomProfiles: [],
    tenants: [
      { id: 10, name: 'Jiawen' },
      { id: 20, name: 'FutureGuest' },
      { id: 30, name: 'CarindaleOnly' },
      { id: 40, name: 'SplitTenant' },
    ],
    tenancies: [],
    viewings: [],
    bonds: [],
    payments: [],
    profiles: [],
    me: { role: 'owner' },
  });
}

const jiawenStay = () => ({
  id: 1001,
  tenant_id: 10,
  room_id: 105,
  check_in: '2026-09-01',
  check_out: '2026-09-29',
  check_out_time: '12:00',
  status: 'active',
  tenancy_type: 'short_term',
});

check('UI: Vacancy uses roomAvailabilitySummary / operationalAllocationsForRoom', () => {
  assert(/function roomAvailabilitySummary/.test(html), 'helper');
  assert(/roomAvailabilitySummary\(r\.id/.test(html), 'vacancy calls summary');
  assert(/operationalAllocationsForRoom\(r\.id/.test(html), 'calendar uses operational alloc');
  assert(/Current occupant:/.test(html), 'vacancy shows occupant label');
  assert(/Available after:/.test(html), 'available after label');
  assert(!/Long-term \/ ongoing rooms with no checkout date are excluded/.test(html), 'old hide-indefinite copy gone');
  assert(/roomOccupiedOverlap\(r\.id,inDate,outDate/.test(html), 'Find Room uses roomOccupiedOverlap');
});

check('A Valid current Jiawen-type stay → Calendar + Availability', () => {
  seedBase();
  const t = jiawenStay();
  sandbox.state.tenancies = [t];
  const sum = sandbox.roomAvailabilitySummary(105);
  assert(sum.current.length === 1 && Number(sum.current[0].id) === 1001, 'current in summary');
  assert(sandbox.stayBlocksDate(t, '2026-09-23') === true, 'calendar blocks today');
  assert(sandbox.currentOccupantsForRoom(105).some((x) => Number(x.id) === 1001), 'room status SoT');
  sandbox.state.availabilityMode = 'vacancy';
  const htmlOut = sandbox.availabilityPage();
  assert(/Jiawen/.test(htmlOut), 'vacancy HTML names Jiawen');
  assert(/Current occupant:/.test(htmlOut), 'occupant line');
  assert(sandbox.roomOccupiedOverlap(105, '2026-09-23', '2026-09-25') === true, 'conflict while occupied');
});

check('B Same stay appears in Current — Availability uses same allocation', () => {
  seedBase();
  const t = jiawenStay();
  sandbox.state.tenancies = [t];
  const cur = sandbox.currentOccupantsForRoom(105);
  const sum = sandbox.roomAvailabilitySummary(105);
  assert(cur.length === 1 && sum.current.length === 1, 'both have one');
  assert(Number(cur[0].id) === Number(sum.current[0].id), 'same tenancy id');
  assert(Number(cur[0].id) === 1001, 'canonical id');
});

check('C Duplicate Jiawen stay → Availability once', () => {
  seedBase();
  const a = jiawenStay();
  const dup = { ...jiawenStay(), id: 1002 };
  sandbox.state.tenancies = [a, dup];
  const sum = sandbox.roomAvailabilitySummary(105);
  assert(sum.current.length === 1, 'one current');
  assert(Number(sum.current[0].id) === 1001, 'lowest id wins');
  assert(sum.allocs.filter((x) => Number(x.tenant_id) === 10).length === 1, 'alloc once');
  const page = sandbox.availabilityPage();
  const hits = page.split('Jiawen').length - 1;
  assert(hits >= 1, 'named at least once');
  // Occupant line should not list Jiawen twice as "Jiawen + Jiawen"
  assert(!/Jiawen \+ Jiawen/.test(page), 'no double name');
});

check('D Duplicate ADMIN_VOID → valid stay remains', () => {
  seedBase();
  const a = jiawenStay();
  const voided = {
    ...jiawenStay(),
    id: 1002,
    status: 'admin_void',
    notes: 'ADMIN_VOID:1',
  };
  sandbox.state.tenancies = [a, voided];
  assert(sandbox.isAdminVoided(voided) === true, 'void detected');
  const sum = sandbox.roomAvailabilitySummary(105);
  assert(sum.current.length === 1 && Number(sum.current[0].id) === 1001, 'valid remains');
  assert(sandbox.roomOccupiedOverlap(105, '2026-09-23', '2026-09-25') === true, 'still occupied');
  assert(/Jiawen/.test(sandbox.availabilityPage()), 'still shown');
});

check('E Historical duplicate does not affect Availability', () => {
  seedBase();
  const a = jiawenStay();
  const hist = {
    id: 900,
    tenant_id: 10,
    room_id: 105,
    check_in: '2026-01-01',
    check_out: '2026-01-15',
    status: 'historical',
  };
  sandbox.state.tenancies = [a, hist];
  const sum = sandbox.roomAvailabilitySummary(105);
  assert(sum.allocs.every((x) => Number(x.id) !== 900), 'hist excluded');
  assert(sum.current.length === 1 && Number(sum.current[0].id) === 1001, 'only live');
  assert(sandbox.stayBlocksDate(hist, '2026-09-23') === false, 'hist no block');
});

check('F Checkout 29 Sep 12:00 — occupied until then; free after', () => {
  seedBase();
  sandbox.state.tenancies = [jiawenStay()];
  const sum = sandbox.roomAvailabilitySummary(105);
  assert(sum.availableAfterDate === '2026-09-29', 'date');
  assert(sum.availableAfterTime === '12:00', 'noon');
  assert(sandbox.roomOccupiedOverlap(105, '2026-09-28', '2026-09-29', { startTime: '00:00', endTime: '12:00' }) === true, 'before out blocked');
  // Same-day after 12:00 should be free (half-open end at 12:00).
  assert(
    sandbox.roomOccupiedOverlap(105, '2026-09-29', '2026-09-30', { startTime: '12:00', endTime: '12:00' }) === false,
    'after 12:00 free'
  );
  assert(sandbox.stayBlocksDate(jiawenStay(), '2026-09-28') === true, '28th overnight blocked');
  assert(sandbox.stayBlocksDate(jiawenStay(), '2026-09-29') === false, 'checkout day not overnight block');
});

check('G Future booking after Jiawen — gap + next', () => {
  seedBase();
  const a = jiawenStay();
  const fut = {
    id: 2001,
    tenant_id: 20,
    room_id: 105,
    check_in: '2026-10-05',
    check_in_time: '14:00',
    check_out: '2026-10-12',
    status: 'upcoming',
  };
  sandbox.state.tenancies = [a, fut];
  const sum = sandbox.roomAvailabilitySummary(105);
  assert(sum.next && Number(sum.next.id) === 2001, 'next booking');
  assert(sum.availableAfterDate === '2026-09-29', 'gap starts after Jiawen out');
  const page = sandbox.availabilityPage();
  assert(/FutureGuest/.test(page), 'next named');
  assert(/Next booking:/.test(page), 'next label');
  assert(sandbox.roomOccupiedOverlap(105, '2026-10-05', '2026-10-08') === true, 'future conflicts');
  assert(sandbox.roomOccupiedOverlap(105, '2026-09-30', '2026-10-04') === false, 'gap free');
});

check('H Edit Jiawen room/date → old free, new occupied', () => {
  seedBase();
  let t = jiawenStay();
  sandbox.state.tenancies = [t];
  assert(sandbox.roomAvailabilitySummary(105).current.length === 1, 'on room 5');
  // Simulate edit: move to room 6, new dates
  t = {
    ...t,
    room_id: 106,
    check_in: '2026-09-10',
    check_out: '2026-10-10',
    check_out_time: '12:00',
  };
  sandbox.state.tenancies = [t];
  assert(sandbox.roomAvailabilitySummary(105).current.length === 0, 'room 5 freed');
  assert(sandbox.roomOccupiedOverlap(105, '2026-09-23', '2026-09-25') === false, 'room 5 no conflict');
  assert(sandbox.roomAvailabilitySummary(106).current.length === 1, 'room 6 occupied');
  assert(sandbox.roomOccupiedOverlap(106, '2026-09-23', '2026-09-25') === true, 'room 6 conflict');
  assert(/Jiawen/.test(sandbox.availabilityPage()), 'still visible on new room');
});

check('I Property isolation — McGregor Jiawen ≠ Carindale Availability', () => {
  seedBase();
  sandbox.state.tenancies = [
    jiawenStay(),
    {
      id: 3001,
      tenant_id: 30,
      room_id: 205,
      check_in: '2026-09-01',
      check_out: '2026-10-01',
      status: 'active',
    },
  ];
  sandbox.state.propertyId = 1;
  const mcg = sandbox.roomAvailabilitySummary(105);
  assert(mcg.current.some((x) => Number(x.id) === 1001), 'McGregor sees Jiawen');
  assert(sandbox.roomAvailabilitySummary(205).current.length === 0, 'Carindale room not in McGregor operational scope via room id mismatch on property filter');
  // scoped: operationalAllocationsForRoom uses scopedTenancies → property via room.property_id
  assert(sandbox.operationalAllocationsForRoom(205).length === 0, 'room 205 not in McGregor scope');
  sandbox.state.propertyId = 2;
  assert(sandbox.roomAvailabilitySummary(205).current.some((x) => Number(x.id) === 3001), 'Carindale sees own');
  assert(sandbox.operationalAllocationsForRoom(105).length === 0, 'Jiawen not on Carindale');
  assert(!/Jiawen/.test(sandbox.availabilityPage()), 'Carindale vacancy page no Jiawen');
});

check('J Split stay — each room only its allocation window', () => {
  seedBase();
  const gid = 'split-jw';
  const seg1 = {
    id: 4001,
    tenant_id: 40,
    room_id: 105,
    check_in: '2026-09-01',
    check_out: '2026-09-20',
    check_out_time: '12:00',
    status: 'active',
    notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
  };
  const seg2 = {
    id: 4002,
    tenant_id: 40,
    room_id: 106,
    check_in: '2026-09-20',
    check_in_time: '14:00',
    check_out: '2026-10-05',
    check_out_time: '12:00',
    status: 'active',
    notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
  };
  sandbox.state.tenancies = [seg1, seg2];
  // On 23 Sep: room 5 free (ended 20th), room 6 occupied
  const s5 = sandbox.roomAvailabilitySummary(105);
  const s6 = sandbox.roomAvailabilitySummary(106);
  assert(s5.current.length === 0, 'room 5 not current after move');
  assert(s6.current.length === 1 && Number(s6.current[0].id) === 4002, 'room 6 current');
  assert(sandbox.roomOccupiedOverlap(105, '2026-09-23', '2026-09-25') === false, '5 free now');
  assert(sandbox.roomOccupiedOverlap(106, '2026-09-23', '2026-09-25') === true, '6 blocked now');
  assert(sandbox.roomOccupiedOverlap(105, '2026-09-10', '2026-09-15') === true, '5 blocked in its window');
  assert(sandbox.roomOccupiedOverlap(106, '2026-09-10', '2026-09-15') === false, '6 free in seg1 window');
});

check('Open-ended current stay is NOT hidden from Vacancy View', () => {
  seedBase();
  sandbox.state.tenancies = [
    {
      id: 5001,
      tenant_id: 10,
      room_id: 105,
      check_in: '2026-08-01',
      check_out: null,
      confirmed_until: null,
      status: 'active',
      tenancy_type: 'long_term',
    },
  ];
  const sum = sandbox.roomAvailabilitySummary(105);
  assert(sum.current.length === 1, 'current open-ended');
  assert(sum.openEndedCurrent === true, 'flag');
  const page = sandbox.availabilityPage();
  assert(/Jiawen/.test(page), 'name shown');
  assert(/Open-ended occupancy/.test(page), 'warning');
  assert(sandbox.roomOccupiedOverlap(105, '2026-09-23', '2026-10-01') === true, 'blocks find-room');
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(1);
