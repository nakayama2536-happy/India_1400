#!/usr/bin/env python3
"""v5.2 basis-consistency layer.

Runs after v5.1. It guarantees that the price, MA, RSI, MACD and
1/3/14-trading-day forecast all use one identical technical snapshot.

LIVE:
  use the current provisional technical snapshot.

Non-LIVE:
  use the latest confirmed daily close from nifty_daily_history.json.
  The current/last quote may still be displayed separately, but it is never
  mixed into the confirmed technical forecast.
"""
from pathlib import Path
import json
import math

import update_market as core
import v48_enhance as stat

MARKET = Path("market.json")
DAILY = Path("nifty_daily_history.json")
APP_VERSION = "5.2"
BASIS_VERSION = "5.2-basis-1"


def load_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return default


def valid_number(x):
    try:
        return math.isfinite(float(x))
    except Exception:
        return False


def safe_pct(a, b):
    if not valid_number(a) or not valid_number(b) or float(b) == 0:
        return None
    return (float(a) / float(b) - 1.0) * 100.0


def confirmed_snapshot(dates, vals, arrays):
    i = len(vals) - 1
    if i < 1:
        return None
    required = (
        arrays["ma5"][i], arrays["ma25"][i], arrays["ma75"][i],
        arrays["rsi"][i], arrays["hist"][i],
        arrays["ret5"][i], arrays["vol20"][i],
    )
    if any(x is None for x in required):
        return None
    price = float(vals[i])
    return {
        "date": dates[i],
        "price": price,
        "ma5": core.round_or_none(arrays["ma5"][i], 2),
        "ma25": core.round_or_none(arrays["ma25"][i], 2),
        "ma75": core.round_or_none(arrays["ma75"][i], 2),
        "rsi14": core.round_or_none(arrays["rsi"][i], 2),
        "rsi14_prev": core.round_or_none(arrays["rsi"][i - 1], 2),
        "macd_hist": core.round_or_none(arrays["hist"][i], 3),
        "macd_hist_prev": core.round_or_none(arrays["hist"][i - 1], 3),
        "ret5_pct": core.round_or_none(arrays["ret5"][i], 2),
        "vol20_annualized_pct": core.round_or_none(arrays["vol20"][i], 2),
        "price_vs_ma5_pct": core.round_or_none(safe_pct(price, arrays["ma5"][i]), 2),
        "price_vs_ma25_pct": core.round_or_none(safe_pct(price, arrays["ma25"][i]), 2),
        "price_vs_ma75_pct": core.round_or_none(safe_pct(price, arrays["ma75"][i]), 2),
        "_basis": "confirmed",
    }


def provisional_snapshot(nifty):
    p = (nifty or {}).get("provisional") or {}
    if not p.get("available"):
        return None
    keys = (
        "price", "ma5", "ma25", "ma75", "rsi14", "rsi14_prev",
        "macd_hist", "macd_hist_prev", "ret5_pct", "vol20_annualized_pct",
        "price_vs_ma5_pct", "price_vs_ma25_pct", "price_vs_ma75_pct",
    )
    snap = {k: p.get(k) for k in keys}
    if any(snap.get(k) is None for k in (
        "price", "ma5", "ma25", "ma75", "rsi14",
        "macd_hist", "ret5_pct", "vol20_annualized_pct"
    )):
        return None
    snap["date"] = p.get("date")
    snap["_basis"] = "provisional"
    return snap


def main():
    market = load_json(MARKET, {})
    daily = load_json(DAILY, {"records": []})
    recs = daily.get("records") if isinstance(daily, dict) else []

    pairs = []
    for r in recs or []:
        try:
            d = str(r.get("date"))
            v = float(r.get("close"))
            if d and math.isfinite(v) and v > 0:
                pairs.append((d, v))
        except Exception:
            pass
    pairs = sorted(dict(pairs).items())
    dates = [d for d, _ in pairs]
    vals = [v for _, v in pairs]

    market["app_version"] = APP_VERSION
    market["note"] = (
        "v5.2 reliability: forecast and three-step market stage use one "
        "time-consistent technical snapshot."
    )

    if len(vals) < 300:
        market["technical_basis_snapshot"] = {
            "available": False,
            "version": BASIS_VERSION,
            "message": "確定日足履歴不足のため基準スナップショットを作成できません。",
        }
        MARKET.write_text(json.dumps(market, ensure_ascii=False, indent=2), encoding="utf-8")
        return

    arrays = core.build_indicator_arrays(vals)
    nifty = market.get("nifty") or {}
    live = ((market.get("market_state") or {}).get("code") == "LIVE")

    snap = provisional_snapshot(nifty) if live else None
    if snap:
        basis_type = "provisional"
        basis_label = "当日暫定テクニカル（同一時点）"
        source_label = "NIFTY現在値＋確定日足"
        quote_time = nifty.get("as_of_jst")
    else:
        snap = confirmed_snapshot(dates, vals, arrays)
        basis_type = "confirmed"
        basis_label = "確定日足テクニカル（同一時点）"
        source_label = ((market.get("core_fetch") or {}).get("nifty") or {}).get("history_source") or "nifty_daily_history.json"
        quote_time = None

    if not snap:
        market["technical_basis_snapshot"] = {
            "available": False,
            "version": BASIS_VERSION,
            "message": "同一時点のテクニカル基準を作成できません。",
        }
        MARKET.write_text(json.dumps(market, ensure_ascii=False, indent=2), encoding="utf-8")
        return

    forecast = stat.technical_horizon_forecast(dates, vals, arrays, snap)
    forecast["_data_status"] = "fresh" if forecast.get("available") else "unavailable"
    forecast["basis"] = basis_label
    forecast["basis_date"] = snap.get("date")
    forecast["basis_price"] = core.round_or_none(snap.get("price"), 2)
    forecast["basis_consistency"] = "OK"
    forecast["basis_snapshot_version"] = BASIS_VERSION
    forecast["basis_source"] = source_label
    market["technical_forecast"] = forecast

    old_guide = market.get("trade_guide") or {}
    cf = market.get("core_fetch") or {}
    usd = market.get("usdinr") or {} if (cf.get("usdinr") or {}).get("status") == "fresh" else {}
    brent = market.get("brent") or {} if (cf.get("brent") or {}).get("status") == "fresh" else {}
    vix_obj = market.get("india_vix") or {}
    vix = vix_obj if vix_obj.get("data_status") == "fresh" else {}

    guide = stat.build_trade_guide(
        snap,
        forecast,
        market.get("data_quality") or {},
        usd,
        brent,
        vix,
        basis_label=basis_label,
    )
    guide["basis_date"] = snap.get("date")
    guide["basis_price"] = core.round_or_none(snap.get("price"), 2)
    guide["basis_consistency"] = "OK"
    guide["basis_snapshot_version"] = BASIS_VERSION
    for k in ("external_data_state", "external_data_note"):
        if old_guide.get(k) is not None:
            guide[k] = old_guide.get(k)
    market["trade_guide"] = guide

    market["technical_basis_snapshot"] = {
        "available": True,
        "version": BASIS_VERSION,
        "type": basis_type,
        "label": basis_label,
        "date": snap.get("date"),
        "price": core.round_or_none(snap.get("price"), 2),
        "quote_as_of_jst": quote_time,
        "source": source_label,
        "ma5": snap.get("ma5"),
        "ma25": snap.get("ma25"),
        "ma75": snap.get("ma75"),
        "rsi14": snap.get("rsi14"),
        "macd_hist": snap.get("macd_hist"),
        "ret5_pct": snap.get("ret5_pct"),
        "vol20_annualized_pct": snap.get("vol20_annualized_pct"),
        "consistency": "price / MA / RSI / MACD / forecast all use this snapshot",
    }

    ref = market.get("reference_data")
    if isinstance(ref, dict):
        ref["prediction_basis"] = {
            "date": snap.get("date"),
            "price": core.round_or_none(snap.get("price"), 2),
            "type": basis_type,
            "label": basis_label,
            "source": source_label,
            "quote_as_of_jst": quote_time,
            "consistency": "OK",
        }

    am = market.get("analysis_meta")
    if not isinstance(am, dict):
        am = {}
    am["release_version"] = APP_VERSION
    am["basis_method_version"] = BASIS_VERSION
    am["basis_principle"] = (
        "取引中は当日暫定スナップショット、時間外は最新確定日足スナップショットを使用し、"
        "価格・MA・RSI・MACD・1/3/14営業日予測を同一時点に統一。"
    )
    market["analysis_meta"] = am

    MARKET.write_text(json.dumps(market, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "app_version": market.get("app_version"),
        "basis_type": basis_type,
        "basis_date": snap.get("date"),
        "basis_price": snap.get("price"),
        "forecast_available": forecast.get("available"),
        "stage": guide.get("market_stage_label"),
        "action": guide.get("action_label"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
