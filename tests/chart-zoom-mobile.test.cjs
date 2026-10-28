'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const display=require('../chart-experience.js');
const charts=require('../technical-charts.js');
const index=fs.readFileSync('index.html','utf8');
const market=JSON.parse(fs.readFileSync('market.json','utf8'));
const longHistory=JSON.parse(fs.readFileSync('nifty_ohlc_history.json','utf8'));
const {historicalAlignedDetail}=require('./ohlc-historical-case.cjs');
const historicalDetail=historicalAlignedDetail(longHistory,market.detail_chart);

test('iPhone zoom extends only horizontal viewport, never multiplies vertical height',()=>{
  for(const width of [320,375,393,430]){
    for(const id of ['rsiChart','macdChart','niftyChart','detailCandleChart','indiaCoreTrendChart']){
      const normal=display.expandedGeometry(id,width,844,1);
      const max=display.expandedGeometry(id,width,844,2.5);
      assert.equal(normal.width,width);
      assert.equal(max.width,Math.ceil(width*2.5));
      assert.equal(normal.height,max.height,'y must stay fixed at 250%: '+id);
      assert.ok(normal.height<=500,'dialog is not taller than its fixed chart plan');
    }
  }
  const rsi=display.expandedGeometry('rsiChart',390,844,2.5);
  assert.deepEqual(rsi,{width:975,height:260,zoom:2.5});
  const long=display.expandedGeometry('detailCandleChart',390,844,2.5,1500);
  assert.equal(long.width,3750);
  assert.equal(long.height,350);
  assert.equal(display.expandedGeometry('rsiChart',390,430,2.5).height,230);
});

test('fixed-height NIFTY/RSI/MACD drawing retains meaning at normal and 250% width',()=>{
  const n=market.chart_data.nifty;
  const cases=[
    ['nifty',n.price,[{key:'close',cls:'line-main'}],320],
    ['rsi',n.rsi14,[{key:'value',cls:'line-rsi'}],260],
    ['macd',n.macd_hist,[{key:'value',cls:'line-macd'}],260]
  ];
  for(const [kind,rows,series,height] of cases){
    const normal=charts.lineChart(rows,series,[],{kind,width:360,height});
    const zoom=charts.lineChart(rows,series,[],{kind,width:900,height});
    assert.match(normal,new RegExp('viewBox="0 0 360\\.00 '+height+'"'));
    assert.match(zoom,new RegExp('viewBox="0 0 900\\.00 '+height+'"'));
    assert.match(zoom,new RegExp('height="'+height+'"'));
    assert.doesNotMatch(zoom,/NaN|Infinity/);
    assert.equal(zoom.includes('class="guide guide-reference"'),kind==='rsi');
    // Same axis values/scale within the fixed-height view even as X widens.
    if(kind==='rsi'){
      const y=s=>Number(s.match(/class="guide guide-reference" x1="10" y1="([\d.]+)"/)[1]);
      assert.equal(y(normal),y(zoom));
      assert.match(zoom,/>50<\/text>/);
    }
  }
  const original=charts.lineChart(n.rsi14,[{key:'value',cls:'line-rsi'}],[],{kind:'rsi',width:360});
  assert.match(original,/viewBox="0 0 360\.00 142"/,'embedded RSI dimensions stay unchanged');
});

test('long 200-candle opt-in zoom uses 3750x350 native geometry with no invented MA or volume',()=>{
  const verified=display.validateLongCandles(longHistory,historicalDetail);
  assert.equal(verified.ok,true,verified.reason);
  const source=JSON.stringify(verified.rows);
  const zoom=charts.candlestickChart(verified.rows,{width:3750,height:350});
  assert.match(zoom,/viewBox="0 0 3750\.00 350"/);
  assert.equal((zoom.match(/class="body-(up|down)"/g)||[]).length,200);
  assert.doesNotMatch(zoom,/class="ma5"|class="ma25"|class="ma75"|volume|NaN|Infinity/);
  assert.equal(JSON.stringify(verified.rows),source);
  const embedded=charts.candlestickChart(verified.rows,{width:1500});
  assert.match(embedded,/viewBox="0 0 1500\.00 294"/,'normal display preserved');
});

test('fund trend can redraw same observed NAV values without increasing chart Y at 250%',()=>{
  const a=index.indexOf('function coreTrendSvg('),b=index.indexOf('\nasync function ensureIndiaCoreHistory()',a);
  assert.ok(a>0&&b>a);
  const sandbox=vm.createContext({
    hasFiniteValue:x=>typeof x==='number'&&Number.isFinite(x),
    fmt:(x)=>Number(x).toLocaleString('ja-JP'),
    fmtJstShort:x=>x.slice(5).replace('-','/'),
    referenceText:String
  });
  vm.runInContext(index.slice(a,b),sandbox);
  const history=[1000,1100,1080,1250,1200].map((nav_yen,i)=>({
    date:'2026-10-'+String(i+1).padStart(2,'0'),nav_yen
  }));
  const baseline=vm.runInContext('coreTrendSvg',sandbox)(history,[]);
  const zoom=vm.runInContext('coreTrendSvg',sandbox)(history,[],{width:900,height:480});
  assert.match(baseline,/viewBox="0 0 680 640"/);
  assert.match(zoom,/viewBox="0 0 900 480"/);
  assert.match(zoom,/class="line-core"/);
  assert.doesNotMatch(zoom,/NaN|Infinity/);
});

function modalHarness(){
  const listeners={},events={},renders=[];
  let focusRestored=0,focusInitial=0;
  const svg={getAttribute:k=>k==='width'?'313':null,cloneNode:()=>({clone:true})};
  const source={querySelector:s=>s==='svg'?svg:null,closest:()=>null};
  const content={
    style:{width:'360px',vars:{},setProperty(k,v){this.vars[k]=v;}},
    innerHTML:'',
    replaceChildren(node){this.original=node;}
  };
  const body={clientWidth:360,scrollLeft:0,
    get scrollWidth(){return Math.max(360,Number.parseFloat(content.style.width)||360);},
    addEventListener:(type,fn)=>{events[type]=fn;}
  };
  const zoomLabel={textContent:''},closeButton={focus(){focusInitial++;}},title={textContent:''};
  const targets={
    '.ix-modal-body':body,'.ix-modal-content':content,'.ix-zoom-label':zoomLabel,
    '.ix-close':closeButton,'#ixModalTitle':title
  };
  const overlay={
    hidden:true,
    setAttribute(){},
    addEventListener(type,fn){listeners[type]=fn;},
    querySelector(selector){return targets[selector]||null;}
  };
  const document={
    activeElement:null,
    body:{classList:{add(){},remove(){}},appendChild(){}},
    getElementById(id){return id==='rsiChart'?source:null;},
    createElement(){return overlay;},
    addEventListener(type,fn){events['document:'+type]=fn;}
  };
  const win={document,innerHeight:844,addEventListener(type,fn){events['window:'+type]=fn;}};
  const trigger={focus(){focusRestored++;}};
  const controller=display.createController(win,{renderExpandedChart:(id,width,height)=>{
    renders.push({id,width,height});
    return '<svg viewBox="0 0 '+width+' '+height+'"></svg>';
  }});
  const click=key=>{
    const button=key==='fit'?{}:{dataset:{ixZoom:key}};
    listeners.click({target:{
      closest(sel){
        if(key==='fit')return sel==='[data-ix-fit]'?button:null;
        return sel==='[data-ix-zoom]'?button:null;
      }
    }});
  };
  return {controller,trigger,overlay,body,content,zoomLabel,renders,events,listeners,
    click,restored:()=>focusRestored,initialFocused:()=>focusInitial};
}

test('actual modal controller keeps controls visible and fixed SVG Y across + to 250%',()=>{
  const h=modalHarness();
  assert.equal(h.controller.open('rsiChart',h.trigger),true);
  assert.equal(h.initialFocused(),1);
  assert.equal(h.renders[0].height,260);
  assert.equal(h.renders[0].width,344);
  for(let i=0;i<6;i++)h.click('1');
  const last=h.renders.at(-1);
  assert.equal(last.height,260);
  assert.equal(last.width,884);
  assert.equal(h.zoomLabel.textContent,'250%');
  assert.equal(h.content.style.vars['--ix-chart-height'],'260px');
  assert.equal(h.content.style.width,'900px');
  assert.equal(h.body.scrollLeft,540,'latest edge still visible at 250%');
  h.click('fit');
  assert.equal(h.zoomLabel.textContent,'100%');
  assert.equal(h.renders.at(-1).height,260);
  h.controller.close();
  assert.equal(h.overlay.hidden,true);
  assert.equal(h.restored(),1);
});

test('iPhone two-finger pinch affects chart only and Safari gesture defaults are suppressed',()=>{
  const h=modalHarness();
  h.controller.open('rsiChart',h.trigger);
  let pinchStart=false,pinchMove=false,gestureDefault=false;
  const t0=[{clientX:0,clientY:0},{clientX:100,clientY:0}];
  const t1=[{clientX:0,clientY:0},{clientX:150,clientY:0}];
  h.events.touchstart({touches:t0,preventDefault(){pinchStart=true;}});
  h.events.touchmove({touches:t1,preventDefault(){pinchMove=true;}});
  h.listeners.gesturestart({preventDefault(){gestureDefault=true;}});
  assert.equal(pinchStart,true);
  assert.equal(pinchMove,true);
  assert.equal(gestureDefault,true);
  assert.equal(h.zoomLabel.textContent,'150%');
  assert.equal(h.renders.at(-1).height,260);
  assert.equal(h.renders.at(-1).width,524);
  h.controller.close();
});

test('regression: dialog cannot grow to 250% viewport height or widen its header',()=>{
  const css=fs.readFileSync('chart-experience.css','utf8');
  const js=fs.readFileSync('chart-experience.js','utf8');
  assert.match(css,/height:var\(--ix-chart-height,300px\)!important/);
  assert.match(css,/\.ix-modal-panel\{[^}]*height:auto;max-height:92vh/);
  assert.match(css,/\.ix-modal-body\{[^}]*min-width:0;width:100%;max-width:100%/);
  assert.doesNotMatch(css,/\.ix-modal-content svg\{[^}]*height:auto!important/);
  assert.match(js,/gesturestart/);
  assert.match(js,/passive:false/);
  assert.match(index,/createController\(window,\{renderExpandedChart\}\)/);
  assert.match(index,/function renderExpandedChart\(id,width,height\)/);
});

test('display-only fix neither writes nor backfills nor touches other PWA storage',()=>{
  const chartJs=fs.readFileSync('chart-experience.js','utf8');
  for(const pat of [/\bfetch\s*\(/,/\blocalStorage\b/,/\bsessionStorage\b/,
    /clearSiteData/,/caches\.delete/,/GITHUB_ACTIONS_TOKEN/,/update_market\.py/]){
    assert.doesNotMatch(chartJs,pat);
  }
  assert.match(index,/candleSnapshotKey\(\)/);
  assert.match(index,/EXTERNAL_TRIGGER/);
});

test('detached dialog retains RSI 50, final NIFTY point, MACD and support labels',()=>{
  const css=fs.readFileSync('chart-experience.css','utf8');
  for(const selector of [
    '.ix-modal .chart text.guide-reference-label',
    '.ix-modal .chart .guide.guide-reference',
    '.ix-modal .chart .last-nifty-dot',
    '.ix-modal .chart .support-visual',
    '.ix-modal .chart.chart-nifty text.support-label',
    '.ix-modal .chart .macd-positive',
    '.ix-modal .chart .macd-negative',
    '.ix-modal .chart.core-trend-chart text'
  ])assert.ok(css.includes(selector),selector+' must have a scoped display style');
  assert.match(css,/\.ix-modal \.chart text\.guide-reference-label\{[^}]*font-size:11px/);
  assert.match(css,/\.ix-modal \.chart \.last-nifty-dot\{fill:var\(--c-nifty\)/);
  assert.match(css,/\.ix-modal \.chart \.macd-positive\{fill:#4fbeaf\}/);
  assert.match(css,/\.ix-modal \.chart \.macd-negative\{fill:#bc8da0\}/);
  assert.doesNotMatch(css,/html\s*\{[^}]*zoom:/);
});

test('landscape viewport Y geometry uses the same height as the modal CSS even below normal chart height',()=>{
  const viewHeight=390,viewWidth=844;
  const cases=[
    ['rsiChart','rsi',market.chart_data.nifty.rsi14,[{key:'value',cls:'line-rsi'}]],
    ['macdChart','macd',market.chart_data.nifty.macd_hist,[{key:'value',cls:'line-macd'}]],
    ['niftyChart','nifty',market.chart_data.nifty.price,[{key:'close',cls:'line-main'}]],
  ];
  for(const [id,kind,rows,series] of cases){
    const shape=display.expandedGeometry(id,viewWidth,viewHeight,2.5);
    assert.equal(shape.height,190,id+' should fit short viewport');
    const markup=charts.lineChart(rows,series,[],{kind,width:shape.width-16,height:shape.height});
    assert.match(markup,/height="190" viewBox="0 0 /);
    assert.match(markup,/ 190" preserveAspectRatio=/,'SVG and CSS height must match');
  }
  const candleRows=display.validateLongCandles(longHistory,historicalDetail).rows;
  const geom=display.expandedGeometry('detailCandleChart',viewWidth,viewHeight,2.5,1500);
  assert.equal(geom.height,190);
  assert.match(charts.candlestickChart(candleRows,{width:geom.width-16,height:geom.height}),/height="190"/);
  const a=index.indexOf('function coreTrendSvg('),b=index.indexOf('\nasync function ensureIndiaCoreHistory()',a);
  const sandbox=vm.createContext({hasFiniteValue:x=>typeof x==='number'&&Number.isFinite(x),
    fmt:String,fmtJstShort:String,referenceText:String});
  vm.runInContext(index.slice(a,b),sandbox);
  const rows=[1000,1080,990,1050].map((nav_yen,i)=>({date:'2026-10-0'+(i+1),nav_yen}));
  const fund=display.expandedGeometry('indiaCoreTrendChart',viewWidth,viewHeight,2.5);
  assert.equal(fund.height,190);
  assert.match(vm.runInContext('coreTrendSvg',sandbox)(rows,[],{width:fund.width,height:fund.height}),/viewBox="0 0 \d+ 190"/);
});
test('detached indicators dialog inherits the same subdued series palette as the embedded tab',()=>{
  const css=fs.readFileSync('chart-experience.css','utf8');
  const expected=['--c-nifty:#80b6ff','--c-ma5:#dfb255','--c-ma25:#35baa5','--c-ma75:#8b9ab0','--c-macd:#ad9bd9'];
  for(const token of expected){
    assert.ok(index.includes(token),'inline indicator palette should define '+token);
    assert.ok(css.includes(token),'standalone modal should reuse '+token);
  }
  assert.match(css,/\.ix-modal\{--c-nifty:/);
});
