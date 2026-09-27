import json
import tempfile
import unittest
from pathlib import Path
from scripts.public_delivery_gate import validate

class DeliveryGateTests(unittest.TestCase):
    def root(self):
        return tempfile.TemporaryDirectory()

    def test_safe_public_json_passes(self):
        with self.root() as d:
            Path(d,"market.json").write_text(json.dumps({"nifty":{"price":25000}}),encoding="utf-8")
            self.assertTrue(validate(Path(d)))

    def test_nested_private_field_fails(self):
        with self.root() as d:
            Path(d,"market.json").write_text(json.dumps({"x":{"average_cost":1}}),encoding="utf-8")
            with self.assertRaises(ValueError): validate(Path(d))

    def test_credential_like_value_fails(self):
        with self.root() as d:
            value="github_pat_"+"1234567890ABCDEFGHIJKLMNO"
            Path(d,"market.json").write_text(json.dumps({"note":value}),encoding="utf-8")
            with self.assertRaises(ValueError): validate(Path(d))

    def test_burnin_file_fails_anywhere(self):
        with self.root() as d:
            Path(d,"burnin_evidence.json").write_text("{}",encoding="utf-8")
            with self.assertRaises(ValueError): validate(Path(d))

    def test_invalid_json_fails(self):
        with self.root() as d:
            Path(d,"market.json").write_text("{bad",encoding="utf-8")
            with self.assertRaises(json.JSONDecodeError): validate(Path(d))

if __name__=="__main__":
    unittest.main()
