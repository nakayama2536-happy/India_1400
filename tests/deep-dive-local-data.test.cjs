const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('deep-dive.js','utf8');

function harness(){
  let purchaseReads=0;
  const privateState={t1:true,t2:false,t3:false,d1:'2026-09-27',d2:null,d3:null,updated_at:'PRIVATE_PURCHASE_MARKER'};
  const context=vm.createContext({
    console,
    PURCHASE_STATE_KEY:'india1400.purchaseProgress.v1',
    loadPurchaseState:()=>{purchaseReads++;return JSON.parse(JSON.stringify(privateState));},
  });
  vm.runInContext(source,context,{filename:'deep-dive.js'});
  const defs=vm.runInContext('DEEP_DIVE_FILES',context);
  const sources=defs.map(d=>({
    ...d,
    raw:d.type==='json'?'{}':'APP_VERSION=5.7\nUI_VERSION=5.24\n',
    data:d.type==='json'?{}:'APP_VERSION=5.7\nUI_VERSION=5.24\n',
    bytes:10,
    sha256:'a'.repeat(64),
  }));
  for(const s of sources){
    if(s.path==='nifty_daily_history.json')s.data={records:[]};
    if(s.path==='nifty_ohlc_history.json')s.data={records:[]};
    if(s.path==='history.json')s.data={records:[]};
    if(s.path==='india_core_history.json')s.data={records:[]};
    if(s.path==='forecast_evaluation.json')s.data={entries:[]};
    if(s.path==='indicator_history.json')s.data={series:{}};
  }
  context.sources=sources;
  context.publication={publication_id:'in-test',source_state:'READY',bundle_contract:'deep-dive/0.1'};
  return {
    run:expr=>vm.runInContext(expr,context),
    purchaseReads:()=>purchaseReads,
    privateState,
  };
}

test('LOCAL-T01 default FULL does not read or include purchase progress',()=>{
  const h=harness();
  const out=h.run('buildDeepDiveMarkdown(sources,publication,{})');
  assert.equal(h.purchaseReads(),0);
  assert.doesNotMatch(out,/PRIVATE_PURCHASE_MARKER/);
  assert.doesNotMatch(out,/### local_purchase_progress\.json/);
  assert.match(out,/端末内3分割購入進捗: 含めない（既定）/);
  assert.match(out,/"local_purchase_progress":null/);
  assert.match(out,/"local_data_included":false/);
});

test('LOCAL-T02 explicit opt-in reads and includes purchase progress once',()=>{
  const h=harness();
  const out=h.run('buildDeepDiveMarkdown(sources,publication,{includePurchaseProgress:true})');
  assert.equal(h.purchaseReads(),1);
  assert.match(out,/PRIVATE_PURCHASE_MARKER/);
  assert.match(out,/### local_purchase_progress\.json/);
  assert.match(out,/端末内3分割購入進捗: 明示選択により含む/);
  assert.match(out,/"local_data_included":true/);
});

test('LOCAL-T03 helper excludes all local data unless explicitly true',()=>{
  const h=harness();
  assert.equal(h.run('deepDiveLocalData(false,{secret:"X"})'),null);
  const value=h.run('deepDiveLocalData(true,{t1:true})');
  assert.equal(value.key,'india1400.purchaseProgress.v1');
  assert.equal(value.scope,'purchase_progress_only');
  assert.equal(value.value.t1,true);
});

test('LOCAL-T04 review history and unrelated localStorage are not part of FULL source definition',()=>{
  const h=harness();
  const paths=[...h.run('DEEP_DIVE_FILES')].map(x=>x.path);
  assert.ok(!paths.includes('review-history.json'));
  assert.ok(!paths.includes('india1400.deepDiveReviews.v1'));
  assert.equal(paths.length,10);
});
