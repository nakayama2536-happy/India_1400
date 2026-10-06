import re
import unittest
from types import SimpleNamespace
from pathlib import Path

class PagesCandidateContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = Path(".github/workflows/deploy-pages.yml").read_text(encoding="utf-8")

    def test_existing_gate_runs_before_artifact(self):
        self.assertIn("python scripts/public_delivery_gate.py", self.text)
        self.assertRegex(self.text, r"build-pages-artifact:\n\s+needs: validate-public-delivery")

    def test_deploy_cannot_bypass_gate(self):
        self.assertRegex(self.text, r"(?s)deploy-pages:.*?needs: \[validate-public-delivery, build-pages-artifact\]")

    def test_pull_request_cannot_deploy(self):
        self.assertIn("if: github.event_name != 'pull_request'", self.text)

    def test_main_push_is_explicit_trigger(self):
        self.assertRegex(self.text, r"(?s)push:\n\s+branches: \[main\]")

    def test_artifact_job_has_no_always_override(self):
        block = self.text.split("build-pages-artifact:", 1)[1].split("deploy-pages:", 1)[0]
        self.assertNotIn("always()", block)

    def test_no_market_calculation_or_private_workflow(self):
        for forbidden in ("update_market.py", "v48_enhance.py", "PUBLIC_REPO_TOKEN", "git push", "force push"):
            self.assertNotIn(forbidden, self.text)

    def test_pinned_pages_actions(self):
        self.assertIn("actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d", self.text)
        self.assertIn("actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9", self.text)
        self.assertIn("actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346", self.text)

    def completion_result(self, event='workflow_run', conclusion='success', branch='main',
                          repo='owner/repo', upstream_event='schedule'):
        github = SimpleNamespace(event_name=event, repository='owner/repo', run_id=123,
            event=SimpleNamespace(workflow_run=SimpleNamespace(conclusion=conclusion,
                head_branch=branch, head_repository=SimpleNamespace(full_name=repo),
                event=upstream_event)))
        condition = re.search(r'validate-public-delivery:\n\s+if: (.+)', self.text).group(1)
        group = re.search(r'  group: \$\{\{ (.+) \}\}', self.text).group(1)
        # Evaluate the actual restricted workflow expressions, not a separate policy copy.
        scope = {'github': github, 'format': lambda pattern, value: pattern.format(value)}
        def evaluate(expr):
            return eval(expr.replace('&&', ' and ').replace('||', ' or '),
                        {'__builtins__': {}}, scope)
        return evaluate(condition), evaluate(group)

    def test_fund_completion_trigger_is_narrow(self):
        self.assertRegex(self.text, r"workflow_run:\n\s+workflows: \['Update India Core fund NAV'\]\n\s+types: \[completed\]\n\s+branches: \[main\]")
        for event in ('schedule', 'workflow_dispatch', 'push'):
            self.assertEqual(self.completion_result(upstream_event=event), (True, 'pages'))

    def test_untrusted_or_failed_completions_cannot_publish_or_cancel_pages(self):
        cases = [dict(conclusion=x) for x in ('failure', 'cancelled', 'skipped', '')]
        cases += [dict(branch='feature/test'), dict(repo='fork/repo'),
                  dict(upstream_event='pull_request'), dict(upstream_event='repository_dispatch')]
        for case in cases:
            with self.subTest(case=case):
                self.assertEqual(self.completion_result(**case), (False, 'pages-ignored-123'))

    def test_existing_triggers_remain_supported(self):
        for event in ('push', 'workflow_dispatch'):
            self.assertEqual(self.completion_result(event=event), (True, 'pages'))
        self.assertEqual(self.completion_result(event='pull_request'), (True, 'pages-pr-123'))

    def test_validated_commit_is_reused_without_upstream_artifacts(self):
        self.assertIn("ref: ${{ github.event_name == 'workflow_run' && 'main' || github.sha }}", self.text)
        self.assertIn('sha=$(git rev-parse HEAD)', self.text)
        self.assertIn('ref: ${{ needs.validate-public-delivery.outputs.source_sha }}', self.text)
        self.assertNotIn('download-artifact', self.text)
        self.assertNotIn('actions: write', self.text)

    def test_manifest_is_built_from_artifact_and_checked_before_upload(self):
        build = self.text.index('python scripts/build_publication_manifest.py --root _site')
        check = self.text.index("== build(root)")
        upload = self.text.index('actions/upload-pages-artifact@')
        self.assertLess(build, check)
        self.assertLess(check, upload)
        self.assertIn('validate(root)', self.text)
        self.assertIn('tests.test_publication_manifest', self.text)

if __name__ == "__main__":
    unittest.main()
