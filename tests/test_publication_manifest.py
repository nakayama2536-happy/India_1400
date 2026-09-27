import json
import tempfile
import unittest
from pathlib import Path
import importlib.util

SPEC=importlib.util.spec_from_file_location("publication_manifest","scripts/build_publication_manifest.py")
mod=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

class PublicationManifestTests(unittest.TestCase):
    def fixture(self):
        td=tempfile.TemporaryDirectory()
        root=Path(td.name)
        for path,source_id,purpose,kind in mod.SOURCES:
            p=root/path
            if kind=="json":
                value={"schema_version":1,"records":[{"date":"2026-09-27","value":1}]}
                if path=="market.json":
                    value={"schema_version":1,"generated_at_jst":"2026-09-27T14:03:00+09:00"}
                elif path=="common_snapshot.json":
                    value={"schema_version":"1.0","timestamps":{"market_as_of":"2026-09-27"}}
                elif path=="india_core.json":
                    value={"schema_version":1,"as_of_date":"2026-09-26"}
                p.write_text(json.dumps(value,ensure_ascii=False)+"\n",encoding="utf-8")
            else:
                p.write_text("APP_VERSION=5.7\nUI_VERSION=5.22\n",encoding="utf-8")
        return td,root

    def test_manifest_has_all_required_sources_and_is_deterministic(self):
        td,root=self.fixture()
        try:
            a=mod.build(root);b=mod.build(root)
            self.assertEqual(a,b)
            self.assertEqual(a["source_state"],"READY")
            self.assertEqual(len(a["files"]),10)
            self.assertEqual(a["publication_id"],b["publication_id"])
            self.assertTrue(a["publication_id"].startswith("in-"))
            self.assertTrue(all(x["status"]=="OK" and x["required_for_bundle"] for x in a["files"]))
        finally: td.cleanup()

    def test_content_change_changes_publication_id(self):
        td,root=self.fixture()
        try:
            a=mod.build(root)
            p=root/"market.json"
            value=json.loads(p.read_text())
            value["generated_at_jst"]="2026-09-27T14:08:00+09:00"
            p.write_text(json.dumps(value)+"\n")
            b=mod.build(root)
            self.assertNotEqual(a["publication_id"],b["publication_id"])
        finally: td.cleanup()

    def test_missing_required_file_fails_closed(self):
        td,root=self.fixture()
        try:
            (root/"common_snapshot.json").unlink()
            with self.assertRaises(FileNotFoundError):
                mod.build(root)
        finally: td.cleanup()

    def test_invalid_json_fails_closed(self):
        td,root=self.fixture()
        try:
            (root/"market.json").write_text("{bad",encoding="utf-8")
            with self.assertRaises(ValueError):
                mod.build(root)
        finally: td.cleanup()

    def test_manifest_never_contains_file_contents(self):
        td,root=self.fixture()
        try:
            m=mod.build(root)
            raw=json.dumps(m)
            self.assertNotIn("APP_VERSION=5.7",raw)
            self.assertNotIn("generated_at_jst",raw)
            for item in m["files"]:
                self.assertEqual(len(item["sha256"]),64)
                self.assertGreater(item["bytes"],0)
        finally: td.cleanup()

if __name__=="__main__":
    unittest.main()
