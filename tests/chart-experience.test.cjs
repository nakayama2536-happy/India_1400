'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const charts=require('../chart-experience.js');
const candleSvg=require('../technical-charts.js').candlestickChart;
const snapshot=JSON.parse(fs.readFileSync('market.json','utf8')).detail_chart;
const history=JSON.parse(fs.readFileSync('nifty_ohlc_history.json','utf8'));
const original=()=>structuredClone(history);
const current=()=>structuredClone(snapshot);

test('existing published 200 OHLC reconcile against the current 60 candles',()=>{
  const result=charts.validateLongCandles(history,snapshot);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.rows.length,200);
  assert.equal(result.rows.at(-1).date,snapshot.latest_ohlc_date);
  assert.equal(result.rows.at(-1).close,snapshot.candles.at(-1).close);
});
test('30/60/200 selectors reuse stored data and never alter snapshot',()=>{
  const detail=current(),raw=original();
  const before=JSON.stringify(detail),long=charts.validateLongCandles(raw,detail).rows;
  assert.equal(charts.rowsForPeriod(detail,long,'30').length,30);
  assert.equal(charts.rowsForPeriod(detail,long,'60').length,60);
  assert.equal(charts.rowsForPeriod(detail,long,'200').length,200);
  assert.equal(charts.rowsForPeriod(detail,null,'200').length,0);
  assert.equal(JSON.stringify(detail),before);
  assert.equal(JSON.stringify(raw),JSON.stringify(history));
});
test('known 200-row candles render with observed dates, not zero or synthetic volume',()=>{
  const xs=charts.validateLongCandles(history,snapshot).rows;
  const svg=candleSvg(xs,{width:1500});
  assert.match(svg,/viewBox="0 0 1500.00 294"/);
  assert.equal((svg.match(/class="body-(?:up|down)"/g)||[]).length,200);
  assert.doesNotMatch(svg,/volume|NaN|Infinity|class="ma5"/);
});
test('never present an old or distinct OHLC basis as current long data',()=>{
  const cases=[
    r=>{r.method_version='old';},
    r=>{r.schema_version=999;},
    r=>{r.records.pop();},
    r=>{r.records[12].date=r.records[11].date;},
    r=>{r.records[12].date='2026-02-30';},
    r=>{r.records[12].date='<img src=x onerror=alert(1)>';},
    r=>{r.records[12].high=r.records[12].low-1;},
    r=>{r.records[12].close=0;},
    r=>{r.records[12].open=null;},
    r=>{r.records[12].close_consistency='MISMATCH';},
    r=>{r.records.at(-1).date='2026-10-22';},
    r=>{r.records.at(-1).close+=1;},
    r=>{r.records.at(-1).open+=1;},
    r=>{r.records.at(-1).high+=1;},
  ];
  cases.forEach((mutate,i)=>{
    const raw=original();mutate(raw);
    const v=charts.validateLongCandles(raw,snapshot);
    assert.equal(v.ok,false,'invalid case '+i+' must fail closed');
    assert.equal(v.rows.length,0);
  });
});
test('stale/malformed current chart cannot be rehabilitated by valid long data',()=>{
  const bads=[
    d=>{d.available=false;},
    d=>{d.latest_confirmed_date='2026-10-22';},
    d=>{d.quality.close_mismatch_dates=['2026-10-23'];},
    d=>{d.candles.pop();d.candles.at(-1).date='2026-10-21';},
    d=>{d.candles[0].close+=1;},
  ];
  for(const mutate of bads){const d=current();mutate(d);assert.equal(charts.validateLongCandles(history,d).ok,false);}
});
test('long records must be at least 200, and no observations are fabricated',()=>{
  const h=original();h.records=h.records.slice(-199);
  const v=charts.validateLongCandles(h,snapshot);
  assert.equal(v.ok,false);
  assert.match(v.reason,/件数/);
  assert.equal(charts.rowsForPeriod(snapshot,null,200).length,0);
});
test('unknown periods cannot expose long history by accident',()=>{
  const long=charts.validateLongCandles(history,snapshot).rows;
  for(const value of ['0','999','all',null,undefined]){
    assert.equal(charts.rowsForPeriod(snapshot,long,value).length,60);
  }
});
test('current 60-candle display is blocked on genuine quality mismatch',()=>{
  const d=current();d.quality.close_mismatch_dates.push(d.latest_ohlc_date);
  assert.equal(charts.rowsForPeriod(d,null,'60').length,0);
  assert.equal(charts.rowsForPeriod(d,null,'30').length,0);
});
test('display module has no market fetch, data writes, secrets or trading function',()=>{
  const js=fs.readFileSync('chart-experience.js','utf8');
  for(const forbidden of [/\bfetch\s*\(/,/\blocalStorage\b/,/\bsessionStorage\b/,/BUY_CONDITION/,/TWELVEDATA_API_KEY/,/GITHUB_ACTIONS_TOKEN/,/update_market\.py/])
    assert.doesNotMatch(js,forbidden);
  assert.match(js,/aria-modal/);
  assert.match(js,/touchmove/);
  assert.match(js,/Escape/);
  assert.match(js,/focus/);
});
test('main index exposes 5 expanded charts, period selection, evidence navigation',()=>{
  const html=fs.readFileSync('index.html','utf8');
  for(const id of ['indiaCoreTrendChart','niftyChart','rsiChart','macdChart','detailCandleChart']){
    assert.ok(html.includes('data-ix-expand="'+id+'"'),id);
  }
  for(const n of ['30','60','200'])assert.match(html,new RegExp('<option value="'+n+'"'));
  assert.match(html,/changeCandlePeriod/);
  assert.match(html,/validateLongCandles/);
  assert.match(html,/candleSnapshotKey/);
  assert.match(html,/data-quality-target/);
  assert.match(html,/captureEvidence/);
  assert.match(html,/EXTERNAL_TRIGGER/);
  assert.match(html,/30件でも自動採用しません/);
  assert.doesNotMatch(html,/data-page="quality"/);
});
test('UI 5.48 deploy shell and stylesheet remain app-scoped',()=>{
  const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
  const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
  const version=fs.readFileSync('VERSION','utf8');
  assert.match(version,/UI_VERSION=5\.48/);
  assert.match(html,/v5\.48/);
  assert.match(manifest.start_url,/v=5\.48/);
  assert.match(sw,/india1400-v5-48-/);
  for(const name of ['chart-experience.js','chart-experience.css']){
    assert.ok(html.includes(name));
    assert.ok(sw.includes('"'+name+'"'));
  }
  assert.match(sw,/key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(sw,/caches\.match\s*\(/);
});
