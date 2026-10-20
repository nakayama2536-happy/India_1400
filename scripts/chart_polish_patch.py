"""One-time, fail-closed source patch for the reviewed v5.43 HTML."""
from pathlib import Path
import hashlib
import re

p=Path('index.html'); data=p.read_bytes()
assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()=='677ee7c0a53b3b2b9c799d65c79ad2a5b3fa113b', 'Base HTML changed; reconcile rather than overwrite'
s=data.decode()
def once(a,b):
 global s
 assert s.count(a)==1, f'Unexpected occurrence count: {a[:80]}'
 s=s.replace(a,b,1)
def function_replace(name,replacement):
 global s
 start=s.index('function '+name+'(')
 end=s.index('\nfunction ',start+1)
 s=s[:start]+replacement.rstrip()+'\n'+s[end+1:]

# Keep the three charts adjacent; all existing metrics remain reachable.
once('      <div id="niftyMetrics" class="grid"></div>\n','')
anchor='    </div>\n    <details class="card">\n      <summary>NIFTY 詳細チャートを見る</summary>'
once(anchor,'      <details class="indicator-values"><summary>指標の数値詳細</summary><div class="body"><div id="niftyMetrics" class="grid"></div></div></details>\n    </div>\n    <details id="niftyDetailPanel" class="card">\n      <summary>NIFTY 詳細チャートを見る</summary>')
once('<div class="chart-title series-rsi">RSI（14）</div><div class="chart-meta">30＝低位 / 50＝基準 / 70＝高位</div>', '<div class="chart-title series-rsi">RSI（14） <span id="rsiChartLatest" class="indicator-reading">--</span></div><div id="rsiChartAsOf" class="chart-meta">確定日 --</div>')
once('<div class="chart-title series-macd">MACD ヒストグラム</div><div class="chart-meta">0ラインを中心に正負を比較</div>', '<div class="chart-title series-macd">MACD ヒストグラム <span id="macdChartLatest" class="indicator-reading">--</span></div><div id="macdChartAsOf" class="chart-meta">確定日 --</div>')
once('<div class="legend"><span class="rsi-reference-key"><i class="reference-dash"></i>50 中立基準</span>', '<div class="legend"><span>30 低位 / 70 高位</span><span class="rsi-reference-key"><i class="reference-dash"></i>50 中立基準</span>')
once('<div class="chart-head"><div class="chart-title">日足ローソク＋移動平均</div>', '<div class="chart-head detail-chart-heading"><div class="chart-title">日足ローソク足＋移動平均</div>')
# Loading the pure renderer before inline app startup also works from SW cache.
once('<script src="review-history.js"></script>', '<script src="review-history.js"></script>\n<script src="technical-charts.js"></script>')
for old in ['#page-indicators .indicators-panel .chart.chart-nifty{height:214px}', '#page-indicators .indicators-panel .chart.chart-rsi{height:136px}', '#page-indicators .indicators-panel .chart.chart-macd{height:142px}', '  #page-indicators .indicators-panel .chart.chart-nifty{height:216px}']:
 once(old,'')
once('stroke-width:3.15;vector-effect:non-scaling-stroke','stroke-width:2.3;vector-effect:non-scaling-stroke')
css='''
/* v5.44: natural text proportions and shared screen-pixel chart coordinates. */
#page-indicators .indicators-panel .chart{height:auto;aspect-ratio:auto;width:100%}
#page-indicators .indicators-panel .chart text,#niftyDetailPanel .candle-chart text{font-size:11px;fill:#a5b4ca;font-variant-numeric:tabular-nums;stroke:none}
#page-indicators .indicators-panel .chart text.guide-reference-label{fill:#c8c1aa;font-size:11px;font-weight:700}
#page-indicators .indicators-panel .indicator-section-heading{flex-wrap:wrap}
#page-indicators .indicators-panel .indicator-reading{font-size:17px;white-space:nowrap;font-variant-numeric:tabular-nums;margin-left:5px;color:var(--text)}
#page-indicators .indicators-panel .indicator-secondary .chart-head{display:block}
#page-indicators .indicators-panel .indicator-secondary .chart-meta{text-align:left;margin-top:5px;font-size:11px}
#page-indicators .indicators-panel .indicator-values{margin:12px 0 0;background:transparent;border-color:#2a3d58}
#page-indicators .indicators-panel .indicator-values>summary{padding:12px;font-size:13px}
#page-indicators .indicators-panel .indicator-values>.body{padding:0 10px 10px}
#niftyDetailPanel{padding:12px 10px}
#niftyDetailPanel>summary{padding:10px 8px;font-size:17px}
#niftyDetailPanel>.body{padding:0 8px 10px}
#niftyDetailPanel .detail-chart-heading{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;align-items:start}
#niftyDetailPanel .chart-title{font-size:14px;line-height:1.5}
#niftyDetailPanel .chart-meta{text-align:left;line-height:1.6;font-size:11px;overflow-wrap:normal}
#niftyDetailPanel .candle-wrap{padding:12px 6px 6px}
#niftyDetailPanel .candle-chart{height:auto;aspect-ratio:auto;width:100%;overflow:hidden}
#niftyDetailPanel .candle-chart .gridline{stroke:#32445e;stroke-width:.85;opacity:.68;vector-effect:non-scaling-stroke}
#niftyDetailPanel .candle-chart .weekline{opacity:.25;vector-effect:non-scaling-stroke}
#niftyDetailPanel .candle-chart [class^="wick-"]{stroke-width:1;vector-effect:non-scaling-stroke}
#niftyDetailPanel .candle-chart [class^="body-"]{stroke:none}
#niftyDetailPanel .candle-chart .ma5,#niftyDetailPanel .candle-chart .ma25{stroke-width:1.5;vector-effect:non-scaling-stroke}
#niftyDetailPanel .candle-chart .ma75{stroke-width:1.2;stroke-dasharray:5 4;opacity:.8;vector-effect:non-scaling-stroke}
#niftyDetailPanel .detail-chart-legend{font-size:11px;gap:10px}
'''
once('</style>',css+'\n</style>')
function_replace('chartSvg','''function chartSvg(points,series,guides,options){
  return typeof IndiaTechnicalCharts!=="undefined"?IndiaTechnicalCharts.lineChart(points,series,guides,options):'<div class="history-wait">チャート表示部品を読み込めません。再読込してください。</div>';
}''')
function_replace('candlestickSvg','''function candlestickSvg(points,options){
  return typeof IndiaTechnicalCharts!=="undefined"?IndiaTechnicalCharts.candlestickChart(points,options):'<div class="history-wait">チャート表示部品を読み込めません。再読込してください。</div>';
}''')
start=s.index('  var nc=cd.nifty||{};', s.index('function renderIndicators('))
end=s.index('  $("externalMetrics").innerHTML=',start)
block=s[start:end]
s=s[:start]+'  renderTechnicalCharts();\n'+s[end:]
block=block.replace('  var nc=cd.nifty||{};', '  const n=market?.nifty||{},nc=market?.chart_data?.nifty||{};')
block=block.replace('const prices=Array.isArray(nc.price)?nc.price:[];', 'const prices=nc.available!==false&&Array.isArray(nc.price)?nc.price:[];')
block=block.replace('{kind:"nifty",supportLevels:', '{kind:"nifty",width:technicalChartWidth("niftyChart"),supportLevels:')
block=block.replace('nc.rsi14||[]', 'nc.available===false?[]:nc.rsi14||[]')
block=block.replace('nc.macd_hist||[]', 'nc.available===false?[]:nc.macd_hist||[]')
block=block.replace('{kind:"rsi"}', '{kind:"rsi",width:technicalChartWidth("rsiChart")}')
block=block.replace('{kind:"macd"}', '{kind:"macd",width:technicalChartWidth("macdChart")}')
block=block.replace('setText("niftyChartMeta",nc.available===false?', 'setText("niftyChartMeta",!prices.length?')
block+='  renderChartReading("rsi",nc.available===false?[]:nc.rsi14||[],1,false);\n  renderChartReading("macd",nc.available===false?[]:nc.macd_hist||[],2,true);\n'
helpers='''function technicalChartWidth(id){
  const width=$(id)?.getBoundingClientRect?.().width;
  return Number.isFinite(width)&&width>0?width:360;
}
function renderChartReading(prefix,rows,digits,signed){
  const point=typeof IndiaTechnicalCharts!=="undefined"?IndiaTechnicalCharts.latestPoint(rows,"value"):null;
  setText(prefix+"ChartLatest",point?(signed&&point.value>0?"+":"")+fmt(point.value,digits):"--");
  setText(prefix+"ChartAsOf",point?"確定 "+point.date.replaceAll("-","/")+" / グラフ最終値":"グラフ最終値は確認できません");
}
'''+ 'function renderTechnicalCharts(){\n'+block+'}\n'+'''
function initTechnicalChartLayout(){
  let pending=false;
  const schedule=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;if(!market)return;renderTechnicalCharts();renderDetailChart()})};
  if(typeof ResizeObserver!=="undefined"){
    const seen=new WeakMap(),observer=new ResizeObserver(entries=>{let changed=false;for(const entry of entries){const width=entry.contentRect.width;if(width>0&&Math.abs(width-(seen.get(entry.target)||0))>.1){seen.set(entry.target,width);changed=true}}if(changed)schedule()});
    for(const id of ["niftyChart","rsiChart","macdChart","detailCandleChart"]){const node=$(id);if(node)observer.observe(node)}
  }
  window.addEventListener("resize",schedule,{passive:true});
  document.querySelector('.tab[data-page="indicators"]')?.addEventListener("click",schedule);
  $("niftyDetailPanel")?.addEventListener("toggle",schedule);
}
'''
once('function renderIndicators(){',helpers+'function renderIndicators(){')
once('candlestickSvg(rows):', 'candlestickSvg(rows,{width:technicalChartWidth("detailCandleChart")}):')
once('直近 ${rows.length}営業日 / OHLC最新 ${d.latest_ohlc_date||"--"}', '直近 ${rows.length}営業日 / 四本値確定 ${String(d.latest_ohlc_date||"--").replaceAll("-","/")}')
# Exclude layout setup from the legacy clock-unit-test function slice.
once('refreshData(true);setInterval(renderClockTick,60000);', 'refreshData(true);initTechnicalChartLayout();setInterval(renderClockTick,60000);')
s=s.replace('5.43','5.44')
p.write_text(s,encoding='utf-8')
# Version and own-cache changes only; no dynamic market/purchase data is changed.
p=Path('VERSION');v=p.read_text();assert v.count('UI_VERSION=5.43')==1;p.write_text(v.replace('UI_VERSION=5.43','UI_VERSION=5.44'))
p=Path('manifest.webmanifest');v=p.read_text();assert 'v=5.43' in v;p.write_text(v.replace('5.43','5.44'))
p=Path('sw.js');v=p.read_text();assert 'india1400-v5-43-' in v and '"review-history.js"' in v
p.write_text(v.replace('v5-43-','v5-44-').replace('?v=5.43','?v=5.44').replace('"review-history.js",','"review-history.js", "technical-charts.js",'))
# Narrow adaptations of existing tests to the extracted renderer and new layout.
p=Path('tests/indicator-charts.test.cjs')
if p.exists():
 v=p.read_text().replace('vm.createContext({})','vm.createContext({IndiaTechnicalCharts:require("../technical-charts.js")})')
 v=v.replace(' assert.match(html,/#page-indicators \\.indicators-panel \\.chart\\.chart-nifty\\{height:214px\\}/);',' assert.match(cachedRenderer(),/kind === \'nifty\' ?\\? 216/);')
 # Avoid a brittle style-only height assertion; the SVG itself is tested below.
 v=v.replace(" assert.match(cachedRenderer(),/kind === 'nifty' ?\\? 216/);", " assert.match(harness().chartSvg(rows([100,101]),series,[],{kind:'nifty'}),/height=\"216\"/);")
 v=v.replace(" const render=fn('renderIndicators');", " const render=fn('renderTechnicalCharts');")
 v=v.replace('assert.match(render,/chartSvg\\(nc\\.macd_hist\\|\\|\\[\\]/);','assert.match(render,/nc\\.macd_hist\\|\\|\\[\\]/);')
 v=v.replace('5\\.43','5\\.44').replace('v5-43-','v5-44-');p.write_text(v)
p=Path('.github/workflows/pr-validation.yml')
if p.exists():
 v=p.read_text();assert v.count('tests/indicator-charts.test.cjs')==1
 p.write_text(v.replace('tests/indicator-charts.test.cjs','tests/indicator-charts.test.cjs tests/technical-charts.test.cjs'))
print('Applied chart polish; market data and decision/purchase code unchanged.')
