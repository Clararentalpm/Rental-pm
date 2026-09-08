#!/usr/bin/env node
/** Unit checks for room viewings / 看房 helpers. */
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

const assert=(c,m)=>{if(!c)throw new Error(m); console.log('OK',m)};
const d=vm.runInContext('today()',sandbox);

assert(sandbox.viewingKind({inspection_date:d,status:'scheduled'})==='current','today inspection => current');
assert(sandbox.viewingKind({inspection_date:'2099-06-01',status:'scheduled'})==='upcoming','future inspection => upcoming');
assert(sandbox.viewingKind({inspection_date:'2020-01-01',status:'scheduled'})==='past','past date => past');
assert(sandbox.viewingKind({inspection_date:'2099-06-01',status:'cancelled'})==='past','cancelled => past');
assert(sandbox.viewingKind({inspection_date:'2099-06-01',status:'completed'})==='past','completed => past');

Object.assign(sandbox.state,{
  propertyId:1,
  properties:[{id:1,name:'McGregor'},{id:2,name:'Carindale'}],
  rooms:[{id:1,property_id:1,room_no:1},{id:10,property_id:2,room_no:1}],
  tenancies:[
    {id:1,tenant_id:9,room_id:1,check_in:'2026-10-01',check_out:'2026-10-10',status:'upcoming'},
    {id:2,tenant_id:10,room_id:10,check_in:'2026-10-01',check_out:'2026-10-10',status:'upcoming'}
  ],
  viewings:[
    {id:1,property_id:1,room_id:1,visitor_name:'A',inspection_date:'2099-01-01',inspection_time:'10:00'},
    {id:2,property_id:2,room_id:10,visitor_name:'B',inspection_date:'2099-01-02',inspection_time:'11:00'}
  ]
});
assert(sandbox.scopedViewings().length===1&&sandbox.scopedViewings()[0].id===1,'viewings scoped to property tab');
assert(sandbox.roomOccupiedOverlap(1,'2026-10-05','2026-10-08')===true,'overlap with stay => occupied');
assert(sandbox.roomOccupiedOverlap(1,'2026-10-20','2026-10-25')===false,'outside stay => free');
assert(sandbox.roomOccupiedOverlap(10,'2026-10-05','2026-10-08')===true,'Carindale room overlap');
assert(/appears available/.test(sandbox.roomAvailabilityNote(1,'2026-10-20','2026-10-25')),'availability note free');
assert(/occupied/.test(sandbox.roomAvailabilityNote(1,'2026-10-05','2026-10-08')),'availability note occupied');

assert(html.includes('data-page="viewings"'),'left-nav Inspections tab');
assert(html.includes('>Inspections</button>'),'Inspections nav label');
assert(html.includes('id="viewing-dialog"'),'inspection dialog present');
assert(html.includes("$('#viewing-form').onsubmit"),'inspection form submit wired');
assert(html.includes('+ Book inspection'),'Book inspection CTA');
assert(html.includes('supabase_room_viewings.sql'),'SQL setup hint in UI');
assert(html.includes('needs_extra_bed'),'加床 field');
assert(html.includes('deposit_paid'),'deposit to secure room field');
console.log('viewing-test passed');
