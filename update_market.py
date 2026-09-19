#!/usr/bin/env python3
"""India 14:00 Check v4 market updater.

Goals
- Keep the v3 workflow and history model.
- Separate confirmed EOD technicals from 14:00 intraday provisional technicals.
- Add data-freshness/decision-gate checks.
- Use the official 2026 NSE holiday calendar for regular-session closure checks.
- Add optional official NSE breadth and FII/DII context.
- Add optional NIFTY official-source cross-check (NSE Indices live blob).
- Backtest the NIFTY-only technical core of the buy/sell setup score.
- Keep 1-month analog outlook and anomalies descriptive, not deterministic.

v4.3.1 is designed for a zero-cost operating model and adds strict quote sanity checks plus legacy technical-cache migration. NIFTY current price uses Google Finance
with NSE Indices historical data where available; USD/INR prefers the free Twelve Data
FX allowance; Brent and India VIX use Google Finance. Yahoo Finance remains a last-resort
fallback because GitHub-hosted runners can be rate-limited. Optional official NSE calls may
fail from hosted runners; failures do not stop core processing and are surfaced explicitly.
"""
from __future__ import annotations

import csv
import html as html_lib
import http.cookiejar
import io
import json
import math
import os
import re
import statistics
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, time as dtime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

MARKET_OUT = Path("market.json")
HISTORY_OUT = Path("history.json")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36"
JST = ZoneInfo("Asia/Tokyo")
IST = ZoneInfo("Asia/Kolkata")
SCHEMA_VERSION = 4
APP_VERSION = "4.3.1"
TWELVEDATA_API_KEY = os.getenv("TWELVEDATA_API_KEY", "").strip()
TWELVEDATA_BASE = "https://api.twelvedata.com"
GOOGLE_FINANCE_BASE = "https://www.google.com/finance/beta/quote"

# NSE cash-market trading holidays for calendar year 2026.
# Source: NSE circular "Trading holidays for the calendar year 2026".
NSE_HOLIDAYS_2026 = {
    "2026-01-26": "Republic Day",
    "2026-03-03": "Holi",
    "2026-03-26": "Shri Ram Navami",
    "2026-03-31": "Shri Mahavir Jayanti",
    "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2026-05-01": "Maharashtra Day",
    "2026-05-28": "Bakri Id",
    "2026-06-26": "Muharram",
    "2026-09-14": "Ganesh Chaturthi",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-10-20": "Dussehra",
    "2026-11-08": "Diwali Laxmi Pujan / Muhurat Trading special session",
    "2026-11-10": "Diwali-Balipratipada",
    "2026-11-24": "Prakash Gurpurb Sri Guru Nanak Dev",
    "2026-12-25": "Christmas",
}


def http_json(url: str, tries: int = 3, timeout: int = 25, headers=None, opener=None):
    last = None
    hdr = {"User-Agent": UA, "Accept": "application/json,text/plain,*/*"}
    if headers:
        hdr.update(headers)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=hdr)
            client = opener.open if opener is not None else urllib.request.urlopen
            with client(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(str(last))


def http_text(url: str, tries: int = 3, timeout: int = 25, headers=None, opener=None):
    last = None
    hdr = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        hdr.update(headers)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=hdr)
            client = opener.open if opener is not None else urllib.request.urlopen
            with client(req, timeout=timeout) as r:
                return r.read().decode("utf-8-sig", errors="replace")
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(str(last))



def http_post_json(url: str, payload: dict, tries: int = 2, timeout: int = 30, headers=None, opener=None):
    last = None
    hdr = {
        "User-Agent": UA,
        "Accept": "application/json,text/javascript,*/*;q=0.01",
        "Content-Type": "application/json; charset=UTF-8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    if headers:
        hdr.update(headers)
    body = json.dumps(payload).encode("utf-8")
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=body, headers=hdr, method="POST")
            client = opener.open if opener is not None else urllib.request.urlopen
            with client(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", errors="replace"))
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(str(last))

def yahoo_chart(symbol: str, range_: str = "10d", interval: str = "5m"):
    """Lightweight Yahoo chart fetch with host fallback and modest backoff.

    v4.1 deliberately avoids many small requests because shared GitHub Actions IPs
    can be rate-limited even when this repository itself has low traffic.
    """
    enc = urllib.parse.quote(symbol, safe="")
    qs = urllib.parse.urlencode(
        {
            "range": range_,
            "interval": interval,
            "includePrePost": "false",
            "events": "div,splits",
        }
    )
    errors = []
    headers = {
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://finance.yahoo.com/",
        "Cache-Control": "no-cache",
    }
    for cycle in range(2):
        for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
            try:
                data = http_json(
                    f"https://{host}/v8/finance/chart/{enc}?{qs}",
                    tries=1, timeout=20, headers=headers
                )
                result = (data.get("chart") or {}).get("result")
                if not result:
                    raise RuntimeError(str((data.get("chart") or {}).get("error") or "empty result"))
                return result[0]
            except Exception as e:
                errors.append(f"{host}: {e}")
        if cycle == 0:
            time.sleep(4.0)
    raise RuntimeError("; ".join(errors))


def series_from_chart(chart):
    ts = chart.get("timestamp") or []
    quote = ((chart.get("indicators") or {}).get("quote") or [{}])[0]
    close = quote.get("close") or []
    out = []
    for t, c in zip(ts, close):
        if c is not None:
            out.append((int(t), float(c)))
    return out


def last_value(chart):
    s = series_from_chart(chart)
    if not s:
        raise RuntimeError("no price data")
    return s[-1]


def completed_daily_series(chart, now_ist=None):
    """Return completed daily closes only. Exclude today's partial candle during market hours."""
    s = series_from_chart(chart)
    now_ist = now_ist or datetime.now(IST)
    today = now_ist.date()
    out = []
    for ts, close in s:
        dt = datetime.fromtimestamp(ts, timezone.utc).astimezone(IST)
        if dt.date() == today and now_ist.time() < dtime(16, 0):
            continue
        out.append((ts, close))
    return out


def yahoo_daily_bundle(symbol: str, range_: str):
    """One Yahoo request provides current reference quote + daily history.

    This replaces the v4 pattern of separate intraday and daily requests, reducing
    Yahoo calls from roughly eight per run to four.
    """
    chart = yahoo_chart(symbol, range_, "1d")
    meta = chart.get("meta") or {}
    series = series_from_chart(chart)
    price = meta.get("regularMarketPrice")
    ts = meta.get("regularMarketTime")
    if price is None or ts is None:
        if not series:
            raise RuntimeError("no quote or series data")
        ts, price = series[-1]
    price = float(price)
    ts = int(ts)
    ds = completed_daily_series(chart)
    vals = [c for _, c in ds]
    change5 = None
    if len(ds) >= 6:
        quote_date = datetime.fromtimestamp(ts, timezone.utc).astimezone(IST).date()
        last_daily_date = datetime.fromtimestamp(ds[-1][0], timezone.utc).astimezone(IST).date()
        if quote_date == last_daily_date:
            base = vals[-6]
        elif len(vals) >= 5:
            base = vals[-5]
        else:
            base = None
        if base not in (None, 0):
            change5 = pct_change(price, base)
    return chart, ts, price, ds, change5



def twelve_json(endpoint: str, params: dict, tries: int = 2):
    """Call Twelve Data using an API key kept in GitHub Secrets.

    The key is never written to market.json or logs. A missing key simply disables
    this provider and lets the Yahoo fallback path run.
    """
    if not TWELVEDATA_API_KEY:
        raise RuntimeError("TWELVEDATA_API_KEY is not configured")
    q = dict(params)
    q["apikey"] = TWELVEDATA_API_KEY
    url = f"{TWELVEDATA_BASE}/{endpoint.lstrip('/')}?{urllib.parse.urlencode(q)}"
    data = http_json(url, tries=tries, timeout=25, headers={"Accept": "application/json"})
    if isinstance(data, dict):
        status = str(data.get("status") or "").lower()
        if status == "error" or data.get("code") in (400, 401, 403, 404, 429):
            msg = data.get("message") or data.get("error") or f"Twelve Data error {data.get('code')}"
            raise RuntimeError(str(msg))
    return data


def _parse_provider_ts(obj, tz_hint=UTC if 'UTC' in globals() else timezone.utc):
    ts = obj.get("timestamp") if isinstance(obj, dict) else None
    if ts not in (None, ""):
        try:
            return int(float(ts))
        except Exception:
            pass
    raw = (obj.get("datetime") if isinstance(obj, dict) else None) or (obj.get("date") if isinstance(obj, dict) else None)
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz_hint)
        return int(dt.astimezone(timezone.utc).timestamp())
    except Exception:
        try:
            d = datetime.strptime(str(raw)[:10], "%Y-%m-%d").replace(tzinfo=tz_hint)
            return int(d.astimezone(timezone.utc).timestamp())
        except Exception:
            return None


def twelve_symbol_search(query: str, preferred_kind: str | None = None):
    data = twelve_json("symbol_search", {"symbol": query}, tries=1)
    rows = (data or {}).get("data") or (data or {}).get("result") or []
    if not isinstance(rows, list) or not rows:
        raise RuntimeError(f"symbol not found: {query}")

    def score(row):
        text = " ".join(str(row.get(k) or "") for k in (
            "symbol", "instrument_name", "name", "exchange", "country", "instrument_type", "type"
        )).lower()
        sc = 0
        if "nifty 50" in text:
            sc += 20
        if "india" in text:
            sc += 8
        if "nse" in text:
            sc += 6
        if preferred_kind and preferred_kind.lower() in text:
            sc += 8
        return sc

    row = max(rows, key=score)
    sym = row.get("symbol")
    if not sym:
        raise RuntimeError(f"symbol not found: {query}")
    return str(sym), row


def twelve_commodity_symbol(name_contains="Brent Spot"):
    data = twelve_json("commodities", {}, tries=1)
    rows = (data or {}).get("data") or []
    target = name_contains.lower()
    for row in rows:
        name = str(row.get("name") or "").lower()
        desc = str(row.get("description") or "").lower()
        if target in name or ("brent" in name and "spot" in (name + " " + desc)):
            if row.get("symbol"):
                return str(row["symbol"]), row
    for row in rows:
        if "brent" in (str(row.get("name") or "") + " " + str(row.get("description") or "")).lower():
            if row.get("symbol"):
                return str(row["symbol"]), row
    raise RuntimeError("Brent Spot symbol not found")


def twelve_quote(symbol: str, tz_hint=timezone.utc):
    data = twelve_json("quote", {"symbol": symbol}, tries=2)
    price = None
    for k in ("close", "price", "last", "value"):
        if isinstance(data, dict) and data.get(k) not in (None, ""):
            try:
                price = float(data[k])
                break
            except Exception:
                pass
    if price is None:
        raise RuntimeError(f"quote has no numeric price for {symbol}")
    ts = _parse_provider_ts(data, tz_hint)
    if ts is None:
        ts = int(datetime.now(timezone.utc).timestamp())
    return ts, price, data


def twelve_daily_series(symbol: str, outputsize: int, tz_hint=timezone.utc):
    data = twelve_json(
        "time_series",
        {
            "symbol": symbol,
            "interval": "1day",
            "outputsize": int(outputsize),
            "timezone": getattr(tz_hint, "key", "UTC"),
            "format": "JSON",
        },
        tries=2,
    )
    rows = (data or {}).get("values") or []
    out = []
    for row in rows:
        try:
            close = float(row.get("close"))
        except Exception:
            continue
        ts = _parse_provider_ts(row, tz_hint)
        if ts is None:
            continue
        out.append((ts, close))
    out.sort(key=lambda x: x[0])
    if not out:
        raise RuntimeError(f"no daily series for {symbol}")
    return out, data


def _completed_provider_daily(series, now_tz, market_close=dtime(16, 0)):
    today = now_tz.date()
    out = []
    for ts, close in series:
        dt = datetime.fromtimestamp(ts, timezone.utc).astimezone(now_tz.tzinfo)
        if dt.date() == today and now_tz.time() < market_close:
            continue
        out.append((ts, close))
    return out


def twelve_nifty_bundle(old_result=None):
    old_result = old_result or {}
    cached = ((old_result.get("provider_symbols") or {}).get("twelvedata") or {}).get("nifty")
    symbol = os.getenv("TWELVEDATA_NIFTY_SYMBOL", "").strip() or cached
    meta = None
    if not symbol:
        symbol, meta = twelve_symbol_search("NIFTY 50", preferred_kind="index")
    ts, price, quote = twelve_quote(symbol, IST)
    series, _ = twelve_daily_series(symbol, 3000, IST)
    ds = _completed_provider_daily(series, datetime.now(IST), dtime(16, 0))
    if len(ds) < 120:
        raise RuntimeError(f"Twelve Data NIFTY daily history too short ({len(ds)} rows); plan/history access may be limited")
    return None, ts, price, ds, None, symbol, meta or quote


def twelve_simple_bundle(kind: str, old_result=None):
    old_result = old_result or {}
    cached_map = (old_result.get("provider_symbols") or {}).get("twelvedata") or {}
    if kind == "usdinr":
        symbol = os.getenv("TWELVEDATA_USDINR_SYMBOL", "").strip() or cached_map.get("usdinr") or "USD/INR"
        tz_hint = IST
    elif kind == "brent":
        symbol = os.getenv("TWELVEDATA_BRENT_SYMBOL", "").strip() or cached_map.get("brent")
        if not symbol:
            symbol, _ = twelve_commodity_symbol("Brent Spot")
        tz_hint = timezone.utc
    else:
        raise ValueError(kind)
    ts, price, _ = twelve_quote(symbol, tz_hint)
    series, _ = twelve_daily_series(symbol, 15, tz_hint)
    vals = [x[1] for x in series]
    change5 = pct_change(price, vals[-6]) if len(vals) >= 6 and vals[-6] else None
    return None, ts, price, series, change5, symbol



def _plain_html(text: str):
    text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", text)
    text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html_lib.unescape(text).replace("\u202f", " ").replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def _parse_google_time(raw: str, tz_hint=timezone.utc):
    if not raw:
        return None
    raw = html_lib.unescape(str(raw)).replace("\u202f", " ").replace("\xa0", " ").strip()
    raw = re.sub(r"\s+", " ", raw)
    # Examples: Sep 18, 3:31:14 PM GMT+5:30 / Sep 18, 1:11:10 PM UTC
    m = re.search(r"([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{1,2}:\d{2}:\d{2})\s+([AP]M)\s+(GMT[+-]\d{1,2}:\d{2}|UTC)", raw)
    if not m:
        return None
    mon, day, clock, ampm, zone = m.groups()
    now = datetime.now(tz_hint)
    if zone == "UTC":
        offset = "+0000"
    else:
        off = zone[3:]
        sign = "+" if off.startswith("+") else "-"
        hh, mm = off[1:].split(":")
        offset = f"{sign}{int(hh):02d}{int(mm):02d}"
    try:
        dt = datetime.strptime(f"{now.year} {mon} {day} {clock} {ampm} {offset}", "%Y %b %d %I:%M:%S %p %z")
        if dt > datetime.now(timezone.utc) + timedelta(days=2):
            dt = dt.replace(year=dt.year - 1)
        return int(dt.astimezone(timezone.utc).timestamp())
    except Exception:
        return None


GOOGLE_PRICE_BOUNDS = {
    "NIFTY_50:INDEXNSE": (5000.0, 100000.0),
    "USD-INR": (40.0, 200.0),
    "BZW00:NYMEX": (10.0, 300.0),
    "INDIA_VIX:INDEXNSE": (1.0, 100.0),
}

GOOGLE_QUOTE_LABELS = {
    "NIFTY_50:INDEXNSE": ("NIFTY 50",),
    "USD-INR": ("United States Dollar to Indian Rupee", "Indian Rupee"),
    "BZW00:NYMEX": ("Brent Crude Oil Last Day Financial Futures",),
    "INDIA_VIX:INDEXNSE": ("Nifty VIX", "India VIX"),
}


def _google_price_is_sane(quote_code: str, value) -> bool:
    try:
        v = float(value)
    except Exception:
        return False
    if not math.isfinite(v):
        return False
    lo, hi = GOOGLE_PRICE_BOUNDS.get(quote_code, (1e-12, float("inf")))
    return lo <= v <= hi


def _parse_number(text):
    if text is None:
        return None
    m = re.search(r"-?\d[\d,]*(?:\.\d+)?", html_lib.unescape(str(text)))
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", ""))
    except Exception:
        return None


def _google_targeted_price(plain: str, quote_code: str):
    """Prefer a price located immediately after the instrument name.

    Google Finance pages can contain many hidden/secondary numeric nodes. In v4.3 a
    generic class match occasionally captured 0.00 for Brent. The instrument-name
    anchor plus a market-specific sanity range prevents that value from being marked
    fresh.
    """
    for label in GOOGLE_QUOTE_LABELS.get(quote_code, ()):
        m = re.search(
            re.escape(label) + r"\s+[$₹€£]?\s*([0-9][0-9,]*(?:\.\d+)?)",
            plain,
            flags=re.I,
        )
        if m:
            value = _parse_number(m.group(1))
            if _google_price_is_sane(quote_code, value):
                return value
    return None


def _derive_saved_technical_date(old_n: dict):
    """Migrate older v4/v4.1/v4.2 technical metadata to v4.3-style technical_date."""
    raw = old_n.get("technical_date")
    if raw:
        try:
            return datetime.strptime(str(raw)[:10], "%Y-%m-%d").date().isoformat()
        except Exception:
            pass
    for key in ("technical_as_of_jst", "as_of_jst"):
        raw = old_n.get(key)
        if not raw:
            continue
        try:
            dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=JST)
            return dt.astimezone(IST).date().isoformat()
        except Exception:
            try:
                return datetime.strptime(str(raw)[:10], "%Y-%m-%d").date().isoformat()
            except Exception:
                pass
    return None


def google_finance_quote(quote_code: str, tz_hint=timezone.utc):
    """Fetch a public Google Finance quote page without an API key.

    Google Finance is used as a free reference source, not a licensed exchange feed.
    The parser has class-based and plain-text fallbacks and refuses to mark a quote
    fresh if its displayed timestamp cannot be parsed.
    """
    code = urllib.parse.quote(quote_code, safe=":-")
    url = f"{GOOGLE_FINANCE_BASE}/{code}?hl=en"
    text = http_text(
        url, tries=2, timeout=25,
        headers={
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.google.com/finance/",
            "Cache-Control": "no-cache",
        },
    )
    plain = _plain_html(text)
    # Instrument-name anchored extraction is preferred. It is materially safer for
    # pages such as Brent futures that contain hidden/secondary numeric nodes.
    price = _google_targeted_price(plain[:7000], quote_code)

    if price is None:
        for pat in (
            r'<div[^>]*class="[^"]*YMlKec[^"]*fxKbKc[^"]*"[^>]*>([^<]+)</div>',
            r'<div[^>]*class="[^"]*fxKbKc[^"]*YMlKec[^"]*"[^>]*>([^<]+)</div>',
            r'class="YMlKec fxKbKc"[^>]*>([^<]+)<',
        ):
            for m in re.finditer(pat, text, flags=re.I):
                candidate = _parse_number(m.group(1))
                if _google_price_is_sane(quote_code, candidate):
                    price = candidate
                    break
            if price is not None:
                break

    if price is None:
        # Final text fallback, still guarded by market-specific sanity ranges.
        head = plain[:7000]
        m = re.search(r"(?:NIFTY 50|Nifty VIX|India VIX|Indian Rupee|Brent Crude Oil Last Day Financial Futures)\s+[^0-9]{0,160}([0-9][0-9,]*(?:\.\d+)?)", head, re.I)
        if m:
            candidate = _parse_number(m.group(1))
            if _google_price_is_sane(quote_code, candidate):
                price = candidate
    if price is None:
        bounds = GOOGLE_PRICE_BOUNDS.get(quote_code)
        suffix = f" within sanity range {bounds}" if bounds else ""
        raise RuntimeError(f"Google Finance valid price not found for {quote_code}{suffix}")

    raw_time = None
    mt = re.search(r'<div[^>]*class="[^"]*ygUjEc[^"]*"[^>]*>(.*?)</div>', text, flags=re.I | re.S)
    if mt:
        raw_time = _plain_html(mt.group(1))
    if not raw_time:
        mt = re.search(r"([A-Z][a-z]{2}\s+\d{1,2},\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M\s+(?:GMT[+-]\d{1,2}:\d{2}|UTC))", plain)
        if mt:
            raw_time = mt.group(1)
    ts = _parse_google_time(raw_time, tz_hint)
    if ts is None:
        raise RuntimeError(f"Google Finance quote timestamp not found for {quote_code}")
    return ts, price, {"quote_code": quote_code, "url": url, "display_time": raw_time}


def niftyindices_daily_series(years: int = 11):
    """Free official NSE Indices historical NIFTY 50 daily closes.

    Uses the public historical-data endpoint behind niftyindices.com. The endpoint is
    independent from the NSE live API that commonly returns 403 on hosted runners.
    """
    now_ist = datetime.now(IST)
    start = now_ist.date() - timedelta(days=366 * years)
    end = now_ist.date()
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    base = "https://www.niftyindices.com"
    try:
        http_text(
            f"{base}/reports/historical-data", tries=1, timeout=10, opener=opener,
            headers={"Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
        )
    except Exception:
        # Some runs can access the data endpoint even if the bootstrap HTML is slow.
        pass
    info = {
        "name": "NIFTY 50",
        "indexName": "NIFTY 50",
        "startDate": start.strftime("%d-%b-%Y"),
        "endDate": end.strftime("%d-%b-%Y"),
    }
    data = http_post_json(
        f"{base}/Backpage.aspx/getHistoricaldatatabletoString",
        {"cinfo": json.dumps(info, separators=(",", ":"))},
        tries=2, timeout=35, opener=opener,
        headers={
            "Origin": base,
            "Referer": f"{base}/reports/historical-data",
            "X-Requested-With": "XMLHttpRequest",
        },
    )
    raw = data.get("d") if isinstance(data, dict) else None
    if isinstance(raw, str):
        rows = json.loads(raw)
    elif isinstance(raw, list):
        rows = raw
    else:
        raise RuntimeError("NSE Indices historical response has no data")
    out = []
    for row in rows:
        date_raw = row.get("HistoricalDate") or row.get("Date") or row.get("date")
        close_raw = row.get("CLOSE") or row.get("Close") or row.get("close")
        if not date_raw or close_raw in (None, "", "-"):
            continue
        dt = None
        for fmt in ("%d %b %Y", "%d-%b-%Y", "%d/%m/%Y"):
            try:
                dt = datetime.strptime(str(date_raw).strip(), fmt)
                break
            except Exception:
                pass
        if dt is None:
            continue
        try:
            close = float(str(close_raw).replace(",", ""))
        except Exception:
            continue
        local = datetime.combine(dt.date(), dtime(15, 30), tzinfo=IST)
        out.append((int(local.astimezone(timezone.utc).timestamp()), close))
    out.sort(key=lambda x: x[0])
    # Remove duplicate dates defensively.
    dedup = {}
    for ts, close in out:
        day = datetime.fromtimestamp(ts, timezone.utc).astimezone(IST).date().isoformat()
        dedup[day] = (ts, close)
    out = list(dedup.values())
    out.sort(key=lambda x: x[0])
    if len(out) < 120:
        raise RuntimeError(f"NSE Indices historical data too short ({len(out)} rows)")
    return out


def google_nifty_bundle(old_result=None):
    ts, price, quote_meta = google_finance_quote("NIFTY_50:INDEXNSE", IST)
    meta = {"quote": quote_meta, "history_source": "NSE Indices Historical"}
    try:
        ds = niftyindices_daily_series(11)
        meta["history_status"] = "fresh"
    except Exception as e:
        # A fresh Google quote is still useful. Main() may safely pair it with the
        # last saved confirmed technicals for a short grace period.
        ds = []
        meta["history_status"] = "cached"
        meta["history_error"] = str(e)
    return meta, ts, price, ds, None, "NIFTY_50:INDEXNSE"


def google_simple_bundle(kind: str):
    if kind == "usdinr":
        code, tz = "USD-INR", timezone.utc
    elif kind == "brent":
        code, tz = "BZW00:NYMEX", timezone.utc
    else:
        raise ValueError(kind)
    ts, price, _ = google_finance_quote(code, tz)
    return None, ts, price, [], None, code

def fetch_nifty_bundle(old_result=None):
    """Zero-cost NIFTY provider chain.

    1) Google Finance current quote + official NSE Indices historical daily data.
    2) Yahoo Finance chart as last-resort fallback.
    Twelve Data is intentionally not used for NIFTY because the free plan may not
    include the required international-index history.
    """
    errs = []
    try:
        b = google_nifty_bundle(old_result)
        return b[:5], "Google Finance + NSE Indices", b[5]
    except Exception as e:
        errs.append("Google/NSE Indices: " + str(e))
    try:
        return yahoo_daily_bundle("^NSEI", "10y"), "Yahoo Finance", "^NSEI"
    except Exception as e:
        errs.append("Yahoo Finance: " + str(e))
    raise RuntimeError("; ".join(errs))


def fetch_simple_bundle(kind: str, yahoo_symbol: str, old_result=None):
    """Zero-cost provider chain for FX and Brent.

    USD/INR uses the free Twelve Data FX allowance first, then Google Finance.
    Brent uses Google Finance first because Twelve Data commodity access can require
    a paid tier. Yahoo Finance is kept only as a last-resort fallback.
    """
    errs = []
    if kind == "usdinr" and TWELVEDATA_API_KEY:
        try:
            b = twelve_simple_bundle(kind, old_result)
            return b[:5], "Twelve Data", b[5]
        except Exception as e:
            errs.append("Twelve Data: " + str(e))
    try:
        b = google_simple_bundle(kind)
        return b[:5], "Google Finance", b[5]
    except Exception as e:
        errs.append("Google Finance: " + str(e))
    try:
        return yahoo_daily_bundle(yahoo_symbol, "1mo"), "Yahoo Finance", yahoo_symbol
    except Exception as e:
        errs.append("Yahoo Finance: " + str(e))
    raise RuntimeError("; ".join(errs))

def iso_age_minutes(value, now_jst):
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=JST)
        return (now_jst - dt.astimezone(JST)).total_seconds() / 60.0
    except Exception:
        return None


def market_state_from_saved(nifty, now_jst):
    try:
        dt = datetime.fromisoformat((nifty or {}).get("as_of_jst"))
        return market_state(int(dt.timestamp()), now_jst)
    except Exception:
        return {
            "code": "UNKNOWN",
            "label": "状態不明",
            "detail": "NIFTY価格時刻を確認できません。",
            "calendar_source": "NSE 2026 holiday calendar" if now_jst.year == 2026 else "weekday check",
        }


def round_or_none(x, n=4):
    if x is None:
        return None
    try:
        x = float(x)
    except Exception:
        return None
    return None if not math.isfinite(x) else round(x, n)


def iso_jst(ts: int):
    return datetime.fromtimestamp(ts, timezone.utc).astimezone(JST).isoformat(timespec="minutes")


def pct_change(new, old):
    if new is None or old in (None, 0):
        return None
    return (float(new) / float(old) - 1.0) * 100.0


def sma_series(vals, n):
    out = [None] * len(vals)
    if n <= 0:
        return out
    total = 0.0
    for i, x in enumerate(vals):
        total += x
        if i >= n:
            total -= vals[i - n]
        if i >= n - 1:
            out[i] = total / n
    return out


def ema_series(vals, n):
    if not vals:
        return []
    alpha = 2.0 / (n + 1.0)
    out = [vals[0]]
    for x in vals[1:]:
        out.append(alpha * x + (1 - alpha) * out[-1])
    return out


def rsi_series(vals, n=14):
    out = [None] * len(vals)
    if len(vals) < n + 1:
        return out
    gains = []
    losses = []
    for a, b in zip(vals[:-1], vals[1:]):
        d = b - a
        gains.append(max(d, 0.0))
        losses.append(max(-d, 0.0))
    avg_gain = sum(gains[:n]) / n
    avg_loss = sum(losses[:n]) / n
    out[n] = 100.0 if avg_loss == 0 else 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)
    for i in range(n + 1, len(vals)):
        g = gains[i - 1]
        l = losses[i - 1]
        avg_gain = (avg_gain * (n - 1) + g) / n
        avg_loss = (avg_loss * (n - 1) + l) / n
        out[i] = 100.0 if avg_loss == 0 else 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)
    return out


def rolling_vol_series(vals, n=20):
    out = [None] * len(vals)
    rets = [None]
    for i in range(1, len(vals)):
        rets.append(vals[i] / vals[i - 1] - 1.0)
    for i in range(n, len(vals)):
        window = [x for x in rets[i - n + 1 : i + 1] if x is not None]
        if len(window) >= n - 1:
            out[i] = statistics.pstdev(window) * math.sqrt(252) * 100.0
    return out


def build_indicator_arrays(vals):
    ma5 = sma_series(vals, 5)
    ma25 = sma_series(vals, 25)
    ma75 = sma_series(vals, 75)
    rsi = rsi_series(vals, 14)
    e12 = ema_series(vals, 12)
    e26 = ema_series(vals, 26)
    macd = [a - b for a, b in zip(e12, e26)]
    signal = ema_series(macd, 9)
    hist = [m - s for m, s in zip(macd, signal)]
    vol20 = rolling_vol_series(vals, 20)
    ret5 = [None] * len(vals)
    ret20 = [None] * len(vals)
    for i in range(len(vals)):
        if i >= 5:
            ret5[i] = pct_change(vals[i], vals[i - 5])
        if i >= 20:
            ret20[i] = pct_change(vals[i], vals[i - 20])
    return {
        "ma5": ma5,
        "ma25": ma25,
        "ma75": ma75,
        "rsi": rsi,
        "macd": macd,
        "signal": signal,
        "hist": hist,
        "vol20": vol20,
        "ret5": ret5,
        "ret20": ret20,
    }


def recent_change_5d(symbol):
    try:
        daily = yahoo_chart(symbol, "1mo", "1d")
        ds = completed_daily_series(daily)
        vals = [c for _, c in ds]
        if len(vals) >= 6:
            return pct_change(vals[-1], vals[-6])
    except Exception:
        return None
    return None


def is_regular_nse_trading_day(dt_jst: datetime):
    d = dt_jst.date()
    key = d.isoformat()
    if d.weekday() >= 5:
        return False, "週末"
    if d.year == 2026 and key in NSE_HOLIDAYS_2026:
        return False, NSE_HOLIDAYS_2026[key]
    return True, None


def market_state(price_ts: int, now_jst: datetime):
    price_dt = datetime.fromtimestamp(price_ts, timezone.utc).astimezone(JST)
    regular, reason = is_regular_nse_trading_day(now_jst)
    if not regular:
        return {
            "code": "CLOSED",
            "label": "休場",
            "detail": f"{reason}。NIFTY価格は {price_dt.strftime('%Y/%m/%d %H:%M')} JST 時点です。",
            "calendar_source": "NSE 2026 holiday calendar" if now_jst.year == 2026 else "weekend check",
        }
    if price_dt.date() < now_jst.date():
        return {
            "code": "PREVIOUS_SESSION",
            "label": "前営業日データ",
            "detail": f"NIFTY価格は {price_dt.strftime('%Y/%m/%d %H:%M')} JST 時点です。",
            "calendar_source": "NSE 2026 holiday calendar" if now_jst.year == 2026 else "weekday check",
        }
    if dtime(12, 45) <= now_jst.time() <= dtime(19, 0):
        return {
            "code": "LIVE",
            "label": "取引中",
            "detail": f"NIFTY最新取得値は {price_dt.strftime('%H:%M')} JST 時点です。",
            "calendar_source": "NSE 2026 holiday calendar" if now_jst.year == 2026 else "weekday check",
        }
    return {
        "code": "OUT_OF_HOURS",
        "label": "取引時間外",
        "detail": f"NIFTY価格は {price_dt.strftime('%Y/%m/%d %H:%M')} JST 時点です。",
        "calendar_source": "NSE 2026 holiday calendar" if now_jst.year == 2026 else "weekday check",
    }


def build_provisional_technicals(daily_dates, daily_vals, current_price, current_price_ts):
    """Treat the current intraday price as today's temporary close and recalculate indicators."""
    if not daily_vals or current_price is None or current_price_ts is None:
        return {"available": False, "message": "データ不足"}
    current_date = datetime.fromtimestamp(current_price_ts, timezone.utc).astimezone(IST).date().isoformat()
    vals = list(daily_vals)
    dates = list(daily_dates)
    if dates and dates[-1] == current_date:
        vals[-1] = float(current_price)
    else:
        dates.append(current_date)
        vals.append(float(current_price))
    if len(vals) < 80:
        return {"available": False, "message": "履歴不足"}
    arr = build_indicator_arrays(vals)
    i = len(vals) - 1
    return {
        "available": True,
        "basis": "14:00時点価格を当日終値と仮定した暫定計算",
        "date": dates[i],
        "price": round_or_none(vals[i], 2),
        "ma5": round_or_none(arr["ma5"][i], 2),
        "ma25": round_or_none(arr["ma25"][i], 2),
        "ma75": round_or_none(arr["ma75"][i], 2),
        "rsi14": round_or_none(arr["rsi"][i], 2),
        "rsi14_prev": round_or_none(arr["rsi"][i - 1], 2),
        "macd": round_or_none(arr["macd"][i], 3),
        "macd_signal": round_or_none(arr["signal"][i], 3),
        "macd_hist": round_or_none(arr["hist"][i], 3),
        "macd_hist_prev": round_or_none(arr["hist"][i - 1], 3),
        "ret5_pct": round_or_none(arr["ret5"][i], 2),
        "vol20_annualized_pct": round_or_none(arr["vol20"][i], 2),
        "price_vs_ma5_pct": round_or_none(pct_change(vals[i], arr["ma5"][i]), 2),
        "price_vs_ma25_pct": round_or_none(pct_change(vals[i], arr["ma25"][i]), 2),
        "price_vs_ma75_pct": round_or_none(pct_change(vals[i], arr["ma75"][i]), 2),
    }


def nse_opener():
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    home_headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    req = urllib.request.Request("https://www.nseindia.com/", headers=home_headers)
    with opener.open(req, timeout=20) as r:
        r.read(1024)
    return opener


def fetch_nse_breadth(opener):
    url = "https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050"
    data = http_json(
        url,
        tries=2,
        timeout=20,
        opener=opener,
        headers={
            "Referer": "https://www.nseindia.com/market-data/live-equity-market",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    rows = data.get("data") or []
    changes = []
    for row in rows:
        sym = str(row.get("symbol") or "").strip()
        if sym.upper() in ("NIFTY 50", "NIFTY50", ""):
            continue
        try:
            ch = float(row.get("pChange"))
        except Exception:
            continue
        changes.append(ch)
    if len(changes) < 30:
        raise RuntimeError(f"breadth sample too small: {len(changes)}")
    adv = sum(x > 0 for x in changes)
    dec = sum(x < 0 for x in changes)
    unch = len(changes) - adv - dec
    return {
        "available": True,
        "source": "NSE India NIFTY 50 constituent live data",
        "sample_count": len(changes),
        "advances": adv,
        "declines": dec,
        "unchanged": unch,
        "advance_ratio_pct": round(adv / len(changes) * 100, 1),
        "average_change_pct": round(statistics.fmean(changes), 2),
    }


def fetch_nse_fiidii(opener):
    url = "https://www.nseindia.com/api/fiidiiTradeReact"
    rows = http_json(
        url,
        tries=2,
        timeout=20,
        opener=opener,
        headers={
            "Referer": "https://www.nseindia.com/reports/fii-dii",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    if not isinstance(rows, list):
        raise RuntimeError("unexpected FII/DII response")
    out = {"available": False, "source": "NSE India FII/FPI & DII activity"}
    for row in rows:
        cat = str(row.get("category") or "").upper()
        try:
            net = float(str(row.get("netValue") or row.get("net") or "nan").replace(",", ""))
        except Exception:
            continue
        item = {
            "date": row.get("date"),
            "buy_value_crore": round_or_none(str(row.get("buyValue") or "").replace(",", ""), 2),
            "sell_value_crore": round_or_none(str(row.get("sellValue") or "").replace(",", ""), 2),
            "net_value_crore": round_or_none(net, 2),
        }
        if "FII" in cat or "FPI" in cat:
            out["fii"] = item
        elif "DII" in cat:
            out["dii"] = item
    out["available"] = bool(out.get("fii") or out.get("dii"))
    out["basis"] = "公表済みの日次データ（14:00時点では通常、前営業日以前）"
    return out


def fetch_nifty_official_crosscheck():
    url = "https://iislliveblob.niftyindices.com/jsonfiles/LiveIndicesWatch.json"
    data = http_json(url, tries=2, timeout=20, headers={"Referer": "https://www.niftyindices.com/"})
    rows = data.get("data") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise RuntimeError("unexpected official NIFTY response")
    for row in rows:
        name = str(row.get("indexName") or row.get("index") or row.get("name") or "").upper().replace(" ", "")
        if name == "NIFTY50":
            for key in ("last", "lastPrice", "ltp", "close", "currentValue"):
                try:
                    price = float(row.get(key))
                    if price > 0:
                        return {"available": True, "price": round(price, 2), "source": "NSE Indices Live Indices Watch"}
                except Exception:
                    pass
    raise RuntimeError("NIFTY 50 row/price not found")


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def update_history(history, snapshot, now_jst):
    history = history if isinstance(history, dict) else {}
    records = history.get("records") if isinstance(history.get("records"), list) else []
    history = {
        "schema_version": 2,
        "basis": "One representative snapshot closest to 14:00 JST on regular NSE trading days",
        "records": records,
    }

    regular, _ = is_regular_nse_trading_day(now_jst)
    if not regular or not (dtime(13, 45) <= now_jst.time() <= dtime(14, 20)):
        return history
    price_iso = snapshot.get("nifty", {}).get("as_of_jst")
    if not price_iso:
        return history
    try:
        price_dt = datetime.fromisoformat(price_iso)
    except Exception:
        return history
    if price_dt.date() != now_jst.date():
        return history

    target = datetime.combine(now_jst.date(), dtime(14, 0), tzinfo=JST)
    snap_distance = abs((price_dt - target).total_seconds())
    rec = {
        "date_jst": now_jst.date().isoformat(),
        "generated_at_jst": snapshot.get("generated_at_jst"),
        "price_as_of_jst": price_iso,
        "distance_from_1400_seconds": int(snap_distance),
        "nifty": snapshot.get("nifty"),
        "usdinr": snapshot.get("usdinr"),
        "brent": snapshot.get("brent"),
        "india_vix": snapshot.get("india_vix"),
        "breadth": snapshot.get("breadth"),
        "fii_dii": snapshot.get("fii_dii"),
        "signals": {
            "buy_setup_score": (snapshot.get("signals") or {}).get("buy_setup_score"),
            "sell_setup_score": (snapshot.get("signals") or {}).get("sell_setup_score"),
            "technical_buy_score": (snapshot.get("signals") or {}).get("technical_buy_score"),
            "technical_sell_score": (snapshot.get("signals") or {}).get("technical_sell_score"),
        },
    }
    same_idx = next((i for i, r in enumerate(records) if r.get("date_jst") == rec["date_jst"]), None)
    if same_idx is None:
        records.append(rec)
    else:
        old_dist = records[same_idx].get("distance_from_1400_seconds", 10**9)
        if snap_distance <= old_dist:
            records[same_idx] = rec
    records.sort(key=lambda r: r.get("date_jst", ""))
    history["records"] = records[-520:]
    return history


def comparison_from_history(current, history):
    records = (history or {}).get("records") or []
    current_date = None
    try:
        current_date = datetime.fromisoformat(current["nifty"]["as_of_jst"]).date().isoformat()
    except Exception:
        pass
    candidates = [r for r in records if r.get("date_jst") and r.get("date_jst") != current_date]
    if not candidates:
        return {
            "available": False,
            "basis": "前回14:00保存値",
            "message": "14:00履歴を蓄積中です。異なる営業日の保存値が2回分以上あると比較できます。",
        }
    prev = candidates[-1]

    def val(obj, path):
        cur = obj
        for key in path:
            if not isinstance(cur, dict):
                return None
            cur = cur.get(key)
        return cur

    fields = {
        "nifty_price": (("nifty", "price"), 2),
        "usdinr": (("usdinr", "price"), 4),
        "brent": (("brent", "price"), 2),
        "rsi14_confirmed": (("nifty", "rsi14"), 2),
        "rsi14_provisional": (("nifty", "provisional", "rsi14"), 2),
        "macd_hist_confirmed": (("nifty", "macd_hist"), 3),
        "macd_hist_provisional": (("nifty", "provisional", "macd_hist"), 3),
    }
    values = {}
    for name, (path, digits) in fields.items():
        a, b = val(current, path), val(prev, path)
        # v3 history has no provisional technicals. Fall back to the confirmed value
        # until two v4 14:00 snapshots have accumulated.
        if b is None and name == "rsi14_provisional":
            b = val(prev, ("nifty", "rsi14"))
        if b is None and name == "macd_hist_provisional":
            b = val(prev, ("nifty", "macd_hist"))
        delta = None if a is None or b is None else float(a) - float(b)
        values[name] = {
            "current": round_or_none(a, digits),
            "previous": round_or_none(b, digits),
            "delta": round_or_none(delta, digits),
            "delta_pct": round_or_none(pct_change(a, b), 3) if name in ("nifty_price", "usdinr", "brent") else None,
        }
    return {
        "available": True,
        "basis": "前回14:00保存値",
        "previous_date_jst": prev.get("date_jst"),
        "previous_price_as_of_jst": prev.get("price_as_of_jst"),
        "values": values,
    }


def add_factor(target, factors, pts, label, detail):
    target[0] += pts
    factors.append({"points": pts, "label": label, "detail": detail})


def technical_core_score(nifty):
    bf, sf = [], []
    b, s = [0], [0]
    rsi = nifty.get("rsi14")
    rsi_prev = nifty.get("rsi14_prev")
    hist = nifty.get("macd_hist")
    hist_prev = nifty.get("macd_hist_prev")
    price = nifty.get("price")
    ma5 = nifty.get("ma5")
    pma25 = nifty.get("price_vs_ma25_pct")
    ret5 = nifty.get("ret5_pct")

    if rsi is not None:
        if rsi <= 30:
            add_factor(b, bf, 22, "RSI売られ過ぎ圏", f"RSI {rsi:.1f}")
        elif rsi <= 35:
            add_factor(b, bf, 16, "RSI低位", f"RSI {rsi:.1f}")
        elif rsi <= 40:
            add_factor(b, bf, 8, "RSIやや低位", f"RSI {rsi:.1f}")
        if rsi >= 70:
            add_factor(s, sf, 22, "RSI過熱圏", f"RSI {rsi:.1f}")
        elif rsi >= 65:
            add_factor(s, sf, 16, "RSI高位", f"RSI {rsi:.1f}")
        elif rsi >= 60:
            add_factor(s, sf, 8, "RSIやや高位", f"RSI {rsi:.1f}")
    if rsi is not None and rsi_prev is not None:
        if rsi > rsi_prev and rsi_prev < 45:
            add_factor(b, bf, 10, "RSI改善", f"{rsi_prev:.1f} → {rsi:.1f}")
        if rsi < rsi_prev and rsi_prev > 55:
            add_factor(s, sf, 10, "RSI失速", f"{rsi_prev:.1f} → {rsi:.1f}")

    if hist is not None and hist_prev is not None:
        if hist > hist_prev:
            add_factor(b, bf, 14, "MACDヒストグラム改善", f"{hist_prev:.2f} → {hist:.2f}")
        elif hist < hist_prev:
            add_factor(s, sf, 14, "MACDヒストグラム悪化", f"{hist_prev:.2f} → {hist:.2f}")
        if hist > 0 >= hist_prev:
            add_factor(b, bf, 8, "MACDヒストグラムがプラス転換", "モメンタム改善")
        if hist < 0 <= hist_prev:
            add_factor(s, sf, 8, "MACDヒストグラムがマイナス転換", "モメンタム悪化")

    if price is not None and ma5 is not None:
        if price >= ma5:
            add_factor(b, bf, 10, "5日線を上回る", f"価格 {price:.0f} / 5日線 {ma5:.0f}")
        else:
            add_factor(s, sf, 8, "5日線を下回る", f"価格 {price:.0f} / 5日線 {ma5:.0f}")
    if pma25 is not None:
        if pma25 <= -3:
            add_factor(b, bf, 8, "25日線から下方乖離", f"乖離 {pma25:.1f}%")
        if pma25 >= 5:
            add_factor(s, sf, 12, "25日線から上方乖離", f"乖離 +{pma25:.1f}%")
    if ret5 is not None and ret5 >= 5:
        add_factor(s, sf, 6, "5日間で急上昇", f"5日騰落率 +{ret5:.1f}%")
    return min(100, b[0]), min(100, s[0]), bf, sf


def score_setups(nifty, usdinr, brent, vix, breadth=None, fii_dii=None, basis_label="確定日足"):
    technical_buy, technical_sell, bf, sf = technical_core_score(nifty)
    b, s = [technical_buy], [technical_sell]

    for obj, label, buy_limit, sell_limit in (
        (usdinr, "USD/INR", 0.0, 1.0),
        (brent, "Brent", 0.0, 3.0),
        (vix, "India VIX", 0.0, 10.0),
    ):
        ch = (obj or {}).get("change_5d_pct")
        if ch is None:
            continue
        if ch <= buy_limit:
            add_factor(b, bf, 6, f"{label} 5日変化が落ち着く", f"{ch:+.1f}%")
        if ch >= sell_limit:
            add_factor(s, sf, 6, f"{label} 5日上昇", f"{ch:+.1f}%")

    if (breadth or {}).get("available"):
        ratio = breadth.get("advance_ratio_pct")
        if ratio is not None and ratio >= 60:
            add_factor(b, bf, 12, "市場の広がりが良好", f"NIFTY50上昇銘柄比率 {ratio:.1f}%")
        elif ratio is not None and ratio <= 40:
            add_factor(s, sf, 12, "市場の広がりが弱い", f"NIFTY50上昇銘柄比率 {ratio:.1f}%")

    if (fii_dii or {}).get("available"):
        net = ((fii_dii.get("fii") or {}).get("net_value_crore"))
        if net is not None and net >= 500:
            add_factor(b, bf, 5, "FII/FPI買い越し", f"公表済み日次 +{net:.0f} Cr")
        elif net is not None and net <= -500:
            add_factor(s, sf, 5, "FII/FPI売り越し", f"公表済み日次 {net:.0f} Crore")

    buy = min(100, b[0])
    sell = min(100, s[0])

    def label(score):
        if score >= 75:
            return "強い前兆"
        if score >= 55:
            return "前兆あり"
        if score >= 35:
            return "中立〜前兆"
        return "弱い"

    return {
        "buy_setup_score": buy,
        "sell_setup_score": sell,
        "technical_buy_score": technical_buy,
        "technical_sell_score": technical_sell,
        "buy_setup_label": label(buy),
        "sell_setup_label": label(sell),
        "buy_factors": sorted(bf, key=lambda x: -x["points"]),
        "sell_factors": sorted(sf, key=lambda x: -x["points"]),
        "technical_basis_used": basis_label,
        "definition": "0〜100は条件一致度であり、将来の上昇・下落確率ではありません。",
        "backtest_scope": "検証タブはNIFTY日足だけで再現できるテクニカル中核スコアを検証します。",
    }


def historical_technical_score(vals, arrays, i):
    if i < 1:
        return None, None
    d = {
        "price": vals[i],
        "rsi14": arrays["rsi"][i],
        "rsi14_prev": arrays["rsi"][i - 1],
        "macd_hist": arrays["hist"][i],
        "macd_hist_prev": arrays["hist"][i - 1],
        "ma5": arrays["ma5"][i],
        "price_vs_ma25_pct": pct_change(vals[i], arrays["ma25"][i]) if arrays["ma25"][i] else None,
        "ret5_pct": arrays["ret5"][i],
    }
    b, s, _, _ = technical_core_score(d)
    return b, s


def setup_backtest(dates, vals, arrays):
    if len(vals) < 300:
        return {"available": False, "message": "バックテスト用履歴不足"}

    returns20 = []
    for i in range(100, len(vals) - 20):
        r = pct_change(vals[i + 20], vals[i])
        if r is not None:
            returns20.append(r)
    baseline = {
        "sample_count": len(returns20),
        "up_rate_pct": round_or_none(sum(x > 0 for x in returns20) / len(returns20) * 100, 1) if returns20 else None,
        "down_rate_pct": round_or_none(sum(x < 0 for x in returns20) / len(returns20) * 100, 1) if returns20 else None,
        "avg_return_20d_pct": round_or_none(statistics.fmean(returns20), 2) if returns20 else None,
        "median_return_20d_pct": round_or_none(statistics.median(returns20), 2) if returns20 else None,
    }

    def collect(kind, threshold):
        rows = []
        last_selected = -999
        for i in range(100, len(vals) - 20):
            b, s = historical_technical_score(vals, arrays, i)
            score = b if kind == "buy" else s
            if score is None or score < threshold:
                continue
            if i - last_selected < 5:
                continue
            last_selected = i
            r5 = pct_change(vals[i + 5], vals[i])
            r20 = pct_change(vals[i + 20], vals[i])
            path = [pct_change(vals[j], vals[i]) for j in range(i + 1, i + 21)]
            rows.append({
                "date": dates[i],
                "score": score,
                "return_5d_pct": r5,
                "return_20d_pct": r20,
                "max_drawdown_20d_pct": min(path) if path else None,
                "max_upside_20d_pct": max(path) if path else None,
            })
        r20s = [r["return_20d_pct"] for r in rows if r["return_20d_pct"] is not None]
        r5s = [r["return_5d_pct"] for r in rows if r["return_5d_pct"] is not None]
        dds = [r["max_drawdown_20d_pct"] for r in rows if r["max_drawdown_20d_pct"] is not None]
        ups = [r["max_upside_20d_pct"] for r in rows if r["max_upside_20d_pct"] is not None]
        success = sum(x > 0 for x in r20s) / len(r20s) * 100 if kind == "buy" and r20s else \
                  sum(x < 0 for x in r20s) / len(r20s) * 100 if kind == "sell" and r20s else None
        base_rate = baseline.get("up_rate_pct") if kind == "buy" else baseline.get("down_rate_pct")
        return {
            "threshold": threshold,
            "sample_count": len(r20s),
            "success_rate_20d_pct": round_or_none(success, 1),
            "success_rate_lift_vs_baseline_pctpt": round_or_none(success - base_rate, 1) if success is not None and base_rate is not None else None,
            "avg_return_5d_pct": round_or_none(statistics.fmean(r5s), 2) if r5s else None,
            "avg_return_20d_pct": round_or_none(statistics.fmean(r20s), 2) if r20s else None,
            "median_return_20d_pct": round_or_none(statistics.median(r20s), 2) if r20s else None,
            "median_max_drawdown_20d_pct": round_or_none(statistics.median(dds), 2) if dds else None,
            "median_max_upside_20d_pct": round_or_none(statistics.median(ups), 2) if ups else None,
            "recent_examples": rows[-5:],
        }

    return {
        "available": True,
        "basis": f"NIFTY 50 日足・取得可能な約10年、重複局面を5営業日間隔で間引き（最終 {dates[-1]}）",
        "baseline": baseline,
        "buy": [collect("buy", x) for x in (35, 55, 70)],
        "sell": [collect("sell", x) for x in (35, 55, 70)],
        "warning": "これはテクニカル中核スコアの過去検証です。USD/INR、Brent、VIX、騰落銘柄数、FII/DIIを含む現在の総合スコアそのものの的中率ではありません。",
    }


def nearest_analog_outlook(dates, vals, arrays, k=35):
    last = len(vals) - 1
    if last < 120:
        return {"available": False, "message": "履歴不足"}

    def feat(i):
        ma25 = arrays["ma25"][i]
        ma75 = arrays["ma75"][i]
        rsi = arrays["rsi"][i]
        hist = arrays["hist"][i]
        ret5 = arrays["ret5"][i]
        vol = arrays["vol20"][i]
        if None in (ma25, ma75, rsi, hist, ret5, vol) or not vals[i]:
            return None
        return (
            rsi,
            (vals[i] / ma25 - 1) * 100,
            (ma25 / ma75 - 1) * 100,
            hist / vals[i] * 100,
            ret5,
            vol,
        )

    cur = feat(last)
    if cur is None:
        return {"available": False, "message": "現在の特徴量不足"}
    scales = (15.0, 3.0, 2.5, 0.5, 4.0, 8.0)
    candidates = []
    for i in range(90, len(vals) - 20):
        f = feat(i)
        if f is None:
            continue
        dist = math.sqrt(sum(((a - b) / s) ** 2 for a, b, s in zip(f, cur, scales)))
        candidates.append((dist, i))
    candidates.sort()

    selected = []
    for dist, i in candidates:
        if all(abs(i - j) >= 8 for _, j in selected):
            selected.append((dist, i))
        if len(selected) >= k:
            break
    if len(selected) < 10:
        return {"available": False, "message": "類似局面のサンプル不足"}

    fwd, drawdowns, examples, dists = [], [], [], []
    for dist, i in selected:
        r20 = pct_change(vals[i + 20], vals[i])
        path = [pct_change(vals[j], vals[i]) for j in range(i + 1, i + 21)]
        dd = min(path) if path else None
        fwd.append(r20)
        dists.append(dist)
        if dd is not None:
            drawdowns.append(dd)
        examples.append({
            "date": dates[i],
            "distance": round(dist, 3),
            "return_20d_pct": round_or_none(r20, 2),
            "max_drawdown_20d_pct": round_or_none(dd, 2),
        })

    fwd_sorted = sorted(fwd)
    q25 = fwd_sorted[max(0, int((len(fwd_sorted) - 1) * 0.25))]
    q75 = fwd_sorted[max(0, int((len(fwd_sorted) - 1) * 0.75))]
    up_rate = sum(x > 0 for x in fwd) / len(fwd) * 100
    median = statistics.median(fwd)
    mean = statistics.fmean(fwd)
    iqr = q75 - q25
    median_dist = statistics.median(dists)

    if median >= 2.0 and up_rate >= 60:
        label = "上向き"
    elif median >= 0.75 and up_rate >= 55:
        label = "やや上向き"
    elif median <= -2.0 and up_rate <= 40:
        label = "下向き"
    elif median <= -0.75 and up_rate <= 45:
        label = "やや下向き"
    else:
        label = "中立"

    if len(fwd) >= 30 and iqr <= 7 and median_dist <= 2.0:
        ref = "中"
    elif len(fwd) >= 20 and iqr <= 10:
        ref = "低〜中"
    else:
        ref = "低"

    return {
        "available": True,
        "label": label,
        "statistical_reference": ref,
        "basis_date": dates[last],
        "horizon": "20営業日（約1か月）",
        "analog_count": len(fwd),
        "up_rate_pct": round(up_rate, 1),
        "mean_return_pct": round(mean, 2),
        "median_return_pct": round(median, 2),
        "q25_return_pct": round(q25, 2),
        "q75_return_pct": round(q75, 2),
        "median_max_drawdown_pct": round(statistics.median(drawdowns), 2) if drawdowns else None,
        "median_similarity_distance": round(median_dist, 2),
        "method": "RSI、25日線乖離、25/75日線関係、MACDヒストグラム、5日騰落率、20日ボラティリティが近い過去局面を検索。",
        "warning": "過去類似局面の上昇割合は将来の上昇確率ではありません。統計参考度が低い場合は方向判定を弱く扱ってください。",
        "examples": examples[:10],
    }


def anomaly_stats(dates, vals):
    if len(vals) < 300:
        return {"available": False}

    daily_ret = [None] + [pct_change(vals[i], vals[i - 1]) for i in range(1, len(vals))]
    all_rets = [x for x in daily_ret if x is not None]
    baseline_avg = statistics.fmean(all_rets)
    baseline_up = sum(x > 0 for x in all_rets) / len(all_rets) * 100

    by_weekday = defaultdict(list)
    by_month = defaultdict(list)
    for i in range(1, len(vals)):
        dt = datetime.fromisoformat(dates[i]).date()
        r = daily_ret[i]
        if r is None:
            continue
        by_weekday[dt.weekday()].append(r)
        by_month[dt.month].append(r)

    jp_weekdays = ["月", "火", "水", "木", "金"]
    weekday_rows = []
    for wd in range(5):
        xs = by_weekday.get(wd, [])
        avg = statistics.fmean(xs) if xs else None
        weekday_rows.append({
            "weekday": jp_weekdays[wd],
            "sample_count": len(xs),
            "avg_return_pct": round_or_none(avg, 2),
            "up_rate_pct": round_or_none(sum(x > 0 for x in xs) / len(xs) * 100, 1) if xs else None,
            "excess_vs_baseline_pct": round_or_none(avg - baseline_avg, 2) if avg is not None else None,
        })

    month_rows = []
    for m in range(1, 13):
        xs = by_month.get(m, [])
        avg = statistics.fmean(xs) if xs else None
        month_rows.append({
            "month": m,
            "sample_count": len(xs),
            "avg_return_pct": round_or_none(avg, 2),
            "up_rate_pct": round_or_none(sum(x > 0 for x in xs) / len(xs) * 100, 1) if xs else None,
            "excess_vs_baseline_pct": round_or_none(avg - baseline_avg, 2) if avg is not None else None,
        })

    month_indices = defaultdict(list)
    for i, d in enumerate(dates):
        dt = datetime.fromisoformat(d).date()
        month_indices[(dt.year, dt.month)].append(i)
    turn_idx = set()
    for ids in month_indices.values():
        turn_idx.update(ids[:3])
        turn_idx.update(ids[-3:])
    turn_rets = [daily_ret[i] for i in sorted(turn_idx) if i > 0 and daily_ret[i] is not None]
    other_rets = [daily_ret[i] for i in range(1, len(vals)) if i not in turn_idx and daily_ret[i] is not None]

    three_down_1, three_down_20 = [], []
    large_down_1, large_down_20 = [], []
    for i in range(3, len(vals) - 20):
        if all(daily_ret[j] is not None and daily_ret[j] < 0 for j in (i - 2, i - 1, i)):
            three_down_1.append(pct_change(vals[i + 1], vals[i]))
            three_down_20.append(pct_change(vals[i + 20], vals[i]))
        if daily_ret[i] is not None and daily_ret[i] <= -1.5:
            large_down_1.append(pct_change(vals[i + 1], vals[i]))
            large_down_20.append(pct_change(vals[i + 20], vals[i]))

    last_three_down = len(vals) >= 4 and all(daily_ret[j] is not None and daily_ret[j] < 0 for j in range(len(vals) - 3, len(vals)))
    last_large_down = daily_ret[-1] is not None and daily_ret[-1] <= -1.5
    last_dt = datetime.fromisoformat(dates[-1]).date()
    ids = month_indices[(last_dt.year, last_dt.month)]
    last_turn = (len(vals) - 1) in set(ids[:3] + ids[-3:])

    def stat(xs):
        avg = statistics.fmean(xs) if xs else None
        return {
            "sample_count": len(xs),
            "avg_return_pct": round_or_none(avg, 2),
            "up_rate_pct": round_or_none(sum(x > 0 for x in xs) / len(xs) * 100, 1) if xs else None,
            "excess_vs_baseline_pct": round_or_none(avg - baseline_avg, 2) if avg is not None else None,
        }

    return {
        "available": True,
        "basis": f"NIFTY 50 日足・取得可能な過去約10年（最終 {dates[-1]}）",
        "baseline": {
            "sample_count": len(all_rets),
            "avg_return_pct": round_or_none(baseline_avg, 2),
            "up_rate_pct": round_or_none(baseline_up, 1),
        },
        "weekday": weekday_rows,
        "month": month_rows,
        "turn_of_month": {
            "definition": "各月の最初3営業日と最後3営業日",
            "current_applicable": last_turn,
            "turn_days": stat(turn_rets),
            "other_days": stat(other_rets),
        },
        "after_three_down": {
            "definition": "3営業日連続下落後",
            "current_applicable": last_three_down,
            "next_1d": stat(three_down_1),
            "next_20d": stat(three_down_20),
        },
        "after_large_down": {
            "definition": "1日で-1.5%以下下落した後",
            "current_applicable": last_large_down,
            "next_1d": stat(large_down_1),
            "next_20d": stat(large_down_20),
        },
        "warning": "アノマリーは過去の統計的傾向です。全期間平均との差も併記しますが、偶然・制度変更・相場環境変化で再現しない可能性があります。",
    }


def build_data_quality(result, now_jst):
    reasons = []
    state = result.get("market_state") or {}
    core_fetch = result.get("core_fetch") or {}
    core_defs = (("nifty", "NIFTY"), ("usdinr", "USD/INR"), ("brent", "Brent"))
    core_sources = {}
    all_fresh = True
    any_fallback = False
    live_stale = False
    technical_stale = False

    for key, label in core_defs:
        meta = core_fetch.get(key) or {}
        status = meta.get("status", "unknown")
        as_of = (result.get(key) or {}).get("as_of_jst")
        age = iso_age_minutes(as_of, now_jst)
        core_sources[key] = {
            "label": label,
            "status": status,
            "fetched_this_run": bool(meta.get("fetched_this_run")),
            "provider": meta.get("provider") or (result.get(key) or {}).get("provider"),
            "provider_symbol": meta.get("provider_symbol") or (result.get(key) or {}).get("provider_symbol"),
            "as_of_jst": as_of,
            "age_minutes": round_or_none(age, 1),
            "error": meta.get("error"),
        }
        if status != "fresh":
            all_fresh = False
            if status == "fallback":
                any_fallback = True
                reasons.append(f"{label}は今回取得できず、前回取得値を表示しています。")
            else:
                reasons.append(f"{label}の利用可能な値を確認できません。")
        if state.get("code") == "LIVE" and age is not None and age > 30:
            live_stale = True
            reasons.append(f"取引中ですが{label}の価格時刻が約{age:.0f}分古い状態です。")
        if key == "nifty":
            tstatus = meta.get("technical_status")
            tdate = meta.get("technical_date") or (result.get("nifty") or {}).get("technical_date")
            if tstatus == "cached":
                reasons.append(f"NIFTY確定テクニカルは前回保存値（{tdate or '日付不明'}）を使用しています。")
                try:
                    td = datetime.strptime(str(tdate), "%Y-%m-%d").date()
                    age_days = (now_jst.astimezone(IST).date() - td).days
                    if age_days > 5:
                        technical_stale = True
                        reasons.append(f"NIFTY確定テクニカルが{age_days}日古いため、最新判断を保留します。")
                except Exception:
                    technical_stale = True
                    reasons.append("NIFTY確定テクニカルの基準日を確認できないため、最新判断を保留します。")

    cc = result.get("crosscheck") or {}
    crosscheck_mismatch = bool(cc.get("available") and cc.get("diff_pct") is not None and abs(cc["diff_pct"]) > 0.5)
    if crosscheck_mismatch:
        reasons.append(f"NIFTYの参考価格と公式クロスチェックの差が{cc['diff_pct']:+.2f}%あります。")

    if not all_fresh:
        freshness = "FALLBACK" if any_fallback else "UNAVAILABLE"
    elif state.get("code") == "LIVE":
        freshness = "STALE" if live_stale else "FRESH"
    elif state.get("code") in ("CLOSED", "PREVIOUS_SESSION", "OUT_OF_HOURS"):
        freshness = "EXPECTED_NONLIVE"
    else:
        freshness = "UNKNOWN"

    if all_fresh and state.get("code") == "LIVE" and not live_stale and not crosscheck_mismatch and not technical_stale:
        gate = {"code": "OK", "label": "判断データ良好", "allow_rule": True}
    else:
        gate = {"code": "HOLD", "label": "売買ルール判定保留", "allow_rule": False}
        if not all_fresh:
            reasons.append("主要3データが今回すべて更新できていないため、前兆・購入ルールを最新判断として確定しません。")
        if state.get("code") != "LIVE":
            reasons.append("通常取引時間中ではないため、第1弾購入ルールは自動確定しません。")
        elif live_stale:
            reasons.append("取引中の主要価格に遅延があるため、最新判断を保留します。")
        elif technical_stale:
            reasons.append("確定テクニカルの更新が古いため、最新判断を保留します。")

    optional_available = sum(
        bool((result.get(k) or {}).get("available"))
        for k in ("breadth", "fii_dii")
    ) + (1 if (result.get("india_vix") or {}).get("price") is not None else 0)

    return {
        "freshness": freshness,
        "decision_gate": gate,
        "reasons": list(dict.fromkeys(reasons)),
        "core_sources": core_sources,
        "all_core_fresh_this_run": all_fresh,
        "optional_context_available_count": optional_available,
        "official_holiday_calendar_loaded": now_jst.year == 2026,
        "policy": "前回値は表示継続しても、今回取得に失敗した主要データを使って最新の売買判断を確定しない。",
    }


def build_summary(nifty, signals, outlook, breadth, fii_dii, quality):
    parts = []
    tech = (nifty.get("provisional") or {}) if (nifty.get("provisional") or {}).get("available") else nifty
    price, ma5, ma25, ma75 = (tech.get(k) for k in ("price", "ma5", "ma25", "ma75"))
    if price is not None and ma5 is not None:
        parts.append("短期は5日線を上回っています" if price >= ma5 else "短期は5日線を下回っています")
    if price is not None and ma25 is not None and ma75 is not None:
        if price >= ma25 and price >= ma75:
            parts.append("25日線・75日線より上です")
        elif price < ma25 and price < ma75:
            parts.append("25日線・75日線より下です")
        else:
            parts.append("中期移動平均線の間に位置しています")
    rsi = tech.get("rsi14")
    if rsi is not None:
        if rsi <= 35:
            parts.append(f"RSIは{rsi:.1f}で低位です")
        elif rsi >= 65:
            parts.append(f"RSIは{rsi:.1f}で高位です")
        else:
            parts.append(f"RSIは{rsi:.1f}で中立圏です")
    if (breadth or {}).get("available"):
        parts.append(f"NIFTY50の上昇銘柄比率は{breadth.get('advance_ratio_pct'):.0f}%です")
    if (fii_dii or {}).get("available") and (fii_dii.get("fii") or {}).get("net_value_crore") is not None:
        net = fii_dii["fii"]["net_value_crore"]
        parts.append(f"公表済みFII/FPIは{'買い越し' if net >= 0 else '売り越し'}です")
    if outlook.get("available"):
        parts.append(f"過去類似局面の20営業日見通しは「{outlook.get('label')}」です")
    gate = (quality.get("decision_gate") or {}).get("label")
    if gate:
        parts.append(f"データ判定は「{gate}」です")
    return "。".join(parts) + ("。" if parts else "")


def main():
    old = load_json(MARKET_OUT, {})
    now_utc = datetime.now(timezone.utc)
    now_jst = now_utc.astimezone(JST)
    result = dict(old) if isinstance(old, dict) else {}
    errors = []
    optional_errors = []
    core_fetch = {}
    provider_symbols = dict((old.get("provider_symbols") or {}) if isinstance(old, dict) else {})
    provider_symbols.setdefault("twelvedata", {})

    daily_dates = []
    daily_vals = []
    arrays = None

    def record_core_failure(key, label, exc):
        msg = str(exc)
        errors.append(f"{label}: {msg}")
        old_obj = (old.get(key) or {}) if isinstance(old, dict) else {}
        if old_obj.get("price") is not None:
            result[key] = old_obj
            core_fetch[key] = {
                "status": "fallback",
                "fetched_this_run": False,
                "reused_previous_value": True,
                "previous_as_of_jst": old_obj.get("as_of_jst"),
                "error": msg,
            }
        else:
            result[key] = {"price": None}
            core_fetch[key] = {
                "status": "unavailable",
                "fetched_this_run": False,
                "reused_previous_value": False,
                "error": msg,
            }

    # NIFTY v4.3: current quote is free Google Finance; long history is the official
    # NSE Indices historical endpoint. If history is temporarily unavailable, a fresh
    # quote may use recently saved confirmed technicals instead of falsely becoming a
    # stale price. Yahoo remains the last-resort full-bundle fallback.
    try:
        bundle, provider_name, provider_symbol = fetch_nifty_bundle(old)
        provider_meta, t_now, p_now, ds, _ = bundle
        if provider_name == "Twelve Data":
            provider_symbols["twelvedata"]["nifty"] = provider_symbol

        history_error = (provider_meta or {}).get("history_error") if isinstance(provider_meta, dict) else None
        if len(ds) >= 100:
            daily_vals = [c for _, c in ds]
            daily_dates = [datetime.fromtimestamp(t, timezone.utc).astimezone(IST).date().isoformat() for t, _ in ds]
            arrays = build_indicator_arrays(daily_vals)
            i = len(daily_vals) - 1
            quote_date = datetime.fromtimestamp(t_now, timezone.utc).astimezone(IST).date()
            last_daily_date = datetime.fromtimestamp(ds[-1][0], timezone.utc).astimezone(IST).date()
            previous_close = daily_vals[-2] if quote_date == last_daily_date and len(daily_vals) >= 2 else daily_vals[-1]
            provisional = build_provisional_technicals(daily_dates, daily_vals, p_now, t_now)
            result["nifty"] = {
                "symbol": "^NSEI",
                "provider_symbol": provider_symbol,
                "provider": provider_name,
                "price": round_or_none(p_now, 2),
                "as_of_jst": iso_jst(t_now),
                "previous_close": round_or_none(previous_close, 2),
                "change_pct": round_or_none(pct_change(p_now, previous_close), 3),
                "technical_close": round_or_none(daily_vals[i], 2),
                "technical_date": daily_dates[i],
                "ma5": round_or_none(arrays["ma5"][i], 2),
                "ma25": round_or_none(arrays["ma25"][i], 2),
                "ma75": round_or_none(arrays["ma75"][i], 2),
                "rsi14": round_or_none(arrays["rsi"][i], 2),
                "rsi14_prev": round_or_none(arrays["rsi"][i - 1], 2),
                "macd": round_or_none(arrays["macd"][i], 3),
                "macd_signal": round_or_none(arrays["signal"][i], 3),
                "macd_hist": round_or_none(arrays["hist"][i], 3),
                "macd_hist_prev": round_or_none(arrays["hist"][i - 1], 3),
                "ret5_pct": round_or_none(arrays["ret5"][i], 2),
                "ret20_pct": round_or_none(arrays["ret20"][i], 2),
                "vol20_annualized_pct": round_or_none(arrays["vol20"][i], 2),
                "price_vs_ma5_pct": round_or_none(pct_change(p_now, arrays["ma5"][i]), 2),
                "price_vs_ma25_pct": round_or_none(pct_change(p_now, arrays["ma25"][i]), 2),
                "price_vs_ma75_pct": round_or_none(pct_change(p_now, arrays["ma75"][i]), 2),
                "technical_basis": "前営業日までの確定日足",
                "provisional": provisional,
            }
            technical_status = "fresh"
        else:
            old_n = (old.get("nifty") or {}) if isinstance(old, dict) else {}
            cached_date = _derive_saved_technical_date(old_n)
            required_metrics = ("ma5", "ma25", "ma75", "rsi14", "macd", "macd_signal")
            if not cached_date or not all(old_n.get(k) is not None for k in required_metrics):
                raise RuntimeError("NIFTY current quote fetched, but daily history unavailable and no usable saved technical cache exists")
            # v4.1/v4.2 stored technical_as_of_jst rather than technical_date. Migrate it
            # in-place so the cached technicals can be used safely during the grace period.
            result["nifty"] = dict(old_n)
            result["nifty"]["technical_date"] = cached_date
            if result["nifty"].get("technical_close") is None:
                result["nifty"]["technical_close"] = old_n.get("previous_close")
            if result["nifty"].get("macd_hist") is None and old_n.get("macd") is not None and old_n.get("macd_signal") is not None:
                result["nifty"]["macd_hist"] = round_or_none(float(old_n["macd"]) - float(old_n["macd_signal"]), 3)
            previous_close = result["nifty"].get("technical_close") or old_n.get("previous_close")
            result["nifty"].update({
                "symbol": "^NSEI",
                "provider_symbol": provider_symbol,
                "provider": provider_name + " / saved technicals",
                "price": round_or_none(p_now, 2),
                "as_of_jst": iso_jst(t_now),
                "previous_close": round_or_none(previous_close, 2),
                "change_pct": round_or_none(pct_change(p_now, previous_close), 3) if previous_close else None,
                "price_vs_ma5_pct": round_or_none(pct_change(p_now, old_n.get("ma5")), 2) if old_n.get("ma5") else None,
                "price_vs_ma25_pct": round_or_none(pct_change(p_now, old_n.get("ma25")), 2) if old_n.get("ma25") else None,
                "price_vs_ma75_pct": round_or_none(pct_change(p_now, old_n.get("ma75")), 2) if old_n.get("ma75") else None,
                "technical_basis": "前回保存の確定日足（履歴取得一時失敗）",
                "provisional": {"available": False, "message": "日足履歴を今回更新できないため暫定テクニカルは省略"},
            })
            technical_status = "cached"
            if history_error:
                optional_errors.append("NIFTY historical: " + history_error)

        core_fetch["nifty"] = {
            "status": "fresh",
            "fetched_this_run": True,
            "as_of_jst": iso_jst(t_now),
            "provider": provider_name,
            "provider_symbol": provider_symbol,
            "technical_status": technical_status,
            "technical_date": (result.get("nifty") or {}).get("technical_date"),
            "technical_error": history_error,
            "error": None,
        }
        result["market_state"] = market_state(t_now, now_jst)
    except Exception as e:
        record_core_failure("nifty", "NIFTY", e)
        result["market_state"] = market_state_from_saved(result.get("nifty"), now_jst)

    # USD/INR: free Twelve Data FX first, then Google. Brent: Google first.
    # Five-day external-factor changes are optional; missing change data does not block core freshness.
    for key, label, symbol in (("usdinr", "USD/INR", "INR=X"), ("brent", "Brent", "BZ=F")):
        try:
            bundle, provider_name, provider_symbol = fetch_simple_bundle(key, symbol, old)
            _, ts, price, _, change5 = bundle
            if provider_name == "Twelve Data":
                provider_symbols["twelvedata"][key] = provider_symbol
            result[key] = {
                "symbol": symbol,
                "provider_symbol": provider_symbol,
                "provider": provider_name,
                "price": round_or_none(price, 4 if key == "usdinr" else 2),
                "as_of_jst": iso_jst(ts),
                "change_5d_pct": round_or_none(change5, 2),
            }
            core_fetch[key] = {"status": "fresh", "fetched_this_run": True, "as_of_jst": iso_jst(ts), "provider": provider_name, "provider_symbol": provider_symbol, "error": None}
        except Exception as e:
            record_core_failure(key, label, e)
        time.sleep(0.8)

    # Optional India VIX. Preserve a previous valid value if this run fails, but
    # mark it as fallback so it cannot masquerade as a fresh optional factor.
    vix_fetch_status = "unavailable"
    try:
        vix_provider = None
        vix_errors = []
        try:
            ts, price, _ = google_finance_quote("INDIA_VIX:INDEXNSE", IST)
            change5 = None
            vix_provider = "Google Finance"
        except Exception as ge:
            vix_errors.append("Google Finance: " + str(ge))
            _, ts, price, _, change5 = yahoo_daily_bundle("^INDIAVIX", "1mo")
            vix_provider = "Yahoo Finance"
        result["india_vix"] = {
            "symbol": "^INDIAVIX",
            "provider": vix_provider,
            "price": round_or_none(price, 2),
            "as_of_jst": iso_jst(ts),
            "change_5d_pct": round_or_none(change5, 2),
            "data_status": "fresh",
        }
        vix_fetch_status = "fresh"
    except Exception as e:
        old_vix = old.get("india_vix") or {}
        if old_vix.get("price") is not None:
            result["india_vix"] = {**old_vix, "data_status": "fallback"}
            vix_fetch_status = "fallback"
        else:
            result["india_vix"] = {"symbol": "^INDIAVIX", "price": None, "change_5d_pct": None, "data_status": "unavailable"}
        optional_errors.append("India VIX: " + str(e))

    regular_today, _ = is_regular_nse_trading_day(now_jst)
    # Optional official sources are attempted only on regular trading days and
    # only when NIFTY itself was freshly obtained. Weekend/manual runs therefore
    # avoid predictable 403s and unnecessary latency.
    if regular_today and core_fetch.get("nifty", {}).get("status") == "fresh":
        try:
            official = fetch_nifty_official_crosscheck()
            yprice = (result.get("nifty") or {}).get("price")
            diff = pct_change(yprice, official.get("price")) if yprice and official.get("price") else None
            result["crosscheck"] = {
                **official,
                "reference_price": yprice,
                "diff_pct": round_or_none(diff, 3),
                "status": "match" if diff is not None and abs(diff) <= 0.5 else "check",
            }
        except Exception as e:
            result["crosscheck"] = {"available": False, "source": "NSE Indices Live Indices Watch"}
            optional_errors.append("NIFTY official cross-check: " + str(e))

        try:
            opener = nse_opener()
            try:
                result["breadth"] = fetch_nse_breadth(opener)
            except Exception as e:
                result["breadth"] = {"available": False, "source": "NSE India NIFTY 50 constituent live data"}
                optional_errors.append("NSE breadth: " + str(e))
            try:
                result["fii_dii"] = fetch_nse_fiidii(opener)
            except Exception as e:
                result["fii_dii"] = {"available": False, "source": "NSE India FII/FPI & DII activity"}
                optional_errors.append("NSE FII/DII: " + str(e))
        except Exception as e:
            result["breadth"] = {"available": False, "source": "NSE India NIFTY 50 constituent live data"}
            result["fii_dii"] = {"available": False, "source": "NSE India FII/FPI & DII activity"}
            optional_errors.append("NSE session: " + str(e))
    else:
        result["crosscheck"] = {"available": False, "skipped": True, "source": "NSE Indices Live Indices Watch", "reason": "休場日またはNIFTY最新取得失敗のため省略"}
        result["breadth"] = {"available": False, "skipped": True, "source": "NSE India NIFTY 50 constituent live data", "reason": "休場日またはNIFTY最新取得失敗のため省略"}
        result["fii_dii"] = {"available": False, "skipped": True, "source": "NSE India FII/FPI & DII activity", "reason": "休場日またはNIFTY最新取得失敗のため省略"}

    fresh_count = sum((core_fetch.get(k) or {}).get("status") == "fresh" for k in ("nifty", "usdinr", "brent"))
    fallback_count = sum((core_fetch.get(k) or {}).get("status") == "fallback" for k in ("nifty", "usdinr", "brent"))
    status = "ok" if fresh_count == 3 else ("partial" if fresh_count > 0 else ("fallback" if fallback_count > 0 else "error"))

    result.update(
        {
            "schema_version": SCHEMA_VERSION,
            "app_version": APP_VERSION,
            "generated_at_utc": now_utc.isoformat(timespec="seconds"),
            "generated_at_jst": now_jst.isoformat(timespec="seconds"),
            "status": status,
            "core_fetch": core_fetch,
            "provider_symbols": provider_symbols,
            "source": "Zero-cost provider priority: NIFTY=Google Finance quote + official NSE Indices history; USD/INR=Twelve Data free FX -> Google Finance; Brent=Google Finance; Yahoo Finance is last-resort fallback; optional NSE live context may be unavailable on hosted runners",
            "errors": errors,
            "optional_errors": optional_errors,
            "note": "v4.3.1 free-only: no paid market-data plan is required. Public web sources can change or throttle; failed core fetches retain the previous value only for continuity and never qualify as a fresh trading decision.",
        }
    )

    result["data_quality"] = build_data_quality(result, now_jst)
    gate = (result.get("data_quality") or {}).get("decision_gate") or {}
    all_core_fresh = bool((result.get("data_quality") or {}).get("all_core_fresh_this_run"))

    if core_fetch.get("nifty", {}).get("status") == "fresh":
        n = result["nifty"]
        p = n.get("provisional") or {}
        if arrays and daily_vals and (result.get("market_state") or {}).get("code") == "LIVE" and p.get("available"):
            score_nifty = {
                **n,
                **{k: p.get(k) for k in (
                    "price", "ma5", "ma25", "ma75", "rsi14", "rsi14_prev", "macd", "macd_signal",
                    "macd_hist", "macd_hist_prev", "ret5_pct", "vol20_annualized_pct",
                    "price_vs_ma5_pct", "price_vs_ma25_pct", "price_vs_ma75_pct"
                )}
            }
            score_basis = "14:00暫定テクニカル"
        elif (core_fetch.get("nifty") or {}).get("technical_status") == "cached":
            score_nifty = n
            score_basis = "前回保存の確定日足テクニカル"
        else:
            score_nifty = n
            score_basis = "確定日足テクニカル"

        # External factors are used only if freshly fetched in this run.
        fresh_usd = result.get("usdinr", {}) if core_fetch.get("usdinr", {}).get("status") == "fresh" else {}
        fresh_brent = result.get("brent", {}) if core_fetch.get("brent", {}).get("status") == "fresh" else {}
        fresh_vix = result.get("india_vix", {}) if vix_fetch_status == "fresh" else {}
        result["signals"] = score_setups(
            score_nifty, fresh_usd, fresh_brent, fresh_vix,
            result.get("breadth", {}), result.get("fii_dii", {}), basis_label=score_basis,
        )
        result["signals"].update({
            "available": True,
            "decision_eligible": bool(gate.get("allow_rule")),
            "status": "fresh" if all_core_fresh and arrays and daily_vals else "technical_cached_reference",
            "display_note": "最新判断に使用可能" if gate.get("allow_rule") else "参考表示。データ品質ゲートにより売買判断は保留。",
        })

        if arrays and daily_vals:
            result["outlook_1m"] = nearest_analog_outlook(daily_dates, daily_vals, arrays)
            result["outlook_1m"]["_data_status"] = "fresh"
            result["anomalies"] = anomaly_stats(daily_dates, daily_vals)
            result["anomalies"]["_data_status"] = "fresh"
            result["score_backtest"] = setup_backtest(daily_dates, daily_vals, arrays)
            result["score_backtest"]["_data_status"] = "fresh"
        else:
            for key, default in (
                ("outlook_1m", {"available": False, "message": "NIFTY日足履歴を今回更新できず算出保留"}),
                ("anomalies", {"available": False, "message": "NIFTY日足履歴を今回更新できず算出保留"}),
                ("score_backtest", {"available": False, "message": "NIFTY日足履歴を今回更新できず算出保留"}),
            ):
                prior = old.get(key)
                if isinstance(prior, dict) and prior:
                    result[key] = {**prior, "_data_status": "fallback", "_message": "確定日足履歴を今回更新できなかったため前回計算結果を表示"}
                else:
                    result[key] = default
    else:
        old_sig = old.get("signals") or {}
        result["signals"] = {
            "available": False,
            "decision_eligible": False,
            "status": "not_updated",
            "message": "NIFTYの最新取得に失敗したため、前兆スコアを今回は更新していません。",
            "last_valid_score": {
                "buy_setup_score": old_sig.get("buy_setup_score"),
                "sell_setup_score": old_sig.get("sell_setup_score"),
                "generated_at_jst": old.get("generated_at_jst"),
            },
            "definition": "前回スコアは参考情報としてのみ保持し、最新判断には使用しません。",
        }
        for key, default in (
            ("outlook_1m", {"available": False, "message": "NIFTY日足の最新取得に失敗"}),
            ("anomalies", {"available": False, "message": "NIFTY日足の最新取得に失敗"}),
            ("score_backtest", {"available": False, "message": "NIFTY日足の最新取得に失敗"}),
        ):
            prior = old.get(key)
            if isinstance(prior, dict) and prior:
                result[key] = {**prior, "_data_status": "fallback", "_message": "今回NIFTY履歴を更新できなかったため前回計算結果を表示"}
            else:
                result[key] = default

    history = load_json(HISTORY_OUT, {"schema_version": 2, "records": []})
    if all_core_fresh:
        result["comparison"] = comparison_from_history(result, history)
    else:
        result["comparison"] = {
            "available": False,
            "basis": "前回14:00保存値",
            "message": "主要データに前回値が含まれるため、今回の前回比較は保留しています。",
        }

    result["summary"] = build_summary(
        result.get("nifty", {}), result.get("signals", {}), result.get("outlook_1m", {}),
        result.get("breadth", {}), result.get("fii_dii", {}), result.get("data_quality", {}),
    )

    # Never contaminate 14:00 history with fallback values.
    if all_core_fresh:
        history = update_history(history, result, now_jst)
    HISTORY_OUT.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")

    MARKET_OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "status": result["status"],
        "schema_version": SCHEMA_VERSION,
        "app_version": APP_VERSION,
        "core_fetch": {k: (core_fetch.get(k) or {}).get("status") for k in ("nifty", "usdinr", "brent")},
        "errors": errors,
        "optional_errors": optional_errors,
        "decision_gate": ((result.get("data_quality") or {}).get("decision_gate") or {}).get("code"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
