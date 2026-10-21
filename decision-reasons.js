/* decision-reasons/1.0: presentation only; never calculates a trade action. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IndiaDecisionReasons=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const BUY=[['low_zone','調整・低位'],['rsi_improving','RSI改善'],['macd_improving','MACD改善'],['above_ma5','5日線回復'],['above_ma25','25日線回復']];
const SELL=[['rsi_high','RSI高位'],['ma25_extended','25日線上方乖離'],['macd_worsening','MACD悪化'],['below_ma5','5日線割れ']];
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const text=v=>typeof v==='string'?v:typeof v==='number'&&Number.isFinite(v)?String(v):'';
const escape=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalized=v=>text(v).trim().replace(/[：]/g,':').replace(/\s+/g,'');
const unique=xs=>[...new Map(xs.filter(x=>text(x).trim()).map(x=>[normalized(x),text(x).trim()])).values()];
function message(v){if(typeof v==='string')return v;const x=object(v);return unique([x.label,x.detail||x.message||x.reason||x.observed]).join('：')||text(x.code||x.id);}
function dateLabel(v){const s=text(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '基準日未確認';const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s.replace(/-/g,'/'):'基準日未確認';}
function displayDetail(value){
  // Format only a complete, known price/MA expression. Never infer an inequality
  // from rounded display numbers or change the saved condition's boolean.
  const s=text(value).trim(),m=s.match(/^([+-]?\d+(?:\.\d+)?)\s*\/\s*MA(5|25)\s+([+-]?\d+(?:\.\d+)?)$/);
  const comma=n=>{const [whole,fraction]=n.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction===undefined?'':'.'+fraction);};
  return m?comma(m[1])+' / '+m[2]+'日線 '+comma(m[3]):s||'確認値なし';
}
function conditionGroup(guide,side){
  const g=object(guide),schema=side==='buy'?BUY:SELL,source=g[side+'_conditions'],rows=Array.isArray(source)?source:[];
  const warnings=[];
  const items=schema.map(([key,label])=>{
    const hits=rows.filter(x=>object(x).key===key),item=hits.length===1?object(hits[0]):{};
    let state=typeof item.met==='boolean'?(item.met?'met':'unmet'):'unknown';
    if(g.available!==true||item.available===false||['NOT_AVAILABLE','UNKNOWN','MISSING','ERROR'].includes(String(item.status||item.state||'').toUpperCase())||hits.length!==1)state='unknown';
    if(hits.length>1)warnings.push(label+'の条件データが重複しています。');
    return{key,label:text(item.label).trim()||label,state,detail:displayDetail(item.detail),rawDetail:text(item.detail)};
  });
  const extras=rows.filter(x=>!schema.some(([key])=>key===object(x).key));
  if(extras.length)warnings.push('対応していない条件データがあります。計算根拠で保存内容を確認してください。');
  const count=items.filter(x=>x.state==='met').length,unknown=items.filter(x=>x.state==='unknown').length,total=schema.length;
  const savedCount=g[side+'_condition_count'],savedTotal=g[side+'_condition_total'];
  const hasCount=Number.isInteger(savedCount)&&savedCount>=0&&savedCount<=total;
  const mismatch=(savedCount!==undefined&&savedCount!==null&&(!hasCount||savedCount!==count))||(savedTotal!==undefined&&savedTotal!==null&&savedTotal!==total);
  if(mismatch)warnings.push((side==='buy'?'買い条件':'売り注意')+'の保存集計と一覧が一致しません（保存 '+(text(savedCount)||'未確認')+'/'+(text(savedTotal)||'未確認')+'）。');
  if(unknown)warnings.push((side==='buy'?'買い条件':'売り注意')+'に未判定が'+unknown+'項目あります。未成立・該当なしとは区別します。');
  return{items,count,unknown,total,mismatch,warnings,extras:extras.map(message)};
}
function model(context){
  const ctx=object(context),m=object(ctx.market),g=object(m.trade_guide),q=object(m.data_quality),c=object(ctx.common),d=object(c.decision);
  const buy=conditionGroup(g,'buy'),sell=conditionGroup(g,'sell');
  const duplicateReasons=new Set([...buy.items,...sell.items].filter(x=>x.state==='met'&&x.rawDetail).flatMap(x=>['○ '+x.label+'：'+x.rawDetail,'✓ '+x.label+'：'+x.rawDetail].map(normalized)));
  const extraReasons=(Array.isArray(g.reasons)?g.reasons:[]).map(message).filter(x=>x&&!duplicateReasons.has(normalized(x)));
  const warnings=[...buy.warnings,...sell.warnings];
  if(g.available!==true)warnings.unshift('保存済みの条件判定を利用できません。各項目を未判定として表示しています。');
  if(ctx.runtimeStale===true)warnings.unshift('表示時点でデータが古くなっています。保存条件は現在の売買判断に使用できません。');
  for(const xs of [q.critical_reasons,q.reasons,q.external_data_warnings,d.blocking_conditions,d.risk_conditions])if(Array.isArray(xs))warnings.push(...xs.map(x=>message(x)||"詳細未提供の注意・保留条件があります。"));
  if(c.data_quality?.qc_state==='FAIL')warnings.unshift('データ品質検査が不合格です。正式な売買判断はできません。');
  if(['STALE','MISSING'].includes(c.data_quality?.data_state))warnings.unshift('必要データの古さ・欠損を確認してください。');
  if(g.external_risk==='CAUTION'){warnings.push('外部環境に注意が必要です。');if(Array.isArray(g.external_risk_factors))warnings.push(...g.external_risk_factors.map(message));}
  if(c.timestamps?.calculated_at&&m.generated_at_jst&&Date.parse(c.timestamps.calculated_at)!==Date.parse(m.generated_at_jst))warnings.push('共通データと市場データの生成時刻が一致していません。');
  const reference=d.mode==='SHADOW'?'参考表示（SHADOW）・正式な売買判断ではありません。':ctx.eligible!==true?'保存条件の参考表示です。現在の売買可否とは別です。':'保存条件の成立状況です。購入可否・購入記録とは別です。';
  const forecast=object(object(m.technical_forecast).horizons?.['14']),median=forecast.median_return_pct;
  const forecastValue=typeof median==='number'&&Number.isFinite(median)?(median>0?'+':'')+median.toFixed(2)+'%':'未算出';
  return{buy,sell,warnings:unique(warnings),extraReasons:unique(extraReasons),reference,basis:dateLabel(g.basis_date),basisText:text(g.technical_basis_used),generated:text(m.generated_at_jst),ruleNote:text(g.rule_note),forecast:text(forecast.label)||'未確認',forecastValue,notApplicable:sell.items.filter(x=>x.state==='unmet'),sellVisible:sell.items.filter(x=>x.state!=='unmet')};
}
function row(item,side){
  const label=item.state==='unknown'?'未判定':side==='buy'?(item.state==='met'?'成立':'未成立'):(item.state==='met'?'該当':'該当なし');
  const tone=item.state==='unknown'?'unknown':item.state==='met'?(side==='buy'?'met':'risk'):'quiet';
  return '<li class="dr-row" data-condition="'+escape(item.key)+'"><div class="dr-row-head"><span class="dr-label">'+escape(item.label)+'</span><span class="dr-state dr-'+tone+'">'+label+'</span></div><div class="dr-value">'+escape(item.detail)+'</div></li>';
}
function html(context){
  const v=model(context),b=v.buy,s=v.sell;
  const summary=(group,name,word)=>'<div class="dr-count"><span>'+name+'</span><strong>'+(group.unknown===group.total?'—':group.count)+'<small> / '+group.total+'</small></strong><span>'+word+(group.unknown?'・未判定 '+group.unknown:'')+'</span></div>';
  const alerts=v.warnings.length?'<div class="dr-alerts" role="note" aria-label="判定に関わる注意事項">'+v.warnings.map(x=>'<p>'+escape(x)+'</p>').join('')+'</div>':'';
  const extra=v.extraReasons.length?'<div class="dr-extra" aria-label="その他の判断理由">'+v.extraReasons.map(x=>'<p>'+escape(x)+'</p>').join('')+'</div>':'';
  const zero=!s.count&&!s.unknown&&!s.mismatch&&!s.extras.length;
  const sellerList=v.sellVisible.length?'<ul class="dr-list">'+v.sellVisible.map(x=>row(x,'sell')).join('')+'</ul>':'';
  const rest=v.notApplicable.length?'<details class="dr-fold" data-dr-fold="sell"><summary>'+v.notApplicable.length+'項目の'+(zero?'確認結果':'非該当条件')+'を見る</summary><ul class="dr-list">'+v.notApplicable.map(x=>row(x,'sell')).join('')+'</ul></details>':'';
  return '<div class="dr-basis">基準 '+escape(v.basis)+'</div><p class="dr-reference">'+escape(v.reference)+'</p><div class="dr-counts">'+summary(b,'買い条件','成立')+summary(s,'売り注意','該当')+'</div>'+alerts+extra+'<section class="dr-section" aria-labelledby="dr-buy-heading"><h3 id="dr-buy-heading">買い条件 <span>5項目</span></h3><ul class="dr-list">'+b.items.map(x=>row(x,'buy')).join('')+'</ul></section><section class="dr-section dr-sell" aria-labelledby="dr-sell-heading"><h3 id="dr-sell-heading">売り注意 <span>4項目</span></h3>'+(zero?'<p class="dr-none">保存条件では該当なし</p>':'')+sellerList+rest+'</section><details class="dr-fold dr-method" data-dr-fold="method"><summary>判定条件・計算根拠を見る</summary><div class="dr-method-body"><p>上の成立数は保存された条件項目の集計です。条件の再計算や売買判定の変更は行いません。未判定は未成立・非該当として扱いません。</p><p>'+escape(v.basisText||'計算基準は未確認です。')+'</p><p>'+escape(v.ruleNote||'実際の注文は購入状況・資金配分・締切を別途確認してください。')+'</p><p>売り注意は複数の過熱・失速条件を確認するための表示です。単独条件で売却を決定するものではありません。</p><p>補助判断：14営業日予測 '+escape(v.forecast)+' / 中央値 '+escape(v.forecastValue)+'。予測は買い5条件・売り4条件の分母に含みません。</p>'+(b.extras.length||s.extras.length?'<p>未対応の保存条件：'+escape([...b.extras,...s.extras].join(' / '))+'</p>':'')+'<p class="dr-timestamp">生成 '+escape(v.generated||'未確認')+'</p></div></details>';
}
function mount(root,context){
  if(!root)return;
  const markup=html(context);if(root.__decisionReasonsMarkup===markup)return;
  const folds=new Map(Array.from(root.querySelectorAll('details[data-dr-fold]')).map(x=>[x.getAttribute('data-dr-fold'),x.open]));
  const active=root.ownerDocument?.activeElement,focused=active&&root.contains(active)&&active.tagName==='SUMMARY'?active.parentElement?.getAttribute('data-dr-fold'):null;
  root.innerHTML=markup;root.__decisionReasonsMarkup=markup;
  for(const x of root.querySelectorAll('details[data-dr-fold]')){const name=x.getAttribute('data-dr-fold');if(folds.has(name))x.open=folds.get(name);if(name===focused)x.querySelector('summary')?.focus({preventScroll:true});}
}
return{model,html,mount,conditionGroup,displayDetail};
});
