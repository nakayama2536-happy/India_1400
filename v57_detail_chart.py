#!/usr/bin/env python3
"""v5.7 detailed NIFTY candlestick chart layer.

Builds a compact, free-data OHLC cache for the detailed chart.
Primary source: Tickjournal public NIFTY 50 YTD table.
Fallback/gap fill: Yahoo Finance public daily chart when reachable.
The trading-decision core remains independent of this optional chart data.
"""
from __future__ import annotations

from pathlib import Path
from datetime import datetime, timezone, time as dtime
import json
import math
import re

import update_market as core

MARKET = Path("market.json")
OHLC = Path("nifty_ohlc_history.json")
APP_VERSION = "5.7"
CHART_VERSION = "5.7-candle-1"
KEEP_RECORDS = 260
DISPLAY_RECORDS = 60


def load_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return default


def valid(x):
    try:
        return math.isfinite(float(x))
    except Exception:
        return False


def rnd(x, digits=2):
    return round(float(x), digits) if valid(x) else None


def parse_tickjournal_ohlc():
    text = core.http_text(
        core.TICKJOURNAL_NIFTY_HISTORY,
        tries=2,
        timeout=30,
        headers={"Accept": "text/html,application/xhtml+xml,*/*", "Referer": "https://tickjournal.com/"},
    )
    plain = core._plain_html(text)
    pat = re.compile(
        r"(20\d{2}-\d{2}-\d{2})\s+"
        r"([0-9][0-9,]*(?:\.[0-9]+)?)\s+"
        r"([0-9][0-9,]*(?:\.[0-9]+)?)\s+"
        r"([0-9][0-9,]*(?:\.[0-9]+)?)\s+"
        r"([0-9][0-9,]*(?:\.[0-9]+)?)\s+"
        r"([0-9][0-9,]*(?:\.[0-9]+)?)"
    )
    out = {}
    for m in pat.finditer(plain):
        day = m.group(1)
        try:
            o, h, l, c, vol = [float(m.group(i).replace(",", "")) for i in range(2, 7)]
        except Exception:
            continue
        if not all(1000 <= x <= 100000 for x in (o, h, l, c)):
            continue
        if h < max(o, c, l) or l > min(o, c, h):
            continue
        out[day] = {
            "date": day,
            "open": rnd(o),
            "high": rnd(h),
            "low": rnd(l),
            "close": rnd(c),
            "volume": rnd(vol, 0),
            "source": "Tickjournal NIFTY 50 daily YTD",
        }
    if len(out) < 80:
        raise RuntimeError(f"Tickjournal OHLC too short ({len(out)} rows)")
    return out


def parse_yahoo_ohlc():
    chart = core.yahoo_chart("^NSEI", "6mo", "1d")
    ts = chart.get("timestamp") or []
    quote = ((chart.get("indicators") or {}).get("quote") or [{}])[0]
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []
    now_ist = datetime.now(core.IST)
    out = {}
    for i, t in enumerate(ts):
        if i >= len(closes):
            continue
        vals = [
            opens[i] if i < len(opens) else None,
            highs[i] if i < len(highs) else None,
            lows[i] if i < len(lows) else None,
            closes[i],
        ]
        if not all(valid(x) for x in vals):
            continue
        dt = datetime.fromtimestamp(int(t), timezone.utc).astimezone(core.IST)
        if dt.date() == now_ist.date() and now_ist.time() < dtime(16, 0):
            continue
        o, h, l, c = [float(x) for x in vals]
        if not all(1000 <= x <= 100000 for x in (o, h, l, c)):
            continue
        out[dt.date().isoformat()] = {
            "date": dt.date().isoformat(),
            "open": rnd(o),
            "high": rnd(h),
            "low": rnd(l),
            "close": rnd(c),
            "volume": rnd(volumes[i], 0) if i < len(volumes) and valid(volumes[i]) else None,
            "source": "Yahoo Finance daily fallback",
        }
    if len(out) < 20:
        raise RuntimeError(f"Yahoo OHLC too short ({len(out)} rows)")
    return out


def rolling_mean(vals, window):
    out = []
    total = 0.0
    q = []
    for x in vals:
        q.append(float(x))
        total += float(x)
        if len(q) > window:
            total -= q.pop(0)
        out.append(total / window if len(q) == window else None)
    return out


def main():
    market = load_json(MARKET, {})
    old = load_json(OHLC, {"schema_version": 1, "records": []})
    merged = {
        str(r.get("date")): r
        for r in (old.get("records") if isinstance(old, dict) else []) or []
        if isinstance(r, dict) and r.get("date")
    }
    reports = []

    try:
        rows = parse_tickjournal_ohlc()
        merged.update(rows)
        reports.append({
            "source": "Tickjournal",
            "status": "ok",
            "rows": len(rows),
            "last_date": max(rows) if rows else None,
        })
    except Exception as e:
        reports.append({"source": "Tickjournal", "status": "error", "error": str(e)})

    latest_confirmed = (market.get("nifty") or {}).get("technical_date")
    latest_ohlc = max(merged) if merged else None
    need_fallback = len(merged) < 80 or (
        latest_confirmed and (not latest_ohlc or latest_ohlc < latest_confirmed)
    )

    if need_fallback:
        try:
            rows = parse_yahoo_ohlc()
            # Yahoo is gap-fill only; the primary public table wins on duplicate dates.
            for day, row in rows.items():
                merged.setdefault(day, row)
            reports.append({
                "source": "Yahoo Finance",
                "status": "ok",
                "rows": len(rows),
                "last_date": max(rows) if rows else None,
            })
        except Exception as e:
            reports.append({"source": "Yahoo Finance", "status": "error", "error": str(e)})

    records = [merged[k] for k in sorted(merged)][-KEEP_RECORDS:]
    OHLC.write_text(json.dumps({
        "schema_version": 1,
        "method_version": CHART_VERSION,
        "basis": "NIFTY daily OHLC for optional detailed chart only",
        "records": records,
        "source_reports": reports,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    candles = []
    if len(records) >= 80:
        closes = [float(r["close"]) for r in records]
        ma5 = rolling_mean(closes, 5)
        ma25 = rolling_mean(closes, 25)
        ma75 = rolling_mean(closes, 75)
        start = max(0, len(records) - DISPLAY_RECORDS)
        for i in range(start, len(records)):
            r = records[i]
            candles.append({
                "date": r["date"],
                "open": r["open"],
                "high": r["high"],
                "low": r["low"],
                "close": r["close"],
                "ma5": rnd(ma5[i]),
                "ma25": rnd(ma25[i]),
                "ma75": rnd(ma75[i]),
                "source": r.get("source"),
            })

    latest_ohlc = records[-1]["date"] if records else None
    lag_days = None
    if latest_confirmed and latest_ohlc:
        try:
            lag_days = (
                datetime.strptime(latest_confirmed, "%Y-%m-%d").date()
                - datetime.strptime(latest_ohlc, "%Y-%m-%d").date()
            ).days
        except Exception:
            lag_days = None

    market["app_version"] = APP_VERSION
    market["detail_chart"] = {
        "available": len(candles) >= 30,
        "method_version": CHART_VERSION,
        "type": "daily_candlestick",
        "display_trading_days": DISPLAY_RECORDS,
        "latest_ohlc_date": latest_ohlc,
        "latest_confirmed_date": latest_confirmed,
        "lag_calendar_days": lag_days,
        "candles": candles,
        "source_reports": reports,
        "note": (
            "詳細確認用の日足OHLCです。売買判定ロジックはこの任意チャートの取得成否に依存しません。"
            if candles else
            "OHLC履歴を取得できないため詳細ローソク足は一時的に表示できません。"
        ),
    }

    am = market.get("analysis_meta")
    if not isinstance(am, dict):
        am = {}
    am["release_version"] = APP_VERSION
    am["detail_chart_version"] = CHART_VERSION
    market["analysis_meta"] = am

    MARKET.write_text(json.dumps(market, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "app_version": APP_VERSION,
        "detail_chart_available": market["detail_chart"]["available"],
        "candles": len(candles),
        "latest_ohlc_date": latest_ohlc,
        "latest_confirmed_date": latest_confirmed,
        "reports": reports,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
