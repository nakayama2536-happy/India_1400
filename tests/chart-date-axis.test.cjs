'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const tech=require('../technical-charts.js'), experience=require('../chart-experience.js');
const market=JSON.parse(fs.readFileSync('market.json','utf8'));
const history=JSON.parse(fs.readFileSync('nifty_ohlc_history.json','utf8'));
const nifty=market.chart_data.nifty;
const {historicalAlignedDetail}=require('./ohlc-historical-case.cjs');
const parseDates=svg=>[...svg.matchAll(/<text x="([\d.]+)" y="[\d.]+" text-anchor="(?:start|middle|end)">(\d{2}\/\d{2})<\/text>/g)]
  .map(x=>({x:Number(x[1]),date:x[2]}));
const price=[{key:'close',cls:'line-main'},{key:'ma5',cls:'line-ma5'},{key:'ma25',cls:'line-ma25'},{key:'ma75',cls:'line-ma75'}];

test('normal embedded price/RSI/MACD chart keeps the existing three-day axis',()=>{
  for(const [kind,rows,series] of [
    ['nifty',nifty.price,price],
    ['rsi',nifty.rsi14,[{key:'value',cls:'line-rsi'}]],
    ['macd',nifty.macd_hist,[{key:'value',cls:'line-macd'}]]
  ]){
    const chart=tech.lineChart(rows,series,[],{kind,width:360});
    const labels=parseDates(chart);
    assert.equal(labels.length,3,kind+' must retain original embedded date density');
    assert.equal(labels[0].date,rows[0].date.slice(5).replace('-','/'));
    assert.equal(labels.at(-1).date,rows.at(-1).date.slice(5).replace('-','/'));
    assert.equal((chart.match(/class="weekline"/g)||[]).length,1);
  }
});

test('250 percent NIFTY right-hand viewport shows multiple saved dates, not only the last date',()=>{
  const shape=experience.expandedGeometry('niftyChart',375,812,2.5);
  const svg=tech.lineChart(nifty.price,price,[],{kind:'nifty',width:shape.width-16,height:shape.height});
  const labels=parseDates(svg);
  const visibleStart=(shape.width-16)-375;
  const visible=labels.filter(x=>x.x>=visibleStart && x.x<=shape.width-16);
  assert.ok(visible.length>=3,'last 375px should show at least three observed dates');
  assert.equal(labels.at(-1).date,nifty.price.at(-1).date.slice(5).replace('-','/'));
  assert.equal(visible.at(-1).date,nifty.price.at(-1).date.slice(5).replace('-','/'));
  assert.ok(visible.some(x=>x.date!==visible.at(-1).date));
  assert.ok(visible.every(x=>nifty.price.some(p=>p.date.slice(5).replace('-','/')===x.date)));
  assert.match(svg,/height="320"/);
});

test('date labels stay separated on iPhone zoom sizes and keep a single vertical guide',()=>{
  for(const screen of [320,375,393,430]){
    for(const magnification of [1,1.5,2.5]){
      const geometry=experience.expandedGeometry('niftyChart',screen,852,magnification);
      const chart=tech.lineChart(nifty.price,price,[],{kind:'nifty',width:geometry.width-16,height:geometry.height});
      const dates=parseDates(chart);
      assert.ok(dates.length>=3,screen+'/'+magnification+' labels should be present');
      for(let i=1;i<dates.length;i++)assert.ok(dates[i].x-dates[i-1].x>=84,
        screen+'/'+magnification+' axis collision: '+JSON.stringify(dates));
      assert.equal((chart.match(/class="weekline"/g)||[]).length,1);
      if(magnification===2.5){
        const inRight=dates.filter(x=>x.x>=geometry.width-16-screen);
        assert.ok(inRight.length>=3,screen+' should have several dates in the rightmost visible portion');
      }
    }
  }
});

test('NIFTY, RSI and MACD use matching expanded date positions for common basis',()=>{
  const dates=arr=>arr.map(x=>x.date);
  assert.deepEqual(dates(nifty.price),dates(nifty.rsi14));
  assert.deepEqual(dates(nifty.price),dates(nifty.macd_hist));
  for(const width of [340,860,1100]){
    const options={width,height:320};
    const a=parseDates(tech.lineChart(nifty.price,price,[],{...options,kind:'nifty'}));
    const b=parseDates(tech.lineChart(nifty.rsi14,[{key:'value',cls:'line-rsi'}],[],{...options,kind:'rsi'}));
    const c=parseDates(tech.lineChart(nifty.macd_hist,[{key:'value',cls:'line-macd'}],[],{...options,kind:'macd'}));
    assert.deepEqual(a,b);
    assert.deepEqual(a,c);
  }
});

test('expanded 60 and validated 200 OHLC use observed session dates without overlap',()=>{
  const d=historicalAlignedDetail(history,market.detail_chart);
  const reviewed=experience.validateLongCandles(history,d);
  assert.equal(reviewed.ok,true,reviewed.reason);
  for(const [rows,width,height,visibleWidth] of [
    [d.candles,920,350,375],
    [reviewed.rows,3750,350,375],
  ]){
    const before=JSON.stringify(rows);
    const svg=tech.candlestickChart(rows,{width,height});
    const ticks=parseDates(svg);
    assert.ok(ticks.length>3);
    assert.equal(ticks.at(-1).date,rows.at(-1).date.slice(5).replace('-','/'));
    assert.ok(ticks.filter(t=>t.x>=width-visibleWidth).length>=3);
    for(let i=1;i<ticks.length;i++)assert.ok(ticks[i].x-ticks[i-1].x>=84);
    assert.doesNotMatch(svg,/NaN|Infinity/);
    assert.equal(JSON.stringify(rows),before);
  }
});

test('support line, RSI 50 and MACD zero remain visible; no market calculation changes',()=>{
  const svg=tech.lineChart(nifty.price,price,[],{kind:'nifty',width:900,height:320,
    supportLevels:[{kind:'recent-low',value:22232,touches:[{index:1}]}]});
  assert.match(svg,/class="support-visual"/);
  const rsi=tech.lineChart(nifty.rsi14,[{key:'value',cls:'line-rsi'}],[],{kind:'rsi',width:900,height:260});
  assert.match(rsi,/class="guide guide-reference"/);
  assert.match(rsi,/>50<\/text>/);
  const macd=tech.lineChart(nifty.macd_hist,[{key:'value',cls:'line-macd'}],[],{kind:'macd',width:900,height:260});
  assert.match(macd,/class="zero-axis"/);
  assert.ok((macd.match(/class="macd-(?:positive|negative)"/g)||[]).length>5);
});

test('invalid or missing dates still hold chart; no inferred dates or source fetch',()=>{
  const invalid=structuredClone(nifty.price);
  invalid[10].date='2026-02-30';
  assert.doesNotMatch(tech.lineChart(invalid,price,[],{kind:'nifty',width:900,height:320}),/<svg/);
  const dup=structuredClone(nifty.price);
  dup[10].date=dup[9].date;
  assert.doesNotMatch(tech.lineChart(dup,price,[],{kind:'nifty',width:900,height:320}),/<svg/);
  const source=fs.readFileSync('technical-charts.js','utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|\blocalStorage\b|\bsessionStorage\b|GITHUB_TOKEN/);
});

test('UI 5.53 retains all app cache and safe publication version bindings',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
  const version=fs.readFileSync('VERSION','utf8');
  assert.match(version,/UI_VERSION=5\.56/);
  assert.match(html,/v5\.56/);
  assert.match(sw,/india1400-v5-56-/);
  assert.match(sw,/\?v=5\.56/);
  assert.match(manifest.start_url,/v=5\.56/);
  assert.match(html,/renderExpandedChart\(id,width,height\)/);
  assert.match(html,/data-ix-expand="niftyChart"/);
  assert.match(html,/data-ix-expand="rsiChart"/);
  assert.doesNotMatch(sw,/caches\.match\s*\(/);
});

test('expanded fund NAV trend also labels multiple actual dates without changing original three',()=>{
  const vm=require('node:vm');
  const html=fs.readFileSync('index.html','utf8');
  const a=html.indexOf('function coreTrendSvg('),b=html.indexOf('\nasync function ensureIndiaCoreHistory()',a);
  assert.ok(a>=0&&b>a);
  const sandbox=vm.createContext({
    hasFiniteValue:v=>v!==null&&v!==undefined&&Number.isFinite(Number(v)),
    fmt:v=>Number(v).toLocaleString('ja-JP'),
    referenceText:String,
    fmtJstShort:v=>{const s=String(v).split('-');return Number(s[1])+'/'+Number(s[2]);}
  });
  vm.runInContext(html.slice(a,b),sandbox);
  const input=JSON.parse(fs.readFileSync('india_core_history.json','utf8')).records.slice(-130);
  const before=JSON.stringify(input),fn=vm.runInContext('coreTrendSvg',sandbox);
  const pattern=/<text text-anchor="(?:start|middle|end)" x="([\d.]+)" y="[\d.]+">(\d{1,2}\/\d{1,2})<\/text>/g;
  const extract=svg=>[...svg.matchAll(pattern)].map(m=>({x:Number(m[1]),date:m[2]}));
  const embedded=extract(fn(input));
  assert.equal(embedded.length,3);
  const g=experience.expandedGeometry('indiaCoreTrendChart',375,812,2.5);
  const displayed=extract(fn(input,[],{width:g.width-16,height:g.height}));
  assert.ok(displayed.length>3);
  const last=input.at(-1).date.split('-');
  assert.equal(displayed.at(-1).date,Number(last[1])+'/'+Number(last[2]));
  const visible=displayed.filter(x=>x.x>=g.width-16-375);
  assert.ok(visible.length>=3,JSON.stringify(visible));
  for(let i=1;i<displayed.length;i++)assert.ok(displayed[i].x-displayed[i-1].x>=92);
  assert.ok(displayed.every(x=>input.some(p=>{
    const d=p.date.split('-');return Number(d[1])+'/'+Number(d[2])===x.date;
  })));
  assert.equal(JSON.stringify(input),before);
});
