#!/usr/bin/env python3
"""Update Eastspring India Core NAV and technical context.

Current NAV/previous-day change/net assets prefer Eastspring's official fund page.
SBI Securities remains the zero-cost history source used to build MA/RSI/MACD.
This data is display/reference information and is never used by NIFTY trading logic.
"""
from __future__ import annotations

from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import html
import json
import re
import urllib.request

OUT = Path("india_core.json")
HISTORY_OUT = Path("india_core_history.json")
JST = ZoneInfo("Asia/Tokyo")
OFFICIAL_URL = "https://www.eastspring.co.jp/funds/fund-listings/fund-details?isincode=200027"
SBI_URL = "https://site0.sbisec.co.jp/marble/fund/history/standardprice.do?fund_sec_code=83311227"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"


def fetch_text(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,*/*",
            "Accept-Language": "ja,en-US;q=0.8,en;q=0.7",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        ctype = r.headers.get_content_charset()
    for enc in [ctype, "utf-8", "cp932", "shift_jis", "euc_jp"]:
        if not enc:
            continue
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return raw.decode("utf-8", errors="replace")


def strip_html(src: str) -> str:
    text = re.sub(r"(?is)<script.*?</script>", " ", src)
    text = re.sub(r"(?is)<style.*?</style>", " ", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_official_snapshot(text: str):
    """Parse Eastspring's official current fund snapshot from visible page text."""
    date_match = re.search(r"更新日[:：]?\s*(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日", text)
    nav_match = re.search(r"基準価額\s*[（(]円[）)]\s*([0-9][0-9,]*)", text)
    change_match = re.search(r"前日比\s*[（(]円[）)]\s*([+\-−]?[0-9][0-9,]*)", text)
    assets_match = re.search(r"純資産総額\s*[（(]億円[）)]\s*([0-9][0-9,.]*)", text)
    if not (date_match and nav_match and change_match and assets_match):
        raise RuntimeError("Official Eastspring snapshot fields not found")
    date = f"{int(date_match.group(1)):04d}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"
    nav = int(nav_match.group(1).replace(",", ""))
    change = int(change_match.group(1).replace(",", "").replace("−", "-"))
    assets_oku = float(assets_match.group(1).replace(",", ""))
    if not (1000 <= nav <= 100000 and assets_oku >= 0):
        raise RuntimeError("Official Eastspring snapshot values out of range")
    return {
        "date": date,
        "nav_yen": nav,
        "change_yen": change,
        "net_assets_oku_yen": round(assets_oku, 2),
        "net_assets_million_yen": int(round(assets_oku * 100.0)),
    }


def parse_rows(text: str):
    # Expected visible sequence in SBI history table:
    # YYYY/MM/DD | 15,821円 | +346円 | 14,848百万円
    pattern = re.compile(
        r"(20\d{2}/\d{2}/\d{2})\s+"
        r"([0-9][0-9,]*)円\s+"
        r"([+\-−]?[0-9][0-9,]*)円\s+"
        r"([0-9][0-9,]*)百万円"
    )
    rows = {}
    for m in pattern.finditer(text):
        date = m.group(1).replace("/", "-")
        nav = int(m.group(2).replace(",", ""))
        change_raw = m.group(3).replace(",", "").replace("−", "-")
        change = int(change_raw)
        assets = int(m.group(4).replace(",", ""))
        if 1000 <= nav <= 100000 and assets >= 0:
            rows[date] = {"date": date, "nav_yen": nav, "change_yen": change, "net_assets_million_yen": assets}
    if not rows:
        raise RuntimeError("No valid SBI fund rows")
    return [rows[k] for k in sorted(rows)]


def sma(values, period):
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def ema_series(values, period):
    if not values:
        return []
    alpha = 2.0 / (period + 1.0)
    out = [float(values[0])]
    for value in values[1:]:
        out.append(alpha * float(value) + (1.0 - alpha) * out[-1])
    return out


def rsi14(values, period=14):
    if len(values) < period + 1:
        return None
    gains, losses = [], []
    for a, b in zip(values[-(period + 1):-1], values[-period:]):
        d = float(b) - float(a)
        gains.append(max(d, 0.0))
        losses.append(max(-d, 0.0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100.0 - 100.0 / (1.0 + rs)


def build_technical(rows):
    values = [float(r["nav_yen"]) for r in rows]
    ema12 = ema_series(values, 12)
    ema26 = ema_series(values, 26)
    macd_series = [a - b for a, b in zip(ema12, ema26)]
    signal_series = ema_series(macd_series, 9)
    macd = macd_series[-1] if macd_series else None
    signal = signal_series[-1] if signal_series else None
    ma25 = sma(values, 25)
    ma75 = sma(values, 75)
    rsi = rsi14(values)
    gc_dc = "GC" if ma25 is not None and ma75 is not None and ma25 >= ma75 else ("DC" if ma25 is not None and ma75 is not None else None)
    return {
        "available": len(values) >= 26,
        "method_version": "fund-tech-1",
        "basis_date": rows[-1]["date"] if rows else None,
        "history_count": len(values),
        "ma25": round(ma25, 2) if ma25 is not None else None,
        "ma75": round(ma75, 2) if ma75 is not None else None,
        "macd": round(macd, 3) if macd is not None else None,
        "macd_signal": round(signal, 3) if signal is not None else None,
        "macd_hist": round(macd - signal, 3) if macd is not None and signal is not None else None,
        "rsi14": round(rsi, 2) if rsi is not None else None,
        "gc_dc": gc_dc,
        "note": "基準価額履歴から25/75日線、EMA12/26、Signal9、RSI14を再計算。",
    }


def load_old():
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        return {}


def main():
    now = datetime.now(JST)
    old = load_old()
    try:
        sbi_page = strip_html(fetch_text(SBI_URL))
        rows = parse_rows(sbi_page)
        sbi_latest = rows[-1]

        official = None
        official_error = None
        try:
            official = parse_official_snapshot(strip_html(fetch_text(OFFICIAL_URL)))
        except Exception as e:
            official_error = str(e)

        # Use the official current snapshot when it is at least as recent as SBI.
        # SBI remains the history source for reproducible technical indicators.
        use_official = bool(official and official["date"] >= sbi_latest["date"])
        latest = official if use_official else sbi_latest
        if use_official:
            row_map = {r["date"]: dict(r) for r in rows}
            row_map[official["date"]] = {
                "date": official["date"],
                "nav_yen": official["nav_yen"],
                "change_yen": official["change_yen"],
                "net_assets_million_yen": official["net_assets_million_yen"],
            }
            rows = [row_map[k] for k in sorted(row_map)]

        date = latest["date"]
        nav = latest["nav_yen"]
        change = latest["change_yen"]
        assets = latest["net_assets_million_yen"]
        previous_nav = nav - change
        change_pct = (change / previous_nav * 100.0) if previous_nav else None
        technical = build_technical(rows)
        history_doc = {
            "schema_version": 2,
            "fund_key": "eastspring_india_core",
            "source": "SBI証券（履歴）",
            "source_url": SBI_URL,
            "updated_at_jst": now.isoformat(timespec="seconds"),
            "records": rows[-520:],
        }
        HISTORY_OUT.write_text(json.dumps(history_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        data = {
            "schema_version": 3,
            "fund_key": "eastspring_india_core",
            "fund_name": "イーストスプリング・インド・コア株式ファンド",
            "short_name": "インド・コア",
            "source": "イーストスプリング公式" if use_official else "SBI証券",
            "source_url": OFFICIAL_URL if use_official else SBI_URL,
            "official_source_url": OFFICIAL_URL,
            "history_source": "SBI証券（基準価額履歴）",
            "history_source_url": SBI_URL,
            "official_status": "ok" if use_official else ("older_than_sbi" if official else "unavailable"),
            "official_error": official_error,
            "fund_sec_code": "83311227",
            "as_of_date": date,
            "nav_yen": nav,
            "change_yen": change,
            "change_pct": round(change_pct, 4) if change_pct is not None else None,
            "net_assets_million_yen": assets,
            "net_assets_oku_yen": round(assets / 100.0, 2),
            "fetched_at_jst": now.isoformat(timespec="seconds"),
            "status": "ok",
            "technical": technical,
            "note": "最新値は運用会社公式を優先し、テクニカルはSBIの基準価額履歴から再計算します。NIFTYの3分割判定ロジックには混在させません。",
        }
    except Exception as e:
        data = dict(old) if isinstance(old, dict) else {}
        data.update({
            "schema_version": 1,
            "fund_key": "eastspring_india_core",
            "fund_name": "イーストスプリング・インド・コア株式ファンド",
            "short_name": "インド・コア",
            "source": "SBI証券",
            "source_url": old.get("source_url") or OFFICIAL_URL,
            "fund_sec_code": "83311227",
            "fetched_at_jst": now.isoformat(timespec="seconds"),
            "status": "fallback" if old else "error",
            "error": str(e),
            "note": "今回取得に失敗したため、保存済みの最新値がある場合は参考表示します。NIFTY売買判定には使用しません。",
        })
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": data.get("status"),
        "as_of_date": data.get("as_of_date"),
        "nav_yen": data.get("nav_yen"),
        "change_yen": data.get("change_yen"),
        "net_assets_million_yen": data.get("net_assets_million_yen"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
