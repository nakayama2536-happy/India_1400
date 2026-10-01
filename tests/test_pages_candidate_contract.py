import re
import unittest
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

if __name__ == "__main__":
    unittest.main()
