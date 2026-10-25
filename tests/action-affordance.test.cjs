'use strict';
// UI 5.55 contract: this tests semantics and style without changing trading logic.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('action-affordance.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=fs.readFileSync('VERSION','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const page=id=>html.slice(html.indexOf('<section id="page-'+id+'"'),html.indexOf('</section>',html.indexOf('<section id="page-'+id+'"')));
const hasRule=s=>css.includes(s);
test('five tabs share a visible action distinction and no new runtime script',()=>{
 for(const p of ['decision','purchase','indicators','forecast','detail']){
  assert.match(html,new RegExp('id="page-'+p+'"'));
  assert.ok(page(p).length>100);
 }
 assert.match(html,/<link rel="stylesheet" href="cross-tab-readability\.css">\s*<link rel="stylesheet" href="action-affordance\.css">/);
 assert.match(sw,/"cross-tab-readability\.css", "action-affordance\.css"/);
 assert.match(version,/UI_VERSION=5\.55/);
 assert.match(html,/<title>India 14:00 Check v5\.55<\/title>/);
 assert.match(html,/<span class="version-badge">v5\.55<\/span>/);
 assert.match(manifest.start_url,/v=5\.55/);
 assert.match(sw,/india1400-v5-55-/);
 assert.match(css,/\.tabs \.tab\.active\{/);
 assert.match(css,/\.tabs \.tab\{/);
 assert.match(html,/calc\(7px \+ env\(safe-area-inset-bottom\)\)/);
 const nav=html.slice(html.indexOf('<nav class="tabs">'),html.indexOf('<div id="toast"'));
 assert.equal((nav.match(/class="tab(?: active)?"/g)||[]).length,5);
});
test('real action buttons have arrow, raised surface and disabled distinction',()=>{
 assert.ok(hasRule('button.primary:not(:disabled)'));
 assert.ok(hasRule('button.secondary:not(:disabled)'));
 assert.match(css,/min-height:50px/);
 assert.match(css,/button:is\(\.primary,\.secondary\):not\(:disabled\)::after\{content:"›"/);
 assert.match(css,/button:is\(\.primary,\.secondary\):disabled::after\{content:none\}/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/touch-action:manipulation/);
 for(const id of ['qualityDetailsBtn','deepDiveTriggerOpenBtn','refreshBtn','updateBtn',
   'deepDiveBuildBtn','deepDiveShareBtn','diagnosticBuildBtn','deepDiveReviewSaveBtn']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
});
test('read-only decision, quality and forecast surfaces are not styled as actionable controls',()=>{
 for(const c of ['.metric','.forecast','.status-tile','.ref-compact-item','.note','.next-check','.tranche-plan-card','.fund-main','.fund-stat','.dr-row']){
  assert.ok(css.includes(c),c);
 }
 assert.match(css,/\.app \.statusline \.pill/);
 assert.match(css,/#page-decision \.next-action\{/);
 for(const s of ['#forecastCards','globalReferenceTimes','yenMetrics','marketSupplementMetrics',
   'decisionReasonsPanel','verificationSummary']){
  assert.match(html,new RegExp('(?:id="'+s.replace('#','')+'")'));
 }
 assert.doesNotMatch(css,/\.status-tile(?:\.good|\.warn|\.bad)|\.quality-top-item(?:\.ok|\.warn|\.ng)/);
 assert.doesNotMatch(css,/\bfetch\s*\(|\blocalStorage\s*[=(]|\bmarket\.json\b/);
 assert.match(html,/緑でも購入可能という意味ではありません/);
});
test('all disclosure content remains and each tap target has explicit closed/open affordance',()=>{
 for(const s of ['details:not(.chart-help)>summary','details[open]:not(.chart-help)>summary::after',
  'details.chart-help>summary','details:not(.chart-help)>summary::after'])assert.ok(hasRule(s),s);
 assert.match(css,/content:"＋"/);
 assert.match(css,/content:"−"/);
 for(const s of ['詳細を見る','自動サポートラインの見方','為替の影響の見方',
  '市場補足の見方','NIFTY 詳細チャートを見る','予測の読み方','前回14:00比較を見る',
  '判定条件・計算根拠を見る']){
  assert.ok(html.includes(s)||fs.readFileSync('decision-reasons.js','utf8').includes(s),s);
 }
 assert.match(css,/padding-right:49px!important/);
});
test('interactive purchase and quality records have explicit action cues but keep state truth',()=>{
 assert.match(html,/class="tranche-box tranche-toggle \$\{done\?"done":"pending"\}"/);
 assert.match(css,/#purchaseProgress \.tranche-toggle\.pending::after\{content:"記録する ›"\}/);
 assert.match(css,/#purchaseProgress \.tranche-toggle\.done::after\{content:"変更する ›"\}/);
 assert.match(css,/#page-detail \.quality-top-summary button\.ix-quality-tile::after/);
 assert.match(css,/content:"詳細を見る ›"/);
 assert.match(html,/data-quality-target/);
 assert.match(html,/confirmTrancheChange\(Number\(btn\.dataset\.tranche\)\)/);
 assert.match(html,/aria-pressed/);
 assert.match(html,/decisionDisplayEligible\(g,q,plan\)/);
});
test('evaluation choice selection remains clear and data colors remain unchanged',()=>{
 const detail=page('detail');
 assert.match(detail,/data-review-utility="useful"/);
 assert.match(detail,/data-review-utility="reference"/);
 assert.match(detail,/data-review-utility="noise"/);
 assert.match(css,/#page-detail button\.review-utility\.selected::before\{content:"✓"\}/);
 assert.match(css,/#page-detail button\.review-utility::before\{content:"○"/);
 assert.match(css,/#page-detail \.quality-top-summary button\.ix-quality-tile\{/);
 assert.match(html,/id="deepDiveReviewState"/);
 assert.match(css,/\.app a\.fund-source\{text-decoration:underline/);
 assert.match(sw,/key\.startsWith\(CACHE_PREFIX\)/);
 // Only the native disclosure triangle may be hidden, never safety state or data.
 assert.match(css,/>summary::-webkit-details-marker\{display:none\}/);
 const visible=css.replace(/\.app \.page details:not\(\.chart-help\)>summary::-webkit-details-marker\{display:none\}/g,'');
 assert.doesNotMatch(visible,/\bdisplay\s*:\s*none\b|\bvisibility\s*:\s*hidden\b|\bopacity\s*:\s*0\b/);
});
