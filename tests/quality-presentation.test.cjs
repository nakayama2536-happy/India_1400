const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const tail=html.slice(start),end=tail.search(/\n(?:function|const|async function) /);return end<0?tail:tail.slice(0,end);}
const NOW=Date.parse('2026-10-13T14:05:00+09:00');
function eligibleSnapshot(stamp){return {market_state:{code:'LIVE'},operational_state:{regular_trading_day:true},generated_at_jst:stamp,nifty:{as_of_jst:stamp},core_fetch:{nifty:{status:'fresh',fetched_this_run:true}},data_quality:{decision_gate:{allow_rule:true}},trade_guide:{decision_eligible:true},execution_plan:{decision_gate_allow_rule:true,tranches:[{stage:2,status:'READY',conditions:[]}]}}}
const eligibleCall='decisionDisplayEligible(market.trade_guide,market.data_quality,market.execution_plan)';
test('existing Core regular-session boundaries are enforced at display time',()=>{
 for(const [time,expected] of [['12:44:59',false],['12:45:00',true],['18:59:00',true],['19:00:00',true],['19:00:00.001',false],['19:05:00',false]]){
  const stamp='2026-10-13T'+time+'+09:00',h=harness(eligibleSnapshot(stamp),Date.parse(stamp));
  assert.equal(h.run(eligibleCall),expected,time);
 }
});
test('fresh 18:59 READY snapshot becomes HOLD after close without changing records',()=>{
 const m=eligibleSnapshot('2026-10-13T18:59:00+09:00'),h=harness(m,Date.parse(m.generated_at_jst));
 assert.equal(h.run(eligibleCall),true);h.setNow(Date.parse('2026-10-13T19:05:00+09:00'));
 assert.equal(h.run(eligibleCall),false);h.run('renderTranchePlan()');
 assert.match(h.nodes.decisionTranchePlan.innerHTML,/市場条件充足/);assert.match(h.nodes.decisionTranchePlan.innerHTML,/HOLD・判定保留/);assert.equal(h.writes(),0);
 assert.equal(m.execution_plan.tranches[0].status,'READY');
});
test('weekend, unverified calendar and stale dates cannot grant display permission',()=>{
 const weekend=eligibleSnapshot('2026-10-11T14:00:00+09:00');assert.equal(harness(weekend,Date.parse(weekend.generated_at_jst)).run(eligibleCall),false);
 for(const flag of [false,null,undefined,'true']){const m=eligibleSnapshot('2026-10-13T14:04:00+09:00');m.operational_state.regular_trading_day=flag;assert.equal(harness(m).run(eligibleCall),false)}
 for(const code of ['CLOSED','CALENDAR_UNVERIFIED','PREVIOUS_SESSION',undefined]){const m=eligibleSnapshot('2026-10-13T14:04:00+09:00');m.market_state.code=code;assert.equal(harness(m).run(eligibleCall),false)}
 for(const field of ['generated_at_jst','quote']){const m=eligibleSnapshot('2026-10-13T14:04:00+09:00');if(field==='quote')m.nifty.as_of_jst='2026-10-12T14:04:00+09:00';else m[field]='2026-10-12T14:04:00+09:00';assert.equal(harness(m).run(eligibleCall),false)}
});
test('clock rendering refreshes both purchase views without retrieval or storage',()=>{
 const calls=[],c=vm.createContext({market:{},checkWindowStatus:()=>({label:'',cls:'',action:''}),setText:()=>{},$:()=>({}),renderReferenceTimes:()=>{},renderDataTimes:()=>{},renderTranchePlan:()=>calls.push('plan'),renderPurchaseProgress:()=>calls.push('progress')});
 vm.runInContext(fn('renderClockDependent'),c);vm.runInContext('renderClockDependent()',c);assert.deepEqual(calls,['plan','progress']);
 assert.match(html,/visibilitychange[\s\S]*?visibilityState==="visible"&&market\)renderClockDependent\(\)/);
 assert.match(html,/setInterval\(\(\)=>\{if\(market\)renderClockDependent\(\)\},60000\)/);
});
function harness(m={},now=NOW){
 const nodes={},records=new Map();let writes=0;
 class TestClock extends Date{static now(){return now}}
 const c=vm.createContext({market:m,Date:TestClock,console,Number,JSON,
  $:id=>nodes[id]||(nodes[id]={innerHTML:''}),
  localStorage:{getItem:k=>records.get(k)??null,setItem:()=>writes++},
  setText:()=>{},currentAgeMinutes:t=>(NOW-Date.parse(t))/60000,
  fundBasisHealth:()=>({ok:false}),planConditionRows:()=>'',
 });
 vm.runInContext('const PURCHASE_STATE_KEY="india1400.purchaseProgress.v1";',c);
 for(const n of ['jstNowInfo','localTsParts','liveFreshness','referenceHealth','purchaseRecordKnowledge','decisionDisplaySessionOpen','decisionDisplayEligible','defaultPurchaseState','loadPurchaseState','renderTranchePlan'])vm.runInContext(fn(n),c);
 return{run:s=>vm.runInContext(s,c),nodes,records,writes:()=>writes,setNow:n=>{now=n}};
}
test('saved unavailable cannot become latest from a recent timestamp',()=>{
 const h=harness({generated_at_jst:'2026-10-13T14:04:00+09:00'});
 assert.equal(h.run('referenceHealth({key:"brent",as_of_jst:"2026-10-13T14:04:00+09:00",freshness_code:"UNAVAILABLE",freshness:"利用不可"}).ok'),false);
});
test('missing/future timestamp cannot be healthy',()=>{
 const h=harness();for(const stamp of [null,'invalid','2026-10-13T14:06:00+09:00']){
 assert.equal(h.run(`referenceHealth({key:"brent",as_of_jst:${JSON.stringify(stamp)},freshness:"最新"}).ok`),false);}
});
test('old holiday JSON is not today holiday permission',()=>{
 const h=harness({generated_at_jst:'2026-10-11T14:00:00+09:00',operational_state:{regular_trading_day:false}});
 assert.equal(h.run('referenceHealth({key:"brent",as_of_jst:"2026-10-11T14:00:00+09:00",freshness_code:"REFERENCE",freshness:"参考"}).ok'),false);
});
test('current quote and aged quote are distinguished',()=>{
 const h=harness();assert.equal(h.run('referenceHealth({key:"brent",as_of_jst:"2026-10-13T14:04:00+09:00",freshness:"最新"}).ok'),true);
 assert.equal(h.run('referenceHealth({key:"brent",as_of_jst:"2026-10-13T12:00:00+09:00",freshness:"最新"}).badge'),'更新推奨');
});
test('fetch failure stays unavailable even with recent cached price',()=>{
 const h=harness({core_fetch:{brent:{status:'cached',fetched_this_run:false}}});
 assert.equal(h.run('referenceHealth({key:"brent",as_of_jst:"2026-10-13T14:04:00+09:00",freshness:"最新"}).badge'),'利用不可');
});
test('unavailable provisional not promoted',()=>{
 const h=harness({nifty:{provisional:{available:false}}});
 assert.equal(h.run('referenceHealth({key:"nifty_provisional",as_of_jst:"2026-10-13T14:04:00+09:00",freshness:"最新"}).ok'),false);
});
test('READY card explicitly retains HOLD and unknown purchase state without writes',()=>{
 const h=harness({data_quality:{decision_gate:{allow_rule:false},reasons:['取引時間外']},trade_guide:{decision_eligible:false},execution_plan:{decision_gate_allow_rule:false,tranches:[{stage:2,status:'READY',label:'短期反転',conditions:[],hold_reason:'表示条件はすべて充足'}]}});
 h.run('renderTranchePlan()');const text=h.nodes.decisionTranchePlan.innerHTML;
 assert.match(text,/市場条件充足/);assert.match(text,/HOLD・判定保留/);assert.match(text,/取引時間外/);assert.match(text,/購入記録未確認/);assert.doesNotMatch(text,/未購入/);assert.equal(h.writes(),0);
});
test('corrupt and missing purchase records stay unknown and preserved',()=>{
 const h=harness();for(const raw of [null,'{','[]','{"t1":"true","t2":false,"t3":false}']){
 h.records.set('india1400.purchaseProgress.v1',raw);assert.equal(h.run('purchaseRecordKnowledge()'),false);assert.equal(h.records.get('india1400.purchaseProgress.v1'),raw);}
 assert.equal(h.writes(),0);
});
test('legacy boolean purchase records remain known without migration',()=>{
 const h=harness(),s='{"t1":true,"t2":false,"t3":false}';h.records.set('india1400.purchaseProgress.v1',s);
 assert.equal(h.run('purchaseRecordKnowledge()'),true);assert.equal(h.records.get('india1400.purchaseProgress.v1'),s);assert.equal(h.writes(),0);
});
test('even eligible READY never authorizes orders or assumes funding',()=>{
 const h=harness({market_state:{code:'LIVE'},operational_state:{regular_trading_day:true},generated_at_jst:'2026-10-13T14:04:00+09:00',nifty:{as_of_jst:'2026-10-13T14:04:00+09:00'},core_fetch:{nifty:{status:'fresh',fetched_this_run:true}},data_quality:{decision_gate:{allow_rule:true}},trade_guide:{decision_eligible:true},execution_plan:{decision_gate_allow_rule:true,tranches:[{stage:2,status:'READY',conditions:[]}]}});
 h.run('renderTranchePlan()');assert.match(h.nodes.decisionTranchePlan.innerHTML,/本人確認が必要/);assert.match(h.nodes.decisionTranchePlan.innerHTML,/自動購入可ではありません/);
});
test('saved permission is withheld for stale, future or failed current inputs',()=>{
 for(const [stamp,status] of [['2026-10-12T14:04:00+09:00','fresh'],['2026-10-13T14:06:00+09:00','fresh'],['2026-10-13T14:04:00+09:00','cached']]){
  const h=harness({generated_at_jst:stamp,nifty:{as_of_jst:stamp},core_fetch:{nifty:{status,fetched_this_run:status==='fresh'}},data_quality:{decision_gate:{allow_rule:true}},trade_guide:{decision_eligible:true},execution_plan:{decision_gate_allow_rule:true,tranches:[{stage:2,status:'READY',conditions:[]}]}});
  h.run('renderTranchePlan()');assert.match(h.nodes.decisionTranchePlan.innerHTML,/HOLD・判定保留/);
 }
});
