#!/usr/bin/env python3
"""v5.6 forecast verification layer.

Reads the actual 14:00 history and confirmed NIFTY daily closes, then evaluates
1/3/14-trading-day forecasts only after the corresponding future trading-day
close exists. No synthetic forecasts or backfilled 14:00 snapshots are created.

Metrics are descriptive verification metrics, not probabilities:
- median-return absolute error (percentage points)
- 25-75% forecast-range hit
- direction-label match
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import statistics

MARKET = Path("market.json")
HISTORY = Path("history.json")
DAILY = Path("nifty_daily_history.json")
EVAL = Path("forecast_evaluation.json")

APP_VERSION = "5.6"
METHOD_VERSION = "5.6-eval-1"
HORIZONS = (1, 3, 14)
DIRECTION_THRESHOLDS = {1: 0.15, 3: 0.35, 14: 0.80}


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def num(x):
    try:
        y = float(x)
        return y if math.isfinite(y) else None
    except Exception:
        return None


def rnd(x, digits=2):
    y = num(x)
    return None if y is None else round(y, digits)


def pct_change(a, b):
    a, b = num(a), num(b)
    if a is None or b is None or b == 0:
        return None
    return (a / b - 1.0) * 100.0


def actual_direction(h, actual_return):
    x = num(actual_return)
    if x is None:
        return None
    t = DIRECTION_THRESHOLDS[h]
    if x >= t:
        return "上向き"
    if x <= -t:
        return "下向き"
    return "中立"


def sample_adequacy(n):
    if n >= 100:
        return "高"
    if n >= 30:
        return "中"
    if n >= 10:
        return "低"
    return "不足"


def extract_forecast(record):
    f = record.get("forecast") or {}
    out = {}
    for h in HORIZONS:
        src = f.get(str(h)) or {}
        out[str(h)] = {
            "label": src.get("label"),
            "median_return_pct": rnd(src.get("median_return_pct"), 3),
            "q25_return_pct": rnd(src.get("q25_return_pct"), 3),
            "q75_return_pct": rnd(src.get("q75_return_pct"), 3),
            "median_price": rnd(src.get("median_price"), 2),
            "q25_price": rnd(src.get("q25_price"), 2),
            "q75_price": rnd(src.get("q75_price"), 2),
            "historical_up_share_pct": rnd(src.get("historical_up_share_pct"), 1),
            "sample_count": src.get("sample_count"),
            "statistical_reference": src.get("statistical_reference"),
        }
    return {
        "basis": f.get("basis"),
        "basis_date": f.get("basis_date"),
        "basis_price": rnd(f.get("basis_price"), 2),
        "basis_consistency": f.get("basis_consistency"),
        "horizons": out,
    }


def build_daily_index(daily):
    pairs = []
    for r in (daily.get("records") if isinstance(daily, dict) else []) or []:
        d = str(r.get("date") or "")
        v = num(r.get("close"))
        if d and v is not None and v > 0:
            pairs.append((d, v))
    pairs = sorted(dict(pairs).items())
    dates = [d for d, _ in pairs]
    closes = {d: v for d, v in pairs}
    pos = {d: i for i, d in enumerate(dates)}
    return dates, closes, pos


def target_date_for(basis_date, horizon, dates, pos):
    if basis_date not in pos:
        return None
    i = pos[basis_date] + horizon
    return dates[i] if i < len(dates) else None


def evaluate_one(h, src, basis_price, target_date, target_close):
    med_ret = num(src.get("median_return_pct"))
    med_price = num(src.get("median_price"))
    q25_price = num(src.get("q25_price"))
    q75_price = num(src.get("q75_price"))
    label = src.get("label")
    actual_ret = pct_change(target_close, basis_price)
    if actual_ret is None:
        return None

    err = None if med_ret is None else actual_ret - med_ret
    abs_err = None if err is None else abs(err)
    price_err_pct = None
    if med_price is not None and basis_price:
        price_err_pct = abs(target_close - med_price) / basis_price * 100.0

    range_hit = None
    if q25_price is not None and q75_price is not None:
        lo, hi = min(q25_price, q75_price), max(q25_price, q75_price)
        range_hit = lo <= target_close <= hi

    actual_label = actual_direction(h, actual_ret)
    direction_match = None if not label or actual_label is None else label == actual_label

    return {
        "status": "EVALUATED",
        "target_date": target_date,
        "actual_close": rnd(target_close, 2),
        "actual_return_pct": rnd(actual_ret, 3),
        "actual_direction": actual_label,
        "forecast_direction": label,
        "direction_match": direction_match,
        "median_return_error_pct": rnd(err, 3),
        "absolute_median_return_error_pct": rnd(abs_err, 3),
        "median_price_error_pct": rnd(price_err_pct, 3),
        "range_25_75_hit": range_hit,
    }


def aggregate(entries):
    by_h = {}
    for h in HORIZONS:
        rows = []
        for e in entries:
            x = (e.get("results") or {}).get(str(h)) or {}
            if x.get("status") == "EVALUATED":
                rows.append(x)

        abs_errors = [num(x.get("absolute_median_return_error_pct")) for x in rows]
        abs_errors = [x for x in abs_errors if x is not None]
        price_errors = [num(x.get("median_price_error_pct")) for x in rows]
        price_errors = [x for x in price_errors if x is not None]
        range_hits = [x.get("range_25_75_hit") for x in rows if x.get("range_25_75_hit") is not None]
        direction_hits = [x.get("direction_match") for x in rows if x.get("direction_match") is not None]

        by_h[str(h)] = {
            "evaluated_count": len(rows),
            "sample_adequacy": sample_adequacy(len(rows)),
            "median_absolute_return_error_pct": rnd(statistics.median(abs_errors), 3) if abs_errors else None,
            "mean_absolute_return_error_pct": rnd(statistics.fmean(abs_errors), 3) if abs_errors else None,
            "median_price_error_pct": rnd(statistics.median(price_errors), 3) if price_errors else None,
            "range_25_75_hit_pct": rnd(sum(bool(x) for x in range_hits) / len(range_hits) * 100.0, 1) if range_hits else None,
            "direction_match_pct": rnd(sum(bool(x) for x in direction_hits) / len(direction_hits) * 100.0, 1) if direction_hits else None,
        }

    return {
        "method_version": METHOD_VERSION,
        "forecast_count": len(entries),
        "pending_count": sum(
            1 for e in entries
            if any(((e.get("results") or {}).get(str(h)) or {}).get("status") == "PENDING" for h in HORIZONS)
        ),
        "horizons": by_h,
        "note": "誤差・レンジ内率・方向一致率は過去予測の検証指標であり、将来の上昇確率ではありません。",
    }


def main():
    market = load_json(MARKET, {})
    history = load_json(HISTORY, {"records": []})
    daily = load_json(DAILY, {"records": []})

    dates, closes, pos = build_daily_index(daily)
    entries = []

    for record in (history.get("records") if isinstance(history, dict) else []) or []:
        f = extract_forecast(record)
        basis_date = f.get("basis_date") or record.get("date_jst")
        basis_price = num(f.get("basis_price"))
        if not basis_date or basis_price is None:
            continue

        entry = {
            "forecast_id": record.get("date_jst") or basis_date,
            "snapshot_date_jst": record.get("date_jst"),
            "generated_at_jst": record.get("generated_at_jst"),
            "price_as_of_jst": record.get("price_as_of_jst"),
            "basis_date": basis_date,
            "basis_price": rnd(basis_price, 2),
            "basis": f.get("basis"),
            "basis_consistency": f.get("basis_consistency"),
            "source_history_method_version": record.get("history_method_version"),
            "forecast": f.get("horizons"),
            "results": {},
        }

        for h in HORIZONS:
            src = (f.get("horizons") or {}).get(str(h)) or {}
            target_date = target_date_for(basis_date, h, dates, pos)
            if not target_date:
                entry["results"][str(h)] = {
                    "status": "PENDING",
                    "target_date": None,
                    "message": f"{h}営業日後の確定日足待ち",
                }
                continue
            target_close = closes.get(target_date)
            result = evaluate_one(h, src, basis_price, target_date, target_close)
            if result is None:
                entry["results"][str(h)] = {
                    "status": "PENDING",
                    "target_date": target_date,
                    "message": "評価用終値を確認できません。",
                }
            else:
                entry["results"][str(h)] = result

        entries.append(entry)

    entries.sort(key=lambda x: x.get("snapshot_date_jst") or "")
    summary = aggregate(entries)

    eval_out = {
        "schema_version": 1,
        "method_version": METHOD_VERSION,
        "basis": "14:00 representative forecast versus confirmed NIFTY close after 1/3/14 trading days",
        "direction_threshold_pct": {str(k): v for k, v in DIRECTION_THRESHOLDS.items()},
        "synthetic_backfill": False,
        "entries": entries[-520:],
        "summary": summary,
    }
    EVAL.write_text(json.dumps(eval_out, ensure_ascii=False, indent=2), encoding="utf-8")

    market["app_version"] = APP_VERSION
    market["forecast_verification"] = summary
    market["forecast_verification"]["latest_evaluated"] = None
    for e in reversed(entries):
        if any(((e.get("results") or {}).get(str(h)) or {}).get("status") == "EVALUATED" for h in HORIZONS):
            market["forecast_verification"]["latest_evaluated"] = {
                "forecast_id": e.get("forecast_id"),
                "snapshot_date_jst": e.get("snapshot_date_jst"),
                "results": e.get("results"),
            }
            break

    am = market.get("analysis_meta")
    if not isinstance(am, dict):
        am = {}
    am["release_version"] = APP_VERSION
    am["forecast_verification_version"] = METHOD_VERSION
    market["analysis_meta"] = am

    MARKET.write_text(json.dumps(market, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "app_version": APP_VERSION,
        "forecast_count": summary.get("forecast_count"),
        "pending_count": summary.get("pending_count"),
        "evaluated": {h: summary["horizons"][h]["evaluated_count"] for h in ("1", "3", "14")},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
