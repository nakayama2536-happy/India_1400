'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const styles=fs.readFileSync('interaction-clarity.css','utf8');
const chart=fs.readFileSync('chart-experience.css','utf8');
const cross=fs.readFileSync('cross-tab-readability.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=fs.readFileSync('VERSION','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));

test('5.55 loads action-vs-display CSS after previous visual contracts and within own offline shell',()=>{
  const links=['decision-reasons.css','chart-experience.css','cross-tab-readability.css','interaction-clarity.css'];
  let prev=-1;
  for(const name of links){
    const marker='<link rel="stylesheet" href="'+name+'">';
    assert.equal(html.split(marker).length-1,1,'style link '+name);
    const at=html.indexOf(marker);assert.ok(at>prev,'link order '+name);prev=at;
  }
  assert.match(sw,/"interaction-clarity\.css"/);
  assert.match(version,/^UI_VERSION=5\.55$/m);
  assert.match(html,/India 14:00 Check v5\.55/);
  assert.match(sw,/india1400-v5-55-/);
  assert.match(sw,/"\.\/\?v=5\.55"/);
  assert.equal(manifest.start_url,'./?v=5.55');
  assert.match(version,/^APP_VERSION=5\.7$/m);
  assert.match(version,/^DECISION_GATE_VERSION=5\.1-gate-1$/m);
});

test('primary, secondary, expand and review actions get distinctly pressable style and focus feedback',()=>{
  for(const marker of ['button.primary,','button.secondary,','button.ix-expand,',
    'button.review-utility{','button.primary{','button.secondary{','button.ix-expand{']){
    assert.ok(styles.includes(marker),'missing action style '+marker);
  }
  assert.match(styles,/border:2px solid var\(--ui55-action-border\)/);
  assert.match(styles,/box-shadow:var\(--ui55-action-shadow\)/);
  assert.match(styles,/button\.primary:not\(:disabled\)::after/);
  assert.match(styles,/button\.secondary:not\(:disabled\)::after/);
  assert.match(styles,/button\.ix-expand::before\{\s*content:"⤢"/);
  assert.match(styles,/button\.primary:active:not\(:disabled\)/);
  assert.match(styles,/button\.primary:disabled/);
  assert.match(styles,/button\.primary:focus-visible/);
  assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html,/id="qualityDetailsBtn" class="secondary"/);
  assert.match(html,/id="deepDiveTriggerOpenBtn" class="secondary"/);
  assert.match(html,/id="refreshBtn" class="secondary"/);
  assert.match(html,/id="updateBtn" class="primary"/);
  for(const id of ['niftyChart','rsiChart','macdChart','indiaCoreTrendChart','detailCandleChart'])
    assert.ok(html.includes('data-ix-expand="'+id+'"'),id);
});

test('disclosures use real summary elements and plus/minus glyphs; chart help retains custom control',()=>{
  for(const label of ['詳細を見る','自動サポートラインの見方','為替の影響の見方',
    'データ品質・取得状況','評価履歴のバックアップ・復元','NIFTY 詳細チャートを見る'])
    assert.ok(html.includes(label),label);
  assert.match(styles,/details:not\(\.chart-help\):not\(\.dr-fold\)>summary::after\{\s*content:"＋"/);
  assert.match(styles,/details:not\(\.chart-help\):not\(\.dr-fold\)\[open\]>summary::after\{content:"−"\}/);
  assert.match(styles,/#page-decision \.decision-reasons details\.dr-fold>summary::after\{\s*content:"＋"/);
  assert.match(styles,/#page-decision \.decision-reasons details\.dr-fold\[open\]>summary::after\{content:"−"\}/);
  assert.match(styles,/#page-indicators details\.chart-help>summary/);
  assert.match(chart,/\.chart-help-action::before/); // Existing own '+' affordance.
  assert.match(styles,/summary:focus-visible/);
});

test('read-only labels and notices are flat, preserve their underlying status words and do not get actions',()=>{
  for(const id of ['checkWindowState','marketState','qualityGate','forecastConsensus']){
    assert.match(html,new RegExp('<span id="'+id+'" class="pill'));
  }
  assert.match(styles,/span\.pill\{\s*box-shadow:none;\s*cursor:default/);
  assert.match(styles,/span\.pill\.ok\{background:/);
  assert.match(styles,/span\.pill\.warn\{background:/);
  assert.match(styles,/span\.pill\.ng\{background:/);
  assert.match(styles,/#page-decision \.next-action,/);
  assert.match(styles,/#page-purchase \.next-check\{/);
  assert.match(styles,/:is\(\.ref-compact-item,\.status-tile,\.metric,\.forecast,\.tranche-plan-card,\.fund-main,\.fund-stat/);
  assert.match(html,/function statusTileHtml\(/);
  assert.match(html,/function compactReferenceHtml\(/);
  assert.match(html,/function runtimeSnapshotFreshness\(/);
  assert.match(html,/setText\("qualityGate",runtimeStale/);
  assert.doesNotMatch(styles,/\.status-tile\.(?:good|warn|bad)\b/,'never overwrite decision-tone CSS');
  assert.doesNotMatch(styles,/\.ref-compact-item\.(?:good|warn|bad)\b/);
});

test('local purchase toggle and quality navigation are conspicuously interactive without changing model state',()=>{
  assert.match(styles,/#page-purchase #purchaseProgress button\.tranche-toggle::after\{\s*content:"記録を変更 ›"/);
  assert.match(styles,/#page-detail button\.ix-quality-tile::after\{\s*content:"詳細を開く ›"/);
  assert.match(styles,/#page-detail button\.ix-quality-tile\{\s*border-width:2px/);
  assert.match(html,/aria-pressed="\$\{done\?"true":"false"\}"/);
  assert.match(html,/confirmTrancheChange\(Number\(btn\.dataset\.tranche\)\)/);
  assert.match(html,/id="qualityTopSummary"/);
  assert.match(html,/data-quality-target/);
  assert.match(html,/function renderQualityOverview\(/);
  assert.match(html,/function renderPurchaseProgress\(/);
  assert.match(styles,/#page-purchase #purchaseProgress button\.tranche-toggle:active/);
  assert.doesNotMatch(styles,/\blocalStorage\b|\bindexedDB\b|\bfetch\s*\(/i);
});

test('review rating shows a selected check but no silent review save or records migration',()=>{
  assert.match(styles,/#page-detail button\.review-utility::before\{\s*content:"○"/);
  assert.match(styles,/#page-detail button\.review-utility\.selected::before\{\s*content:"✓"/);
  for(const name of ['useful','reference','noise'])
    assert.ok(html.includes('data-review-utility="'+name+'"'));
  assert.match(html,/function saveDeepDiveReview\(/);
  assert.match(html,/id="deepDiveReviewSaveBtn"/);
  assert.match(html,/id="deepDiveReviewBackupBtn"/);
});

test('five-tab navigation still switches pages, selected tab visibly differs',()=>{
  const nav=html.slice(html.indexOf('<nav class="tabs">'),html.indexOf('<div id="toast"'));
  assert.equal((nav.match(/class="tab(?: active)?"/g)||[]).length,5);
  for(const label of ['判断','購入状況','指標','予測','管理'])
    assert.ok(nav.includes('>'+label+'</button>'),label);
  assert.match(styles,/nav\.tabs \.tab\.active\{\s*background:#24466f/);
  assert.match(styles,/box-shadow:inset 0 -3px 0 #afd7ff/);
  assert.match(html,/document\.querySelectorAll\("\.tab"\)\.forEach/);
  assert.match(sw,/key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(sw,/caches\.match\s*\(/);
});
