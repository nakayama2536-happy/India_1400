(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.IndiaReviewHistory=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const SCHEMA_VERSION="0.1";
  const STORE_KEY="india1400.deepDiveReviews.v1";
  const MAX_RECORDS=100;
  const MAX_BACKUP_BYTES=1024*1024;
  const UTILITY_MAP={useful:"USEFUL",reference:"REFERENCE",noise:"NOISE",USEFUL:"USEFUL",REFERENCE:"REFERENCE",NOISE:"NOISE"};
  const UTILITY_LEGACY={USEFUL:"useful",REFERENCE:"reference",NOISE:"noise"};

  function nowIso(nowMs=Date.now()){return new Date(nowMs).toISOString();}
  function stable(value){
    if(Array.isArray(value))return value.map(stable);
    if(value&&typeof value==="object"){
      const out={};
      for(const key of Object.keys(value).sort())out[key]=stable(value[key]);
      return out;
    }
    return value;
  }
  function stableString(value){return JSON.stringify(stable(value));}
  function parseStore(raw){
    if(raw==null||raw==="")return {ok:true,records:{},store:null};
    try{
      const value=JSON.parse(raw);
      if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("review store must be an object");
      if(value.review_schema_version!==SCHEMA_VERSION||!value.records||typeof value.records!=="object"||Array.isArray(value.records)){
        throw new Error("review store schema is invalid");
      }
      return {ok:true,records:value.records,store:value};
    }catch(e){return {ok:false,error:String(e?.message||e),records:{}};}
  }
  function load(storage){return parseStore(storage.getItem(STORE_KEY));}

  function triggerSnapshot(trigger={}){
    return {
      level_code:trigger.level_code||"NONE",
      active_count:Number(trigger.active_count||0),
      reasons:(trigger.reasons||[]).map(String),
      categories:(trigger.categories||[]).map(x=>({
        key:x?.key||null,label:x?.label||null,severity:Number(x?.severity||0),
        active:!!x?.active,summary:x?.summary||null,
      })),
    };
  }
  function triggerSignature(trigger={}){
    const t=triggerSnapshot(trigger);
    return stableString({
      level_code:t.level_code,
      active_categories:t.categories.filter(x=>x.active).map(x=>({key:x.key,severity:x.severity,summary:x.summary})),
      reasons:t.reasons,
    });
  }
  function marketDate(market={},common={}){
    return String(
      common?.timestamps?.market_as_of ||
      market?.history_1400?.date_jst ||
      market?.nifty?.technical_date ||
      market?.operational_state?.date_jst ||
      "unknown"
    );
  }
  function decisionPhase(common={}){
    const d=common?.decision||{};
    if(d.phase)return String(d.phase);
    const items=common?.decision_items||[];
    const phases=[...new Set(items.map(x=>x?.phase).filter(Boolean))];
    return phases.length===1?String(phases[0]):"MULTI";
  }
  function evidenceIdentity(market={},common={}){
    const date=marketDate(market,common);
    const phase=decisionPhase(common);
    const captured=market?.history_1400?.current_date_has_record?"1400_CAPTURED":"NO_1400_CAPTURE";
    return "INDIA:"+date+":"+phase+":"+captured;
  }
  function unresolvedConditions(market={},common={},trigger={}){
    const out=[];
    const qs=String(market?.quality_state?.code||"").toUpperCase();
    const qc=String(common?.data_quality?.qc_state||"").toUpperCase();
    const ds=String(common?.data_quality?.data_state||"").toUpperCase();
    if(["ERROR","MISSING","STALE"].includes(qs))out.push("QUALITY_STATE:"+qs);
    if(qc&&qc!=="PASS")out.push("COMMON_QC:"+qc);
    if(ds&&ds!=="FRESH")out.push("COMMON_DATA:"+ds);
    for(const cat of trigger?.categories||[]){
      if(cat?.key==="DATA_QUALITY"&&cat?.active){
        for(const d of cat.details||[])out.push("DATA_QUALITY:"+String(d));
      }
    }
    return [...new Set(out)];
  }
  function contextFromMarket(market={},common={},trigger={},options={}){
    const date=marketDate(market,common);
    const ruleVersion=options.ruleVersion===undefined?(trigger.version||"india-deep-dive-trigger-v1"):options.ruleVersion;
    return {
      market:"INDIA",
      subject_type:"MARKET",
      subject_id:"INDIA_1400",
      subject_code:"INDIA",
      subject_label:"India 14:00 Check",
      evidence_identity:evidenceIdentity(market,common),
      rule_version:ruleVersion,
      trigger_signature:triggerSignature(trigger),
      bundle_id:options.bundleId||null,
      priority_at_review:{
        score:null,
        scale:"India deep-dive level; not probability or cross-market score",
        severity:trigger.level_code||"NONE",
        active_count:Number(trigger.active_count||0),
      },
      reason_snapshot:triggerSnapshot(trigger),
      unresolved_conditions:unresolvedConditions(market,common,trigger),
      market_date:date,
    };
  }
  function identity(context){
    return stableString({
      market:context.market,subject_type:context.subject_type,subject_id:context.subject_id,
      evidence_identity:context.evidence_identity,rule_version:context.rule_version,
      trigger_signature:context.trigger_signature,
    });
  }
  function viewForContext(context,storage){
    const loaded=load(storage);
    if(!loaded.ok)return {ok:false,error:loaded.error,state:"ERROR",record:null};
    const id=identity(context);
    const exact=loaded.records[id]||null;
    if(exact)return {ok:true,state:exact.review_state||"REVIEWED",record:exact,id,source:"v1"};
    const sameEvidence=Object.values(loaded.records).filter(r=>
      r&&r.market===context.market&&r.subject_id===context.subject_id&&r.evidence_identity===context.evidence_identity
    );
    if(sameEvidence.length){
      const record=sameEvidence.sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||"")))[0];
      return {ok:true,state:"RECHECK_REQUIRED",record,id,source:"v1"};
    }
    return {ok:true,state:"UNREVIEWED",record:null,id,source:null};
  }
  function revisionSnapshot(record){
    if(!record)return null;
    return {
      review_state:record.review_state,utility:record.utility,note:record.note,
      bundle_id:record.bundle_id,priority_at_review:record.priority_at_review,
      reason_snapshot:record.reason_snapshot,unresolved_conditions:record.unresolved_conditions,
      reviewed_at:record.reviewed_at,updated_at:record.updated_at,
    };
  }
  function saveReview(context,utility,note,storage,options={}){
    const mapped=UTILITY_MAP[utility];
    if(!mapped)throw new Error("utility is invalid");
    note=String(note||"");
    if(note.length>240)throw new Error("note exceeds 240 characters");
    const loaded=load(storage);
    if(!loaded.ok){const e=new Error("既存の評価履歴が壊れているため保存を中止しました");e.code="CORRUPT_STORE";throw e;}
    const id=identity(context),records={...loaded.records},previous=records[id]||null;
    if(!previous&&Object.keys(records).length>=MAX_RECORDS){
      const e=new Error("評価履歴が100件に達しています。バックアップ後に整理してください。古い記録は自動削除しません。");
      e.code="CAPACITY_LIMIT";throw e;
    }
    const ts=options.nowIso||nowIso(options.nowMs);
    const log=Array.isArray(previous?.revision_log)?[...previous.revision_log]:[];
    if(previous)log.push(revisionSnapshot(previous));
    const record={
      review_schema_version:SCHEMA_VERSION,review_id:id,
      market:context.market,subject_type:context.subject_type,subject_id:context.subject_id,
      subject_code:context.subject_code,subject_label:context.subject_label,
      evidence_identity:context.evidence_identity,rule_version:context.rule_version,
      trigger_signature:context.trigger_signature,bundle_id:context.bundle_id||null,
      review_state:"REVIEWED",utility:mapped,note,
      priority_at_review:context.priority_at_review,
      reason_snapshot:context.reason_snapshot,
      unresolved_conditions:context.unresolved_conditions||[],
      market_date:context.market_date||null,
      reviewed_at:previous?.reviewed_at||ts,updated_at:ts,
      provenance:previous?.provenance||{type:"user-entered"},
      revision_log:log,
    };
    records[id]=record;
    storage.setItem(STORE_KEY,JSON.stringify({review_schema_version:SCHEMA_VERSION,updated_at:ts,records}));
    return record;
  }
  function reportRows(storage){
    const loaded=load(storage);
    if(!loaded.ok)return {ok:false,error:loaded.error,records:[]};
    const records=Object.values(loaded.records).sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||"")));
    return {ok:true,records};
  }
  function backupObject(storage,options={}){
    const loaded=load(storage);
    if(!loaded.ok){const e=new Error("評価履歴が壊れているためバックアップを中止しました");e.code="CORRUPT_STORE";throw e;}
    return {
      backup_schema_version:"review-history-backup/0.1",
      created_at:options.nowIso||nowIso(options.nowMs),
      market:"INDIA",
      records:Object.values(loaded.records),
      counts:{records:Object.keys(loaded.records).length},
      contains_personal_notes:true,
      public_upload_allowed:false,
    };
  }
  function backupText(storage,options={}){return JSON.stringify(backupObject(storage,options),null,2)+"\n";}
  function inspectImport(text,storage){
    if(typeof text!=="string"||new TextEncoder().encode(text).length>MAX_BACKUP_BYTES)throw new Error("バックアップファイルが大きすぎます");
    let data;
    try{data=JSON.parse(text);}catch(_){throw new Error("バックアップJSONが不正です");}
    if(data?.backup_schema_version!=="review-history-backup/0.1"||data?.market!=="INDIA"||!Array.isArray(data.records)){
      throw new Error("対応していないバックアップ形式です");
    }
    const loaded=load(storage);
    if(!loaded.ok)throw new Error("端末の評価履歴が壊れているため復元を中止しました");
    const incoming={};
    for(const raw of data.records){
      if(!raw||raw.review_schema_version!==SCHEMA_VERSION||typeof raw.review_id!=="string"||!raw.review_id){
        throw new Error("バックアップに不正な評価記録があります");
      }
      incoming[raw.review_id]=raw;
    }
    let add=0,same=0,conflict=0;
    for(const [id,record] of Object.entries(incoming)){
      if(!loaded.records[id])add++;
      else if(stableString(loaded.records[id])===stableString(record))same++;
      else conflict++;
    }
    if(Object.keys(loaded.records).length+add>MAX_RECORDS)throw new Error("復元すると100件を超えます。既存記録を自動削除しません。");
    return {data,incoming,existing:loaded.records,add,same,conflict,total_incoming:Object.keys(incoming).length};
  }
  function applyImport(preview,storage,options={}){
    const latest=load(storage);
    if(!latest.ok)throw new Error("復元直前に端末履歴を読み込めませんでした");
    if(stableString(latest.records)!==stableString(preview.existing))throw new Error("復元確認後に端末履歴が変わったため中止しました");
    const records={...latest.records};
    for(const [id,record] of Object.entries(preview.incoming))if(!records[id])records[id]=record;
    const ts=options.nowIso||nowIso(options.nowMs);
    storage.setItem(STORE_KEY,JSON.stringify({review_schema_version:SCHEMA_VERSION,updated_at:ts,records}));
    return {added:preview.add,skipped_same:preview.same,skipped_conflict:preview.conflict};
  }
  function legacyUtility(value){return UTILITY_LEGACY[value]||"";}

  return {
    SCHEMA_VERSION,STORE_KEY,MAX_RECORDS,
    contextFromMarket,identity,viewForContext,saveReview,reportRows,
    backupObject,backupText,inspectImport,applyImport,legacyUtility,
  };
});
