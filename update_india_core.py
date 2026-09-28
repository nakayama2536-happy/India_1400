#!/usr/bin/env python3
"""Official-first fund snapshot; bounded history fetches; no trading-rule changes."""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta
import html
import json
import math
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

OUT = Path("india_core.json")
HISTORY_OUT = Path("india_core_history.json")
JST = ZoneInfo("Asia/Tokyo")
OFFICIAL_URL = "https://www.eastspring.co.jp/funds/fund-listings/fund-details?isincode=200027"
SBI_URL = "https://site0.sbisec.co.jp/marble/fund/history/standardprice.do?fund_sec_code=83311227"
YAHOO_HISTORY_URL = "https://finance.yahoo.co.jp/quote/83311227/history"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"
OFFICIAL = "イーストスプリング公式"
SBI = "SBI証券"
YAHOO = "Yahoo!ファイナンス"
FUND_KEY = "eastspring_india_core"
FUND_NAME = "イーストスプリング・インド・コア株式ファンド"


def fetch_text(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "ja,en-US;q=0.8,en;q=0.7",
    })
    with urllib.request.urlopen(req, timeout=20) as response:
        raw = response.read(4_000_001)
        encoding = response.headers.get_content_charset()
    if len(raw) > 4_000_000:
        raise ValueError("source response exceeds size limit")
    for enc in [encoding, "utf-8", "cp932", "shift_jis", "euc_jp"]:
        if enc:
            try:
                return raw.decode(enc)
            except (UnicodeError, LookupError):
                pass
    raise ValueError("source encoding is unrecognized")


def strip_html(src):
    text = re.sub(r"(?is)<script.*?</script>|<style.*?</style>", " ", src)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"(?is)<[^>]+>", " ", text))).strip()


def parse_official_snapshot(text):
    if FUND_NAME not in text:
        raise ValueError("official fund identity not found")
    patterns = [r"更新日[:：]?\s*(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日",
                r"基準価額\s*[（(]円[）)]\s*([0-9][0-9,]*)",
                r"前日比\s*[（(]円[）)]\s*([+\-−]?[0-9][0-9,]*)",
                r"純資産総額\s*[（(]億円[）)]\s*([0-9][0-9,.]*)"]
    matches = [re.search(p, text) for p in patterns]
    if not all(matches):
        raise ValueError("official snapshot fields not found")
    d, nav, change, assets = matches
    value = lambda m: m.group(1).replace(",", "").replace("−", "-")
    return {"date": date(*map(int, d.groups())).isoformat(), "nav_yen": int(value(nav)),
            "change_yen": int(value(change)), "net_assets_million_yen": int(round(float(value(assets)) * 100))}


def parse_rows(text):
    pattern = re.compile(r"(20\d{2}/\d{2}/\d{2})\s+([0-9][0-9,]*)円\s+([+\-−]?[0-9][0-9,]*)円\s+([0-9][0-9,]*)百万円")
    rows = [{"date": m[1].replace("/", "-"), "nav_yen": int(m[2].replace(",", "")),
             "change_yen": int(m[3].replace(",", "").replace("−", "-")),
             "net_assets_million_yen": int(m[4].replace(",", ""))} for m in pattern.finditer(text)]
    if not rows:
        raise ValueError("no valid SBI fund rows")
    return rows


def parse_yahoo_rows(text):
    pattern = re.compile(r"(20\d{2})/(\d{1,2})/(\d{1,2})\s+([0-9][0-9,]*)\s+([+\-−]?[0-9][0-9,]*)\s+([0-9][0-9,]*)")
    return [{"date": date(int(m[1]), int(m[2]), int(m[3])).isoformat(),
             "nav_yen": int(m[4].replace(",", "")), "change_yen": int(m[5].replace(",", "").replace("−", "-")),
             "net_assets_million_yen": int(m[6].replace(",", ""))} for m in pattern.finditer(text)]


def valid_rows(rows, today):
    """Reject malformed/future/conflicting observations; never fill missing days."""
    if not isinstance(rows, list):
        raise ValueError("history records must be a list")
    result = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("history row must be an object")
        d = date.fromisoformat(row["date"])
        if d > today or d < date(2022, 7, 29):
            raise ValueError("fund date outside observed lifetime")
        for key in ("nav_yen", "change_yen", "net_assets_million_yen"):
            v = row.get(key)
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
                raise ValueError("invalid numeric field: " + key)
        if not 1000 <= row["nav_yen"] <= 100000 or row["net_assets_million_yen"] < 0:
            raise ValueError("fund observation out of range")
        prior = result.get(row["date"])
        if prior and prior["nav_yen"] != row["nav_yen"]:
            raise ValueError("conflicting duplicate date")
        result[row["date"]] = dict(row)
    return [result[k] for k in sorted(result)]


def fetch_yahoo_history(now, pages=5, fetcher=fetch_text):
    merged = {}
    for page in range(1, pages + 1):
        params = urllib.parse.urlencode({"from": (now - timedelta(days=800)).strftime("%Y%m%d"),
                                        "to": now.strftime("%Y%m%d"), "timeFrame": "d", "page": page})
        rows = valid_rows(parse_yahoo_rows(strip_html(fetcher(f"{YAHOO_HISTORY_URL}?{params}"))), now.date())
        for r in rows:
            if r["date"] in merged and merged[r["date"]]["nav_yen"] != r["nav_yen"]:
                raise ValueError("Yahoo pages disagree on NAV")
        if not rows or not ({r["date"] for r in rows} - set(merged)):
            break
        for r in rows:
            merged[r["date"]] = r
        # A short page is NOT end-of-history evidence (e.g. 18 observations).
    return [merged[k] for k in sorted(merged)]


def sma(values, period):
    return sum(values[-period:]) / period if len(values) >= period else None


def ema_series(values, period):
    if not values:
        return []
    alpha, out = 2.0 / (period + 1.0), [float(values[0])]
    for value in values[1:]:
        out.append(alpha * float(value) + (1.0 - alpha) * out[-1])
    return out


def rsi14(values, period=14):
    if len(values) < period + 1:
        return None
    diffs = [b - a for a, b in zip(values[-(period + 1):-1], values[-period:])]
    gain, loss = sum(max(d, 0) for d in diffs) / period, sum(max(-d, 0) for d in diffs) / period
    return (100.0 if gain else 50.0) if loss == 0 else 100.0 - 100.0 / (1.0 + gain / loss)


def build_technical(rows, basis_date=None):
    """Existing SMA/EMA/rolling-RSI arithmetic; readiness is checked separately."""
    values = [float(r["nav_yen"]) for r in rows]
    a, b = ema_series(values, 12), ema_series(values, 26)
    macds = [x - y for x, y in zip(a, b)]
    signals = ema_series(macds, 9)
    macd, signal = (macds[-1], signals[-1]) if len(values) >= 35 else (None, None)
    ma25, ma75, rsi = sma(values, 25), sma(values, 75), rsi14(values)
    observed = rows[-1]["date"] if rows else None
    aligned = basis_date is None or observed == basis_date
    out = {"available": len(values) >= 75 and aligned, "method_version": "fund-tech-1-readiness-2",
           "basis_date": observed, "history_count": len(values), "ma25": ma25, "ma75": ma75,
           "rsi14": rsi, "macd": macd, "macd_signal": signal,
           "macd_hist": None if macd is None else macd - signal,
           "gc_dc": ("GC" if ma25 >= ma75 else "DC") if ma75 is not None else None,
           "basis_consistent": aligned, "rsi_method": "simple rolling mean 14 (unchanged)",
           "note": "計算式は従来通り。全指標の利用可は履歴75件以上・基準日一致。GC/DCは位置関係で発生日ではありません。"}
    for key, digits in (("ma25", 2), ("ma75", 2), ("rsi14", 2), ("macd", 3), ("macd_signal", 3), ("macd_hist", 3)):
        if out[key] is not None:
            out[key] = round(out[key], digits)
    return out


def load_document(path):
    if not path.exists():
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("fund_key") not in (None, FUND_KEY):
        raise ValueError("invalid saved fund document")
    return value


def merge_history(cached, sources, official, today):
    rows = {r["date"]: r for r in valid_rows(cached, today)}
    for label, incoming in sources:
        for r in valid_rows(incoming, today):
            prev = rows.get(r["date"])
            if prev and prev["nav_yen"] != r["nav_yen"]:
                # Only the independently obtained official current observation can resolve a conflict.
                if not official or official["date"] != r["date"]:
                    raise ValueError("history NAV disagreement: " + r["date"])
                continue
            if prev and prev.get("source") == OFFICIAL:
                continue
            rows[r["date"]] = {**r, "source": label}
    if official:
        rows[official["date"]] = {**official, "source": OFFICIAL}
    return [rows[k] for k in sorted(rows)]


def collect(now, old, saved_history, fetcher=fetch_text):
    reports, official, sbi, yahoo = [], None, [], []
    # Official NAV must never depend on SBI/Yahoo availability.
    for label, get in ((OFFICIAL, lambda: [parse_official_snapshot(strip_html(fetcher(OFFICIAL_URL)))]),
                       (SBI, lambda: parse_rows(strip_html(fetcher(SBI_URL)))),
                       (YAHOO, lambda: fetch_yahoo_history(now, fetcher=fetcher))):
        try:
            rows = valid_rows(get(), now.date())
            reports.append({"source": label, "status": "ok" if rows else "empty", "count": len(rows)})
            if label == OFFICIAL:
                official = rows[-1] if rows else None
            elif label == SBI:
                sbi = rows
            else:
                yahoo = rows
        except Exception as e:
            reports.append({"source": label, "status": "error", "error": type(e).__name__ + ": " + str(e)[:180]})
    # Yahoo is a history provider, not an unconfirmed replacement for current NAV.
    candidates = [(sbi[-1], SBI, SBI_URL)] if sbi else []
    if official:
        candidates.append((official, OFFICIAL, OFFICIAL_URL))
    candidates.sort(key=lambda x: (x[0]["date"], x[1] == OFFICIAL))
    latest = candidates[-1] if candidates else None
    attempted = now.isoformat(timespec="seconds")
    if not latest or old.get("as_of_date", "") > latest[0]["date"]:
        return {**old, "status": "fallback" if old.get("nav_yen") else "error",
                "attempted_at_jst": attempted, "source_reports": reports,
                "error": "current source unavailable or older; saved value retained"}, None
    row, source, url = latest
    history_error, merged = None, []
    try:
        if saved_history.get("_load_error"):
            raise ValueError("saved history unreadable; file retained")
        merged = merge_history(saved_history.get("records", []), [(YAHOO, yahoo), (SBI, sbi)], official, now.date())
        eligible = [r for r in merged if r["date"] <= row["date"]]
        technical = build_technical(eligible, row["date"])
        tail = eligible[-76:]
        breaks = [{"previous_date": a["date"], "date": b["date"]}
                  for a, b in zip(tail, tail[1:])
                  if abs((b["nav_yen"] - b["change_yen"]) - a["nav_yen"]) > 0.01]
        technical["continuity_breaks"] = breaks
        if breaks:
            technical["available"] = False
            technical["error"] = "reported NAV changes do not join; gap/revision requires verification"
            for key in ("ma25", "ma75", "rsi14", "macd", "macd_signal", "macd_hist", "gc_dc"):
                technical[key] = None
    except Exception as e:
        history_error = str(e)
        technical = {**build_technical([], row["date"]), "error": history_error}
    nav, change = row["nav_yen"], row["change_yen"]
    if nav - change <= 0:
        raise ValueError("invalid previous NAV")
    data = {"schema_version": 3, "fund_key": FUND_KEY, "fund_name": FUND_NAME, "short_name": "インド・コア",
            "source": source, "source_url": url, "official_source_url": OFFICIAL_URL,
            "official_status": "ok" if source == OFFICIAL else "older_than_sbi" if official else "unavailable",
            "fund_sec_code": "83311227", "as_of_date": row["date"], "nav_yen": nav,
            "change_yen": change, "change_pct": round(change / (nav - change) * 100, 4),
            "net_assets_million_yen": row["net_assets_million_yen"],
            "net_assets_oku_yen": round(row["net_assets_million_yen"] / 100, 2),
            "fetched_at_jst": attempted, "attempted_at_jst": attempted, "status": "ok",
            "history_source": "保存履歴＋Yahoo/SBI＋公式最新値", "history_source_url": YAHOO_HISTORY_URL,
            "history_status": "error" if history_error else "inconsistent" if technical.get("continuity_breaks") else "ok" if technical["available"] else "insufficient",
            "history_error": history_error, "source_reports": reports, "technical": technical,
            "note": "公式最新値を独立取得。保存履歴は削減せず重複排除して保持。市場の売買条件には使用しません。"}
    history = None if history_error else {"schema_version": 2, "fund_key": FUND_KEY,
               "source": data["history_source"], "source_url": YAHOO_HISTORY_URL,
               "updated_at_jst": attempted, "records": merged}
    return data, history


def write_json(path, value):
    payload = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(payload, encoding="utf-8")
    os.replace(temporary, path)


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--dry-run", action="store_true", help="Fetch and report only; do not write data")
    dry_run = args.parse_args().dry_run
    now = datetime.now(JST)
    try:
        old = load_document(OUT)
    except (ValueError, OSError):
        old = {}
    try:
        saved = load_document(HISTORY_OUT)
    except (ValueError, OSError):
        saved = {"_load_error": True}
    data, history = collect(now, old, saved)
    if not dry_run:
        if history is not None:
            write_json(HISTORY_OUT, history)
        write_json(OUT, data)
    summary = {k: data.get(k) for k in ("status", "as_of_date", "nav_yen", "change_yen", "official_status", "history_status")}
    summary.update(history_count=(data.get("technical") or {}).get("history_count"),
                   technical_available=(data.get("technical") or {}).get("available"), dry_run=dry_run)
    print(json.dumps(summary, ensure_ascii=False))
    return 1 if data.get("status") == "error" else 0


if __name__ == "__main__":
    raise SystemExit(main())
