'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const charts=require('../technical-charts.js'),html=fs.readFileSync('index.html','utf8');
const priceSeries=[{key:'close',cls:'line-main'},{key:'ma5',cls:'line-ma5'},{key:'ma25',cls:'line-ma25'},{key:'ma75',cls:'line-ma75'}];
const rows=(xs)=>xs.map((v,i)=>({date:new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10),value:v,close:v,ma5:v+10,ma25:v+100,ma75:v+400}));
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const tail=html.slice(start),end=tail.search(/\n(?:async )?function /);return end<0?tail:tail.slice(0,end)}
function harness(m){const nodes={},c=vm.createContext({IndiaTechnicalCharts:charts,market:m,$:id=>nodes[id]||(nodes[id]={getBoundingClientRect:()=>({width:313})}),setText:(id,v)=>{(nodes[id]||(nodes[id]={})).text=String(v)}});for(const n of ['fmt','hasFiniteValue','coreSupportLevels','chartSvg','technicalChartWidth','renderChartReading','renderTechnicalCharts'])vm.runInContext(fn(n),c);return {c,nodes};}

test('nice price ticks cover input and use readable 500-point intervals for the reported range',()=>{
 const s=charts.niceScale([22232,22889,24200]);assert.equal(s.step,500);assert.ok(s.min<=22232&&s.max>=24200);assert.ok(s.ticks.length<=7);assert.ok(s.ticks.every(v=>v%500===0));
 for(const values of [[0,0],[1.001,1.009],[1e6,1e6],[3,-4]]){const x=charts.niceScale(values);assert.ok(x.max>x.min&&x.step>0);assert.ok(x.ticks.length<=8);}
});
test('SVG width/viewBox match host pixels and never use nonuniform scaling',()=>{
 for(const width of [240,250,295,313,323,350,680])for(const kind of ['nifty','rsi','macd']){
  const x=charts.lineChart(rows(kind==='nifty'?[22500,22900,23100]:[30,40,45]),kind==='nifty'?priceSeries:[{key:'value',cls:kind==='rsi'?'line-rsi':'line-macd'}],[],{kind,width});
  assert.match(x,new RegExp('viewBox="0 0 '+width+'\\.00 '));assert.match(x,/preserveAspectRatio="xMinYMin meet"/);assert.doesNotMatch(x,/preserveAspectRatio="none"/);
 }
});
test('missing samples leave a gap, never a zero or a bridged line',()=>{
 const x=charts.lineChart(rows([22500,null,22700]),[{key:'close',cls:'line-main'}],[],{kind:'nifty'});
 const d=x.match(/class="line-main" d="([^"]+)"/)[1];assert.equal((d.match(/M/g)||[]).length,2);assert.doesNotMatch(d,/L/);
 for(const v of [null,undefined,'',' ',true,false,NaN,Infinity])assert.equal(charts.finite(v),false);
});
test('duplicate, unordered, impossible dates and injection are rejected without SVG',()=>{
 for(const date of ['2026-09-01','2026-02-30','<svg onload=alert(1)>','invalid']){const r=rows([10,11,12]);r[1].date=date;const x=charts.lineChart(r,[{key:'value',cls:'line-rsi'}],[],{kind:'rsi'});assert.doesNotMatch(x,/<svg/);assert.match(x,/不整合/);}
});
test('RSI is fixed 0-100, uses a distinguished 50 baseline and rejects out-of-range values',()=>{
 const x=charts.lineChart(rows([45,48,49]),[{key:'value',cls:'line-rsi'}],[],{kind:'rsi'});for(const value of [0,30,50,70,100])assert.ok(x.includes('>'+value+'</text>'));assert.match(x,/guide guide-reference/);
 const bad=charts.lineChart(rows([45,101,49]),[{key:'value',cls:'line-rsi'}],[],{kind:'rsi'});assert.doesNotMatch(bad,/<svg/);
});
test('MACD positive and negative bars retain value proportions with a centered zero line',()=>{
 const x=charts.lineChart(rows([-10,0,10]),[{key:'value',cls:'line-macd'}],[],{kind:'macd'});assert.equal((x.match(/<rect /g)||[]).length,2);assert.match(x,/macd-positive/);assert.match(x,/macd-negative/);assert.doesNotMatch(x,/<path/);
 const heights=[...x.matchAll(/<rect [^>]*height="([^"]+)"/g)].map(m=>Number(m[1]));assert.equal(heights[0],heights[1]);
});
test('candles use all 60 records, readable axes and uniform text geometry',()=>{
 const input=Array.from({length:60},(_,i)=>({...rows([23000])[0],date:new Date(Date.UTC(2026,6,1+i)).toISOString().slice(0,10),open:23000+i,close:23010+i,high:23020+i,low:22990+i,ma5:null,ma25:undefined,ma75:23200}));
 const x=charts.candlestickChart(input,{width:313});assert.equal((x.match(/class="body-up"/g)||[]).length,60);assert.match(x,/viewBox="0 0 313.00 294"/);assert.match(x,/preserveAspectRatio="xMinYMin meet"/);assert.match(x,/23,000/);assert.doesNotMatch(x,/NaN|Infinity/);
});
test('missing OHLC is not a zero candle and inconsistent high/low is visibly held',()=>{
 const r=rows(Array(12).fill(23000)).map(p=>({...p,open:23000,high:23010,low:22990,close:23002}));
 for(const field of ['open','high','low','close']){const bad=structuredClone(r);bad[4][field]=null;assert.doesNotMatch(charts.candlestickChart(bad),/<svg/);}
 for(const [field,value] of [['high',22900],['low',23100]]){const bad=structuredClone(r);bad[4][field]=value;assert.match(charts.candlestickChart(bad),/不整合/);}
});
test('header uses the same series/date as the plot, not provisional metrics',()=>{
 const m={nifty:{technical_date:'2026-09-03',provisional:{available:true,rsi14:99,macd_hist:999}},chart_data:{nifty:{available:true,price:rows([23000,23100,23200]),rsi14:rows([40,45,47.72]),macd_hist:rows([20,30,88.753])}}};
 const {c,nodes}=harness(m);c.renderTechnicalCharts();assert.equal(nodes.rsiChartLatest.text,'47.7');assert.equal(nodes.macdChartLatest.text,'+88.75');assert.match(nodes.rsiChartAsOf.text,/2026\/09\/03/);assert.doesNotMatch(nodes.rsiChartLatest.text,/99/);
});
test('missing newest reading and unavailable histories clear old numbers instead of carrying them forward',()=>{
 const m={chart_data:{nifty:{price:rows([23000,23100]),rsi14:rows([40,41]),macd_hist:rows([5,6])}}};const {c,nodes}=harness(m);c.renderTechnicalCharts();assert.equal(nodes.rsiChartLatest.text,'41.0');
 m.chart_data.nifty.rsi14[1].value=null;c.renderTechnicalCharts();assert.equal(nodes.rsiChartLatest.text,'--');assert.match(nodes.rsiChartAsOf.text,/確認できません/);
 m.chart_data.nifty.available=false;c.renderTechnicalCharts();assert.equal(nodes.niftyLastClose.text,'終値 --');assert.equal(nodes.macdChartLatest.text,'--');assert.doesNotMatch(nodes.niftyChart.innerHTML,/<svg/);
});
test('NIFTY RSI MACD are consecutive, with metric details after all three',()=>{
 const start=html.indexOf('<section id="page-indicators"'),part=html.slice(start,html.indexOf('NIFTY 詳細チャートを見る',start));const ids=['niftyChart','rsiChart','macdChart','niftyMetrics'];const pos=ids.map(id=>part.indexOf('id="'+id+'"'));assert.ok(pos.every((n,i)=>n>=0&&(!i||n>pos[i-1])));assert.match(part,/<details class="indicator-values">/);
});
test('redraw is width-triggered, coalesced and does not fetch or write storage',()=>{
 const code=fn('initTechnicalChartLayout');assert.match(code,/ResizeObserver/);assert.match(code,/requestAnimationFrame/);assert.match(code,/seen\.get/);assert.doesNotMatch(code,/fetch|localStorage|setItem|renderAll|renderIndicators/);
 const renderer=fs.readFileSync('technical-charts.js','utf8');assert.doesNotMatch(renderer,/\bfetch\s*\(|\blocalStorage\.|\bsessionStorage\./);
 const src=rows([23000,23100,23200]),before=JSON.stringify(src);charts.lineChart(src,priceSeries,[],{kind:'nifty'});assert.equal(JSON.stringify(src),before);
});
test('renderer asset is in the HTML and own SW shell; all UI versions match',()=>{
 const version=fs.readFileSync('VERSION','utf8').match(/UI_VERSION=(.+)/)[1].trim(),sw=fs.readFileSync('sw.js','utf8'),manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
 assert.match(html,/<script src="technical-charts.js"><\/script>/);assert.match(sw,/"technical-charts.js"/);assert.ok(sw.includes('v'+version.replace('.','-')+'-'));assert.ok(manifest.start_url.includes('v='+version));assert.ok(html.includes('v'+version));
});
