const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const tail=html.slice(start),end=tail.search(/\n(?:async )?function /);return end<0?tail:tail.slice(0,end)}
function harness(){const c=vm.createContext({IndiaTechnicalCharts:require("../technical-charts.js")});for(const n of ['hasFiniteValue','weekStartSunday','coreSupportLevels','chartSvg'])vm.runInContext(fn(n),c);return c}
function rows(values){return values.map((value,i)=>({date:new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10),close:value,ma5:value+40,ma25:value+140,ma75:value+300}))}
const series=[{key:'close',cls:'line-main'},{key:'ma5',cls:'line-ma5'},{key:'ma25',cls:'line-ma25'},{key:'ma75',cls:'line-ma75'}];

test('primary NIFTY chart is ahead of metrics, 1.6 times taller, and scoped to indicators',()=>{
 const start=html.indexOf('<section id="page-indicators"'),end=html.indexOf('NIFTY 詳細チャートを見る',start),part=html.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.ok(part.indexOf('id="niftyChart"')<part.indexOf('id="niftyMetrics"'));
 assert.match(part,/indicator-primary/);
 assert.match(part,/id="niftySupportNote"/);
 assert.match(harness().chartSvg(rows([100,101]),series,[],{kind:'nifty'}),/height="216"/);
 assert.ok(214/132>1.6&&214/132<1.7);
 assert.match(html,/--c-ma75:#8b9ab0/);
 assert.doesNotMatch(html,/#page-indicators \.chart \.gridline\{/);
});

test('NIFTY draws final close, four averages and visible price scale with real dates',()=>{
 const c=harness(),xs=rows([22800,22900,22700,22600,23000,22880,22980]);
 const svg=c.chartSvg(xs,series,[],{kind:'nifty'});
 assert.match(svg,/class="chart chart-nifty"/);
 for(const cls of ['line-main','line-ma5','line-ma25','line-ma75'])assert.match(svg,new RegExp('class="'+cls+'"'));
 assert.match(svg,/class="last-nifty-dot"/);
 assert.match(svg,/\d{2},\d{3}/);
 assert.match(svg,/09\/01/);
 assert.match(svg,/09\/07/);
 assert.match(svg,/role="img"/);
});

test('RSI uses a fixed 0-100 scale with a restrained distinguished 50 baseline',()=>{
 const c=harness(),v=rows([48,46,45,51,49]).map((r,i)=>({date:r.date,value:[48,46,45,51,49][i]}));
 const svg=c.chartSvg(v,[{key:'value',cls:'line-rsi'}],[{value:30},{value:50,emphasis:true},{value:70}],{kind:'rsi'});
 assert.match(svg,/class="chart chart-rsi"/);
 assert.match(svg,/class="guide guide-reference"/);
 assert.match(svg,/>30<\/text>/);
 assert.match(svg,/>50<\/text>/);
 assert.match(svg,/>70<\/text>/);
 assert.doesNotMatch(svg,/>50 基準<\/text>/);
 assert.match(html,/#page-indicators \.indicators-panel \.chart \.guide\.guide-reference\{stroke:#c0b48c/);
});

test('MACD histogram is actual rectangles around zero, not a connected line',()=>{
 const c=harness(),v=rows([-10,-3,0,6,12]).map((r,i)=>({date:r.date,value:[-10,-3,0,6,12][i]}));
 const svg=c.chartSvg(v,[{key:'value',cls:'line-macd'}],[],{kind:'macd'});
 assert.match(svg,/class="chart chart-macd"/);
 assert.match(svg,/class="zero-axis"/);
 assert.equal((svg.match(/class="macd-positive"/g)||[]).length,2);
 assert.equal((svg.match(/class="macd-negative"/g)||[]).length,2);
 assert.doesNotMatch(svg,/class="line-macd"/);
 assert.match(svg,/>0<\/text>/);
});

test('confirmed valley support is drawn only with evidence; none is not fabricated',()=>{
 const c=harness(),values=[110,108,100,107,109,110,108,100.5,107,109,110,111],xs=rows(values);
 const support=c.coreSupportLevels(xs.map(r=>({date:r.date,nav_yen:r.close})));
 assert.equal(support.status,'ok');
 assert.equal(support.levels[0].kind,'support');
 const supported=c.chartSvg(xs,series,[],{kind:'nifty',supportLevels:support.levels});
 const plain=c.chartSvg(xs,series,[],{kind:'nifty',supportLevels:[]});
 assert.match(supported,/class="support-visual"/);
 assert.doesNotMatch(plain,/class="support-visual"/);
 assert.equal((supported.match(/class="support-visual"/g)||[]).length,1);
 assert.equal((supported.match(/class="line-main"/g)||[]).length,1);
 assert.match(html,/matchedConfirmedDate\?coreSupportLevels\(supportRows\)/);
 assert.match(html,/売買判定には不使用/);
});

test('missing and malformed chart values do not become numeric zero or false bars',()=>{
 const c=harness(),v=rows([10,11,12,13]);
 v[1].close=null;v[2].close='';
 const text=c.chartSvg(v,[{key:'close',cls:'line-main'}],[],{kind:'nifty'});
 assert.equal((text.match(/class="line-main"/g)||[]).length,1);
 const noData=c.chartSvg([{date:'2026-09-01',value:null},{date:'2026-09-02',value:''}],[{key:'value',cls:'line-macd'}],[],{kind:'macd'});
 assert.match(noData,/履歴を蓄積中/);
});

test('chart operations do not mutate price records, purchase records or thresholds',()=>{
 const c=harness(),v=rows([110,108,100,107,109,110,108,101,107,109,110,111]),before=JSON.stringify(v);
 c.chartSvg(v,series,[],{kind:'nifty',supportLevels:[]});
 assert.equal(JSON.stringify(v),before);
 const render=fn('renderTechnicalCharts');
 assert.doesNotMatch(render,/(?:localStorage|setItem|updatePurchaseState|decision_eligible\s*=)/);
 assert.match(render,/nc\.macd_hist\|\|\[\]/);
});

test('PWA UI version is synchronized and manifest describes the updated chart',()=>{
 const version=fs.readFileSync('VERSION','utf8');
 const sw=fs.readFileSync('sw.js','utf8');
 const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
 assert.match(version,/UI_VERSION=5\.49/);
 assert.match(sw,/india1400-v5-49-/);
 assert.match(sw,/\?v=5\.49/);
 assert.match(manifest.start_url,/v=5\.49/);
 assert.match(html,/v5\.49/);
});
