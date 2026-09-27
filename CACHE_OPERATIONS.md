# Cache isolation operation notes — cache1 / 2026-09-27

Implements COM-CACHE-002/003; OPS-T01/02. It does not adopt the full deep-dive/review contracts.

## Why three
1. CacheStorage is shared by same-origin applications, not isolated by project paths.
2. Broad activation cleanup and global lookup can delete/read another app's entries. Removing the whole query also merges semantic variants.
3. Use an app-specific version-cache prefix, named-cache reads, an origin/scope GET gate, and an explicitly approved freshness nonce only.

## Boundaries
- India only uses/deletes version caches prefixed `india1400-v`; Japan uses `jpstock-v`.
- Other prefixes and scopes are neither read nor deleted. This is accidental-use prevention, not protection from hostile same-origin code.
- India discards only dynamic JSON `v`; Japan discards only `t`. Symbol, period, revision and unknown parameters are retained.
- Network-first behavior and source timestamps are unchanged; offline fallback never creates a new data timestamp.
- HTTP errors remain errors and do not overwrite cached data. Cache/quota failures do not discard successful network responses. Redirected responses are not stored.
- No localStorage or IndexedDB access, no evaluation/purchase migration, no market JSON, trading-rule or schedule changes.
- UI versions are unchanged; cache names carry a separate `cache1` revision. Worker bytes change at the existing URL.

## Evidence
`node --test tests/sw-cache.test.cjs`: 12 deterministic cases per app.
The production worker code runs in a Node VM with simulated CacheStorage/fetch/events. This is not a native-browser or iPhone test.
A local Chromium attempt was blocked by environment navigation policy; no browser-pass result is claimed.

## Device acceptance — pending
1. With a network connection, open both apps, allow worker update, then reopen. Do not clear Safari site data or uninstall.
2. Confirm normal snapshot refresh and that evaluation/purchase records are unchanged.
3. After each app has loaded its current data online, check an offline reopen and source-date/last-value labels.
4. Inspect that each new worker removes only its own previous version cache and the other app still opens.
5. Record actual iOS/browser version, steps and result in the issue; CI or deployment success does not close device acceptance.

## Upgrade and recovery
New shell installation is completed before old own-version cache deletion. Dynamic data is deliberately not promoted from a previous worker/schema; load it once online before offline use. Missing uncached data fails explicitly. Personal records are not in the deleted version caches.
For recovery, keep the isolated worker implementation; restore compatible earlier shell files under a NEW cache revision and repeat tests. Do not blindly restore the previous origin-wide delete worker or clear all origin storage.
Older active workers, including an unaudited third app, can still issue broad deletions until they are separately updated. This change cannot override another worker.
