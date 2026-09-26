"""Exercise the saved adapter without installing Langflow or calling a service."""
import ast
import json
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "langflow/v2/components/lf01/CustomComponent-tmEIP.py"
EXPORT = ROOT / "langflow/v2/lf01.json"


class PreparedRequestTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.code = SOURCE.read_text(encoding="utf-8")
        tree = ast.parse(cls.code)
        # Substitute only Langflow's framework objects, leaving the adapter logic
        # intact. No model, network client, or database is involved.
        tree.body = [node for node in tree.body if not (
            isinstance(node, ast.ImportFrom) and node.module.startswith("lfx.")
        )]
        namespace = {
            "Component": object,
            "Message": SimpleNamespace,
            "MessageTextInput": lambda **kwargs: kwargs,
            "Output": lambda **kwargs: kwargs,
        }
        exec(compile(tree, str(SOURCE), "exec"), namespace)
        cls.adapter = namespace["JejakZoneDBReader"]

    def run_adapter(self, value):
        instance = self.adapter()
        instance.input_value = value
        return json.loads(instance.build_output().text)

    def test_export_matches_source_and_removes_database_settings(self):
        flow = json.loads(EXPORT.read_text(encoding="utf-8"))
        node = next(node for node in flow["data"]["nodes"] if node["id"] == "CustomComponent-tmEIP")
        definition = node["data"]["node"]
        self.assertEqual(definition["template"]["code"]["value"], self.code)
        self.assertEqual(definition["field_order"], ["input_value"])
        self.assertEqual(set(definition["template"]), {"_type", "code", "input_value"})

    def test_prepared_stats_do_not_satisfy_dynamic_evidence(self):
        request = {
            "zone_id": "pancoran",
            "missing_evidence": ["headcount", "company_presence"],
            "zone_stats": {"working_age_population": 100000, "number_of_companies": 500},
            "db_satisfied": ["salary"],
        }
        self.assertEqual(self.run_adapter(json.dumps(request)), request)

    def test_empty_gaps_stay_empty(self):
        self.assertEqual(self.run_adapter({"missing_evidence": []})["missing_evidence"], [])

    def test_message_input_and_invalid_requests(self):
        self.assertEqual(self.run_adapter(SimpleNamespace(text='{"missing_evidence": []}'))["missing_evidence"], [])
        with self.assertRaisesRegex(ValueError, "INVALID_REQUEST"):
            self.run_adapter("[]")
        with self.assertRaisesRegex(ValueError, "INVALID_MISSING_EVIDENCE"):
            self.run_adapter({"missing_evidence": "headcount"})


if __name__ == "__main__":
    unittest.main()
