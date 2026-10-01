# COM-PUB-001 Pages migration rollback

Status: candidate only. Repository Pages source has not been changed by this branch.

## Why 3

1. A pre-deploy gate is only useful if deployment depends on it.
2. Current branch Pages cannot prove that dependency from repository code alone.
3. The candidate keeps the existing public-delivery gate and only changes the delivery path.

## Preconditions before any source switch

- Candidate workflow is green at the exact commit to be adopted.
- validate-public-delivery succeeds.
- build-pages-artifact succeeds.
- deploy-pages remains disabled until the switch window.
- index.html, manifest.webmanifest, sw.js, market.json and common_snapshot.json in the candidate artifact are byte-identical to the adopted Public commit.
- Current public URL and current Service Worker scope are recorded manually because repository Pages settings are outside the connector-readable surface.
- A rollback operator has confirmed access to repository Settings > Pages.

## Rollback

If the first Actions Pages deployment fails, changes URL/scope unexpectedly, or the PWA fails acceptance:

1. Do not regenerate market decisions or modify market JSON to recover the site.
2. Restore the previous Pages source setting in Settings > Pages.
3. Keep the last validated Public repository commit; do not force-push.
4. Confirm the previous URL serves index.html, manifest.webmanifest, sw.js and the last validated JSON.
5. Record the failed deployment run, observed symptom and restored source setting in the private control repository.
6. Rework via a new branch/PR; do not rewrite the failed deployment history.

## Acceptance boundary

Merging this candidate alone does not satisfy COM-PUB-001. Adoption requires evidence that the actual Pages source uses the gated Actions workflow, a successful normal deployment, a rejected unsafe fixture before artifact/deploy, compatibility checks, and rollback/source-setting evidence.
