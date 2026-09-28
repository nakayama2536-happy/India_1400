import re
import unittest
from pathlib import Path

class PagesCandidateContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = Path(".github/workflows/pages-candidate.yml").read_text(encoding="utf-8")

    def test_existing_gate_runs_before_artifact(self):
        self.assertIn("python scripts/public_delivery_gate.py", self.text)
        self.assertRegex(self.text, r"build-pages-artifact:\n\s+needs: validate-public-delivery")

    def test_deploy_cannot_bypass_gate(self):
        self.assertRegex(self.text, r"(?s)deploy-pages:.*?needs: \[validate-public-delivery, build-pages-artifact\]")

    def test_candidate_cannot_deploy_before_manual_source_switch(self):
        self.assertRegex(self.text, r"(?s)deploy-pages:.*?if: false")

    def test_no_market_calculation_or_private_workflow(self):
        for forbidden in ("update_market.py", "v48_enhance.py", "PUBLIC_REPO_TOKEN", "git push", "force push"):
            self.assertNotIn(forbidden, self.text)

if __name__ == "__main__":
    unittest.main()
