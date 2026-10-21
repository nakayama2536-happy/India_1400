const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const tail=html.slice(start),end=tail.search(/\n(?:function|const|async function) /);return end<0?tail:tail.slice(0,end)}
function fixture({regular=false,complete=false}={}){
 const m={status:'ok',generated_at_jst:'2026-10-20T14:04:36+09:00',operational_state:{code:regular?'LIVE':'CLOSED',regular_trading_day:regular},core_fetch:{usdinr:{status:'fresh',fetched_this_run:true},usdjpy:{status:'fresh',fetched_this_run:true}},reference_data:{items:[]},usdjpy:{price:158.2045,as_of_jst:'2026-10-20T13:58:00+09:00',change_5d_pct:null},usdinr:{price:94.9312,as_of_jst:'2026-10-20T13:59:00+09:00',change_5d_pct:null},inrjpy:{price:1.66652,as_of_jst:'2026-10-20T13:58:00+09:00',change_5d_pct:null},yen_effect:{available:false,fx_contribution_pt:null,stock_return_pct:2.35,horizon:'5営業日概算'}};
 for(const key of ['usdjpy','usdinr','inrjpy'])m.reference_data.items.push({key,as_of_jst:m[key].as_of_jst,freshness_code:regular?'LATEST':'REFERENCE'});
 if(complete){m.usdjpy.change_5d_pct=1;m.usdinr.change_5d_pct=0;m.inrjpy.change_5d_pct=1;m.yen_effect.available=true;m.yen_effect.fx_contribution_pt=1.02}
 return m;
}
function harness(m=fixture(),time='2026-10-20T17:59:00+09:00'){
 let now=Date.parse(time);const nodes={},writes=[];class Clock extends Date{static now(){return now}}
 const c=vm.createContext({market:m,indiaCore:null,Date:Clock,Number,JSON,$:id=>nodes[id]||(nodes[id]={}),setText:(id,text)=>(nodes[id]||(nodes[id]={})).text=text,localStorage:{setItem:(...a)=>writes.push(a)},checkWindowStatus:()=>({label:'test',cls:'warn',action:'test'}),renderReferenceTimes:()=>{},renderDataTimes:()=>{}});
 for(const name of ['jstNowInfo','localTsParts','currentHoliday','hasFiniteValue','fmt','fmtJstShort','signed','statusTileHtml','referenceText','referenceTimestamp','referenceUpdateSchedule','fundBasisHealth','sharedReferenceItems','referencePresentation','yenMissingReason','yenContributionPresentation','renderYenContext','renderClockDependent'])vm.runInContext(fn(name),c);
 return{render(){vm.runInContext('renderYenContext()',c);return nodes.yenMetrics.innerHTML},run:s=>vm.runInContext(s,c),setNow:t=>{now=Date.parse(t)},nodes,writes,c};
}
function tiles(rendered){return rendered.split('<div class="status-tile ').slice(1).map(s=>({tone:s.slice(0,s.indexOf('"')),html:s}))}
test('screenshot: three saved rates and absent five-day history are all yellow, with explicit units/times',()=>{
 const m=fixture(),before=JSON.stringify(m),h=harness(m),xs=tiles(h.render());assert.equal(xs.length,4);assert.deepEqual(xs.map(t=>t.tone),['warn','warn','warn','warn']);
 for(const [i,pattern] of [[0,/1ルピー（INR）.*1\.6665円/],[1,/1ドル（USD\/JPY）.*158\.205円/],[2,/1ドル（USD\/INR）.*94\.9312ルピー/]])assert.match(xs[i].html,pattern);
 for(const i of [0,1,2])assert.match(xs[i].html,/10\/20 13:5[89] JST/);
 assert.match(xs[3].html,/未算出（履歴不足）/);assert.match(xs[3].html,/>--<\/div>/);assert.doesNotMatch(xs[3].html,/0\.00pt/);assert.match(h.nodes.yenSummary.text,/USD\/JPY・USD\/INR/);assert.equal(JSON.stringify(m),before);assert.equal(h.writes.length,0);
});
test('currency cards have exactly the same color and status as shared reference cards',()=>{
 const m=fixture({regular:true,complete:true}),h=harness(m,'2026-10-20T14:59:59+09:00');
 for(const time of ['2026-10-20T14:59:59+09:00','2026-10-20T15:00:00+09:00','2026-10-20T20:10:00+09:00']){
  h.setNow(time);const xs=tiles(h.render());for(const [i,key] of ['inrjpy','usdjpy','usdinr'].entries()){const p=h.run('referencePresentation(sharedReferenceItems().find(x=>x.key==="'+key+'"))');assert.equal(xs[i].tone,p.tone);assert.ok(xs[i].html.includes(p.label))}
 }
});
test('actual minute refresh changes green to yellow at 15:00 and red at missed evening deadline',()=>{
 const h=harness(fixture({regular:true,complete:true}),'2026-10-20T14:59:00+09:00');assert.deepEqual(tiles(h.render()).map(t=>t.tone),['good','good','good','good']);
 h.setNow('2026-10-20T15:00:00+09:00');h.run('renderClockDependent()');assert.deepEqual(tiles(h.nodes.yenMetrics.innerHTML).map(t=>t.tone),['warn','warn','warn','warn']);
 h.setNow('2026-10-20T20:10:00+09:00');h.run('renderClockDependent()');assert.deepEqual(tiles(h.nodes.yenMetrics.innerHTML).map(t=>t.tone),['bad','bad','bad','bad']);assert.match(h.nodes.yenSummary.text,/予定更新が未反映/);assert.equal(h.writes.length,0);
});
test('fetch failure remains red even during a holiday and even with absent history',()=>{
 const m=fixture();m.core_fetch.usdjpy={status:'cached',fetched_this_run:false,error:'429'};const h=harness(m),xs=tiles(h.render());assert.equal(xs[0].tone,'bad');assert.equal(xs[1].tone,'bad');assert.equal(xs[2].tone,'warn');assert.equal(xs[3].tone,'bad');assert.match(xs[3].html,/未算出（更新・取得要確認）/);assert.match(h.nodes.yenSummary.text,/取得失敗/);
});
test('missing rate and invalid timestamp are errors, not missing-history warnings',()=>{
 for(const mode of ['price','stamp']){const m=fixture();if(mode==='price')m.usdinr.price=null;else m.reference_data.items.find(x=>x.key==='usdinr').as_of_jst='invalid';const h=harness(m),xs=tiles(h.render());assert.equal(xs[2].tone,'bad');assert.equal(xs[3].tone,'bad')}
});
test('positive, negative and actual zero contributions keep data-state color, with textual direction',()=>{
 for(const [value,text,number] of [[1.02,'プラス','+1.02pt'],[-1.02,'マイナス','-1.02pt'],[0,'中立','0.00pt']]){
  const m=fixture({regular:true,complete:true});m.yen_effect.fx_contribution_pt=value;const h=harness(m,'2026-10-20T14:30:00+09:00'),x=tiles(h.render())[3];assert.equal(x.tone,'good');assert.ok(x.html.includes(number));assert.ok(x.html.includes('円換算に'+text));assert.doesNotMatch(x.html,/sign-neg|sign-pos|sign-zero/);
  h.setNow('2026-10-20T16:00:00+09:00');assert.equal(tiles(h.render())[3].tone,'warn');
 }
});
test('all-zero history and a computed zero remain valid',()=>{
 const m=fixture({regular:true,complete:true});for(const key of ['usdjpy','usdinr','inrjpy'])m[key].change_5d_pct=0;m.yen_effect.stock_return_pct=0;m.yen_effect.fx_contribution_pt=0;const x=tiles(harness(m,'2026-10-20T14:30:00+09:00').render())[3];assert.equal(x.tone,'good');assert.match(x.html,/0\.00pt/);assert.match(x.html,/中立/);
});
test('one missing currency history or stock history is yellow; derived/calculation output missing is red',()=>{
 for(const key of ['usdjpy','usdinr','stock','derived','result']){const m=fixture({regular:true,complete:true});m.yen_effect.fx_contribution_pt=null;m.yen_effect.available=false;if(['usdjpy','usdinr'].includes(key))m[key].change_5d_pct=null;if(key==='stock')m.yen_effect.stock_return_pct=null;if(key==='derived')m.inrjpy.change_5d_pct=null;const x=tiles(harness(m,'2026-10-20T14:30:00+09:00').render())[3];assert.equal(x.tone,['derived','result'].includes(key)?'bad':'warn',key);assert.match(x.html,/未算出/)}
});
test('malformed calculation values and contradictory available flags stay red',()=>{
 for(const value of [NaN,Infinity,'invalid',false]){const m=fixture({complete:true});m.yen_effect.fx_contribution_pt=value;const h=harness(m),x=tiles(h.render())[3];assert.equal(x.tone,'bad');assert.match(x.html,/計算データ異常/);assert.doesNotMatch(x.html,/>NaN|>Infinity|0\.00pt/)}
 const m=fixture({complete:true});m.yen_effect.available=false;assert.equal(tiles(harness(m).render())[3].tone,'bad');m.yen_effect.available=true;m.usdinr.change_5d_pct=null;assert.match(tiles(harness(m).render())[3].html,/計算状態の不整合/);
});
test('external text is escaped in tiles and assigned as plain summary text',()=>{
 const m=fixture({complete:true});m.yen_effect.horizon='<img onerror=alert(1)>';m.yen_effect.warning='<script>alert(1)</script>';const h=harness(m);assert.doesNotMatch(h.render(),/<img|<script/);assert.match(h.nodes.yenMetrics.innerHTML,/&lt;img/);assert.ok(h.nodes.yenSummary.text.includes('<script>'));
});
test('explanation identifies already-JPY NAV and separates data colors from return signs',()=>{
 assert.match(html,/<h2>為替の影響（参考）<\/h2>/);assert.match(html,/基準価額は既に円建て/);assert.match(html,/プラス／マイナスは数値と文章で示し/);assert.match(html,/0では埋めません/);assert.doesNotMatch(fn('renderYenContext'),/referenceHealth|signClass/);
});
