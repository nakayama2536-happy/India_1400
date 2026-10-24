# India UI 5.49 — iPhone chart zoom scaling correction (2026-10-24 JST)

Status: candidate branch and regression review. Main release / Pages / iPhone final acceptance are **separate gates**.

## User-observed acceptance on UI 5.48

Two iPhone screenshots at 20:50 JST show RSI 14 and NIFTY enlarged views, one with 250% zoom. The chart rises to excessive height and Y-axis labels grow with the zoom; a NIFTY screenshot also shows part of the modal header clipped horizontally. These images were provided in a private chat and are **not uploaded to the public repo**.

User confirms the remaining features OK: UI 5.48 launch, NIFTY candle 30/60/200 selection, Management quality/freshness/14:00 evidence, and preservation of purchase/review records across reload/offline recovery. These are user-reported checks, not proof of exact device/iOS version, gesture timing, or complete formal DEVICE_PASS. The chart-zoom item remains **NEEDS_FIX**.

## Why three

1. **Needed:** 250% enlarges chart height, dates and numeric tick labels along with horizontal width, so the user cannot inspect trends without extensive vertical panning. A second image suggests that iOS browser/page zoom or content intrinsic width may also displace the dialog header.
2. **Current gap:** `chart-experience.js` widened a clone of a fixed-viewBox SVG while `chart-experience.css` forced `width:100%; height:auto`. With preserved SVG aspect ratio, both axes and all typography scale. The flex dialog allowed its body to occupy a tall viewport, and didn't suppress Safari's legacy gesture defaults explicitly.
3. **Minimal safe correction:** preserve the same validated public inputs and reuse the existing chart display renderers, but redraw chart coordinates for each wider X viewport using a **fixed Y drawing height**. Keep default in-page heights and colors, prices, RSI 50 reference, MACD zero, NIFTY supports, confirmed OHLC/MA gates, and fund support validation. Constrain modal width/height and keep scrolling inside the chart body only. Intercept only the dialog's two-finger pinch/gesture defaults; don't disable system zoom elsewhere. No external network calls, calculation rule or persistent state.

## Implementation contract

- UI v5.49: `index.html` supplies `renderExpandedChart(id,width,height)` to the display-only chart controller. It reads **already-loaded** market / fund history and uses `IndiaTechnicalCharts.lineChart`, `candlestickChart` and `coreTrendSvg` with their established date/quality/support rules.
- Fixed modal target heights by chart: fund 480px, NIFTY 320px, RSI/MACD 260px, candles 350px, capped by the current viewport height. At 250% the **width grows**; the **height does not**. Landscape heights are bounded.
- For 200 OHLC, retain the UI 5.48 lazy-loading, 200/60 complete OHLC reconciliation and omission of unprovided volume/long MA. Zoom changes neither the 14:00 capture phase nor historical evidence.
- Keep existing Zoom controls 100–250%, fit, Escape, return focus and latest/right-edge horizontal scroll. Chart coordinates are re-rendered into an SVG whose viewBox width and height match the displayed frame, rather than stretching the entire raster-like clone.
- Panel cannot widen beyond the phone viewport; chart body carries the overflow. Suppress iOS Safari's `gesturestart`/`gesturechange` and two-finger default touch behavior **only inside the open chart dialog**, with gesture reading/updating the chart's horizontal zoom.
- Remain a Public/UI-only fix; GitHub main, Core market data, fund NAV, forecast scoring, purchase records, review history, threshold contracts, secrets and scheduled/external triggers are unchanged by this candidate.

## Validation

- CI: existing `node --test tests/*.test.cjs`, explicit technical chart contract, PR Validation, Security, Cache, Purchase UI, Decision Reasons, Review History and Publication Manifest.
- New `tests/chart-zoom-mobile.test.cjs`: portrait widths 320/375/393/430, 100%–250% geometry, landscape height limit, actual NIFTY/RSI/MACD and 200-candle fixed-Y SVG generation, 200-OHLC untouched, NAV viewport geometry, controller +/−/fit, pinch prevention, focus return, CSS min-width and panel height restrictions.
- Browser geometry tests/CI **do not replace** an actual iPhone Safari/PWA test. On-device: open RSI and NIFTY, zoom to 250%, check header/close button remain in place, Y axes stay legible, chart height stays moderate, horizontal swiping retains latest data, fit returns to 100%, pinch affects chart only. Repeat 200 candles and NAV, rotate device, close and confirm purchase progress and deep-dive reviews unchanged. Never delete browser data or reset purchase stages.
- Existing 4 non-chart categories were user-reported OK on UI 5.48 and are not assumed affected; verify no regression after final UI rollout.

## Acceptance and rollout gates

Only after safe code/CI and a distinct **explicit approval** may the new Public PR be merged and Pages deployed. Deployment/static HTTP bytes must be checked separately. Do not mark DEVICE_PASS until a user confirms the corrected gestures, header, readability and record preservation on the published v5.49 PWA.

PENDING-014 (GitHub-only on-time 14:00), independent trigger state, Burn-in, and predictive method adoption are separate and remain unchanged.

**Rollback:** a forward-only UI rollback/fix through Public PR; retain purchased/review records, all existing JSON, data provenance, and other PWA cache namespaces.

## Actual Chromium browser geometry verification

- PR candidate code pinned to `b19ef9585753bd3a9f319da0b8876351d74f4cbd`. Verified by isolated read-only Actions [run 40094425194](https://github.com/nakayama2536-happy/India_1400/actions/runs/40094425194); completed SUCCESS, no deployment. The isolated branch differs from the pinned code only by its verification workflow and is not included in this PR.
- Real Chromium CSS layout plus CDP device emulation at **320×700**, **375×812**, **393×852**, **430×932** portrait and **844×390** landscape (DPR 2/3) were all PASS. The 250% RSI zoom retained **260 CSS px height** for the four portrait widths and **190 CSS px** in landscape, with fixed modal/header/close-button placement inside the viewport, horizontal-only scrolling, visible RSI 50 reference colors, and gesture-event prevention on the open modal.
- Earlier isolated verification runs failed on runner shallow Git ancestry, fixed-size fixture viewport, or overly strict landscape-height expectations; the final successful run explicitly corrected these *verification fixtures*, not the business data or trade/forecast criteria. Existing candidate PR head remained unchanged during that verification.
- Main PR final CI for the code SHA `b19ef9585753bd3a9f319da0b8876351d74f4cbd`: **9/9 success**, full Node 195/195, chart 47/47, PR Validation 93/93, Security/Cache/Purchase/Publication/Review History/Deep Dive successful.
- **Limit**: Chromium/DevTools emulation is not iPhone Safari or installed PWA gesture verification. On-device v5.49 recheck remains the remaining UI acceptance gate. No automatic promotion to DEVICE_PASS, formal trading, or GitHub-only natural 14:00 proof.
