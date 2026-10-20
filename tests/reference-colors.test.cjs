const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const tail=html.slice(start),end=tail.search(/\n(?:function|const|async function) /);return end<0?tail:tail.slice(0,end)}
function fixture(){return {status:'ok',generated_at_jst:'2026-10-20T14:04:36+09:00',operational_state:{code:'CLOSED',regular_trading_day:false},core_fetch:Object.fromEntries(['nifty','usdinr','usdjpy','brent'].map(k=>[k,{status:'fresh',fetched_this_run:true,technical_status:'fresh'}])),usdinr:{price:95},usdjpy:{price:158},inrjpy:{price:1.66},brent:{price:80},nifty:{price:23000,technical_date:'2026-10-19'},india_vix:{data_status:'fresh',price:14.77},fii_dii:{available:false,skipped:true},breadth:{available:false,skipped:true}}}
function regular(stamp='2026-10-21T14:04:00+09:00'){const m=fixture();m.generated_at_jst=stamp;m.operational_state={code:'LIVE',regular_trading_day:true};m.nifty.technical_date='2026-10-20';return m}
function fund(stamp='2026-10-20T05:13:00+09:00'){return {fetched_at_jst:stamp,as_of_date:'2026-10-19',status:'ok',official_status:'ok',technical:{available:true,basis_consistent:true,basis_date:'2026-10-19'}}}
function harness(m=fixture(),f=null,time='2026-10-20T17:36:00+09:00'){
 let now=Date.parse(time);const writes=[];class Clock extends Date{static now(){return now}}
 const c=vm.createContext({market:m,indiaCore:f,Date:Clock,Number,JSON,fmtJstShort:v=>v,currentAgeMinutes:t=>(now-Date.parse(t))/60000,localStorage:{setItem:(...args)=>writes.push(args)}});
 for(const name of ['jstNowInfo','localTsParts','currentHoliday','liveFreshness','fundBasisHealth','sharedReferenceItems','referenceHealth','referenceText','referenceTimestamp','referenceUpdateSchedule','referencePresentation','referenceRowHtml','compactReferenceHtml'])vm.runInContext(fn(name),c);
 return {present:x=>JSON.parse(vm.runInContext('JSON.stringify(referencePresentation('+JSON.stringify(x)+'))',c)),render:(x,name='compactReferenceHtml')=>vm.runInContext(name+'('+JSON.stringify(x)+')',c),setNow:t=>{now=Date.parse(t)},run:s=>vm.runInContext(s,c),writes};
}
function item(key,stamp,code='LATEST'){return {key,label:key,as_of_jst:stamp,freshness_code:code,freshness:code==='REFERENCE'?'参考':code==='UNAVAILABLE'?'利用不可':'最新'}}
function fx(stamp='2026-10-21T13:58:00+09:00'){return item('usdjpy',stamp)}
test('reported Oct 20 holiday: a few hours elapsed is yellow, not a red update failure',()=>{
 const h=harness();for(const [key,stamp] of [['generated','14:04:36'],['usdinr','13:59:00'],['usdjpy','13:58:00'],['inrjpy','13:58:00'],['brent','13:47:00']]){const p=h.present(item(key,'2026-10-20T'+stamp+'+09:00'));assert.equal(p.tone,'warn');assert.equal(p.label,'休場日の参考値')}
 for(const key of ['nifty_current','india_vix']){const p=h.present(item(key,'2026-10-19T19:01:00+09:00','REFERENCE'));assert.equal(p.tone,'warn');assert.match(p.detail,/現在値ではありません/)}
});
test('green starts at 14:00 and ends at 15:00 JST; minute-age trading gates stay separate',()=>{
 const m=regular('2026-10-21T13:57:00+09:00'),h=harness(m,null,'2026-10-21T13:59:59+09:00'),x=fx('2026-10-21T13:56:00+09:00');
 assert.equal(h.present(x).tone,'warn');h.setNow('2026-10-21T14:00:00+09:00');assert.equal(h.present(x).tone,'good');
 h.setNow('2026-10-21T14:59:59+09:00');assert.equal(h.present(x).tone,'good');assert.equal(h.run('referenceHealth('+JSON.stringify(x)+').ok'),false);
 h.setNow('2026-10-21T15:00:00+09:00');assert.equal(h.present(x).tone,'warn');assert.equal(h.present(x).label,'時間外の参考値');assert.equal(h.writes.length,0);
});
test('14:04 success satisfies the morning batch, without requiring all retry runs',()=>{
 assert.equal(harness(regular(),null,'2026-10-21T14:30:00+09:00').present(fx()).tone,'good');
});
test('yesterday data under 24h is waiting before grace, red at 14:25 and still red after 15:00',()=>{
 const m=regular('2026-10-20T19:50:00+09:00'),h=harness(m,null,'2026-10-21T14:24:59+09:00'),x=fx('2026-10-20T19:48:00+09:00');assert.equal(h.present(x).tone,'warn');
 h.setNow('2026-10-21T14:25:00+09:00');assert.equal(h.present(x).tone,'bad');assert.equal(h.present(x).label,'予定更新が未反映');assert.match(h.present(x).detail,/10-21 14:00/);
 h.setNow('2026-10-21T15:01:00+09:00');assert.equal(h.present(x).tone,'bad');
});
test('19:47 update has publication grace until 20:10, then recovers only after a newer generation',()=>{
 const m=regular(),h=harness(m,null,'2026-10-21T20:09:59+09:00');assert.equal(h.present(fx()).tone,'warn');
 h.setNow('2026-10-21T20:10:00+09:00');assert.equal(h.present(fx()).tone,'bad');assert.match(h.present(fx()).detail,/19:47/);
 m.generated_at_jst='2026-10-21T20:01:00+09:00';assert.equal(h.present(fx('2026-10-21T19:58:00+09:00')).tone,'warn');
});
test('weekend and Monday before update retain Friday success; missed Friday remains red',()=>{
 const m=regular('2026-10-23T19:55:00+09:00'),x=fx('2026-10-23T19:50:00+09:00'),h=harness(m,null,'2026-10-24T14:30:00+09:00');
 for(const time of ['2026-10-24T14:30:00+09:00','2026-10-25T17:00:00+09:00','2026-10-26T13:00:00+09:00']){h.setNow(time);assert.equal(h.present(x).tone,'warn',time)}
 h.setNow('2026-10-26T14:25:00+09:00');assert.equal(h.present(x).tone,'bad');
 m.generated_at_jst='2026-10-23T14:04:00+09:00';h.setNow('2026-10-25T14:30:00+09:00');assert.equal(h.present(fx('2026-10-23T13:58:00+09:00')).tone,'bad');
});
test('missing, unknown and contradictory calendar cannot become green',()=>{
 for(const state of [{},{code:'CALENDAR_UNVERIFIED',regular_trading_day:null},{code:'CLOSED',regular_trading_day:false}]){const m=regular();m.operational_state=state;assert.notEqual(harness(m,null,'2026-10-21T14:30:00+09:00').present(fx()).tone,'good')}
});
test('explicit holiday skips are yellow; cached failures and old holiday evidence are not excused',()=>{
 for(const key of ['fii_dii','breadth'])assert.equal(harness().present({key,freshness_code:'UNAVAILABLE'}).label,'休場・取得省略');
 for(const kind of ['regular','old','future','error','no-flag','contradiction']){const m=fixture();if(kind==='regular')m.operational_state.regular_trading_day=true;if(kind==='old')m.generated_at_jst='2026-10-19T14:00:00+09:00';if(kind==='future')m.generated_at_jst='2026-10-20T18:00:00+09:00';if(kind==='error')m.fii_dii.error='HTTP failure';if(kind==='no-flag')delete m.fii_dii.skipped;if(kind==='contradiction')m.operational_state.code='DATA_ERROR';assert.equal(harness(m).present({key:'fii_dii',freshness_code:'UNAVAILABLE'}).tone,'bad',kind)}
});
test('source errors, cached fallbacks and derived FX leg failures stay red outside window',()=>{
 for(const [meta,label] of [[{status:'cached',fetched_this_run:false,error:'429'},'取得失敗'],[{status:'cached',fetched_this_run:false},'今回未取得']]){const m=fixture();m.core_fetch.brent=meta;assert.equal(harness(m).present(item('brent','2026-10-20T13:47:00+09:00')).label,label);m.core_fetch.usdjpy=meta;assert.equal(harness(m).present(item('inrjpy','2026-10-20T13:58:00+09:00')).label,label)}
 const m=fixture();delete m.core_fetch.brent;assert.equal(harness(m).present(item('brent','2026-10-20T13:47:00+09:00')).tone,'bad');
 m.india_vix.data_status='cached';assert.equal(harness(m).present(item('india_vix','2026-10-19T19:14:00+09:00','REFERENCE')).tone,'bad');
});
test('missing, invalid and future source/generation times stay red',()=>{
 const h=harness();for(const [stamp,label] of [[undefined,'時刻不明'],['bad','時刻不明'],['2026-10-20T18:00:00+09:00','未来時刻']])assert.equal(h.present(item('brent',stamp)).label,label);
 for(const stamp of [undefined,'bad','2026-10-20T18:00:00+09:00']){const m=fixture();m.generated_at_jst=stamp;assert.equal(harness(m).present(item('brent','2026-10-20T13:47:00+09:00')).tone,'bad')}
});
test('recent timestamps cannot erase saved unavailable/stale or generation quality failure',()=>{
 for(const [code,label] of [['UNAVAILABLE','利用不可'],['STALE','保存時点で鮮度不足']]){const p=harness().present(item('brent','2026-10-20T13:47:00+09:00',code));assert.equal(p.tone,'bad');assert.equal(p.label,label)}
 for(const overrides of [{status:'error'},{data_quality:{critical_reasons:['missing NIFTY']}}]){const m=Object.assign(fixture(),overrides);assert.equal(harness(m).present(item('generated',m.generated_at_jst)).tone,'bad')}
});
test('24 hours is auxiliary, with exact boundary and without masking missed batches',()=>{
 const h=harness(regular(),null,'2026-10-21T14:30:00+09:00');assert.equal(h.present(fx('2026-10-20T14:30:00+09:00')).tone,'good');assert.equal(h.present(fx('2026-10-20T14:29:59+09:00')).label,'参照値が24時間超');
 assert.equal(harness().present(item('brent','2026-10-19T13:00:00+09:00')).tone,'bad');
});
test('confirmed close and fund basis use date/quality evidence, yellow outside decision time',()=>{
 const f=fund(),h=harness(fixture(),f);for(const key of ['nifty_confirmed','india_core'])assert.equal(h.present({key,date:'2026-10-19',freshness_code:'LATEST'}).tone,'warn');
 const m=regular();m.nifty.technical_date='2026-10-19';f.fetched_at_jst='2026-10-21T05:13:00+09:00';const g=harness(m,f,'2026-10-21T14:30:00+09:00');for(const key of ['nifty_confirmed','india_core'])assert.equal(g.present({key,date:'2026-10-19',freshness_code:'LATEST'}).tone,'good');
 f.technical.basis_date='2026-10-16';assert.equal(g.present({key:'india_core',date:'2026-10-19'}).tone,'bad');m.core_fetch.nifty.technical_status='cached';assert.equal(g.present({key:'nifty_confirmed',date:'2026-10-19'}).tone,'bad');
});
test('fund checks its own evening fetch schedule, including midnight deadline, independent of market jobs',()=>{
 const f=fund(),h=harness(fixture(),f,'2026-10-20T19:29:59+09:00'),x={key:'india_core',date:'2026-10-19'};assert.equal(h.present(x).tone,'warn');
 h.setNow('2026-10-20T19:30:00+09:00');assert.equal(h.present(x).label,'予定更新が未反映');f.fetched_at_jst='2026-10-20T19:18:00+09:00';assert.equal(h.present(x).tone,'warn');
 for(const [before,due,fetched] of [['20:29:59','20:30:00','20:18:00'],['22:34:59','22:35:00','22:23:00']]){h.setNow('2026-10-20T'+before+'+09:00');assert.equal(h.present(x).tone,'warn');h.setNow('2026-10-20T'+due+'+09:00');assert.equal(h.present(x).tone,'bad');f.fetched_at_jst='2026-10-20T'+fetched+'+09:00';assert.equal(h.present(x).tone,'warn')}
 h.setNow('2026-10-20T23:59:59+09:00');assert.equal(h.present(x).tone,'warn');h.setNow('2026-10-21T00:00:00+09:00');assert.equal(h.present(x).tone,'bad');f.fetched_at_jst='2026-10-20T23:48:00+09:00';assert.equal(h.present(x).tone,'warn');
});
test('optional known dates stay reference only; invalid, impossible and future dates stay red',()=>{
 const m=fixture();m.fii_dii={available:true};const h=harness(m);assert.equal(h.present({key:'fii_dii',date:'2026-10-19',freshness_code:'REFERENCE'}).tone,'warn');for(const date of [undefined,'invalid','2026-02-30','2026-10-21'])assert.equal(h.present({key:'fii_dii',date,freshness_code:'REFERENCE'}).tone,'bad');
});
test('compact and detailed views share scheduled color/reason and escape external text',()=>{
 const h=harness(),x={...item('brent','2026-10-20T13:47:00+09:00'),label:'<img onerror=alert(1)>',basis:'<script>bad</script>',provider:'<svg onload=alert(1)>'};
 for(const name of ['compactReferenceHtml','referenceRowHtml']){assert.match(h.render(x,name),/warn/);assert.match(h.render(x,name),/休場日の参考値/);assert.doesNotMatch(h.render(x,name),/<img|<script|<svg/);h.setNow('2026-10-20T20:10:00+09:00');assert.match(h.render(x,name),/予定更新が未反映/);h.setNow('2026-10-20T17:36:00+09:00')}assert.equal(h.writes.length,0);
});
test('legend separates update readiness from buying permission and automatic retrieval',()=>{
 for(const pattern of [/緑：判断時間内・更新確認済み/,/黄：時間外・参考/,/赤：予定更新未反映・異常/,/緑でも購入可能という意味ではありません/,/市場データの再取得ではありません/,/14:25/,/20:10/])assert.match(html,pattern);
});

test('timestamps must have a timezone and a real date; missing prices cannot be green',()=>{
 const h=harness();for(const stamp of ['2026-02-30T13:58:00+09:00','2026-10-20T13:58:00','2026-10-20','2026-10-19T24:00:00+09:00'])assert.equal(h.present(item('brent',stamp)).tone,'bad',stamp);
 for(const key of ['nifty_current','usdinr','usdjpy','inrjpy','brent']){const m=regular();delete m[key==='nifty_current'?'nifty':key].price;assert.equal(harness(m,null,'2026-10-21T14:30:00+09:00').present(item(key,'2026-10-21T13:58:00+09:00')).label,'価格データ不足')}
});
