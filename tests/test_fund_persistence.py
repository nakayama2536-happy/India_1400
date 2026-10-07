"""Real local Git remotes; no network, credentials, or production data writes."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from scripts import persist_fund_data as p


def git(root, *args):
    return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True,
                          text=True).stdout.strip()


class FundPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.remote = root / "remote.git"
        self.a, self.b = root / "fund", root / "other"
        git(root, "init", "--bare", "--initial-branch=main", str(self.remote))
        git(root, "clone", str(self.remote), str(self.a))
        self.identity(self.a)
        for name in p.DEPENDENCIES:
            path = self.a / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('{}' if name in p.OUTPUTS else '# fixture\n')
        (self.a / "market.json").write_text('{"revision": 1}')
        (self.a / "publication_manifest.json").write_text('{"revision": 1}')
        git(self.a, "add", ".")
        git(self.a, "commit", "-m", "initial")
        git(self.a, "push", "origin", "main")
        git(root, "clone", str(self.remote), str(self.b))
        self.identity(self.b)
        self.before = git(self.remote, "rev-parse", "main")

    def identity(self, root):
        git(root, "config", "user.name", "Fixture")
        git(root, "config", "user.email", "fixture@example.invalid")

    def candidate(self):
        for name in p.OUTPUTS:
            (self.a / name).write_text('{"revision": 2}')

    def advance(self, path="publication_manifest.json", value='{"revision": 2}'):
        (self.b / path).write_text(value)
        git(self.b, "add", "--", path)
        git(self.b, "commit", "-m", "concurrent update")
        git(self.b, "push", "origin", "main")

    def remote_text(self, name):
        return git(self.remote, "show", "main:" + name)

    def test_normal_save(self):
        self.candidate()
        result = p.persist(self.a)
        self.assertEqual(result["status"], "SAVED")
        self.assertEqual(result["attempts"], 1)
        for name in p.OUTPUTS:
            self.assertEqual(json.loads(self.remote_text(name))["revision"], 2)

    def test_noop_does_not_create_commit(self):
        self.assertEqual(p.persist(self.a)["status"], "UNCHANGED")
        self.assertEqual(git(self.remote, "rev-parse", "main"), self.before)

    def test_one_output_update_retains_history(self):
        (self.a / "india_core.json").write_text('{"revision": 2}')
        p.persist(self.a)
        self.assertEqual(self.remote_text("india_core_history.json"), '{}')

    def test_manifest_and_market_updates_are_preserved(self):
        self.candidate()
        self.advance()
        self.advance("market.json", '{"revision": 3}')
        p.persist(self.a)
        self.assertEqual(json.loads(self.remote_text("market.json"))["revision"], 3)
        self.assertEqual(json.loads(self.remote_text("publication_manifest.json"))["revision"], 2)
        changed = git(self.remote, "diff", "--name-only", "main^", "main").splitlines()
        self.assertEqual(set(changed), set(p.OUTPUTS))

    def test_each_changed_dependency_fails_closed(self):
        self.candidate()
        for name in p.DEPENDENCIES:
            with self.subTest(name=name):
                # Independent temporary repositories per case.
                case = FundPersistenceTests()
                case.setUp()
                try:
                    case.candidate()
                    case.advance(name, '{"newer": true}' if name in p.OUTPUTS else '# changed\n')
                    head = git(case.remote, "rev-parse", "main")
                    with self.assertRaisesRegex(RuntimeError, 'changed upstream'):
                        p.persist(case.a)
                    self.assertEqual(git(case.remote, "rev-parse", "main"), head)
                finally:
                    case.doCleanups()

    def test_race_after_fetch_retries_with_new_pinned_upstream(self):
        self.candidate()
        original = p.git
        commands = []
        def racing(root, *args, **kwargs):
            commands.append(args)
            if args[0] == 'push' and sum(c[0] == 'push' for c in commands) == 1:
                self.advance()
            return original(root, *args, **kwargs)
        with patch.object(p, 'git', side_effect=racing):
            report = p.persist(self.a)
        self.assertEqual(report['attempts'], 2)
        self.assertEqual(sum(c[0] == 'fetch' for c in commands), 2)
        rebases = [c[1] for c in commands if c[0] == 'rebase']
        self.assertTrue(all(len(sha) == 40 for sha in rebases))
        self.assertNotEqual(rebases[0], rebases[1])
        self.assertEqual(json.loads(self.remote_text('publication_manifest.json'))['revision'], 2)

    def test_fund_changes_between_attempts_are_not_overwritten(self):
        self.candidate()
        original = p.git
        def racing(root, *args, **kwargs):
            if args[0] == 'push':
                self.advance('india_core.json', '{"revision": 99}')
            return original(root, *args, **kwargs)
        with patch.object(p, 'git', side_effect=racing):
            with self.assertRaisesRegex(RuntimeError, 'changed upstream'):
                p.persist(self.a)
        self.assertEqual(json.loads(self.remote_text('india_core.json'))['revision'], 99)

    def test_continuous_race_stops_after_three_pushes(self):
        self.candidate()
        original = p.git
        count = 0
        def racing(root, *args, **kwargs):
            nonlocal count
            if args[0] == 'push':
                count += 1
                self.advance(value=json.dumps({'revision': 1 + count}))
            return original(root, *args, **kwargs)
        with patch.object(p, 'git', side_effect=racing):
            with self.assertRaisesRegex(RuntimeError, 'exceeded 3'):
                p.persist(self.a)
        self.assertEqual(count, 3)
        self.assertEqual(self.remote_text('india_core.json'), '{}')

    def test_non_race_push_failure_does_not_retry(self):
        self.candidate()
        original = p.git
        calls = []
        def denied(root, *args, **kwargs):
            calls.append(args[0])
            if args[0] == 'push':
                return subprocess.CompletedProcess([], 1, '', 'permission denied')
            return original(root, *args, **kwargs)
        with patch.object(p, 'git', side_effect=denied):
            with self.assertRaisesRegex(RuntimeError, 'not a retryable'):
                p.persist(self.a)
        self.assertEqual(calls.count('push'), 1)

    def test_unrelated_dirty_or_staged_changes_are_rejected(self):
        self.candidate()
        (self.a / 'market.json').write_text('{"changed": true}')
        for staged in [False, True]:
            if staged:
                git(self.a, 'add', 'market.json')
            with self.assertRaisesRegex(RuntimeError, 'Unexpected'):
                p.persist(self.a)
        self.assertEqual(git(self.remote, 'rev-parse', 'main'), self.before)

    def test_untracked_file_is_not_published(self):
        self.candidate()
        (self.a / 'unexpected.txt').write_text('fixture')
        with self.assertRaisesRegex(RuntimeError, 'Unexpected'):
            p.persist(self.a)

    def test_deleted_output_is_rejected(self):
        (self.a / 'india_core_history.json').unlink()
        with self.assertRaisesRegex(RuntimeError, 'Missing'):
            p.persist(self.a)

    def test_invalid_json_is_rejected(self):
        (self.a / 'india_core.json').write_text('not json')
        with self.assertRaises(ValueError):
            p.persist(self.a)

    def test_wrong_branch_is_rejected(self):
        git(self.a, 'switch', '-c', 'not-main')
        with self.assertRaisesRegex(RuntimeError, 'main checkout'):
            p.persist(self.a)

    def test_workflow_contract(self):
        workflow = Path('.github/workflows/update-india-core.yml').read_text()
        self.assertIn('fetch-depth: 0', workflow)
        self.assertIn('python scripts/persist_fund_data.py', workflow)
        self.assertNotIn('git push', workflow)
        tests = Path('.github/workflows/fund-recovery-tests.yml').read_text()
        self.assertEqual(tests.count("'scripts/persist_fund_data.py'"), 2)


if __name__ == '__main__':
    unittest.main()
