#!/usr/bin/env node
/** Unit checks for cancel / no-show / forfeit / payment-action overdue exclusion. */
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cut=script.indexOf("$('#nav').onclick");
let defs=(cut>0?script.slice(0,cut):script).replace(/\blet state=/,'var state=').replace(/\blet resendBusy=/,'var resendBusy=');
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
vm.createContext(sandbox);vm.runInContext(defs,sandbox,{timeout:5000});
const S=sandbox.state;
Object.assign(S,{
  propertyId:1,properties:[{id:1,name:'McGregor'}],
  rooms:[{id:2,property_id:1,room_no:2}],
  tenants:[{id:1,name:'Guest A'}],
  tenancies:[
    {id:100,tenant_id:1,room_id:2,check_in:'2026-09-10',check_out:'2026-09-17',rent_amount:200,rent_period:'total',status:'upcoming',tenancy_type:'short_term'},
  ],
  payments:[],bonds:[{id:45,tenancy_id:100,amount:200,original_currency:'AUD',received:true,refunded:false,bond_type:'booking_deposit',refund_amount:0,forfeited_amount:0}],
  paymentActions:[],paymentActionHistory:[],bookingEvents:[],paymentActionsError:'',
  profiles:[{id:'u1',display_name:'Owner',role:'owner'}],
  me:{role:'owner'},viewings:[],viewingsError:''
});

function assert(name,cond){if(!cond){console.log('FAIL',name);process.exitCode=1}else console.log('PASS',name)}

const t=S.tenancies[0];
assert('upcoming unpaid needs action', sandbox.needsPaymentAction(t)===true);
assert('virtual action due uses check-in', sandbox.virtualPaymentAction(t).due_date==='2026-09-10');

// TEST A style: corrected booking due date via check-in change (logic only)
t.check_in='2026-09-15';
assert('corrected check-in moves due', sandbox.nextRentDue(t)==='2026-09-15');

// TEST B: cancelled + full forfeit — rent not overdue
t.status='cancelled';
t.rent_treatment='not_payable';
t.deposit_treatment='forfeit_full';
t.cancellation_reason='Never checked in';
S.bonds[0].forfeited_amount=200;S.bonds[0].remaining_amount=0;S.bonds[0].deposit_status='Forfeited / Retained';
assert('cancelled is historical kind', sandbox.tenancyKind(t)==='historical');
assert('cancelled rentState cancelled', sandbox.rentState(t)==='cancelled');
assert('cancelled does not need payment action', sandbox.needsPaymentAction(t)===false);
assert('booking label never checked in', sandbox.bookingStatusLabel(t).includes('Never Checked In'));
assert('deposit status forfeited', sandbox.bondDepositStatus(S.bonds[0]).toLowerCase().includes('forfeit'));
assert('refund due 0 after full forfeit', sandbox.bondRemaining(S.bonds[0])===0);
assert('cancelled does not block room', sandbox.roomOccupiedOverlap(2,'2026-09-15','2026-09-20')===false);

// TEST C: partial forfeit validation
assert('partial split ok', sandbox.validateDepositSplit(300,100,200)==='');
assert('partial split over original fails', !!sandbox.validateDepositSplit(300,150,200));

// TEST D: no-show
t.status='no_show';
assert('no-show not overdue action', sandbox.needsPaymentAction(t)===false);
assert('no-show label', sandbox.bookingStatusLabel(t)==='No-show');

// TEST E: waived action not counted overdue
S.paymentActions=[{id:1,tenancy_id:100,tenant_id:1,room_id:2,property_id:1,due_date:'2020-01-01',amount:50,status:'waived'}];
assert('waived not overdue counted', sandbox.isActionCountedInOverdue(S.paymentActions[0])===false);
S.paymentActions=[{id:2,tenancy_id:100,tenant_id:1,room_id:2,property_id:1,due_date:'2020-01-01',amount:50,status:'open'}];
assert('open past due is overdue', sandbox.paymentActionLiveStatus(S.paymentActions[0])==='overdue');
assert('superseded not overdue', sandbox.isActionCountedInOverdue({status:'superseded',due_date:'2020-01-01'})===false);

// TEST F: viewer cannot edit
S.me={role:'viewer'};
assert('viewer cannot edit', sandbox.canEdit()===false);
S.me={role:'manager'};
assert('manager can edit', sandbox.canEdit()===true);

assert('cancel dialog markup', html.includes('id="cancel-booking-dialog"'));
assert('payment action dialog markup', html.includes('id="payment-action-dialog"'));
assert('sql migration file referenced', html.includes('supabase_payment_actions_cancel.sql'));
assert('forfeit bond actions', html.includes('forfeit_full'));

if(process.exitCode)console.log('cancel-forfeit-test FAILED');
else console.log('cancel-forfeit-test passed');
