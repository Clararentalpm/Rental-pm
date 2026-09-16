#!/usr/bin/env node
/**
 * Calendar View — natural room sort + green Available from stayBlocksDate SoT.
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

function seed() {
  Object.assign(sandbox.state, {
    propertyId: 1,
    properties: [{ id: 1, name: 'McGregor' }],
    rooms: [
      { id: 110, property_id: 1, room_no: 10 },
      { id: 102, property_id: 1, room_no: 2 },
      { id: 101, property_id: 1, room_no: 1 },
      { id: 111, property_id: 1, room_no: 11 },
      { id: 103, property_id: 1, room_no: 3 },
      { id: 109, property_id: 1, room_no: 9 },
      { id: 104, property_id: 1, room_no: 4 },
      { id: 105, property_id: 1, room_no: 5 },
      { id: 106, property_id: 1, room_no: 6, notes: 'Sofa / Extra room' },
      { id: 107, property_id: 1, room_no: 7 },
      { id: 108, property_id: 1, room_no: 8 },
    ],
    roomProfiles: [],
    tenants: [
      { id: 1, name: 'Active' },
      { id: 2, name: 'Future' },
      { id: 3, name: 'Split' },
      { id: 4, name: 'Ended' },
      { id: 5, name: 'Cancelled' },
    ],
    tenancies: [],
    viewings: [],
    bonds: [],
    payments: [],
    profiles: [],
  });
}

check('UI markers: matrix + green Available legend', () => {
  assert(/compareRoomsNatural/.test(html), 'natural sort helper');
  assert(/roomDateAvailable/.test(html), 'roomDateAvailable');
  assert(/cal-matrix/.test(html), 'matrix calendar');
  assert(/cal-cell available/.test(html) || /cal-cell \$\{.*available/.test(html) || /class="cal-cell available/.test(html) || /available \$\{weekend\}/.test(html), 'available cell');
  assert(/Available \(green\)/.test(html), 'legend green');
  assert(/stayBlocksDate/.test(html), 'reuses stayBlocksDate');
});

check('TEST 1 Rooms 1–10 natural order (not 1,10,11,2)', () => {
  seed();
  const order = sandbox.currentPropertyRooms().map((r) => r.room_no);
  assert(
    order.slice(0, 10).join(',') === '1,2,3,4,5,7,8,9,10,11',
    `got ${order} (sofa excluded from first 10 numbered)`
  );
  // Full numbered sequence excluding sofa
  const numbered = sandbox
    .currentPropertyRooms()
    .filter((r) => !sandbox.isSofaRoom(r))
    .map((r) => Number(r.room_no));
  assert(numbered.join(',') === '1,2,3,4,5,7,8,9,10,11', `numbered ${numbered}`);
  assert(sandbox.isSofaRoom(sandbox.currentPropertyRooms().slice(-1)[0]), 'sofa last');
});

check('TEST 2 Refresh order remains consistent', () => {
  seed();
  const a = sandbox.currentPropertyRooms().map((r) => r.id).join(',');
  const b = sandbox.currentPropertyRooms().map((r) => r.id).join(',');
  assert(a === b, 'stable');
});

check('TEST 3 Vacant room → available/green for date', () => {
  seed();
  assert(sandbox.roomDateAvailable(101, '2026-09-20', []) === true, 'vacant');
  assert(sandbox.stayBlocksDate({ check_in: null, status: 'cancelled' }, '2026-09-20') === false, 'cancelled no block');
});

check('TEST 4 Active stay not available', () => {
  seed();
  const t = {
    id: 1,
    tenant_id: 1,
    room_id: 101,
    check_in: '2026-09-10',
    check_out: '2026-09-25',
    status: 'active',
  };
  sandbox.state.tenancies = [t];
  assert(sandbox.stayBlocksDate(t, '2026-09-16') === true, 'blocks mid');
  assert(sandbox.roomDateAvailable(101, '2026-09-16', [t]) === false, 'not green');
});

check('TEST 5 Upcoming confirmed not green', () => {
  seed();
  const t = {
    id: 2,
    tenant_id: 2,
    room_id: 102,
    check_in: '2026-09-20',
    check_out: '2026-09-30',
    status: 'upcoming',
  };
  assert(sandbox.stayBlocksDate(t, '2026-09-22') === true, 'reserved blocks');
  assert(sandbox.roomDateAvailable(102, '2026-09-22', [t]) === false, 'not available');
  assert(sandbox.roomDateAvailable(102, '2026-09-18', [t]) === true, 'before check-in free');
});

check('TEST 6 Early end → after effective end available', () => {
  seed();
  const t = {
    id: 4,
    tenant_id: 4,
    room_id: 103,
    check_in: '2026-09-01',
    check_out: '2026-09-15',
    status: 'historical',
  };
  assert(sandbox.isOperationallyClosed(t) === true, 'closed');
  assert(sandbox.stayBlocksDate(t, '2026-09-20') === false, 'after end free');
  assert(sandbox.roomDateAvailable(103, '2026-09-20', [t]) === true, 'green');
});

check('TEST 7 Cancelled stay → dates available', () => {
  seed();
  const t = {
    id: 5,
    tenant_id: 5,
    room_id: 104,
    check_in: '2026-09-10',
    check_out: '2026-09-30',
    status: 'cancelled',
  };
  assert(sandbox.stayBlocksDate(t, '2026-09-16') === false, 'cancelled no block');
  assert(sandbox.roomDateAvailable(104, '2026-09-16', [t]) === true, 'green');
});

check('TEST 8 Split stay — each room only its allocation', () => {
  seed();
  const gid = 'cal-split';
  const a = {
    id: 31,
    tenant_id: 3,
    room_id: 102,
    check_in: '2026-09-13',
    check_out: '2026-09-16',
    status: 'active',
    notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:1`,
  };
  const b = {
    id: 32,
    tenant_id: 3,
    room_id: 104,
    check_in: '2026-09-16',
    check_out: '2026-09-20',
    status: 'upcoming',
    notes: `BOOKING_GROUP:${gid}\nSEGMENT_INDEX:2`,
  };
  const ts = [a, b];
  assert(sandbox.roomDateAvailable(102, '2026-09-14', ts) === false, 'R2 occupied 14');
  assert(sandbox.roomDateAvailable(102, '2026-09-16', ts) === true, 'R2 free at handoff (half-open)');
  assert(sandbox.roomDateAvailable(104, '2026-09-14', ts) === true, 'R4 free before');
  assert(sandbox.roomDateAvailable(104, '2026-09-16', ts) === false, 'R4 occupied 16');
  assert(sandbox.roomDateAvailable(104, '2026-09-20', ts) === true, 'R4 free at final out');
});

check('TEST 9 Checkout day available for next check-in (half-open)', () => {
  seed();
  const out = {
    id: 41,
    tenant_id: 1,
    room_id: 105,
    check_in: '2026-09-10',
    check_out: '2026-09-16',
    check_out_time: '12:00:00',
    status: 'active',
  };
  const inn = {
    id: 42,
    tenant_id: 2,
    room_id: 105,
    check_in: '2026-09-16',
    check_in_time: '15:00:00',
    check_out: '2026-09-20',
    status: 'upcoming',
  };
  assert(sandbox.stayBlocksDate(out, '2026-09-16') === false, 'checkout exclusive');
  assert(sandbox.stayBlocksDate(inn, '2026-09-16') === true, 'new guest occupies');
  assert(sandbox.roomDateAvailable(105, '2026-09-16', [out, inn]) === false, 'no false vacancy');
  assert(sandbox.roomDateAvailable(105, '2026-09-16', [out]) === true, 'turnover vacancy if no arrival');
});

check('availabilityPage renders rooms in natural order with Available', () => {
  seed();
  sandbox.state.availabilityMode = 'calendar';
  const page = sandbox.availabilityPage();
  assert(/cal-matrix/.test(page), 'matrix markup');
  assert(/Available \(green\)/.test(page), 'legend');
  // Room labels appear in order in sticky column cells
  const rooms = [...page.matchAll(/class="cal-cell room">([^<]+)</g)].map((m) => m[1]);
  assert(rooms[0] === 'Room 1' && rooms[1] === 'Room 2' && rooms[2] === 'Room 3', `order ${rooms.slice(0, 5)}`);
  assert(rooms.includes('Room 10') && rooms.indexOf('Room 9') < rooms.indexOf('Room 10'), '9 before 10');
  assert(/cal-avail">Available/.test(page), 'green available label');
});

console.log(`\n${passed}/11 passed`);
if (process.exitCode) process.exit(1);
console.log('ALL PASS — calendar room sort + available green');
