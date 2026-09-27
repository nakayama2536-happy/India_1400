(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.IndiaDeepDiveBundle=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const MANIFEST_PATH="publication_manifest.json";
  const ALLOWED_PATHS=new Set([
    "market.json","history.json","indicator_history.json","forecast_evaluation.json",
    "nifty_daily_history.json","nifty_ohlc_history.json","common_snapshot.json",
    "india_core.json","india_core_history.json","VERSION",
  ]);
  const decoder=new TextDecoder();

  function safePath(path){return ALLOWED_PATHS.has(String(path||""))}
  async function sha256Hex(bytes){
    const input=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    const digest=await crypto.subtle.digest("SHA-256",input);
    return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
  }
  async function fetchBytes(path,fetchImpl){
    if(path!==MANIFEST_PATH&&!safePath(path))throw new Error("許可されていないsource pathです: "+path);
    const response=await fetchImpl(path+(path.includes("?")?"&":"?")+"v="+Date.now(),{cache:"no-store"});
    if(!response.ok)throw new Error(path+": HTTP "+response.status);
    return new Uint8Array(await response.arrayBuffer());
  }
  async function fetchManifest(fetchImpl){
    const bytes=await fetchBytes(MANIFEST_PATH,fetchImpl);
    let data;
    try{data=JSON.parse(decoder.decode(bytes));}
    catch(_){throw new Error("publication_manifest.json が不正です");}
    if(data?.market!=="INDIA"||data?.source_state!=="READY"||!data?.publication_id)throw new Error("publication manifestがREADYではありません");
    return data;
  }
  function fileEntry(manifest,path){
    return (manifest.files||[]).find(x=>x&&x.path===path)||null;
  }
  function validateManifest(manifest,sourceDefs){
    const paths=new Set((sourceDefs||[]).map(x=>x.path));
    if(paths.size!==sourceDefs.length)throw new Error("source定義に重複があります");
    for(const def of sourceDefs){
      if(!safePath(def.path))throw new Error("許可されていないsource定義です: "+def.path);
      const item=fileEntry(manifest,def.path);
      if(!item)throw new Error("manifestにsourceがありません: "+def.path);
      if(item.status!=="OK"||item.required_for_bundle!==true)throw new Error("必須sourceがREADYではありません: "+def.path);
      if(typeof item.sha256!=="string"||!/^[0-9a-f]{64}$/.test(item.sha256))throw new Error("manifest hashが不正です: "+def.path);
      if(!Number.isInteger(Number(item.bytes))||Number(item.bytes)<=0)throw new Error("manifest bytesが不正です: "+def.path);
    }
    for(const item of manifest.files||[]){
      if(item?.required_for_bundle&&!paths.has(item.path))throw new Error("必須source定義が不足しています: "+item.path);
    }
    return true;
  }
  async function fetchVerifiedSource(def,manifest,fetchImpl){
    const item=fileEntry(manifest,def.path);
    const bytes=await fetchBytes(def.path,fetchImpl);
    if(bytes.length!==Number(item.bytes))throw new Error(def.path+" のbytesがmanifestと一致しません");
    const actual=await sha256Hex(bytes);
    if(actual!==item.sha256)throw new Error(def.path+" のSHA-256がmanifestと一致しません");
    const raw=decoder.decode(bytes);
    let data=raw;
    if(def.type==="json"){
      try{data=JSON.parse(raw);}catch(_){throw new Error(def.path+" のJSONが不正です");}
    }
    return {...def,raw,data,bytes:bytes.length,sha256:actual,manifest_as_of:item.as_of??null};
  }
  async function loadOnce(sourceDefs,fetchImpl){
    const start=await fetchManifest(fetchImpl);
    validateManifest(start,sourceDefs);
    const sources=await Promise.all(sourceDefs.map(def=>fetchVerifiedSource(def,start,fetchImpl)));
    const end=await fetchManifest(fetchImpl);
    if(end.publication_id!==start.publication_id){
      const err=new Error("公開データが更新途中です");
      err.code="PUBLICATION_CHANGED";
      throw err;
    }
    validateManifest(end,sourceDefs);
    return {manifest:start,sources};
  }
  async function loadVerifiedSources(sourceDefs,options={}){
    const fetchImpl=options.fetchImpl||fetch;
    const attempts=Math.max(1,Math.min(3,Number(options.attempts||2)));
    let last;
    for(let i=0;i<attempts;i++){
      try{return await loadOnce(sourceDefs,fetchImpl);}
      catch(e){
        last=e;
        if(e?.code==="PUBLICATION_CHANGED"&&i+1<attempts)continue;
        throw e;
      }
    }
    throw last||new Error("FULL sourceを取得できませんでした");
  }
  return {MANIFEST_PATH,ALLOWED_PATHS,safePath,sha256Hex,validateManifest,loadVerifiedSources};
});
