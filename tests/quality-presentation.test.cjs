const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const tail=html.slice(start),end=tail.search(/\n(?:function|const|async function) /);return end<0?tail:tail.slice(0,end);}
const NOW=Date.parse('2026-10-13T14:05:00+09:00');
class Clock extends Date{static now(){return NOW}}
function harness(m={},common={}){
 const nodes={},records=new Map();let writes=0;
 const c=vm.createContext({market:m,commonSnapshot:common,Date:Clock,console,Number,JSON,
  $:id=>nodes[id]||(nodes[id]={innerHTML:'',className:''}),
  localStorage:{getItem:k=>records.get(k)??null,setItem:()=>writes++},
  setText:()=>{},currentAgeMinutes:t=>(NOW-Date.parse(t))/60000,
  fundBasisHealth:()=>({ok:false}),planConditionRows:()=>'',
 });
 vm.runInContext('const PURCHASE_STATE_KEY="india1400.purchaseProgress.v1";',c);
 for(const n of ['jstNowInfo','localTsParts','runtimeSnapshotFreshness','qualityTone','renderQualityOverview','liveFreshness','referenceHealth','purchaseRecordKnowledge','decisionDisplayEligible','defaultPurchaseState','loadPurchaseState','trancheDisplayLabel','renderTranchePlan'])vm.runInContext(fn(n),c);
 return{run:s=>vm.runInContext(s,c),nodes,records,writes:()=>writes};
}

test('generation-time FRESH is downgraded when a LIVE snapshot is stale at display time',()=>{
 const h=harness(
  {generated_at_jst:'2026-10-13T11:00:00+09:00',nifty:{as_of_jst:'2026-10-13T10:59:00+09:00'},operational_state:{code:'LIVE',regular_trading_day:true},data_quality:{},quality_state:{},acquisition_status:{code:'MISSED'}},
  {data_quality:{data_state:'FRESH',qc_state:'PASS'}}
 );
 assert.equal(h.run('runtimeSnapshotFreshness().stale'),true);
 h.run('renderQualityOverview()');
 assert.match(h.nodes.qualityTopSummary.innerHTML,/更新要確認/);
 assert.doesNotMatch(h.nodes.qualityTopSummary.innerHTML,/データ最新/);
});
test('fresh LIVE snapshot retains generation-time FRESH presentation',()=>{
 const h=harness(
  {generated_at_jst:'2026-10-13T14:04:00+09:00',nifty:{as_of_jst:'2026-10-13T14:03:00+09:00'},operational_state:{code:'LIVE',regular_trading_day:true},data_quality:{},quality_state:{},acquisition_status:{code:'CAPTURED'}},
  {data_quality:{data_state:'FRESH',qc_state:'PASS'}}
 );
 assert.equal(h.run('runtimeSnapshotFreshness().stale'),false);
 h.run('renderQualityOverview()');
 assert.match(h.nodes.qualityTopSummary.innerHTML,/データ最新/);
 assert.doesNotMatch(h.nodes.qualityTopSummary.innerHTML,/更新要確認/);
});
test('decision pills use the same runtime stale guard without changing purchase state',()=>{
 const src=fn('renderDecision');
 assert.match(src,/runtimeSnapshotFreshness\(\)\.stale/);
 assert.match(src,/保存時：/);
 assert.match(src,/判定保留（時刻確認）/);
});

test('minute clock transition refreshes stale status and purchase gating exactly once',()=>{
 const time={now:NOW},calls=[],writes=[];
 class VariableClock extends Date{static now(){return time.now}}
 const c=vm.createContext({
  Date:VariableClock,Number,JSON,
  market:{
   generated_at_jst:'2026-10-13T14:04:00+09:00',
   nifty:{as_of_jst:'2026-10-13T14:04:00+09:00'},
   operational_state:{code:'LIVE'},
   core_fetch:{nifty:{status:'fresh',fetched_this_run:true}},
   data_quality:{decision_gate:{allow_rule:true}},
   trade_guide:{decision_eligible:true},
   execution_plan:{decision_gate_allow_rule:true}
  },
  renderClockDependent:()=>calls.push('clock'),
  renderDecision:()=>calls.push('decision'),
  renderQualityOverview:()=>calls.push('quality'),
  renderPurchaseProgress:()=>calls.push('purchase'),
  renderDeepDiveTrigger:()=>calls.push('trigger'),
  localStorage:{setItem:(...args)=>writes.push(args)}
 });
 vm.runInContext('let lastClockPresentationKey=null;',c);
 for(const n of ['runtimeSnapshotFreshness','decisionDisplayEligible','clockPresentationKey'])
  vm.runInContext(fn(n),c);
 const tick=html.slice(html.indexOf('function renderClockTick(')).split('\nrefreshData(true);')[0];
 assert.match(tick,/function renderClockTick/);
 vm.runInContext(tick,c);
 assert.equal(vm.runInContext('decisionDisplayEligible(market.trade_guide,market.data_quality,market.execution_plan)',c),true);
 vm.runInContext('lastClockPresentationKey=clockPresentationKey();renderClockTick()',c);
 assert.deepEqual(calls,['clock']);
 time.now+=21*60000;
 assert.equal(vm.runInContext('decisionDisplayEligible(market.trade_guide,market.data_quality,market.execution_plan)',c),false);
 vm.runInContext('renderClockTick()',c);
 assert.deepEqual(calls,['clock','clock','decision','quality','purchase','trigger']);
 vm.runInContext('renderClockTick()',c);
 assert.deepEqual(calls,['clock','clock','decision','quality','purchase','trigger','clock']);
 assert.equal(writes.length,0);
 assert.match(html,/lastClockPresentationKey=clockPresentationKey\(\)/);
 assert.match(html,/setInterval\(renderClockTick,60000\)/);
});

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
 const h=harness({generated_at_jst:'2026-10-13T14:04:00+09:00',nifty:{as_of_jst:'2026-10-13T14:04:00+09:00'},core_fetch:{nifty:{status:'fresh',fetched_this_run:true}},data_quality:{decision_gate:{allow_rule:true}},trade_guide:{decision_eligible:true},execution_plan:{decision_gate_allow_rule:true,tranches:[{stage:2,status:'READY',conditions:[]}]}});
 h.run('renderTranchePlan()');assert.match(h.nodes.decisionTranchePlan.innerHTML,/本人確認が必要/);assert.match(h.nodes.decisionTranchePlan.innerHTML,/自動購入可ではありません/);
});
test('saved permission is withheld for stale, future or failed current inputs',()=>{
 for(const [stamp,status] of [['2026-10-12T14:04:00+09:00','fresh'],['2026-10-13T14:06:00+09:00','fresh'],['2026-10-13T14:04:00+09:00','cached']]){
  const h=harness({generated_at_jst:stamp,nifty:{as_of_jst:stamp},core_fetch:{nifty:{status,fetched_this_run:status==='fresh'}},data_quality:{decision_gate:{allow_rule:true}},trade_guide:{decision_eligible:true},execution_plan:{decision_gate_allow_rule:true,tranches:[{stage:2,status:'READY',conditions:[]}]}});
  h.run('renderTranchePlan()');assert.match(h.nodes.decisionTranchePlan.innerHTML,/HOLD・判定保留/);
 }
});

