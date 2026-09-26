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
function buildDeepDiveMarkdown(sources){const src=Object.fromEntries(sources.map(x=>[x.path,x])),m=src["market.json"].data||{},fund=src["india_core.json"].data||{},common=src["common_snapshot.json"].data||{},local=loadPurchaseState(),stamp=deepDiveStamp();
const summary={snapshot_created_jst:stamp.iso,version:src.VERSION.data.trim(),local_purchase_progress:{key:PURCHASE_STATE_KEY,value:local,scope:"purchase_progress_only"},market:{generated_at_jst:m.generated_at_jst,operational_state:m.operational_state,quality_state:m.quality_state,data_quality:m.data_quality,trade_guide:m.trade_guide,execution_plan:m.execution_plan,nifty:m.nifty,technical_basis_snapshot:m.technical_basis_snapshot,breadth:m.breadth,fii_dii:m.fii_dii,sector_context:m.sector_context,usdinr:m.usdinr,usdjpy:m.usdjpy,inrjpy:m.inrjpy,yen_effect:m.yen_effect,brent:m.brent,india_vix:m.india_vix,technical_forecast:m.technical_forecast,forecast_verification:m.forecast_verification,comparison:m.comparison,history_1400:m.history_1400,reference_data:m.reference_data,analysis_meta:m.analysis_meta,data_lineage:m.data_lineage,core_fetch:m.core_fetch,optional_errors:m.optional_errors,errors:m.errors},india_core:fund,common_snapshot:common,inventory:deepDiveInventory(src)};
let out=`# India 14:00 Check — ChatGPT深掘りフルスナップショット

## ChatGPTへの分析依頼
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