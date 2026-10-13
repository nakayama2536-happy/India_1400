# Display-time session boundary safety (UI 5.32 candidate)

Base: Public main `7c4c52b0a9053c52cb96be4282f6d918b5271584`; Core policy inspected at `b06ca61f1320919f286d77d2206f35da6c3a436c`.

## Why necessary / current gap / minimal safe change

- Necessary: market-condition READY must not imply execution eligibility after the regular session closes.
- Gap: a synthetic saved LIVE/eligible snapshot at 18:59 JST still returned eligible at 19:05 because the old display guard checked only saved permissions and 20-minute freshness. The clock refresh did not refresh the purchase views. This is a reproduced code defect, not proof of an actual user trade or device incident.
- Minimal safety: add only a restrictive display guard. Keep Core's existing inclusive 12:45:00–19:00:00 JST regular-session boundary, saved LIVE status, explicit regular-trading-day flag, same-JST-date generation/quote, existing freshness and all saved gates. No holiday inference grants permission. Missing evidence fails closed. Market READY is preserved while final display becomes HOLD.

## Scope

Purchase views re-render on the existing 60-second clock tick and when the document becomes visible. This performs no provider fetch, record migration or storage writes. Browser timer throttling and device clock error remain limitations: this is not an exact-second background execution guarantee. Orders are not implemented. Purchase conditions, allocations, personal records, Core rules and market JSON are unchanged.

UI version, manifest and own service-worker cache identifier advance together to 5.32. No other application's cache policy changes. Publication manifest remains managed by the existing approved publication pipeline; this PR does not publish.

## Verification

- Node suite: 68 passed, zero failures (including session boundaries, fresh cached close transition, weekend/calendar unknown, stale dates, READY/HOLD and clock-refresh wiring).
- Python suite: 70 passed and 33 subtests passed.
- Actual iPhone foreground/background return and published-service-worker acceptance: pending; not inferred from unit tests.
- CI status is recorded on the PR. Main merge and production publication require separate approval.

## Remaining work

Brent comparable five-session source evidence/licensing, natural production OHLC refresh, forecast forward evidence and device acceptance remain independent work items. This display fix does not complete them or establish Burn-in.
