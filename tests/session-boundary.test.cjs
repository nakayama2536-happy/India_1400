const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const tail=html.slice(start),end=tail.search(/\n(?:function|async function) /);return end<0?tail:tail.slice(0,end)}
const KEY='india1400.purchaseProgress.v1';
function snapshot(stamp='2026-10-21T18:59:00+09:00'){
 return {generated_at_jst:stamp,nifty:{as_of_jst:stamp},market_state:{code:'LIVE'},operational_state:{code:'LIVE',label:'取引中',regular_trading_day:true},core_fetch:{nifty:{status:'fresh',fetched_this_run:true}},data_quality:{decision_gate:{allow_rule:true,label:'売買ルール判定可能'},reasons:[]},trade_guide:{decision_eligible:true,action_label:'第2弾を確認',market_stage_code:'BUY2',market_stage_label:'第2弾相当'},execution_plan:{decision_gate_allow_rule:true,tranches:[{stage:2,status:'READY',conditions:[]}]}};
}
function harness(m=snapshot(),now='2026-10-21T19:05:00+09:00'){
 const time={now:Date.parse(now)},nodes={},records=new Map([[KEY,'{"t1":true,"t2":false,"t3":false}']]),calls=[];let writes=0,fetches=0;
 class Clock extends Date{static now(){return time.now}}
 const c=vm.createContext({market:m,commonSnapshot:null,Date:Clock,Number,JSON,console,
  $:id=>nodes[id]||(nodes[id]={innerHTML:'',className:'',style:{}}),setText:(id,text)=>(nodes[id]||(nodes[id]={})).textContent=text,
  localStorage:{getItem:k=>records.get(k)??null,setItem:()=>writes++},fetch:()=>fetches++,
  currentHoliday:()=>false,fmtJstShort:x=>x,planConditionRows:()=>'',forecastCard:()=>'',
  renderConditionDetails:()=>calls.push('reasons'),renderIndiaCore:()=>{},renderYenContext:()=>{},renderClockDependent:()=>{},
  renderQualityOverview:()=>calls.push('quality'),renderPurchaseProgress:()=>calls.push('purchase'),renderDeepDiveTrigger:()=>calls.push('trigger')
 });
 vm.runInContext('const PURCHASE_STATE_KEY="india1400.purchaseProgress.v1";let lastClockPresentationKey=null;',c);
 for(const n of ['purchaseRecordKnowledge','decisionDisplaySessionOpen','decisionDisplayEligible','defaultPurchaseState','loadPurchaseState','firstPendingTranche','stageLevel','purchaseNextText','trancheDisplayLabel','renderTranchePlan','runtimeSnapshotFreshness','renderDecision','clockPresentationKey']){
  // Allows the first regression to reproduce the pre-fix eligibility bug on main.
  if(n==='decisionDisplaySessionOpen'&&!html.includes('function '+n+'('))continue;
  vm.runInContext(fn(n),c);
 }
 return{m,time,nodes,records,c,calls,run:s=>vm.runInContext(s,c),writes:()=>writes,fetches:()=>fetches};
}
const eligible='decisionDisplayEligible(market.trade_guide,market.data_quality,market.execution_plan)';
test('fresh 18:59 snapshot cannot retain purchase eligibility at 19:05',()=>{
 const h=harness();assert.equal(h.run(eligible),false);
});
test('Core inclusive regular-session boundaries are preserved without a 14:00-only gate',()=>{
 for(const [stamp,expected] of [['12:44:59.999',false],['12:45:00.000',true],['14:00:00.000',true],['14:21:00.000',true],['18:59:59.999',true],['19:00:00.000',true],['19:00:00.001',false],['19:05:00.000',false]]){
  const t='2026-10-21T'+stamp+'+09:00',h=harness(snapshot(t),t);assert.equal(h.run(eligible),expected,stamp);
 }
});
test('holiday, weekend, calendar unknown and non-LIVE evidence cannot grant permission',()=>{
 for(const mutate of [m=>m.operational_state.regular_trading_day=false,m=>delete m.operational_state.regular_trading_day,m=>m.operational_state.regular_trading_day='true',m=>m.market_state.code='PREVIOUS_SESSION',m=>delete m.market_state]){
  const m=snapshot('2026-10-21T14:00:00+09:00');mutate(m);assert.equal(harness(m,'2026-10-21T14:01:00+09:00').run(eligible),false);
 }
 for(const day of ['2026-10-24','2026-10-25']){const t=day+'T14:00:00+09:00';assert.equal(harness(snapshot(t),t).run(eligible),false)}
});
test('same JST date and every saved gate, freshness and fetch guard remain mandatory',()=>{
 const stamp='2026-10-21T14:00:00+09:00';
 for(const mutate of [m=>m.data_quality.decision_gate.allow_rule=false,m=>m.trade_guide.decision_eligible=false,m=>m.execution_plan.decision_gate_allow_rule=false,m=>m.core_fetch.nifty.status='cached',m=>m.core_fetch.nifty.fetched_this_run=false,m=>m.nifty.as_of_jst='2026-10-21T14:06:00+09:00',m=>m.generated_at_jst='2026-10-20T14:00:00+09:00',m=>m.nifty.as_of_jst='invalid']){
  const m=snapshot(stamp);mutate(m);assert.equal(harness(m,'2026-10-21T14:05:00+09:00').run(eligible),false);
 }
 assert.equal(harness(snapshot(stamp),'2026-10-21T14:20:00+09:00').run(eligible),true);
 assert.equal(harness(snapshot(stamp),'2026-10-21T14:20:00.001+09:00').run(eligible),false);
 assert.equal(harness(snapshot('2026-10-21T23:59:00+09:00'),'2026-10-22T00:01:00+09:00').run(eligible),false);
});
test('post-close decision, gate, READY tranche and purchase summary consistently say HOLD',()=>{
 const h=harness(),before=JSON.stringify(h.m),record=h.records.get(KEY);h.run('renderDecision()');
 assert.match(h.nodes.actionLabel.textContent,/判定保留/);assert.match(h.nodes.qualityGate.textContent,/判定保留/);assert.match(h.nodes.qualityGate.className,/warn/);assert.match(h.nodes.marketState.textContent,/保存時.*判定保留/);assert.match(h.nodes.marketState.className,/warn/);
 assert.match(h.nodes.decisionTranchePlan.innerHTML,/市場条件充足/);assert.match(h.nodes.decisionTranchePlan.innerHTML,/HOLD・判定保留/);assert.match(h.nodes.decisionTranchePlan.innerHTML,/通常取引時間外/);
 assert.match(h.run('purchaseNextText(loadPurchaseState(),market.trade_guide,market.data_quality,market.operational_state,market.execution_plan).reason'),/通常取引時間.*保留/);
 assert.equal(h.run('market.execution_plan.tranches[0].status'),'READY');assert.equal(JSON.stringify(h.m),before);assert.equal(h.records.get(KEY),record);assert.equal(h.writes(),0);assert.equal(h.fetches(),0);
});
test('live eligible display and unknown personal progress stay distinct',()=>{
 const t='2026-10-21T14:00:00+09:00',h=harness(snapshot(t),t);h.run('renderDecision()');assert.equal(h.nodes.actionLabel.textContent,'第2弾を確認');assert.match(h.nodes.qualityGate.className,/ok/);assert.match(h.nodes.decisionTranchePlan.innerHTML,/本人確認が必要/);
 h.records.clear();assert.equal(h.run('purchaseNextText(loadPurchaseState(),market.trade_guide,market.data_quality,market.operational_state,market.execution_plan).title'),'購入進捗未確認');assert.equal(h.writes(),0);
});
test('clock and foreground return refresh the close boundary without fetching or writing',()=>{
 const h=harness(snapshot(),'2026-10-21T18:59:30+09:00'),listeners={};h.c.document={visibilityState:'hidden',addEventListener:(name,callback)=>listeners[name]=callback};
 const tick=html.slice(html.indexOf('function renderClockTick('),html.indexOf('\nrefreshData(true);'));vm.runInContext(tick,h.c);
 const listener=html.split('\n').find(line=>line.startsWith('document.addEventListener("visibilitychange"'));assert.ok(listener);vm.runInContext(listener,h.c);
 h.run('lastClockPresentationKey=clockPresentationKey()');h.time.now=Date.parse('2026-10-21T19:00:01+09:00');listeners.visibilitychange();assert.deepEqual(h.calls,[]);
 h.c.document.visibilityState='visible';listeners.visibilitychange();assert.match(h.nodes.qualityGate.textContent,/判定保留/);assert.deepEqual(h.calls,['reasons','quality','purchase','trigger']);
 h.run('renderClockTick()');assert.deepEqual(h.calls,['reasons','quality','purchase','trigger']);assert.equal(h.writes(),0);assert.equal(h.fetches(),0);
});
