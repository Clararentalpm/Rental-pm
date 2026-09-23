#!/usr/bin/env node
/**
 * READ-ONLY production audit for PR #26.
 *
 * Uses crossPropertyIntegrityReport() + classifyStayRecord() from index.html.
 * Performs ONLY HTTP GET against Supabase REST. Never PATCH/POST/DELETE.
 *
 * Usage:
 *   RENTAL_PM_EMAIL='…' RENTAL_PM_PASSWORD='…' node production-readonly-audit.js
 * or:
 *   RENTAL_PM_ACCESS_TOKEN='…' node production-readonly-audit.js
 *
 * Outputs JSON + a concise cleanup table. Does not modify any record.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

const SB_URL = 'https://odezjuvqmnkzmcnezoyq.supabase.co';
const SB_KEY = 'sb_publishable_iQCs8hCyYIysIUykBFBBDQ_O34chdHQ';
const NAMES = ['NuYoah', 'Jiawen', 'Laura', 'Aura', 'Vicky', '辣豆'];

function httpJson(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(SB_URL + urlPath);
    const payload = body == null ? null : JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${token || SB_KEY}`,
          Accept: 'application/json',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = { raw };
          }
          if (res.statusCode >= 400) {
            const err = new Error(
              `HTTP ${res.statusCode} ${urlPath}: ${parsed?.msg || parsed?.message || raw.slice(0, 200)}`
            );
            err.status = res.statusCode;
            err.body = parsed;
            reject(err);
            return;
          }
          resolve(parsed);
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getAccessToken() {
  if (process.env.RENTAL_PM_ACCESS_TOKEN) return process.env.RENTAL_PM_ACCESS_TOKEN;
  const email = process.env.RENTAL_PM_EMAIL;
  const password = process.env.RENTAL_PM_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing credentials. Set RENTAL_PM_ACCESS_TOKEN or RENTAL_PM_EMAIL + RENTAL_PM_PASSWORD (read-only sign-in).'
    );
  }
  const data = await httpJson(
    'POST',
    '/auth/v1/token?grant_type=password',
    { email, password },
    SB_KEY
  );
  if (!data?.access_token) throw new Error('Sign-in did not return access_token');
  return data.access_token;
}

async function selectAll(token, table, query = 'select=*') {
  // Prefer Prefer: count — but keep simple GET. Paginate if needed.
  const rows = await httpJson('GET', `/rest/v1/${table}?${query}`, null, token);
  return Array.isArray(rows) ? rows : [];
}

function loadHelpers() {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const cut = script.search(/\$\('#nav'\)\.onclick|\$\("#nav"\)\.onclick/);
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
    URLSearchParams,
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
  };
  vm.createContext(sandbox);
  vm.runInContext(defs, sandbox);
  return sandbox;
}

function recommend(cls, blockers, t, kind) {
  if (cls.kind === 'canonical_valid' || cls.kind === 'split_allocation' || cls.kind === 'inspection_origin') {
    return 'KEEP';
  }
  if (cls.kind === 'duplicate_erroneous') {
    return blockers.length === 0 ? 'DELETE STAY safely' : 'ADMIN VOID';
  }
  if (cls.kind === 'cancelled' || cls.kind === 'admin_void') return 'KEEP'; // already closed
  if (cls.kind === 'historical') return 'KEEP';
  if (kind === 'cross-property mismatch') return 'DO NOT TOUCH / investigate further';
  return 'DO NOT TOUCH / investigate further';
}

function rowReport(sandbox, t, tenant) {
  const room = sandbox.roomBy(t.room_id);
  const propId = sandbox.stayPropertyId(t);
  const cls = sandbox.classifyStayRecord(t);
  const blockers = sandbox.tenancyDeleteBlockers(t.id);
  const payments = (sandbox.state.payments || []).filter((p) => Number(p.tenancy_id) === Number(t.id));
  const bonds = (sandbox.state.bonds || []).filter((b) => Number(b.tenancy_id) === Number(t.id));
  const hasRefund = bonds.some(
    (b) => Number(b.refund_amount || 0) > 0 || Number(b.forfeited_amount || 0) > 0 || Number(b.deduction_amount || 0) > 0
  );
  const insp = parseNoteMarkerSafe(sandbox, t.notes, 'VIEWING_ID') || parseNoteMarkerSafe(sandbox, t.notes, 'SOURCE');
  const opKind = sandbox.isCancelledOrNoShow(t)
    ? sandbox.normalizeBookingStatus(t)
    : sandbox.bookingOperationalKind(t);
  let kindLabel = cls.kind;
  if (t.property_id != null && room && Number(t.property_id) !== Number(room.property_id)) {
    kindLabel = 'cross-property mismatch';
  }
  return {
    tenantName: tenant?.name || null,
    tenantId: t.tenant_id,
    tenancyId: t.id,
    bookingGroupId: sandbox.bookingGroupId(t),
    propertyId: propId,
    roomId: t.room_id,
    roomLabel: room ? sandbox.roomShortName(room) : null,
    start: t.check_in,
    startTime: t.check_in_time || null,
    end: sandbox.effectiveOccupancyEnd(t),
    endTime: t.check_out_time || null,
    storedStatus: t.status,
    derivedOperational: opKind,
    classification: kindLabel,
    classifyStayRecord: cls,
    hasRentPayments: payments.length > 0,
    hasBond: bonds.length > 0,
    hasRefundDeductionForfeit: hasRefund,
    inspectionLinkage: insp || null,
    financialBlockers: blockers,
    recommendedAction: recommend(cls, blockers, t, kindLabel),
    blocksFutureCalendar: !!sandbox.stayBlocksDate(t, sandbox.addDays(sandbox.today(), 7)),
  };
}

function parseNoteMarkerSafe(sandbox, notes, key) {
  try {
    return sandbox.parseNoteMarker(notes, key);
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== READ-ONLY production audit (no writes) ===');
  const token = await getAccessToken();
  // Prove we only GET — refuse if env asks for mutate
  if (process.env.RENTAL_PM_ALLOW_WRITE === '1') {
    throw new Error('Refusing to run with RENTAL_PM_ALLOW_WRITE=1 — this script is GET-only.');
  }

  const [properties, rooms, tenants, tenancies, payments, bonds, viewings] = await Promise.all([
    selectAll(token, 'properties'),
    selectAll(token, 'rooms'),
    selectAll(token, 'tenants'),
    selectAll(token, 'tenancies'),
    selectAll(token, 'rent_payments'),
    selectAll(token, 'bonds'),
    selectAll(token, 'room_viewings').catch(() => []),
  ]);

  if (!tenancies.length && !tenants.length) {
    throw new Error('Authenticated but received empty tenants/tenancies — check RLS / role.');
  }

  const sandbox = loadHelpers();
  sandbox.state.properties = properties;
  sandbox.state.rooms = rooms;
  sandbox.state.tenants = tenants;
  sandbox.state.tenancies = tenancies;
  sandbox.state.payments = payments;
  sandbox.state.bonds = bonds;
  sandbox.state.viewings = viewings;
  sandbox.state.paymentActions = [];
  sandbox.state.bookingEvents = [];
  sandbox.state.roomProfiles = [];
  // Brisbane "today" for operational classification
  sandbox.today = () => sandbox.localDateISO(new Date(), 'Australia/Brisbane');
  // Capture original localTimeHM then pin Brisbane wall clock for classification.
  const _localTimeHM = sandbox.localTimeHM;
  sandbox.localTimeHM = (date = new Date(), timeZone = 'Australia/Brisbane') => _localTimeHM(date, timeZone);

  const integrity = sandbox.crossPropertyIntegrityReport();
  const nameSet = new Set(NAMES.map((n) => n.toLowerCase()));
  const focusTenants = tenants.filter((t) => nameSet.has(String(t.name || '').trim().toLowerCase()));
  const focusIds = new Set(focusTenants.map((t) => Number(t.id)));
  const focusStays = tenancies.filter((t) => focusIds.has(Number(t.tenant_id)));

  // Also catch repeated occupants by same tenant+room with overlapping live rows
  const repeated = [];
  const byRoom = new Map();
  tenancies.forEach((t) => {
    if (!t.room_id || sandbox.isOperationallyClosed(t)) return;
    if (sandbox.tenancyKind(t) === 'historical') return;
    const k = `${t.room_id}|${t.tenant_id}`;
    if (!byRoom.has(k)) byRoom.set(k, []);
    byRoom.get(k).push(t);
  });
  byRoom.forEach((list) => {
    if (list.length > 1) repeated.push(...list);
  });

  const reports = [];
  const seen = new Set();
  [...focusStays, ...repeated].forEach((t) => {
    if (seen.has(Number(t.id))) return;
    seen.add(Number(t.id));
    const tenant = tenants.find((x) => Number(x.id) === Number(t.tenant_id));
    reports.push(rowReport(sandbox, t, tenant));
  });

  // Verifications A–E
  const carindale = properties.find((p) => /carindale/i.test(p.name));
  const mcgregor = properties.find((p) => /mc\s*gregor/i.test(p.name));
  const verifications = {};

  // A NuYoah canonical 23 Sep
  const nuyoah = tenants.filter((t) => /nuyoah/i.test(t.name || ''));
  const nuyoahStays = tenancies.filter((t) => nuyoah.some((n) => Number(n.id) === Number(t.tenant_id)));
  const nuyoahLive = nuyoahStays
    .filter((t) => !sandbox.isOperationallyClosed(t) && sandbox.tenancyKind(t) !== 'historical')
    .sort((a, b) => Number(a.id) - Number(b.id));
  const nuyoah23 = nuyoahLive.find((t) => t.check_in === '2026-09-23');
  verifications.A_nuyoah_23_sep_canonical = {
    tenants: nuyoah.map((t) => t.id),
    liveStayIds: nuyoahLive.map((t) => t.id),
    stayStarting23Sep: nuyoah23
      ? {
          id: nuyoah23.id,
          roomId: nuyoah23.room_id,
          end: sandbox.effectiveOccupancyEnd(nuyoah23),
          kind: sandbox.bookingOperationalKind(nuyoah23),
          blocks23: sandbox.stayBlocksDate(nuyoah23, '2026-09-23'),
        }
      : null,
    pass: !!(nuyoah23 && sandbox.stayBlocksDate(nuyoah23, '2026-09-23')),
  };

  // B historical Room 5 not future calendar
  const room5s = rooms.filter((r) => Number(r.room_no) === 5);
  const future = sandbox.addDays(sandbox.today(), 14);
  const histOnFuture = tenancies.filter((t) => {
    if (!room5s.some((r) => Number(r.id) === Number(t.room_id))) return false;
    if (sandbox.tenancyKind(t) !== 'historical' && !sandbox.isOperationallyClosed(t)) return false;
    return sandbox.stayBlocksDate(t, future);
  });
  verifications.B_historical_room5_no_future_block = {
    futureDate: future,
    offenders: histOnFuture.map((t) => t.id),
    pass: histOnFuture.length === 0,
  };

  // C Room Status current-only (simulate each room)
  const roomStatus = {};
  rooms.forEach((r) => {
    sandbox.state.propertyId = r.property_id;
    roomStatus[r.id] = {
      propertyId: r.property_id,
      room: sandbox.roomShortName(r),
      current: sandbox.currentOccupantsForRoom(r.id).map((t) => ({
        tenancyId: t.id,
        tenantId: t.tenant_id,
        name: sandbox.tenantBy(t.tenant_id)?.name,
      })),
      next: (() => {
        const n = sandbox.nextBookingForRoom(r.id);
        return n
          ? { tenancyId: n.id, tenantId: n.tenant_id, name: sandbox.tenantBy(n.tenant_id)?.name, check_in: n.check_in }
          : null;
      })(),
    };
  });
  verifications.C_room_status_current_only = roomStatus;

  // D Current excludes expired/cancelled
  const badCurrent = tenancies.filter((t) => {
    const k = sandbox.tenancyKind(t);
    if (k !== 'current') return false;
    if (sandbox.isCancelledOrNoShow(t)) return true;
    const end = sandbox.effectiveOccupancyEnd(t);
    return !!(end && end <= sandbox.today());
  });
  verifications.D_current_excludes_expired_cancelled = {
    offenders: badCurrent.map((t) => t.id),
    pass: badCurrent.length === 0,
  };

  // E Carindale scope has no McGregor rows
  if (carindale && mcgregor) {
    sandbox.state.propertyId = carindale.id;
    const leakT = sandbox.scopedTenancies().filter((t) => sandbox.stayPropertyId(t) === Number(mcgregor.id));
    const leakP = sandbox.scopedPayments().filter((p) => {
      const t = tenancies.find((x) => Number(x.id) === Number(p.tenancy_id));
      return t && sandbox.stayPropertyId(t) === Number(mcgregor.id);
    });
    const leakB = sandbox.scopedBonds().filter((b) => {
      const t = tenancies.find((x) => Number(x.id) === Number(b.tenancy_id));
      return t && sandbox.stayPropertyId(t) === Number(mcgregor.id);
    });
    verifications.E_carindale_no_mcgregor = {
      carindaleId: carindale.id,
      mcgregorId: mcgregor.id,
      leakedTenancyIds: leakT.map((t) => t.id),
      leakedPaymentIds: leakP.map((p) => p.id),
      leakedBondIds: leakB.map((b) => b.id),
      pass: leakT.length + leakP.length + leakB.length === 0,
    };
  } else {
    verifications.E_carindale_no_mcgregor = { pass: false, error: 'property names not found' };
  }

  const out = {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    mutations: 0,
    counts: {
      properties: properties.length,
      rooms: rooms.length,
      tenants: tenants.length,
      tenancies: tenancies.length,
      payments: payments.length,
      bonds: bonds.length,
    },
    integrityIssues: integrity,
    focusReports: reports,
    verifications,
  };

  const outPath = path.join(__dirname, 'production-readonly-audit-report.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Wrote', outPath);
  console.log('\n=== Cleanup table ===');
  console.log(
    [
      'Tenant',
      'TenantID',
      'StayID',
      'Prop',
      'Room',
      'Start',
      'End',
      'Stored',
      'Derived',
      'Class',
      'Pay',
      'Bond',
      'Action',
    ].join('\t')
  );
  reports.forEach((r) => {
    console.log(
      [
        r.tenantName,
        r.tenantId,
        r.tenancyId,
        r.propertyId,
        r.roomLabel || r.roomId,
        `${r.start || ''}${r.startTime ? ' ' + String(r.startTime).slice(0, 5) : ''}`,
        `${r.end || ''}${r.endTime ? ' ' + String(r.endTime).slice(0, 5) : ''}`,
        r.storedStatus,
        r.derivedOperational,
        r.classification,
        r.hasRentPayments ? 'Y' : 'N',
        r.hasBond ? 'Y' : 'N',
        r.recommendedAction,
      ].join('\t')
    );
  });
  console.log('\n=== Verifications A–E ===');
  console.log(JSON.stringify(verifications, null, 2));
  console.log('\nConfirmed: zero production mutations performed.');
}

main().catch((e) => {
  console.error('AUDIT FAILED:', e.message);
  process.exit(1);
});
