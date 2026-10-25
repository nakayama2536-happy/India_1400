'use strict';
// UI 5.56: all management top-level cards disclose from the outer frame.
// Review state, storage, diagnostics and market calculations are not reimplemented here.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('action-affordance.css','utf8');
const from='<section id="page-detail" class="page">';
const management=html.slice(html.indexOf(from),html.indexOf('</section>',html.indexOf(from)));

test('NIFTY primary zoom button sits to the left below price heading',()=>{
 const a=html.indexOf('<div class="chart-card indicator-primary">');
 const b=html.indexOf('<div class="chart-card indicator-secondary">',a);
 assert.ok(a>0&&b>a);
 const graph=html.slice(a,b);
 assert.match(graph,/<div class="indicator-primary-actions"><button[^>]*data-ix-expand="niftyChart"[^>]*>拡大<\/button><\/div>\s*<div id="niftyChart">/);
 assert.match(css,/#page-indicators \.indicator-primary \.indicator-primary-actions\{display:flex;justify-content:flex-start/);
 assert.match(css,/#page-indicators \.indicator-primary \.indicator-primary-actions \.ix-expand\{margin-left:0\}/);
 assert.match(html,/<div class="card indicators-panel">/);
});

test('three management cards have an entire visible and tappable disclosure header',()=>{
 assert.ok(management.includes('<details id="qualityPanel" class="card management-fold">'));
 assert.ok(management.includes('<details id="deepDivePanel" class="card management-fold">'));
 assert.ok(management.includes('<details class="card management-fold" id="updateDiagnosticPanel">'));
 assert.equal((management.match(/class="card management-fold"/g)||[]).length,3);
 for(const label of ['データ品質・取得状況','ChatGPT 深掘り分析','データ更新の調査・対策']){
  assert.ok(management.includes(label));
 }
 assert.match(css,/details\.management-fold>summary\{/);
 assert.match(css,/display:block;width:100%;min-height:84px/);
 assert.match(css,/details\.management-fold\[open\]>summary/);
 assert.match(css,/details\.management-fold>summary::after/);
 assert.match(css,/details\.management-fold>\.body/);
});

test('evaluation is nested in deep dive, including all saved review controls',()=>{
 const stack=[];
 let reviewFound=false;
 const tag=/<(\/)?(details|div)\b([^>]*)>/g;
 for(const m of management.matchAll(tag)){
  if(!m[1]){
   const id=(m[3].match(/\bid="([^"]+)"/)||[])[1]||'';
   if(id==='deepDiveReviewPanel'){
    assert.equal(m[2],'details');
    assert.ok(stack.some(t=>t.tag==='details'&&t.id==='deepDivePanel'));
    reviewFound=true;
   }
   stack.push({tag:m[2],id});
  }else{
   const last=stack.pop();
   assert.ok(last, 'extra closing '+m[2]);
   assert.equal(last.tag,m[2], 'incorrect nesting near '+m.index);
  }
 }
 assert.equal(stack.length,0,'management markup must be balanced');
 assert.ok(reviewFound,'review section missing');
 for(const id of ['deepDiveReviewState','deepDiveReviewNote','deepDiveReviewSaveBtn',
    'deepDiveReviewCopyBtn','deepDiveReviewBackupBtn','deepDiveReviewImportBtn','deepDiveReviewImportFile']){
  assert.ok(management.includes('id="'+id+'"'),id);
 }
 assert.match(css,/details\.management-review-subsection>summary/);
 assert.doesNotMatch(management,/<h2>深掘り結果の評価<\/h2>/);
});

test('purpose and manual ChatGPT handoff are explicit; other operations are unchanged',()=>{
 for(const word of ['RSI・MACD','1・3・14営業日','14時判定','データ品質','自動送信・自動売買は行わず']){
  assert.ok(management.includes(word)||management.includes(word.replace('14時','3分割の')),word);
 }
 for(const id of ['qualityTopSummary','captureEvidence','dataTimes','deepDiveBuildBtn',
  'deepDiveShareBtn','deepDiveSaveBtn','deepDiveCopyBtn','diagnosticBuildBtn',
  'diagnosticWorkflowBtn','diagnosticReloadBtn']){
  assert.ok(management.includes('id="'+id+'"'),id);
 }
 assert.match(html,/function openDeepDivePanel\(\)\{[^}]*panel\.open=true;/);
 assert.match(html,/id="deepDiveReviewPanel"/);
 assert.doesNotMatch(css,/\b(?:fetch|localStorage|sessionStorage)\s*\(/);
});
