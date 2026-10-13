# Quality presentation candidate — UI5.31

Baseline `89447a6b74c24d750d3a119069492814bc9fa18a` (published5.30). Branch/PR only; no merge or publication authorization.

## なぜ3

Necessary: READY market conditions must not imply permission to purchase, and unavailable/old data must not appear fresh. Current gap: condition cards, missing purchase records and runtime freshness can mislead. Minimal safe response: explicit separate qualifications and fail-closed display, preserving backend thresholds, storage bytes/schema and purchase rules.

Changes: separate market READY, quality/time eligibility, final HOLD or personal confirmation; unknown records remain unknown without writes. Block unavailable/failed/missing/future/stale data from promotion. Limit holiday handling to same generated JST date. Show optional OHLC last dates/errors and unavailable or scope-unverified volume without invalidating confirmed-close analysis. Explain NIFTY Wilder versus fund simple-mean RSI. Optional FII/DII and breadth stay unavailable without invented values. Candidate version/cache revision is app-scoped; no origin-wide cache deletion.

Verification: Python70 passed+33 subtests; Node64 passed, including privacy, purchase storage, review history and cache isolation. New presentation tests run in PR validation.

No saved market/history/purchase data or publication manifest is changed. Older Core JSON remains supported with fail-closed presentation. Formal Brent five-session production acquisition is unresolved; UI labels do not fix it. No browser/iPhone or production acceptance claimed. Merge/deployment require separate approval.
