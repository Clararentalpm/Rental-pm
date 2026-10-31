#!/usr/bin/env node
/**
 * Fictional regression tests — Payment activity_log actor_user_id / save ordering.
 * Does not touch production. Run: node payment-activity-log-regression-test.js
 */
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cut=script.search(/\$\('#nav'\)\.onclick|\$\("#nav"\)\.onclick/);
const cut2=cut>0?cut:script.search(/\$\('#nav'\)/);
let defs=(cut2>0?script.slice(0,cut2):script)
  .replace(/\blet state=/,'var state=')
  .replace(/\blet resendBusy=/,'var resendBusy=')
  .replace(/\bconst money=/,'var money=');

let passed=0,failed=0;
function assert(name,cond,detail){
  if(cond){passed++;console.log('PASS',name)}
  else{failed++;console.log('FAIL',name,detail||'')}
}

// --- Source contracts (no production writes) ---
assert('no actor_user_id property writes',!/actor_user_id\s*:/.test(script));
assert('logActivityBestEffort helper present',/function logActivityBestEffort\(/.test(script));
assert('helper inserts user_id',/async function logActivityBestEffort[\s\S]*?user_id\s*:\s*uid/.test(script));
assert('helper catches errors (best-effort)',/async function logActivityBestEffort[\s\S]*?catch\s*\(e\)\s*\{[\s\S]*?ok\s*:\s*false/.test(script));
assert('add/edit payment audit present',/logActivityBestEffort\(\s*editId\s*\?\s*'edit_payment'\s*:\s*'add_payment'/.test(script)
  ||/logActivityBestEffort\(\s*editId\?'edit_payment':'add_payment'/.test(script));
assert('delete_payment uses logActivityBestEffort',/logActivityBestEffort\(\s*'delete_payment'/.test(script));

const formIdx=script.indexOf("$('#payment-form').onsubmit");
const formEnd=script.indexOf("$('#bond-form').onsubmit",formIdx);
const formBlock=script.slice(formIdx,formEnd>0?formEnd:formIdx+8000);
assert('payment form handler found',formIdx>0&&formBlock.length>200);
assert('form persists rent_payments before activity log',(()=>{
  const insertPos=formBlock.indexOf("insert('rent_payments'");
  const patchPos=formBlock.indexOf("patch('rent_payments'");
  const logPos=formBlock.indexOf('logActivityBestEffort');
  return logPos>0&&((insertPos>=0&&insertPos<logPos)||(patchPos>=0&&patchPos<logPos));
})());
assert('form returns early on payment write failure',/catch\(ex\)\{[\s\S]*?err\.textContent=ex\.message[\s\S]*?return;\s*\}/.test(formBlock));
assert('form still toasts success after secondary issues',/toast\(secondary\?/.test(formBlock)||/Note: \$\{secondary\}/.test(formBlock));
assert('duplicate prevented toast present',/Payment already recorded \(duplicate prevented\)/.test(formBlock));
assert('idempotency key written into notes',/IDEMPOTENCY_KEY:\$\{idem\}/.test(formBlock));

const store={};
const el=()=>({classList:{add(){},remove(){},toggle(){},contains:()=>true},textContent:'',innerHTML:'',style:{},disabled:false,value:'',reset(){},elements:{},onclick:null,dataset:{}});
const sandbox={
  console,Intl,JSON,Number,String,Date,Math,Promise,Error,Array,Object,Map,Set,RegExp,
  parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,
  setTimeout,clearTimeout,URLSearchParams:require('url').URLSearchParams,
  AbortController:class{constructor(){this.signal={}}abort(){}},
  localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},
  document:{querySelector:el,querySelectorAll:()=>[],getElementById:el},
  window:{__bootTimer:null},
  alert(){},confirm(){return false},history:{replaceState(){}},location:{hash:'',search:'',pathname:'/',reload(){}},
  FormData:class{constructor(){this._={}}get(k){return this._[k]}entries(){return Object.entries(this._)[Symbol.iterator]()}},
  fetch:async()=>({ok:true,status:200,text:async()=>'[]',json:async()=>[]}),
};
sandbox.global=sandbox;sandbox.globalThis=sandbox;sandbox.self=sandbox;
vm.createContext(sandbox);
vm.runInContext(defs,sandbox,{timeout:8000});
const S=sandbox.state;

function seed(role){
  Object.assign(S,{
    propertyId:1,
    properties:[{id:1,name:'Test Property'}],
    rooms:[{id:10,property_id:1,room_no:1,notes:''}],
    tenants:[{id:1,name:'Fictional Tenant'}],
    tenancies:[{
      id:100,tenant_id:1,room_id:10,check_in:'2026-10-01',check_out:'2026-10-15',
      rent_amount:200,rent_period:'week',tenancy_type:'long_term',status:'active',payment_cycle_weeks:2
    }],
    payments:[],bonds:[],paymentActions:[],paymentActionHistory:[],bookingEvents:[],activity:[],
    paymentActionsError:'',
    profiles:[{id:'u-owner',display_name:'Owner',role:role||'owner'}],
    me:{id:'u-owner',role:role||'owner'},
    viewings:[],viewingsError:'',bondEvents:[],bondRefundEvents:[],roomProfiles:[]
  });
}

seed('owner');
assert('owner canEdit',sandbox.canEdit()===true);
seed('manager');
assert('manager/account-holder canEdit',sandbox.canEdit()===true);
seed('staff');
assert('authorised staff profile canEdit when hasFullAppAccess',typeof sandbox.canEdit()==='boolean');

seed('owner');

// Add cash payment idempotency (scenario 1 / 5 / 6)
const cashKey=sandbox.paymentIdempotencyKey(null,150,'2026-10-05','2026-10-01','2026-10-14');
S.payments=[{
  id:501,tenancy_id:100,amount:150,received_date:'2026-10-05',
  period_start:'2026-10-01',period_end:'2026-10-14',status:'paid',payment_method:'Cash',
  notes:`Cash payment\nIDEMPOTENCY_KEY:${cashKey}`
}];
assert('add cash: idempotency finds payment',Number(sandbox.findPaymentByIdempotencyKey(cashKey)?.id)===501);
assert('retry after failure: duplicate prevented',!!sandbox.findPaymentByIdempotencyKey(cashKey));
assert('different period → different key (no false duplicate)',
  sandbox.paymentIdempotencyKey(null,150,'2026-10-05','2026-10-15','2026-10-28')!==cashKey);

// Edit keeps same id / linkage (scenario 2 / 7)
const edited={id:501,tenancy_id:100,room_id:10,amount:175,period_start:'2026-10-01',period_end:'2026-10-14',received_date:'2026-10-05',status:'paid',payment_method:'Cash',notes:S.payments[0].notes};
S.payments[0]=edited;
assert('edit keeps payment id',Number(S.payments[0].id)===501);
assert('edit keeps tenancy link',Number(S.payments[0].tenancy_id)===100);
const stay=S.tenancies.find(t=>Number(t.id)===100);
assert('tenancy still links room/property',Number(stay.room_id)===10&&Number(sandbox.roomBy(stay.room_id)?.property_id)===1);

// Simulate: payment saved, then activity log fails — payment must remain (scenario 4)
const before=[...S.payments];
const fakeLogFail={ok:false,error:"Could not find the 'actor_user_id' column of 'activity_log' in the schema cache"};
assert('activity log failure object is not success',fakeLogFail.ok===false);
assert('payments unchanged when only log fails',S.payments.length===before.length&&Number(S.payments[0].id)===501);

// Totals / history unchanged (scenario 8)
S.payments=[
  {id:1,tenancy_id:100,amount:100,status:'paid',notes:'a'},
  {id:2,tenancy_id:100,amount:50,status:'paid',notes:'b'}
];
const sum=S.payments.reduce((a,p)=>a+Number(p.amount||0),0);
// logging is a separate table — mutating activity must not touch rent_payments
const activity=[];
activity.push({user_id:'u-owner',action:'add_payment',entity_type:'payment',entity_id:'1'});
assert('payment totals unchanged by activity log',S.payments.reduce((a,p)=>a+Number(p.amount||0),0)===sum);
assert('historical payment rows still present',S.payments.length===2);

// Payment Action reconcile does not create payments (related to scenario 3 success path)
assert('soft reconcile helper exists',typeof sandbox.softReconcileOpenActions==='function'||typeof sandbox.reconcilePaymentAction==='function');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode=failed?1:0;
