// Production purchase-state contract: compact buttons + per-tranche execution dates.
// Deterministic DOM/storage mock; not an iPhone/native-browser acceptance test.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(process.env.PURCHASE_PREVIEW_HTML||'index.html','utf8');
const code=html.slice(html.indexOf('const PURCHASE_STATE_KEY='),html.indexOf('function fallbackReferenceItems'));
const KEY='india1400.purchaseProgress.v1';
const legacy={t1:true,t2:false,t3:false,updated_at:'2026-09-25T13:44:52.000Z'};

function harness(initial=null){
  const items=new Map([['unrelated.personal.record','keep']]);
  if(initial!==null)items.set(KEY,JSON.stringify(initial));
  const nodes={},confirmMessages=[],promptCalls=[],notices=[];
  let writes=0,confirmAnswer=false,promptAnswer=null,fail=false,buttons=[];
  const node=id=>nodes[id]||(nodes[id]={innerHTML:'',textContent:''});
  node('purchaseProgress').querySelectorAll=()=>{
    buttons=[...node('purchaseProgress').innerHTML.matchAll(/data-tranche="([123])"/g)].map(m=>({dataset:{tranche:m[1]},addEventListener:(_event,fn)=>{buttons[Number(m[1])-1].click=fn;}}));
    return buttons;
  };
  const context=vm.createContext({
    market:null,Date,Number,$:node,
    setText:(id,text)=>node(id).textContent=text,
    renderTranchePlan:()=>{},toast:m=>notices.push(m),
    confirm:m=>{confirmMessages.push(m);return confirmAnswer;},
    prompt:(m,initial)=>{promptCalls.push({message:m,initial});return promptAnswer;},
    localStorage:{
      getItem:k=>items.get(k)??null,
      setItem:(k,v)=>{if(fail)throw Error('quota');writes++;items.set(k,v);}
    }
  });
  vm.runInContext(code,context);
  const run=s=>vm.runInContext(s,context);
  return {
    run,items,nodes,notices,node,buttons:()=>buttons,writes:()=>writes,
    confirms:()=>confirmMessages,prompts:()=>promptCalls,
    accept:()=>{confirmAnswer=true;},reject:()=>{confirmAnswer=false;},
    enter:v=>{promptAnswer=v;},fail:()=>{fail=true;}
  };
}

test('render uses three combined buttons without writing storage',()=>{
  const h=harness();h.run('renderPurchaseProgress()');
  assert.equal(h.buttons().length,3);
  assert.equal(h.writes(),0);
  assert.match(h.node('purchaseProgress').innerHTML,/タップして記録/);
  assert.ok(!html.includes('id="purchaseControls"'));
});

test('legacy executed state is preserved byte-for-byte and date remains unknown',()=>{
  const h=harness(legacy),before=h.items.get(KEY);
  h.run('renderPurchaseProgress()');
  assert.equal(h.items.get(KEY),before);
  assert.equal(h.writes(),0);
  assert.match(h.node('purchaseProgress').innerHTML,/第1弾 実施済/);
  assert.match(h.node('purchaseProgress').innerHTML,/日付未登録/);
});

test('cancelling date prompt changes nothing',()=>{
  const h=harness(),before=h.items.get(KEY);
  h.run('renderPurchaseProgress()');
  h.buttons()[0].click();
  assert.equal(h.prompts().length,1);
  assert.equal(h.confirms().length,0);
  assert.equal(h.items.get(KEY),before);
  assert.equal(h.writes(),0);
});

test('invalid execution date is rejected without persistence',()=>{
  const h=harness();h.enter('2026-02-31');h.accept();
  h.run('confirmTrancheChange(1)');
  assert.equal(h.writes(),0);
  assert.equal(h.confirms().length,0);
  assert.ok(h.notices.some(x=>x.includes('正しい日付')));
});

test('stage one records only its own execution date',()=>{
  const h=harness();h.enter('2026-09-27');h.accept();
  h.run('confirmTrancheChange(1)');
  const s=JSON.parse(h.items.get(KEY));
  assert.equal(s.t1,true);assert.equal(s.t2,false);assert.equal(s.t3,false);
  assert.equal(s.d1,'2026-09-27');assert.equal(s.d2,null);assert.equal(s.d3,null);
  assert.match(h.confirms()[0],/2026\/09\/27/);
});

test('stage two cascade does not invent stage-one date',()=>{
  const h=harness();h.enter('2026-09-27');h.accept();
  h.run('confirmTrancheChange(2)');
  const s=JSON.parse(h.items.get(KEY));
  assert.equal(s.t1,true);assert.equal(s.t2,true);assert.equal(s.t3,false);
  assert.equal(s.d1,null);assert.equal(s.d2,'2026-09-27');assert.equal(s.d3,null);
  assert.match(h.confirms()[0],/日付未登録/);
});

test('confirm cancellation after date entry preserves original bytes',()=>{
  const h=harness(legacy),before=h.items.get(KEY);
  h.enter('2026-09-27');h.reject();
  h.run('confirmTrancheChange(2)');
  assert.equal(h.items.get(KEY),before);
  assert.equal(h.writes(),0);
});

test('reverting stage two clears dates for stage two and three only',()=>{
  const initial={t1:true,t2:true,t3:true,d1:'2026-09-20',d2:'2026-09-22',d3:'2026-09-25',updated_at:'x'};
  const h=harness(initial);h.accept();
  h.run('confirmTrancheChange(2)');
  const s=JSON.parse(h.items.get(KEY));
  assert.equal(s.t1,true);assert.equal(s.t2,false);assert.equal(s.t3,false);
  assert.equal(s.d1,'2026-09-20');assert.equal(s.d2,null);assert.equal(s.d3,null);
});

test('quota failure preserves original record and unrelated storage',()=>{
  const h=harness(legacy),before=h.items.get(KEY);
  h.enter('2026-09-27');h.accept();h.fail();
  h.run('confirmTrancheChange(2)');
  assert.equal(h.items.get(KEY),before);
  assert.equal(h.items.get('unrelated.personal.record'),'keep');
  assert.ok(h.notices.some(x=>x.includes('保存できません')));
});

test('reopen preserves execution date and renders it',()=>{
  const h=harness();h.enter('2026-09-27');h.accept();
  h.run('confirmTrancheChange(1)');
  const bytes=h.items.get(KEY),next=harness(JSON.parse(bytes));
  next.run('renderPurchaseProgress()');
  assert.equal(next.items.get(KEY),bytes);
  assert.equal(next.writes(),0);
  assert.match(next.node('purchaseProgress').innerHTML,/2026\/09\/27/);
});

test('confirmed reset clears all states and execution dates',()=>{
  const initial={t1:true,t2:true,t3:true,d1:'2026-09-20',d2:'2026-09-22',d3:'2026-09-25',updated_at:'x'};
  const h=harness(initial);h.accept();
  h.run('resetPurchaseState()');
  const s=JSON.parse(h.items.get(KEY));
  assert.equal(s.t1,false);assert.equal(s.t2,false);assert.equal(s.t3,false);
  assert.equal(s.d1,null);assert.equal(s.d2,null);assert.equal(s.d3,null);
  assert.equal(h.items.get('unrelated.personal.record'),'keep');
});

test('date validator accepts real leap day and rejects malformed values',()=>{
  const h=harness();
  assert.equal(h.run('validPurchaseDate("2028-02-29")'),true);
  assert.equal(h.run('validPurchaseDate("2027-02-29")'),false);
  assert.equal(h.run('validPurchaseDate("2026/09/27")'),false);
  assert.equal(h.run('validPurchaseDate("")'),false);
});
