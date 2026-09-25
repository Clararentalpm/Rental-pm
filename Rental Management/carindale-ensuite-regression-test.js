#!/usr/bin/env node
/**
 * Carindale ensuite canonical config:
 *   Room 3 = Ensuite
 *   Room 4 = NOT Ensuite
 * McGregor unchanged.
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
  elements: { ensuite: { checked: false } },
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
sandbox.today = () => '2026-09-25';

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
    propertyId: 2,
    availabilityMode: 'vacancy',
    properties: [
      { id: 1, name: 'McGregor' },
      { id: 2, name: 'Carindale' },
    ],
    // Intentionally WRONG stored flags for Carindale — roomIsEnsuite must still be canonical.
    rooms: [
      { id: 101, property_id: 1, room_no: 3, ensuite: false, notes: '' },
      { id: 102, property_id: 1, room_no: 4, ensuite: true, notes: '' },
      { id: 201, property_id: 2, room_no: 3, ensuite: false, notes: '' },
      { id: 202, property_id: 2, room_no: 4, ensuite: true, notes: '' },
      { id: 203, property_id: 2, room_no: 5, ensuite: false, notes: '' },
    ],
    roomProfiles: [
      { room_id: 201, room_type: 'Standard', bathroom_type: 'Shared', current_asking_price: 210 },
      { room_id: 202, room_type: 'Standard', bathroom_type: 'Ensuite', current_asking_price: 270 },
      { room_id: 102, room_type: 'Standard', bathroom_type: 'Ensuite', current_asking_price: 200 },
    ],
    tenants: [],
    tenancies: [],
    viewings: [],
    bonds: [],
    payments: [],
    profiles: [{ id: 'u1', role: 'owner' }],
    me: { id: 'u1', role: 'owner' },
  });
}

check('Helpers: canonical Carindale map', () => {
  assert(sandbox.canonicalCarindaleEnsuite(3) === true, 'R3');
  assert(sandbox.canonicalCarindaleEnsuite(4) === false, 'R4');
  assert(sandbox.canonicalCarindaleEnsuite(5) === null, 'other');
  assert(/function roomIsEnsuite/.test(html), 'roomIsEnsuite');
  assert(/reconcileCarindaleEnsuiteFlags/.test(html), 'reconcile');
  assert(fs.existsSync(path.join(__dirname, 'supabase_carindale_ensuite_rooms_fix.sql')), 'sql');
});

check('1 Carindale Room 3 is Ensuite (even if stored false)', () => {
  seed();
  const r3 = sandbox.state.rooms.find((r) => r.id === 201);
  assert(r3.ensuite === false, 'stored wrongly false');
  assert(sandbox.roomIsEnsuite(r3) === true, 'canonical true');
  assert(/Ensuite/.test(sandbox.roomOptionLabel(r3)), 'label Ensuite');
});

check('2 Carindale Room 4 is NOT Ensuite (even if stored true)', () => {
  seed();
  const r4 = sandbox.state.rooms.find((r) => r.id === 202);
  assert(r4.ensuite === true, 'stored wrongly true');
  assert(sandbox.roomIsEnsuite(r4) === false, 'canonical false');
  assert(!/Ensuite/.test(sandbox.roomOptionLabel(r4)), 'label no Ensuite');
});

check('3 Availability identifies Room 3 correctly', () => {
  seed();
  sandbox.state.propertyId = 2;
  sandbox.state.availabilityMode = 'vacancy';
  const page = sandbox.availabilityPage();
  assert(/Room 3 · Ensuite/.test(page) || /Room 3/.test(page), 'room 3 present');
  // Vacancy cards use roomOptionLabel
  assert(sandbox.roomOptionLabel(sandbox.state.rooms.find((r) => r.id === 201)).includes('Ensuite'), 'avail label');
  assert(!sandbox.roomOptionLabel(sandbox.state.rooms.find((r) => r.id === 202)).includes('Ensuite'), 'r4 not');
});

check('4 Inspection/booking room selection identifies Room 3', () => {
  seed();
  sandbox.state.propertyId = 2;
  const opts = sandbox.currentPropertyRooms().map((r) => sandbox.roomOptionLabel(r));
  const r3 = opts.find((x) => /Room 3/.test(x));
  const r4 = opts.find((x) => /Room 4/.test(x));
  assert(r3 && /Ensuite/.test(r3), 'picker R3 ensuite');
  assert(r4 && !/Ensuite/.test(r4), 'picker R4 not');
});

check('5 Room Profile identifies Room 3 correctly', () => {
  seed();
  sandbox.state.propertyId = 2;
  const page = sandbox.roomsPage();
  // Room cards include ensuite badge via roomIsEnsuite
  assert(/data-room="201"|Room 3/.test(page), 'room 3 card');
  assert(/badge ensuite/.test(page), 'has ensuite badge somewhere');
  // Ensure Room 3 card path would show ensuite: isolate via helper
  assert(sandbox.roomIsEnsuite({ id: 201, property_id: 2, room_no: 3, ensuite: false }) === true, 'profile SoT');
});

check('6 McGregor configuration unaffected', () => {
  seed();
  sandbox.state.propertyId = 1;
  const mcg3 = sandbox.state.rooms.find((r) => r.id === 101);
  const mcg4 = sandbox.state.rooms.find((r) => r.id === 102);
  // McGregor uses stored flag — R3 stored false stays false; R4 stored true stays true
  assert(sandbox.roomIsEnsuite(mcg3) === false, 'mcg R3 uses stored false');
  assert(sandbox.roomIsEnsuite(mcg4) === true, 'mcg R4 uses stored true');
  assert(!/Ensuite/.test(sandbox.roomOptionLabel(mcg3)), 'mcg3 label');
  assert(/Ensuite/.test(sandbox.roomOptionLabel(mcg4)), 'mcg4 label');
});

check('No hard-coded Carindale Room 4 = Ensuite assumption in app source', () => {
  // Must not assert Carindale R4 is ensuite; comments saying NOT ensuite are fine.
  assert(!/Carindale\s+Room\s+4\s*=\s*Ensuite/i.test(html), 'no equals ensuite');
  assert(!/Carindale[^.\n]{0,40}Room\s*4[^.\n]{0,40}is\s+Ensuite/i.test(html), 'no is ensuite');
  const multi = fs.readFileSync(path.join(__dirname, 'multi-room-stay-regression-test.js'), 'utf8');
  assert(!/property_id:\s*2,\s*room_no:\s*4,\s*ensuite:\s*true/.test(multi), 'fixture fixed');
  assert(/property_id:\s*2,\s*room_no:\s*4,\s*ensuite:\s*false/.test(multi), 'fixture R4 false');
  assert(/property_id:\s*2,\s*room_no:\s*3,\s*ensuite:\s*true/.test(multi), 'fixture R3 true');
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(1);
