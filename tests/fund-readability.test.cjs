'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html','utf8');
const sw = fs.readFileSync('sw.js','utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const version = fs.readFileSync('VERSION','utf8');
const index = html.indexOf('/* UI 5.52: iPhone 17 fund-card readability');
assert.ok(index>=0,'versioned style section missing');
const style = html.slice(index,html.indexOf('</style>',index));
const css = (selector) => {
  const i=style.indexOf(selector+'{');
  assert.ok(i>=0,'CSS selector missing: '+selector);
  return style.slice(i,style.indexOf('}',i)+1);
};
const prefix = '#page-decision .india-core-latest-card #indiaCoreCard ';
const columns=prefix+'.fund-status-grid';

test('iPhone fund card is scoped, all seven live source-quality tiles stay mounted',()=>{
  const start=html.indexOf('<div class="card india-core-latest-card">');
  const end=html.indexOf('<div class="card global-status-card">',start);
  assert.ok(start>=0&&end>start);
  const part=html.slice(start,end);
  assert.equal((part.match(/id="indiaCoreCard"/g)||[]).length,1);
  assert.match(part,/インド・コア 最新情報/);
  assert.match(part,/インド・コア表示について/);
  assert.match(html,/function renderIndiaCore\(\)/);
  assert.match(html,/statusTileHtml\("基準日"/);
  for(const s of ['純資産総額','MA25','MA75','RSI14','MACD','25/75日線'])assert.ok(html.includes('statusTileHtml("'+s+'"'),s);
  assert.doesNotMatch(style,/\bdisplay\s*:\s*none\b/);
});

test('14px minimum information text, larger numbers and comfortable line height are limited to fund screen',()=>{
  assert.match(css(prefix+'.fund-name'),/font-size:15px/);
  assert.match(css(prefix+'.fund-status-grid .status-tile-label'),/font-size:14px/);
  assert.match(css(prefix+'.fund-status-grid .status-tile-value'),/font-size:clamp\(17px,4\.45vw,20px\)/);
  assert.match(css(prefix+'.fund-status-grid .status-tile-status'),/font-size:14px/);
  assert.match(css(prefix+'.fund-status-grid .status-tile-detail'),/font-size:14px/);
  assert.match(css(prefix+'.fund-meta'),/font-size:14px/);
  assert.match(css(prefix+'.fund-source'),/font-size:14px/);
  assert.match(style,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(style,/gap:10px;margin-top:13px/);
  assert.match(style,/overflow-wrap:anywhere/);
  assert.doesNotMatch(style,/text-overflow:ellipsis/);
  assert.ok(!style.includes('.quality-top-item')&&!style.includes('.tranche-toggle'),
    'other application areas must not be resized');
});

test('fund summary disclosure, support explanation and source metadata remain legible',()=>{
  assert.match(style,/\.india-core-latest-card > details\.supplement > summary/);
  assert.match(style,/\.fund-trend-card > details\.supplement > summary/);
  assert.match(style,/font-size:16px;line-height:1\.55/);
  assert.match(style,/\.fund-trend-card \.core-support-summary/);
  assert.match(style,/font-size:14px;line-height:1\.65/);
  assert.match(html,/取得元 \$\{src\}/);
  assert.match(html,/d\.official_status==="ok"\?"公式最新値"/);
});

function renderSnapshot(data,health={ok:true,market_basis:'2026-10-23'}){
  const start=html.indexOf('function renderIndiaCore(){');
  const end=html.indexOf('\nfunction ',start+2);
  assert.ok(start>=0&&end>start);
  const el={innerHTML:''};
  const format = (x,p=0) => x===null||x===undefined?'--':
    Number(x).toLocaleString('ja-JP',{minimumFractionDigits:p,maximumFractionDigits:p});
  const ctx=vm.createContext({
    indiaCore:data,
    $:()=>el,
    Number,String,
    hasFiniteValue:x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x)),
    fmt:format,
    fmtJstShort:x=>x ? String(x).slice(5,10).replace('-','/') : '--',
    fundBasisHealth:()=>health,
    signedHtml:(v,dp)=>v==null?'--':(v>0?'+':'')+format(v,dp),
    signClass:x=>x>0?'sign-pos':x<0?'sign-neg':'sign-zero',
    signed:(v,dp,unit)=>v==null?'--':(v>0?'+':'')+format(v,dp)+unit
  });
  const tileStart=html.indexOf('function statusTileHtml('),tileEnd=html.indexOf('\nfunction ',tileStart+5);
  vm.runInContext(html.slice(tileStart,tileEnd),ctx);
  vm.runInContext(html.slice(start,end),ctx);
  vm.runInContext('renderIndiaCore()',ctx);
  return el.innerHTML;
}
const fixture=()=>({
  fund_name:'イーストスプリング・インド・コア株式ファンド',
  nav_yen:14992,change_yen:-237,change_pct:-1.56,net_assets_oku_yen:139,
  as_of_date:'2026-10-23',fetched_at_jst:'2026-10-24T03:43:56+09:00',
  status:'ok',official_status:'ok',source:'イーストスプリング公式',
  source_url:'https://www.example.org/fund',
  technical:{available:true,basis_consistent:true,basis_date:'2026-10-23',
    ma25:15332,ma75:15966,rsi14:44.8,macd:-133.91,macd_signal:-155.59,
    macd_hist:21.68,gc_dc:'DC'}
});

test('render keeps full official NAV, seven tiles, source link and every quality status',()=>{
  const m=fixture(),before=JSON.stringify(m),s=renderSnapshot(m);
  assert.equal((s.match(/class="status-tile good"/g)||[]).length,7);
  for(const term of ['14,992円','-237円','-1.56%','139.00億円','15,332','15,966','44.8','-133.91','DC','Hist +21.68','25日線が75日線未満'])
    assert.ok(s.includes(term),'lost original source value: '+term);
  assert.equal((s.match(/データ確認済み/g)||[]).length,7);
  assert.match(s,/基準日/);
  assert.match(s,/NIFTY基準 10\/23/);
  assert.match(s,/取得 10\/24 JST/);
  assert.match(s,/公式最新値/);
  assert.match(s,/取得元 <a class="fund-source"/);
  assert.equal(JSON.stringify(m),before,'view must not mutate data');
});

test('source inconsistencies remain quality WARN/BAD rather than false success',()=>{
  const m=fixture();
  m.technical.basis_date='2026-10-22';
  const s=renderSnapshot(m,{ok:false,market_basis:'2026-10-22'});
  assert.equal((s.match(/データ確認済み/g)||[]).length,0);
  assert.match(s,/要確認/);
  assert.match(s,/class="status-tile bad"/);
  assert.match(s,/基準 10\/22/);
  assert.match(s,/14,992円/);
  assert.match(s,/公式最新値/);
  assert.match(s,/取得元 /);
});

test('missing official NAV does not create zero or certify a value',()=>{
  const m=fixture();m.nav_yen=null;
  const s=renderSnapshot(m);
  assert.match(s,/基準価額データを取得できません/);
  assert.doesNotMatch(s,/class="status-tile good"/);
});

test('PWA version consistency and cache isolation persist through readability revision',()=>{
  assert.match(version,/UI_VERSION=5\.56/);
  assert.match(html,/India 14:00 Check v5\.56/);
  assert.match(manifest.start_url,/v=5\.56/);
  assert.match(sw,/india1400-v5-56-/);
  assert.match(sw,/"\.\/\?v=5\.56"/);
  assert.match(sw,/key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(sw,/caches\.match\s*\(/);
  assert.match(html,/id="purchaseProgress"/);
  assert.match(html,/id="deepDiveReviewPanel"/);
  assert.match(html,/data-ix-expand="indiaCoreTrendChart"/);
});
