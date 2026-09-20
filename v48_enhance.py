#!/usr/bin/env python3
"""v4.8 decision/forecast enhancement layer.

Runs after update_market.py. It preserves the stable v4.7 data-fetch/history core,
then adds:
- transparent three-step buy/sell guidance
- 1/3/14-trading-day technical analog forecasts
- v4.8 analysis metadata

The forecast is descriptive historical statistics, not a calibrated probability.
"""
from pathlib import Path
import json
import math
import statistics

import update_market as core

MARKET = Path("market.json")
DAILY = Path("nifty_daily_history.json")
APP_VERSION = "4.8"
METHOD_VERSION = "4.8-stat-1"
WINDOW_YEARS = 10


def technical_horizon_forecast(dates, vals, arrays, current_snapshot=None, k=40):
    if len(vals) < 300:
        return {"available": False, "message": "予測用履歴不足"}

    max_h = 14
    start_i = max(90, core.analysis_window_start_index(dates))
    last = len(vals) - 1

    def hist_feat(i):
        ma25 = arrays["ma25"][i]
        ma75 = arrays["ma75"][i]
        rsi = arrays["rsi"][i]
        hist = arrays["hist"][i]
        ret5 = arrays["ret5"][i]
        vol = arrays["vol20"][i]
        if None in (ma25, ma75, rsi, hist, ret5, vol) or not vals[i]:
            return None
        return (
            float(rsi),
            (float(vals[i]) / float(ma25) - 1.0) * 100.0,
            (float(ma25) / float(ma75) - 1.0) * 100.0,
            float(hist) / float(vals[i]) * 100.0,
            float(ret5),
            float(vol),
        )

    def snapshot_feat(snap):
        if not snap:
            return None
        price = snap.get("price")
        ma25 = snap.get("ma25")
        ma75 = snap.get("ma75")
        rsi = snap.get("rsi14")
        hist = snap.get("macd_hist")
        ret5 = snap.get("ret5_pct")
        vol = snap.get("vol20_annualized_pct")
        if None in (price, ma25, ma75, rsi, hist, ret5, vol) or not price:
            return None
        return (
            float(rsi),
            (float(price) / float(ma25) - 1.0) * 100.0,
            (float(ma25) / float(ma75) - 1.0) * 100.0,
            float(hist) / float(price) * 100.0,
            float(ret5),
            float(vol),
        )

    cur = snapshot_feat(current_snapshot) if current_snapshot else hist_feat(last)
    if cur is None:
        return {"available": False, "message": "現在の予測特徴量不足"}

    base_price = (current_snapshot or {}).get("price") if current_snapshot else vals[last]
    if base_price is None:
        base_price = vals[last]
    base_price = float(base_price)

    scales = (15.0, 3.0, 2.5, 0.5, 4.0, 8.0)
    candidates = []
    for i in range(start_i, len(vals) - max_h):
        f = hist_feat(i)
        if f is None:
            continue
        dist = math.sqrt(sum(((a - b) / scale) ** 2 for a, b, scale in zip(f, cur, scales)))
        candidates.append((dist, i))
    candidates.sort(key=lambda x: x[0])

    selected = []
    for dist, i in candidates:
        if all(abs(i - j) >= 5 for _, j in selected):
            selected.append((dist, i))
        if len(selected) >= k:
            break
    if len(selected) < 20:
        return {"available": False, "message": "直近10年の類似局面サンプル不足"}

    def quartiles(xs):
        ys = sorted(xs)
        q25 = ys[max(0, int((len(ys) - 1) * 0.25))]
        q75 = ys[max(0, int((len(ys) - 1) * 0.75))]
        return q25, q75

    def direction_label(horizon, median_ret, up_rate):
        threshold = {1: 0.15, 3: 0.35, 14: 0.80}[horizon]
        if median_ret >= threshold and up_rate >= 57:
            return "上向き"
        if median_ret <= -threshold and up_rate <= 43:
            return "下向き"
        return "中立"

    horizons = {}
    median_dist = statistics.median([d for d, _ in selected])
    for h in (1, 3, 14):
        rets = []
        paths = []
        for _, i in selected:
            r = core.pct_change(vals[i + h], vals[i])
            if r is None:
                continue
            rets.append(r)
            path = [core.pct_change(vals[j], vals[i]) for j in range(i + 1, i + h + 1)]
            path = [x for x in path if x is not None]
            if path:
                paths.append(min(path))
        if not rets:
            continue
        q25, q75 = quartiles(rets)
        med = statistics.median(rets)
        mean = statistics.fmean(rets)
        up_rate = sum(x > 0 for x in rets) / len(rets) * 100.0
        iqr = q75 - q25
        iqr_limit = {1: 3.0, 3: 5.0, 14: 10.0}[h]
        ref = "中" if len(rets) >= 30 and median_dist <= 2.0 and iqr <= iqr_limit else "低"
        horizons[str(h)] = {
            "trading_days": h,
            "label": direction_label(h, med, up_rate),
            "sample_count": len(rets),
            "sample_adequacy": core.sample_adequacy(len(rets)),
            "statistical_reference": ref,
            "median_return_pct": core.round_or_none(med, 2),
            "mean_return_pct": core.round_or_none(mean, 2),
            "q25_return_pct": core.round_or_none(q25, 2),
            "q75_return_pct": core.round_or_none(q75, 2),
            "historical_up_share_pct": core.round_or_none(up_rate, 1),
            "median_price": core.round_or_none(base_price * (1.0 + med / 100.0), 2),
            "q25_price": core.round_or_none(base_price * (1.0 + q25 / 100.0), 2),
            "q75_price": core.round_or_none(base_price * (1.0 + q75 / 100.0), 2),
            "median_max_drawdown_pct": core.round_or_none(statistics.median(paths), 2) if paths else None,
        }

    dirs = [horizons.get(str(h), {}).get("label") for h in (1, 3, 14)]
    if dirs and all(x == "上向き" for x in dirs):
        consensus = "上向き一致"
    elif dirs and all(x == "下向き" for x in dirs):
        consensus = "下向き一致"
    elif "上向き" in dirs and "下向き" in dirs:
        consensus = "方向まちまち"
    else:
        consensus = "中立混在"

    basis_label = "14:00暫定テクニカル" if (current_snapshot or {}).get("_basis") == "provisional" else "確定日足テクニカル"
    return {
        "available": len(horizons) == 3,
        "method_version": METHOD_VERSION,
        "window_years": WINDOW_YEARS,
        "basis_date": (current_snapshot or {}).get("date") or dates[last],
        "basis_price": core.round_or_none(base_price, 2),
        "basis": basis_label,
        "analog_count": len(selected),
        "median_similarity_distance": core.round_or_none(median_dist, 2),
        "consensus": consensus,
        "horizons": horizons,
        "method": "直近10年の類似テクニカル局面を使い、1・3・14営業日後の分布を集計。",
        "warning": "方向ラベルは過去類似局面の統計的な目安です。上昇割合は将来の上昇確率ではありません。1日・3日は特にノイズが大きいため参考度を低めに扱います。",
    }


def build_trade_guide(nifty, forecast, quality, usdinr=None, brent=None, vix=None, basis_label="確定日足テクニカル"):
    price = nifty.get("price")
    ma5 = nifty.get("ma5")
    ma25 = nifty.get("ma25")
    rsi = nifty.get("rsi14")
    rsi_prev = nifty.get("rsi14_prev")
    hist = nifty.get("macd_hist")
    hist_prev = nifty.get("macd_hist_prev")
    pma25 = nifty.get("price_vs_ma25_pct")

    needed = (price, ma5, ma25, rsi, rsi_prev, hist, hist_prev)
    if any(x is None for x in needed):
        return {
            "available": False,
            "decision_eligible": False,
            "action_code": "HOLD",
            "action_label": "判定保留",
            "message": "テクニカルデータ不足",
        }

    buy_conditions = [
        {"key": "low_zone", "label": "調整・低位", "met": bool(float(rsi) <= 40 or (pma25 is not None and float(pma25) <= -3)),
         "detail": f"RSI {float(rsi):.1f} / 25日線乖離 {float(pma25):+.1f}%" if pma25 is not None else f"RSI {float(rsi):.1f}"},
        {"key": "rsi_improving", "label": "RSI改善", "met": bool(float(rsi) > float(rsi_prev)),
         "detail": f"{float(rsi_prev):.1f} → {float(rsi):.1f}"},
        {"key": "macd_improving", "label": "MACD改善", "met": bool(float(hist) > float(hist_prev)),
         "detail": f"Hist {float(hist_prev):+.2f} → {float(hist):+.2f}"},
        {"key": "above_ma5", "label": "5日線回復", "met": bool(float(price) >= float(ma5)),
         "detail": f"{float(price):.0f} / MA5 {float(ma5):.0f}"},
        {"key": "above_ma25", "label": "25日線回復", "met": bool(float(price) >= float(ma25)),
         "detail": f"{float(price):.0f} / MA25 {float(ma25):.0f}"},
    ]
    buy_count = sum(1 for x in buy_conditions if x["met"])

    sell_conditions = [
        {"key": "rsi_high", "label": "RSI高位", "met": bool(float(rsi) >= 65), "detail": f"RSI {float(rsi):.1f}"},
        {"key": "ma25_extended", "label": "25日線上方乖離", "met": bool(pma25 is not None and float(pma25) >= 5),
         "detail": f"{float(pma25):+.1f}%" if pma25 is not None else "--"},
        {"key": "macd_worsening", "label": "MACD悪化", "met": bool(float(hist) < float(hist_prev)),
         "detail": f"Hist {float(hist_prev):+.2f} → {float(hist):+.2f}"},
        {"key": "below_ma5", "label": "5日線割れ", "met": bool(float(price) < float(ma5)),
         "detail": f"{float(price):.0f} / MA5 {float(ma5):.0f}"},
    ]
    sell_count = sum(1 for x in sell_conditions if x["met"])

    low_zone = buy_conditions[0]["met"]
    rsi_up = buy_conditions[1]["met"]
    macd_up = buy_conditions[2]["met"]
    above5 = buy_conditions[3]["met"]
    above25 = buy_conditions[4]["met"]
    hist_positive = float(hist) >= 0

    if sell_count >= 2 and (float(rsi) >= 65 or (pma25 is not None and float(pma25) >= 5)):
        stage_code, stage_label = "SELL_CAUTION", "売り・過熱注意"
    elif above25 and above5 and hist_positive:
        stage_code, stage_label = "TRANCHE3", "第3弾相当・中期回復"
    elif above5 and rsi_up and macd_up:
        stage_code, stage_label = "TRANCHE2", "第2弾相当・短期反転"
    elif low_zone and (rsi_up or macd_up):
        stage_code, stage_label = "TRANCHE1", "第1弾相当・反転初期"
    else:
        stage_code, stage_label = "WAIT", "待機"

    risk_factors = []
    for obj, label, change_limit, level_limit in (
        (usdinr or {}, "USD/INR", 1.0, 100.0),
        (brent or {}, "Brent", 5.0, 110.0),
        (vix or {}, "India VIX", 20.0, 20.0),
    ):
        ch = obj.get("change_5d_pct")
        level = obj.get("price")
        if ch is not None and float(ch) >= change_limit:
            risk_factors.append(f"{label} 5日 +{float(ch):.1f}%")
        elif level is not None and float(level) >= level_limit:
            risk_factors.append(f"{label} {float(level):.1f}")

    h14 = ((forecast or {}).get("horizons") or {}).get("14") or {}
    h3 = ((forecast or {}).get("horizons") or {}).get("3") or {}
    forecast_headwind = h14.get("label") == "下向き"
    forecast_tailwind = h14.get("label") == "上向き" and h3.get("label") != "下向き"

    gate = (quality or {}).get("decision_gate") or {}
    eligible = bool(gate.get("allow_rule"))
    caution = bool(risk_factors) or forecast_headwind

    if not eligible:
        action_code, action_label = "HOLD", "判定保留"
    elif stage_code == "SELL_CAUTION":
        action_code, action_label = stage_code, "売り・利益確定を点検"
    elif stage_code == "TRANCHE3":
        action_code, action_label = stage_code, "第3弾候補" + ("（慎重）" if caution else "")
    elif stage_code == "TRANCHE2":
        action_code, action_label = stage_code, "第2弾候補" + ("（慎重）" if caution else "")
    elif stage_code == "TRANCHE1":
        action_code, action_label = stage_code, "第1弾候補" + ("（慎重）" if caution else "")
    else:
        action_code, action_label = "WAIT", "待機"

    reasons = []
    for x in buy_conditions:
        if x["met"]:
            reasons.append(f"○ {x['label']}：{x['detail']}")
    for x in sell_conditions:
        if x["met"] and len(reasons) < 5:
            reasons.append(f"△ {x['label']}：{x['detail']}")
    if forecast_headwind and len(reasons) < 5:
        reasons.append("△ 14営業日予測が下向き")
    elif forecast_tailwind and len(reasons) < 5:
        reasons.append("○ 14営業日予測が上向き")
    if risk_factors and len(reasons) < 5:
        reasons.append("△ 外部環境警戒：" + " / ".join(risk_factors[:2]))

    return {
        "available": True,
        "decision_eligible": eligible,
        "action_code": action_code,
        "action_label": action_label,
        "market_stage_code": stage_code,
        "market_stage_label": stage_label,
        "technical_basis_used": basis_label,
        "buy_condition_count": buy_count,
        "buy_condition_total": len(buy_conditions),
        "sell_condition_count": sell_count,
        "sell_condition_total": len(sell_conditions),
        "buy_conditions": buy_conditions,
        "sell_conditions": sell_conditions,
        "external_risk": "CAUTION" if risk_factors else "NORMAL",
        "external_risk_factors": risk_factors,
        "forecast_consensus": (forecast or {}).get("consensus") or "--",
        "forecast_14d_label": h14.get("label"),
        "caution": caution,
        "reasons": reasons[:5],
        "rule_note": "3分割の市場段階を示す目安です。実際の注文は、既に実施した購入段階・資金配分・投信締切を確認して決定してください。",
    }


def load_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return default


def main():
    market = load_json(MARKET, {})
    daily = load_json(DAILY, {"records": []})

    market["app_version"] = APP_VERSION
    market["note"] = "v4.8 decision-focused: three-step buy/sell guidance plus 1/3/14-trading-day technical statistical forecasts. Scores remain audit-only; the primary UI shows transparent conditions and data-quality gating."

    try:
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

        nifty_fetch = ((market.get("core_fetch") or {}).get("nifty") or {})
        contiguous = bool(nifty_fetch.get("history_recent_contiguous"))
        nifty_fresh = nifty_fetch.get("status") == "fresh"

        if not (nifty_fresh and contiguous and len(vals) >= 300):
            market["technical_forecast"] = {
                "available": False,
                "message": "NIFTY最新値または日足履歴の品質条件未達のため1・3・14営業日予測を保留",
            }
            market["trade_guide"] = {
                "available": False,
                "decision_eligible": False,
                "action_code": "HOLD",
                "action_label": "判定保留",
                "message": "データ品質条件未達",
            }
        else:
            arrays = core.build_indicator_arrays(vals)
            n = market.get("nifty") or {}
            p = n.get("provisional") or {}
            live = ((market.get("market_state") or {}).get("code") == "LIVE")

            if live and p.get("available"):
                score_nifty = dict(n)
                for k in (
                    "price", "ma5", "ma25", "ma75", "rsi14", "rsi14_prev",
                    "macd", "macd_signal", "macd_hist", "macd_hist_prev",
                    "ret5_pct", "vol20_annualized_pct",
                    "price_vs_ma5_pct", "price_vs_ma25_pct", "price_vs_ma75_pct",
                ):
                    score_nifty[k] = p.get(k)
                basis = "14:00暫定テクニカル"
                snap_date = p.get("date")
                snap_basis = "provisional"
            elif nifty_fetch.get("technical_status") == "cached":
                score_nifty = n
                basis = "前回保存の確定日足テクニカル"
                snap_date = n.get("technical_date")
                snap_basis = "confirmed"
            else:
                score_nifty = n
                basis = "確定日足テクニカル"
                snap_date = n.get("technical_date")
                snap_basis = "confirmed"

            snapshot = dict(score_nifty)
            snapshot["date"] = snap_date
            snapshot["_basis"] = snap_basis

            forecast = technical_horizon_forecast(dates, vals, arrays, snapshot)
            forecast["_data_status"] = "fresh"
            market["technical_forecast"] = forecast

            cf = market.get("core_fetch") or {}
            usd = market.get("usdinr") or {} if (cf.get("usdinr") or {}).get("status") == "fresh" else {}
            brent = market.get("brent") or {} if (cf.get("brent") or {}).get("status") == "fresh" else {}
            vix_obj = market.get("india_vix") or {}
            vix = vix_obj if vix_obj.get("data_status") == "fresh" else {}

            market["trade_guide"] = build_trade_guide(
                score_nifty,
                forecast,
                market.get("data_quality") or {},
                usd,
                brent,
                vix,
                basis_label=basis,
            )

        market["analysis_meta"] = {
            "method_version": METHOD_VERSION,
            "window_years": WINDOW_YEARS,
            "principle": "14:00暫定値と確定日足を分離。売買目安は透明な条件判定、短期予測は直近10年の類似局面による1・3・14営業日分布。",
        }
        if isinstance(market.get("data_lineage"), dict):
            market["data_lineage"]["analytics_method_version"] = METHOD_VERSION
            market["data_lineage"]["analytics_window_years"] = WINDOW_YEARS

    except Exception as e:
        market["technical_forecast"] = {
            "available": False,
            "message": "v4.8予測処理エラー",
            "error": str(e),
        }
        market["trade_guide"] = {
            "available": False,
            "decision_eligible": False,
            "action_code": "HOLD",
            "action_label": "判定保留",
            "message": "v4.8判断処理エラー",
        }
        market["v48_enhancer_error"] = str(e)

    MARKET.write_text(json.dumps(market, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "app_version": market.get("app_version"),
        "forecast_available": (market.get("technical_forecast") or {}).get("available"),
        "trade_action": (market.get("trade_guide") or {}).get("action_label"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
