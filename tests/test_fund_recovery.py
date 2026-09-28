"""Offline regressions; fixtures are synthetic and never production observations."""
from copy import deepcopy
from datetime import date, datetime, timedelta
import importlib.util
from pathlib import Path
import tempfile
import unittest
from urllib.parse import parse_qs, urlparse

SPEC = importlib.util.spec_from_file_location("fund_under_test", Path(__file__).resolve().parents[1] / "update_india_core.py")
f = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(f)
NOW = datetime(2026, 9, 29, 6, 0, tzinfo=f.JST)


def row(i=0):
    return {"date": (date(2026, 1, 1) + timedelta(days=i)).isoformat(),
            "nav_yen": 10000 + i, "change_yen": 1, "net_assets_million_yen": 5000}


def official(nav=15625, change=-54, d="2026年09月28日"):
    return f"{f.FUND_NAME} 更新日: {d} 基準価額（円）{nav:,} 前日比（円）{change} 純資産総額（億円）146.7"


def yahoo_text(rows):
    return " ".join(f"{r['date'].replace('-', '/')} {r['nav_yen']:,} {r['change_yen']:+} {r['net_assets_million_yen']:,}" for r in rows)


class FundRecovery(unittest.TestCase):
    def test_short_pages_do_not_stop_history(self):
        calls = []
        def fetch(url):
            p = int(parse_qs(urlparse(url).query)["page"][0]); calls.append(p)
            return yahoo_text([row(i) for i in range((p - 1) * 18, p * 18)])
        rows = f.fetch_yahoo_history(NOW, fetcher=fetch)
        self.assertEqual(len(rows), 90)
        self.assertEqual(calls, [1, 2, 3, 4, 5])

    def test_repeated_page_stops_without_loop(self):
        calls = []
        def fetch(url):
            calls.append(url); return yahoo_text([row(i) for i in range(18)])
        self.assertEqual(len(f.fetch_yahoo_history(NOW, fetcher=fetch)), 18)
        self.assertEqual(len(calls), 2)

    def test_conflicting_repeated_page_rejected(self):
        calls = []
        def fetch(url):
            calls.append(url)
            r = row(); r["nav_yen"] += len(calls)
            return yahoo_text([r])
        with self.assertRaises(ValueError):
            f.fetch_yahoo_history(NOW, fetcher=fetch)

    def test_empty_page_stops(self):
        self.assertEqual(f.fetch_yahoo_history(NOW, fetcher=lambda _: "no records"), [])

    def test_official_fetched_before_failed_secondaries(self):
        calls = []
        def fetch(url):
            calls.append(url)
            if url == f.OFFICIAL_URL:
                return official()
            raise OSError("unavailable")
        data, history = f.collect(NOW, {}, {}, fetch)
        self.assertEqual(calls[0], f.OFFICIAL_URL)
        self.assertEqual(data["nav_yen"], 15625)
        self.assertEqual(data["source"], f.OFFICIAL)
        self.assertEqual(data["history_status"], "insufficient")
        self.assertEqual(len(history["records"]), 1)

    def test_secondary_failure_does_not_erase_history(self):
        cached = {"records": [row(i) for i in range(200)]}
        def fetch(url):
            if url == f.OFFICIAL_URL: return official()
            raise OSError("blocked")
        before = deepcopy(cached)
        data, history = f.collect(NOW, {}, cached, fetch)
        self.assertEqual(len(history["records"]), 201)
        self.assertEqual(cached, before)
        self.assertEqual(data["as_of_date"], "2026-09-28")

    def test_history_gap_cannot_masquerade_as_complete(self):
        def fetch(url):
            if url == f.OFFICIAL_URL: return official()
            raise OSError("offline")
        data, history = f.collect(NOW, {}, {"records": [row(i) for i in range(200)]}, fetch)
        self.assertEqual(len(history["records"]), 201)
        self.assertEqual(data["history_status"], "inconsistent")
        self.assertFalse(data["technical"]["available"])
        self.assertIsNone(data["technical"]["ma75"])

    def test_history_not_capped_at_520(self):
        cached = []
        for i in range(600):
            r = row(); r["date"] = (date(2023, 1, 1) + timedelta(days=i)).isoformat(); cached.append(r)
        self.assertEqual(len(f.merge_history(cached, [], None, NOW.date())), 600)

    def test_identical_duplicates_deduplicate(self):
        self.assertEqual(len(f.merge_history([row()], [(f.SBI, [row()])], None, NOW.date())), 1)

    def test_conflicting_history_preserved_and_technical_held(self):
        r = row(); sbi = f"{r['date'].replace('-', '/')} 10,100円 +1円 5,000百万円"
        def fetch(url):
            if url == f.OFFICIAL_URL: return official()
            if url == f.SBI_URL: return sbi
            return "no rows"
        data, history = f.collect(NOW, {}, {"records": [r]}, fetch)
        self.assertIsNone(history)
        self.assertEqual(data["source"], f.OFFICIAL)
        self.assertFalse(data["technical"]["available"])
        self.assertEqual(data["history_status"], "error")

    def test_official_resolves_current_date_disagreement(self):
        a, b, c = row(), row(), row()
        b["nav_yen"], c["nav_yen"] = 10050, 10060
        rows = f.merge_history([a], [(f.SBI, [b])], c, NOW.date())
        self.assertEqual(rows[0]["nav_yen"], 10060)

    def test_official_provenance_not_replaced(self):
        r = {**row(), "source": f.OFFICIAL}
        rows = f.merge_history([r], [(f.SBI, [row()])], None, NOW.date())
        self.assertEqual(rows[0]["source"], f.OFFICIAL)

    def test_fallback_retains_original_time_and_source(self):
        old = {"nav_yen": 15625, "as_of_date": "2026-09-28", "source": f.OFFICIAL,
               "fetched_at_jst": "2026-09-28T22:00:00+09:00"}
        def fetch(_): raise OSError("offline")
        data, history = f.collect(NOW, old, {}, fetch)
        self.assertEqual(data["fetched_at_jst"], old["fetched_at_jst"])
        self.assertEqual(data["source"], old["source"])
        self.assertEqual(data["status"], "fallback")
        self.assertIsNone(history)

    def test_older_quote_does_not_roll_back(self):
        old = {"nav_yen": 15625, "as_of_date": "2026-09-28"}
        def fetch(url):
            if url == f.OFFICIAL_URL: return official(d="2026年09月25日")
            raise OSError("offline")
        data, history = f.collect(NOW, old, {}, fetch)
        self.assertEqual(data["as_of_date"], old["as_of_date"])
        self.assertEqual(data["status"], "fallback")

    def test_malformed_cache_does_not_block_official_nav(self):
        def fetch(url):
            if url == f.OFFICIAL_URL: return official()
            raise OSError("offline")
        data, history = f.collect(NOW, {}, {"_load_error": True}, fetch)
        self.assertEqual(data["nav_yen"], 15625)
        self.assertIsNone(history)
        self.assertEqual(data["history_status"], "error")

    def test_invalid_rows_rejected(self):
        for key, val in [("date", "2026-09-30"), ("date", "2026-02-30"),
                         ("nav_yen", float("nan")), ("nav_yen", True),
                         ("nav_yen", 0), ("net_assets_million_yen", -1)]:
            with self.subTest(key=key, val=val), self.assertRaises(ValueError):
                f.valid_rows([{**row(), key: val}], NOW.date())

    def test_official_identity_and_fields(self):
        self.assertEqual(f.parse_official_snapshot(official())["change_yen"], -54)
        with self.assertRaises(ValueError):
            f.parse_official_snapshot(official().replace(f.FUND_NAME, "different fund"))

    def test_readiness_and_formula_preservation(self):
        t = f.build_technical([row(i) for i in range(18)])
        self.assertFalse(t["available"])
        self.assertIsNone(t["macd"])
        self.assertIsNone(t["ma25"])
        full = f.build_technical([row(i) for i in range(100)])
        self.assertTrue(full["available"])
        self.assertEqual(full["ma25"], 10087)
        self.assertEqual(full["ma75"], 10062)
        self.assertEqual(full["rsi14"], 100)
        # Independent scalar EMA recurrence, identical to prior implementation.
        e12 = e26 = 10000.; sig = 0.
        for i in range(1, 100):
            e12 = (10000 + i) * 2 / 13 + e12 * 11 / 13
            e26 = (10000 + i) * 2 / 27 + e26 * 25 / 27
            sig = (e12 - e26) * 0.2 + sig * 0.8
        self.assertEqual(full["macd"], round(e12 - e26, 3))
        self.assertEqual(full["macd_signal"], round(sig, 3))

    def test_basis_mismatch_is_not_full_ready(self):
        self.assertFalse(f.build_technical([row(i) for i in range(100)], "2026-09-28")["available"])

    def test_json_writes_are_parseable(self):
        with tempfile.TemporaryDirectory() as root:
            p = Path(root) / "history.json"
            f.write_json(p, {"records": [row()]})
            self.assertEqual(f.load_document(p)["records"], [row()])
            with self.assertRaises(ValueError):
                f.write_json(p, {"bad": float("nan")})
            self.assertEqual(f.load_document(p)["records"], [row()])


if __name__ == "__main__":
    unittest.main()
