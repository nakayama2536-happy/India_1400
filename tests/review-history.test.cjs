const test=require('node:test');
const assert=require('node:assert/strict');
const mod=require('../review-history.js');

class Storage{
  constructor(init={}){this.map=new Map(Object.entries(init));this.writes=0;this.fail=false;}
  getItem(k){return this.map.has(k)?this.map.get(k):null;}
  setItem(k,v){if(this.fail)throw new Error('quota');this.writes++;this.map.set(k,String(v));}
}
const market=(overrides={})=>({
  history_1400:{date_jst:'2026-09-28',current_date_has_record:true},
  quality_state:{code:'OK'},
  ...overrides,
});
const common=(overrides={})=>({
  timestamps:{market_as_of:'2026-09-28'},
  decision:{phase:'DECISION'},
  data_quality:{qc_state:'PASS',data_state:'FRESH'},
  ...overrides,
});
const trigger=(overrides={})=>({
  version:'india-deep-dive-trigger-v1',level_code:'RECOMMENDED',active_count:1,
  categories:[
    {key:'TRADE_PROXIMITY',label:'売買条件接近',severity:1,active:true,summary:'第1弾が成立直前',details:['第1弾が成立直前']},
    {key:'DATA_QUALITY',label:'データ品質',severity:0,active:false,summary:'重大な品質異常なし',details:[]},
  ],
  reasons:['第1弾が成立直前'],mandatory_checks:['条件確認'],
  ...overrides,
});

test('REV-T01 same evidence with changed rule or trigger becomes RECHECK_REQUIRED',()=>{
  const storage=new Storage();
  const ctx=mod.contextFromMarket(market(),common(),trigger(),{bundleId:'B1'});
  const saved=mod.saveReview(ctx,'USEFUL','good',storage,{nowIso:'2026-09-28T05:00:00Z'});
  assert.equal(saved.rule_version,'india-deep-dive-trigger-v1');
  const changedRule=mod.contextFromMarket(market(),common(),trigger({version:'india-deep-dive-trigger-v2'}));
  assert.equal(mod.viewForContext(changedRule,storage).state,'RECHECK_REQUIRED');
  const changedTrigger=mod.contextFromMarket(market(),common(),trigger({reasons:['別の理由'],categories:[
    {key:'MARKET_SHOCK',label:'相場急変',severity:1,active:true,summary:'急変',details:['急変']}
  ]}));
  assert.equal(mod.viewForContext(changedTrigger,storage).state,'RECHECK_REQUIRED');
});

test('REV-T02 report and backup never mark reviewed; quality warning remains after review',()=>{
  const storage=new Storage();
  const ctx=mod.contextFromMarket(
    market({quality_state:{code:'STALE'}}),
    common({data_quality:{qc_state:'WARN',data_state:'STALE'}}),
    trigger({categories:[{key:'DATA_QUALITY',label:'データ品質',severity:1,active:true,summary:'STALE',details:['主要データSTALE']}]}),
  );
  assert.equal(mod.viewForContext(ctx,storage).state,'UNREVIEWED');
  mod.reportRows(storage);mod.backupText(storage,{nowIso:'2026-09-28T05:00:00Z'});
  assert.equal(mod.viewForContext(ctx,storage).state,'UNREVIEWED');
  const rec=mod.saveReview(ctx,'REFERENCE','check',storage,{nowIso:'2026-09-28T05:01:00Z'});
  assert.equal(rec.review_state,'REVIEWED');
  assert.ok(rec.unresolved_conditions.includes('QUALITY_STATE:STALE'));
  assert.ok(rec.unresolved_conditions.includes('COMMON_QC:WARN'));
  assert.ok(rec.unresolved_conditions.some(x=>x.includes('主要データSTALE')));
});

test('REV-T03 trigger NONE can still be explicitly reviewed and is not auto-NOISE',()=>{
  const storage=new Storage();
  const ctx=mod.contextFromMarket(market(),common(),trigger({level_code:'NONE',active_count:0,categories:[],reasons:[]}));
  assert.equal(mod.viewForContext(ctx,storage).record,null);
  const rec=mod.saveReview(ctx,'REFERENCE','optional',storage,{nowIso:'2026-09-28T05:00:00Z'});
  assert.equal(rec.utility,'REFERENCE');
  assert.equal(rec.review_state,'REVIEWED');
});

test('REV-T04 corrupt store and 101st record fail closed without deletion',()=>{
  const corrupt=new Storage({[mod.STORE_KEY]:'{bad'});
  const before=corrupt.getItem(mod.STORE_KEY);
  assert.throws(()=>mod.saveReview(mod.contextFromMarket(market(),common(),trigger()),'USEFUL','',corrupt),/壊れている/);
  assert.equal(corrupt.getItem(mod.STORE_KEY),before);assert.equal(corrupt.writes,0);

  const records={};
  for(let i=0;i<100;i++)records['id'+i]={review_schema_version:'0.1',review_id:'id'+i,market:'INDIA',subject_id:'S'+i,evidence_identity:'E'+i,rule_version:'R',trigger_signature:'T'};
  const full=new Storage({[mod.STORE_KEY]:JSON.stringify({review_schema_version:'0.1',updated_at:'x',records})});
  assert.throws(()=>mod.saveReview(mod.contextFromMarket(market(),common(),trigger()),'USEFUL','',full),/100件/);
  assert.equal(Object.keys(JSON.parse(full.getItem(mod.STORE_KEY)).records).length,100);
});

test('REV-T05 backup restore preserves local conflict and imports only additions',()=>{
  const source=new Storage();
  const ctx=mod.contextFromMarket(market(),common(),trigger());
  const rec=mod.saveReview(ctx,'USEFUL','source',source,{nowIso:'2026-09-28T05:00:00Z'});
  const backup=mod.backupText(source,{nowIso:'2026-09-28T06:00:00Z'});
  const localRec={...rec,note:'local newer'};
  const target=new Storage({[mod.STORE_KEY]:JSON.stringify({review_schema_version:'0.1',updated_at:'y',records:{[rec.review_id]:localRec}})});
  const preview=mod.inspectImport(backup,target);
  assert.equal(preview.add,0);assert.equal(preview.conflict,1);
  const result=mod.applyImport(preview,target,{nowIso:'2026-09-28T07:00:00Z'});
  assert.equal(result.skipped_conflict,1);
  assert.equal(JSON.parse(target.getItem(mod.STORE_KEY)).records[rec.review_id].note,'local newer');
});

test('REV-T06 purchase progress and unrelated local keys are never changed',()=>{
  const purchase=JSON.stringify({t1:true,t2:false,t3:false,d1:'2026-09-27',updated_at:'x'});
  const storage=new Storage({'india1400.purchaseProgress.v1':purchase,'other.key':'KEEP'});
  const ctx=mod.contextFromMarket(market(),common(),trigger());
  mod.saveReview(ctx,'NOISE','<script>alert(1)</script>',storage,{nowIso:'2026-09-28T05:00:00Z'});
  assert.equal(storage.getItem('india1400.purchaseProgress.v1'),purchase);
  assert.equal(storage.getItem('other.key'),'KEEP');
  assert.equal(mod.viewForContext(ctx,storage).record.note,'<script>alert(1)</script>');
});

test('REV-T07 repeated save of same market evidence is one record with revision log',()=>{
  const storage=new Storage();
  const ctx=mod.contextFromMarket(market(),common(),trigger());
  const first=mod.saveReview(ctx,'USEFUL','a',storage,{nowIso:'2026-09-28T05:00:00Z'});
  const second=mod.saveReview(ctx,'REFERENCE','b',storage,{nowIso:'2026-09-28T06:00:00Z'});
  const report=mod.reportRows(storage);
  assert.equal(report.records.length,1);
  assert.equal(second.reviewed_at,first.reviewed_at);
  assert.equal(second.revision_log.length,1);
  assert.equal(second.revision_log[0].utility,'USEFUL');
});

test('market date/phase evidence identity ignores refresh timestamp noise',()=>{
  const a=mod.contextFromMarket(market({generated_at_jst:'2026-09-28T14:00:00+09:00'}),common(),trigger());
  const b=mod.contextFromMarket(market({generated_at_jst:'2026-09-28T14:03:00+09:00'}),common(),trigger());
  assert.equal(a.evidence_identity,b.evidence_identity);
  assert.equal(mod.identity(a),mod.identity(b));
});
