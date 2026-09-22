#!/usr/bin/env python3
"""v5.4 fixed market/data-state classification layer.

Adds stable user-facing classifications without changing the raw fetch state:
Market: LIVE / POST_CLOSE_PENDING / CONFIRMED / CLOSED / DATA_ERROR
Data:   LATEST / REFERENCE / STALE / UNAVAILABLE
"""
from __future__ import annotations

from pathlib import Path
from datetime import datetime, time as dtime
import json

import update_market as core

MARKET = Path("market.json")
APP_VERSION = "5.4"
STATUS_VERSION = "5.4-status-1"


def load_json(path, default):
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


def age_minutes(generated, as_of):
    g, a = parse_dt(generated), parse_dt(as_of)
    if not g or not a:
        return None
    try:
        return max(0, int((g - a).total_seconds() // 60))
    except Exception:
        return None


def data_class(code, note=None):
    labels = {
        "LATEST": "最新",
        "REFERENCE": "参考",
        "STALE": "古い",
        "UNAVAILABLE": "利用不可",
    }
    return {"code": code, "label": labels[code], "note": note}


def main():
    market = load_json(MARKET, {})
    generated = market.get("generated_at_jst")
    now = parse_dt(generated)
    raw = market.get("market_state") or {}
    q = market.get("data_quality") or {}
    cf = market.get("core_fetch") or {}
    nifty = market.get("nifty") or {}
    nf = cf.get("nifty") or {}
    tech_date = nifty.get("technical_date") or nf.get("technical_date") or nf.get("history_cache_last_date")

    market["app_version"] = APP_VERSION
    market["note"] = "v5.4 reliability: fixed market-state and data-freshness classifications."

    regular = False
    regular_reason = None
    if now:
        try:
            regular, regular_reason = core.is_regular_nse_trading_day(now)
        except Exception:
            regular = False
            regular_reason = "calendar_check_error"

    critical = list(q.get("critical_reasons") or [])
    nifty_status = nf.get("status")
    hist_ok = nf.get("history_recent_contiguous")
    data_error = False
    error_reasons = []

    if not tech_date:
        data_error = True
        error_reasons.append("NIFTY確定日足の日付を確認できません。")
    if hist_ok is False:
        data_error = True
        error_reasons.append("NIFTY日足履歴の連続性を確認できません。")
    if raw.get("code") == "LIVE" and nifty_status != "fresh":
        data_error = True
        error_reasons.append("取引中のNIFTY現在値を取得できません。")
    if raw.get("code") == "LIVE" and critical:
        data_error = True
        error_reasons.extend(x for x in critical if x not in error_reasons)

    if data_error:
        op_code, op_label = "DATA_ERROR", "データ異常"
        detail = " / ".join(error_reasons[:3]) or "判断に必要なNIFTYデータを確認できません。"
    elif raw.get("code") == "LIVE":
        op_code, op_label = "LIVE", "取引中"
        detail = raw.get("detail") or "NSE通常取引時間中です。"
    elif not regular:
        op_code, op_label = "CLOSED", "休場"
        detail = raw.get("detail") or (regular_reason or "NSE休場日です。")
    else:
        today = now.date().isoformat() if now else None
        after_close = bool(now and now.time() >= dtime(19, 0))
        if after_close and tech_date != today:
            op_code, op_label = "POST_CLOSE_PENDING", "引け後・終値確定待ち"
            detail = f"NSEは引けていますが、確定日足は {tech_date or '--'} のままです。"
        else:
            op_code, op_label = "CONFIRMED", "確定済"
            if tech_date == today:
                detail = f"{today} の確定日足を利用できます。"
            else:
                detail = f"最新確定日足 {tech_date or '--'} を利用しています。"

    market["operational_state"] = {
        "version": STATUS_VERSION,
        "code": op_code,
        "label": op_label,
        "detail": detail,
        "raw_code": raw.get("code"),
        "raw_label": raw.get("label"),
        "regular_trading_day": regular,
        "technical_date": tech_date,
    }

    # Normalize data status into exactly four user-facing classes.
    data_states = {}

    nifty_age = age_minutes(generated, nifty.get("as_of_jst"))
    if nifty_status != "fresh" or not nifty.get("as_of_jst"):
        data_states["nifty_current"] = data_class("UNAVAILABLE", "NIFTY現在値を今回取得できていません。")
    elif op_code == "LIVE":
        if nifty_age is not None and nifty_age <= 20:
            data_states["nifty_current"] = data_class("LATEST", "取引中の判断主体")
        else:
            data_states["nifty_current"] = data_class("STALE", "取引中の判断には古い値")
    elif op_code == "POST_CLOSE_PENDING":
        data_states["nifty_current"] = data_class("REFERENCE", "引け後の最終取得値・終値確定待ち")
    else:
        data_states["nifty_current"] = data_class("REFERENCE", "直近セッションの取得値")

    if tech_date:
        data_states["nifty_confirmed"] = data_class("LATEST", f"最新確定日足 {tech_date}")
    else:
        data_states["nifty_confirmed"] = data_class("UNAVAILABLE", "確定日足なし")

    prov = nifty.get("provisional") or {}
    if op_code == "LIVE":
        if prov.get("available") and data_states["nifty_current"]["code"] == "LATEST":
            data_states["nifty_provisional"] = data_class("LATEST", "当日暫定テクニカル")
        else:
            data_states["nifty_provisional"] = data_class("UNAVAILABLE", "当日暫定テクニカルを利用できません。")
    else:
        data_states["nifty_provisional"] = data_class("UNAVAILABLE", "取引時間外は暫定値を使用しません。")

    for key, label in (("usdinr", "USD/INR"), ("brent", "Brent")):
        obj = market.get(key) or {}
        src = cf.get(key) or {}
        a = src.get("age_minutes")
        if a is None:
            a = age_minutes(generated, obj.get("as_of_jst"))
        if src.get("status") != "fresh" or obj.get("price") is None:
            data_states[key] = data_class("UNAVAILABLE", f"{label}を今回取得できていません。")
        elif a is None:
            data_states[key] = data_class("REFERENCE", f"{label}の時刻差を算出できません。")
        elif a <= 60:
            data_states[key] = data_class("LATEST", f"{a}分前")
        elif a <= 720:
            data_states[key] = data_class("REFERENCE", f"{a}分前")
        else:
            data_states[key] = data_class("STALE", f"{a}分前")

    vix = market.get("india_vix") or {}
    va = age_minutes(generated, vix.get("as_of_jst"))
    if vix.get("data_status") not in (None, "fresh") or vix.get("price") is None:
        data_states["india_vix"] = data_class("UNAVAILABLE", "India VIXを今回取得できていません。")
    elif va is None:
        data_states["india_vix"] = data_class("REFERENCE", "時刻差を算出できません。")
    elif va <= 60:
        data_states["india_vix"] = data_class("LATEST", f"{va}分前")
    elif va <= 720:
        data_states["india_vix"] = data_class("REFERENCE", f"{va}分前")
    else:
        data_states["india_vix"] = data_class("STALE", f"{va}分前")

    codes = [x["code"] for x in data_states.values()]
    if op_code == "DATA_ERROR" or data_states["nifty_confirmed"]["code"] == "UNAVAILABLE":
        quality_code, quality_label = "UNAVAILABLE", "利用不可"
    elif op_code == "LIVE" and data_states["nifty_current"]["code"] == "STALE":
        quality_code, quality_label = "STALE", "データ古い"
    elif "STALE" in codes or "UNAVAILABLE" in codes or "REFERENCE" in codes:
        quality_code, quality_label = "PARTIAL", "一部参考"
    else:
        quality_code, quality_label = "OK", "正常"

    market["quality_state"] = {
        "version": STATUS_VERSION,
        "code": quality_code,
        "label": quality_label,
        "data": data_states,
        "principle": "NIFTY判断主体と外部参考データを分離し、最新・参考・古い・利用不可の4分類で表示。",
    }

    # Rewrite reference-data freshness into the same four categories.
    ref = market.get("reference_data")
    if isinstance(ref, dict):
        for item in ref.get("items") or []:
            key = item.get("key")
            if key == "generated":
                item["freshness"] = "最新"
                item["freshness_code"] = "LATEST"
                item["status_note"] = "判定生成時刻"
            elif key in data_states:
                ds = data_states[key]
                item["freshness"] = ds["label"]
                item["freshness_code"] = ds["code"]
                item["status_note"] = ds.get("note")
            elif key == "nifty_confirmed":
                ds = data_states["nifty_confirmed"]
                item["freshness"] = ds["label"]
                item["freshness_code"] = ds["code"]
                item["status_note"] = ds.get("note")
            elif key == "nifty_provisional":
                ds = data_states["nifty_provisional"]
                item["freshness"] = ds["label"]
                item["freshness_code"] = ds["code"]
                item["status_note"] = ds.get("note")
        ref["status_version"] = STATUS_VERSION
        ref["freshness_classes"] = ["最新", "参考", "古い", "利用不可"]

    am = market.get("analysis_meta")
    if not isinstance(am, dict):
        am = {}
    am["release_version"] = APP_VERSION
    am["status_method_version"] = STATUS_VERSION
    market["analysis_meta"] = am

    MARKET.write_text(json.dumps(market, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "app_version": APP_VERSION,
        "operational_state": market["operational_state"],
        "quality_state": market["quality_state"]["label"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
