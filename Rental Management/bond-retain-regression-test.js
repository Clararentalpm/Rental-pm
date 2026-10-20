#!/usr/bin/env node
/**
 * Retain Bond — partial / full retention, repeats, refund-after-partial, over-retention.
 * Administrative ledger only (forfeited_amount); does not invent payments.
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
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(defs, sandbox, { timeout: 8000 });
sandbox.today = () => '2026-10-20';

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
async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log('PASS', name);
  } catch (e) {
    console.error('FAIL', name, e.message);
    process.exitCode = 1;
  }
}

function seedBond(extra = {}) {
  Object.assign(sandbox.state, {
    propertyId: 1,
    properties: [{ id: 1, name: 'McGregor' }],
    rooms: [{ id: 15, property_id: 1, room_no: 5 }],
    tenants: [{ id: 10, name: 'Retain Guest' }],
    tenancies: [
      {
        id: 100,
        tenant_id: 10,
        room_id: 15,
        check_in: '2026-09-10',
        check_out: '2026-10-10',
        status: 'active',
      },
    ],
    bonds: [
      {
        id: 55,
        tenancy_id: 100,
        amount: 500,
        original_currency: 'AUD',
        currency: 'AUD',
        received: true,
        refunded: false,
        received_date: '2026-09-16',
        bond_type: 'rental_bond',
        notes: '',
        remaining_amount: 500,
        refund_amount: 0,
        forfeited_amount: 0,
        deduction_amount: 0,
        deposit_status: null,
        ...extra,
      },
    ],
    bondRefundEvents: [],
    bondEvents: [],
    bookingEvents: [],
    payments: [],
    paymentActions: [],
    profiles: [{ id: 'staff-1', display_name: 'Alex Staff', role: 'owner' }],
    me: { id: 'staff-1', display_name: 'Alex Staff', role: 'owner' },
  });
}

function applyRetain(plan) {
  assert(plan.ok === true, plan.error || 'plan not ok');
  Object.assign(sandbox.state.bonds[0], plan.patch);
  sandbox.state.bondRefundEvents.push({
    ...plan.event,
    id: sandbox.state.bondRefundEvents.length + 1,
    created_at: '2026-10-20T10:00:00.000Z',
  });
}

check('UI Retain Bond dialog + planBondRetain helper present', () => {
  assert(/Retain Bond/.test(html), 'Retain Bond label');
  assert(/bond-retain-dialog/.test(html), 'retain dialog');
  assert(/planBondRetain/.test(html), 'planBondRetain');
  assert(/bondRetainBusy/.test(html), 'duplicate-submit lock');
  assert(/Administrative record only/.test(html) || /administrative retention only/i.test(html), 'admin-only note');
  assert(/retain_full/.test(html) && /retain_partial/.test(html), 'retain actions');
  assert(/applyBondRetain/.test(html), 'applyBondRetain');
  assert(/simulateRetainBondAtomic/.test(html), 'atomic simulator');
  assert(/retain_bond_atomic/.test(html), 'RPC name');
  assert(/supabase_bond_retain_atomic\.sql/.test(html), 'migration prerequisite referenced');
  assert(/bondLedgerIdentity/.test(html), 'ledger identity helper');
  assert(/newBondRetainIdempotencyKey/.test(html), 'idempotency key');
  assert(/isAmbiguousRetainNetworkError/.test(html), 'ambiguous network helper');
  // Must not hide retention inside deduction_amount; must not compensate-delete after success.
  assert(
    !/deduction_amount:Number\(b\.deduction_amount\|\|0\)\+plan\.summary\.retainingNow/.test(html),
    'no retain→deduction fallback'
  );
  assert(!/deleteEvent\(eventId\)/.test(html), 'no compensating history delete');
  assert(/rpc\/retain_bond_atomic/.test(html), 'single RPC path');
});

check('Partial retention: amount, reason, staff, balance & status', () => {
  seedBond();
  const plan = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 150,
    reason: 'Cleaning damage',
    staffId: 'staff-1',
    retainedAt: '2026-10-20',
  });
  assert(plan.ok, plan.error);
  assert(plan.summary.original === 500, 'original');
  assert(plan.summary.alreadyRefunded === 0, 'already refunded');
  assert(plan.summary.alreadyRetained === 0, 'already retained');
  assert(plan.summary.retainingNow === 150, 'retaining now');
  assert(plan.summary.remainingAfter === 350, 'remaining after');
  assert(plan.event.action === 'retain_partial', 'event action');
  assert(plan.event.amount === 150, 'event amount');
  assert(plan.event.notes === 'Cleaning damage', 'reason');
  assert(plan.event.created_by === 'staff-1', 'staff');
  assert(plan.patch.forfeited_amount === 150, 'ledger retained');
  assert(plan.patch.forfeited_at === '2026-10-20', 'date');
  assert(plan.patch.forfeiture_reason === 'Cleaning damage', 'reason on bond');
  applyRetain(plan);
  const b = sandbox.state.bonds[0];
  assert(sandbox.bondRemaining(b) === 350, `remaining ${sandbox.bondRemaining(b)}`);
  assert(sandbox.bondRetainedTotal(b) === 150, 'retained total');
  assert(sandbox.bondRefundedTotal(b) === 0, 'refunds unchanged');
  assert(/partial/i.test(sandbox.bondDepositStatus(b)), `status ${sandbox.bondDepositStatus(b)}`);
  assert(sandbox.state.bondRefundEvents.length === 1, 'history row');
  assert(sandbox.staffLabel('staff-1') === 'Alex Staff', 'staff label');
});

check('Full retention: auto uses remaining unpaid/unrefunded balance', () => {
  seedBond({ refund_amount: 100, forfeited_amount: 50, remaining_amount: 350 });
  assert(sandbox.bondRemaining(sandbox.state.bonds[0]) === 350, 'pre remaining');
  const plan = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'full',
    amount: 9999, // ignored for full
    reason: 'Tenant absconded',
    staffId: 'staff-1',
    retainedAt: '2026-10-20',
  });
  assert(plan.ok, plan.error);
  assert(plan.summary.retainingNow === 350, `full retain uses remaining, got ${plan.summary.retainingNow}`);
  assert(plan.event.action === 'retain_full', 'action');
  assert(plan.patch.forfeited_amount === 400, '50+350');
  assert(plan.patch.remaining_amount === 0, 'closed');
  applyRetain(plan);
  const b = sandbox.state.bonds[0];
  assert(sandbox.bondRemaining(b) === 0, 'remaining 0');
  assert(sandbox.bondRefundedTotal(b) === 100, 'prior refund kept');
  assert(sandbox.bondRetainedTotal(b) === 400, 'retained total');
  assert(/retain|forfeit/i.test(sandbox.bondDepositStatus(b)), sandbox.bondDepositStatus(b));
});

check('Repeated retainals accumulate without exceeding bond', () => {
  seedBond();
  applyRetain(
    sandbox.planBondRetain(sandbox.state.bonds[0], {
      mode: 'partial',
      amount: 100,
      reason: 'First keep',
      staffId: 'staff-1',
      retainedAt: '2026-10-20',
    })
  );
  applyRetain(
    sandbox.planBondRetain(sandbox.state.bonds[0], {
      mode: 'partial',
      amount: 75,
      reason: 'Second keep',
      staffId: 'staff-1',
      retainedAt: '2026-10-21',
    })
  );
  const b = sandbox.state.bonds[0];
  assert(sandbox.bondRetainedTotal(b) === 175, `retained ${sandbox.bondRetainedTotal(b)}`);
  assert(sandbox.bondRemaining(b) === 325, `remaining ${sandbox.bondRemaining(b)}`);
  assert(sandbox.state.bondRefundEvents.length === 2, 'two history rows');
  assert(sandbox.state.bondRefundEvents[0].notes === 'First keep', 'first reason');
  assert(sandbox.state.bondRefundEvents[1].notes === 'Second keep', 'second reason');
});

check('Refund after partial retention leaves prior retain + allows remainder refund', () => {
  seedBond();
  applyRetain(
    sandbox.planBondRetain(sandbox.state.bonds[0], {
      mode: 'partial',
      amount: 200,
      reason: 'Damage',
      staffId: 'staff-1',
      retainedAt: '2026-10-20',
    })
  );
  const b = sandbox.state.bonds[0];
  const priorRefund = sandbox.bondRefundedTotal(b);
  const priorRetain = sandbox.bondRetainedTotal(b);
  assert(priorRefund === 0 && priorRetain === 200, 'pre-refund state');
  // Simulate partial refund of remaining (existing refund path math)
  const refundAmt = 150;
  const rem = sandbox.bondRemaining(b);
  assert(rem === 300, '300 refundable before refund');
  b.refund_amount = Number(b.refund_amount || 0) + refundAmt;
  b.remaining_amount = Math.max(0, rem - refundAmt);
  b.remaining_description = `Remaining after partial refund: ${b.remaining_amount}`;
  sandbox.state.bondRefundEvents.push({
    bond_id: b.id,
    action: 'partial_refund',
    amount: refundAmt,
    currency: 'AUD',
    notes: 'Partial refund of remainder',
    created_by: 'staff-1',
    created_at: '2026-10-22T10:00:00.000Z',
  });
  assert(sandbox.bondRetainedTotal(b) === 200, 'retain unchanged by refund');
  assert(sandbox.bondRefundedTotal(b) === 150, 'refund recorded');
  assert(sandbox.bondRemaining(b) === 150, `remaining ${sandbox.bondRemaining(b)}`);
  assert(sandbox.bondCommittedOutflows(b) === 350, 'outflows');
  // Can still refund the last 150
  const last = sandbox.bondRemaining(b);
  b.refund_amount = Number(b.refund_amount || 0) + last;
  b.remaining_amount = 0;
  assert(sandbox.bondRemaining(b) === 0, 'fully settled');
  assert(sandbox.bondRetainedTotal(b) === 200, 'retain still 200');
  assert(sandbox.bondRefundedTotal(b) === 300, 'total refunded 300');
});

check('Over-retention prevented (amount and total vs original)', () => {
  seedBond({ refund_amount: 200, forfeited_amount: 200, remaining_amount: 100 });
  const overAmt = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 150,
    reason: 'Too much',
    staffId: 'staff-1',
  });
  assert(overAmt.ok === false, 'block > remaining');
  assert(/remain|exceed/i.test(overAmt.error || ''), overAmt.error);

  seedBond({ refund_amount: 0, forfeited_amount: 0 });
  const overBond = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 600,
    reason: 'Over original',
    staffId: 'staff-1',
  });
  assert(overBond.ok === false, 'block > original');

  seedBond({ refund_amount: 400, forfeited_amount: 50, remaining_amount: 50 });
  const okFifty = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 50,
    reason: 'Exact remaining',
    staffId: 'staff-1',
  });
  assert(okFifty.ok === true, okFifty.error);
  const tooMuch = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 50.01,
    reason: 'Penny over',
    staffId: 'staff-1',
  });
  assert(tooMuch.ok === false, 'penny over blocked');
});

check('Reason required; zero/negative amount blocked; full with nothing left blocked', () => {
  seedBond();
  assert(
    sandbox.planBondRetain(sandbox.state.bonds[0], { mode: 'partial', amount: 10, reason: '' }).ok === false,
    'reason required'
  );
  assert(
    sandbox.planBondRetain(sandbox.state.bonds[0], { mode: 'partial', amount: 0, reason: 'x' }).ok === false,
    'zero blocked'
  );
  assert(
    sandbox.planBondRetain(sandbox.state.bonds[0], { mode: 'partial', amount: -5, reason: 'x' }).ok === false,
    'negative blocked'
  );
  seedBond({
    amount: 500,
    refund_amount: 300,
    forfeited_amount: 200,
    remaining_amount: 0,
    deposit_status: 'Forfeited / Retained',
  });
  assert(
    sandbox.planBondRetain(sandbox.state.bonds[0], { mode: 'full', reason: 'again' }).ok === false,
    'nothing left'
  );
});

check('Summary fields exposed for confirmation UI', () => {
  seedBond({ refund_amount: 80, forfeited_amount: 20, deduction_amount: 10 });
  const plan = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 50,
    reason: 'Confirm summary',
    staffId: 'staff-1',
  });
  assert(plan.ok, plan.error);
  assert(plan.summary.original === 500, 'original');
  assert(plan.summary.alreadyRefunded === 80, 'refunded');
  assert(plan.summary.alreadyRetained === 20, 'retained');
  assert(plan.summary.alreadyDeducted === 10, 'deducted in summary');
  assert(plan.summary.retainingNow === 50, 'now');
  assert(plan.summary.remainingAfter === 340, 'after accounts for deduction');
  assert(typeof sandbox.formatBondRetainSummary === 'function', 'format helper');
  const htmlSummary = sandbox.formatBondRetainSummary(sandbox.state.bonds[0], 'partial', 50);
  assert(/Original bond/.test(htmlSummary), 'original in summary');
  assert(/Already refunded/.test(htmlSummary), 'refunded in summary');
  assert(/Already retained/.test(htmlSummary), 'retained in summary');
  assert(/Already deducted/.test(htmlSummary), 'deducted in summary');
  assert(/Amount being retained now/.test(htmlSummary), 'now in summary');
  assert(/Remaining refundable after/.test(htmlSummary), 'after in summary');
});

check('Ledger identity: original = refunded + retained + deducted + remaining', () => {
  seedBond({ refund_amount: 100, forfeited_amount: 75, deduction_amount: 25 });
  let idn = sandbox.bondLedgerIdentity(sandbox.state.bonds[0]);
  assert(idn.ok, `pre ${JSON.stringify(idn)}`);
  assert(idn.sum === 500, `sum ${idn.sum}`);
  applyRetain(
    sandbox.planBondRetain(sandbox.state.bonds[0], {
      mode: 'partial',
      amount: 50,
      reason: 'Extra retain',
      staffId: 'staff-1',
      retainedAt: '2026-10-20',
    })
  );
  idn = sandbox.bondLedgerIdentity(sandbox.state.bonds[0]);
  assert(idn.ok, `post ${JSON.stringify(idn)}`);
  assert(idn.retained === 125, 'retained cumulative');
  assert(idn.refunded === 100, 'refund unchanged');
  assert(idn.deducted === 25, 'deduction unchanged');
  assert(idn.remaining === 250, `remaining ${idn.remaining}`);
  // Reusing forfeited_amount must not invent a second retention bucket.
  assert(sandbox.bondRetainedTotal(sandbox.state.bonds[0]) === sandbox.bondForfeited(sandbox.state.bonds[0]), 'alias');
});

check('Full retention after partial retention uses remaining only', () => {
  seedBond();
  applyRetain(
    sandbox.planBondRetain(sandbox.state.bonds[0], {
      mode: 'partial',
      amount: 120,
      reason: 'First partial',
      staffId: 'staff-1',
      retainedAt: '2026-10-20',
    })
  );
  assert(sandbox.bondRemaining(sandbox.state.bonds[0]) === 380, 'after partial');
  const full = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'full',
    reason: 'Close remainder',
    staffId: 'staff-1',
    retainedAt: '2026-10-21',
  });
  assert(full.ok, full.error);
  assert(full.summary.retainingNow === 380, 'full = remaining');
  assert(full.patch.forfeited_amount === 500, '120+380');
  applyRetain(full);
  const idn = sandbox.bondLedgerIdentity(sandbox.state.bonds[0]);
  assert(idn.ok && idn.remaining === 0 && idn.retained === 500, JSON.stringify(idn));
  assert(sandbox.state.bondRefundEvents.length === 2, 'two history events');
});

check('Refund then retention: prior refund kept; retain from remaining', () => {
  seedBond();
  const b = sandbox.state.bonds[0];
  b.refund_amount = 180;
  b.remaining_amount = 320;
  sandbox.state.bondRefundEvents.push({
    bond_id: b.id,
    action: 'partial_refund',
    amount: 180,
    currency: 'AUD',
    notes: 'Partial refund first',
    created_by: 'staff-1',
    created_at: '2026-10-19T10:00:00.000Z',
  });
  assert(sandbox.bondRemaining(b) === 320, 'remaining after refund');
  const plan = sandbox.planBondRetain(b, {
    mode: 'partial',
    amount: 100,
    reason: 'Retain after refund',
    staffId: 'staff-1',
    retainedAt: '2026-10-20',
  });
  assert(plan.ok, plan.error);
  assert(plan.summary.alreadyRefunded === 180, 'sees prior refund');
  applyRetain(plan);
  assert(sandbox.bondRefundedTotal(b) === 180, 'refund unchanged');
  assert(sandbox.bondRetainedTotal(b) === 100, 'retained');
  assert(sandbox.bondRemaining(b) === 220, 'remaining');
  assert(sandbox.bondLedgerIdentity(b).ok, 'identity');
  // Prior refund history row untouched.
  assert(sandbox.state.bondRefundEvents[0].action === 'partial_refund', 'refund history kept');
  assert(sandbox.state.bondRefundEvents[0].amount === 180, 'refund amount kept');
});

check('Existing deduction + prior forfeit: retain does not double-count', () => {
  seedBond({
    refund_amount: 50,
    forfeited_amount: 100, // prior cancel/forfeit
    deduction_amount: 40, // prior deduction action
  });
  const before = sandbox.bondLedgerIdentity(sandbox.state.bonds[0]);
  assert(before.ok, JSON.stringify(before));
  assert(before.remaining === 310, `remaining ${before.remaining}`);
  const plan = sandbox.planBondRetain(sandbox.state.bonds[0], {
    mode: 'partial',
    amount: 60,
    reason: 'Additional retain',
    staffId: 'staff-1',
    retainedAt: '2026-10-20',
  });
  assert(plan.ok, plan.error);
  assert(plan.patch.forfeited_amount === 160, 'adds to existing forfeit/retain ledger');
  assert(plan.summary.alreadyDeducted === 40, 'deduction visible');
  applyRetain(plan);
  const after = sandbox.bondLedgerIdentity(sandbox.state.bonds[0]);
  assert(after.ok, JSON.stringify(after));
  assert(after.deducted === 40, 'deduction not rewritten');
  assert(after.refunded === 50, 'refund not rewritten');
  assert(after.retained === 160 && after.remaining === 250, JSON.stringify(after));
});

check('Optimistic filter changes after retain; stale second plan overdraws blocked', () => {
  seedBond();
  const b = sandbox.state.bonds[0];
  const filterBefore = sandbox.bondRetainOptimisticFilter(b);
  assert(/id=eq\.55/.test(filterBefore), filterBefore);
  assert(/forfeited_amount/.test(filterBefore), filterBefore);
  const planA = sandbox.planBondRetain(b, {
    mode: 'partial',
    amount: 300,
    reason: 'Tab A',
    staffId: 'staff-1',
    retainedAt: '2026-10-20',
  });
  const planBStale = sandbox.planBondRetain(b, {
    mode: 'partial',
    amount: 300,
    reason: 'Tab B stale',
    staffId: 'staff-1',
    retainedAt: '2026-10-20',
  });
  assert(planA.ok && planBStale.ok, 'both plans ok on same snapshot');
  applyRetain(planA);
  const filterAfter = sandbox.bondRetainOptimisticFilter(b);
  assert(filterBefore !== filterAfter, 'optimistic filter must change after retain');
  // Re-plan from updated bond: cannot take another 300
  const planBFresh = sandbox.planBondRetain(b, {
    mode: 'partial',
    amount: 300,
    reason: 'Tab B fresh',
    staffId: 'staff-1',
  });
  assert(planBFresh.ok === false, 'second 300 blocked after first applied');
  assert(sandbox.bondLedgerIdentity(b).ok, 'identity after first');
});

check('Edit Bond / Cancel-forfeit validators still intact', () => {
  seedBond({ refund_amount: 0, forfeited_amount: 0 });
  assert(sandbox.validateBondAmountEdit(sandbox.state.bonds[0], 550) === '', 'edit up ok');
  seedBond({ refund_amount: 200, forfeited_amount: 100 });
  assert(!!sandbox.validateBondAmountEdit(sandbox.state.bonds[0], 250), 'edit below outflows blocked');
  assert(sandbox.validateDepositSplit(300, 100, 200) === '', 'forfeit split ok');
  assert(!!sandbox.validateDepositSplit(300, 150, 200), 'forfeit split over blocked');
  assert(/forfeit_full/.test(html) && /forfeit_partial/.test(html), 'cancel forfeit actions remain');
  assert(/planBondEdit/.test(html), 'edit bond remains');
  assert(!/insert\('rent_payments'[\s\S]{0,80}retain/i.test(html), 'retain does not invent rent_payments');
});

function atomicDbFromBond(bond) {
  return {
    bonds: [bond],
    events: [],
    nextEventId: 1,
    authUid: 'staff-1',
  };
}

function rpcDepsFromDb(db, opts = {}) {
  const keyCalls = { rpc: 0, lookup: 0 };
  return {
    keyCalls,
    idempotencyKey: opts.idempotencyKey,
    retainedAt: '2026-10-20',
    callRpc: async (body) => {
      keyCalls.rpc++;
      if (opts.rpcMissing) {
        const e = new Error('Could not find the function public.retain_bond_atomic');
        e.status = 404;
        throw e;
      }
      // Ambiguous: server commits, client sees network failure (no compensating delete).
      if (opts.ambiguousAfterCommit && keyCalls.rpc === 1) {
        const committed = sandbox.simulateRetainBondAtomic(db, body);
        assert(committed.ok && committed.committed, committed.error || 'commit');
        const err = new Error('Failed to fetch');
        err.name = 'TypeError';
        throw err;
      }
      if (opts.ambiguousBeforeCommit && keyCalls.rpc === 1) {
        const err = new Error('Request timed out. Please wait and retry once.');
        err.name = 'AbortError';
        throw err;
      }
      const result = sandbox.simulateRetainBondAtomic(db, body);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    findEventByReference: async (ref) => {
      keyCalls.lookup++;
      return db.events.filter((e) => e.reference === ref);
    },
    fetchBond: async (id) => db.bonds.filter((x) => Number(x.id) === Number(id)),
    isAmbiguousNetworkError: sandbox.isAmbiguousRetainNetworkError,
  };
}

(async () => {
  await checkAsync('Atomic simulator: history+balance commit together; mid-txn aborts both', async () => {
    seedBond();
    const bond = sandbox.state.bonds[0];
    const db = atomicDbFromBond({ ...bond });
    const key = 'retain:55:test-atomic-1';
    const fail = sandbox.simulateRetainBondAtomic(db, {
      p_bond_id: 55,
      p_mode: 'partial',
      p_amount: 100,
      p_reason: 'abort',
      p_idempotency_key: key,
      p_retained_at: '2026-10-20',
      _failAfterHistoryBeforeBond: true,
    });
    assert(fail.ok === false && fail.committed === false, 'simulated abort');
    assert(db.events.length === 0, 'no history on abort');
    assert(Number(db.bonds[0].forfeited_amount || 0) === 0, 'no balance on abort');
    const ok = sandbox.simulateRetainBondAtomic(db, {
      p_bond_id: 55,
      p_mode: 'partial',
      p_amount: 100,
      p_reason: 'ok',
      p_idempotency_key: key,
      p_retained_at: '2026-10-20',
    });
    assert(ok.ok && ok.committed, ok.error);
    assert(db.events.length === 1 && Number(db.bonds[0].forfeited_amount) === 100, 'both committed');
  });

  await checkAsync('Durable idempotency: same key retries once; no double retain', async () => {
    seedBond();
    const db = atomicDbFromBond({ ...sandbox.state.bonds[0] });
    const key = 'retain:55:idem-stable';
    const plan = sandbox.planBondRetain(db.bonds[0], {
      mode: 'partial',
      amount: 90,
      reason: 'Once',
      staffId: 'staff-1',
      retainedAt: '2026-10-20',
    });
    const deps = rpcDepsFromDb(db, { idempotencyKey: key });
    const first = await sandbox.applyBondRetain(plan, db.bonds[0], deps);
    assert(first.replayed === false, 'first apply');
    const second = await sandbox.applyBondRetain(plan, db.bonds[0], deps);
    assert(second.replayed === true, 'second is replay');
    assert(db.events.length === 1, 'one history');
    assert(Number(db.bonds[0].forfeited_amount) === 90, 'retained once');
    assert(deps.keyCalls.rpc === 2, 'rpc called twice');
  });

  await checkAsync('Ambiguous network after server commit: recover by key, no delete, no double apply', async () => {
    seedBond();
    const db = atomicDbFromBond({ ...sandbox.state.bonds[0] });
    const key = 'retain:55:ambiguous-commit';
    const plan = sandbox.planBondRetain(db.bonds[0], {
      mode: 'partial',
      amount: 120,
      reason: 'Ambiguous',
      staffId: 'staff-1',
      retainedAt: '2026-10-20',
    });
    const deps = rpcDepsFromDb(db, { idempotencyKey: key, ambiguousAfterCommit: true });
    const recovered = await sandbox.applyBondRetain(plan, db.bonds[0], deps);
    assert(recovered.ambiguousRecovered === true, 'recovered');
    assert(recovered.replayed === true, 'treated as replay');
    assert(db.events.length === 1, 'history kept');
    assert(Number(db.bonds[0].forfeited_amount) === 120, 'balance kept');
    // Explicit retry with same key must not add again
    const deps2 = rpcDepsFromDb(db, { idempotencyKey: key });
    const retry = await sandbox.applyBondRetain(plan, db.bonds[0], deps2);
    assert(retry.replayed === true, 'retry replayed');
    assert(db.events.length === 1, 'still one history');
    assert(Number(db.bonds[0].forfeited_amount) === 120, 'still once');
  });

  await checkAsync('Ambiguous network before commit: error, retry with same key applies once', async () => {
    seedBond();
    const db = atomicDbFromBond({ ...sandbox.state.bonds[0] });
    const key = 'retain:55:ambiguous-pre';
    const plan = sandbox.planBondRetain(db.bonds[0], {
      mode: 'partial',
      amount: 70,
      reason: 'Timeout before commit',
      staffId: 'staff-1',
      retainedAt: '2026-10-20',
    });
    const deps = rpcDepsFromDb(db, { idempotencyKey: key, ambiguousBeforeCommit: true });
    let threw = null;
    try {
      await sandbox.applyBondRetain(plan, db.bonds[0], deps);
    } catch (e) {
      threw = e;
    }
    assert(!!threw && threw.code === 'RETAIN_AMBIGUOUS', threw && threw.message);
    assert(db.events.length === 0, 'nothing committed');
    assert(Number(db.bonds[0].forfeited_amount || 0) === 0, 'balance unchanged');
    const deps2 = rpcDepsFromDb(db, { idempotencyKey: key });
    const ok = await sandbox.applyBondRetain(plan, db.bonds[0], deps2);
    assert(ok.replayed === false, 'first real commit');
    assert(db.events.length === 1 && Number(db.bonds[0].forfeited_amount) === 70, 'applied once');
  });

  await checkAsync('Missing RPC migration: clear prerequisite error, no writes', async () => {
    seedBond();
    const db = atomicDbFromBond({ ...sandbox.state.bonds[0] });
    const plan = sandbox.planBondRetain(db.bonds[0], {
      mode: 'partial',
      amount: 50,
      reason: 'Need migration',
      staffId: 'staff-1',
      retainedAt: '2026-10-20',
    });
    const deps = rpcDepsFromDb(db, { idempotencyKey: 'retain:55:need-sql', rpcMissing: true });
    let threw = null;
    try {
      await sandbox.applyBondRetain(plan, db.bonds[0], deps);
    } catch (e) {
      threw = e;
    }
    assert(!!threw, 'throws');
    assert(/supabase_bond_retain_atomic\.sql|retain_bond_atomic/i.test(threw.message), threw.message);
    assert(db.events.length === 0 && Number(db.bonds[0].forfeited_amount || 0) === 0, 'no writes');
  });

  check('Migration files prepared for review (not auto-run)', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = __dirname;
    assert(fs.existsSync(path.join(dir, 'supabase_bond_retain_atomic.sql')), 'forward sql');
    assert(fs.existsSync(path.join(dir, 'supabase_bond_retain_atomic_VERIFY.sql')), 'verify sql');
    assert(fs.existsSync(path.join(dir, 'supabase_bond_retain_atomic_ROLLBACK.sql')), 'rollback sql');
    assert(fs.existsSync(path.join(dir, 'BOND_RETAIN_ATOMIC_NOTES.md')), 'notes');
    const sql = fs.readFileSync(path.join(dir, 'supabase_bond_retain_atomic.sql'), 'utf8');
    assert(/create or replace function public\.retain_bond_atomic/i.test(sql), 'function');
    assert(/for update/i.test(sql), 'row lock');
    assert(/bond_refund_events_retain_idempotency_uidx/i.test(sql), 'unique index');
    assert(/Do NOT auto-run/i.test(sql), 'no auto-run');
  });

  console.log(`\n${passed}/20 passed`);
  if (process.exitCode) process.exit(1);
  console.log('ALL PASS — retain bond');
})();
