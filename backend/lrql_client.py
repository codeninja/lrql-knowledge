"""Thin wrapper around the `larql` CLI.

If the binary is on PATH and a vindex path is configured, calls are forwarded
via `larql lql` (the universal LQL entry point). Otherwise we fall back to the
mock vindex so the explorer is fully usable without the real binary.
"""

from __future__ import annotations

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


def _run_lql(stmt: str, timeout: float = 30.0) -> str:
    """Run a single LQL statement against the configured vindex via `larql lql`.

    `larql lql` is one-shot — it does not retain `USE` state across invocations,
    so we prepend a `USE` for every call.
    """
    if not DEFAULT_VINDEX:
        raise RuntimeError("LARQL_VINDEX is not set")
    full = f'USE "{DEFAULT_VINDEX}"; {stmt.rstrip(";")};'
    proc = subprocess.run(
        [LARQL_BIN, "lql", full],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "larql call failed")
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
        except Exception as exc:
            return {
                "kind": "error",
                "message": f"larql binary failed: {exc}",
                "fallback_available": True,
            }

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


# --- Real backend (text-output parsers) --------------------------------------

# DESCRIBE row:  "                 → French                  35.2  L32 "
_DESCRIBE_EDGE_RE = re.compile(
    r"^\s*(?:[\w\-]+\s+)?→\s+(?P<target>\S(?:.*?\S)?)\s{2,}(?P<weight>[+\-]?\d+(?:\.\d+)?)\s+L(?P<layer>\d+)\s*$"
)
_DESCRIBE_SECTION_RE = re.compile(r"^\s*(Syntax|Edges|Output)\s*\(L\d+-\d+\):\s*$")

# Inference-mode INFER predictions: "  1. Paris                (97.91%)"
_INFER_PRED_RE = re.compile(r"^\s*(?P<rank>\d+)\.\s+(?P<token>\S(?:.*?\S)?)\s+\(\s*(?P<pct>\d+(?:\.\d+)?)\s*%\)\s*$")

# Per-layer feature line (browse-only WALK / fallback INFER):
#   "  L33:  F4109  gate=+7.0  top="<token>"            down=[<t1>, <t2>, <t3>]"
#   "  L 0: F9709  gate=+7.4  hears=\"is\"             c=0.14  down=[is (0.14), Is (0.10), ...]"
_LAYER_FEATURE_RE = re.compile(
    r"^\s*L\s*(?P<layer>\d+)\s*:\s+F\s*(?P<fid>\d+)\s+gate=(?P<gate>[+\-]?\d+(?:\.\d+)?).*?down=\[(?P<down>.*?)\]\s*$"
)

# INSERT confirmation: "Inserted: aspirin —[treats]→ headache at L26 ..."
_INSERT_CONFIRM_RE = re.compile(
    r"Inserted:\s+(?P<src>.+?)\s+—\[(?P<rel>.+?)\]→\s+(?P<tgt>.+?)\s+at\s+L(?P<layer>\d+)"
)


def _strip_use_preamble(text: str) -> str:
    """Drop the `Using: ...` line that `larql lql` prints before output."""
    lines = text.splitlines()
    while lines and lines[0].lstrip().lower().startswith("using:"):
        lines = lines[1:]
    return "\n".join(lines)


def _parse_describe(entity: str, raw: str) -> dict[str, Any]:
    body = _strip_use_preamble(raw)
    nodes_by_id: dict[str, dict[str, Any]] = {entity: {"id": entity, "label": entity, "kind": "entity", "depth": 0}}
    edges: list[dict[str, Any]] = []
    section = "Edges"

    for line in body.splitlines():
        sec = _DESCRIBE_SECTION_RE.match(line)
        if sec:
            section = sec.group(1)
            continue
        m = _DESCRIBE_EDGE_RE.match(line)
        if not m:
            continue
        target = m.group("target").strip()
        weight = float(m.group("weight"))
        layer = int(m.group("layer"))
        nodes_by_id.setdefault(
            target, {"id": target, "label": target, "kind": "concept", "depth": 1}
        )
        edges.append({
            "source": entity,
            "relation": section.lower(),
            "target": target,
            "weight": weight,
            "layer": layer,
        })

    return {
        "kind": "describe",
        "entity": entity,
        "nodes": list(nodes_by_id.values()),
        "edges": edges,
        "stats": {"nodes": len(nodes_by_id), "edges": len(edges)},
        "raw": raw,
    }


def _parse_first_down_token(down: str) -> str:
    """Extract the first token from a `down=[t1 (p), t2 (p), ...]` group."""
    first = down.split(",", 1)[0].strip()
    # Drop trailing "(0.14)" style probability if present.
    first = re.sub(r"\s*\(\s*\d+(?:\.\d+)?\s*\)\s*$", "", first)
    return first


def _parse_predictions(raw: str, top: int) -> list[dict[str, Any]]:
    body = _strip_use_preamble(raw)
    preds: list[dict[str, Any]] = []
    # Preferred: real INFER predictions ("  1. Paris  (97.91%)").
    for line in body.splitlines():
        m = _INFER_PRED_RE.match(line)
        if m:
            preds.append({
                "token": m.group("token").strip(),
                "probability": round(float(m.group("pct")) / 100.0, 4),
            })
    if preds:
        return preds[:top]

    # Fallback: pull last-layer down-tokens from per-layer feature dump.
    last_layer_features: list[tuple[int, float, str]] = []
    max_layer = -1
    for line in body.splitlines():
        m = _LAYER_FEATURE_RE.match(line)
        if not m:
            continue
        layer = int(m.group("layer"))
        gate = abs(float(m.group("gate")))
        token = _parse_first_down_token(m.group("down"))
        if layer > max_layer:
            max_layer = layer
            last_layer_features = []
        if layer == max_layer:
            last_layer_features.append((layer, gate, token))

    last_layer_features.sort(key=lambda x: x[1], reverse=True)
    seen = set()
    for _, gate, token in last_layer_features:
        if token in seen:
            continue
        seen.add(token)
        # Normalise gate magnitudes into [0, 1] pseudo-probabilities for display.
        preds.append({"token": token, "probability": round(min(gate / 10.0, 1.0), 4)})
        if len(preds) >= top:
            break
    return preds


def _parse_walk(prompt: str, raw: str, top: int) -> dict[str, Any]:
    body = _strip_use_preamble(raw)
    trail: list[dict[str, Any]] = []
    seen_tokens: set[str] = set()

    for line in body.splitlines():
        m = _LAYER_FEATURE_RE.match(line)
        if not m:
            continue
        layer = int(m.group("layer"))
        token = _parse_first_down_token(m.group("down"))
        if not token or token in seen_tokens:
            continue
        seen_tokens.add(token)
        trail.append({"step": len(trail), "token": token, "layer": layer})

    trail = trail[:top]
    nodes = [
        {"id": step["token"], "label": step["token"], "kind": "concept", "depth": step["step"], "on_trail": True}
        for step in trail
    ]
    edges: list[dict[str, Any]] = []
    for a, b in zip(trail, trail[1:]):
        edges.append({
            "source": a["token"],
            "relation": "next",
            "target": b["token"],
            "weight": 0.7,
            "on_trail": True,
        })

    return {
        "kind": "walk",
        "prompt": prompt,
        "predictions": _parse_predictions(raw, top),
        "trail": [{"step": s["step"], "token": s["token"]} for s in trail],
        "trail_edges": edges,
        "nodes": nodes,
        "edges": edges,
        "stats": {"nodes": len(nodes), "edges": len(edges), "depth": len(trail)},
        "raw": raw,
    }


def _parse_insert(parsed: dict[str, Any], raw: str) -> dict[str, Any]:
    body = _strip_use_preamble(raw)
    layer: int | None = None
    for line in body.splitlines():
        m = _INSERT_CONFIRM_RE.search(line)
        if m:
            layer = int(m.group("layer"))
            break
    return {
        "kind": "insert",
        "edge": {
            "source": parsed["entity"],
            "relation": parsed["relation"],
            "target": parsed["target"],
            "weight": 0.8,
            "layer": layer,
        },
        "raw": raw,
    }


def _execute_real(parsed: dict[str, Any]) -> dict[str, Any]:
    op = parsed["op"]
    if op == "describe":
        out = _run_lql(f'DESCRIBE "{parsed["entity"]}"')
        return _parse_describe(parsed["entity"], out)
    if op == "walk":
        out = _run_lql(f'WALK "{parsed["prompt"]}" TOP {parsed.get("top", 10)}')
        return _parse_walk(parsed["prompt"], out, parsed.get("top", 10))
    if op == "infer":
        out = _run_lql(f'INFER "{parsed["prompt"]}" TOP {parsed.get("top", 5)}')
        return {
            "kind": "infer",
            "prompt": parsed["prompt"],
            "predictions": _parse_predictions(out, parsed.get("top", 5)),
            "raw": out,
        }
    if op == "insert":
        out = _run_lql(
            'INSERT INTO EDGES (entity, relation, target) VALUES ('
            f'"{parsed["entity"]}", "{parsed["relation"]}", "{parsed["target"]}")'
        )
        return _parse_insert(parsed, out)
    raise ValueError(f"unsupported op: {op}")
