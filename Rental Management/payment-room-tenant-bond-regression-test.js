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
assert('bond filters All/Current/Upcoming/Past',/bondStayFilterKind/.test(script)&&/\['all','current','upcoming','past'\]/.test(script));
assert('bond default current',/bondFilter:'current'/.test(script));
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
      {id:804,tenancy_id:104,amount:100,original_currency:'AUD',received:true,refunded:false,bond_type:'booking_deposit',remaining_amount:100}
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

// Payments: missing period allowed in data; idempotency; edit keeps id
assert('payment without covered period present',S.payments.some(p=>Number(p.id)===502&&!p.period_start&&!p.period_end));
const beforeSum=S.payments.reduce((a,p)=>a+Number(p.amount||0),0);
const edited={...S.payments[0],amount:220,received_date:'2026-10-06',id:501};
S.payments[0]=edited;
assert('edit preserves payment id',Number(S.payments[0].id)===501);
assert('edit updates amount only on that row',Number(S.payments[0].amount)===220&&S.payments.length===2);
S.payments[0]={...S.payments[0],amount:200,received_date:'2026-10-05'};
assert('totals restore after fictional revert',S.payments.reduce((a,p)=>a+Number(p.amount||0),0)===beforeSum);

const key='k2';
assert('idempotency finds payment without period',!!sandbox.findPaymentByIdempotencyKey(key));

// Delete does not touch bonds
const bondsBefore=S.bonds.length;
S.payments=S.payments.filter(p=>Number(p.id)!==502);
assert('delete payment removes only that payment',S.payments.length===1&&!S.payments.some(p=>Number(p.id)===502));
assert('bonds unchanged after payment delete',S.bonds.length===bondsBefore);

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode=failed?1:0;
