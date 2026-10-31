#!/usr/bin/env node
/**
 * P0 regression — app must parse and clear Loading / show auth.
 * Fictional only. Run: node login-boot-regression-test.js
 */
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {spawnSync}=require('child_process');

const htmlPath=path.join(__dirname,'index.html');
const html=fs.readFileSync(htmlPath,'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
if(!m){console.error('FAIL no inline script');process.exit(1)}
const script=m[1];
const tmp=path.join('/tmp','rental-pm-login-boot-check.js');
fs.writeFileSync(tmp,script);

let passed=0,failed=0;
function assert(name,cond,detail){
  if(cond){passed++;console.log('PASS',name)}
  else{failed++;console.log('FAIL',name,detail||'')}
}

const chk=spawnSync('node',['--check',tmp],{encoding:'utf8'});
assert('inline script passes node --check',chk.status===0,chk.stderr||'');

assert('no duplicate notes in payment-form scope',(()=>{
  const start=script.indexOf("$('#payment-form').onsubmit");
  const end=script.indexOf("$('#bond-form').onsubmit",start);
  const block=script.slice(start,end);
  // Strip comments then count declarations
  const code=block.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  const decls=[...code.matchAll(/\b(?:const|let)\s+notes\b/g)];
  return decls.length===1; // only payment notes string
})());
assert('followUpNotes used for secondary payment messages',/followUpNotes/.test(script));
assert('boot timeout / fatal helpers present',/function fatal\(/.test(script)&&/__bootTimer/.test(script));
assert('showAuth / showApp present',/function showAuth\(/.test(script)&&/function showApp\(/.test(script));
assert('Loading boot element exists',/id="boot"/.test(html));
assert('auth screen exists',/id="auth"/.test(html));

// Lightweight VM boot: script should load without SyntaxError (cut before DOM wiring if needed)
const cut=script.search(/\$\('#nav'\)\.onclick|\$\("#nav"\)\.onclick|\$\('#nav'\)/);
let defs=(cut>0?script.slice(0,cut):script)
  .replace(/\blet state=/,'var state=')
  .replace(/\blet resendBusy=/,'var resendBusy=')
  .replace(/\bconst money=/,'var money=');
const store={};
const el=()=>({classList:{add(){},remove(){},toggle(){},contains:()=>false},textContent:'',innerHTML:'',style:{},disabled:false,value:'',reset(){},elements:{},onclick:null,dataset:{},addEventListener(){}});
const sandbox={
  console,Intl,JSON,Number,String,Date,Math,Promise,Error,Array,Object,Map,Set,RegExp,
  parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,
  setTimeout,clearTimeout,URLSearchParams:require('url').URLSearchParams,
  AbortController:class{constructor(){this.signal={}}abort(){}},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  document:{querySelector:el,querySelectorAll:()=>[],getElementById:el},
  window:{__bootTimer:null},
  alert(){},confirm(){return false},history:{replaceState(){}},location:{hash:'',search:'',pathname:'/',reload(){}},
  FormData:class{constructor(){this._={}}get(){return null}},
  fetch:async()=>({ok:true,status:200,text:async()=>'[]',json:async()=>[]}),
};
sandbox.global=sandbox;sandbox.globalThis=sandbox;sandbox.self=sandbox;
let bootErr=null;
try{
  vm.createContext(sandbox);
  vm.runInContext(defs,sandbox,{timeout:10000});
}catch(e){bootErr=e}
assert('script definitions load without SyntaxError',!bootErr,String(bootErr||''));
assert('getSession helper available',typeof sandbox.getSession==='function');
assert('showAuth helper available',typeof sandbox.showAuth==='function');
assert('showApp helper available',typeof sandbox.showApp==='function');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode=failed?1:0;
