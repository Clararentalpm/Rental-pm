#!/usr/bin/env node
/**
 * Builds a SAFE manual preview of the PR #28 UI.
 *
 * - Does NOT connect to production Supabase (no Auth / REST / Edge calls).
 * - Boots from in-browser TEST DATA only.
 * - Blocks every network write (and every network call).
 * - Keeps Carindale ensuite display/save helpers from the source index.html.
 *
 * Output: safe-preview/index.html
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const outDir = path.join(root, 'safe-preview');
fs.mkdirSync(outDir, { recursive: true });

const bannerCss = `
.safe-preview-banner{position:sticky;top:0;z-index:9999;background:#7a2e0b;color:#fff7ed;padding:12px 16px;font-size:13px;line-height:1.45;border-bottom:3px solid #c2410c;box-shadow:0 8px 24px #00000033}
.safe-preview-banner b{color:#fff}
.safe-preview-banner code{background:#00000033;padding:1px 6px;border-radius:6px}
.safe-preview-banner .safe-grid{display:grid;gap:6px;max-width:1100px;margin:0 auto}
@media (max-width:720px){.app{grid-template-columns:1fr}.sidebar{position:relative;height:auto}.topbar{padding:14px 16px}.content{padding:14px 16px 40px}.room-grid,.metrics,.alert-grid,.price-grid{grid-template-columns:1fr 1fr}.calendar90{grid-template-columns:repeat(7,minmax(72px,1fr))}.finder{grid-template-columns:1fr}}
`;

const bannerHtml = `
<div class="safe-preview-banner" role="status">
  <div class="safe-grid">
    <div><b>SAFE MANUAL PREVIEW (PR #28 Carindale ensuite)</b> — for iPad visual checks only.</div>
    <div><b>Data source:</b> in-browser <b>TEST DATA</b> only. <b>Does NOT connect to production Supabase.</b> No production Auth, REST, SQL, or Edge Function calls.</div>
    <div><b>Save:</b> Save / Edit / Book / Delete update <b>test data in this browser only</b>. They cannot change production. Soft-reconcile writes are disabled.</div>
    <div><b>Not covered here:</b> your live production bookings / real McGregor multi-room rows. Those need a separate production read — this preview intentionally avoids that.</div>
  </div>
</div>
`;

const shim = `
/* ===== SAFE MANUAL PREVIEW SHIM (generated — do not use in production deploy) ===== */
const SAFE_MANUAL_PREVIEW = true;
const SAFE_PREVIEW_NO_NETWORK = true;
document.title = 'SAFE PREVIEW — Rental PM (PR #28)';

function safePreviewBlocked(action){
  const msg = 'Blocked in SAFE PREVIEW: '+action+'. This preview does not connect to production Supabase.';
  console.warn(msg);
  try{toast(msg)}catch(_){}
  return Promise.reject(new Error(msg));
}

function safePreviewFixture(){
  const todayISO = (typeof today==='function'?today():'2026-09-26');
  const in7 = (typeof addDays==='function'?addDays(todayISO,7):'2026-10-03');
  const in14 = (typeof addDays==='function'?addDays(todayISO,14):'2026-10-10');
  const in21 = (typeof addDays==='function'?addDays(todayISO,21):'2026-10-17');
  const gid = 'preview-mcg-multi-001';
  return {
    propertyId: 2,
    page: 'rooms',
    availabilityMode: 'vacancy',
    properties: [
      { id: 1, name: 'McGregor', timezone: 'Australia/Brisbane' },
      { id: 2, name: 'Carindale', timezone: 'Australia/Brisbane' }
    ],
    // Intentionally WRONG stored Carindale flags — UI must still show canonical R3 ensuite / R4 not.
    rooms: [
      { id: 101, property_id: 1, room_no: 1, ensuite: false, notes: '' },
      { id: 102, property_id: 1, room_no: 2, ensuite: false, notes: '' },
      { id: 103, property_id: 1, room_no: 3, ensuite: false, notes: '' },
      { id: 104, property_id: 1, room_no: 4, ensuite: true, notes: '' },
      { id: 105, property_id: 1, room_no: 5, ensuite: false, notes: '' },
      { id: 106, property_id: 1, room_no: 6, ensuite: false, notes: 'Sofa / Extra Room' },
      { id: 201, property_id: 2, room_no: 1, ensuite: false, notes: '' },
      { id: 202, property_id: 2, room_no: 2, ensuite: false, notes: '' },
      { id: 203, property_id: 2, room_no: 3, ensuite: false, notes: '' }, // wrong stored — should display Ensuite
      { id: 204, property_id: 2, room_no: 4, ensuite: true, notes: '' },  // wrong stored — should NOT display Ensuite
      { id: 205, property_id: 2, room_no: 5, ensuite: false, notes: '' }
    ],
    roomProfiles: [
      { room_id: 101, room_type: 'Standard', bathroom_type: 'Shared', beds: 1, capacity: 1, current_asking_price: 200, standard_price: 200 },
      { room_id: 102, room_type: 'Standard', bathroom_type: 'Shared', beds: 1, capacity: 1, current_asking_price: 200, standard_price: 200 },
      { room_id: 103, room_type: 'Standard', bathroom_type: 'Shared', beds: 1, capacity: 1, current_asking_price: 210, standard_price: 210 },
      { room_id: 104, room_type: 'Standard', bathroom_type: 'Ensuite', beds: 1, capacity: 1, current_asking_price: 230, standard_price: 230 },
      { room_id: 105, room_type: 'Standard', bathroom_type: 'Shared', beds: 1, capacity: 1, current_asking_price: 200, standard_price: 200 },
      { room_id: 106, room_type: 'Sofa / Extra room', bathroom_type: 'Shared', beds: 1, capacity: 1, current_asking_price: 25, standard_price: 25, extra_room_fee: 25 },
      { room_id: 201, room_type: 'Standard', bathroom_type: 'Shared', beds: 1, capacity: 1, current_asking_price: 220, standard_price: 220 },
      { room_id: 202, room_type: 'Standard', bathroom_type: 'Shared', beds: 1, capacity: 1, current_asking_price: 220, standard_price: 220 },
      { room_id: 203, room_type: 'Standard', bathroom_type: 'Shared', beds: 1, capacity: 1, current_asking_price: 250, standard_price: 250 }, // wrong — display Ensuite
      { room_id: 204, room_type: 'Standard', bathroom_type: 'Ensuite', beds: 1, capacity: 1, current_asking_price: 240, standard_price: 240 }, // wrong — display Shared
      { room_id: 205, room_type: 'Standard', bathroom_type: 'Shared', beds: 1, capacity: 1, current_asking_price: 220, standard_price: 220 }
    ],
    tenants: [
      { id: 1, full_name: 'Preview Guest Carindale', email: 'preview.carindale@example.test', phone: '' },
      { id: 2, full_name: 'Preview Guest McGregor Multi', email: 'preview.mcgregor@example.test', phone: '' },
      { id: 3, full_name: 'Preview Guest Carindale R5', email: 'preview.r5@example.test', phone: '' }
    ],
    tenancies: [
      {
        id: 501, tenant_id: 1, room_id: 203, property_id: 2,
        check_in: todayISO, check_out: in14, status: 'active', tenancy_type: 'short_stay',
        weekly_rent: 250, notes: 'TEST DATA — Carindale Room 3 current booking'
      },
      {
        id: 502, tenant_id: 3, room_id: 205, property_id: 2,
        check_in: in7, check_out: in21, status: 'upcoming', tenancy_type: 'short_stay',
        weekly_rent: 220, notes: 'TEST DATA — Carindale Room 5 upcoming'
      },
      {
        id: 601, tenant_id: 2, room_id: 102, property_id: 1,
        check_in: todayISO, check_out: in7, status: 'active', tenancy_type: 'short_stay',
        weekly_rent: 200, notes: 'BOOKING_GROUP:'+gid+'\\nSEGMENT_INDEX:1\\nSEGMENT_COUNT:2\\nTEST DATA — McGregor multi-room seg 1 (Room 2)'
      },
      {
        id: 602, tenant_id: 2, room_id: 105, property_id: 1,
        check_in: in7, check_out: in14, status: 'upcoming', tenancy_type: 'short_stay',
        weekly_rent: 200, notes: 'BOOKING_GROUP:'+gid+'\\nSEGMENT_INDEX:2\\nSEGMENT_COUNT:2\\nTEST DATA — McGregor multi-room seg 2 (Room 5)'
      }
    ],
    bonds: [],
    payments: [],
    profiles: [{ id: 'safe-preview-user', display_name: 'Safe Preview Tester', role: 'owner' }],
    me: { id: 'safe-preview-user', display_name: 'Safe Preview Tester', role: 'owner' },
    priceHistory: [],
    activity: [],
    bondEvents: [],
    bondRefundEvents: [],
    viewings: [
      {
        id: 1, property_id: 2, room_id: 204, visitor_name: 'Preview Inspector',
        inspection_date: in7, inspection_time: '11:00', status: 'scheduled',
        notes: 'TEST DATA — inspection on Carindale Room 4 (should NOT show Ensuite in picker label)'
      }
    ],
    viewingsError: '',
    paymentActions: [],
    paymentActionHistory: [],
    bookingEvents: [],
    paymentActionsError: ''
  };
}

function applySafePreviewNetworkGuards(){
  const origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    const url = String(input&&input.url?input.url:input);
    const method = String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
    if(/supabase\\.co|functions\\/v1/i.test(url)){
      return safePreviewBlocked(method+' '+url);
    }
    return origFetch(input, init);
  };
  // Override low-level API helpers after they are defined — start() is replaced below.
}

function bootSafePreview(){
  clearTimeout(window.__bootTimer);
  Object.assign(state, safePreviewFixture());
  // Fake session so UI helpers that read getSession() do not crash; never sent to network.
  saveSession({
    access_token: 'safe-preview-local-only',
    refresh_token: '',
    expires_at: Math.floor(Date.now()/1000)+86400,
    user: { id: 'safe-preview-user', email: 'safe-preview@example.test' }
  });
  $('#me').textContent = 'Safe Preview Tester · test data · full access (local)';
  $('#sync').textContent = 'TEST DATA (no Supabase)';
  $('#new-stay').classList.toggle('hidden', !canEdit());
  showApp();
  renderChrome();
  render();
  toast('Safe preview ready — test data only, no production Supabase');
}

/* ===== end SAFE MANUAL PREVIEW SHIM head ===== */
`;

const startOverride = `
/* ===== SAFE MANUAL PREVIEW: replace network + start ===== */
(function applySafePreviewOverrides(){
  if(!SAFE_MANUAL_PREVIEW)return;

  raw = async function(path, opts={}, auth=true){
    return safePreviewBlocked('Supabase raw '+(opts.method||'GET')+' '+path);
  };
  signIn = async function(){ return safePreviewBlocked('signIn'); };
  refreshSession = async function(){ return safePreviewBlocked('refreshSession'); };
  api = async function(table, query='', opts={}){
    const method = String(opts.method||'GET').toUpperCase();
    if(method==='GET'){
      // No production reads — callers should use in-memory state in preview.
      return [];
    }
    return safePreviewBlocked(method+' '+table+(query?('?'+query):''));
  };
  select = (t,q='')=>api(t,q,{method:'GET',headers:{Accept:'application/json'}});
  insert = async function(t,row){
    // Local-only mutation for Save/Edit UX checks — never hits network.
    const tableMap = {
      room_profiles: 'roomProfiles',
      rooms: 'rooms',
      tenants: 'tenants',
      tenancies: 'tenancies',
      bonds: 'bonds',
      rent_payments: 'payments',
      room_viewings: 'viewings',
      payment_actions: 'paymentActions'
    };
    const key = tableMap[t];
    if(!key){
      toast('Local test insert skipped for '+t);
      return [{...row,id:Date.now()}];
    }
    const id = row.id || (Math.max(0,...(state[key]||[]).map(x=>Number(x.id)||0))+1);
    const saved = {...row,id};
    state[key] = [...(state[key]||[]), saved];
    toast('Saved to TEST DATA only ('+t+')');
    return [saved];
  };
  patch = async function(t, filter, row){
    const tableMap = {
      room_profiles: 'roomProfiles',
      rooms: 'rooms',
      tenants: 'tenants',
      tenancies: 'tenancies',
      bonds: 'bonds',
      rent_payments: 'payments',
      room_viewings: 'viewings',
      payment_actions: 'paymentActions',
      profiles: 'profiles'
    };
    const key = tableMap[t];
    if(!key){
      toast('Local test patch skipped for '+t);
      return [row];
    }
    const m = String(filter||'').match(/(?:^|&)(?:id|room_id)=eq\\.(\\d+|[^&]+)/);
    const idRaw = m?m[1]:null;
    const idField = /room_id=eq/.test(String(filter))?'room_id':'id';
    state[key] = (state[key]||[]).map(item=>{
      if(idRaw!=null && String(item[idField])===String(idRaw)) return {...item,...row};
      return item;
    });
    // Also allow id=eq on rooms when patching ensuite
    if(t==='rooms' && idRaw!=null){
      state.rooms = state.rooms.map(item=>String(item.id)===String(idRaw)?{...item,...row}:item);
    }
    toast('Updated TEST DATA only ('+t+')');
    return [{...row}];
  };

  reconcileCarindaleEnsuiteFlags = async function(){
    // Apply canonical bathroom/ensuite fixes in MEMORY only — no production PATCH.
    const corrected=[];
    const props=(state.properties||[]).filter(p=>isCarindaleProperty(p));
    for(const p of props){
      const rooms=(state.rooms||[]).filter(r=>Number(r.property_id)===Number(p.id));
      for(const r of rooms){
        const want=canonicalCarindaleEnsuite(r.room_no);
        if(want===null)continue;
        let touched=false;
        if(!!r.ensuite!==want){ r.ensuite=want; touched=true; }
        const rp=(state.roomProfiles||[]).find(x=>Number(x.room_id)===Number(r.id));
        if(rp){
          const next=carindaleBathroomTypeToPersist(r,rp.bathroom_type);
          const cur=rp.bathroom_type==null||rp.bathroom_type===''?null:String(rp.bathroom_type);
          const normNext=next==null||next===''?null:String(next);
          if(normNext!==cur&&!(normNext==null&&(cur==null||cur===''))){
            rp.bathroom_type=normNext;
            touched=true;
          }
        }
        if(touched)corrected.push(Number(r.id));
      }
    }
    if(corrected.length)toast('Preview reconcile (memory only): rooms '+corrected.join(', '));
    return corrected;
  };

  softReconcileOpenActions = async function(){ return; };

  loadAll = async function(){
    $('#sync').textContent='TEST DATA (no Supabase)';
    // Keep fixture / local mutations; do not fetch.
    if(!state.me)state.me={id:'safe-preview-user',display_name:'Safe Preview Tester',role:'owner'};
    $('#me').textContent=\`\${state.me.display_name||'Staff'} · test data · full access (local)\`;
    $('#new-stay').classList.toggle('hidden',!canEdit());
    if(canEdit()){try{await reconcileCarindaleEnsuiteFlags()}catch(_){}}
    renderChrome();render();
  };

  start = async function(){
    applySafePreviewNetworkGuards();
    bootSafePreview();
    if(canEdit()){try{await reconcileCarindaleEnsuiteFlags();render()}catch(_){}}
  };
})();
start();
/* ===== end SAFE MANUAL PREVIEW overrides ===== */
`;

let html = src;

// Title + CSS
html = html.replace('<title>Rental PM</title>', '<title>SAFE PREVIEW — Rental PM (PR #28)</title>');
html = html.replace('</style>', `${bannerCss}\n</style>`);

// Banner after body open
html = html.replace(/<body[^>]*>/, (m) => `${m}\n${bannerHtml}`);

// Inject shim right after <script>
html = html.replace('<script>\nconst SB_URL=', `<script>\n${shim}\nconst SB_URL=`);

// Replace trailing start(); with override + start
if (!html.includes('\nstart();\n</script>')) {
  console.error('Could not find start() call to override');
  process.exit(1);
}
html = html.replace('\nstart();\n</script>', `\n${startOverride}\n</script>`);

// Neutralize hardcoded production endpoints in preview copy (defense in depth)
html = html.replace(
  "const SB_URL='https://odezjuvqmnkzmcnezoyq.supabase.co';",
  "const SB_URL='https://safe-preview.invalid'; // production host neutralized"
);
html = html.replace(
  /const SB_KEY='[^']+';/,
  "const SB_KEY='safe-preview-no-key';"
);

const outFile = path.join(outDir, 'index.html');
fs.writeFileSync(outFile, html);
fs.writeFileSync(
  path.join(outDir, 'README.md'),
  `# Safe manual preview (PR #28)

Open \`index.html\` via the HTTPS preview URL (not production Netlify / GitHub Pages).

- **Connects to production Supabase?** NO
- **Data:** in-browser TEST DATA only
- **Save:** updates test data in this browser only

## Checklist

1. Carindale → Room Profiles → Room 3: Ensuite badge + Bathroom = Ensuite
2. Carindale Room 4: no Ensuite badge; Bathroom ≠ Ensuite
3. Edit profile → confirm fields → close → Refresh page → still correct
4. Availability / Calendar / Room Status / Book inspection / Find Room labels (test bookings)
5. McGregor tab: labels + multi-room test booking segments unchanged by Carindale rules
`
);

console.log('Wrote', outFile, `(${html.length} bytes)`);
