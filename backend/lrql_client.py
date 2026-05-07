"""Thin wrapper around the `larql` CLI.

If the binary is on PATH, calls are forwarded to it. Otherwise we fall back
to the mock vindex so the explorer is fully usable without the real binary.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from typing import Any

from . import mock_vindex


LARQL_BIN = os.environ.get("LARQL_BIN", "larql")
DEFAULT_VINDEX = os.environ.get("LARQL_VINDEX", "")


def _have_binary() -> bool:
    return shutil.which(LARQL_BIN) is not None


def have_real_backend() -> bool:
    return _have_binary() and bool(DEFAULT_VINDEX)


def _run(args: list[str], timeout: float = 20.0) -> str:
    proc = subprocess.run(
        [LARQL_BIN, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "larql call failed")
    return proc.stdout


# --- LQL query parsing ---------------------------------------------------------

_DESCRIBE_RE = re.compile(r"^\s*DESCRIBE\s+(?:\"([^\"]+)\"|'([^']+)'|(\S+))\s*;?\s*$", re.IGNORECASE)
_WALK_RE = re.compile(r"^\s*WALK\s+(?:\"([^\"]+)\"|'([^']+)')(?:\s+TOP\s+(\d+))?\s*;?\s*$", re.IGNORECASE)
_INFER_RE = re.compile(r"^\s*INFER\s+(?:\"([^\"]+)\"|'([^']+)')(?:\s+TOP\s+(\d+))?\s*;?\s*$", re.IGNORECASE)
_INSERT_RE = re.compile(
    r"^\s*INSERT\s+INTO\s+EDGES\s*\([^)]+\)\s*VALUES\s*\(\s*\"([^\"]+)\"\s*,\s*\"([^\"]+)\"\s*,\s*\"([^\"]+)\"\s*\)\s*;?\s*$",
    re.IGNORECASE,
)
_USE_RE = re.compile(r"^\s*USE\s+(?:\"([^\"]+)\"|'([^']+)')\s*;?\s*$", re.IGNORECASE)


def parse_query(text: str) -> dict[str, Any]:
    raw = text.strip()
    if not raw:
        raise ValueError("empty query")

    # USE statement is metadata-only in this explorer
    m = _USE_RE.match(raw)
    if m:
        target = m.group(1) or m.group(2)
        return {"op": "use", "vindex": target}

    m = _DESCRIBE_RE.match(raw)
    if m:
        entity = m.group(1) or m.group(2) or m.group(3)
        return {"op": "describe", "entity": entity}

    m = _WALK_RE.match(raw)
    if m:
        prompt = m.group(1) or m.group(2)
        top = int(m.group(3) or 10)
        return {"op": "walk", "prompt": prompt, "top": top}

    m = _INFER_RE.match(raw)
    if m:
        prompt = m.group(1) or m.group(2)
        top = int(m.group(3) or 5)
        return {"op": "infer", "prompt": prompt, "top": top}

    m = _INSERT_RE.match(raw)
    if m:
        return {
            "op": "insert",
            "entity": m.group(1),
            "relation": m.group(2),
            "target": m.group(3),
        }

    raise ValueError(
        "unrecognized statement. supported: USE, DESCRIBE, WALK, INFER, INSERT INTO EDGES"
    )


# --- Dispatch ----------------------------------------------------------------

def execute(query: str) -> dict[str, Any]:
    parsed = parse_query(query)
    op = parsed["op"]

    if op == "use":
        return {"kind": "use", "vindex": parsed["vindex"], "ok": True}

    if have_real_backend():
        try:
            return _execute_real(parsed)
        except Exception as exc:  # pragma: no cover - real CLI not installed
            return {"kind": "error", "message": f"larql binary failed: {exc}", "fallback": True}

    return _execute_mock(parsed)


def _execute_mock(parsed: dict[str, Any]) -> dict[str, Any]:
    op = parsed["op"]
    if op == "describe":
        return mock_vindex.describe(parsed["entity"])
    if op == "walk":
        return mock_vindex.walk(parsed["prompt"], parsed.get("top", 10))
    if op == "infer":
        return mock_vindex.infer(parsed["prompt"], parsed.get("top", 5))
    if op == "insert":
        return mock_vindex.insert_edge(parsed["entity"], parsed["relation"], parsed["target"])
    raise ValueError(f"unsupported op: {op}")


def _execute_real(parsed: dict[str, Any]) -> dict[str, Any]:  # pragma: no cover
    op = parsed["op"]
    if op == "describe":
        out = _run([
            "describe",
            DEFAULT_VINDEX,
            parsed["entity"],
            "--format",
            "json",
        ])
        data = json.loads(out)
        return {"kind": "describe", **data}
    if op == "walk":
        out = _run([
            "walk", DEFAULT_VINDEX, parsed["prompt"], "--top", str(parsed.get("top", 10)), "--format", "json",
        ])
        data = json.loads(out)
        return {"kind": "walk", **data}
    if op == "infer":
        out = _run([
            "run", DEFAULT_VINDEX, parsed["prompt"], "--top", str(parsed.get("top", 5)), "--format", "json",
        ])
        data = json.loads(out)
        return {"kind": "infer", **data}
    if op == "insert":
        # patch flow not yet wired through CLI; surface as not-implemented
        return {"kind": "error", "message": "INSERT not yet implemented against real CLI"}
    raise ValueError(f"unsupported op: {op}")
