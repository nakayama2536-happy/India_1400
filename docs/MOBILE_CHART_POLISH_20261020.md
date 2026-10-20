# Mobile technical chart polish — UI 5.45

## Scope and baseline

- Repository: `nakayama2536-happy/India_1400`.
- Baseline main: `80505efc95d820e1933c5d28be93c9a924adc5e3` (UI 5.44).
- Issue: #84.
- UI-only changes to the Indicators view, corresponding UI version and app-specific cache identity.

## Why this change

1. The outer technical group plus inner cards and the candle wrapper consumed mobile width. Price, RSI and MACD also used different right gutters and X mappings, making dates harder to compare.
2. A horizontal support line required reading a separate long paragraph to find its value; the daily candle explanation exposed implementation detail during routine use.
3. Keep the existing heights and colors, remove only redundant framing, share day-cell coordinates, annotate the existing one reference level, and move explanatory detail into accessible disclosures. The reference status remains visible in each disclosure summary.

## Behavior

- One frame per chart; full group width is available to the three technical cards.
- Same 59 CSS-pixel right gutter and centered trading-day cells for price, RSI, MACD and daily candles. Price, RSI and MACD in the baseline public snapshot have identical 30-date sequences. Different source date sequences are not fabricated or resampled.
- NIFTY reference level uses its existing `kind`: support candidate or recent-low guide. The level value, evidence, maximum one line and matching-confirmed-date checks are unchanged.
- A compact 11px label is placed within the plot, favoring empty space near the reference line. Terminal MACD bars stay fully within the plot.
- Support reference/non-decision text stays visible; dates and extraction explanation are in the disclosure body.
- Candle basis mismatch, unavailable state and source-error existence stay visible. Full source details and volume explanation are expandable.
- If `available=true` conflicts with nonempty `close_mismatch_dates`, daily candles now visibly pause, consistent with the existing explanatory text. The management audit uses the same hold state. This display guard does not change any trade decision.
- A differing OHLC date is called a basis-date mismatch, without assuming it is older.

## Preserved boundaries

No edits to data JSON, data retrieval, Private Core, support calculation, trade thresholds, purchase records/storage, forecast/evaluation rules or workflow definitions. The worker only changes its own versioned cache name and shell start URL; storage and other app caches are unchanged.

## Validation

- Inline JavaScript and technical renderer syntax checks passed.
- Existing Node regression checks: 142 passed (12 files, direct callback execution verified); public delivery gate passed locally.
- Public delivery / Pages candidate / publication manifest Python checks: 23 passed.
- Geometry checks cover matching date coordinates, complete end bars and reference-label bounds at narrow widths.
- A direct local-file browser preview was blocked by the cloud browser URL policy, so no local full-page browser pass is claimed. GitHub PR checks and deployment evidence must be verified before completion.
- iPhone Safari/PWA acceptance remains a device check; synthetic geometry and desktop browser results do not replace it.

## Recovery

Use a reviewed forward change to restore the previous presentation under a new UI/cache version. Keep app-specific cache isolation. Do not clear browser site data or reset purchase records.
