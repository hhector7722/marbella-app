import unittest
from unittest.mock import patch

import worker
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

    def test_completion_failure_after_success_does_not_emit_failed_completion(self):
        settings = worker.Settings(
            function_url="https://example.test/functions/v1/docling-evidence-worker",
            worker_token="worker-token",
            docling_base_url="http://127.0.0.1:5001",
            docling_api_key="docling-key",
            poll_seconds=5,
            timeout_seconds=840,
        )
        claim = {
            "job": {
                "id": "job-1",
                "leaseToken": "lease-1",
                "invoiceId": "invoice-1",
                "documentUrl": "https://example.test/doc.pdf?token=secret",
                "fileVersionHash": "hash-1",
                "extractorVersion": "docling-test",
                "correlationId": "corr-1",
            }
        }
        raw = {
            "document": {
                "pages": {"1": {}},
                "body": {
                    "children": [{
                        "label": "table",
                        "data": {"table_cells": [
                            {"start_row_offset_idx": 0, "start_col_offset_idx": 0, "text": "Artículo"},
                            {"start_row_offset_idx": 1, "start_col_offset_idx": 0, "text": "Tomate"},
                        ]},
                    }]
                },
            }
        }

        with (
            patch.object(worker, "request_json", return_value=claim),
            patch.object(worker, "convert_document", return_value=raw),
            patch.object(worker, "complete", side_effect=RuntimeError("callback caído")) as complete_mock,
        ):
            self.assertTrue(worker.process_one(settings))

        self.assertEqual(complete_mock.call_count, 1)
        payload = complete_mock.call_args.args[1]
        self.assertEqual(payload["status"], "success")

    def test_conversion_failure_emits_exactly_one_failed_completion(self):
        settings = worker.Settings(
            function_url="https://example.test/functions/v1/docling-evidence-worker",
            worker_token="worker-token",
            docling_base_url="http://127.0.0.1:5001",
            docling_api_key="docling-key",
            poll_seconds=5,
            timeout_seconds=840,
        )
        claim = {
            "job": {
                "id": "job-2",
                "leaseToken": "lease-2",
                "invoiceId": "invoice-2",
                "documentUrl": "https://example.test/doc.pdf?token=secret",
                "fileVersionHash": "hash-2",
                "extractorVersion": "docling-test",
                "correlationId": "corr-2",
            }
        }

        with (
            patch.object(worker, "request_json", return_value=claim),
            patch.object(worker, "convert_document", side_effect=RuntimeError("conversion rota")),
            patch.object(worker, "complete") as complete_mock,
        ):
            self.assertTrue(worker.process_one(settings))

        self.assertEqual(complete_mock.call_count, 1)
        payload = complete_mock.call_args.args[1]
        self.assertEqual(payload["status"], "failed")
        self.assertNotIn("rawArtifact", payload)


if __name__ == "__main__":
    unittest.main()
