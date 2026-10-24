'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html','utf8');
const reasonCss = fs.readFileSync('decision-reasons.css','utf8');
const version = fs.readFileSync('VERSION','utf8');
const sw = fs.readFileSync('sw.js','utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const marker = '/* UI 5.53: shared visual hierarchy';
const start = html.indexOf(marker);
assert.ok(start>=0,'UI 5.53 scoped CSS missing');
const end=html.indexOf('</style>',start);
assert.ok(end>start,'style closure missing');
const css=html.slice(start,end);
const reasonStart=reasonCss.indexOf('/* UI 5.53: align decision evidence');
assert.ok(reasonStart>=0);
const reasons=reasonCss.slice(reasonStart);
const cssHas=(text,selector)=>text.includes(selector+'{');
const domIds=[
  'decisionCard','forecastCards','forecastBasisNote','forecastDetailsNote','checkWindowState','marketState',
  'qualityGate','forecastConsensus','nextAction','indiaCoreCard','globalReferenceTimes','qualityDetailsBtn',
  'deepDiveTriggerCard','deepDiveTriggerCategories','deepDiveTriggerReasons','deepDiveTriggerOpenBtn',
  'yenMetrics','yenSummary','marketSupplementStatus','marketSupplementMetrics',
  'decisionReasonsPanel','purchaseProgress','deepDiveReviewPanel',
];
const selectors=[
  '#page-decision .global-status-card .ref-compact-label',
  '#page-decision .global-status-card .ref-compact-time',
  '#page-decision .global-status-card .ref-compact-status',
  '#page-decision .global-status-card .ref-compact-detail',
  '#page-decision #deepDiveTriggerCategories .status-tile',
  '#page-decision #yenMetrics .status-tile',
  '#page-decision #yenSummary',
  '#page-decision #marketSupplementStatus',
  '#page-decision #marketSupplementMetrics .metric .label',
  '#page-decision #marketSupplementMetrics .metric .value',
  '#page-decision #marketSupplementMetrics .metric .detail',
  '#page-decision details.supplement>summary',
  '#page-decision details.supplement>.body',
];

test('a single, app-scoped typography contract covers all remaining screenshot sections',()=>{
  for(const id of domIds)
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  for(const name of ['--ui53-section:21px','--ui53-label:14px','--ui53-value:18px',
    '--ui53-status:14px','--ui53-body:14px','--ui53-line:1.7'])
    assert.ok(css.includes(name),name);
  for(const selector of selectors)
    assert.ok(cssHas(css,selector),selector);
  assert.match(css,/@media\(max-width:599px\)/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html,/<nav class="tabs"><div class="tabbar">/);
  assert.equal((html.slice(html.indexOf('<nav class="tabs">'),html.indexOf('<div id="toast"')).match(/class="tab(?: active)?"/g)||[]).length,5);
});

test('reference and risk statuses are visible and wrap, not clipped to ellipses',()=>{
  for(const sel of ['ref-compact-label','ref-compact-time']){
    const i=css.indexOf('.'+sel+'{');
    assert.ok(i>=0,sel);
    const block=css.slice(i,css.indexOf('}',i)+1);
    assert.match(block,/overflow:visible/);
    assert.match(block,/text-overflow:clip/);
    assert.match(block,/overflow-wrap:anywhere/);
  }
  for(const name of ['#deepDiveTriggerCategories','#yenMetrics','#marketSupplementMetrics','#globalReferenceTimes'])
    assert.ok(html.includes('id="'+name.slice(1)+'"'),name);
  assert.match(css,/#page-decision #deepDiveTriggerCategories \.status-tile-status,/);
  assert.match(css,/#page-decision #yenMetrics \.status-tile-status/);
  assert.doesNotMatch(css,/\bdisplay\s*:\s*none\b|opacity\s*:\s*0\b/);
  // Colors represent current eligibility/freshness, and must still come from existing model code.
  assert.match(html,/function referencePresentation\(/);
  assert.match(html,/function runtimeSnapshotFreshness\(/);
  assert.match(html,/setText\("qualityGate",runtimeStale/);
  assert.match(html,/statusTileHtml\(x\.label\|\|"--",x\.active\?"ON":"OFF",state,status,detail\)/);
});

test('formal evidence remains outside optional disclosures and is readable',()=>{
  for(const cls of ['dr-basis','dr-reference','dr-count','dr-label','dr-state',
    'dr-value','dr-alerts','dr-extra','dr-fold>summary','dr-method-body']){
    assert.ok(reasons.includes(cls),cls);
  }
  assert.match(reasons,/\.dr-label\{\s*font-size:16px/);
  assert.match(reasons,/\.dr-state\{\s*min-width:65px;max-width:45%;font-size:14px/);
  assert.match(reasons,/\.dr-value\{\s*font-size:14px/);
  assert.match(reasons,/\.dr-alerts\{\s*font-size:14px/);
  assert.match(reasons,/\.dr-method-body\{\s*font-size:14px/);
  assert.doesNotMatch(reasons,/\bdisplay\s*:\s*none\b/);
  assert.match(html,/class="card decision-reasons"/);
  assert.match(html,/IndiaDecisionReasons\.mount/);
});

test('metric values, zero and missing values are not changed by presentation',()=>{
  const pos=html.indexOf('function metric('),after=html.indexOf('\nfunction ',pos+1);
  assert.ok(pos>0&&after>pos);
  const context=vm.createContext({});
  vm.runInContext(html.slice(pos,after),context);
  const fn=vm.runInContext('metric',context);
  for(const [value,cls] of [['--',''],['0',''],['-0.67%','sign-neg'],['+0.00%','sign-zero']]){
    const item=fn('前回14:00比',value,'前回 22,753 → 今回 22,600','',cls);
    assert.ok(item.includes(value),value);
    assert.match(item,/class="detail">前回 22,753 → 今回 22,600/);
  }
  assert.ok(html.includes('id="marketSupplementMetrics"'));
  assert.ok(html.includes('id="yenMetrics"'));
  assert.ok(html.includes('id="globalReferenceTimes"'));
});

test('detailed disclosures are retained, but made legible without changing market logic',()=>{
  for(const text of ['為替の影響の見方','市場補足の見方','自動サポートラインの見方',
    'インド・コア表示について','詳細を見る','予測は参考値・売買条件ではありません'])
    assert.ok(html.includes(text),text);
  assert.match(css,/#page-decision details\.supplement>summary\{\s*font-size:16px/);
  assert.match(css,/#page-decision details\.supplement>\.body\{\s*font-size:var\(--ui53-body\)/);
  assert.match(html,/id="marketSupplementStatus"/);
  assert.match(html,/id="marketSupplementMetrics"/);
  assert.match(html,/id="forecastDetailsNote"/);
  assert.match(html,/id="decisionBasis"/);
  assert.match(html,/id="qualityGate"/);
  assert.match(html,/id="forecastConsensus"/);
});

test('5.53 release remains confined to own cache and UI; all source contracts unchanged',()=>{
  assert.match(version,/UI_VERSION=5\.53/);
  assert.match(version,/APP_VERSION=5\.7/);
  assert.match(version,/DECISION_GATE_VERSION=5\.1-gate-1/);
  assert.match(html,/India 14:00 Check v5\.53/);
  assert.match(manifest.start_url,/v=5\.53/);
  assert.match(sw,/india1400-v5-53-/);
  assert.match(sw,/"\.\/\?v=5\.53"/);
  assert.match(sw,/key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(sw,/caches\.match\s*\(/);
  assert.match(html,/id="purchaseProgress"/);
  assert.match(html,/id="deepDiveReviewPanel"/);
  assert.match(html,/data-ix-expand="niftyChart"/);
  assert.match(html,/data-ix-expand="indiaCoreTrendChart"/);
  assert.match(html,/function decisionDisplayEligible\(/);
});
