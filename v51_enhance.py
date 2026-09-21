#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from datetime import datetime
import json

MARKET = Path("market.json")
APP_VERSION = "5.1"
DECISION_GATE_VERSION = "5.1-gate-1"


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


def age_minutes(generated_at, as_of):
    g = parse_dt(generated_at)
    a = parse_dt(as_of)
    if not g or not a:
        return None
    try:
        return max(0, int((g - a).total_seconds() // 60))
    except Exception:
        return None


def freshness_label(age, role):
    if age is None:
        return "日付基準"
    if role == "判断主体":
        if age <= 20:
            return "最新"
        if age <= 60:
            return "やや遅延"
        return "要確認"
    if age <= 60:
        return "最新"
    if age <= 720:
        return "参考"
    return "古い"


def action_from_stage(stage_code, caution=False):
    if stage_code == "SELL_CAUTION":
        return "SELL_CAUTION", "売り・利益確定を点検"
    if stage_code == "TRANCHE3":
        return "TRANCHE3", "第3弾候補" + ("（慎重）" if caution else "")
    if stage_code == "TRANCHE2":
        return "TRANCHE2", "第2弾候補" + ("（慎重）" if caution else "")
    if stage_code == "TRANCHE1":
        return "TRANCHE1", "第1弾候補" + ("（慎重）" if caution else "")
    return "WAIT", "待機"


def main():
    market = load_json(MARKET, {})
    market["app_version"] = APP_VERSION
    market["note"] = (
        "v5.1 decision-focused: NIFTY-critical decision gate, clear reference timestamps, "
        "provisional-vs-confirmed display support, and mobile forecast cards."
    )

    generated = market.get("generated_at_jst")
    ms = market.get("market_state") or {}
    q = market.get("data_quality") or {}
    cf = market.get("core_fetch") or {}
    nifty = market.get("nifty") or {}
    prov = nifty.get("provisional") or {}
    nf = cf.get("nifty") or {}

    critical_reasons = []
    external_warnings = []

    nifty_core = cf.get("nifty") or {}
    nifty_age = nifty_core.get("age_minutes")
    if nifty_age is None:
        nifty_age = age_minutes(generated, nifty.get("as_of_jst"))

    if ms.get("code") == "LIVE":
        if nifty_core.get("status") != "fresh":
            critical_reasons.append("NIFTY現在値を今回取得できていません。")
        if nifty_age is None or nifty_age > 20:
            critical_reasons.append("NIFTY現在値の時刻が古いため最新判断を保留します。")
        if not prov.get("available"):
            critical_reasons.append("本日暫定テクニカルを算出できていません。")
        if nf.get("history_recent_contiguous") is False:
            critical_reasons.append("NIFTY日足履歴の連続性を確認できません。")
        if q.get("official_holiday_calendar_loaded") is False:
            critical_reasons.append("公式休場日カレンダーを確認できません。")

        for key, label in (("usdinr", "USD/INR"), ("brent", "Brent")):
            src = cf.get(key) or {}
            obj = market.get(key) or {}
            age = src.get("age_minutes")
            if age is None:
                age = age_minutes(generated, obj.get("as_of_jst"))
            if src.get("status") != "fresh":
                external_warnings.append(f"{label}は今回取得できていないため参考外です。")
            elif age is not None and age > 120:
                h, m = divmod(age, 60)
                age_txt = f"{h}時間{m}分前" if h else f"{m}分前"
                external_warnings.append(f"{label}は{age_txt}の値のため外部参考値として扱います。")

        vix = market.get("india_vix") or {}
        vix_age = age_minutes(generated, vix.get("as_of_jst"))
        if vix.get("data_status") not in (None, "fresh"):
            external_warnings.append("India VIXは今回取得できていないため参考外です。")
        elif vix_age is not None and vix_age > 120:
            h, m = divmod(vix_age, 60)
            age_txt = f"{h}時間{m}分前" if h else f"{m}分前"
            external_warnings.append(f"India VIXは{age_txt}の値のため外部参考値として扱います。")

        if critical_reasons:
            q["freshness"] = "STALE"
            q["decision_gate"] = {
                "code": "HOLD",
                "label": "売買ルール判定保留",
                "allow_rule": False,
            }
            q["reasons"] = critical_reasons + external_warnings
        else:
            q["freshness"] = "PARTIAL" if external_warnings else "FRESH"
            q["decision_gate"] = {
                "code": "READY",
                "label": "売買ルール判定可",
                "allow_rule": True,
            }
            q["reasons"] = (
                external_warnings
                + ["NIFTY現在値・日足履歴・本日暫定テクニカルは判定に使用できます。"]
                if external_warnings
                else ["NIFTY判断データは最新状態です。"]
            )
    else:
        # 休場・時間外は従来どおり注文判断を保留する。
        q["decision_gate"] = {
            "code": "HOLD",
            "label": "売買ルール判定保留",
            "allow_rule": False,
        }

    q["decision_scope"] = (
        "売買段階の可否はNIFTY現在値・日足履歴・暫定テクニカルを必須とし、"
        "USD/INR・Brent・India VIXは外部環境の警戒フィルターとして扱います。"
    )
    q["critical_reasons"] = critical_reasons
    q["external_data_warnings"] = external_warnings
    market["data_quality"] = q

    guide = market.get("trade_guide") or {}
    if ms.get("code") == "LIVE" and not critical_reasons and guide.get("available"):
        guide["decision_eligible"] = True
        risk_caution = guide.get("external_risk") == "CAUTION" or bool(guide.get("caution"))
        code, label = action_from_stage(guide.get("market_stage_code"), risk_caution)
        guide["action_code"] = code
        guide["action_label"] = label
    elif critical_reasons and guide:
        guide["decision_eligible"] = False
        guide["action_code"] = "HOLD"
        guide["action_label"] = "判定保留"

    if external_warnings:
        guide["external_data_state"] = "PARTIAL"
        guide["external_data_note"] = " / ".join(external_warnings)
    else:
        guide["external_data_state"] = "OK"
        guide["external_data_note"] = "外部環境データも確認済みです。"
    market["trade_guide"] = guide

    def ref_item(key, label, obj, role, basis=None, date_only=None, provider=None):
        as_of = (obj or {}).get("as_of_jst")
        age = age_minutes(generated, as_of)
        return {
            "key": key,
            "label": label,
            "role": role,
            "as_of_jst": as_of,
            "date": date_only,
            "provider": provider or (obj or {}).get("provider"),
            "age_minutes": age,
            "freshness": freshness_label(age, role),
            "basis": basis,
        }

    refs = []
    refs.append({
        "key": "generated",
        "label": "判定生成",
        "role": "生成時刻",
        "as_of_jst": generated,
        "date": None,
        "provider": "GitHub Actions",
        "age_minutes": 0,
        "freshness": "生成",
        "basis": "この画面の判定を生成した時刻",
    })
    refs.append(ref_item(
        "nifty_current", "NIFTY現在値", nifty, "判断主体",
        basis="現在値", provider=nifty.get("provider")
    ))
    if prov.get("available"):
        refs.append({
            "key": "nifty_provisional",
            "label": "本日テクニカル",
            "role": "判断主体",
            "as_of_jst": nifty.get("as_of_jst"),
            "date": prov.get("date"),
            "provider": "NIFTY現在値＋確定日足",
            "age_minutes": age_minutes(generated, nifty.get("as_of_jst")),
            "freshness": freshness_label(age_minutes(generated, nifty.get("as_of_jst")), "判断主体"),
            "basis": "本日価格を終値と仮定した暫定計算",
        })
    refs.append({
        "key": "nifty_confirmed",
        "label": "NIFTY確定日足",
        "role": "基準履歴",
        "as_of_jst": None,
        "date": nifty.get("technical_date") or nf.get("history_cache_last_date"),
        "provider": nf.get("history_source"),
        "age_minutes": None,
        "freshness": "前営業日確定",
        "basis": "移動平均・RSI・MACDの確定基準",
    })
    refs.append(ref_item("usdinr", "USD/INR", market.get("usdinr") or {}, "外部参考"))
    refs.append(ref_item("brent", "Brent", market.get("brent") or {}, "外部参考"))
    refs.append(ref_item("india_vix", "India VIX", market.get("india_vix") or {}, "外部参考"))

    market["reference_data"] = {
        "version": "5.1-ref-1",
        "generated_at_jst": generated,
        "items": refs,
        "note": "時刻はすべてJST。NIFTYを判断主体、為替・原油・VIXを外部参考として表示します。",
    }

    am = market.get("analysis_meta")
    if not isinstance(am, dict):
        am = {}
    am["decision_gate_version"] = DECISION_GATE_VERSION
    am["release_version"] = APP_VERSION
    market["analysis_meta"] = am

    MARKET.write_text(json.dumps(market, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "app_version": market.get("app_version"),
        "decision_gate": (market.get("data_quality") or {}).get("decision_gate"),
        "external_warnings": external_warnings,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
