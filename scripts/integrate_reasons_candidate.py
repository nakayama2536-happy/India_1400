"""One-time branch-only integration. Reject changed inputs; never touch data JSON."""
from pathlib import Path
import hashlib
import re
import subprocess

BASE = 'e97b5b4d7d7144b4fc41a909a7aee200d2510053'
EXPECTED_INDEX = '71b7c7fcb50e82ea46a5f97cabcefeba899cf0b4'
index = Path('index.html')
raw = index.read_bytes()
blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
assert blob == EXPECTED_INDEX, ('index changed; reconcile instead of overwriting', blob)
subprocess.run(['git', 'merge-base', '--is-ancestor', BASE, 'HEAD'], check=True)
src = raw.decode('utf-8')
old = src

def once(before, after):
    global src
    assert src.count(before) == 1, ('ambiguous patch anchor', before)
    src = src.replace(before, after, 1)

def function(source, name):
    start = source.index('function ' + name + '(')
    tail = source[start:]
    match = re.search(r'\n(?:function|const|async function) ', tail)
    return tail[:match.start()] if match else tail

protected = ['decisionDisplayEligible', 'runtimeSnapshotFreshness', 'renderQualityOverview', 'renderTranchePlan', 'loadPurchaseState', 'resetPurchaseState', 'renderClockTick']
original_functions = {name: function(old, name) for name in protected}
start = src.index('    <div class="card decision-reasons">')
end = src.index('    <div class="card">\n      <div class="btnrow">', start)
assert 500 < end-start < 5000
src = src[:start] + '''    <div class="card decision-reasons">
      <h2>判断理由</h2>
      <div id="decisionReasonsPanel">条件一覧を読み込んでいます。</div>
    </div>

''' + src[end:]
once('</head>', '  <link rel="stylesheet" href="decision-reasons.css">\n</head>')
once('<script src="technical-charts.js"></script>', '<script src="technical-charts.js"></script>\n<script src="decision-reasons.js"></script>')
replacement = '''function renderConditionDetails(){
  const root=$("decisionReasonsPanel");if(!root)return;
  if(typeof IndiaDecisionReasons==="undefined"){root.textContent="条件一覧の表示部品を読み込めません。再読込してください。";return;}
  IndiaDecisionReasons.mount(root,{market:market||{},common:commonSnapshot||{},eligible:decisionDisplayEligible(market?.trade_guide,market?.data_quality,market?.execution_plan),runtimeStale:runtimeSnapshotFreshness().stale});
}'''
src, count = re.subn(r'(?m)^function renderConditionDetails\(\)\{[^\n]*$', lambda _: replacement, src)
assert count == 1
start = src.index('const rs=g.reasons||[];', src.index('function renderDecision('))
end = src.index('setText("generatedAt",', start)
assert 500 < end-start < 3000
src = src[:start] + src[end:]
assert '5.45' in src
src = src.replace('5.45', '5.46')
for name, value in original_functions.items():
    assert function(src, name) == value, ('protected function changed', name)
index.write_text(src, encoding='utf-8')
version = Path('VERSION').read_text()
assert 'UI_VERSION=5.45' in version
Path('VERSION').write_text(version.replace('UI_VERSION=5.45', 'UI_VERSION=5.46'))
manifest = Path('manifest.webmanifest').read_text()
assert 'v=5.45' in manifest
Path('manifest.webmanifest').write_text(manifest.replace('5.45', '5.46'))
sw = Path('sw.js').read_text()
assert 'india1400-v5-45-20261020-chart-polish' in sw and '"technical-charts.js",' in sw
sw = sw.replace('india1400-v5-45-20261020-chart-polish', 'india1400-v5-46-20261021-reasons').replace('?v=5.45', '?v=5.46')
sw = sw.replace('"technical-charts.js",', '"technical-charts.js", "decision-reasons.js", "decision-reasons.css",')
Path('sw.js').write_text(sw)
for path in ['tests/indicator-charts.test.cjs', 'tests/technical-charts.test.cjs']:
    f = Path(path)
    body = f.read_text()
    revised = body.replace(r'5\.45', r'5\.46').replace('5.45', '5.46').replace('v5-45', 'v5-46')
    if revised != body:
        f.write_text(revised)
log = Path('CHANGELOG.md').read_text()
first, rest = log.split('\n', 1)
Path('CHANGELOG.md').write_text(first + '''

## UI v5.46 candidate — 2026-10-21

- Issue #87: compact saved decision conditions; remove exact duplicate reasons.
- Buy conditions always visible; sell cautions and unknowns always visible, only known non-matches folded.
- Preserve QC/freshness/blocking warnings and SHADOW/reference meaning. No trade/purchase/data changes.
- Add decision-reasons JS/CSS, regression tests and own-cache shell entries.
- Candidate only: main, Pages and iPhone acceptance remain separate. Details: docs/DECISION_REASONS_UI_20261021.md.
''' + rest)
Path('.github/workflows/decision-reasons.yml').write_text('''name: Decision Reasons Contract
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
permissions:
  contents: read
jobs:
  decision-reasons:
    runs-on: ubuntu-latest
    timeout-minutes: 8
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - name: JavaScript syntax
        run: for f in *.js; do node --check "$f"; done
      - name: All Node regressions including compact reasons
        run: node --test tests/*.test.cjs
''')
allowed = {'index.html', 'VERSION', 'manifest.webmanifest', 'sw.js', 'CHANGELOG.md', 'tests/indicator-charts.test.cjs', 'tests/technical-charts.test.cjs'}
changed = set(subprocess.check_output(['git', 'diff', '--name-only'], text=True).splitlines())
assert changed <= allowed, ('unexpected changed file', changed-allowed)
subprocess.run(['git', 'diff', '--exit-code', BASE, '--', '*.json'], check=True)
for script in re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, flags=re.S):
    f = Path('/tmp/india-reasons-inline-check.js')
    f.write_text(script)
    subprocess.run(['node', '--check', str(f)], check=True)
subprocess.run(['node', '--check', 'decision-reasons.js'], check=True)
print('PINNED SOURCE / PROTECTED FUNCTIONS / DATA UNCHANGED / INLINE SYNTAX: PASS')
