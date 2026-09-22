#!/usr/bin/env python3
"""v5.3 14:00 representative-history layer.

Purpose:
- Save exactly one representative 14:00 JST snapshot per regular NSE trading day.
- Choose the valid NIFTY quote closest to 14:00 from the scheduled 13:57/14:03/14:08 runs.
- NIFTY freshness is mandatory; stale external reference data never blocks the save.
- Never synthesize or backfill a 14:00 snapshot after the fact.
"""
from __future__ import annotations

from pathlib import Path
from datetime import datetime, time as dtime
import json

import update_market as core

MARKET = Path("market.json")
HISTORY = Path("history.json")
APP_VERSION = "5.3"
HISTORY_VERSION = "5.3-history-1"
WINDOW_START = dtime(13, 45)
WINDOW_END = dtime(14, 20)
MAX_NIFTY_AGE_MINUTES = 20
MAX_RECORDS = 520


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except Exception:
        return None


def round_or_none(value, digits=2):
    try:
        return round(float(value), digits)
    except Exception:
        return None


def selection_quality(distance_seconds):
    m = abs(int(distance_seconds)) / 60.0
    if m <= 5:
        return "EXCELLENT"
    if m <= 10:
        return "GOOD"
    return "ACCEPTABLE"


def external_ref(market, key, label):
    obj = market.get(key) or {}
    cf = (market.get("core_fetch") or {}).get(key) or {}
    return {
        "label": label,
        "price": obj.get("price"),
        "as_of_jst": obj.get("as_of_jst"),
        "provider": obj.get("provider"),
        "status": cf.get("status") or obj.get("data_status"),
        "age_minutes": cf.get("age_minutes"),
    }


def compact_horizon(forecast, day):
    h = ((forecast or {}).get("horizons") or {}).get(str(day)) or {}
    return {
        "label": h.get("label"),
        "median_return_pct": h.get("median_return_pct"),
        "q25_return_pct": h.get("q25_return_pct"),
        "q75_return_pct": h.get("q75_return_pct"),
        "median_price": h.get("median_price"),
        "q25_price": h.get("q25_price"),
        "q75_price": h.get("q75_price"),
        "historical_up_share_pct": h.get("historical_up_share_pct"),
        "sample_count": h.get("sample_count"),
        "statistical_reference": h.get("statistical_reference"),
    }


def build_record(market, now_jst, price_dt, distance_seconds):
    forecast = market.get("technical_forecast") or {}
    guide = market.get("trade_guide") or {}
    basis = market.get("technical_basis_snapshot") or {}
    return {
        "date_jst": now_jst.date().isoformat(),
        "generated_at_jst": market.get("generated_at_jst"),
        "price_as_of_jst": price_dt.isoformat(),
        "distance_from_1400_seconds": int(distance_seconds),
        "selection_quality": selection_quality(distance_seconds),
        "history_method_version": HISTORY_VERSION,
        # Keep the full NIFTY object for backward compatibility with
        # comparison_from_history() in update_market.py.
        "nifty": market.get("nifty"),
        "technical_basis_snapshot": basis,
        "trade_guide": {
            "action_code": guide.get("action_code"),
            "action_label": guide.get("action_label"),
            "market_stage_code": guide.get("market_stage_code"),
            "market_stage_label": guide.get("market_stage_label"),
            "technical_basis_used": guide.get("technical_basis_used"),
            "buy_condition_count": guide.get("buy_condition_count"),
            "buy_condition_total": guide.get("buy_condition_total"),
            "sell_condition_count": guide.get("sell_condition_count"),
            "sell_condition_total": guide.get("sell_condition_total"),
            "basis_date": guide.get("basis_date"),
            "basis_price": guide.get("basis_price"),
        },
        "forecast": {
            "basis": forecast.get("basis"),
            "basis_date": forecast.get("basis_date"),
            "basis_price": forecast.get("basis_price"),
            "basis_consistency": forecast.get("basis_consistency"),
            "1": compact_horizon(forecast, 1),
            "3": compact_horizon(forecast, 3),
            "14": compact_horizon(forecast, 14),
        },
        "usdinr": market.get("usdinr"),
        "brent": market.get("brent"),
        "india_vix": market.get("india_vix"),
        "external_reference": {
            "usdinr": external_ref(market, "usdinr", "USD/INR"),
            "brent": external_ref(market, "brent", "Brent"),
            "india_vix": {
                "label": "India VIX",
                "price": (market.get("india_vix") or {}).get("price"),
                "as_of_jst": (market.get("india_vix") or {}).get("as_of_jst"),
                "provider": (market.get("india_vix") or {}).get("provider"),
                "status": (market.get("india_vix") or {}).get("data_status"),
            },
        },
        "source_app_version": market.get("app_version"),
    }


def main():
    market = load_json(MARKET, {})
    history = load_json(HISTORY, {"schema_version": 3, "records": []})
    records = history.get("records") if isinstance(history.get("records"), list) else []

    market["app_version"] = APP_VERSION

    generated = parse_dt(market.get("generated_at_jst"))
    status = {
        "version": HISTORY_VERSION,
        "saved": False,
        "replaced_existing": False,
        "record_count": len(records),
        "date_jst": generated.date().isoformat() if generated else None,
        "message": "",
    }

    def finish(message):
        status["record_count"] = len(records)
        status["message"] = message
        market["history_1400"] = status
        am = market.get("analysis_meta")
        if not isinstance(am, dict):
            am = {}
        am["release_version"] = APP_VERSION
        am["history_method_version"] = HISTORY_VERSION
        market["analysis_meta"] = am
        history_out = {
            "schema_version": 3,
            "basis": "One representative valid NIFTY snapshot closest to 14:00 JST on regular NSE trading days",
            "policy": {
                "version": HISTORY_VERSION,
                "window_jst": "13:45-14:20",
                "selection": "smallest absolute NIFTY quote-time distance from 14:00; later quote wins an exact tie",
                "required": "regular NSE trading day + LIVE market state + fresh same-day NIFTY quote <=20 minutes old",
                "external_data": "stored as reference only; never blocks the 14:00 save",
                "synthetic_backfill": False,
            },
            "records": sorted(records, key=lambda x: x.get("date_jst", ""))[-MAX_RECORDS:],
        }
        HISTORY.write_text(json.dumps(history_out, ensure_ascii=False, indent=2), encoding="utf-8")
        MARKET.write_text(json.dumps(market, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(status, ensure_ascii=False))
        return

    if not generated:
        return finish("判定生成時刻を確認できないため14:00履歴は保存しません。")

    regular, reason = core.is_regular_nse_trading_day(generated)
    if not regular:
        return finish("NSE通常営業日ではないため14:00履歴は保存しません。")

    if not (WINDOW_START <= generated.time() <= WINDOW_END):
        return finish("14:00保存時間帯外です。")

    if (market.get("market_state") or {}).get("code") != "LIVE":
        return finish("市場状態がLIVEではないため14:00履歴は保存しません。")

    nifty = market.get("nifty") or {}
    price_dt = parse_dt(nifty.get("as_of_jst"))
    if not price_dt or price_dt.date() != generated.date():
        return finish("NIFTY現在値が当日データではないため14:00履歴は保存しません。")

    cf_nifty = (market.get("core_fetch") or {}).get("nifty") or {}
    if cf_nifty.get("status") != "fresh":
        return finish("NIFTY現在値を今回取得できていないため14:00履歴は保存しません。")

    age = cf_nifty.get("age_minutes")
    if age is None:
        try:
            age = max(0, int((generated - price_dt).total_seconds() // 60))
        except Exception:
            age = None
    if age is None or age > MAX_NIFTY_AGE_MINUTES:
        return finish("NIFTY現在値が古いため14:00履歴は保存しません。")

    target = generated.replace(hour=14, minute=0, second=0, microsecond=0)
    distance = abs((price_dt - target).total_seconds())
    rec = build_record(market, generated, price_dt, distance)

    same = next((i for i, r in enumerate(records) if r.get("date_jst") == rec["date_jst"]), None)
    should_save = False
    if same is None:
        should_save = True
    else:
        old = records[same]
        old_dist = int(old.get("distance_from_1400_seconds", 10**9))
        old_dt = parse_dt(old.get("price_as_of_jst"))
        if distance < old_dist:
            should_save = True
        elif distance == old_dist and (old_dt is None or price_dt > old_dt):
            should_save = True

    if should_save:
        if same is None:
            records.append(rec)
        else:
            records[same] = rec
            status["replaced_existing"] = True
        status["saved"] = True
        status["selected_price_as_of_jst"] = price_dt.isoformat()
        status["distance_from_1400_seconds"] = int(distance)
        status["selection_quality"] = rec["selection_quality"]
        records.sort(key=lambda x: x.get("date_jst", ""))
        status["record_count"] = len(records)
        return finish(
            ("同日候補をより14:00に近い値へ更新しました。" if status["replaced_existing"]
             else "本日の14:00代表値を保存しました。")
        )

    old = records[same]
    status["selected_price_as_of_jst"] = old.get("price_as_of_jst")
    status["distance_from_1400_seconds"] = old.get("distance_from_1400_seconds")
    status["selection_quality"] = old.get("selection_quality")
    return finish("既存の同日14:00代表値の方が14:00に近いため保持しました。")


if __name__ == "__main__":
    main()
