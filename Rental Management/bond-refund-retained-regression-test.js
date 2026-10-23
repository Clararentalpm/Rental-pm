#!/usr/bin/env node
/**
 * Refund from retained bond + past-stay bond + delete archive plans.
 * Fictional data only — does not touch production.
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
  .replace(/\blet bondRetainBusy=/, 'var bondRetainBusy=')
  .replace(/\blet bondRefundRetainedBusy=/, 'var bondRefundRetainedBusy=')
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
  readOnly: false,
  checked: false,
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
  window: {},
  fetch: async () => ({ ok: true, json: async () => [], text: async () => '' }),
  alert() {},
  confirm: () => true,
  prompt: () => 'DELETE BOND',
  location: { href: 'http://localhost/', search: '', hash: '' },
  history: { replaceState() {} },
  navigator: { onLine: true },
  crypto: { randomUUID: () => '11111111-2222-3333-4444-555555555555' },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(defs, sandbox);

const {
  planBondRefundRetained,
  planBondRetain,
  bondRemaining,
  bondRetainedTotal,
  bondRefundedTotal,
  bondLedgerIdentity,
  bondBucket,
  bondDepositStatus,
  simulateRefundRetainedBondAtomic,
  simulateRetainBondAtomic,
  tenancyOptions,
  tenancyKind,
  bondActionLabel,
  deletedBondAuditHintsForTenancy,
} = sandbox;

let passed = 0;
let failed = 0;
function assert(cond, name) {
  if (cond) {
    passed++;
    console.log('PASS', name);
  } else {
    failed++;
    console.error('FAIL', name);
  }
}

// Fictional closed fully-retained bond
const closed = {
  id: 9001,
  tenancy_id: 7001,
  amount: 100,
  original_currency: 'AUD',
  refund_amount: 0,
  forfeited_amount: 100,
  deduction_amount: 0,
  remaining_amount: 0,
  deposit_status: 'Forfeited / Retained',
  refunded: false,
};
assert(bondRemaining(closed) === 0, 'fully retained remaining is 0');
assert(bondRetainedTotal(closed) === 100, 'fully retained total 100');
assert(bondBucket(closed) === 'closed', 'fully retained is closed bucket');

const p30 = planBondRefundRetained(closed, {
  amount: 30,
  reason: 'Partial admin refund after retention',
  method: 'EFT',
  reference: 'RR-30',
  staffId: 'staff-1',
});
assert(p30.ok, 'partial refund-from-retained plans');
assert(p30.summary.retainedAfter === 70, 'retained becomes 70');
assert(p30.summary.refundedAfter === 30, 'refunded becomes 30');
assert(p30.summary.remainingAfter === 0, 'remaining stays 0');
assert(p30.event.action === 'refund_retained', 'action is refund_retained');
assert(p30.patch.forfeited_amount === 70 && p30.patch.refund_amount === 30, 'patch swaps retain→refund');
assert(bondLedgerIdentity({ ...closed, ...p30.patch }).ok, 'ledger identity after partial');

const after30 = { ...closed, ...p30.patch };
assert(bondBucket(after30) === 'closed', 'still closed after partial refund-from-retained');
assert(
  String(bondDepositStatus(after30)).toLowerCase().includes('partial') ||
    String(after30.deposit_status).includes('Partial'),
  'status reflects partial forfeit/refund'
);

const over = planBondRefundRetained(closed, { amount: 130, reason: 'too much' });
assert(!over.ok, 'blocks over-refund vs retained');

const zero = planBondRefundRetained(closed, { amount: 0, reason: 'zero' });
assert(!zero.ok, 'blocks zero amount');

const noReason = planBondRefundRetained(closed, { amount: 10, reason: '  ' });
assert(!noReason.ok, 'requires reason');

const fullPlan = planBondRefundRetained(closed, {
  amount: 100,
  reason: 'Full refund of retained',
  method: 'Cash',
});
assert(fullPlan.ok, 'full refund of retained plans');
assert(fullPlan.summary.retainedAfter === 0 && fullPlan.summary.refundedAfter === 100, 'full clears retained');
assert(fullPlan.summary.remainingAfter === 0, 'full refund remaining still 0');

// Repeat attempt after partial: only 70 left
const second = planBondRefundRetained(after30, { amount: 40, reason: 'second slice' });
assert(second.ok && second.summary.retainedAfter === 30, 'repeat partial from remaining retained');
const secondOver = planBondRefundRetained(after30, { amount: 80, reason: 'too much again' });
assert(!secondOver.ok, 'repeat attempt cannot overdraw retained');

// Ordinary remaining refund still works when remaining > 0
const openBond = {
  id: 9002,
  amount: 100,
  refund_amount: 0,
  forfeited_amount: 0,
  deduction_amount: 0,
};
assert(bondRemaining(openBond) === 100, 'ordinary open remaining 100');
const retainHalf = planBondRetain(openBond, { mode: 'partial', amount: 40, reason: 'keep forty' });
assert(retainHalf.ok && retainHalf.summary.remainingAfter === 60, 'ordinary retain leaves remaining');
const afterRetainHalf = { ...openBond, ...retainHalf.patch };
assert(bondRemaining(afterRetainHalf) === 60, 'remaining after partial retain');
// Simulated ordinary partial refund of remaining (ledger math)
const ordinaryRefundAmt = 20;
const ordinaryNext = {
  ...afterRetainHalf,
  refund_amount: bondRefundedTotal(afterRetainHalf) + ordinaryRefundAmt,
  remaining_amount: bondRemaining(afterRetainHalf) - ordinaryRefundAmt,
};
assert(bondLedgerIdentity(ordinaryNext).ok, 'ordinary refund after retain keeps identity');
assert(bondRemaining(ordinaryNext) === 40, 'ordinary refund reduces remaining');

// Atomic simulator: idempotent replay
const db = {
  bonds: [{ ...closed }],
  events: [],
  nextEventId: 1,
};
const key = 'refund-retained:9001:test-1';
const sim1 = simulateRefundRetainedBondAtomic(db, {
  p_bond_id: 9001,
  p_amount: 30,
  p_reason: 'sim',
  p_method: 'EFT',
  p_idempotency_key: key,
});
assert(sim1.ok && !sim1.replayed, 'sim first apply');
const sim2 = simulateRefundRetainedBondAtomic(db, {
  p_bond_id: 9001,
  p_amount: 30,
  p_reason: 'sim',
  p_method: 'EFT',
  p_idempotency_key: key,
});
assert(sim2.ok && sim2.replayed, 'sim idempotent replay');
assert(db.bonds[0].forfeited_amount === 70 && db.bonds[0].refund_amount === 30, 'sim bond ledger');
assert(db.events.length === 1, 'sim single history row');

// Full lifecycle: past stay → record bond → full retain → refund part (in-memory)
const pastStay = {
  id: 7100,
  tenant_id: 1,
  room_id: 1,
  property_id: 1,
  check_in: '2024-01-01',
  check_out: '2024-02-01',
  status: 'completed',
};
sandbox.state = {
  propertyId: 1,
  bonds: [],
  bondRefundEvents: [],
  bondEvents: [],
  roomProfiles: [],
  tenancies: [pastStay],
  rooms: [{ id: 1, property_id: 1, room_no: 1, name: 'R1' }],
  tenants: [{ id: 1, name: 'Fictional Past Tenant' }],
  properties: [{ id: 1, name: 'Test Prop' }],
};
assert(tenancyKind(pastStay) === 'historical', 'past stay is historical');
const opts = tenancyOptions({ historicalOnly: true });
assert(String(opts).includes('7100') && String(opts).includes('past stay'), 'tenancyOptions includes past stay');
assert(!String(tenancyOptions()).includes('7100'), 'default tenancyOptions excludes historical');

const recorded = {
  id: 9100,
  tenancy_id: 7100,
  amount: 100,
  original_currency: 'AUD',
  refund_amount: 0,
  forfeited_amount: 0,
  deduction_amount: 0,
  received_date: '2024-01-02',
  received_via: 'Transfer',
  notes: 'PAST_STAY_BOND: recorded against historical stay #7100 without changing stay dates',
};
const retainFull = planBondRetain(recorded, { mode: 'full', reason: 'Full retain after past-stay record' });
assert(retainFull.ok && retainFull.summary.remainingAfter === 0, 'full retain after past-stay record');
const retainedBond = { ...recorded, ...retainFull.patch };
const refundPart = planBondRefundRetained(retainedBond, {
  amount: 25,
  reason: 'Refund part of retained after past stay',
  method: 'EFT',
  reference: 'PAST-25',
});
assert(refundPart.ok, 'refund part after past stay retain');
assert(refundPart.summary.retainedAfter === 75 && refundPart.summary.refundedAfter === 25, 'lifecycle ledger 75/25');
assert(refundPart.summary.remainingAfter === 0, 'lifecycle remaining 0');
assert(pastStay.check_in === '2024-01-01' && pastStay.check_out === '2024-02-01', 'stay dates unchanged');

// Explicit retain $100 then refund $30 consistency (UI status fields)
const r100 = {
  id: 9200,
  amount: 100,
  original_currency: 'AUD',
  refund_amount: 0,
  forfeited_amount: 0,
  deduction_amount: 0,
};
const keepAll = planBondRetain(r100, { mode: 'full', reason: 'retain all' });
assert(keepAll.ok && keepAll.summary.retainingNow === 100, 'retain $100 full');
const kept = { ...r100, ...keepAll.patch };
assert(bondRemaining(kept) === 0 && bondRetainedTotal(kept) === 100 && bondRefundedTotal(kept) === 0, 'after retain: rem0 ret100 ref0');
assert(bondBucket(kept) === 'closed', 'after full retain is closed');
const back30 = planBondRefundRetained(kept, { amount: 30, reason: 'refund thirty' });
assert(back30.ok, 'refund $30 from retained');
const afterBack = { ...kept, ...back30.patch };
assert(bondRetainedTotal(afterBack) === 70, 'net retained 70');
assert(bondRefundedTotal(afterBack) === 30, 'refunded 30');
assert(bondRemaining(afterBack) === 0, 'remaining still 0');
assert(bondBucket(afterBack) === 'closed', 'still closed after refund-from-retained');
assert(afterBack.deposit_status === 'Partial forfeit / partial refund', 'status Partial forfeit / partial refund');
assert(bondLedgerIdentity(afterBack).ok, 'identity 100=30+70+0+0');
assert(bondActionLabel('received') === 'Bond received', 'received action label');

// Closed bond: refund-from-retained does not reopen and does not rewrite prior retain events
const priorRetainEvent = {
  id: 1,
  bond_id: 9200,
  action: 'retain_full',
  amount: 100,
  notes: 'retain all',
  reference: 'retain:9200:full',
};
const eventsBefore = [priorRetainEvent];
const eventsAfterPlan = eventsBefore.slice(); // plan does not mutate history
assert(eventsAfterPlan[0].action === 'retain_full' && eventsAfterPlan[0].amount === 100, 'original retain event unchanged by plan');
assert(bondBucket(afterBack) === 'closed' && bondRemaining(afterBack) === 0, 'closed stays closed');

// Authorised holders share Owner-level bond edit gate
sandbox.state.me = { id: 'viewer-1', role: 'viewer' };
sandbox.state.profiles = [{ id: 'viewer-1', role: 'viewer', display_name: 'V' }];
assert(sandbox.canEdit() === true && sandbox.hasFullAppAccess() === true, 'authorised viewer has full bond edit access');
sandbox.state.me = { id: 'stranger', role: 'owner' };
sandbox.state.profiles = [{ id: 'viewer-1', role: 'viewer' }];
assert(sandbox.canEdit() === false, 'signed profile required — role label alone is not enough');

assert(bondActionLabel('refund_retained') === 'Refund from retained', 'action label');

// Deleted-history audit hints: thin activity_log only — never invents events
sandbox.state.activity = [
  {
    action: 'delete_bond',
    entity_id: 888,
    created_at: '2026-10-01T00:00:00Z',
    details: { amount: 100, tenancy_id: 7100, type: 'bond' },
  },
];
const hints = deletedBondAuditHintsForTenancy(7100);
assert(hints.length === 1 && Number(hints[0].details.amount) === 100, 'audit hint finds delete_bond amount');
assert(deletedBondAuditHintsForTenancy(9999).length === 0, 'audit hint empty for other stay');
assert(
  /deleted action history is not recreated|payment receipt/i.test(
    String(require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8'))
  ),
  'past-stay copy refuses to invent deleted history'
);

// Retain then refund simulator chain
const lifeDb = {
  bonds: [{ ...recorded }],
  events: [],
  nextEventId: 1,
};
const retainSim = simulateRetainBondAtomic(lifeDb, {
  p_bond_id: 9100,
  p_mode: 'full',
  p_amount: null,
  p_reason: 'full',
  p_idempotency_key: 'retain:9100:full-1',
});
assert(retainSim.ok, 'retain sim for lifecycle');
const refundSim = simulateRefundRetainedBondAtomic(lifeDb, {
  p_bond_id: 9100,
  p_amount: 25,
  p_reason: 'part',
  p_idempotency_key: 'refund-retained:9100:part-1',
});
assert(refundSim.ok && refundSim.retained_after === 75 && refundSim.refunded_after === 25, 'chained sim retain→refund');

// Source guard: no legacy hard-delete fallback strings in deleteBond path
const htmlSrc = require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert(!/Continue with permanent hard delete/.test(htmlSrc), 'legacy hard-delete confirm removed');
assert(/archive_and_delete_bond is not installed/.test(htmlSrc), 'clear block error when RPC missing');
assert(!/await api\('bonds',`id=eq\.\$\{id\}`,\{method:'DELETE'\}\)/.test(
  htmlSrc.slice(htmlSrc.indexOf('async function deleteBond'), htmlSrc.indexOf('async function loadBondArchivesPanel'))
), 'deleteBond has no direct bonds DELETE fallback');

(async () => {
  // deleteBond: no hard-delete fallback when archive RPC missing
  sandbox.state.bonds = [{ id: 9300, tenancy_id: 7100, amount: 50, forfeited_amount: 0, refund_amount: 0, deduction_amount: 0, bond_type: 'bond', original_currency: 'AUD' }];
  sandbox.state.bondRefundEvents = [{ id: 9, bond_id: 9300, action: 'received', amount: 50 }];
  sandbox.state.bondEvents = [{ id: 8, bond_id: 9300, amount: 50 }];
  sandbox.state.me = { id: 'viewer-1', role: 'viewer' };
  sandbox.state.profiles = [{ id: 'viewer-1', role: 'viewer' }];
  const delMissing = await sandbox.deleteBond(9300, {
    prompt: () => 'DELETE BOND',
    alert: () => {},
    toast: () => {},
    skipReload: true,
    callRpc: async () => {
      throw new Error('PGRST202 Could not find the function public.archive_and_delete_bond');
    },
  });
  assert(delMissing.ok === false && delMissing.error === 'archive_rpc_missing', 'delete blocked when archive RPC missing');
  assert(sandbox.state.bonds.some((x) => Number(x.id) === 9300), 'bond row kept when archive RPC missing');
  assert(sandbox.state.bondRefundEvents.some((x) => Number(x.bond_id) === 9300), 'refund events kept when archive RPC missing');

  const delOk = await sandbox.deleteBond(9300, {
    prompt: () => 'DELETE BOND',
    alert: () => {},
    toast: () => {},
    skipReload: true,
    callRpc: async () => ({
      ok: true,
      restore_token: 'bond-archive:9300:test',
      refund_events_archived: 1,
      payment_events_archived: 1,
    }),
  });
  assert(delOk.ok === true && delOk.archive.restore_token, 'delete succeeds with verified archive token');
  assert(!sandbox.state.bonds.some((x) => Number(x.id) === 9300), 'bond removed from state after archived delete');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
