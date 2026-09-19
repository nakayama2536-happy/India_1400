#!/usr/bin/env python3
import json, math, time, urllib.request, urllib.parse
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

OUT = Path("market.json")
UA = "Mozilla/5.0 (compatible; India1400PWA/2.0)"

def http_json(url, tries=3, timeout=20):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise last

def yahoo_chart(symbol, range_="10d", interval="5m"):
    enc = urllib.parse.quote(symbol, safe="")
    qs = urllib.parse.urlencode({"range": range_, "interval": interval, "includePrePost": "false", "events": "div,splits"})
    errors = []
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        url = f"https://{host}/v8/finance/chart/{enc}?{qs}"
        try:
            data = http_json(url)
            result = data.get("chart",{}).get("result")
            if not result:
                raise RuntimeError(str(data.get("chart",{}).get("error") or "empty result"))
            return result[0]
        except Exception as e:
            errors.append(f"{host}: {e}")
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

def completed_daily_closes(chart):
    s = series_from_chart(chart)
    india_now = datetime.now(ZoneInfo("Asia/Kolkata"))
    today = india_now.date()
    out = []
    for t, c in s:
        d = datetime.fromtimestamp(t, ZoneInfo("Asia/Kolkata")).date()
        # 14:00 JST is before India market close; exclude today's partial daily bar.
        if d == today and india_now.hour < 16:
            continue
        out.append((t, c))
    return out

def sma(vals, n):
    return sum(vals[-n:]) / n if len(vals) >= n else None

def ema_series(vals, n):
    if not vals:
        return []
    a = 2.0 / (n + 1.0)
    out = [vals[0]]
    for x in vals[1:]:
        out.append(a*x + (1-a)*out[-1])
    return out

def rsi_wilder(vals, n=14):
    if len(vals) < n+1:
        return None
    gains, losses = [], []
    for a,b in zip(vals[:-1], vals[1:]):
        d=b-a
        gains.append(max(d,0.0)); losses.append(max(-d,0.0))
    ag=sum(gains[:n])/n; al=sum(losses[:n])/n
    for g,l in zip(gains[n:],losses[n:]):
        ag=(ag*(n-1)+g)/n; al=(al*(n-1)+l)/n
    if al==0: return 100.0
    rs=ag/al
    return 100.0 - 100.0/(1.0+rs)

def macd(vals):
    if len(vals) < 35:
        return None, None
    e12=ema_series(vals,12); e26=ema_series(vals,26)
    line=[a-b for a,b in zip(e12,e26)]
    sig=ema_series(line,9)
    return line[-1], sig[-1]

def dt_jst(ts):
    return datetime.fromtimestamp(ts, timezone.utc).astimezone(ZoneInfo("Asia/Tokyo")).isoformat(timespec="minutes")

def round_or_none(x, n=4):
    return None if x is None or not math.isfinite(x) else round(x,n)

def load_old():
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        return {}

old = load_old()
result = dict(old) if isinstance(old,dict) else {}
errors = []
updated = 0

# NIFTY current + technicals
try:
    intr = yahoo_chart("^NSEI","5d","5m")
    t_now, p_now = last_value(intr)
    daily = yahoo_chart("^NSEI","1y","1d")
    ds = completed_daily_closes(daily)
    vals = [c for _,c in ds]
    if not vals:
        raise RuntimeError("no completed daily closes")
    prev = vals[-1]
    m, sig = macd(vals)
    result["nifty"] = {
        "symbol":"^NSEI",
        "price":round_or_none(p_now,2),
        "as_of_jst":dt_jst(t_now),
        "previous_close":round_or_none(prev,2),
        "change_pct":round_or_none((p_now/prev-1)*100,3) if prev else None,
        "ma5":round_or_none(sma(vals,5),2),
        "ma25":round_or_none(sma(vals,25),2),
        "ma75":round_or_none(sma(vals,75),2),
        "rsi14":round_or_none(rsi_wilder(vals,14),2),
        "macd":round_or_none(m,3),
        "macd_signal":round_or_none(sig,3),
        "technical_as_of_jst":dt_jst(ds[-1][0]),
        "technical_basis":"completed daily closes"
    }
    updated += 1
except Exception as e:
    errors.append("NIFTY: "+str(e))

for key, symbol in [("usdinr","INR=X"),("brent","BZ=F")]:
    try:
        ch = yahoo_chart(symbol,"5d","5m")
        t,p = last_value(ch)
        result[key]={"symbol":symbol,"price":round_or_none(p,4),"as_of_jst":dt_jst(t)}
        updated += 1
    except Exception as e:
        errors.append(f"{key}: {e}")

now_utc = datetime.now(timezone.utc)
now_jst = now_utc.astimezone(ZoneInfo("Asia/Tokyo"))
result.update({
    "generated_at_utc": now_utc.isoformat(timespec="seconds"),
    "generated_at_jst": now_jst.isoformat(timespec="seconds"),
    "status": "ok" if updated == 3 and not errors else ("partial" if updated else "error"),
    "source": "Yahoo Finance chart endpoint (reference data; no API key)",
    "errors": errors,
    "note": "Technicals use completed daily closes. Current quotes may be delayed."
})
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"status":result["status"],"updated":updated,"errors":errors}, ensure_ascii=False))
