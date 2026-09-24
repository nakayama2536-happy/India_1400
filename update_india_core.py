#!/usr/bin/env python3
"""Update latest NAV for Eastspring India Core fund from SBI Securities.

Zero-cost public-source updater. Writes india_core.json only.
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
JST = ZoneInfo("Asia/Tokyo")
URL = "https://site0.sbisec.co.jp/marble/fund/history/standardprice.do?fund_sec_code=83311227"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"


def fetch_text():
    req = urllib.request.Request(
        URL,
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


def parse_latest(text: str):
    # Expected visible sequence in SBI history table:
    # YYYY/MM/DD | 15,821円 | +346円 | 14,848百万円
    pattern = re.compile(
        r"(20\d{2}/\d{2}/\d{2})\s+"
        r"([0-9][0-9,]*)円\s+"
        r"([+\-−]?[0-9][0-9,]*)円\s+"
        r"([0-9][0-9,]*)百万円"
    )
    matches = list(pattern.finditer(text))
    if not matches:
        raise RuntimeError("SBI fund row not found")
    rows = []
    for m in matches:
        date = m.group(1).replace("/", "-")
        nav = int(m.group(2).replace(",", ""))
        change_raw = m.group(3).replace(",", "").replace("−", "-")
        change = int(change_raw)
        assets = int(m.group(4).replace(",", ""))
        if 1000 <= nav <= 100000 and assets >= 0:
            rows.append((date, nav, change, assets))
    if not rows:
        raise RuntimeError("No valid SBI fund rows")
    rows.sort(key=lambda x: x[0], reverse=True)
    return rows[0]


def load_old():
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        return {}


def main():
    now = datetime.now(JST)
    old = load_old()
    try:
        page = strip_html(fetch_text())
        date, nav, change, assets = parse_latest(page)
        previous_nav = nav - change
        change_pct = (change / previous_nav * 100.0) if previous_nav else None
        data = {
            "schema_version": 1,
            "fund_key": "eastspring_india_core",
            "fund_name": "イーストスプリング・インド・コア株式ファンド",
            "short_name": "インド・コア",
            "source": "SBI証券",
            "source_url": URL,
            "fund_sec_code": "83311227",
            "as_of_date": date,
            "nav_yen": nav,
            "change_yen": change,
            "change_pct": round(change_pct, 4) if change_pct is not None else None,
            "net_assets_million_yen": assets,
            "net_assets_oku_yen": round(assets / 100.0, 2),
            "fetched_at_jst": now.isoformat(timespec="seconds"),
            "status": "ok",
            "note": "基準価額は投信の最新状況表示用で、NIFTYの売買判定ロジックには使用しません。",
        }
    except Exception as e:
        data = dict(old) if isinstance(old, dict) else {}
        data.update({
            "schema_version": 1,
            "fund_key": "eastspring_india_core",
            "fund_name": "イーストスプリング・インド・コア株式ファンド",
            "short_name": "インド・コア",
            "source": "SBI証券",
            "source_url": URL,
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
