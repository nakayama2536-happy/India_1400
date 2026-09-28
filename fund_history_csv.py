"""Parse the fund distributor's documented CSV; NAV is not total return."""
from __future__ import annotations
import csv
from datetime import date
import io

URL = "https://fs.bk.mufg.jp/webasp/mufg/fund/detail/chart/csv/m08320920.csv"
SOURCE = "三菱UFJ銀行（基準価額CSV）"
HEADERS = ["年月日", "基準価額（円）", "純資産総額（百万円）", "分配金（円）"]


def parse_history(text, today):
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    if reader.fieldnames != HEADERS:
        raise ValueError("MUFG CSV header/unit mismatch")
    values = {}
    for row in reader:
        if None in row or any(row[k] is None for k in HEADERS):
            raise ValueError("MUFG malformed row")
        d = date.fromisoformat(row["年月日"])
        if not date(2022, 7, 29) <= d <= today:
            raise ValueError("MUFG invalid fund observation date")
        nav, assets = int(row["基準価額（円）"]), int(row["純資産総額（百万円）"])
        distribution = int(row["分配金（円）"]) if row["分配金（円）"].strip() else None
        if not 1000 <= nav <= 100000 or assets < 0 or (distribution is not None and distribution < 0):
            raise ValueError("MUFG invalid numeric observation")
        item = {"date": d.isoformat(), "nav_yen": nav, "net_assets_million_yen": assets,
                "distribution_yen": distribution, "source": SOURCE}
        if item["date"] in values and values[item["date"]] != item:
            raise ValueError("MUFG conflicting duplicate date")
        values[item["date"]] = item
    if not values:
        raise ValueError("MUFG CSV empty")
    out = [values[k] for k in sorted(values)]
    for i, row in enumerate(out):
        row["change_yen"] = row["nav_yen"] - out[i-1]["nav_yen"] if i else None
        row["change_basis"] = "adjacent reported CSV NAV difference; not independent continuity evidence" if i else "no preceding observation"
    return out
