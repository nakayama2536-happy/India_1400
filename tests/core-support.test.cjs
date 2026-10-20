const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const re=new RegExp('(?:async )?function '+name+'\\('),start=html.search(re);assert.ok(start>=0,name);const tail=html.slice(start),end=tail.search(/\n(?:function|const|async function) /);return end<0?tail:tail.slice(0,end)}
function rows(values){return values.map((nav_yen,i)=>({date:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),nav_yen}))}
function harness(){const c=vm.createContext({});for(const n of ['hasFiniteValue','fmt','fmtJstShort','referenceText','coreSupportLevels','coreSupportSummary','coreTrendSvg'])vm.runInContext(fn(n),c);return c}
function calculate(values){return harness().coreSupportLevels(rows(values))}
const repeated=[110,108,100,107,109,110,108,100.5,107,109,110,111];

test('two distinct confirmed valleys produce a median support with auditable dates',()=>{
 const r=calculate(repeated);assert.equal(r.status,'ok');assert.equal(r.levels.length,1);const l=r.levels[0];assert.equal(l.kind,'support');assert.equal(l.value,100.25);assert.equal(l.touches.length,2);assert.equal(l.confirmed_at,'2026-01-10');assert.equal(l.touches[0].date,'2026-01-03');
});
test('nearby wiggles do not count as independent repeated support',()=>{
 const r=calculate([110,108,100,108,109,100.5,108,109,110,111]);assert.ok(r.levels.every(x=>x.kind==='recent-low'));
});
test('a single valley is explicitly a recent-low guide, never repeated support',()=>{
 const r=calculate([110,109,108,107,100,108,109,110,111,112]);assert.equal(r.levels[0].kind,'recent-low');assert.match(harness().coreSupportSummary(r),/複数回の支持は未確認/);
});
test('last two observations cannot confirm a new low, nor revive a broken earlier low',()=>{
 const r=calculate([...repeated,95,96]);assert.equal(r.levels.length,0);
 const confirmed=calculate([...repeated,95,96,97]);assert.equal(confirmed.levels[0].kind,'recent-low');assert.equal(confirmed.levels[0].value,95);
});
test('a breach discards pre-breach touches even if price later recovers',()=>{
 const r=calculate([...repeated,95,96,97,110,108,100.4,108,109,110]);assert.ok(r.levels.every(x=>x.kind!=='support'));
});
test('two new post-breach valleys can establish support again',()=>{
 const r=calculate([...repeated,95,96,97,110,108,100.4,108,109,110,108,100.3,108,109,110]);const s=r.levels.find(x=>x.kind==='support');assert.ok(s);assert.equal(s.touches.length,2);assert.ok(s.touches.every(x=>x.index>12));
});
test('monotonic and flat sequences never invent a floor',()=>{
 for(const v of [Array.from({length:12},(_,i)=>100+i),Array.from({length:12},(_,i)=>120-i),Array(12).fill(100)])assert.equal(calculate(v).levels.length,0);
});
test('malformed, missing, non-positive, duplicate and unsorted input cannot create candidates',()=>{
 const c=harness();for(const value of [null,undefined,'',0,-1,NaN,Infinity,true,'bad']){const r=rows(repeated);r[2].nav_yen=value;assert.equal(c.coreSupportLevels(r).status,'invalid')}
 for(const date of ['2026-02-30','2026-01-01','bad']){const r=rows(repeated);r[2].date=date;assert.equal(c.coreSupportLevels(r).status,'invalid')}
 const r=rows(repeated);[r[2],r[3]]=[r[3],r[2]];assert.equal(c.coreSupportLevels(r).status,'invalid');assert.equal(c.coreSupportLevels(rows([1,2,3])).status,'insufficient');
});
test('output has at most two nonoverlapping supports below current NAV and does not mutate rows',()=>{
 const c=harness(),input=rows([...repeated,120,125,115,121,124,125,121,115.5,120,123,125,126]),original=JSON.stringify(input),r=c.coreSupportLevels(input);
 assert.equal(JSON.stringify(input),original);assert.equal(r.levels.length,2);assert.ok(r.levels.every(x=>x.value<=r.latest_value));assert.ok(r.levels[1].high<r.levels[0].low);
});
test('adding support overlays preserves NAV path and all original price/date ticks',()=>{
 const c=harness(),input=rows(repeated),levels=c.coreSupportLevels(input).levels,a=c.coreTrendSvg(input),b=c.coreTrendSvg(input,levels);
 assert.equal(a.match(/points="([^"]+)"/)[1],b.match(/points="([^"]+)"/)[1]);assert.match(b,/support-line support/);assert.match(b,/S1 100/);assert.doesNotMatch(a,/support-line/);
});
test('latest NAV/history mismatch suppresses lines and refreshes mismatching cached history',async()=>{
 const c=harness(),nodes={};c.$=id=>nodes[id]||(nodes[id]={});c.setText=(id,v)=>c.$(id).textContent=v;
 c.indiaCoreHistory={records:rows(repeated)};c.indiaCore={as_of_date:'2026-01-13',nav_yen:112};let calls=0;
 c.ensureIndiaCoreHistory=async()=>{calls++;assert.equal(c.indiaCoreHistory,null);return{records:rows(repeated)}};
 vm.runInContext(fn('renderIndiaCoreTrend'),c);await c.renderIndiaCoreTrend();assert.equal(calls,1);assert.match(nodes.indiaCoreSupportSummary.innerHTML,/履歴が一致しない/);assert.doesNotMatch(nodes.indiaCoreTrendChart.innerHTML,/support-line/);
 c.ensureIndiaCoreHistory=async()=>({records:rows([...repeated,112])});await c.renderIndiaCoreTrend();assert.match(nodes.indiaCoreTrendChart.innerHTML,/support-line support/);assert.match(nodes.indiaCoreSupportSummary.innerHTML,/2026-01-13/);
});
test('fetch failure clears previous support explanation and does not retain an old line',async()=>{
 const c=harness(),nodes={};c.$=id=>nodes[id]||(nodes[id]={innerHTML:'OLD'});c.setText=()=>{};c.indiaCoreHistory=null;c.indiaCore=null;c.ensureIndiaCoreHistory=async()=>null;
 vm.runInContext(fn('renderIndiaCoreTrend'),c);await c.renderIndiaCoreTrend();assert.match(nodes.indiaCoreSupportSummary.innerHTML,/表示できません/);assert.doesNotMatch(nodes.indiaCoreTrendChart.innerHTML,/support-line|OLD/);
});
