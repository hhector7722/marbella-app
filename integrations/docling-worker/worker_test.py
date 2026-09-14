import unittest

from worker import docling_to_evidence, redact_error


class DoclingEvidenceAdapterTests(unittest.TestCase):
    def test_converts_docling_table_cells_without_business_mapping(self):
        raw = {
            "document": {
                "pages": {"1": {}},
                "body": {
                    "children": [
                        {
                            "label": "table",
                            "data": {
                                "table_cells": [
                                    {"start_row_offset_idx": 0, "start_col_offset_idx": 0, "text": "Artículo"},
                                    {"start_row_offset_idx": 0, "start_col_offset_idx": 1, "text": "Cantidad"},
                                    {"start_row_offset_idx": 1, "start_col_offset_idx": 0, "text": "Tomate"},
                                    {"start_row_offset_idx": 1, "start_col_offset_idx": 1, "text": "3"},
                                ]
                            },
                        }
                    ]
                },
            }
        }
        tables, metrics = docling_to_evidence(raw)
        self.assertEqual(metrics["page_count"], 1)
        self.assertEqual(metrics["table_count"], 1)
        self.assertEqual(tables[0]["columns"][0]["name"], "Artículo")
        self.assertEqual(tables[0]["rows"][0]["cells"][1]["raw_value"], "3")

    def test_reports_no_table_without_creating_purchase_lines(self):
        tables, metrics = docling_to_evidence({"document": {"pages": {"1": {}}, "body": {"children": []}}})
        self.assertEqual(tables, [])
        self.assertEqual(metrics["table_count"], 0)

    def test_reads_page_count_from_docling_serve_json_content(self):
        _, metrics = docling_to_evidence(
            {"document": {"json_content": {"pages": {"1": {}, "2": {}}, "body": {"children": []}}}}
        )
        self.assertEqual(metrics["page_count"], 2)

    def test_redacts_signed_urls_from_operational_errors(self):
        error = "HTTP 422: https://example.supabase.co/object/path?token=secret-value"
        self.assertNotIn("secret-value", redact_error(error))
        self.assertIn("url-firmada-redactada", redact_error(error))


if __name__ == "__main__":
    unittest.main()
