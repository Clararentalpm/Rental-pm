#!/usr/bin/env node
/** Unit checks for checkout → Past tenant filter + profile stay pick. */
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
assert(sandbox.tenancyKind({check_out:d,status:'active'})==='historical','checkout today => past');
assert(sandbox.tenancyKind({check_out:'2099-01-01',check_in:'2020-01-01',status:'active'})==='current','future checkout => current');
assert(sandbox.tenancyKind({check_in:'2099-06-01',status:'upcoming',check_out:null})==='upcoming','future checkin => upcoming');

Object.assign(sandbox.state,{
  properties:[{id:1,name:'McGregor'}],
  rooms:[{id:1,property_id:1,room_no:1}],
  tenancies:[
    {id:1,tenant_id:9,room_id:1,check_in:'2025-01-01',check_out:'2025-06-01',status:'ended'},
    {id:2,tenant_id:9,room_id:1,check_in:'2026-01-01',check_out:null,status:'active'}
  ]
});
assert(sandbox.tenantProfileRow({id:9,name:'Test'}).kind==='current','profile prefers current over past');

sandbox.state.tenancies=[{id:3,tenant_id:9,room_id:1,check_in:'2025-01-01',check_out:d,status:'active'}];
assert(sandbox.tenantProfileRow({id:9,name:'Test'}).kind==='historical','checked-out only => past');

assert(html.includes('add-property-tab'),'+ Property tab markup');
assert(html.includes('id="property-dialog"'),'property dialog present');
console.log('tenant-filter-test passed');
