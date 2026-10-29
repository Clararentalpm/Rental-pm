#!/usr/bin/env node
/**
 * Payment Actions “table not ready” — classification + no false migration push.
 * Fictional data only.
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
  .replace(/\blet __refreshSessionPromise=/, 'var __refreshSessionPromise=')
  .replace(/\blet bondRetainBusy=/, 'var bondRetainBusy=')
  .replace(/\blet bondRefundRetainedBusy=/, 'var bondRefundRetainedBusy=')
  .replace(/\bconst money=/, 'var money=')
  .replace(/\bconst today=/, 'var today=');

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
  confirm: () => false,
  history: { replaceState() {} },
  location: { hash: '', search: '', pathname: '/', reload() {} },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(defs, sandbox);

const {
  classifyPaymentActionsLoadError,
  isMissingRelationError,
  paymentActionsMissingMessage,
  ensurePaymentActionsReachable,
  ensurePersistedAction,
  reconcilePaymentAction,
  actionPaidAmount,
  actionRemainingAmount,
  paymentIdempotencyKey,
  findPaymentByIdempotencyKey,
  parseActionMeta,
  withActionMeta,
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

assert(typeof classifyPaymentActionsLoadError === 'function', 'classifier present');
assert(
  classifyPaymentActionsLoadError('Could not find the table public.payment_actions in the schema cache').kind ===
    'missing',
  'PGRST205-style → missing'
);
assert(classifyPaymentActionsLoadError('Request timed out. Please wait and retry once.').kind === 'network', 'timeout → network');
assert(classifyPaymentActionsLoadError('Not signed in.').kind === 'auth', 'not signed in → auth');
assert(classifyPaymentActionsLoadError('new row violates row-level security policy').kind === 'rls', 'RLS → rls');
assert(
  !/Run supabase_payment_actions_cancel\.sql first/.test(
    classifyPaymentActionsLoadError('Request timed out').message
  ),
  'timeout message does not push create-table SQL'
);
assert(/repair|cancel\.sql/i.test(paymentActionsMissingMessage()), 'missing message names SQL files');

store['rental-pm-v6-session'] = JSON.stringify({
  access_token: 'tok',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'u1' },
});

// ensurePaymentActionsReachable clears stale non-missing error after successful probe
sandbox.state.paymentActionsError = classifyPaymentActionsLoadError('Request timed out').message;
sandbox.state.paymentActions = [];
let paymentActionsGets = 0;
sandbox.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/rest/v1/payment_actions')) {
    paymentActionsGets++;
    return { ok: true, text: async () => '[{"id":1}]', json: async () => [{ id: 1 }] };
  }
  return { ok: true, text: async () => '[]', json: async () => [] };
};

(async () => {
  const ok = await ensurePaymentActionsReachable();
  assert(ok === true && !sandbox.state.paymentActionsError, 're-probe clears stale network error');
  assert(paymentActionsGets >= 1, 're-probe called payment_actions GET');

  // True missing still blocks (no fetch — classifier short-circuits)
  sandbox.state.paymentActionsError = classifyPaymentActionsLoadError(
    "Could not find the table 'public.payment_actions' in the schema cache"
  ).message;
  let blocked = false;
  try {
    await ensurePaymentActionsReachable();
  } catch (e) {
    blocked = /not ready|cancel\.sql|repair\.sql/i.test(String(e.message));
  }
  assert(blocked, 'true missing still blocks with migration hint');

  // Partial / multi-period payments + idempotency (pure helpers — no live DB)
  sandbox.state.propertyId = 1;
  sandbox.state.properties = [{ id: 1, name: 'Test' }];
  sandbox.state.rooms = [{ id: 1, property_id: 1, room_no: 1 }];
  sandbox.state.tenants = [{ id: 1, name: 'Fictional Tenant' }];
  sandbox.state.tenancies = [
    {
      id: 10,
      tenant_id: 1,
      room_id: 1,
      check_in: '2026-10-01',
      check_out: '2026-11-01',
      rent_amount: 400,
      rent_period: 'four_weeks',
      payment_cycle_weeks: 4,
      status: 'active',
      tenancy_type: 'long_term',
    },
  ];
  sandbox.state.bonds = [];
  sandbox.state.profiles = [{ id: 'u1', role: 'owner' }];
  sandbox.state.me = { id: 'u1', role: 'owner' };
  sandbox.state.paymentActionsError = '';

  let notes = withActionMeta('', { originalAmount: 400, paymentIds: [101] });
  const action = {
    id: 50,
    tenancy_id: 10,
    amount: 250,
    status: 'partially_paid',
    notes,
    action_type: 'rent_due',
    due_date: '2026-10-01',
    related_payment_id: 101,
  };
  const p1 = {
    id: 101,
    tenancy_id: 10,
    amount: 150,
    status: 'paid',
    received_date: '2026-10-02',
    period_start: '2026-10-01',
    period_end: '2026-10-14',
    notes: 'IDEMPOTENCY_KEY:' + paymentIdempotencyKey(50, 150, '2026-10-02', '2026-10-01', '2026-10-14'),
  };
  const p2 = {
    id: 102,
    tenancy_id: 10,
    amount: 100,
    status: 'paid',
    received_date: '2026-10-10',
    period_start: '2026-10-08',
    period_end: '2026-10-14',
    notes: 'IDEMPOTENCY_KEY:' + paymentIdempotencyKey(50, 100, '2026-10-10', '2026-10-08', '2026-10-14'),
  };
  sandbox.state.payments = [p1, p2];
  sandbox.state.paymentActions = [action];
  // Link both payments in meta for paid total
  action.notes = withActionMeta('', { originalAmount: 400, paymentIds: [101, 102] });
  assert(actionPaidAmount(action) === 250, 'paid toward action = 150+100');
  assert(actionRemainingAmount(action) === 150, 'outstanding reflects payments (400-250)');

  const dupKey = paymentIdempotencyKey(50, 150, '2026-10-02', '2026-10-01', '2026-10-14');
  assert(findPaymentByIdempotencyKey(dupKey)?.id === 101, 'idempotency finds existing payment — no duplicate');
  const otherPeriodKey = paymentIdempotencyKey(50, 150, '2026-10-02', '2026-10-15', '2026-10-28');
  assert(!findPaymentByIdempotencyKey(otherPeriodKey), 'different period → different key');

  assert(/classifyPaymentActionsLoadError/.test(html), 'classifier in app');
  assert(/ensurePaymentActionsReachable/.test(html), 're-probe helper in app');
  assert(/__refreshSessionPromise/.test(html), 'single-flight session refresh');
  assert(fs.existsSync(path.join(__dirname, 'supabase_payment_actions_repair.sql')), 'repair SQL present');
  assert(fs.existsSync(path.join(__dirname, 'supabase_payment_actions_repair_VERIFY.sql')), 'repair VERIFY present');
  const repairSql = fs.readFileSync(path.join(__dirname, 'supabase_payment_actions_repair.sql'), 'utf8');
  assert(!/^\s*\\i\b/m.test(repairSql), 'repair SQL has no psql \\i');
  assert(/drop policy if exists payment_actions_write_staff/i.test(repairSql), 'repair rewrites write policy');
  assert(/exists \(select 1 from public\.profiles p where p\.id = auth\.uid\(\)\)/i.test(repairSql), 'repair uses profiles membership');
  assert(!/delete from public\.(rent_payments|payment_actions|bonds|tenancies)/i.test(repairSql), 'repair does not delete business rows');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
