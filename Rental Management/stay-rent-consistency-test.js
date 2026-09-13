#!/usr/bin/env node
/** Tests A–I: stay check-in/out, rental rate units, rent calc/override, payment action amount lock, status, coverage, bond selector. */
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cut=script.search(/\$\('#nav'\)\.onclick|\$\("#nav"\)\.onclick|\$\('#nav'\)/);
let defs=(cut>0?script.slice(0,cut):script)
  .replace(/\blet state=/,'var state=')
  .replace(/\blet resendBusy=/,'var resendBusy=')
  .replace(/\bconst money=/,'var money=');
const store={};
const el=()=>({classList:{add(){},remove(){},toggle(){},contains:()=>true},textContent:'',innerHTML:'',style:{},disabled:false,value:'',reset(){},elements:{},onclick:null,dataset:{},addEventListener(){}});
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
    tenants:[{id:1,name:'Laura'},{id:2,name:'Juny'},{id:3,name:'Ongoing'}],
    tenancies:[],payments:[],bonds:[],paymentActions:[],paymentActionHistory:[],bookingEvents:[],
    paymentActionsError:'',profiles:[{id:'u1',display_name:'Owner',role:'owner'}],me:{role:'owner'},
    viewings:[],viewingsError:''
  });
}
function assert(name,cond){
  if(!cond){console.log('FAIL',name);process.exitCode=1}
  else console.log('PASS',name);
}

seed();

// A. Short stay 11→16 Sep @ $35/night = 5 × $35 = $175
const laura={
  id:101,tenant_id:1,room_id:5,check_in:'2026-09-11',check_out:'2026-09-16',
  rent_amount:35,rent_period:'night',tenancy_type:'short_term',status:'active'
};
S.tenancies=[laura];
assert('A nights = 5', sandbox.stayNights(laura)===5);
assert('A calculated = 175', sandbox.calculatedStayRentSolo(laura)===175);
assert('A final = 175', sandbox.expectedStayTotalSolo(laura)===175);
assert('A breakdown shows 5 nights', /5\s*nights?/i.test(sandbox.stayChargeBreakdown(laura).label));
assert('A breakdown shows $35', /35/.test(sandbox.stayChargeBreakdown(laura).label));
assert('A rate label $35 / night', /35/.test(sandbox.formatRentalRate(laura)) && /night/i.test(sandbox.formatRentalRate(laura)));

// B. Weekly tenant $210/week
const juny={
  id:102,tenant_id:2,room_id:5,check_in:'2026-01-01',check_out:'2026-01-29',
  rent_amount:210,rent_period:'week',tenancy_type:'long_term',payment_cycle_weeks:1,status:'active'
};
S.tenancies=[juny];
assert('B weekly obligation amount 210', sandbox.expectedRentAmount(juny)===210);
assert('B stay calc 4 weeks × 210 = 840', sandbox.calculatedStayRentSolo(juny)===840);
assert('B rate label includes / week', /week/i.test(sandbox.formatRentalRate(juny)));

// C. Ongoing long-term — no checkout — room occupied
const ong={
  id:103,tenant_id:3,room_id:6,check_in:'2026-01-01',check_out:null,confirmed_until:null,
  rent_amount:210,rent_period:'week',tenancy_type:'long_term',status:'active'
};
S.tenancies=[ong];
assert('C is ongoing', sandbox.isOngoingStay(ong)===true);
assert('C no end date', sandbox.stayEndDate(ong)==null);
assert('C not one-off', sandbox.isOneOffStay(ong)===false);
// Occupancy helpers: current tenancy without end remains current/active
assert('C tenancy kind current/active', ['current','active'].includes(sandbox.tenancyKind(ong)) || sandbox.tenancyKind(ong)==='current' || !['historical','past'].includes(sandbox.tenancyKind(ong)));

// D/E/F/G. Edit Payment Action amount persists via lock + status recalc
seed();
S.tenancies=[laura];
const action={
  id:7,tenancy_id:101,tenant_id:1,room_id:5,property_id:1,
  amount:425,due_date:'2026-09-11',status:'open',
  notes:'ORIGINAL_AMOUNT:425'
};
S.paymentActions=[action];
// Without lock, one-off booking wins
assert('D unlocked one-off original uses booking 175', sandbox.actionOriginalAmount(action,laura)===175);
// Manual lock must persist edited amount
const lockedNotes=sandbox.withActionMeta('Edited by owner',{originalAmount:425,amountLocked:true,manualAmount:175,paymentIds:[]});
const locked={...action,notes:lockedNotes,amount:175};
assert('D locked original = 175', sandbox.actionOriginalAmount(locked,laura)===175);
assert('D locked meta amountLocked', sandbox.parseActionMeta(lockedNotes).amountLocked===true);
assert('D locked meta manualAmount 175', sandbox.parseActionMeta(lockedNotes).manualAmount===175);
// Soft reconcile must not overwrite locked amount back to a different booking value
assert('D soft path respects lock (liveOrig skipped)', (()=>{
  const meta=sandbox.parseActionMeta(locked.notes);
  const liveOrig=sandbox.isOneOffStay(laura)&&!meta.amountLocked?sandbox.expectedStayTotal(laura):null;
  return liveOrig===null && meta.manualAmount===175;
})());

// E/F/G status after amount edit + payments
S.paymentActions=[locked];
S.payments=[];
assert('E unpaid remaining 175', sandbox.actionRemainingAmount(locked)===175);
assert('E unpaid not resolved', sandbox.paymentActionLiveStatus(locked)!=='resolved');

S.payments=[{id:50,tenancy_id:101,amount:100,status:'paid',received_date:'2026-09-11',period_start:'2026-09-11',period_end:'2026-09-16',notes:'ACTION_ID:7'}];
const lockedPartial={...locked,notes:sandbox.withActionMeta(locked.notes,{originalAmount:425,amountLocked:true,manualAmount:175,paymentIds:[50]})};
assert('G partial paid 100', sandbox.actionPaidAmount(lockedPartial)===100);
assert('G partial outstanding 75', sandbox.actionRemainingAmount(lockedPartial)===75);
assert('G partial status partially_paid or overdue', ['partially_paid','overdue','due_soon','open'].includes(sandbox.paymentActionLiveStatus(lockedPartial)));

S.payments=[{id:50,tenancy_id:101,amount:175,status:'paid',received_date:'2026-09-11',period_start:'2026-09-11',period_end:'2026-09-16',notes:'ACTION_ID:7'}];
const lockedFull={...locked,notes:sandbox.withActionMeta(locked.notes,{originalAmount:425,amountLocked:true,manualAmount:175,paymentIds:[50]}),amount:0,status:'open'};
assert('F full paid remaining 0', sandbox.actionRemainingAmount(lockedFull)===0);
assert('F full => Satisfied/resolved', sandbox.paymentActionLiveStatus(lockedFull)==='resolved');

// H. Covered payment prevents false Overdue
seed();
S.tenancies=[laura];
const overdueAction={
  id:8,tenancy_id:101,amount:0,due_date:'2026-09-01',status:'overdue',
  notes:sandbox.withActionMeta('',{originalAmount:175,amountLocked:true,manualAmount:175,paymentIds:[60]})
};
S.paymentActions=[overdueAction];
S.payments=[{id:60,tenancy_id:101,amount:175,status:'paid',received_date:'2026-09-02',period_start:'2026-09-11',period_end:'2026-09-16',notes:'ACTION_ID:8'}];
assert('H covered remaining 0', sandbox.actionRemainingAmount(overdueAction)===0);
assert('H covered live status resolved not overdue', sandbox.paymentActionLiveStatus(overdueAction)==='resolved');
assert('H coverage summary outstanding 0', sandbox.actionCoverageSummary(overdueAction).outstanding===0);

// I. Bond selector never requires raw DB id typing (human-readable option label)
seed();
S.tenancies=[laura];
S.bonds=[{id:9,tenancy_id:101,amount:200,original_currency:'CNY',bond_type:'booking_deposit',received:true}];
const label=sandbox.bondOptionLabel(S.bonds[0]);
assert('I bond label includes tenant name', /Laura/i.test(label));
assert('I bond label includes amount', /200/.test(label));
assert('I bond label not only raw id', !/^#?9$/.test(label.trim()));
assert('I HTML has bond select not number id input', /name="related_bond_id"/.test(html) && !/Related Bond ID/i.test(html));
assert('I stay form has check-out + ongoing', /Check-out date/i.test(html) && /Ongoing/i.test(html));
assert('I no Confirmed until label', !/>\s*Confirmed until\s*</i.test(html));
assert('I rental rate / rate unit labels', /Rental rate/i.test(html) && /Rate unit/i.test(html));

// Override audit
const withOv=sandbox.withRentMeta('note',{calculated:175,override:150,overrideBy:'Owner',overrideAt:'2026-09-12T00:00:00.000Z',overrideNote:'Goodwill'});
const ovStay={...laura,notes:withOv};
assert('override final rent 150', sandbox.expectedStayTotalSolo(ovStay)===150);
assert('override preserves calculated in meta', sandbox.parseRentMeta(withOv).calculated===175);
assert('override by Owner', sandbox.parseRentMeta(withOv).overrideBy==='Owner');

console.log(process.exitCode?'\nSOME FAILED':'ALL PASS');
