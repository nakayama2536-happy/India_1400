/* Display-only SVG charts. Coordinates use the measured CSS-pixel width.
 * No fetch, persistent storage, indicator calculation or trade decisions. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IndiaTechnicalCharts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const finite = v => (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(Number(v));
  const num = n => Number(n).toFixed(2);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wait = message => '<div class="history-wait" role="status">' + message + '</div>';
  const dateLabel = date => date.slice(5).replace('-', '/');
  function validRows(rows) {
    if (!Array.isArray(rows)) return false;
    let previous = '';
    return rows.every(row => {
      const date = row && row.date, stamp = Date.parse(date + 'T00:00:00Z');
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date || date <= previous) return false;
      previous = date; return true;
    });
  }
  function latestPoint(rows, key) {
    // Do not silently substitute a previous date for a missing newest sample.
    if (!validRows(rows) || !rows.length) return null;
    const p = rows[rows.length - 1];
    return finite(p[key]) ? {date:p.date, value:Number(p[key])} : null;
  }
  function niceScale(values, intervals = 5) {
    const xs = values.filter(finite).map(Number);
    if (!xs.length) return null;
    let low = Math.min(...xs), high = Math.max(...xs);
    const pad = Math.max((high - low) * .045, Math.abs(high) * .0005, .001);
    low -= pad; high += pad;
    const raw = (high - low) / intervals, power = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].find(v => v * power >= raw) * power;
    const min = Math.floor(low / step) * step, max = Math.ceil(high / step) * step;
    if (![min,max,step].every(Number.isFinite) || step <= 0 || max <= min) return null;
    const ticks = [];
    for (let i = 0; i <= 10 && min + i * step <= max + step * .00001; i++) ticks.push(Number((min + i * step).toPrecision(12)));
    return {min,max,step,ticks};
  }
  function frame(rows, values, kind, options) {
    const w = Math.max(180, Math.min(1600, finite(options.width) && Number(options.width) > 0 ? Number(options.width) : 360));
    const h = kind === 'nifty' ? 216 : kind === 'candle' ? 294 : kind === 'rsi' ? 142 : 148;
    const left = 10, right = 59, top = 14, bottom = 25;
    let scale = niceScale(values);
    if (kind === 'rsi') scale = {min:0,max:100,ticks:[0,30,50,70,100],step:20};
    if (kind === 'macd' && scale) {
      const bound = Math.max(Math.abs(scale.min),Math.abs(scale.max));
      scale = {min:-bound,max:bound,ticks:[-bound,0,bound],step:scale.step};
    }
    if (!scale) return null;
    const plotRight = w - right, plotBottom = h - bottom;
    // Share one day-cell axis across price, RSI and MACD. The half-cell inset
    // also keeps complete end bars inside the plot instead of clipping them.
    const count = rows.length;
    const x = i => left + (i + .5) * (plotRight - left) / Math.max(1, count);
    const y = v => top + (scale.max - Number(v)) * (plotBottom - top) / (scale.max - scale.min);
    return {w,h,left,plotRight,top,plotBottom,scale,x,y};
  }
  function axisText(value, step) {
    const digits = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step)) + 1);
    return Number(value).toLocaleString('ja-JP', {maximumFractionDigits:digits});
  }
  function grid(f, rows, kind) {
    let out = '';
    for (const value of f.scale.ticks) {
      const py = f.y(value), cls = kind === 'rsi' && value === 50 ? 'guide guide-reference' : kind === 'rsi' && [30,70].includes(value) ? 'guide' : kind === 'macd' && value === 0 ? 'zero-axis' : 'gridline';
      out += `<line class="${cls}" x1="${f.left}" y1="${num(py)}" x2="${num(f.plotRight)}" y2="${num(py)}"/>`;
      out += `<text class="${kind === 'rsi' && value === 50 ? 'guide-reference-label' : 'axis-label'}" x="${num(f.plotRight+7)}" y="${num(py+4)}">${axisText(value,f.scale.step)}</text>`;
    }
    // Three shared date positions, not a dense mesh of weekly decoration.
    const marks = [...new Set([0, Math.floor((rows.length-1)/2), rows.length-1])];
    for (let j=0; j<marks.length; j++) {
      const i=marks[j], px=f.x(i), anchor=j===0?'start':j===marks.length-1?'end':'middle';
      if (j===1) out += `<line class="weekline" x1="${num(px)}" y1="${f.top}" x2="${num(px)}" y2="${f.plotBottom}"/>`;
      out += `<text x="${num(px)}" y="${f.h-5}" text-anchor="${anchor}">${dateLabel(rows[i].date)}</text>`;
    }
    return out;
  }
  function path(rows,key,f,positive=false) {
    let start = true;
    return rows.map((p,i) => {
      if (!finite(p[key]) || positive && Number(p[key])<=0) {start=true;return '';}
      const cmd=start?'M':'L'; start=false;
      return cmd+num(f.x(i))+','+num(f.y(p[key]));
    }).filter(Boolean).join(' ');
  }
  function svg(f, kind, contents, label) {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${kind==='candle'?'candle-chart':'chart chart-'+kind}" data-responsive-chart="true" width="${num(f.w)}" height="${f.h}" viewBox="0 0 ${num(f.w)} ${f.h}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${esc(label)}">${contents}</svg>`;
  }
  function supportAnnotation(f, rows, lines, level, first) {
    const prefix = level.kind === 'support' ? '支持線候補' : '安値目安';
    const value = axisText(level.value, 1), label = prefix + ' ' + value;
    const naturalWidth = prefix.length * 11 + 4 + value.length * 7;
    const width = Math.min(naturalWidth + 12, f.plotRight - f.left - 4), height = 14;
    const sx = f.x(first), sy = f.y(level.value), end = f.x(rows.length - 1);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const xs = [f.plotRight - width - 2, sx - width - 4, sx + 4];
    const boxes = xs.flatMap(x => [sy - height - 2, sy + 2].map(y => ({
      x:clamp(x, f.left + 2, f.plotRight - width - 2),
      y:clamp(y, f.top, f.plotBottom - height)
    })));
    const collisions = box => lines.reduce((score, series) => {
      let previous = null;
      for (let i = 0; i < rows.length; i++) {
        if (!finite(rows[i][series.key])) {previous = null; continue;}
        const point = {x:f.x(i), y:f.y(rows[i][series.key])};
        if (previous && Math.max(previous.x,point.x) >= box.x - 1 && Math.min(previous.x,point.x) <= box.x + width + 1 && Math.max(previous.y,point.y) >= box.y - 1 && Math.min(previous.y,point.y) <= box.y + height + 1) score += series.cls === 'line-main' ? 4 : 1;
        previous = point;
      }
      return score;
    }, 0);
    // Keep candidates beside the support segment; never escape across the chart.
    const rank = box => collisions(box) * 10000 + Math.max(0, sx - (box.x + width), box.x - end) + Math.abs(box.y + height / 2 - sy);
    const box = boxes.reduce((best, candidate) => rank(candidate) < rank(best) ? candidate : best);
    const anchorX = clamp(box.x + width / 2, sx, end);
    const labelX = clamp(anchorX, box.x + 4, box.x + width - 4);
    const labelY = sy >= box.y + height / 2 ? box.y + height : box.y;
    const fit = naturalWidth > width - 12 ? ` textLength="${num(width - 12)}" lengthAdjust="spacingAndGlyphs"` : '';
    return `<g class="support-annotation"><title>${esc(label)}（参考表示）</title><line class="support-label-link" x1="${num(labelX)}" y1="${num(labelY)}" x2="${num(anchorX)}" y2="${num(sy)}"/><rect class="support-label-bg" x="${num(box.x)}" y="${num(box.y)}" width="${num(width)}" height="${height}" rx="3"/><text class="support-label" x="${num(box.x+6)}" y="${num(box.y+10.5)}"${fit}>${esc(label)}</text></g>`;
  }
  function lineChart(rows, series, guides, options = {}) {
    const kind = ['nifty','rsi','macd'].includes(options.kind) ? options.kind : 'nifty';
    if (!validRows(rows)) return wait('履歴の日付に不整合があるため表示を保留しています');
    const allowed = new Set(['line-main','line-ma5','line-ma25','line-ma75','line-rsi','line-macd']);
    const lines = (Array.isArray(series)?series:[]).filter(s=>s&&allowed.has(s.cls)&&/^[a-z0-9_]+$/i.test(s.key));
    const observed = rows.filter(p=>lines.some(s=>finite(p[s.key])));
    if (observed.length < 2) return wait('履歴を蓄積中です');
    const values = rows.flatMap(p=>lines.filter(s=>finite(p[s.key])).map(s=>Number(p[s.key])));
    if (kind==='nifty' && values.some(v=>v<=0) || kind==='rsi' && values.some(v=>v<0||v>100)) return wait('値に不整合があるため表示を保留しています');
    if (kind==='macd') values.push(0);
    const f=frame(rows,values,kind,options);
    if (!f) return wait('表示範囲を確認できません');
    let out=grid(f,rows,kind), annotation='';
    if (kind==='nifty') {
      for (const level of (Array.isArray(options.supportLevels)?options.supportLevels:[]).slice(0,1)) {
        const first=level.touches?.[0]?.index;
        if (!finite(level.value)||level.value<f.scale.min||level.value>f.scale.max||!Number.isInteger(first)||first<0||first>=rows.length) continue;
        out+=`<line class="support-visual" x1="${num(f.x(first))}" y1="${num(f.y(level.value))}" x2="${num(f.x(rows.length-1))}" y2="${num(f.y(level.value))}"/>`;
        annotation=supportAnnotation(f,rows,lines,level,first);
      }
    }
    if (kind==='macd') {
      const bw=Math.min(11,(f.plotRight-f.left)/rows.length*.68), zero=f.y(0);
      rows.forEach((p,i)=>{
        if (!finite(p.value)||Number(p.value)===0) return;
        const py=f.y(p.value),height=Math.abs(py-zero);
        out+=`<rect class="${p.value>0?'macd-positive':'macd-negative'}" x="${num(f.x(i)-bw/2)}" y="${num(Math.min(zero,py))}" width="${num(bw)}" height="${num(height)}" rx=".7"/>`;
      });
    } else {
      // Draw the price after the thinner averages, so overlap never hides it.
      for (const s of lines.slice().sort((a,b)=>(a.cls==='line-main')-(b.cls==='line-main'))) out+=`<path class="${s.cls}" d="${path(rows,s.key,f)}" fill="none"/>`;
      if (kind==='nifty'&&finite(rows[rows.length-1].close)) out+=`<circle class="last-nifty-dot" cx="${num(f.x(rows.length-1))}" cy="${num(f.y(rows[rows.length-1].close))}" r="3"/>`;
    }
    return svg(f,kind,out+annotation,kind==='rsi'?'RSI14・0から100、50は中立基準':kind==='macd'?'MACDヒストグラム・ゼロ基準の正負':'NIFTY確定終値・移動平均・参考下値目安');
  }
  function candlestickChart(rows, options = {}) {
    if (!validRows(rows)) return wait('ローソク足の日付に不整合があるため表示を保留しています');
    if (rows.length<10) return wait('OHLC履歴を準備中です');
    if (rows.some(p=>!['open','high','low','close'].every(k=>finite(p[k])&&Number(p[k])>0)||Number(p.low)>Math.min(Number(p.open),Number(p.close))||Number(p.high)<Math.max(Number(p.open),Number(p.close)))) return wait('ローソク足の値に不整合があるため表示を保留しています');
    const keys=['low','high','ma5','ma25','ma75'], values=rows.flatMap(p=>keys.filter(k=>finite(p[k])&&Number(p[k])>0).map(k=>Number(p[k])));
    const f=frame(rows,values,'candle',options);
    if (!f) return wait('表示範囲を確認できません');
    let out=grid(f,rows,'candle');
    const bw=Math.min(8,(f.plotRight-f.left)/rows.length*.66);
    rows.forEach((p,i)=>{
      const cls=Number(p.close)>=Number(p.open)?'up':'down',px=f.x(i),yo=f.y(p.open),yc=f.y(p.close);
      out+=`<line class="wick-${cls}" x1="${num(px)}" y1="${num(f.y(p.high))}" x2="${num(px)}" y2="${num(f.y(p.low))}"/>`;
      if (yo===yc) out+=`<line class="wick-${cls}" x1="${num(px-bw/2)}" y1="${num(yo)}" x2="${num(px+bw/2)}" y2="${num(yo)}"/>`;
      else out+=`<rect class="body-${cls}" x="${num(px-bw/2)}" y="${num(Math.min(yo,yc))}" width="${num(bw)}" height="${num(Math.abs(yc-yo))}"/>`;
    });
    for(const key of ['ma5','ma25','ma75']) out+=`<path class="${key}" d="${path(rows,key,f,true)}" fill="none"/>`;
    return svg(f,'candle',out,'NIFTY日足ローソク足と移動平均・価格目盛り');
  }
  return Object.freeze({finite,validRows,latestPoint,niceScale,lineChart,candlestickChart});
});
