# India UI 5.50 — enlarged chart date-axis readability

Date: 2026-10-24 JST. Baseline Public main: `002d61ed69f02b9d806fac409de800a3d60ec281` (UI 5.49).

Status (2026-10-24 22:29 JST): **PR #92 merged to Public main as UI 5.50; Pages deployment workflow succeeded. Direct HTTP bytes and iPhone Safari acceptance not yet verified.**

## User evidence and why-three

At 2026-10-24 21:57 JST the user supplied an iPhone Safari screenshot of the NIFTY 50 chart at **250%**. The user reports that the chart movement is now satisfactory, but calendar dates are too sparse to judge when the price moved. The rightmost scrolled viewport shows only `10/23`. The screenshot is private user evidence and **is not uploaded to this Public repository**.

1. **Why needed:** an enlarged chart with price and support levels but only one visible date cannot reliably communicate when the movement happened.
2. **Why current UI insufficient:** `technical-charts.js` `grid()` emits exactly three X labels — first/middle/last — regardless of SVG width. Enlarged horizontal scrolling can push the first two beyond the visible viewport.
3. **Why minimal safe fix:** expand *only* presentation date ticks when the user opens a chart dialog; select observed trading-session dates from the **same existing validated rows**, anchored at the newest date, and space successive ticks by at least **86 CSS px**. Preserve existing plot positions, normal embedded three-date presentation, market-trading chronology, RSI/MACD/NIFTY common date alignment, support-line logic and all Y-axis data. Draw no extra full vertical grid: retain one weak mid guide. No backfill or new market fetch.

## Behavior and numerical evidence

- The embedded chart is untouched: it still has first/middle/last labels. Expanded 100–250% uses X slot width and observed-record count to choose a tick stride `max(1, ceil(86 / ((plotRight-left)/rows.length)))`.
- Labels are `MM/DD` from the **saved dates**, never fabricated calendar days. Latest date stays included, so at 250% the rightmost iPhone viewport contains multiple dates. The exact number depends on width and number of recorded sessions.
- Existing one-axis-date positioning remains shared for 30-session NIFTY closing prices, Wilder RSI, and MACD. 30/60/200 OHLC charts retain all verified data and missing-MA behavior. One faint vertical guide, unchanged color/reference semantics.
- The 6-month India Core NAV chart uses its **existing saved fund observations** for expanded-only adaptive dates as well (96px minimum X spacing); its normal three-date presentation and support-line computation are unchanged. Fund NAV dates are never substituted for NIFTY dates.
- This is an axis annotation only. No recalculation, thresholds, judgment `formal_action`, purchase progress, fund NAV, external providers, GitHub schedule/guard/14:00 window, method_version, Public payload or private account data are modified.

## Test/operational gates

- New `tests/chart-date-axis.test.cjs`: normal 3-tick baseline; actual saved 30 NIFTY date rows; 320/375/393/430px and 100/150/250% label counts/gaps; rightmost 250% viewport contains multiple actual dates; common NIFTY/RSI/MACD X coordinates; 60/200 OHLC; supporting overlays and invalid dates; PWA-specific UI/cache/manifest versions.
- Existing technical chart tests and full Node suite, Public PR Validation / Public Safety / Publication Manifest / Cache / Purchase / Deep Dive / Review History tests must continue to pass on final PR head.
- Chrome geometric checks and tests are not iPhone Safari device acceptance. Once separately approved and published, verify actual 250% NIFTY screenshot: several date labels visible, no collisions or loss of last date, panning/fit/pinch/header remains as accepted, and purchasing/review history persists without data deletion.
- User-provided device feedback documents that UI 5.49 **movement** is satisfactory. Do not treat the new date axis as device accepted before subsequent iPhone confirmation.

## Change and rollback boundary

Version bump: UI 5.49 → 5.50 with corresponding own PWA cache namespace and manifest. Core `APP_VERSION=5.7`, rules, data, adoption contracts and PENDING-014 remain unchanged. During candidate preparation the branch did not merge, deploy, invoke market workflows or modify external services. After separate user authorization on 2026-10-24 22:26 JST, display-only PR #92 was merged and its Pages deployment succeeded. No Private Core or external settings were changed.

Rollback if rejected: drop the display-only branch/PR; no JSON/purchase history/other PWA cache changes. If a deployed version later needs reversal, use a forward-only review/PR rather than clearing Safari storage.

## Isolated Chromium device-width verification

- [Read-only Actions run 40097040420](https://github.com/nakayama2536-happy/India_1400/actions/runs/40097040420) **SUCCESS** on 2026-10-24 JST, with source code pinned to the UI 5.50 PR head `415e3e602e1059a1d4c5e1c8fe8bf4bd98fcab09`. Branch `verify/u550-dates-browser-20261024` differs from that PR head **only by its isolated verification workflow**, is not merged, and does not deploy Pages.
- Real Chromium DOM rendering using the saved Public NIFTY 30-date sequence. CDP device emulation covered CSS widths **320, 375, 393, 430** (DPR 2–3). Standard embedded chart retained exactly 3 labels (`09/09`, `09/30`, `10/23`). The enlarged, rightmost **250%** viewport displayed:
  - 320/375px: `10/12`, `10/16`, `10/23`.
  - 393/430px: `10/09`, `10/14`, `10/19`, `10/23`.
- Midpoint-scroll also retained 4 visible dates without collision. Minimum visible label gap ranged **45–82 CSS px** across the tested scenarios, fixed plot height stayed at 320px, title/close remained within viewport, and every label matched a saved observed date. No calendar interpolation.
- **Limitation:** these are Chromium phone-width layout checks, not real iPhone Safari/PWA operation or independent market evidence. Device acceptance remains a separate gate; main merge and Pages deployment results are recorded below. No buy/sell logic, missing-data handling, forecast methods, market schedule or purchase records are changed.

## Publication evidence after explicit authorization — 2026-10-24 JST

| Gate | Evidence | Result |
|---|---|---|
| Separate user authorization | Conversation 2026-10-24 22:26 JST: 「承認します。続けてください」 | Granted for PR #92 release continuation |
| Candidate final head | Public PR [#92](https://github.com/nakayama2536-happy/India_1400/pull/92) at `9b0fe62538c87bcff6141b8f3af2487a5a5d4aa0` | 9/9 PR workflow families PASS (including 206/206 full Node and 58/58 technical chart tests) |
| Public main | Squash merge commit [`3c4481d54bad854fdf5b93d0f29d171a138e07ab`](https://github.com/nakayama2536-happy/India_1400/commit/3c4481d54bad854fdf5b93d0f29d171a138e07ab) | MERGED at 22:28 JST. 8/8 post-merge functional/safety CI families PASS on this SHA |
| Publication gate | [Pages run 40098304748](https://github.com/nakayama2536-happy/India_1400/actions/runs/40098304748), same merged head SHA | Pre-deploy public safety, Pages artifact build and Pages deployment all SUCCESS at 22:29 JST |
| Follow-up manifest | [`0b637ba85bc64f3f1f465c32889732f261fcba8b`](https://github.com/nakayama2536-happy/India_1400/commit/0b637ba85bc64f3f1f465c32889732f261fcba8b) | Only `publication_manifest.json` changed: publication_id and VERSION SHA-256, no UI calculation/purchase data |
| Live HTTP | `https://nakayama2536-happy.github.io/India_1400/` | Direct GET of deployed files **NOT VERIFIED**: current inspection environment cannot resolve/retrieve Pages host. The workflow's success does not prove user's device has loaded 5.50 |
| Real iPhone Safari/PWA | User device test after install/update | **PENDING**. Chromium screenshot result is not device acceptance |

### Device acceptance: safe manual observation, no reset or record deletion

1. Open the usual iPhone home-screen PWA or Safari view. Confirm visible version **v5.50**; if still v5.49, perform a normal reload/reopen. Do not clear Safari/PWA site data or uninstall.
2. Under **指標**, expand NIFTY to **250%** and scroll to the latest/rightmost edge. Expect multiple saved dates (not only `10/23` for the 2026-10-23 saved sample), with final saved date visible and no overlapping labels.
3. Pan to the middle. Verify stable fixed vertical scale, horizontal-only zoom, readable Y tick labels, visible close/title, one faint date guide, and unchanged RSI 50 / MACD zero / support reference.
4. Verify RSI, MACD and the optional 60/validated 200-bar OHLC similarly. Verify India Core NAV enlarged dates independently; fund date is not an NIFTY trading date.
5. Verify **購入状況** and review-history entries still appear unchanged, **without any save, reset or destructive operation**. A successful UI screenshot/CI does not establish persistence integrity unless the existing entries can be re-read on the actual device.

### Remaining boundaries and next review

- This release only improves *when* a saved point occurred, not the number of factual market observations. Data is accumulated via ordinary market updates only: no fabricated earlier NIFTY quotes, backfilled 14:00 representative values, forecast rows, or weekend data.
- Existing Private Core `APP_VERSION=5.7`, 14:00 runtime/representative-quote contract, PENDING-014 GitHub-only scheduling evidence, security boundary, purchase local storage and trading eligibility remain unchanged.
- **Done:** code, branch merge, main CI, publication workflow success. **Not done:** direct deployed-file byte match, actual iPhone Safari acceptance, market-day natural 14:00 / DECISION Burn-in. Those are independent gates.
