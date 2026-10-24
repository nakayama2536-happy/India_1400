'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html','utf8');
const sw = fs.readFileSync('sw.js','utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const version = fs.readFileSync('VERSION','utf8');
const between = (a,b) => {
  const start=html.indexOf(a),end=html.indexOf(b,start+a.length);
  assert.ok(start>=0&&end>start,a+' / '+b);
  return html.slice(start,end);
};
const hero = between('<div id="decisionCard"','<div class="card fund-trend-card">');
const style = between('/* UI 5.51: iPhone 17 readability','</style>');
const cssRule = selector => {
  const i=style.indexOf(selector+'{');
  assert.ok(i>=0,'missing css selector: '+selector);
  return style.slice(i,style.indexOf('}',i)+1);
};

test('compact judgment retains dynamic action and all four always-visible safety statuses',()=>{
  assert.match(hero,/id="actionLabel"/);
  assert.match(hero,/id="marketStage"/);
  for(const id of ['checkWindowState','marketState','qualityGate','forecastConsensus','nextAction']){
    assert.equal((hero.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  const status=hero.slice(hero.indexOf('class="statusline"'),hero.indexOf('id="nextAction"'));
  assert.doesNotMatch(status,/<details\b/,'quality, eligibility and forecast states cannot be hidden');
  assert.match(html,/setText\("nextAction","次の確認："\+cw\.action\)/); // Presentation prefix only; action source unchanged.
});

test('forecast reference warning, date and detailed provenance are retained',()=>{
  assert.match(hero,/予測は参考値・売買条件ではありません/);
  assert.match(hero,/id="forecastBasisNote"/);
  assert.match(hero,/id="forecastDetailsNote"/);
  assert.match(hero,/過去の類似テクニカル局面による統計的な目安/);
  assert.ok(hero.indexOf('id="forecastBasisNote"')<hero.indexOf('<details class="decision-more">'));
  assert.ok(hero.indexOf('id="nextAction"')<hero.indexOf('<details class="decision-more">'));
  assert.match(html,/setText\("forecastBasisNote","予測基準日 "/);
  assert.match(html,/setText\("forecastDetailsNote","予測基準日："/);
  assert.match(html,/market\?\.generated_at_jst/);
  assert.doesNotMatch(hero,/2026-10-23/,'stored reference date must never be baked into app shell');
});

test('iPhone judgment headline is calm, not extra bold',()=>{
  const css=cssRule('#page-decision #decisionCard .decision');
  assert.match(css,/font-size:clamp\(26px,6\.6vw,30px\)/);
  assert.match(css,/font-weight:600/);
  assert.match(css,/line-height:1\.4/);
  assert.doesNotMatch(css,/font-weight:(?:8\d\d|9\d\d)/);
});

test('five bottom tabs remain readable even below 430px and keep safe area',()=>{
  const tabs=between('<nav class="tabs">','<div id="toast"');
  assert.equal((tabs.match(/class="tab(?: active)?"/g)||[]).length,5);
  for(const label of ['判断','購入状況','指標','予測','管理'])assert.ok(tabs.includes('>'+label+'</button>'),label);
  const tabRule=cssRule('.tabs .tab');
  assert.match(tabRule,/font-size:clamp\(13px,3\.65vw,15px\)/);
  assert.match(tabRule,/min-height:50px/);
  assert.match(tabRule,/font-weight:720/);
  assert.match(html,/padding:7px 8px calc\(7px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(html,/padding:calc\(env\(safe-area-inset-top\) \+ 14px\)/);
  assert.match(style,/\.tabs \.tab:focus-visible/);
});

test('forecast card text separates percentage for readability without changing numbers',()=>{
  const source=between('function forecastCard(h,label)','\nfunction conditionRows(');
  assert.match(source,/ret-label/);
  assert.match(source,/ret-value/);
  assert.match(source,/signedHtml\(h\.median_return_pct,2,"%"\)/);
  assert.match(source,/fmt\(h\.q25_price,0\)/);
  assert.match(source,/fmt\(h\.q75_price,0\)/);
  assert.match(source,/statistical_reference/);
  const ctx=vm.createContext({
    dirClass:label=>label==='上向き'?'up':'neutral',
    forecastArrow:h=>h.label==='上向き'?'↑':'→',
    signedHtml:(x,dp,suffix)=>x==null?'--':(x>0?'+':'')+Number(x).toFixed(dp)+suffix,
    fmt:(v,dp)=>v==null?'--':Number(v).toLocaleString('ja-JP',{minimumFractionDigits:dp,maximumFractionDigits:dp}),
  });
  vm.runInContext(source,ctx);
  const h={label:'上向き',median_return_pct:0.3,q25_price:22442,q75_price:22802,statistical_reference:'中'};
  const before=JSON.stringify(h);
  const fragment=vm.runInContext('forecastCard',ctx)(h,'1営業日');
  assert.match(fragment,/1営業日/);
  assert.match(fragment,/上向き/);
  assert.match(fragment,/\+0\.30%/);
  assert.match(fragment,/22,442～22,802/);
  assert.match(fragment,/参考度 中/);
  assert.equal(JSON.stringify(h),before,'must not mutate forecast source');
  assert.match(vm.runInContext('forecastCard',ctx)(null,'14営業日'),/>--<\/span>/);
});

test('quality states and next check are not sacrificed for shorter explanatory text',()=>{
  assert.match(html,/function renderClockDependent\(\)/);
  assert.match(html,/const cw=checkWindowStatus\(\)/);
  assert.match(html,/setText\("checkWindowState",cw\.label\)/);
  assert.match(html,/setText\("nextAction","次の確認："\+cw\.action\)/);
  assert.match(html,/function runtimeSnapshotFreshness\(\)/);
  assert.match(html,/decisionDisplayEligible\(g,q,market\?\.execution_plan\)/);
  assert.match(html,/setText\("qualityGate",runtimeStale/);
  assert.match(hero,/id="qualityGate"/);
  assert.doesNotMatch(style,/\bdisplay\s*:\s*none\b/,'do not visually erase warnings');
});

test('large values fit independently of global forecast-review cards',()=>{
  const css=cssRule('#page-decision #forecastCards .ret-value');
  assert.match(css,/white-space:nowrap/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
  assert.match(style,/#page-decision #forecastCards \.range/);
  assert.match(style,/@media\(max-width:359px\)/);
  assert.doesNotMatch(style,/\.forecast\s*\{[^}]*display:none/);
});

test('versioned PWA shell only changes display, not private or market sources',()=>{
  assert.match(version,/UI_VERSION=5\.54/);
  assert.match(html,/v5\.54/);
  assert.match(manifest.start_url,/v=5\.54/);
  assert.match(sw,/india1400-v5-54-/);
  assert.match(sw,/"\.\/\?v=5\.54"/);
  assert.match(sw,/key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(sw,/caches\.match\s*\(/);
  assert.doesNotMatch(sw,/caches\.keys\(\)[\s\S]*localStorage\.clear/);
  assert.match(html,/id="purchaseProgress"/);
  assert.match(html,/id="deepDiveReviewPanel"/);
  assert.match(html,/id="niftyChart"/);
  assert.match(html,/id="rsiChart"/);
  assert.match(html,/id="macdChart"/);
});
