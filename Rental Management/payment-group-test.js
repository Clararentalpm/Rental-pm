#!/usr/bin/env node
/** Unit checks for shared payment-group overdue rules (no production writes). */
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
  tenants:[{id:1,name:'辣豆'},{id:2,name:'Vicky'},{id:3,name:'Solo'}],
  tenancies:[
    {id:10,tenant_id:1,room_id:2,check_in:'2026-09-01',check_out:'2026-09-20',rent_amount:280,rent_period:'week',payment_cycle_weeks:1,status:'active'},
    {id:11,tenant_id:2,room_id:2,check_in:'2026-09-01',check_out:'2026-09-13',rent_amount:280,rent_period:'week',payment_cycle_weeks:1,status:'active'},
    {id:12,tenant_id:3,room_id:2,check_in:'2026-08-01',check_out:null,rent_amount:200,rent_period:'week',payment_cycle_weeks:1,status:'active'}
  ],
  // Payment recorded only against 辣豆, covering through 2026-09-14
  payments:[{id:1,tenancy_id:10,amount:560,status:'paid',period_start:'2026-09-01',period_end:'2026-09-14',received_date:'2026-09-01'}],
  bonds:[],profiles:[],roomProfiles:[],priceHistory:[],activity:[],bondEvents:[],bondRefundEvents:[],
  me:{role:'owner'},page:'payments',view:'current',tenantSearch:'',tenantFilter:'current',availabilityMode:'calendar',incomeMode:'weekly'
});

function assert(name,cond){if(!cond){console.log('FAIL',name);process.exitCode=1}else console.log('PASS',name)}

const lado=S.tenancies[0], vicky=S.tenancies[1], solo=S.tenancies[2];
// Freeze "today" by patching sandbox.today if needed — today() uses Date.now. Simulate by checking relative logic via paidThrough.
assert('group members same room+check-in', sandbox.paymentGroupMembers(lado).length===2 && sandbox.paymentGroupMembers(vicky).length===2);
assert('solo not in shared group', sandbox.paymentGroupMembers(solo).length===1);
assert('Vicky paidThrough uses 辣豆 payment', sandbox.paidThrough(vicky)==='2026-09-14');
assert('辣豆 paidThrough same', sandbox.paidThrough(lado)==='2026-09-14');
assert('next due after group paid-through', sandbox.nextRentDue(vicky)==='2026-09-15' && sandbox.nextRentDue(lado)==='2026-09-15');
assert('due schedule primary only once', sandbox.isPaymentGroupPrimary(lado)!==sandbox.isPaymentGroupPrimary(vicky) || sandbox.isPaymentGroupPrimary(lado));
const primaries=[lado,vicky].filter(t=>sandbox.isPaymentGroupPrimary(t));
assert('exactly one primary in pair', primaries.length===1);
assert('group expected amount sums once', sandbox.paymentGroupExpectedAmount(primaries[0])===560);
assert('group name joins both', sandbox.paymentGroupName(primaries[0]).includes('辣豆')&&sandbox.paymentGroupName(primaries[0]).includes('Vicky'));

// After Vicky checks out, she is historical/completed and leaves active schedule group
vicky.check_out='2026-09-08'; // if today were later; force historical via status
vicky.status='historical';
assert('historical Vicky not in schedule group with 辣豆', sandbox.scheduleGroupMembers(lado).every(x=>Number(x.id)===10));
assert('辣豆 still gets historical partner payments', sandbox.paidThrough(lado)==='2026-09-14');

// Rent-due alignment after payment coverage
assert('covered through future => paid (not due soon)', sandbox.rentState(lado)==='paid');
S.payments.push({id:2,tenancy_id:12,amount:200,status:'recorded',period_end:'2099-01-01',received_date:'2026-09-01'});
assert('status recorded still counts for paidThrough', sandbox.paidThrough(solo)==='2099-01-01');
assert('solo rentState paid when covered', sandbox.rentState(solo)==='paid');
const sug=sandbox.suggestPaymentPeriod(lado);
assert('suggest period starts day after paid-through', sug.start==='2026-09-15');

console.log(process.exitCode?'FAILED':'ALL PASSED');
