#!/usr/bin/env node
/**
 * Requirements 1–11 regression suite (A–AE).
 * Property isolation, Tenant archive, Delete Stay, payment cycle/filters,
 * Bond Open/Closed, Calendar/Room Status/Current SoT.
 * Does NOT mutate production data.
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
    return false;
  },
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(defs, sandbox);

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✓', msg);
  } else {
    failed++;
    console.error('  ✗', msg);
  }
}

function seedBase() {
  sandbox.state.properties = [
    { id: 1, name: 'Carindale', timezone: 'Australia/Brisbane' },
    { id: 2, name: 'McGregor', timezone: 'Australia/Brisbane' },
  ];
  sandbox.state.rooms = [
    { id: 101, property_id: 1, room_no: 2, notes: '' },
    { id: 105, property_id: 1, room_no: 5, notes: '' },
    { id: 201, property_id: 2, room_no: 2, notes: '' },
    { id: 205, property_id: 2, room_no: 5, notes: '' },
  ];
  sandbox.state.tenants = [
    { id: 1, name: 'Lesley' },
    { id: 2, name: 'NuYoah' },
    { id: 3, name: 'Jiawen' },
    { id: 4, name: 'McGregorOnly' },
    { id: 5, name: 'HistoricalPerson' },
    { id: 6, name: 'Aura' },
    { id: 7, name: 'Vicky' },
  ];
  sandbox.state.roomProfiles = [];
  sandbox.state.bonds = [];
  sandbox.state.payments = [];
  sandbox.state.paymentActions = [];
  sandbox.state.bookingEvents = [];
  sandbox.state.bondRefundEvents = [];
  sandbox.state.viewings = [];
  sandbox.state.propertyId = 1;
  sandbox.state.tenantFilter = 'current';
  sandbox.state.view = 'current';
  sandbox.state.bondFilter = 'open';
  sandbox.today = () => '2026-09-23';
  sandbox.localTimeHM = () => '15:00';
}

console.log('\n=== A–B Tenant Profiles Current/Upcoming vs Historical ===');
seedBase();
sandbox.state.tenancies = [
  { id: 10, tenant_id: 1, room_id: 101, check_in: '2026-08-01', check_out: null, status: 'active', rent_amount: 180, rent_period: 'week', payment_cycle_weeks: 4, tenancy_type: 'long_term' },
  { id: 11, tenant_id: 2, room_id: 101, check_in: '2026-10-01', check_out: '2026-10-14', status: 'upcoming', rent_amount: 235, rent_period: 'week', payment_cycle_weeks: 1, tenancy_type: 'short_term' },
  { id: 12, tenant_id: 5, room_id: 105, check_in: '2026-08-01', check_out: '2026-09-10', status: 'active', rent_amount: 200, rent_period: 'week', payment_cycle_weeks: 1, tenancy_type: 'long_term' },
];
{
  const rows = sandbox.state.tenants.map((t) => sandbox.tenantProfileRow(t)).filter((x) => x.onProperty && x.stay);
  const current = rows.filter((x) => x.kind === 'current');
  const upcoming = rows.filter((x) => x.kind === 'upcoming');
  const historical = rows.filter((x) => x.kind === 'historical');
  assert(current.some((x) => x.tenant.id === 1) && !current.some((x) => x.tenant.id === 5), 'A: Current shows Lesley, not HistoricalPerson');
  assert(upcoming.some((x) => x.tenant.id === 2), 'A: Upcoming shows NuYoah future stay');
  assert(historical.some((x) => x.tenant.id === 5), 'B: HistoricalPerson accessible in Historical/Archive');
  assert(!current.some((x) => x.kind === 'historical'), 'A: Historical not mixed into Current list');
}

console.log('\n=== C–D Delete Stay safety ===');
seedBase();
sandbox.state.tenancies = [
  { id: 20, tenant_id: 6, room_id: 101, check_in: '2026-09-20', check_out: '2026-09-25', status: 'upcoming', rent_amount: 100, rent_period: 'week', notes: 'empty dup' },
  { id: 21, tenant_id: 6, room_id: 101, check_in: '2026-09-20', check_out: '2026-09-25', status: 'upcoming', rent_amount: 100, rent_period: 'week', notes: 'empty dup twin' },
  { id: 22, tenant_id: 1, room_id: 101, check_in: '2026-08-01', check_out: null, status: 'active', rent_amount: 180, rent_period: 'week', payment_cycle_weeks: 4 },
];
sandbox.state.payments = [{ id: 1, tenancy_id: 22, amount: 720, status: 'paid', received_date: '2026-09-01', period_start: '2026-09-01', period_end: '2026-09-28' }];
sandbox.state.bonds = [{ id: 1, tenancy_id: 22, amount: 500, remaining_amount: 500, original_currency: 'AUD', received: true, refunded: false }];
{
  const emptyBlockers = sandbox.tenancyDeleteBlockers(20);
  const finBlockers = sandbox.tenancyDeleteBlockers(22);
  assert(emptyBlockers.length === 0, 'C: empty duplicate has no financial blockers');
  assert(finBlockers.length > 0, 'D: stay with payments/bonds is blocked from hard delete');
  assert(finBlockers.some((x) => /payment/i.test(x)) && finBlockers.some((x) => /bond/i.test(x)), 'D: blockers mention payments and bonds');
  const cls = sandbox.classifyStayRecord(sandbox.state.tenancies[1]);
  assert(cls.kind === 'duplicate_erroneous' && cls.safeDeleteCandidate === true, 'C: twin classified as safe delete candidate');
}

console.log('\n=== E–H Property isolation ===');
seedBase();
sandbox.state.tenancies = [
  { id: 30, tenant_id: 1, room_id: 101, check_in: '2026-08-01', check_out: null, status: 'active', rent_amount: 180, rent_period: 'week', payment_cycle_weeks: 4 },
  { id: 31, tenant_id: 4, room_id: 201, check_in: '2026-08-01', check_out: null, status: 'active', rent_amount: 220, rent_period: 'week', payment_cycle_weeks: 1 },
  { id: 32, tenant_id: 99, room_id: null, check_in: '2026-08-01', status: 'active', notes: 'unassigned leak candidate' },
];
sandbox.state.bonds = [
  { id: 10, tenancy_id: 30, amount: 400, remaining_amount: 400, original_currency: 'AUD', received: true, refunded: false, refund_amount: 0, forfeited_amount: 0, deduction_amount: 0 },
  { id: 11, tenancy_id: 31, amount: 900, remaining_amount: 900, original_currency: 'CNY', received: true, refunded: false, refund_amount: 0, forfeited_amount: 0, deduction_amount: 0 },
];
sandbox.state.payments = [
  { id: 10, tenancy_id: 30, amount: 720, status: 'paid', received_date: '2026-09-01', payment_method: 'EFT' },
  { id: 11, tenancy_id: 31, amount: 220, status: 'paid', received_date: '2026-09-01', payment_method: 'Cash' },
];
{
  sandbox.state.propertyId = 1;
  const car = sandbox.scopedTenancies();
  assert(car.every((t) => sandbox.stayPropertyId(t) === 1), 'E: Carindale scoped tenancies are Carindale only');
  assert(!car.some((t) => Number(t.id) === 31), 'E: McGregor stay absent under Carindale');
  assert(!car.some((t) => t.room_id == null), 'E: null-room stays do not leak onto Carindale');
  assert(sandbox.scopedBonds().every((b) => Number(b.tenancy_id) === 30), 'E: Carindale bonds only');
  assert(sandbox.scopedPayments().every((p) => Number(p.tenancy_id) === 30), 'E: Carindale payments only');
  assert(sandbox.openBondsForProperty().length === 1 && sandbox.openBondsForProperty()[0].id === 10, 'H: Open bonds count uses selected property');

  sandbox.state.propertyId = 2;
  const mcg = sandbox.scopedTenancies();
  assert(mcg.every((t) => sandbox.stayPropertyId(t) === 2), 'F: McGregor scoped tenancies are McGregor only');
  assert(!mcg.some((t) => Number(t.id) === 30), 'F: Carindale stay absent under McGregor');
  assert(sandbox.openBondsForProperty()[0].id === 11, 'F: McGregor open bond only');

  // G: switch McGregor → Carindale → McGregor
  sandbox.state.propertyId = 2;
  sandbox.state.paymentFilterTenant = '4';
  sandbox.state.propertyId = 1;
  assert(!sandbox.scopedTenancies().some((t) => Number(t.tenant_id) === 4), 'G: after switch to Carindale, McGregor tenant gone');
  sandbox.state.propertyId = 2;
  assert(sandbox.scopedTenancies().some((t) => Number(t.tenant_id) === 4), 'G: switch back restores McGregor');
}

console.log('\n=== I–J Lesley payment cycle 4 weeks ===');
seedBase();
const lesley = {
  id: 40,
  tenant_id: 1,
  room_id: 101,
  check_in: '2026-08-01',
  check_out: null,
  status: 'active',
  rent_amount: 180,
  rent_period: 'week',
  payment_cycle_weeks: 2,
  tenancy_type: 'long_term',
};
sandbox.state.tenancies = [lesley];
sandbox.state.payments = [
  { id: 40, tenancy_id: 40, amount: 360, status: 'paid', received_date: '2026-09-01', period_start: '2026-09-01', period_end: '2026-09-14', payment_method: 'EFT', notes: 'historical 2wk cycle' },
];
{
  assert(sandbox.expectedRentAmount(lesley) === 360, 'pre: 2wk cycle expects 360');
  lesley.payment_cycle_weeks = 4;
  assert(sandbox.expectedRentAmount(lesley) === 720, 'I: $180 × 4 = $720 expected');
  assert(sandbox.paymentDueAmount(lesley) === 720, 'I: paymentDueAmount uses cycle');
  assert(sandbox.rateCycleWeeks(lesley) === 4, 'I: cycle displays as 4 wk');
  const hist = sandbox.state.payments[0];
  assert(hist.amount === 360 && hist.period_end === '2026-09-14', 'J: historical payment amount/period unchanged');
  assert(sandbox.paidThrough(lesley) === '2026-09-14', 'J: covered-through preserved from historical payment');
}

console.log('\n=== K–L Payment filters ===');
seedBase();
sandbox.state.tenancies = [
  { id: 50, tenant_id: 1, room_id: 101, check_in: '2026-08-01', status: 'active', rent_amount: 180, rent_period: 'week', payment_cycle_weeks: 4 },
  { id: 51, tenant_id: 4, room_id: 201, check_in: '2026-08-01', status: 'active', rent_amount: 200, rent_period: 'week', payment_cycle_weeks: 1 },
];
sandbox.state.payments = [
  { id: 50, tenancy_id: 50, amount: 720, status: 'paid', received_date: '2026-09-05', payment_method: 'EFT', notes: 'Lesley Sep' },
  { id: 51, tenancy_id: 50, amount: 100, status: 'paid', received_date: '2026-08-01', payment_method: 'Cash', notes: 'Lesley Aug' },
  { id: 52, tenancy_id: 51, amount: 200, status: 'paid', received_date: '2026-09-05', payment_method: 'WeChat', notes: 'McGregor' },
];
{
  sandbox.state.propertyId = 1;
  let rows = sandbox.scopedPayments();
  assert(rows.length === 2 && rows.every((p) => Number(p.tenancy_id) === 50), 'K: property filter defaults to Carindale');
  rows = rows.filter((p) => {
    const t = sandbox.state.tenancies.find((x) => Number(x.id) === Number(p.tenancy_id));
    return Number(t.tenant_id) === 1 && p.received_date >= '2026-09-01' && p.received_date <= '2026-09-30'
      && sandbox.normalizePaymentMethod(p.payment_method) === 'EFT' && String(p.status) === 'paid';
  });
  assert(rows.length === 1 && rows[0].id === 50, 'K: property+tenant+date+method+status combine');
  sandbox.state.paymentFilterTenant = '';
  sandbox.state.paymentFilterFrom = '';
  sandbox.state.paymentFilterTo = '';
  sandbox.state.paymentFilterMethod = '';
  sandbox.state.paymentFilterStatus = 'all';
  assert(sandbox.scopedPayments().length === 2, 'L: reset restores property-scoped list');
}

console.log('\n=== M–R Bond Open/Closed, Edit, currency ===');
seedBase();
sandbox.state.tenancies = [
  { id: 60, tenant_id: 1, room_id: 101, check_in: '2026-08-01', check_out: null, status: 'active' },
  { id: 61, tenant_id: 2, room_id: 105, check_in: '2026-07-01', check_out: '2026-08-01', status: 'completed' },
];
sandbox.state.bonds = [
  { id: 60, tenancy_id: 60, amount: 500, remaining_amount: 500, original_currency: 'AUD', received: true, refunded: false, refund_amount: 0, forfeited_amount: 0, deduction_amount: 0 },
  { id: 61, tenancy_id: 61, amount: 800, remaining_amount: 0, original_currency: 'CNY', received: true, refunded: true, refund_amount: 800, forfeited_amount: 0, deduction_amount: 0 },
  { id: 62, tenancy_id: 60, amount: 300, remaining_amount: 300, original_currency: 'CNY', received: true, refunded: false, refund_amount: 0, forfeited_amount: 0, deduction_amount: 0 },
];
{
  assert(sandbox.bondBucket(sandbox.state.bonds[0]) === 'open', 'M: open bond remaining > 0');
  assert(sandbox.bondBucket(sandbox.state.bonds[1]) === 'closed', 'N: fully refunded is closed');
  assert(sandbox.openBondsForProperty().map((b) => b.id).sort().join(',') === '60,62', 'M: Open tab ids');
  assert(sandbox.bondsOnRefundWatch(7).every((b) => sandbox.bondIsOpen(b)), 'Q: refund watch uses open lifecycle');
  const totals = sandbox.openBondTotalsByCurrency();
  assert(totals.AUD === 500 && totals.CNY === 300, 'R: AUD/CNY not summed together');

  const plan = sandbox.planBondEdit(sandbox.state.bonds[0], { amount: 550, edit_reason: 'typo' });
  assert(plan.ok && plan.patch.amount === 550, 'O: edit updates existing amount');
  assert(!plan.create, 'O: no duplicate bond created');

  sandbox.state.bonds[0].refund_amount = 400;
  sandbox.state.bonds[0].remaining_amount = 100;
  const bad = sandbox.validateBondAmountEdit(sandbox.state.bonds[0], 300);
  assert(!!bad && /already refunded/i.test(bad), 'P: invalid amount correction blocked');
}

console.log('\n=== S–AE Calendar / Room Status / Current SoT ===');
seedBase();
sandbox.state.tenancies = [
  // NuYoah valid Room 2 23 Sep → 7 Oct
  { id: 70, tenant_id: 2, room_id: 101, check_in: '2026-09-23', check_out: '2026-10-07', check_in_time: '14:00', check_out_time: '12:00', status: 'upcoming', rent_amount: 235, rent_period: 'week', tenancy_type: 'short_term' },
  // Historical Room 5 person — ended
  { id: 71, tenant_id: 5, room_id: 105, check_in: '2026-08-01', check_out: '2026-09-10', status: 'active', rent_amount: 200, rent_period: 'week' },
  // Cancelled future
  { id: 72, tenant_id: 3, room_id: 105, check_in: '2026-10-01', check_out: '2026-10-14', status: 'cancelled', rent_amount: 200, rent_period: 'week' },
  // Duplicate NuYoah same dates (erroneous)
  { id: 73, tenant_id: 2, room_id: 101, check_in: '2026-09-23', check_out: '2026-10-07', status: 'upcoming', rent_amount: 235, rent_period: 'week' },
  // Expired but status=current
  { id: 74, tenant_id: 6, room_id: 105, check_in: '2026-09-06', check_out: '2026-09-13', status: 'current', rent_amount: 100, rent_period: 'week' },
  // Cancelled with status current
  { id: 75, tenant_id: 7, room_id: 105, check_in: '2026-09-20', check_out: '2026-10-20', status: 'cancelled', rent_amount: 100, rent_period: 'week' },
  // Upcoming becomes current (start today 14:00, now 15:00)
  { id: 76, tenant_id: 3, room_id: 105, check_in: '2026-09-23', check_out: '2026-10-01', check_in_time: '14:00', status: 'upcoming', rent_amount: 210, rent_period: 'week' },
  // McGregor only
  { id: 77, tenant_id: 4, room_id: 201, check_in: '2026-09-20', check_out: '2026-10-20', status: 'active', rent_amount: 180, rent_period: 'week' },
  // Split stay: Room 2 then Room 5
  { id: 80, tenant_id: 1, room_id: 101, check_in: '2026-09-01', check_out: '2026-09-20', status: 'completed', rent_amount: 180, rent_period: 'week', notes: 'BOOKING_GROUP:bg1\nSEGMENT_INDEX:1' },
  { id: 81, tenant_id: 1, room_id: 105, check_in: '2026-09-20', check_out: '2026-10-10', status: 'active', rent_amount: 180, rent_period: 'week', payment_cycle_weeks: 4, notes: 'BOOKING_GROUP:bg1\nSEGMENT_INDEX:2' },
];
{
  // S: NuYoah on calendar from 23 Sep
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies.find((t) => t.id === 70), '2026-09-23'), 'S: NuYoah blocks 23 Sep');
  assert(sandbox.stayTouchesLocalDate(sandbox.state.tenancies.find((t) => t.id === 70), '2026-09-23'), 'S: NuYoah touches 23 Sep');
  assert(!sandbox.roomDateAvailable(101, '2026-09-24', sandbox.scopedTenancies()), 'S: Room 2 not available 24 Sep');

  // T: edit dates — Room 2 only to 30 Sep, Room 5 from 1 Oct
  const nuyoah = sandbox.state.tenancies.find((t) => t.id === 70);
  nuyoah.check_out = '2026-09-30';
  sandbox.state.tenancies.push({
    id: 78,
    tenant_id: 2,
    room_id: 105,
    check_in: '2026-10-01',
    check_out: '2026-10-14',
    status: 'upcoming',
    rent_amount: 235,
    rent_period: 'week',
    notes: 'BOOKING_GROUP:ny1\nSEGMENT_INDEX:2',
  });
  nuyoah.notes = 'BOOKING_GROUP:ny1\nSEGMENT_INDEX:1';
  assert(sandbox.stayBlocksDate(nuyoah, '2026-09-29'), 'T: Room 2 still blocked before new end');
  assert(!sandbox.stayBlocksDate(nuyoah, '2026-10-02'), 'T: Room 2 free after edit end');
  assert(sandbox.stayBlocksDate(sandbox.state.tenancies.find((t) => t.id === 78), '2026-10-02'), 'T: Room 5 blocked for new allocation');

  // U: delete empty duplicate — simulate removal of id 73
  sandbox.state.tenancies = sandbox.state.tenancies.filter((t) => Number(t.id) !== 73);
  const occ = sandbox.currentOccupantsForRoom(101);
  assert(occ.filter((t) => Number(t.tenant_id) === 2).length <= 1, 'U: duplicate gone from Room Status');
  assert(sandbox.dedupeRoomStayRows(sandbox.scopedTenancies().filter((t) => Number(t.room_id) === 101 && Number(t.tenant_id) === 2)).length === 1, 'U: calendar dedupe one NuYoah on Room 2');

  // V: historical person not on future calendar
  const hist = sandbox.state.tenancies.find((t) => t.id === 71);
  assert(sandbox.tenancyKind(hist) === 'historical', 'V: ended stay is historical');
  assert(!sandbox.stayBlocksDate(hist, '2026-09-25'), 'V: historical does not block future dates');

  // W: cancelled future
  const cancelled = sandbox.state.tenancies.find((t) => t.id === 72);
  assert(sandbox.isOperationallyClosed(cancelled), 'W: cancelled is operationally closed');
  assert(!sandbox.stayBlocksDate(cancelled, '2026-10-05'), 'W: cancelled does not block calendar');
  assert(sandbox.roomDateAvailable(105, '2026-10-05', [cancelled]), 'W: availability free despite cancelled');

  // X: Room Status current only
  const room5cur = sandbox.currentOccupantsForRoom(105);
  assert(room5cur.some((t) => Number(t.id) === 76), 'X: Jiawen current on Room 5');
  assert(!room5cur.some((t) => Number(t.id) === 71), 'X: historical not in current occupant');
  assert(!room5cur.some((t) => Number(t.id) === 74), 'X: expired not current occupant');

  // Y: duplicate rows — add twin current and ensure dedupe
  sandbox.state.tenancies.push({
    id: 79,
    tenant_id: 3,
    room_id: 105,
    check_in: '2026-09-23',
    check_out: '2026-10-01',
    check_in_time: '14:00',
    status: 'active',
    rent_amount: 210,
    rent_period: 'week',
  });
  const deduped = sandbox.currentOccupantsForRoom(105).filter((t) => Number(t.tenant_id) === 3);
  assert(deduped.length === 1, 'Y: same tenant duplicate not repeated in Room Status');

  // Z: vacant with next
  sandbox.state.rooms.push({ id: 109, property_id: 1, room_no: 9, notes: '' });
  sandbox.state.tenancies.push({
    id: 90,
    tenant_id: 6,
    room_id: 109,
    check_in: '2026-10-05',
    check_out: '2026-10-12',
    check_in_time: '14:00',
    status: 'upcoming',
    rent_amount: 150,
    rent_period: 'week',
  });
  assert(sandbox.currentOccupantsForRoom(109).length === 0, 'Z: vacant now');
  const next = sandbox.nextBookingForRoom(109);
  assert(next && Number(next.id) === 90 && next.check_in === '2026-10-05', 'Z: Next shows future booking');

  // AA: expired status=current → not Current
  assert(sandbox.tenancyKind(sandbox.state.tenancies.find((t) => t.id === 74)) === 'historical', 'AA: expired not Current');

  // AB: cancelled status stored oddly
  assert(sandbox.tenancyKind(sandbox.state.tenancies.find((t) => t.id === 75)) === 'historical', 'AB: cancelled not Current');

  // AC: upcoming becomes current after start boundary
  assert(sandbox.tenancyKind(sandbox.state.tenancies.find((t) => t.id === 76)) === 'current', 'AC: stored upcoming → Current after check-in time');

  // AD: split stay — Lesley current overall via booking group segment 81; Room 2 historical segment
  assert(sandbox.tenancyKind(sandbox.state.tenancies.find((t) => t.id === 80)) === 'historical', 'AD: first split segment historical');
  assert(sandbox.tenancyKind(sandbox.state.tenancies.find((t) => t.id === 81)) === 'current', 'AD: second split segment current');
  assert(sandbox.bookingOperationalKind(sandbox.state.tenancies.find((t) => t.id === 81)) === 'current', 'AD: booking remains Current overall');
  assert(!sandbox.currentOccupantsForRoom(101).some((t) => Number(t.tenant_id) === 1), 'AD: Room 2 status not Lesley after transfer');
  assert(sandbox.currentOccupantsForRoom(105).some((t) => Number(t.tenant_id) === 1), 'AD: Room 5 status shows Lesley');

  // AE: property isolation operational views
  sandbox.state.propertyId = 1;
  assert(!sandbox.scopedTenancies().some((t) => Number(t.id) === 77), 'AE: McGregor stay not in Carindale operational set');
  assert(!sandbox.currentOccupantsForRoom(201).length, 'AE: McGregor room occupants empty under Carindale scope helper');
  sandbox.state.propertyId = 2;
  assert(sandbox.scopedTenancies().some((t) => Number(t.id) === 77), 'AE: McGregor stay present when McGregor selected');
  assert(!sandbox.scopedTenancies().some((t) => Number(t.id) === 70), 'AE: NuYoah Carindale stay absent under McGregor');
}

console.log('\n=== Admin void excludes from operational occupancy ===');
seedBase();
sandbox.state.tenancies = [
  { id: 100, tenant_id: 2, room_id: 101, check_in: '2026-09-23', check_out: '2026-10-07', status: 'cancelled', notes: 'ADMIN_VOID:1\nADMIN_VOID_REASON:duplicate' },
];
assert(sandbox.isAdminVoided(sandbox.state.tenancies[0]), 'void marker detected');
assert(sandbox.isOperationallyClosed(sandbox.state.tenancies[0]), 'void closed operationally');
assert(!sandbox.stayBlocksDate(sandbox.state.tenancies[0], '2026-09-25'), 'void stay not on calendar');

console.log('\n=== Cross-property integrity report (read-only) ===');
seedBase();
sandbox.state.tenancies = [
  { id: 200, tenant_id: 1, room_id: 101, property_id: 2, check_in: '2026-09-01', status: 'active' },
  { id: 201, tenant_id: 2, room_id: null, check_in: '2026-09-01', status: 'active' },
];
{
  const issues = sandbox.crossPropertyIntegrityReport();
  assert(issues.some((i) => i.kind === 'property_mismatch' && i.tenancyId === 200), 'reports tenancy/room property mismatch');
  assert(issues.some((i) => i.kind === 'unassigned_room' && i.tenancyId === 201), 'reports unassigned room');
  assert(sandbox.stayPropertyId(sandbox.state.tenancies[0]) === 1, 'room.property_id wins over mismatched tenancy.property_id');
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
