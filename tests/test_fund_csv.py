"""Distributor CSV fixtures, no live requests."""
from datetime import date, timedelta
import unittest
from test_fund_recovery import f, NOW, official


class BankHistory(unittest.TestCase):
    def test_bank_header_and_unit_validation(self):
        good = "年月日,基準価額（円）,純資産総額（百万円）,分配金（円）\n2026-09-28,15625,14673,\n2026-09-25,15679,14716,\n"
        rows = f.mufg.parse_history(good, NOW.date())
        self.assertEqual(rows[-1]["change_yen"], -54)
        self.assertIsNone(rows[0]["change_yen"])
        self.assertIsNone(rows[-1]["distribution_yen"])
        self.assertEqual(rows[-1]["net_assets_million_yen"], 14673)
        self.assertIn("not independent", rows[-1]["change_basis"])
        with self.assertRaises(ValueError):
            f.mufg.parse_history(good.replace("百万円", "億円"), NOW.date())

    def test_bank_invalid_future_or_duplicate_rows(self):
        header = ",".join(f.mufg.HEADERS) + "\n"
        for body in ("2026-09-30,15625,14673,", "2026-09-28,nan,14673,",
                     "2026-09-28,15625,14673,\n2026-09-28,9999,14673,",
                     "2026-09-28,15625,14673,,extra"):
            with self.subTest(body=body), self.assertRaises(ValueError):
                f.mufg.parse_history(header + body, NOW.date())

    def test_bank_history_complete_with_secondary_blocked(self):
        end = date(2026, 9, 28)
        header = ",".join(f.mufg.HEADERS) + "\n"
        body = "\n".join(f"{end-timedelta(days=i)},{15625-i},14673," for i in range(100))
        calls = []
        def fetch(url):
            calls.append(url)
            if url == f.OFFICIAL_URL: return official(change=1)
            if url == f.mufg.URL: return header + body
            raise OSError("secondary blocked")
        data, history = f.collect(NOW, {}, {}, fetch)
        self.assertEqual(data["source"], f.OFFICIAL)
        self.assertEqual(data["history_status"], "ok")
        self.assertEqual(data["technical"]["history_count"], 100)
        self.assertTrue(data["technical"]["available"])
        self.assertEqual(len(history["records"]), 100)
        self.assertFalse(any(url.startswith(f.YAHOO_HISTORY_URL) for url in calls))
        self.assertEqual(data["net_assets_million_yen"], 14670)
        self.assertEqual(history["records"][-2]["net_assets_million_yen"], 14673)

    def test_bank_history_does_not_fill_missing_dates(self):
        text = ",".join(f.mufg.HEADERS) + "\n2026-09-28,15625,14673,\n2026-09-01,15600,14600,"
        rows = f.mufg.parse_history(text, NOW.date())
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[-1]["change_yen"], 25)
        self.assertFalse(f.build_technical(rows)["available"])

    def test_bank_first_observation_and_distributions_preserved(self):
        text = ",".join(f.mufg.HEADERS) + "\n2022-07-29,10000,77,0\n2022-08-01,9885,76,100\n"
        rows = f.valid_rows(f.mufg.parse_history(text, NOW.date()), NOW.date())
        self.assertEqual(len(rows), 2)
        self.assertIsNone(rows[0]["change_yen"])
        self.assertEqual(rows[1]["distribution_yen"], 100)
        self.assertEqual(rows[1]["change_yen"], -115)


if __name__ == "__main__":
    unittest.main()
