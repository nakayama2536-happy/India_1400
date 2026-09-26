const DEEP_DIVE_FILES=Object.freeze([
{path:"market.json",label:"市場・判定・テクニカル・予測・品質",type:"json"},
{path:"history.json",label:"14:00定点履歴",type:"json"},
{path:"indicator_history.json",label:"外部指標履歴",type:"json"},
{path:"forecast_evaluation.json",label:"予測検証履歴",type:"json"},
{path:"nifty_daily_history.json",label:"NIFTY長期日足終値",type:"json"},
{path:"nifty_ohlc_history.json",label:"NIFTY OHLC履歴",type:"json"},
{path:"common_snapshot.json",label:"共通仕様スナップショット",type:"json"},
{path:"india_core.json",label:"インド・コア最新情報",type:"json"},
{path:"india_core_history.json",label:"インド・コア基準価額履歴",type:"json"},
{path:"VERSION",label:"アプリバージョン",type:"text"}]);
let deepDiveArtifact=null;
const DEEP_DIVE_TRIGGER_VERSION="1.0";
const DEEP_DIVE_TRIGGER_THRESHOLDS=Object.freeze({
  nifty_abs_daily_pct:1.5,
  nifty_priority_abs_daily_pct:2.5,
  usdinr_abs_5d_pct:1.5,
  brent_abs_5d_pct:5,
  india_vix_abs_5d_pct:10,
  fii_abs_crore:3000,
  breadth_divergence_ratio_pct:45
});
function ddFinite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function ddDirection(label){const x=String(label||"");if(x.includes("上向き")||x.includes("上昇"))return 1;if(x.includes("下向き")||x.includes("下落"))return-1;return 0}
function ddUnique(xs){return [...new Set((xs||[]).filter(Boolean))]}
function evaluateDeepDiveTriggers(m={},fund={},common={},local={}){
  const os=m.operational_state||m.market_state||{},regular=os.regular_trading_day!==false&&!["CLOSED","OFF"].includes(os.code);
  const categories=[],reasons=[],mandatory=[];
  const pushCategory=(key,label,severity,summary,details=[])=>categories.push({key,label,severity,active:severity>0,summary,details});

  let tradeSeverity=0,tradeDetails=[];
  const tg=m.trade_guide||{},plan=m.execution_plan||{},stages=Array.isArray(plan.tranches)?plan.tranches:[];
  const firstPending=local?.t1?local?.t2?local?.t3?0:3:2:1;
  const nextStage=stages.find(x=>Number(x.stage)===firstPending);
  if(tg.market_stage_code==="SELL_CAUTION"){
    tradeSeverity=2;tradeDetails.push("市場段階が売り・過熱注意");
  }else if(regular&&nextStage){
    const cs=Array.isArray(nextStage.conditions)?nextStage.conditions:[],met=cs.filter(x=>x.state==="met").length,total=cs.length;
    if(nextStage.status==="READY"){tradeSeverity=2;tradeDetails.push(`第${firstPending}弾の実行条件が充足`)}
    else if(total>=2&&met>=Math.max(1,total-1)){tradeSeverity=1;tradeDetails.push(`第${firstPending}弾が成立直前（${met}/${total}条件）`)}
  }else if(regular&&!stages.length){
    const bc=ddFinite(tg.buy_condition_count),bt=ddFinite(tg.buy_condition_total),sc=ddFinite(tg.sell_condition_count);
    if(bt&&bc!==null&&bc>=bt){tradeSeverity=2;tradeDetails.push(`買い条件 ${bc}/${bt} 成立`)}
    else if(bt&&bc!==null&&bc>=bt-1){tradeSeverity=1;tradeDetails.push(`買い条件 ${bc}/${bt} で成立接近`)}
    if(sc!==null&&sc>=2){tradeSeverity=Math.max(tradeSeverity,1);tradeDetails.push(`売り注意条件が${sc}項目成立`)}
  }
  if(tradeSeverity){
    reasons.push(...tradeDetails);
    mandatory.push("現在の第1～第3弾の未達条件を特定し、成立を待つ合理性と条件緩和の可否を検証する。","直近安値・MA5・MA25・戻り高値を使って、ダマシ反発と下落再開の条件を確認する。","実行する場合は次段階へ進む条件、実行しない場合は再確認条件を明示する。");
  }
  pushCategory("TRADE_PROXIMITY","売買条件接近",tradeSeverity,tradeDetails.join(" / ")||"成立接近なし",tradeDetails);

  let shockSeverity=0,shockDetails=[];
  const nCh=ddFinite(m?.nifty?.change_pct),fx5=ddFinite(m?.usdinr?.change_5d_pct),oil5=ddFinite(m?.brent?.change_5d_pct),vix5=ddFinite(m?.india_vix?.change_5d_pct),fii=ddFinite(m?.fii_dii?.fii?.net_value_crore);
  if(nCh!==null&&Math.abs(nCh)>=DEEP_DIVE_TRIGGER_THRESHOLDS.nifty_abs_daily_pct){shockSeverity=Math.max(shockSeverity,Math.abs(nCh)>=DEEP_DIVE_TRIGGER_THRESHOLDS.nifty_priority_abs_daily_pct?2:1);shockDetails.push(`NIFTY日次変化 ${nCh>0?"+":""}${nCh.toFixed(2)}%`)}
  if(fx5!==null&&Math.abs(fx5)>=DEEP_DIVE_TRIGGER_THRESHOLDS.usdinr_abs_5d_pct){shockSeverity=Math.max(shockSeverity,1);shockDetails.push(`USD/INR 5日変化 ${fx5>0?"+":""}${fx5.toFixed(2)}%`)}
  if(oil5!==null&&Math.abs(oil5)>=DEEP_DIVE_TRIGGER_THRESHOLDS.brent_abs_5d_pct){shockSeverity=Math.max(shockSeverity,1);shockDetails.push(`Brent 5日変化 ${oil5>0?"+":""}${oil5.toFixed(2)}%`)}
  if(vix5!==null&&Math.abs(vix5)>=DEEP_DIVE_TRIGGER_THRESHOLDS.india_vix_abs_5d_pct){shockSeverity=Math.max(shockSeverity,Math.abs(vix5)>=20?2:1);shockDetails.push(`India VIX 5日変化 ${vix5>0?"+":""}${vix5.toFixed(2)}%`)}
  if(fii!==null&&Math.abs(fii)>=DEEP_DIVE_TRIGGER_THRESHOLDS.fii_abs_crore){shockSeverity=Math.max(shockSeverity,1);shockDetails.push(`FII/FPI ${fii>0?"+":""}${Math.round(fii).toLocaleString("ja-JP")} crore`)}
  if(["HIGH","DANGER","CAUTION"].includes(String(tg.external_risk||"").toUpperCase())){shockSeverity=Math.max(shockSeverity,1);shockDetails.push(`外部リスク ${tg.external_risk}`)}
  if(shockDetails.length>=3)shockSeverity=Math.max(shockSeverity,2);
  if(shockSeverity){
    reasons.push(...shockDetails.slice(0,3));
    mandatory.push("急変が単発ノイズかレジーム変化かを、長期日足・OHLC・外部指標履歴で検証する。","同種ショックの過去事例が十分にある場合、5営業日・20営業日後の分布を確認する。","NIFTYへの影響とインド・コアの円換算影響を分け、為替・原油・VIX・資金フローの寄与を整理する。");
  }
  pushCategory("MARKET_SHOCK","相場急変",shockSeverity,shockDetails.join(" / ")||"急変なし",shockDetails);

  let conflictSeverity=0,conflictDetails=[];
  const hs=m?.technical_forecast?.horizons||{},d1=ddDirection(hs["1"]?.label),d3=ddDirection(hs["3"]?.label),d14=ddDirection(hs["14"]?.label);
  if(d14&&((d1&&d1!==d14)||(d3&&d3!==d14))){conflictSeverity=1;conflictDetails.push("短期予測と14営業日予測の方向が不一致")}
  const adv=ddFinite(m?.breadth?.advance_ratio_pct);
  if(m?.breadth?.available&&nCh!==null&&adv!==null){
    if(nCh>0.3&&adv<DEEP_DIVE_TRIGGER_THRESHOLDS.breadth_divergence_ratio_pct){conflictSeverity=1;conflictDetails.push(`NIFTY上昇に対し上昇銘柄比率 ${adv.toFixed(1)}%`)}
    if(nCh<-0.3&&adv>100-DEEP_DIVE_TRIGGER_THRESHOLDS.breadth_divergence_ratio_pct){conflictSeverity=1;conflictDetails.push(`NIFTY下落に対し上昇銘柄比率 ${adv.toFixed(1)}%`)}
  }
  const rsi=ddFinite(m?.nifty?.rsi14),rsiPrev=ddFinite(m?.nifty?.rsi14_prev),hist=ddFinite(m?.nifty?.macd_hist),histPrev=ddFinite(m?.nifty?.macd_hist_prev);
  if(fii!==null&&fii<=-2000&&rsi!==null&&rsiPrev!==null&&hist!==null&&histPrev!==null&&rsi>rsiPrev&&hist>histPrev){conflictSeverity=1;conflictDetails.push("RSI・MACD改善に対してFII売り越しが大きい")}
  if(conflictDetails.length>=2)conflictSeverity=2;
  if(conflictSeverity){
    reasons.push(...conflictDetails);
    mandatory.push("相反する指標を列挙し、先行指標・遅行指標・ノイズの可能性を分けて評価する。","価格だけでなくBreadth・FII/DII・RSI・MACD・時間軸を照合し、どの条件が崩れれば判断が変わるか明示する。");
  }
  pushCategory("SIGNAL_CONFLICT","判断矛盾",conflictSeverity,conflictDetails.join(" / ")||"大きな矛盾なし",conflictDetails);

  let qualitySeverity=0,qualityDetails=[];
  const qs=String(m?.quality_state?.code||""),cq=String(common?.data_quality?.qc_state||""),cd=String(common?.data_quality?.data_state||"");
  const critical=Array.isArray(m?.data_quality?.critical_reasons)?m.data_quality.critical_reasons:[];
  if(critical.length){qualitySeverity=2;qualityDetails.push(...critical.slice(0,2))}
  if(["ERROR","MISSING"].includes(qs)){qualitySeverity=2;qualityDetails.push(`データ品質 ${qs}`)}
  if(cq==="FAIL"||cd==="MISSING"){qualitySeverity=2;qualityDetails.push(`共通QC ${cq||"--"} / ${cd||"--"}`)}
  if(regular&&qualitySeverity===0&&qs==="STALE"){qualitySeverity=1;qualityDetails.push("通常取引日に主要データがSTALE")}
  if(qualitySeverity){
    reasons.push(...qualityDetails);
    mandatory.push("古い・欠損・取得失敗のデータを分析根拠から分離し、判断可能範囲を明示する。","不足情報を推測で補完せず、再取得すべきデータと判断延期が必要な条件を示す。");
  }
  pushCategory("DATA_QUALITY","データ品質",qualitySeverity,qualityDetails.join(" / ")||(regular?"重大な品質異常なし":"休場・時間外は参考値として扱う"),qualityDetails);

  const active=categories.filter(x=>x.active),maxSeverity=Math.max(0,...categories.map(x=>x.severity));
  const levelCode=maxSeverity>=2||active.length>=2?"PRIORITY":active.length===1?"RECOMMENDED":"NONE";
  const levelLabel=levelCode==="PRIORITY"?"深掘り優先":levelCode==="RECOMMENDED"?"深掘り推奨":"深掘り不要";
  return{version:DEEP_DIVE_TRIGGER_VERSION,level_code:levelCode,level_label:levelLabel,active_count:active.length,regular_trading_day:regular,categories,reasons:ddUnique(reasons),mandatory_checks:ddUnique(mandatory),thresholds:DEEP_DIVE_TRIGGER_THRESHOLDS,note:"売買シグナルではなく、定型判定を超える追加分析の必要性を示す。"};
}
function deepDiveStamp(){const d=new Date(Date.now()+9*3600000),p=n=>String(n).padStart(2,"0"),y=d.getUTCFullYear(),m=p(d.getUTCMonth()+1),day=p(d.getUTCDate()),h=p(d.getUTCHours()),mi=p(d.getUTCMinutes()),s=p(d.getUTCSeconds());return{iso:`${y}-${m}-${day}T${h}:${mi}:${s}+09:00`,file:`${y}${m}${day}_${h}${mi}_JST`}}
function deepDiveSize(n){return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`}
async function fetchDeepDiveSource(x){const r=await fetch(x.type==="text"?x.path:`${x.path}?v=${Date.now()}`,{cache:"no-store"});if(!r.ok)throw new Error(`${x.path}: HTTP ${r.status}`);const raw=await r.text();return{...x,raw,data:x.type==="json"?JSON.parse(raw):raw,bytes:new Blob([raw]).size}}
function deepDiveInventory(src){const a=x=>Array.isArray(x)?x:[];return{
nifty_daily:{count:a(src["nifty_daily_history.json"].data?.records).length,latest:a(src["nifty_daily_history.json"].data?.records).at(-1)?.date},
nifty_ohlc:{count:a(src["nifty_ohlc_history.json"].data?.records).length,latest:a(src["nifty_ohlc_history.json"].data?.records).at(-1)?.date},
snapshots_1400:{count:a(src["history.json"].data?.records).length,latest:a(src["history.json"].data?.records).at(-1)?.date_jst||a(src["history.json"].data?.records).at(-1)?.date},
fund_history:{count:a(src["india_core_history.json"].data?.records).length,latest:a(src["india_core_history.json"].data?.records).at(-1)?.date},
forecast_eval:{count:a(src["forecast_evaluation.json"].data?.entries).length,latest:a(src["forecast_evaluation.json"].data?.entries).at(-1)?.date_jst||a(src["forecast_evaluation.json"].data?.entries).at(-1)?.date},
indicator_series:Object.fromEntries(Object.entries(src["indicator_history.json"].data?.series||{}).map(([k,v])=>[k,{count:a(v).length,latest:a(v).at(-1)?.date}]))}}
function buildDeepDiveMarkdown(sources){const src=Object.fromEntries(sources.map(x=>[x.path,x])),m=src["market.json"].data||{},fund=src["india_core.json"].data||{},common=src["common_snapshot.json"].data||{},local=loadPurchaseState(),stamp=deepDiveStamp(),trigger=evaluateDeepDiveTriggers(m,fund,common,local);
const summary={snapshot_created_jst:stamp.iso,version:src.VERSION.data.trim(),trigger_context:trigger,local_purchase_progress:{key:PURCHASE_STATE_KEY,value:local,scope:"purchase_progress_only"},market:{generated_at_jst:m.generated_at_jst,operational_state:m.operational_state,quality_state:m.quality_state,data_quality:m.data_quality,trade_guide:m.trade_guide,execution_plan:m.execution_plan,nifty:m.nifty,technical_basis_snapshot:m.technical_basis_snapshot,breadth:m.breadth,fii_dii:m.fii_dii,sector_context:m.sector_context,usdinr:m.usdinr,usdjpy:m.usdjpy,inrjpy:m.inrjpy,yen_effect:m.yen_effect,brent:m.brent,india_vix:m.india_vix,technical_forecast:m.technical_forecast,forecast_verification:m.forecast_verification,comparison:m.comparison,history_1400:m.history_1400,reference_data:m.reference_data,analysis_meta:m.analysis_meta,data_lineage:m.data_lineage,core_fetch:m.core_fetch,optional_errors:m.optional_errors,errors:m.errors},india_core:fund,common_snapshot:common,inventory:deepDiveInventory(src)};
let out=`# India 14:00 Check — ChatGPT深掘りフルスナップショット

## 今回の深掘りトリガー
- 判定: ${trigger.level_label}
- 有効トリガー: ${trigger.categories.filter(x=>x.active).map(x=>x.label).join(" / ")||"なし"}
- 理由: ${trigger.reasons.join(" / ")||"明示トリガーなし。ユーザー指定による任意深掘り"}

### 今回必ず確認する事項
${trigger.mandatory_checks.length?trigger.mandatory_checks.map((x,i)=>`${i+1}. ${x}`).join("\n"):"1. 標準分析を実施し、特段の追加トリガーがないことも確認する。"}

## ChatGPTへの標準分析依頼
このファイルはインド株投資判断アプリが保持する分析データのフルスナップショットです。画面上の結論だけを採用せず、RAW DATA APPENDIXまで必要に応じて検証してください。

1. 各データの日時、市場休場、鮮度、欠損、矛盾、フォールバックを最初に点検する。
2. NIFTYの日足・OHLC・MA・RSI・MACD・ボラティリティから日足と週足相当を独立評価し、支持線・抵抗線・反転確認・下落再開水準を抽出する。
3. 騰落数、セクター、FII/DII、India VIX、Brentから反発の広がりと質を確認する。
4. インド・コア本体とNIFTYを比較し、基準価額、MA25/75、RSI、MACD、GC/DCの差を確認する。
5. USD/INR、USD/JPY、INR/JPYから円換算寄与を確認する。
6. 1営業日・3営業日・1週間・2週間の上昇/横ばい/下落シナリオと確認条件を整理する。
7. 第1・第2・第3弾の条件を再点検し、現在の相場水準に対して古い条件があれば修正候補を示す。
8. 買いを急がない条件、追加購入停止条件、利益確定・縮小を再検討する条件を整理する。
9. アプリ判定と独立分析が一致しない場合は、差を生むデータや仮定を説明する。
10. 情報不足は推測せず、不足データを具体的に示す。

## 整理済み分析サマリー
\`\`\`json
${JSON.stringify(summary)}
\`\`\`

## 収録ファイル
${sources.map(x=>`- ${x.path}: ${x.label} / ${deepDiveSize(x.bytes)}`).join("\n")}

## RAW DATA APPENDIX
以下は収録対象の原文です。JSONはトークン浪費を抑えるため1行形式ですが、値は省略していません。

### local_purchase_progress.json
\`\`\`json
${JSON.stringify({key:PURCHASE_STATE_KEY,value:local,scope:"purchase_progress_only"})}
\`\`\`
`;
for(const x of sources){out+=`\n### ${x.path}\n\`\`\`${x.type==="json"?"json":"text"}\n${x.type==="json"?JSON.stringify(x.data):x.raw.trim()}\n\`\`\`\n`}
return out}
function setDeepDiveReady(v){["deepDiveShareBtn","deepDiveSaveBtn","deepDiveCopyBtn"].forEach(id=>{const e=$(id);if(e)e.disabled=!v})}
async function buildDeepDiveArtifact(){const b=$("deepDiveBuildBtn");if(b)b.disabled=true;setDeepDiveReady(false);deepDiveArtifact=null;setText("deepDiveStatus","全分析データを取得中です。長期履歴を含むため少し時間がかかる場合があります…");try{const sources=await Promise.all(DEEP_DIVE_FILES.map(fetchDeepDiveSource)),text=buildDeepDiveMarkdown(sources),stamp=deepDiveStamp(),name=`India_DeepDive_${stamp.file}.md`,file=new File([text],name,{type:"text/markdown;charset=utf-8"});deepDiveArtifact={name,text,file,sources};setDeepDiveReady(true);setText("deepDiveStatus",`作成完了：${name}\n${sources.length}ファイル＋端末の3分割進捗 / ${deepDiveSize(file.size)}\n「ChatGPTへ共有」または「ファイル保存」を使用してください。`);toast("深掘りファイルを作成しました",4200)}catch(e){setText("deepDiveStatus","作成中止：全データを揃えられませんでした。\n"+(e?.message||String(e))+"\n欠損状態ではフルスナップショットを作りません。");toast("深掘りファイルを作成できませんでした",4800)}finally{if(b)b.disabled=false}}
function saveDeepDiveArtifact(){if(!deepDiveArtifact)return;const u=URL.createObjectURL(deepDiveArtifact.file),a=document.createElement("a");a.href=u;a.download=deepDiveArtifact.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);toast("深掘りファイルを保存しました",3500)}
async function shareDeepDiveArtifact(){if(!deepDiveArtifact)return;try{if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[deepDiveArtifact.file]}))){await navigator.share({title:"インド株 売買タイミング深掘り",text:"India 14:00 Check のフルスナップショットです。",files:[deepDiveArtifact.file]});return}saveDeepDiveArtifact();toast("ファイル共有に未対応のため保存しました。ChatGPTへ添付してください。",5200)}catch(e){if(e?.name!=="AbortError")toast("共有できませんでした。ファイル保存を利用してください。",4500)}}
async function copyDeepDiveArtifact(){if(!deepDiveArtifact)return;try{await navigator.clipboard.writeText(deepDiveArtifact.text);toast("深掘りレポート全文をコピーしました",3500)}catch(e){toast("全文コピーに失敗しました。ファイル保存を利用してください。",4500)}}