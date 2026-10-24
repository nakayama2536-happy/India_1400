'use strict';
// UI-only regression; actual iPhone 17 acceptance is a separate gate.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('cross-tab-readability.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=fs.readFileSync('VERSION','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
function rule(selector){
 const i=css.indexOf(selector+'{');
 assert.ok(i>=0,'Missing CSS: '+selector);
 return css.slice(i,css.indexOf('}',i)+1);
}
function page(id){
 const start=html.indexOf('<section id="page-'+id+'"'),end=html.indexOf('</section>',start);
 assert.ok(start>=0&&end>start,id);
 return html.slice(start,end);
}
test('four additional tabs have scoped readability without changing decision or five-tab shell',()=>{
 for(const id of ['purchase','indicators','forecast','detail']){
  assert.equal((html.match(new RegExp('id="page-'+id+'"','g'))||[]).length,1,id);
  assert.ok(css.includes('#page-'+id),id);
 }
 assert.match(html,/<link rel="stylesheet" href="cross-tab-readability\.css">/);
 assert.match(sw,/"cross-tab-readability\.css"/);
 assert.match(version,/UI_VERSION=5\.54/);
 assert.match(html,/<span class="version-badge">v5\.54<\/span>/);
 assert.match(manifest.start_url,/v=5\.54/);
 assert.match(sw,/india1400-v5-54-/);
 for(const id of ['decisionCard','qualityGate','globalReferenceTimes','decisionReasonsPanel','forecastCards']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 const nav=html.slice(html.indexOf('<nav class="tabs">'),html.indexOf('<div id="toast"'));
 assert.equal((nav.match(/class="tab(?: active)?"/g)||[]).length,5);
 assert.match(html,/env\(safe-area-inset-bottom\)/);
});
test('purchase keeps stage-by-stage local records and enlarges the execution date and reasons',()=>{
 const p=page('purchase');
 for(const id of ['purchaseProgress','nextPurchaseCheck','nextPurchaseReason','purchaseUpdated','resetPurchaseBtn','decisionTranchePlan']){
  assert.match(p,new RegExp('id="'+id+'"'));
 }
 assert.match(rule('#page-purchase #purchaseProgress .tranche-toggle'),/min-height:100px/);
 assert.match(rule('#page-purchase #purchaseProgress .tdate'),/font-size:14px/);
 assert.match(rule('#page-purchase .tranche-plan-card .tranche-plan-next'),/font-size:15px/);
 assert.match(rule('#page-purchase .condition-detail'),/font-size:14px/);
 assert.match(html,/const PURCHASE_STATE_KEY="india1400\.purchaseProgress\.v1"/);
 assert.match(html,/confirmTrancheChange\(Number\(btn\.dataset\.tranche\)\)/);
 assert.match(html,/decisionDisplayEligible\(g,q,plan\)/);
});
test('technical charts and zoom remain while metadata, legends and disclosures are legible',()=>{
 const p=page('indicators');
 for(const id of ['niftyChart','rsiChart','macdChart','niftyMetrics','niftyDetailPanel',
   'candlePeriodSelect','externalMetrics','usdChart','brentChart','vixChart']){
  assert.match(p,new RegExp('id="'+id+'"'));
 }
 assert.match(rule('#page-indicators .indicators-panel .chart-title'),/font-size:18px/);
 assert.match(css,/#page-indicators \.indicators-panel \.chart-meta\{font-size:14px/);
 assert.match(rule('#page-indicators .chart-help>.body'),/font-size:14px/);
 assert.match(rule('#page-indicators .ix-expand'),/min-height:46px/);
 assert.match(p,/data-ix-expand="niftyChart"/);
 assert.match(p,/data-ix-expand="detailCandleChart"/);
 assert.doesNotMatch(css,/\.chart\{[^}]*height\s*:/);
});
test('three forecast verification horizons remain, including missing/insufficient evidence',()=>{
 const p=page('forecast');
 for(const id of ['verificationSummary','verificationNote','forecastBasis','forecastWarning']){
  assert.match(p,new RegExp('id="'+id+'"'));
 }
 assert.match(rule('#page-forecast #verificationSummary'),/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/#page-forecast #verificationSummary \.range,/);
 assert.match(css,/@media\(max-width:359px\)/);
 assert.match(html,/card\(1\)\+card\(3\)\+card\(14\)/);
 assert.match(html,/検証待ち・予測精度は未評価/);
 assert.match(html,/各期間30件でも自動採用しません/);
});
test('management keeps timestamps, quality evidence, diagnosis and user-only evaluation',()=>{
 const p=page('detail');
 for(const id of ['qualityPanel','qualityTopSummary','captureEvidence','qualityReasons','dataTimes',
   'historyStatus','audit','deepDivePanel','deepDiveBuildBtn','updateDiagnosticPanel',
   'diagnosticStatus','deepDiveReviewPanel','deepDiveReviewNote','deepDiveReviewSaveBtn','deepDiveReviewImportFile']){
  assert.match(p,new RegExp('id="'+id+'"'));
 }
 assert.match(rule('#page-detail .quality-top-summary'),/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(rule('#page-detail .quality-top-summary .ix-quality-tile b'),/font-size:17px/);
 assert.match(rule('#page-detail .ix-evidence'),/font-size:14px/);
 assert.match(css,/#page-detail \.deep-dive-actions button,/);
 assert.match(rule('#page-detail .review-utility'),/min-height:50px/);
 assert.match(html,/data-quality-target/);
 assert.match(html,/data-review-utility="useful"/);
});
test('presentation neither hides operational warnings nor assigns new data-state colors',()=>{
 assert.doesNotMatch(css,/\bdisplay\s*:\s*none\b|\bvisibility\s*:\s*hidden\b|\bopacity\s*:\s*0\b|\bpointer-events\s*:\s*none\b/);
 assert.doesNotMatch(css,/\.status-tile\.(?:good|warn|bad)\b|\.quality-top-item\.(?:ok|warn|ng)\b/);
 assert.doesNotMatch(css,/\blocalStorage\b|\bfetch\s*\(|\bmarket\.json\b/);
 assert.match(sw,/key\.startsWith\(CACHE_PREFIX\)/);
});
