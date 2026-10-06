import unittest
from datetime import datetime
from pathlib import Path
from scripts.fund_refresh_gate import decide


class FundRefreshGateTests(unittest.TestCase):
    def test_evening_old_value_retries(self):
        self.assertTrue(decide('push', datetime.fromisoformat('2026-10-06T20:34:00+09:00'),
                               {'fetched_at_jst': '2026-10-06T06:39:19+09:00'})[0])

    def test_recent_attempt_does_not_repeat_even_if_nav_is_old(self):
        self.assertFalse(decide('push', datetime.fromisoformat('2026-10-06T20:54:00+09:00'),
                                {'attempted_at_jst': '2026-10-06T20:34:00+09:00',
                                 'as_of_date': '2026-10-05'})[0])

    def test_boundaries_and_timezone(self):
        for stamp, expected in [('2026-10-06T17:59:59+09:00', False),
                                ('2026-10-06T09:00:00+00:00', True),
                                ('2026-10-06T23:59:59+09:00', True),
                                ('2026-10-07T00:00:00+09:00', False),
                                ('2026-10-10T20:00:00+09:00', False)]:
            with self.subTest(stamp=stamp):
                self.assertEqual(decide('push', datetime.fromisoformat(stamp), {})[0], expected)

    def test_cooldown_boundary(self):
        now = datetime.fromisoformat('2026-10-06T21:00:00+09:00')
        self.assertTrue(decide('push', now, {'attempted_at_jst': '2026-10-06T20:00:00+09:00'})[0])

    def test_corrupt_or_future_timestamp_fails_closed(self):
        for stamp in ['bad', '2026-10-06T20:00:00', '2026-10-07T20:00:00+09:00']:
            with self.subTest(stamp=stamp), self.assertRaises(ValueError):
                decide('push', datetime.fromisoformat('2026-10-06T20:00:00+09:00'), {'attempted_at_jst': stamp})

    def test_existing_triggers_and_untrusted_event(self):
        now = datetime.fromisoformat('2026-10-10T12:00:00+09:00')
        for event in ['schedule', 'workflow_dispatch']:
            self.assertTrue(decide(event, now, {})[0])
        self.assertFalse(decide('pull_request', now, {})[0])

    def test_workflow_scope_no_loop_and_protected_active_run(self):
        text = Path('.github/workflows/update-india-core.yml').read_text()
        self.assertIn("paths: ['market.json']", text)
        self.assertIn('cancel-in-progress: false', text)
        self.assertIn('ref: main', text)
        for name in ['Update India Core latest NAV', 'Check India Core update status', 'Commit fund data']:
            self.assertIn(f"- name: {name}\n        if: steps.refresh.outputs.run == 'true'", text)
