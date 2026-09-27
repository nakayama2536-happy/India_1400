const test=require('node:test');
const assert=require('node:assert/strict');
global.crypto=global.crypto||require('node:crypto').webcrypto;
const mod=require('../deep-dive-bundle.js');

const enc=new TextEncoder();
const bytes=s=>enc.encode(s);
const jsonBytes=o=>bytes(JSON.stringify(o)+'\n');
const response=b=>new Response(b,{status:200,headers:{'content-type':'application/octet-stream'}});
const defs=[
  {path:"market.json",label:"market",type:"json"},
  {path:"history.json",label:"history",type:"json"},
  {path:"indicator_history.json",label:"indicators",type:"json"},
  {path:"forecast_evaluation.json",label:"forecast",type:"json"},
  {path:"nifty_daily_history.json",label:"daily",type:"json"},
  {path:"nifty_ohlc_history.json",label:"ohlc",type:"json"},
  {path:"common_snapshot.json",label:"common",type:"json"},
  {path:"india_core.json",label:"core",type:"json"},
  {path:"india_core_history.json",label:"core history",type:"json"},
  {path:"VERSION",label:"version",type:"text"},
];

async function fixture(options={}){
  const contents={};
  for(const d of defs){
    contents[d.path]=d.type==="json"?jsonBytes({path:d.path,value:1}):bytes("APP_VERSION=5.7\nUI_VERSION=5.23\n");
  }
  if(options.contents)Object.assign(contents,options.contents);
  const files=[];
  for(const d of defs){
    const b=contents[d.path];
    files.push({
      source_id:d.path.replace(/\W+/g,"_"),path:d.path,purpose:d.label,type:d.type,
      status:"OK",sha256:await mod.sha256Hex(b),bytes:b.length,required_for_bundle:true,
      as_of:null,rows:null,revision:null,
    });
  }
  if(options.mutateFiles)options.mutateFiles(files);
  const manifest={
    schema_version:"1.0",market:"INDIA",
    publication_id:options.publicationId||"in-test-001",
    source_state:options.sourceState||"READY",
    bundle_contract:"deep-dive/0.1",files,
  };
  return {contents,manifest};
}
function fetcher(fx,options={}){
  let manifestCalls=0;
  return async url=>{
    const path=String(url).split("?")[0];
    if(path===mod.MANIFEST_PATH){
      manifestCalls++;
      const value=options.manifestAt?options.manifestAt(manifestCalls,fx.manifest):fx.manifest;
      return response(jsonBytes(value));
    }
    if(!(path in fx.contents))return new Response("missing",{status:404});
    const b=options.sourceBytes?.[path]||fx.contents[path];
    return response(b);
  };
}

test('FULL-T01 READY manifest verifies all 10 sources',async()=>{
  const fx=await fixture();
  const out=await mod.loadVerifiedSources(defs,{fetchImpl:fetcher(fx),attempts:1});
  assert.equal(out.manifest.publication_id,"in-test-001");
  assert.equal(out.sources.length,10);
  assert.ok(out.sources.every(x=>x.sha256&&x.bytes>0));
  assert.equal(out.sources.find(x=>x.path==="VERSION").data.includes("UI_VERSION=5.23"),true);
});

test('FULL-T02 SHA mismatch blocks FULL',async()=>{
  const fx=await fixture();
  const changed=jsonBytes({path:"market.json",value:2});
  await assert.rejects(
    mod.loadVerifiedSources(defs,{fetchImpl:fetcher(fx,{sourceBytes:{"market.json":changed}}),attempts:1}),
    /bytes|SHA-256/
  );
});

test('FULL-T03 byte-count mismatch blocks FULL even if manifest hash field is present',async()=>{
  const fx=await fixture({mutateFiles:files=>{files.find(x=>x.path==="market.json").bytes+=1;}});
  await assert.rejects(
    mod.loadVerifiedSources(defs,{fetchImpl:fetcher(fx),attempts:1}),
    /bytes/
  );
});

test('FULL-T04 missing required source definition blocks FULL',async()=>{
  const fx=await fixture();
  await assert.rejects(
    mod.loadVerifiedSources(defs.slice(0,-1),{fetchImpl:fetcher(fx),attempts:1}),
    /必須source定義/
  );
});

test('FULL-T05 manifest not READY blocks FULL',async()=>{
  const fx=await fixture({sourceState:"PARTIAL"});
  await assert.rejects(
    mod.loadVerifiedSources(defs,{fetchImpl:fetcher(fx),attempts:1}),
    /READY/
  );
});

test('FULL-T06 publication change during collection blocks or retries',async()=>{
  const fx=await fixture();
  await assert.rejects(
    mod.loadVerifiedSources(defs,{attempts:1,fetchImpl:fetcher(fx,{manifestAt:(n,m)=>n===1?m:{...m,publication_id:"in-new"}})}),
    /更新途中/
  );
});

test('FULL-T07 unsafe source path is rejected',async()=>{
  const fx=await fixture();
  const unsafe=[...defs,{path:"../secret.json",label:"bad",type:"json"}];
  await assert.rejects(
    mod.loadVerifiedSources(unsafe,{fetchImpl:fetcher(fx),attempts:1}),
    /許可されていないsource/
  );
  assert.equal(mod.safePath("market.json"),true);
  assert.equal(mod.safePath("../market.json"),false);
});

test('FULL-T08 invalid JSON with matching manifest hash is blocked',async()=>{
  const invalid=bytes("{bad");
  const fx=await fixture({contents:{"market.json":invalid}});
  await assert.rejects(
    mod.loadVerifiedSources(defs,{fetchImpl:fetcher(fx),attempts:1}),
    /JSONが不正/
  );
});
