// Runs the candidate renderer with unchanged production persistence functions.
// This is a deterministic DOM/storage mock, not iPhone acceptance.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(process.env.PURCHASE_PREVIEW_HTML||'index.html','utf8');
const code=html.slice(html.indexOf('const PURCHASE_STATE_KEY='),html.indexOf('function fallbackReferenceItems'));
const KEY='india1400.purchaseProgress.v1';
const saved={t1:true,t2:false,t3:false,updated_at:'2026-09-25T13:44:52.000Z'};
function harness(initial=null){
  const items=new Map([['unrelated.personal.record','keep']]);
  if(initial!==null)items.set(KEY,JSON.stringify(initial));
  const nodes={},prompts=[],notices=[];let writes=0,accept=false,fail=false,buttons=[];
  const node=id=>nodes[id]||(nodes[id]={innerHTML:'',textContent:''});
  node('purchaseProgress').querySelectorAll=()=>{
    buttons=[...node('purchaseProgress').innerHTML.matchAll(/data-tranche="([123])"/g)].map(m=>({dataset:{tranche:m[1]},addEventListener:(_event,fn)=>{buttons[Number(m[1])-1].click=fn;}}));
    return buttons;
  };
  const context=vm.createContext({market:null,Date,Number,$:node,
    setText:(id,text)=>node(id).textContent=text,
    renderTranchePlan:()=>{},toast:m=>notices.push(m),
    confirm:m=>{prompts.push(m);return accept;},
    localStorage:{getItem:k=>items.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');writes++;items.set(k,v);}}
  });
  vm.runInContext(code,context);
  const run=s=>vm.runInContext(s,context);
  return {run,items,nodes,prompts,notices,node,accept:()=>{accept=true;},fail:()=>{fail=true;},writes:()=>writes,buttons:()=>buttons};
}
test('render has three combined buttons, no duplicate controls or writes',()=>{
  const h=harness();h.run('renderPurchaseProgress()');
  assert.equal(h.buttons().length,3);assert.equal(h.writes(),0);
  assert.equal((h.node('purchaseProgress').innerHTML.match(/aria-pressed="false"/g)||[]).length,3);
  assert.equal(h.node('purchaseUpdated').textContent,'購入進捗はまだ記録されていません。');
  assert.ok(!html.includes('id="purchaseControls"'));
});
test('render preserves saved states, exact timestamp bytes and unrelated key',()=>{
  const h=harness(saved),before=h.items.get(KEY);h.run('renderPurchaseProgress()');
  assert.equal(h.items.get(KEY),before);assert.equal(h.writes(),0);
  assert.equal(h.items.get('unrelated.personal.record'),'keep');
  assert.match(h.node('purchaseProgress').innerHTML,/第1弾 実施済/);
  assert.match(h.node('purchaseProgress').innerHTML,/第2弾 未実施/);
});
test('cancel through real bound button handler makes no change',()=>{
  const h=harness(saved),before=h.items.get(KEY);h.run('renderPurchaseProgress()');h.buttons()[1].click();
  assert.equal(h.prompts.length,1);assert.equal(h.items.get(KEY),before);assert.equal(h.writes(),0);
});
test('confirm explicitly names earlier stages affected by legacy cascade',()=>{
  const h=harness();h.accept();h.run('confirmTrancheChange(2)');
  const s=JSON.parse(h.items.get(KEY));assert.equal(s.t1,true);assert.equal(s.t2,true);assert.equal(s.t3,false);
  assert.match(h.prompts[0],/第1弾・第2弾/);assert.match(h.prompts[0],/購入注文は行いません/);assert.equal(h.writes(),1);
});
test('reversing stage two explicitly includes stage three',()=>{
  const h=harness({...saved,t2:true,t3:true});h.accept();h.run('confirmTrancheChange(2)');
  const s=JSON.parse(h.items.get(KEY));assert.equal(s.t1,true);assert.equal(s.t2,false);assert.equal(s.t3,false);
  assert.match(h.prompts[0],/第2弾・第3弾を未実施/);
});
test('invalid stage cannot open prompt or persist',()=>{
  const h=harness();h.accept();for(const s of ['0','4','1.5','NaN','"1"'])h.run('confirmTrancheChange('+s+')');
  assert.equal(h.writes(),0);assert.equal(h.prompts.length,0);
});
test('quota failure preserves original record and reports failure',()=>{
  const h=harness(saved),before=h.items.get(KEY);h.accept();h.fail();h.run('confirmTrancheChange(2)');
  assert.equal(h.items.get(KEY),before);assert.equal(h.writes(),0);assert.ok(h.notices.some(s=>s.includes('保存できません')));
});
test('reopen of saved candidate state is read only',()=>{
  const h=harness(saved);h.accept();h.run('confirmTrancheChange(2)');
  const bytes=h.items.get(KEY),next=harness(JSON.parse(bytes));next.run('renderPurchaseProgress()');
  assert.equal(next.items.get(KEY),bytes);assert.equal(next.writes(),0);assert.match(next.node('purchaseProgress').innerHTML,/第2弾 実施済/);
});
test('reset remains confirmation gated; cancelled reset preserves bytes',()=>{
  const h=harness(saved),before=h.items.get(KEY);h.run('resetPurchaseState()');
  assert.equal(h.items.get(KEY),before);assert.equal(h.writes(),0);
});
test('confirmed reset uses original storage schema only',()=>{
  const h=harness({...saved,t2:true,t3:true});h.accept();h.run('resetPurchaseState()');
  const s=JSON.parse(h.items.get(KEY));assert.equal(s.t1,false);assert.equal(s.t2,false);assert.equal(s.t3,false);
  assert.deepEqual(Object.keys(s).sort(),['t1','t2','t3','updated_at']);assert.equal(h.items.get('unrelated.personal.record'),'keep');
});
