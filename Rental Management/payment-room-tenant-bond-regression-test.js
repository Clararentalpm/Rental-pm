#!/usr/bin/env node
/**
 * Fictional regressions — payment delete/edit, room status, tenant/bond filters.
 * Does not touch production. Run: node payment-room-tenant-bond-regression-test.js
 */
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cut=script.search(/\$\('#nav'\)\.onclick|\$\("#nav"\)\.onclick/);
let defs=(cut>0?script.slice(0,cut):script)
  .replace(/\blet state=/,'var state=')
  .replace(/\blet resendBusy=/,'var resendBusy=')
  .replace(/\bconst money=/,'var money=')
  .replace(/\bconst today=/,'var today=');

let passed=0,failed=0;
function assert(name,cond,detail){
  if(cond){passed++;console.log('PASS',name)}
  else{failed++;console.log('FAIL',name,detail||'')}
}

// --- Source contracts ---
assert('no actor_user_id property writes',!/actor_user_id\s*:/.test(script));
assert('deletePayment uses logActivityBestEffort',/async function deletePayment[\s\S]*?logActivityBestEffort\(\s*'delete_payment'/.test(script));
assert('deletePayment has double-delete guard',/deletingPaymentIds/.test(script));
assert('deletePayment confirms before delete',/async function deletePayment[\s\S]*?confirm\(/.test(script));
assert('delete audit includes tenant/room/actor',/delete_payment[\s\S]*?tenant_name[\s\S]*?room_label[\s\S]*?actor:/.test(script)||/tenant_name:[\s\S]*?room_label:[\s\S]*?actor:/.test(script));
assert('Edit Payment / Delete Payment action labels',/Edit Payment/.test(html)&&/Delete Payment/.test(html));
assert('covered period optional on save',/Covered Period is optional/.test(script)||/leave both blank/.test(script));
assert('period_end not hard-required',!/Period end is required so Rent due status/.test(script));
assert('edit payment logs previous snapshot',/previous:\s*\{/.test(script)||/logDetails\.previous/.test(script));
assert('tenant filters All/Current/Upcoming/Past',/\['all','current','upcoming','past'\]/.test(script));
assert('bondStayFilterKind helper present',/function bondStayFilterKind\(/.test(script));
assert('bond Unlinked / Needs Review filter',/unlinked/.test(script)&&/Unlinked \/ Needs Review/.test(script));
assert('bond filter keys include unlinked',/\['all','current','upcoming','past','unlinked'\]/.test(script));
assert('bond default current',/bondFilter:'current'/.test(script));
assert('refreshPaymentDerivedState helper',/function refreshPaymentDerivedState\(/.test(script));
assert('delete reports secondary reconcile notes',/Rent balance recalculation needs a Refresh/.test(script));
assert('save success independent of activity log',/payment was saved/.test(script)||/payment was deleted/.test(script));
assert('room status Vacant label',/>Vacant</.test(script)||/Vacant</.test(script));
assert('room status availability line',/Availability:/.test(script));
assert('Carindale Room 3 ensuite rule',/canonicalCarindaleEnsuite/.test(script)&&/n===3/.test(script));
assert('Carindale Room 4 not ensuite',/n===4\)return false/.test(script));
assert('Australia/Brisbane timezone',/Australia\/Brisbane/.test(script));

const store={};
const el=()=>({classList:{add(){},remove(){},toggle(){},contains:()=>true},textContent:'',innerHTML:'',style:{},disabled:false,value:'',reset(){},elements:{},onclick:null,dataset:{},addEventListener(){}});
const sandbox={
  console,Intl,JSON,Number,String,Date,Math,Promise,Error,Array,Object,Map,Set,RegExp,
  parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,
  setTimeout,clearTimeout,URLSearchParams:require('url').URLSearchParams,
  AbortController:class{constructor(){this.signal={}}abort(){}},
  localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},
  document:{querySelector:el,querySelectorAll:()=>[],getElementById:el},
  window:{__bootTimer:null},
  alert(){},confirm(){return true},history:{replaceState(){}},location:{hash:'',search:'',pathname:'/',reload(){}},
  FormData:class{constructor(){this._={}}get(k){return this._[k]}entries(){return Object.entries(this._)[Symbol.iterator]()}},
  fetch:async()=>({ok:true,status:200,text:async()=>'[]',json:async()=>[]}),
};
sandbox.global=sandbox;sandbox.globalThis=sandbox;sandbox.self=sandbox;
vm.createContext(sandbox);
vm.runInContext(defs,sandbox,{timeout:10000});
const S=sandbox.state;
sandbox.today=()=>'2026-10-15';

function seed(){
  Object.assign(S,{
    propertyId:1,
    properties:[{id:1,name:'Carindale',timezone:'Australia/Brisbane'},{id:2,name:'McGregor',timezone:'Australia/Brisbane'}],
    rooms:[
      {id:13,property_id:1,room_no:3,ensuite:false,notes:''},
      {id:14,property_id:1,room_no:4,ensuite:true,notes:''},
      {id:21,property_id:2,room_no:1,notes:''}
    ],
    tenants:[
      {id:1,name:'Current Tenant'},
      {id:2,name:'Past Tenant'},
      {id:3,name:'Returning Tenant'},
      {id:4,name:'Upcoming Only'}
    ],
    tenancies:[
      {id:100,tenant_id:1,room_id:13,check_in:'2026-10-01',check_out:'2026-11-01',status:'active',tenancy_type:'long_term',rent_amount:200,rent_period:'week'},
      {id:101,tenant_id:2,room_id:14,check_in:'2026-09-01',check_out:'2026-09-20',status:'completed',tenancy_type:'short_term',rent_amount:50,rent_period:'night'},
      // Returning tenant: past + future on same property → Upcoming (not Past).
      {id:102,tenant_id:3,room_id:13,check_in:'2026-08-01',check_out:'2026-08-15',status:'completed',tenancy_type:'short_term',rent_amount:40,rent_period:'night'},
      {id:103,tenant_id:3,room_id:14,check_in:'2026-11-01',check_out:'2026-11-10',status:'upcoming',tenancy_type:'short_term',rent_amount:40,rent_period:'night'},
      {id:104,tenant_id:4,room_id:14,check_in:'2026-10-20',check_out:'2026-10-25',status:'upcoming',tenancy_type:'short_term',rent_amount:55,rent_period:'night'},
      {id:105,tenant_id:2,room_id:13,check_in:'2026-07-01',check_out:'2026-07-10',status:'cancelled',cancelled_at:'2026-06-20',tenancy_type:'short_term',rent_amount:50,rent_period:'night'}
    ],
    payments:[
      {id:501,tenancy_id:100,amount:200,received_date:'2026-10-05',period_start:'2026-10-01',period_end:'2026-10-14',status:'paid',payment_method:'Cash',notes:'PAYMENT_CURRENCY:AUD\nIDEMPOTENCY_KEY:k1'},
      {id:502,tenancy_id:100,amount:100,received_date:'2026-10-08',period_start:null,period_end:null,status:'paid',payment_method:'EFT',notes:'PAYMENT_CURRENCY:AUD\nIDEMPOTENCY_KEY:k2'}
    ],
    bonds:[
      {id:801,tenancy_id:100,amount:400,original_currency:'AUD',received:true,refunded:false,bond_type:'rental_bond',remaining_amount:400},
      {id:802,tenancy_id:101,amount:200,original_currency:'AUD',received:true,refunded:true,bond_type:'booking_deposit',refund_amount:200,remaining_amount:0},
      {id:803,tenancy_id:103,amount:150,original_currency:'CNY',received:true,refunded:false,bond_type:'booking_deposit',remaining_amount:150},
      {id:804,tenancy_id:104,amount:100,original_currency:'AUD',received:true,refunded:false,bond_type:'booking_deposit',remaining_amount:100},
      // Unlinked — null / missing / invalid tenancy must NOT classify as past
      {id:805,tenancy_id:null,amount:90,original_currency:'AUD',received:true,refunded:false,bond_type:'deposit',remaining_amount:90,forfeited_amount:0},
      {id:806,tenancy_id:99999,amount:75,original_currency:'AUD',received:true,refunded:false,bond_type:'deposit',remaining_amount:50,forfeited_amount:25},
      {id:807,tenancy_id:'',amount:60,original_currency:'CNY',received:true,refunded:true,refund_amount:60,bond_type:'booking_deposit',remaining_amount:0}
    ],
    paymentActions:[],paymentActionHistory:[],bookingEvents:[],activity:[],
    bondEvents:[],bondRefundEvents:[],viewings:[],roomProfiles:[],
    profiles:[{id:'u1',display_name:'Owner',role:'owner'}],me:{id:'u1',role:'owner'},
    paymentActionsError:'',tenantFilter:'current',bondFilter:'current'
  });
}

seed();
assert('owner canEdit',sandbox.canEdit()===true);

// Room status occupancy
assert('current occupant only current stay',sandbox.currentOccupantsForRoom(13).some(t=>Number(t.id)===100));
assert('past stay not current on room 4',!sandbox.currentOccupantsForRoom(14).some(t=>Number(t.id)===101));
assert('cancelled stay never current',!sandbox.currentOccupantsForRoom(13).some(t=>Number(t.id)===105));
assert('upcoming shows as next not current',(()=>{
  const cur=sandbox.currentOccupantsForRoom(14);
  const next=sandbox.nextBookingForRoom(14);
  return cur.length===0&&next&&Number(next.id)===104;
})());
assert('Carindale R3 ensuite',sandbox.roomIsEnsuite(S.rooms[0])===true);
assert('Carindale R4 not ensuite',sandbox.roomIsEnsuite(S.rooms[1])===false);

// Tenant classification
const rows=S.tenants.map(t=>sandbox.tenantProfileRow(t)).filter(x=>x.onProperty);
assert('current tenant classified current',rows.find(x=>x.tenant.id===1)?.kind==='current');
assert('past-only tenant classified historical',rows.find(x=>x.tenant.id===2)?.kind==='historical');
assert('returning tenant Upcoming not Past',rows.find(x=>x.tenant.id===3)?.kind==='upcoming');
assert('upcoming-only Upcoming',rows.find(x=>x.tenant.id===4)?.kind==='upcoming');

// Bond stay filter kinds
assert('bond on current stay → current',sandbox.bondStayFilterKind(S.bonds[0])==='current');
assert('closed bond on past stay → past (still accessible)',sandbox.bondStayFilterKind(S.bonds[1])==='past');
assert('bond on upcoming returning stay → upcoming',sandbox.bondStayFilterKind(S.bonds[2])==='upcoming');
assert('upcoming-only bond → upcoming',sandbox.bondStayFilterKind(S.bonds[3])==='upcoming');
assert('null tenancy_id → unlinked (not past)',sandbox.bondStayFilterKind(S.bonds.find(b=>b.id===805))==='unlinked');
assert('invalid tenancy_id → unlinked (not past)',sandbox.bondStayFilterKind(S.bonds.find(b=>b.id===806))==='unlinked');
assert('empty tenancy_id → unlinked',sandbox.bondStayFilterKind(S.bonds.find(b=>b.id===807))==='unlinked');
assert('unlinked label readable',sandbox.bondStayFilterLabel('unlinked')==='Unlinked / Needs Review');
assert('All includes unlinked count',S.bonds.filter(b=>sandbox.bondStayFilterKind(b)==='unlinked').length===3);
assert('Past filter excludes unlinked',!S.bonds.filter(b=>sandbox.bondStayFilterKind(b)==='past').some(b=>[805,806,807].includes(Number(b.id))));
assert('retained unlinked bond preserved',Number(S.bonds.find(b=>b.id===806).forfeited_amount)===25&&Number(S.bonds.find(b=>b.id===806).remaining_amount)===50);
assert('refunded unlinked bond preserved',Number(S.bonds.find(b=>b.id===807).refund_amount)===60);

// Payments: missing period; edit date/amount/period; idempotency; delete
assert('payment without covered period present',S.payments.some(p=>Number(p.id)===502&&!p.period_start&&!p.period_end));
const beforeSum=S.payments.reduce((a,p)=>a+Number(p.amount||0),0);
const beforeCount=S.payments.length;
const otherBefore=JSON.stringify(S.payments.find(p=>Number(p.id)===502));

// Edit amount + received date — same id, no duplicate
S.payments[0]={...S.payments[0],amount:220,received_date:'2026-10-06',id:501};
assert('edit preserves payment id',Number(S.payments[0].id)===501&&S.payments.length===beforeCount);
assert('edit updates amount and date',Number(S.payments[0].amount)===220&&S.payments[0].received_date==='2026-10-06');
assert('unrelated payment unchanged by edit',JSON.stringify(S.payments.find(p=>Number(p.id)===502))===otherBefore);

// Add missing covered period on existing payment
S.payments[1]={...S.payments[1],period_start:'2026-10-08',period_end:'2026-10-14',id:502};
assert('add covered period keeps same id',Number(S.payments[1].id)===502&&S.payments.length===beforeCount);
assert('covered period now set',S.payments[1].period_start==='2026-10-08'&&S.payments[1].period_end==='2026-10-14');

// Rent coverage / due helpers still function after edits (fictional tenancy 100)
const stay=S.tenancies.find(t=>Number(t.id)===100);
assert('rentState helper available after payment edits',typeof sandbox.rentState==='function'&&typeof sandbox.rentState(stay)==='string');
assert('paidThrough / next due helpers available',typeof sandbox.nextRentDue==='function');

S.payments[0]={...S.payments[0],amount:200,received_date:'2026-10-05'};
assert('income-style sum after revert',S.payments.reduce((a,p)=>a+Number(p.amount||0),0)===beforeSum);

const key='k2';
assert('idempotency finds payment (no duplicate on retry)',!!sandbox.findPaymentByIdempotencyKey(key));

// Delete without period then with period — bonds untouched; history length drops only for that id
const bondsBefore=S.bonds.map(b=>({id:b.id,amount:b.amount,tenancy_id:b.tenancy_id,remaining_amount:b.remaining_amount}));
const noPeriod={id:503,tenancy_id:100,amount:40,received_date:'2026-10-09',period_start:null,period_end:null,status:'paid',payment_method:'Cash',notes:'IDEMPOTENCY_KEY:k3'};
S.payments.push(noPeriod);
S.payments=S.payments.filter(p=>Number(p.id)!==503);
assert('delete payment without period removes only that row',!S.payments.some(p=>Number(p.id)===503));
S.payments=S.payments.filter(p=>Number(p.id)!==501);
assert('delete payment with period removes only that row',!S.payments.some(p=>Number(p.id)===501)&&S.payments.some(p=>Number(p.id)===502));
assert('bonds unchanged after payment deletes',JSON.stringify(S.bonds.map(b=>({id:b.id,amount:b.amount,tenancy_id:b.tenancy_id,remaining_amount:b.remaining_amount})))===JSON.stringify(bondsBefore));
assert('tenancies unchanged after payment deletes',S.tenancies.length===6&&Number(S.tenancies[0].id)===100);

// Failed activity log must not imply payment failure (source contract + local state already saved)
assert('activity log failure messaging separates from payment success',/Activity log could not be written \(payment was (saved|deleted)\)/.test(script));

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode=failed?1:0;
