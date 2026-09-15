"""Worker Docling K3: solo consume una Edge Function y URLs firmadas efímeras.

No contiene una URL, key o cliente de Supabase. Sus únicas escrituras remotas
son POST /claim y POST /complete de la Edge Function; esta lista blanca es
parte del contrato evidence-only de K3.
"""

from __future__ import annotations

import json
import os
import re
import time
from collections.abc import Iterable
from dataclasses import dataclass
from time import monotonic
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


SIGNED_URL_PATTERN = re.compile(r"https?://[^\s\"']+\?[^\s\"']+")


@dataclass(frozen=True)
class Settings:
    function_url: str
    worker_token: str
    docling_base_url: str
    docling_api_key: str
    poll_seconds: float
    timeout_seconds: int


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable de entorno {name}")
    return value


def settings_from_env() -> Settings:
    return Settings(
        function_url=required_env("SUPABASE_FUNCTION_URL").rstrip("/"),
        worker_token=required_env("DOCLING_WORKER_TOKEN"),
        docling_base_url=os.environ.get("DOCLING_BASE_URL", "http://docling:5001").rstrip("/"),
        docling_api_key=required_env("DOCLING_API_KEY"),
        poll_seconds=float(os.environ.get("WORKER_POLL_SECONDS", "5")),
        timeout_seconds=int(os.environ.get("WORKER_HTTP_TIMEOUT_SECONDS", "840")),
    )


def request_json(url: str, payload: Any | None, headers: dict[str, str], timeout: int) -> Any:
    request_headers = {"accept": "application/json", **headers}
    data: bytes | None = None
    method = "GET"
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers["content-type"] = "application/json"
        method = "POST"
    request = Request(url, data=data, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"HTTP {error.code} en {url}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Red no disponible en {url}: {error.reason}") from error


def worker_headers(settings: Settings) -> dict[str, str]:
    return {"authorization": f"Bearer {settings.worker_token}"}


def redact_error(value: object) -> str:
    """Evita conservar URLs firmadas efímeras en el histórico de errores."""
    return SIGNED_URL_PATTERN.sub("[url-firmada-redactada]", str(value))[:2000]


def get_nested(source: dict[str, Any], *keys: str) -> Any:
    current: Any = source
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def as_number(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def cell_text(cell: dict[str, Any]) -> str:
    for key in ("text", "text_content", "raw_value", "content", "value"):
        value = cell.get(key)
        if value is not None:
            return str(value).strip()
    return ""


def table_cells(table: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = [
        table.get("table_cells"),
        table.get("cells"),
        get_nested(table, "data", "table_cells"),
        get_nested(table, "data", "cells"),
    ]
    for candidate in candidates:
        if isinstance(candidate, list) and all(isinstance(cell, dict) for cell in candidate):
            return candidate
    return []


def walk(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def locate_docling_tables(raw: Any) -> list[dict[str, Any]]:
    document = raw.get("document", raw) if isinstance(raw, dict) else raw
    found: list[dict[str, Any]] = []
    seen_cells: set[int] = set()
    for candidate in walk(document):
        cells = table_cells(candidate)
        label = str(candidate.get("label") or candidate.get("type") or "").lower()
        if cells and ("table" in label or "table_cells" in candidate or isinstance(candidate.get("data"), dict)):
            marker = id(cells)
            if marker not in seen_cells:
                seen_cells.add(marker)
                found.append(candidate)
    return found


def docling_table_to_evidence(table: dict[str, Any], table_index: int) -> dict[str, Any] | None:
    cells = table_cells(table)
    if not cells:
        return None

    normalized: list[tuple[int, int, int, int, str]] = []
    max_row = -1
    max_col = -1
    for cell in cells:
        row = as_number(cell.get("start_row_offset_idx", cell.get("row_index", cell.get("row", 0))))
        col = as_number(cell.get("start_col_offset_idx", cell.get("column_index", cell.get("col", 0))))
        row_span = max(1, as_number(cell.get("row_span"), 1))
        col_span = max(1, as_number(cell.get("col_span"), 1))
        text = cell_text(cell)
        normalized.append((row, col, row_span, col_span, text))
        max_row = max(max_row, row + row_span - 1)
        max_col = max(max_col, col + col_span - 1)

    if max_row < 0 or max_col < 0:
        return None

    grid = [["" for _ in range(max_col + 1)] for _ in range(max_row + 1)]
    for row, col, row_span, col_span, text in normalized:
        for row_offset in range(row_span):
            for col_offset in range(col_span):
                target_row = row + row_offset
                target_col = col + col_offset
                if not grid[target_row][target_col]:
                    grid[target_row][target_col] = text

    header_row = 0
    headers = [value.strip() or f"column_{index}" for index, value in enumerate(grid[header_row])]
    rows = [
        {
            "index": row_index - 1,
            "cells": [
                {"column_index": col_index, "raw_value": value}
                for col_index, value in enumerate(row)
            ],
        }
        for row_index, row in enumerate(grid[1:], start=1)
        if any(value.strip() for value in row)
    ]
    return {
        "index": table_index,
        "columns": [{"index": index, "name": name} for index, name in enumerate(headers)],
        "rows": rows,
    }


def docling_to_evidence(raw: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    tables: list[dict[str, Any]] = []
    for candidate in locate_docling_tables(raw):
        converted = docling_table_to_evidence(candidate, len(tables))
        if converted is not None:
            tables.append(converted)

    document = raw.get("document", raw) if isinstance(raw, dict) else raw
    # docling-serve envuelve el DoclingDocument serializado en json_content.
    # Conservamos la respuesta completa como artefacto, pero calculamos las
    # métricas sobre el documento estructurado que contiene páginas y tablas.
    structured_document = (
        document.get("json_content", document) if isinstance(document, dict) else document
    )
    pages = structured_document.get("pages") if isinstance(structured_document, dict) else None
    page_count = len(pages) if isinstance(pages, (dict, list)) else 0
    table_rows = sum(len(table["rows"]) for table in tables)
    table_cells_count = sum(len(row["cells"]) for table in tables for row in table["rows"])
    metrics = {
        "page_count": page_count,
        "table_count": len(tables),
        "table_row_count": table_rows,
        "table_cell_count": table_cells_count,
    }
    return tables, metrics


def convert_document(settings: Settings, document_url: str) -> Any:
    # La URL firmada es el único acceso del worker al documento original.
    return request_json(
        f"{settings.docling_base_url}/v1/convert/source",
        {
            "sources": [{"kind": "http", "url": document_url}],
            "options": {
                "to_formats": ["json", "md"],
                "do_ocr": True,
                "do_table_structure": True,
                "table_mode": "accurate",
                "include_images": False,
            },
        },
        {"x-api-key": settings.docling_api_key},
        settings.timeout_seconds,
    )


def complete(settings: Settings, payload: dict[str, Any]) -> None:
    request_json(
        f"{settings.function_url}/complete",
        payload,
        worker_headers(settings),
        settings.timeout_seconds,
    )


def process_one(settings: Settings) -> bool:
    claim = request_json(
        f"{settings.function_url}/claim",
        {},
        worker_headers(settings),
        min(settings.timeout_seconds, 60),
    )
    job = claim.get("job") if isinstance(claim, dict) else None
    if not isinstance(job, dict):
        return False

    started = monotonic()
    try:
        raw = convert_document(settings, str(job["documentUrl"]))
        tables, metrics = docling_to_evidence(raw)
        metrics["elapsed_ms"] = round((monotonic() - started) * 1000)
        metrics["docling_status"] = "success"
        complete(
            settings,
            {
                "jobId": job["id"],
                "leaseToken": job["leaseToken"],
                "status": "success" if tables else "no_table",
                "rawArtifact": raw,
                "tables": tables if tables else None,
                "metrics": metrics,
                "error": None,
            },
        )
    except Exception as error:  # El fallo queda trazado en el job; no se fabrica evidencia de error.
        safe_error = redact_error(error)
        metrics = {
            "elapsed_ms": round((monotonic() - started) * 1000),
            "docling_status": "failed",
            "exception_type": type(error).__name__,
        }
        complete(
            settings,
            {
                "jobId": job["id"],
                "leaseToken": job["leaseToken"],
                "status": "failed",
                "tables": None,
                "metrics": metrics,
                "error": safe_error,
            },
        )
    return True


def main() -> None:
    settings = settings_from_env()
    run_once = os.environ.get("WORKER_ONCE", "false").lower() == "true"
    while True:
        processed = process_one(settings)
        if run_once:
            return
        if not processed:
            time.sleep(settings.poll_seconds)


if __name__ == "__main__":
    main()
