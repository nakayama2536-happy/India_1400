// Executes the real deep-dive.js; no network and no private user data.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../deep-dive.js'),'utf8');
const PURCHASE_KEY='india1400.purchaseProgress.v1';
const stored={t1:true,t2:false,t3:false,d1:'2041-02-03',d2:null,d3:null,unselected_note:'DO_NOT_EXPORT_PRIVATE_NOTE'};
function harness(options={}){
  const elements=new Map(),domHandlers={},windowHandlers={},reads=[],writes=[],copied=[],shared=[],saved=[],confirms=[],toasts=[];
  const storage=new Map([[PURCHASE_KEY,JSON.stringify(stored)],['india1400.deepDiveReviews.v1','DO_NOT_EXPORT_REVIEW']]);
  if('raw' in options){if(options.raw===null)storage.delete(PURCHASE_KEY);else storage.set(PURCHASE_KEY,options.raw);}
  function element(tag){return {tag,style:{},children:[],handlers:{},textContent:'',checked:false,disabled:false,
    set id(id){this._id=id;elements.set(id,this)},get id(){return this._id},
    appendChild(child){this.children.push(child);return child},
    insertBefore(child,before){const at=this.children.indexOf(before);this.children.splice(at<0?this.children.length:at,0,child)},
    addEventListener(name,fn){this.handlers[name]=fn},remove(){},click(){this.clicked=true},
    querySelector(selector){if(selector==='.deep-dive-actions')return actions;if(selector==='details.supplement .body')return details;return null}
  };}
  const panel=element('div');panel.id='deepDivePanel';
  const actions=element('div');panel.children.push(actions);
  const details=element('div');details.textContent='公開データを収録します。端末内データは3分割の実施状況だけを収録し、他のlocalStorageや認証情報は読みません。';
  for(const id of ['deepDiveBuildBtn','deepDiveShareBtn','deepDiveSaveBtn','deepDiveCopyBtn','deepDiveStatus']){const e=element('button');e.id=id;}
  const doc={readyState:'loading',createElement:element,getElementById:id=>elements.get(id)||null,
    addEventListener:(name,fn)=>{domHandlers[name]=fn},body:element('body')};
  let fetches=0,sources=[];
  const window={crypto:webcrypto,addEventListener:(name,fn)=>{windowHandlers[name]=fn},
    confirm:text=>{confirms.push(text);return options.confirm!==false},
    IndiaDeepDiveBundle:{loadVerifiedSources:async()=>{fetches++;if(options.pending)await options.pending;return {sources,manifest:{publication_id:'in-fixture',source_state:'READY',bundle_contract:'deep-dive/0.1'}}}}};
  class TestURL extends URL{static createObjectURL(file){saved.push(file);return 'blob:fixture'}static revokeObjectURL(){}}
  const context=vm.createContext({window,document:doc,Date,File,URL:TestURL,Uint8Array,console,
    PURCHASE_STATE_KEY:PURCHASE_KEY,
    localStorage:{getItem:key=>{reads.push(key);return storage.has(key)?storage.get(key):null},
      setItem:(...args)=>{writes.push(args);throw Error('Unexpected storage write')},removeItem:()=>{throw Error('Unexpected removal')},clear:()=>{throw Error('Unexpected clear')}},
    loadPurchaseState:()=>{throw Error('Permissive legacy loader must not be called by exporter')},
    $:id=>elements.get(id)||null,setText:(id,text)=>{elements.get(id).textContent=text},toast:text=>toasts.push(text),setTimeout:fn=>fn(),
    navigator:{clipboard:{writeText:async text=>{copied.push(text)}},canShare:()=>true,
      share:async value=>{shared.push(value);if(options.shareCancel){const e=Error('cancel');e.name='AbortError';throw e}}}});
  vm.runInContext(source+`\n;globalThis.api={defs:DEEP_DIVE_FILES,buildDeepDiveMarkdown,buildDeepDiveArtifact,initDeepDivePrivacy,invalidateDeepDivePrivacy,saveDeepDiveArtifact,shareDeepDiveArtifact,copyDeepDiveArtifact,evaluateDeepDiveTriggers,pickDeepDivePurchaseProgress,getArtifact:()=>deepDiveArtifact};`,context);
  const api=context.api;
  const market={operational_state:{regular_trading_day:true},quality_state:{code:'OK'},
    trade_guide:{buy_condition_count:1,buy_condition_total:4},
    execution_plan:{tranches:[{stage:1,status:'READY',conditions:[]},{stage:2,status:'READY',conditions:[]},{stage:3,status:'WAIT',conditions:[]}]},
    nifty:{change_pct:0,price:0},data_quality:{critical_reasons:[]}};
  sources=api.defs.map(def=>{const data=def.path==='VERSION'?'UI_VERSION=5.23\n':def.path==='market.json'?market:{records:[],entries:[],series:{},zero:0,missing:null};
    const raw=typeof data==='string'?data:JSON.stringify(data);return {...def,data,raw,bytes:Buffer.byteLength(raw),sha256:'0'.repeat(64)}});
  domHandlers.DOMContentLoaded();
  return {api,window,elements,storage,reads,writes,copied,shared,saved,confirms,toasts,sources,market,windowHandlers,panel,details,
    choice:elements.get('deepDiveIncludePurchase'),fetches:()=>fetches,artifact:()=>api.getArtifact(),status:()=>elements.get('deepDiveStatus').textContent};
}
function summary(text){const part=text.split('## 整理済み分析サマリー\n```json\n')[1];return JSON.parse(part.split('\n```')[0]);}
const manifest={publication_id:'in-fixture',source_state:'READY',bundle_contract:'deep-dive/0.1'};

test('PRIV-T01 new controls are unchecked, non-persistent, and initialized once',()=>{
  const h=harness();assert.equal(h.choice.checked,false);assert.equal(h.choice.autocomplete,'off');
  const count=h.panel.children.length;h.api.initDeepDivePrivacy();assert.equal(h.panel.children.length,count);
  assert.match(h.details.textContent,/既定で除外/);assert.deepEqual(h.reads,[]);assert.deepEqual(h.writes,[]);
});
test('PRIV-T02 direct Markdown generation defaults to no local reads or private values',()=>{
  const h=harness();const text=h.api.buildDeepDiveMarkdown(h.sources,manifest);const s=summary(text);
  assert.deepEqual(h.reads,[]);assert.equal(s.local_data_policy.included,false);assert.equal(s.local_purchase_progress,undefined);
  assert.doesNotMatch(text,/2041-02-03|DO_NOT_EXPORT|local_purchase_progress\.json/);
  assert.equal(s.trigger_context.basis,'PUBLIC_MARKET_ONLY');assert.equal(s.trigger_context.analysis_use,'REVIEW_ONLY');
  assert.equal(s.trigger_context.reasons.some(x=>/第[123]弾/.test(x)),false);
});
test('PRIV-T03 default interactive build retains all public sources, zero/null and raw history',async()=>{
  const h=harness();await h.api.buildDeepDiveArtifact();const a=h.artifact();assert.ok(a);assert.equal(a.local_data_included,false);
  assert.equal(a.sources.length,10);assert.deepEqual(h.reads,[]);assert.deepEqual(h.confirms,[]);
  for(const f of h.sources)assert.ok(a.text.includes('### '+f.path+'\n'));
  assert.match(a.text,/"zero":0,"missing":null/);assert.match(h.status(),/個人記録: 除外/);
});
test('PRIV-T04 selected-and-confirmed snapshot contains only six allowed purchase fields',async()=>{
  const h=harness();const before=JSON.stringify([...h.storage]);h.choice.checked=true;await h.api.buildDeepDiveArtifact();
  const a=h.artifact();assert.equal(a.local_data_included,true);assert.equal(h.confirms.length,1);assert.match(h.confirms[0],/2041-02-03/);
  const s=summary(a.text);assert.deepEqual(Object.keys(s.local_purchase_progress.value).sort(),['d1','d2','d3','t1','t2','t3']);
  assert.equal(s.local_purchase_progress.value.t1,true);assert.equal(s.local_purchase_progress.value.d1,'2041-02-03');
  assert.equal(s.trigger_context.basis,'USER_SELECTED_PURCHASE_PROGRESS');assert.match(s.trigger_context.reasons.join(' '),/第2弾/);
  assert.doesNotMatch(a.text,/DO_NOT_EXPORT|unselected_note/);assert.deepEqual(h.reads,[PURCHASE_KEY]);
  assert.equal(JSON.stringify([...h.storage]),before);assert.deepEqual(h.writes,[]);
});
test('PRIV-T05 cancelling consent creates no artifact, performs no fetch and never writes',async()=>{
  const h=harness({confirm:false});h.choice.checked=true;await h.api.buildDeepDiveArtifact();
  assert.equal(h.artifact(),null);assert.equal(h.fetches(),0);assert.deepEqual(h.writes,[]);assert.match(h.status(),/キャンセル/);
});
test('PRIV-T06 changing selection invalidates old private artifact and requires public-only rebuild',async()=>{
  const h=harness();h.choice.checked=true;await h.api.buildDeepDiveArtifact();const oldId=h.artifact().bundle_id;
  h.choice.checked=false;h.choice.handlers.change();assert.equal(h.artifact(),null);
  await h.api.copyDeepDiveArtifact();await h.api.shareDeepDiveArtifact();h.api.saveDeepDiveArtifact();
  assert.equal(h.copied.length+h.shared.length+h.saved.length,0);
  await h.api.buildDeepDiveArtifact();assert.notEqual(h.artifact().bundle_id,oldId);
  assert.doesNotMatch(h.artifact().text,/2041-02-03|local_purchase_progress\.json/);assert.equal(h.artifact().local_data_included,false);
});
test('PRIV-T07 changing selection during collection cancels the in-flight artifact',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r});const h=harness({pending});h.choice.checked=true;
  const work=h.api.buildDeepDiveArtifact();h.choice.checked=false;h.choice.handlers.change();resolve();await work;
  assert.equal(h.artifact(),null);assert.match(h.status(),/収録項目が変更/);assert.equal(h.elements.get('deepDiveCopyBtn').disabled,true);
});
test('PRIV-T08 page leave and back-forward restoration clear consent and artifact',async()=>{
  const h=harness();h.choice.checked=true;await h.api.buildDeepDiveArtifact();h.windowHandlers.pagehide();
  assert.equal(h.choice.checked,false);assert.equal(h.artifact(),null);
  h.choice.checked=true;h.windowHandlers.pageshow({persisted:true});assert.equal(h.choice.checked,false);
});
test('PRIV-T09 corrupted or invalid selected records fail closed without overwriting',async()=>{
  for(const raw of ['{invalid',JSON.stringify({t1:'true'}),JSON.stringify({t1:true,d1:'2041-02-30'}),'[]','null']){
    const h=harness({raw});h.choice.checked=true;await h.api.buildDeepDiveArtifact();
    assert.equal(h.artifact(),null);assert.equal(h.fetches(),0);assert.equal(h.storage.get(PURCHASE_KEY),raw);assert.deepEqual(h.writes,[]);
  }
});
test('PRIV-T10 absent or legacy missing fields stay unknown, not unpurchased',async()=>{
  const h=harness({raw:null});h.choice.checked=true;await h.api.buildDeepDiveArtifact();const s=summary(h.artifact().text);
  assert.equal(s.local_purchase_progress.value.t1,null);assert.equal(s.local_purchase_progress.value.d1,null);
  assert.equal(s.trigger_context.basis,'PUBLIC_MARKET_ONLY');assert.match(h.confirms[0],/未登録/);
  const legacy=harness({raw:JSON.stringify({t1:true,t2:false,t3:false})});legacy.choice.checked=true;await legacy.api.buildDeepDiveArtifact();
  assert.equal(summary(legacy.artifact().text).local_purchase_progress.value.d1,null);
});
test('PRIV-T11 file save, clipboard and sharing use the exact same generated artifact',async()=>{
  const h=harness();await h.api.buildDeepDiveArtifact();const a=h.artifact();await h.api.copyDeepDiveArtifact();await h.api.shareDeepDiveArtifact();h.api.saveDeepDiveArtifact();
  assert.equal(h.copied[0],a.text);assert.equal(h.shared[0].files[0],a.file);assert.equal(h.saved[0],a.file);assert.equal(await a.file.text(),a.text);
});
test('PRIV-T12 share cancellation does not change purchase or review records',async()=>{
  const h=harness({shareCancel:true});const before=JSON.stringify([...h.storage]);await h.api.buildDeepDiveArtifact();const id=h.artifact().bundle_id;
  await h.api.shareDeepDiveArtifact();assert.equal(JSON.stringify([...h.storage]),before);assert.equal(h.artifact().bundle_id,id);assert.deepEqual(h.writes,[]);
});
test('PRIV-T13 public export never mutates market input or the live personalized evaluator',()=>{
  const h=harness();const before=JSON.stringify(h.market);
  const liveBefore=h.api.evaluateDeepDiveTriggers(h.market,{}, {},stored);
  h.api.buildDeepDiveMarkdown(h.sources,manifest);
  const liveAfter=h.api.evaluateDeepDiveTriggers(h.market,{}, {},stored);
  assert.equal(JSON.stringify(h.market),before);assert.equal(JSON.stringify(liveAfter),JSON.stringify(liveBefore));assert.match(liveAfter.reasons.join(' '),/第2弾/);
});
