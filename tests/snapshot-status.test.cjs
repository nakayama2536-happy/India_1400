const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const tail=html.slice(start),end=tail.search(/\n(?:function|const|async function) /);return end<0?tail:tail.slice(0,end)}
const now=Date.parse('2026-10-20T16:35:00+09:00');
function harness(m){const nodes={};class Clock extends Date{static now(){return now}}const c=vm.createContext({market:m,commonSnapshot:null,Date:Clock,Number,JSON,hasFiniteValue:x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x)),$:id=>nodes[id]||(nodes[id]={}),setText:(id,text)=>(nodes[id]||(nodes[id]={})).text=text,fmtJstShort:x=>x,evaluateDeepDiveTriggers:()=>{},currentDeepDiveTriggerContext:()=>({level_code:'NONE',level_label:'深掘り不要',active_count:0,categories:[{key:'DATA_QUALITY',label:'データ品質',active:false,severity:0,summary:'休場・時間外は参考値として扱う'}]}),statusTileHtml:(...a)=>a.join('|')});for(const n of ['jstNowInfo','localTsParts','currentHoliday','trancheDisplayLabel','yenMissingReason','checkWindowStatus','decisionDisplaySessionOpen','decisionDisplayEligible','renderDeepDiveTrigger'])vm.runInContext(fn(n),c);return{run:s=>vm.runInContext(s,c),nodes,c}}
function holiday(){return{generated_at_jst:'2026-10-20T14:04:36+09:00',operational_state:{code:'CLOSED',regular_trading_day:false},acquisition_status:{date_jst:'2026-10-20',code:'NOT_APPLICABLE',detail:'Dussehra'}}}
test('holiday title requires same-day explicit CLOSED evidence',()=>{assert.equal(harness(holiday()).run('currentHoliday()'),true);for(const stamp of ['2026-10-19T14:00:00+09:00','2026-10-20T17:00:00+09:00','invalid']){const m=holiday();m.generated_at_jst=stamp;assert.equal(harness(m).run('currentHoliday()'),false)}const m=holiday();m.operational_state.code='DATA_ERROR';assert.equal(harness(m).run('currentHoliday()'),false)});
test('holiday next action includes an action and the holiday reason',()=>{const h=harness(holiday());assert.match(h.run('checkWindowStatus().action'),/次回営業日.*14:00.*Dussehra/)});
test('untrusted holiday evidence asks for verification instead of waiting for the next session',()=>{
 for(const stamp of ['2026-10-19T14:00:00+09:00','2026-10-20T17:00:00+09:00','invalid']){
  const m=holiday();m.generated_at_jst=stamp;const h=harness(m);
  assert.equal(h.run('checkWindowStatus().cls'),'ng');
  assert.match(h.run('checkWindowStatus().action'),/休場情報の日時・市場状態を確認/);
  assert.doesNotMatch(h.run('checkWindowStatus().action'),/次回営業日の14:00/);
 }
 for(const state of [{code:'LIVE',regular_trading_day:true},{code:'DATA_ERROR',regular_trading_day:false}]){
  const m=holiday();m.operational_state=state;assert.equal(harness(m).run('checkWindowStatus().cls'),'ng');
 }
});
test('non-holiday acquisition status keeps its existing action',()=>{
 const m=holiday();m.operational_state={code:'LIVE',regular_trading_day:true};m.acquisition_status={date_jst:'2026-10-20',code:'MISSED',detail:'定点欠測を確認してください'};
 const h=harness(m);assert.equal(h.run('checkWindowStatus().label'),'14:00定点 欠測');assert.equal(h.run('checkWindowStatus().action'),'定点欠測を確認してください');
});
test('tranche label appears once for prefixed or bare labels',()=>{const h=harness({});assert.equal(h.run('trancheDisplayLabel(1,"第1弾・反転初期")'),'第1弾・反転初期');assert.equal(h.run('trancheDisplayLabel(2,"短期反転")'),'第2弾・短期反転')});
test('FX spot availability never hides missing five-day returns',()=>{const h=harness({usdjpy:{price:158,change_5d_pct:null},usdinr:{price:95,change_5d_pct:null},yen_effect:{available:false}});assert.match(h.run('yenMissingReason()'),/USD\/JPY・USD\/INR.*5日変化/)});
test('one missing FX leg is named and zero returns remain valid',()=>{const h=harness({usdjpy:{change_5d_pct:0},usdinr:{change_5d_pct:null}});assert.match(h.run('yenMissingReason()'),/^USD\/INR/);assert.doesNotMatch(h.run('yenMissingReason()'),/USD\/JPY/)});
test('missing derived return and stock return have separate explanations',()=>{const m={usdjpy:{change_5d_pct:0},usdinr:{change_5d_pct:0}};assert.match(harness(m).run('yenMissingReason()'),/^INR\/JPY/);m.inrjpy={change_5d_pct:0};assert.match(harness(m).run('yenMissingReason()'),/^NIFTY/);m.yen_effect={fx_contribution_pt:0};assert.equal(harness(m).run('yenMissingReason()'),'')});
test('no trigger during holiday does not certify data health or purchase permission',()=>{const h=harness(holiday());h.run('renderDeepDiveTrigger()');assert.equal(h.nodes.deepDiveTriggerLevel.text,'保存データではトリガーなし');assert.match(h.nodes.deepDiveTriggerCategories.innerHTML,/非該当（保存時点）/);assert.doesNotMatch(h.nodes.deepDiveTriggerCategories.innerHTML,/OFF \/ 正常/);assert.match(h.nodes.deepDiveTriggerCard.className,/warn/);assert.match(h.nodes.deepDiveTriggerReasons.innerHTML,/鮮度・不足データ/)});
test('critical trigger remains priority even when today is a holiday',()=>{const h=harness(holiday());vm.runInContext('currentDeepDiveTriggerContext=()=>({level_code:"PRIORITY",level_label:"深掘り優先",active_count:1,categories:[{active:true,severity:2,label:"データ品質"}],reasons:["重大QC異常"]})',h.c);h.run('renderDeepDiveTrigger()');assert.equal(h.nodes.deepDiveTriggerLevel.text,'深掘り優先');assert.match(h.nodes.deepDiveTriggerCard.className,/ng/);assert.match(h.nodes.deepDiveTriggerReasons.innerHTML,/重大QC異常/)});
