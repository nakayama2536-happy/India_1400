const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const tail=html.slice(start),end=tail.search(/\n(?:function|const|async function) /);return end<0?tail:tail.slice(0,end)}
const NOW=Date.parse('2026-10-20T15:51:00+09:00');
function fixture(){return {generated_at_jst:'2026-10-20T14:04:36+09:00',operational_state:{regular_trading_day:false},core_fetch:{},nifty:{technical_date:'2026-10-19'},fii_dii:{available:false,skipped:true},breadth:{available:false,skipped:true}}}
function harness(m=fixture(),fund=null,time=NOW){
 let now=time;const writes=[];class Clock extends Date{static now(){return now}}
 const c=vm.createContext({market:m,indiaCore:fund,Date:Clock,Number,JSON,fmtJstShort:v=>v,currentAgeMinutes:t=>(now-Date.parse(t))/60000,localStorage:{setItem:(...args)=>writes.push(args)}});
 for(const name of ['jstNowInfo','localTsParts','liveFreshness','fundBasisHealth','referenceHealth','referenceText','referencePresentation','referenceRowHtml','compactReferenceHtml'])vm.runInContext(fn(name),c);
 return {present:x=>JSON.parse(vm.runInContext('JSON.stringify(referencePresentation('+JSON.stringify(x)+'))',c)),render:(x,name='compactReferenceHtml')=>vm.runInContext(name+'('+JSON.stringify(x)+')',c),setNow:t=>{now=t},writes};
}
function item(key,stamp,code='LATEST'){return {key,label:key,as_of_jst:stamp,freshness_code:code,freshness:code==='REFERENCE'?'参考':code==='UNAVAILABLE'?'利用不可':'最新'}}
test('screenshot holiday NIFTY and VIX are yellow reference, not green current quotes',()=>{
 const h=harness();for(const key of ['nifty_current','india_vix']){const p=h.present(item(key,'2026-10-19T19:01:00+09:00','REFERENCE'));assert.equal(p.tone,'warn');assert.equal(p.label,'休場日の参考値');assert.match(p.detail,/現在値ではありません/)}
});
test('screenshot aged generation, FX and Brent are explicitly elapsed, not fetch failures',()=>{
 const h=harness();for(const [key,stamp,minutes] of [['generated','14:04:36',106],['usdinr','13:59:00',112],['usdjpy','13:58:00',113],['inrjpy','13:58:00',113],['brent','13:47:00',124]]){const p=h.present(item(key,'2026-10-20T'+stamp+'+09:00'));assert.equal(p.tone,'bad');assert.equal(p.label,'更新が必要');assert.match(p.detail,new RegExp(minutes+'分経過'));assert.doesNotMatch(p.detail,/取得失敗/)}
});
test('explicit holiday skips are yellow and unavailable, not failed retrievals',()=>{
 const h=harness();for(const key of ['fii_dii','breadth']){const p=h.present({key,freshness_code:'UNAVAILABLE'});assert.equal(p.tone,'warn');assert.equal(p.label,'休場・取得省略');assert.match(p.detail,/値は補完しません/)}
});
test('skip flag alone, yesterday holiday and failed optional source are not excused',()=>{
 for(const kind of ['regular','old','future','error','no-flag']){const m=fixture();if(kind==='regular')m.operational_state.regular_trading_day=true;if(kind==='old')m.generated_at_jst='2026-10-19T14:00:00+09:00';if(kind==='future')m.generated_at_jst='2026-10-20T16:00:00+09:00';if(kind==='error')m.fii_dii.error='HTTP failure';if(kind==='no-flag')delete m.fii_dii.skipped;assert.equal(harness(m).present({key:'fii_dii',freshness_code:'UNAVAILABLE'}).tone,'bad',kind)}
});
test('source error and cached fallback are distinguished without promoting old values',()=>{
 for(const [meta,label] of [[{status:'cached',fetched_this_run:false,error:'429'},'取得失敗'],[{status:'cached',fetched_this_run:false},'今回未取得']]){const m=fixture();m.core_fetch.brent=meta;const p=harness(m).present(item('brent','2026-10-20T15:50:00+09:00'));assert.equal(p.tone,'bad');assert.equal(p.label,label)}
});
test('missing, invalid and future times remain red with distinct reasons',()=>{
 const h=harness();for(const [stamp,label] of [[undefined,'時刻不明'],['bad','時刻不明'],['2026-10-20T16:00:00+09:00','未来時刻']]){const p=h.present(item('brent',stamp));assert.equal(p.tone,'bad');assert.equal(p.label,label)}
});
test('saved unavailable cannot be promoted by a recent timestamp',()=>{
 const p=harness().present(item('brent','2026-10-20T15:50:00+09:00','UNAVAILABLE'));assert.equal(p.tone,'bad');assert.equal(p.label,'利用不可');
});
test('fresh data is green only while the existing freshness limit holds',()=>{
 const h=harness(),x=item('brent','2026-10-20T15:50:00+09:00');assert.equal(h.present(x).tone,'good');h.setNow(NOW+31*60000);assert.equal(h.present(x).tone,'bad');assert.equal(h.present(x).label,'更新が必要');assert.equal(h.writes.length,0);
});
test('existing exact NIFTY20 and FX30 minute thresholds are preserved',()=>{
 const m=fixture();m.operational_state.regular_trading_day=true;const h=harness(m);for(const [key,limit] of [['nifty_current',20],['usdinr',30]]){const stamp=new Date(NOW-limit*60000).toISOString();assert.equal(h.present(item(key,stamp)).tone,'good');h.setNow(NOW+1);assert.equal(h.present(item(key,stamp)).tone,'bad');h.setNow(NOW)}
});
test('confirmed daily and official fund use basis labels, not live freshness labels',()=>{
 const fund={as_of_date:'2026-10-19',status:'ok',official_status:'ok',technical:{available:true,basis_consistent:true,basis_date:'2026-10-19'}},h=harness(fixture(),fund);
 const n=h.present({key:'nifty_confirmed',date:'2026-10-19',freshness_code:'LATEST',freshness:'最新'}),f=h.present({key:'india_core',date:'2026-10-19'});assert.equal(n.tone,'good');assert.equal(n.label,'確定日足');assert.equal(f.tone,'good');assert.equal(f.label,'基準日確認済み');
 fund.technical.basis_date='2026-10-16';assert.equal(h.present({key:'india_core',date:'2026-10-19'}).tone,'bad');
});
test('optional data with a known date is reference only; unknown and future dates remain red',()=>{
 const m=fixture();m.fii_dii={available:true};const h=harness(m);assert.equal(h.present({key:'fii_dii',date:'2026-10-19',freshness_code:'REFERENCE'}).tone,'warn');for(const date of [undefined,'invalid','2026-10-21'])assert.equal(h.present({key:'fii_dii',date,freshness_code:'REFERENCE'}).tone,'bad');
});
test('compact and detail views share color and reason and escape external text',()=>{
 const h=harness(),x={...item('brent','2026-10-20T13:47:00+09:00'),label:'<img onerror=alert(1)>',basis:'<script>bad</script>',provider:'<svg onload=alert(1)>'};
 for(const name of ['compactReferenceHtml','referenceRowHtml']){const rendered=h.render(x,name);assert.match(rendered,/bad/);assert.match(rendered,/更新が必要/);assert.match(rendered,/124分経過/);assert.doesNotMatch(rendered,/<img|<script|<svg/)}
 assert.equal(h.writes.length,0);
});
test('legend explains data colors separately from purchase permission and data retrieval',()=>{
 assert.match(html,/緑：鮮度・基準を確認済み/);assert.match(html,/黄：参考・取得対象外/);assert.match(html,/赤：更新・確認が必要/);assert.match(html,/緑でも購入可能という意味ではありません/);assert.match(html,/市場データの再取得ではありません/);assert.doesNotMatch(html,/良否は最終データ生成時に判定/);
});
