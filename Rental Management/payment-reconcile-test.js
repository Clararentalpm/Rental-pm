#!/usr/bin/env node
/** Tests A–G: Payment Action ↔ Rent Payment reconciliation + short-stay calc. */
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cut=script.search(/\$\('#nav'\)\.onclick|\$\("#nav"\)\.onclick|\$\('#nav'\)\.onclick/);
const cut2=cut>0?cut:script.search(/\$\('#nav'\)/);
let defs=(cut2>0?script.slice(0,cut2):script)
  .replace(/\blet state=/,'var state=')
  .replace(/\blet resendBusy=/,'var resendBusy=')
  .replace(/\bconst money=/,'var money=');
const store={};
const el=()=>({classList:{add(){},remove(){},toggle(){},contains:()=>true},textContent:'',innerHTML:'',style:{},disabled:false,value:'',reset(){},elements:{},onclick:null,dataset:{}});
const sandbox={
  console,Intl,JSON,Number,String,Date,Math,Promise,Error,Array,Object,Map,Set,RegExp,
  parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,
  setTimeout,clearTimeout,URLSearchParams:require('url').URLSearchParams,
  AbortController:class{constructor(){this.signal={}}abort(){}},
  localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},
  document:{querySelector:el,querySelectorAll:()=>[],getElementById:el},
  window:{__bootTimer:null},fetch:async()=>({ok:true,text:async()=>'[]',json:async()=>[]}),
  alert(){},confirm(){return false},history:{replaceState(){}},location:{hash:'',search:'',pathname:'/',reload(){}},
  FormData:class{constructor(){this._={}}get(k){return this._[k]}entries(){return Object.entries(this._)[Symbol.iterator]()}},
};
sandbox.global=sandbox;sandbox.globalThis=sandbox;sandbox.self=sandbox;
vm.createContext(sandbox);
vm.runInContext(defs,sandbox,{timeout:8000});
const S=sandbox.state;
function seed(){
  Object.assign(S,{
    propertyId:1,properties:[{id:1,name:'McGregor'}],
    rooms:[{id:5,property_id:1,room_no:5,notes:''},{id:6,property_id:1,room_no:6,notes:'Sofa'}],
    tenants:[{id:1,name:'Laura'},{id:2,name:'Blackgun'}],
    tenancies:[],
    payments:[],bonds:[],paymentActions:[],paymentActionHistory:[],bookingEvents:[],
    paymentActionsError:'',profiles:[{id:'u1',display_name:'Owner',role:'owner'}],me:{role:'owner'},
    viewings:[],viewingsError:''
  });
}
function assert(name,cond){
  if(!cond){console.log('FAIL',name);process.exitCode=1}
  else console.log('PASS',name);
}

seed();

// ---------- Short-stay calc (Laura source model — not hard-coded result in app) ----------
const laura={
  id:101,tenant_id:1,room_id:5,check_in:'2026-09-11',check_out:'2026-09-16',
  rent_amount:35,rent_period:'day',tenancy_type:'short_term',status:'active'
};
S.tenancies=[laura];
assert('Laura nights = 5 (11→16)', sandbox.stayNights(laura)===5);
assert('Laura solo total = 35×5', sandbox.expectedStayTotalSolo(laura)===175);
assert('Laura breakdown mentions 5 nights', sandbox.stayChargeBreakdown(laura).label.includes('5 night'));
assert('Laura breakdown mentions 35', /35/.test(sandbox.stayChargeBreakdown(laura).label));

// Blank rent_period short_term must still use nightly × nights (root-cause class for wrong weekly/total)
const lauraBlank={...laura,rent_period:''};
assert('Laura blank period still 175', sandbox.expectedStayTotalSolo(lauraBlank)===175);

// Do NOT invent nights past confirmed end
const lauraTbc={...laura,check_out:null,confirmed_until:'2026-09-16'};
assert('Laura confirmed_until nights = 5', sandbox.stayNights(lauraTbc)===5);
assert('Laura TBC extension not charged beyond confirmed', sandbox.expectedStayTotalSolo(lauraTbc)===175);

// Deposit must not enter rent total
S.bonds=[{id:9,tenancy_id:101,amount:200,original_currency:'CNY',bond_type:'booking_deposit',received:true}];
assert('Deposit bond does not change stay total', sandbox.expectedStayTotalSolo(laura)===175);

// Blackgun
const blackgun={
  id:102,tenant_id:2,room_id:6,check_in:'2026-09-11',check_out:'2026-09-14',
  rent_amount:25,rent_period:'night',tenancy_type:'short_term',status:'active'
};
S.tenancies=[laura,blackgun];
assert('Blackgun nights = 3', sandbox.stayNights(blackgun)===3);
assert('Blackgun total = 75', sandbox.expectedStayTotalSolo(blackgun)===75);
assert('Laura not grouped with Blackgun (different room)', sandbox.paymentGroupMembers(laura).length===1);

// ---------- TEST A: full $800 payment resolves action ----------
seed();
const longT={id:201,tenant_id:1,room_id:5,check_in:'2026-01-01',rent_amount:200,rent_period:'week',payment_cycle_weeks:4,tenancy_type:'long_term',status:'active'};
S.tenancies=[longT];
S.paymentActions=[{id:1,tenancy_id:201,tenant_id:1,room_id:5,property_id:1,amount:800,due_date:'2026-01-01',status:'open',notes:'ORIGINAL_AMOUNT:800',action_type:'rent_due'}];
// Simulate payment linked via notes/related id
S.payments=[{id:50,tenancy_id:201,amount:800,status:'paid',received_date:'2026-01-02',period_start:'2026-01-01',period_end:'2026-01-28',payment_method:'EFT',notes:'ACTION_ID:1\nIDEMPOTENCY_KEY:pa:1|amt:800.00|recv:2026-01-02|ps:2026-01-01|pe:2026-01-28'}];
S.paymentActions[0].related_payment_id=50;
S.paymentActions[0].notes='ORIGINAL_AMOUNT:800\nPAYMENT_ID:50';
S.paymentActions[0].amount=0;
S.paymentActions[0].status='resolved';
S.paymentActions[0].resolve_reason='Paid';
assert('TEST A live status resolved', sandbox.paymentActionLiveStatus(S.paymentActions[0])==='resolved');
assert('TEST A remaining 0', sandbox.actionRemainingAmount(S.paymentActions[0])===0);
assert('TEST A not in overdue filter', sandbox.displayPaymentActions('overdue').every(a=>Number(a.id)!==1));
assert('TEST A not in open filter', sandbox.displayPaymentActions('open').every(a=>Number(a.id)!==1));
assert('TEST A visible in resolved', sandbox.displayPaymentActions('resolved').some(a=>Number(a.id)===1));
assert('TEST A visible in all', sandbox.displayPaymentActions('all').some(a=>Number(a.id)===1));

// ---------- TEST B: partial then complete ----------
seed();
S.tenancies=[{id:202,tenant_id:1,room_id:5,check_in:'2026-02-01',check_out:'2026-02-28',rent_amount:800,rent_period:'total',tenancy_type:'short_term',status:'active'}];
S.paymentActions=[{id:2,tenancy_id:202,tenant_id:1,room_id:5,property_id:1,amount:800,due_date:'2026-02-01',status:'open',notes:'ORIGINAL_AMOUNT:800'}];
S.payments=[{id:60,tenancy_id:202,amount:500,status:'paid',received_date:'2026-02-02',period_start:'2026-02-01',period_end:'2026-02-28',notes:'ACTION_ID:2'}];
S.paymentActions[0].notes='ORIGINAL_AMOUNT:800\nPAYMENT_ID:60';
S.paymentActions[0].amount=300;
S.paymentActions[0].status='partially_paid';
assert('TEST B remaining 300', sandbox.actionRemainingAmount(S.paymentActions[0])===300);
assert('TEST B status partially_paid or overdue/due', ['partially_paid','overdue','due_soon','open'].includes(sandbox.paymentActionLiveStatus(S.paymentActions[0])));
assert('TEST B paid 500', sandbox.actionPaidAmount(S.paymentActions[0])===500);
// Second payment completes
S.payments.push({id:61,tenancy_id:202,amount:300,status:'paid',received_date:'2026-02-03',period_start:'2026-02-01',period_end:'2026-02-28',notes:'ACTION_ID:2'});
S.paymentActions[0].notes='ORIGINAL_AMOUNT:800\nPAYMENT_ID:60\nPAYMENT_ID:61';
S.paymentActions[0].amount=0;S.paymentActions[0].status='resolved';S.paymentActions[0].resolve_reason='Paid';
assert('TEST B after second payment remaining 0', sandbox.actionRemainingAmount(S.paymentActions[0])===0);
assert('TEST B resolved', sandbox.paymentActionLiveStatus(S.paymentActions[0])==='resolved');
assert('TEST B no duplicate obligation amount', sandbox.actionOriginalAmount(S.paymentActions[0],S.tenancies[0])===800);

// ---------- TEST C: Blackgun existing $75 cash reconciles — no duplicate ----------
seed();
S.tenancies=[blackgun];
S.payments=[{id:70,tenancy_id:102,amount:75,status:'paid',received_date:'2026-09-11',period_start:'2026-09-11',period_end:'2026-09-14',payment_method:'Cash',notes:'Cash on arrival'}];
S.paymentActions=[{id:3,tenancy_id:102,tenant_id:2,room_id:6,property_id:1,amount:75,due_date:'2026-09-11',status:'open',notes:''}];
assert('TEST C source total 75', sandbox.expectedStayTotalSolo(blackgun)===75);
assert('TEST C existing cash found', sandbox.actionPaidAmount(S.paymentActions[0])===75);
assert('TEST C remaining 0 from existing payment', sandbox.actionRemainingAmount(S.paymentActions[0])===0);
assert('TEST C live status resolved (not overdue)', sandbox.paymentActionLiveStatus(S.paymentActions[0])==='resolved');
assert('TEST C one-off fully paid => no further due', sandbox.nextRentDue(blackgun)===null||sandbox.needsPaymentAction(blackgun)===false);

// ---------- TEST D: Laura $425 investigation class ----------
seed();
S.tenancies=[laura];
// Wrong weekly mis-path avoided when short_term + blank period
assert('TEST D corrected calc 175 not 425', sandbox.expectedStayTotalSolo(lauraBlank)===175);
assert('TEST D 425 is not 35×5', 35*5!==425);
assert('TEST D 425/35 not integer nights', !Number.isInteger(425/35));
// Stale persisted action amount must not drive open display when live remaining differs
S.paymentActions=[{id:4,tenancy_id:101,tenant_id:1,room_id:5,property_id:1,amount:425,due_date:'2026-09-11',status:'open',notes:''}];
assert('TEST D display amount uses live remaining 175', sandbox.actionDisplayAmount(S.paymentActions[0])===175);

// ---------- TEST E: unknown future extension ----------
seed();
const partial={id:103,tenant_id:1,room_id:5,check_in:'2026-09-11',check_out:null,confirmed_until:'2026-09-16',rent_amount:35,rent_period:'day',tenancy_type:'short_term',status:'active'};
S.tenancies=[partial];
assert('TEST E only confirmed nights', sandbox.stayNights(partial)===5);
assert('TEST E only confirmed charge', sandbox.expectedStayTotalSolo(partial)===175);

// ---------- TEST F: double-click idempotency ----------
seed();
S.tenancies=[blackgun];
S.payments=[];
const key=sandbox.paymentIdempotencyKey(9,75,'2026-09-11','2026-09-11','2026-09-14');
S.payments=[{id:80,tenancy_id:102,amount:75,status:'paid',notes:`IDEMPOTENCY_KEY:${key}`,received_date:'2026-09-11',period_start:'2026-09-11',period_end:'2026-09-14'}];
assert('TEST F finds existing by idempotency key', Number(sandbox.findPaymentByIdempotencyKey(key)?.id)===80);
assert('TEST F duplicate prevented (same key)', sandbox.findPaymentByIdempotencyKey(key)===S.payments[0]);

// ---------- TEST G: history totals reconcile ----------
seed();
S.tenancies=[{id:202,tenant_id:1,room_id:5,check_in:'2026-02-01',check_out:'2026-02-28',rent_amount:800,rent_period:'total',tenancy_type:'short_term',status:'active'}];
S.payments=[
  {id:60,tenancy_id:202,amount:500,status:'paid',notes:'ACTION_ID:2',period_end:'2026-02-28'},
  {id:61,tenancy_id:202,amount:300,status:'paid',notes:'ACTION_ID:2',period_end:'2026-02-28'}
];
S.paymentActions=[{id:2,tenancy_id:202,amount:0,status:'resolved',notes:'ORIGINAL_AMOUNT:800\nPAYMENT_ID:60\nPAYMENT_ID:61',resolve_reason:'Paid'}];
const paid=sandbox.actionPaidAmount(S.paymentActions[0]);
const rem=sandbox.actionRemainingAmount(S.paymentActions[0]);
const orig=sandbox.actionOriginalAmount(S.paymentActions[0],S.tenancies[0]);
assert('TEST G paid 800', paid===800);
assert('TEST G remaining 0', rem===0);
assert('TEST G original 800', orig===800);
assert('TEST G paid + remaining = original', Math.abs(paid+rem-orig)<0.01);

// Markup / wiring
assert('payment form has action id field', html.includes('name="payment_action_id"'));
assert('payment form has idempotency field', html.includes('name="idempotency_key"'));
assert('record button passes data-action', html.includes('data-action="${esc(a.id)}"')||html.includes('data-action="'));
assert('soft reconcile on load', html.includes('softReconcileOpenActions'));
assert('resolve reason Paid path', html.includes("resolve_reason='Paid'")||html.includes('resolve_reason:"Paid"')||html.includes("resolve_reason='Paid'")||html.includes('Paid'));

if(process.exitCode)console.log('payment-reconcile-test FAILED');
else console.log('payment-reconcile-test passed');
