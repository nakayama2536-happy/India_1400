'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');

const start=html.indexOf('function comparisonReferenceHtml(');
const end=html.indexOf('\nfunction renderDetail()',start);
assert.ok(start>=0&&end>start,'reference comparison renderer should remain isolated');
const source=html.slice(start,end);
const format=(v,d)=>v==null?'--':Number(v).toFixed(d);
const context=vm.createContext({
  referenceText:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
  fmtJstShort:s=>String(s||'').slice(5,16).replace('-','/').replace('T',' '),
  fmt:format,
  signedHtml:(v,d,s)=>v==null?'--':(v>0?'+':'')+format(v,d)+s,
});
vm.runInContext(source,context);
const render=vm.runInContext('comparisonReferenceHtml',context);

test('reference comparison labels a saved 14:00 quote and a different-time confirmed session',()=>{
  const data={
    available:true,
    previous_date_jst:'2026-10-29',
    previous_price_as_of_jst:'2026-10-29T13:50:00+09:00',
    current_price_as_of_jst:'2026-10-29T19:01:00+09:00',
    values:{
      nifty_price:{previous:22863.9,current:22936.75,delta_pct:0.319},
      usdinr:{previous:95.1,current:95.2122,delta_pct:0.118},
      brent:{previous:115.6,current:113.81,delta_pct:-1.548},
    },
  };
  const result=render(data,{nifty:{as_of_jst:'2026-10-29T19:01:00+09:00'}});
  assert.match(result,/異時点の参考比較/);
  assert.match(result,/14:00同士の変化率ではなく/);
  assert.match(result,/10\/29 13:50 JST/);
  assert.match(result,/10\/29 19:01 JST/);
  assert.match(result,/0\.32%/);
  assert.match(result,/個別時刻はこの表では確認できません/);
  assert.doesNotMatch(result,/取得時刻を推定して/);
});

test('a current confirmed close never silently borrows a nonexistent current quote time',()=>{
  const result=render({previous_date_jst:'2026-10-28',values:{}},{nifty:{}});
  assert.match(result,/時刻未確認/);
  assert.match(result,/異時点/);
});

test('display is escaped and cannot mutate original comparison evidence',()=>{
  const c={previous_date_jst:'<script>alert(1)</script>',values:{nifty_price:{previous:1,current:2,delta_pct:100}}};
  const frozen=JSON.stringify(c);
  const output=render(c,{nifty:{as_of_jst:'2026-10-29T19:01:00+09:00'}});
  assert.doesNotMatch(output,/<script>/);
  assert.equal(JSON.stringify(c),frozen);
});

test('main UI provides unambiguous waiting, comparison and current audit label',()=>{
  assert.match(html,/本日の14:00代表値：取得待ち/);
  assert.match(html,/過去の保存履歴：/);
  assert.match(html,/14:00保存値と現在参照値の比較/);
  assert.match(html,/保存代表値との差/);
  assert.doesNotMatch(html,/<summary>前回14:00比較を見る<\/summary>/);
  assert.match(html,/document\.querySelector\("\.version-badge"\)\?\.textContent\?\.trim\(\)/);
  assert.doesNotMatch(html,/setText\("audit",\x60UI v5\.53/);
  assert.match(html,/decisionDisplayEligible\(g,q,market\?\.execution_plan\)/);
  assert.match(html,/id="purchaseProgress"/);
  assert.match(html,/id="captureEvidence"/);
});

test('waiting-state panel is gated by acquisition evidence for the current JST day',()=>{
  assert.match(html,/market\?\.acquisition_status\?\.date_jst===jstNowInfo\(\)\.date/);
  assert.match(html,/market\?\.acquisition_status\?\.code==="WAITING_WINDOW"/);
  assert.match(html,/14:00履歴 \$\{h\.record_count\?\?0\}件/);
  assert.match(html,/checkWindowStatus\(\)/);
});
