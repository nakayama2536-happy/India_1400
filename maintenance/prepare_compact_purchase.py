"""Generate a reviewable UI preview without writing production files or personal data."""
from __future__ import annotations
import argparse
import hashlib
import re
from pathlib import Path

EXPECTED_BLOB = '446d3aaed2515ca7ca2c8eb4d63ae26cd49efda8'
CSS = '''
/* Purchase controls preview: one status/action button per tranche. */
#purchaseProgress .tranche-toggle{min-width:0;min-height:84px;width:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;border-radius:13px;padding:12px 6px;gap:4px}
#purchaseProgress .tranche-toggle .tname{font-size:13px}
#purchaseProgress .tranche-toggle .tstate{font-size:16px;margin:0}
#purchaseProgress .tranche-toggle:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
'''
JS = r'''function confirmTrancheChange(stage){
  if(!Number.isInteger(stage)||stage<1||stage>3)return;
  const state=loadPurchaseState(),done=!state["t"+stage];
  const affected=[1,2,3].filter(n=>done?n<=stage&&!state["t"+n]:n>=stage&&state["t"+n]);
  const labels=affected.map(n=>"第"+n+"弾").join("・");
  const message=labels+(done?"を実施済として記録しますか？":"を未実施へ戻しますか？")+"\n実際の購入注文は行いません。";
  if(!confirm(message))return;
  setTranche(stage,done);
}
function renderPurchaseProgress(){
  const s=loadPurchaseState(),g=market?.trade_guide||{},q=market?.data_quality||{},os=market?.operational_state||market?.market_state||{};
  const root=$("purchaseProgress");
  root.innerHTML=[1,2,3].map(n=>`<button type="button" class="tranche-box tranche-toggle ${s["t"+n]?"done":"pending"}" data-tranche="${n}" aria-pressed="${s["t"+n]?"true":"false"}" aria-label="第${n}弾 ${s["t"+n]?"実施済":"未実施"}。実施記録を変更"><span class="tname">第${n}弾</span><span class="tstate">${s["t"+n]?"実施済":"未実施"}</span></button>`).join("");
  const nx=purchaseNextText(s,g,q,os,market?.execution_plan||{});
  setText("nextPurchaseCheck",nx.title);setText("nextPurchaseReason",nx.reason);
  setText("purchaseUpdated",s.updated_at?"最終更新 "+new Date(s.updated_at).toLocaleString("ja-JP"):"購入進捗はまだ記録されていません。");
  root.querySelectorAll(".tranche-toggle").forEach(btn=>btn.addEventListener("click",()=>confirmTrancheChange(Number(btn.dataset.tranche))));
}
'''

def replace_once(text: str, before: str, after: str) -> str:
    if text.count(before) != 1:
        raise ValueError('Expected exactly one anchor: ' + before[:60])
    return text.replace(before, after, 1)

def build(source: bytes) -> str:
    actual=hashlib.sha1(b'blob '+str(len(source)).encode()+b'\0'+source).hexdigest()
    if actual != EXPECTED_BLOB:
        raise ValueError('Source changed; rebase/review required. Observed blob: '+actual)
    html=source.decode('utf-8')
    original=html
    protected=html[html.index('const PURCHASE_STATE_KEY='):html.index('function renderPurchaseProgress(){')]
    old_render=re.findall(r'^function renderPurchaseProgress\(\)\{[^\n]*\}',html,re.M)
    if len(old_render)!=1:
        raise ValueError('Expected original one-line purchase renderer')
    html=replace_once(html,old_render[0],JS.rstrip())
    html=replace_once(html,'      <h3 style="margin-top:14px">実施記録</h3>\n      <div id="purchaseControls" class="tranche-controls">--</div>\n','')
    old_reset='      <div class="btnrow" style="margin-top:10px"><button id="resetPurchaseBtn" class="secondary">購入進捗をリセット</button><div></div></div>'
    new_reset='      <details class="supplement"><summary>記録のリセット</summary><div class="body"><button type="button" id="resetPurchaseBtn" class="secondary">購入進捗をリセット</button></div></details>'
    html=replace_once(html,old_reset,new_reset)
    html=replace_once(html,'      <div id="purchaseProgress" class="tranche-grid">--</div>','      <div id="purchaseProgress" class="tranche-grid" role="group" aria-label="3分割の実施記録">--</div>\n      <div class="local-only">ボタンから実施状況を記録します。購入注文は行いません。</div>')
    html=replace_once(html,'</style>',CSS+'</style>')
    assert protected in html, 'Storage and next-action logic changed'
    assert html[html.index('function fallbackReferenceItems'):]==original[original.index('function fallbackReferenceItems'):], 'Unrelated analysis code changed'
    assert 'id="purchaseControls"' not in html
    assert html.count('id="resetPurchaseBtn"')==1
    return html

def main() -> int:
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source',default='index.html')
    ap.add_argument('--output-dir',required=True)
    args=ap.parse_args()
    source=Path(args.source).resolve()
    out=Path(args.output_dir).resolve()
    if out==source.parent:
        raise ValueError('Output must be separate from the production source directory')
    result=build(source.read_bytes())
    out.mkdir(parents=True,exist_ok=True)
    (out/'index.html').write_text(result,encoding='utf-8')
    scripts=re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',result,re.S|re.I)
    (out/'inline.js').write_text('\n'.join(s for s in scripts if s.strip()),encoding='utf-8')
    print('PREVIEW_BUILT: protected storage/analysis functions unchanged; production source untouched')
    return 0
if __name__=='__main__':
    raise SystemExit(main())
