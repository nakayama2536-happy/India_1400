/* India Chart Experience 1.0 — display only. No trading, persistence, or market calculation. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.IndiaChartExperience=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CHARTS=Object.freeze({
    indiaCoreTrendChart:'インド・コア基準価額トレンド',
    niftyChart:'NIFTY 50 トレンド',
    rsiChart:'RSI 14',
    macdChart:'MACD ヒストグラム',
    detailCandleChart:'NIFTY 日足ローソク足'
  });
  const finitePositive=x=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isFinite(Number(x))&&Number(x)>0;
  const isoDay=v=>{
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
    const n=Date.parse(v+'T00:00:00Z');
    return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===v;
  };
  function validateLongCandles(raw,detail){
    const reject=reason=>({ok:false,reason,rows:[]});
    if(!raw||!detail||detail.available!==true||!Array.isArray(detail.candles)||detail.candles.length<10)
      return reject('現行チャートの正常な保存値を確認できません。');
    if(Array.isArray(detail.quality?.close_mismatch_dates)&&detail.quality.close_mismatch_dates.length)
      return reject('確定終値に不一致があるため長期表示を保留します。');
    if(raw.schema_version!==1||typeof raw.method_version!=='string'||raw.method_version!==detail.method_version)
      return reject('履歴の方式・版が現在のチャートと一致しません。');
    const xs=raw.records;
    if(!Array.isArray(xs)||xs.length<200||xs.length>250||xs.length<detail.candles.length)
      return reject('長期OHLC履歴の件数を確認できません。');
    let prev='';
    for(const row of xs){
      if(!row||!isoDay(row.date)||row.date<=prev)return reject('履歴の日付が不正・重複・逆順です。');
      prev=row.date;
      if(!['open','high','low','close'].every(k=>finitePositive(row[k]))||
         Number(row.low)>Math.min(Number(row.open),Number(row.close))||
         Number(row.high)<Math.max(Number(row.open),Number(row.close)))
        return reject('履歴の四本値に不整合があります。');
      if(row.close_consistency!==undefined&&row.close_consistency!=='MATCH')
        return reject('保存済み終値の照合結果が一致しません。');
    }
    if(xs.at(-1).date!==detail.latest_ohlc_date ||
       detail.latest_ohlc_date!==detail.latest_confirmed_date ||
       detail.candles.at(-1)?.date!==xs.at(-1).date)
      return reject('長期履歴と最新確定日の基準が一致しません。');
    const byDate=new Map(xs.map(x=>[x.date,x]));
    for(const current of detail.candles){
      const old=byDate.get(current.date);
      if(!old||!['open','high','low','close'].every(k=>finitePositive(current[k])&&
          Math.abs(Number(old[k])-Number(current[k]))<=1e-6))
        return reject('長期履歴と現在表示中の四本値が一致しません。');
    }
    // Values are already observed OHLC. Do not invent volume or indicators.
    return {ok:true,reason:'',rows:xs.map(x=>({date:x.date,open:Number(x.open),high:Number(x.high),
      low:Number(x.low),close:Number(x.close)}))};
  }
  function rowsForPeriod(detail,longRows,period){
    if(!detail||detail.available!==true||detail.quality?.close_mismatch_dates?.length ||
       !Array.isArray(detail.candles))return [];
    if(String(period)==='200')return Array.isArray(longRows)?longRows.slice(-200):[];
    if(String(period)==='30')return detail.candles.slice(-30);
    return detail.candles.slice(-60);
  }
  function createController(win){
    const doc=win.document;
    let overlay=null,lastFocus=null,active='',zoom=1,baseWidth=0,pinch=null;
    const clamp=v=>Math.max(1,Math.min(2.5,Math.round(v*100)/100));
    function close(){
      if(!overlay||overlay.hidden)return;
      overlay.hidden=true;doc.body.classList.remove('ix-modal-open');
      pinch=null;active='';
      if(lastFocus&&typeof lastFocus.focus==='function')lastFocus.focus({preventScroll:true});
      lastFocus=null;
    }
    function applyZoom(next,latest=false){
      if(!overlay)return;
      zoom=clamp(next);
      const body=overlay.querySelector('.ix-modal-body'),content=overlay.querySelector('.ix-modal-content');
      const available=Math.max(1,body.clientWidth);
      const oldMax=Math.max(0,body.scrollWidth-body.clientWidth);
      const ratio=oldMax?body.scrollLeft/oldMax:1;
      content.style.width=Math.ceil(Math.max(available,baseWidth)*zoom)+'px';
      overlay.querySelector('.ix-zoom-label').textContent=Math.round(zoom*100)+'%';
      const max=Math.max(0,content.offsetWidth-body.clientWidth);
      body.scrollLeft=latest?max:max*ratio;
    }
    function ensure(){
      if(overlay)return overlay;
      overlay=doc.createElement('div');
      overlay.id='ixChartOverlay';
      overlay.className='ix-modal';
      overlay.hidden=true;
      overlay.setAttribute('role','dialog');
      overlay.setAttribute('aria-modal','true');
      overlay.setAttribute('aria-labelledby','ixModalTitle');
      overlay.innerHTML='<section class="ix-modal-panel"><header class="ix-modal-head"><strong id="ixModalTitle">グラフ拡大</strong><button type="button" class="ix-close" data-ix-close>閉じる</button></header><div class="ix-modal-tools"><button type="button" data-ix-zoom="-1" aria-label="縮小">−</button><span class="ix-zoom-label" aria-live="polite">100%</span><button type="button" data-ix-zoom="1" aria-label="拡大">＋</button><button type="button" data-ix-fit>画面に合わせる</button></div><div class="ix-modal-body" tabindex="0" aria-label="拡大グラフ。横スクロール可能"><div class="ix-modal-content"></div></div><p class="ix-modal-note">表示中の保存データのみを拡大します。売買判定・保存値は変更しません。</p></section>';
      doc.body.appendChild(overlay);
      overlay.addEventListener('click',e=>{
        if(e.target===overlay||e.target.closest('[data-ix-close]')){close();return;}
        const z=e.target.closest('[data-ix-zoom]');
        if(z){applyZoom(zoom+(z.dataset.ixZoom==='1'?.25:-.25));return;}
        if(e.target.closest('[data-ix-fit]'))applyZoom(1,true);
      });
      const body=overlay.querySelector('.ix-modal-body');
      const distance=ts=>Math.hypot(ts[0].clientX-ts[1].clientX,ts[0].clientY-ts[1].clientY);
      body.addEventListener('touchstart',e=>{
        if(e.touches.length===2)pinch={distance:distance(e.touches),zoom};
      },{passive:true});
      body.addEventListener('touchmove',e=>{
        if(e.touches.length!==2||!pinch||pinch.distance<=0)return;
        e.preventDefault();applyZoom(pinch.zoom*distance(e.touches)/pinch.distance);
      },{passive:false});
      for(const type of ['touchend','touchcancel'])body.addEventListener(type,e=>{
        if(e.touches.length<2)pinch=null;
      },{passive:true});
      doc.addEventListener('keydown',e=>{
        if(overlay.hidden)return;
        if(e.key==='Escape'){e.preventDefault();close();return;}
        if(e.key!=='Tab')return;
        const focusables=Array.from(overlay.querySelectorAll('button,[tabindex="0"]')).filter(n=>!n.disabled);
        const first=focusables[0],last=focusables[focusables.length-1];
        if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}
      });
      return overlay;
    }
    function open(id,button){
      if(!Object.prototype.hasOwnProperty.call(CHARTS,id))return false;
      const source=doc.getElementById(id),svg=source?.querySelector('svg');
      if(!svg)return false;
      const modal=ensure(),content=modal.querySelector('.ix-modal-content');
      lastFocus=button||doc.activeElement;
      active=id;
      content.replaceChildren(svg.cloneNode(true));
      modal.querySelector('#ixModalTitle').textContent=CHARTS[id];
      baseWidth=id==='detailCandleChart'&&source.closest('.candle-wrap')?.classList.contains('ix-long-candles')
        ?Math.max(1,Number(svg.getAttribute('width'))||1200):0;
      zoom=1;modal.hidden=false;doc.body.classList.add('ix-modal-open');
      applyZoom(1,true);
      modal.querySelector('.ix-close').focus({preventScroll:true});
      return true;
    }
    function bind(){
      doc.addEventListener('click',e=>{
        const trigger=e.target.closest('[data-ix-expand]');
        if(!trigger)return;
        const id=trigger.getAttribute('data-ix-expand');
        if(!open(id,trigger)){
          const node=doc.getElementById(id);
          if(node)node.setAttribute('aria-live','polite');
        }
      });
    }
    return Object.freeze({open,close,bind,active:()=>active});
  }
  return Object.freeze({validateLongCandles,rowsForPeriod,createController});
});
