"""Mock vindex data used when the `larql` CLI binary is not available.

The shape mirrors what we expose through the API:
- DESCRIBE returns edges around an entity
- WALK returns ordered token paths through gate vectors
- INFER returns top-k token predictions with probabilities
- ENTITIES returns the graph's known entities for the browser
"""

from __future__ import annotations

import math
import random
from typing import Any

random.seed(7)

# A curated, expressive subgraph that demonstrates the explorer's power.
# Each tuple is (source, relation, target, weight in [0, 1]).
EDGES: list[tuple[str, str, str, float]] = [
    # Geography
    ("France", "capital", "Paris", 0.97),
    ("France", "language", "French", 0.94),
    ("France", "continent", "Europe", 0.91),
    ("France", "currency", "Euro", 0.88),
    ("France", "borders", "Germany", 0.74),
    ("France", "borders", "Spain", 0.72),
    ("France", "borders", "Italy", 0.69),
    ("Paris", "river", "Seine", 0.86),
    ("Paris", "landmark", "Eiffel Tower", 0.93),
    ("Paris", "type", "city", 0.99),
    ("Germany", "capital", "Berlin", 0.96),
    ("Germany", "language", "German", 0.95),
    ("Germany", "continent", "Europe", 0.92),
    ("Germany", "currency", "Euro", 0.87),
    ("Spain", "capital", "Madrid", 0.95),
    ("Spain", "language", "Spanish", 0.94),
    ("Spain", "continent", "Europe", 0.91),
    ("Italy", "capital", "Rome", 0.96),
    ("Italy", "language", "Italian", 0.93),
    ("Italy", "continent", "Europe", 0.90),
    ("Europe", "type", "continent", 0.99),
    ("Euro", "type", "currency", 0.99),

    # Science / people
    ("Albert Einstein", "field", "physics", 0.95),
    ("Albert Einstein", "born-in", "Germany", 0.86),
    ("Albert Einstein", "developed", "relativity", 0.94),
    ("Albert Einstein", "won", "Nobel Prize", 0.91),
    ("relativity", "branch", "physics", 0.92),
    ("relativity", "type", "theory", 0.90),
    ("Marie Curie", "field", "physics", 0.92),
    ("Marie Curie", "field", "chemistry", 0.91),
    ("Marie Curie", "discovered", "radium", 0.93),
    ("Marie Curie", "won", "Nobel Prize", 0.94),
    ("Marie Curie", "born-in", "Poland", 0.84),
    ("radium", "type", "element", 0.95),

    # Tech
    ("transformer", "type", "architecture", 0.96),
    ("transformer", "uses", "attention", 0.97),
    ("transformer", "introduced-by", "Vaswani et al.", 0.83),
    ("attention", "type", "mechanism", 0.92),
    ("Gemma", "type", "transformer", 0.94),
    ("Gemma", "made-by", "Google", 0.95),
    ("Llama", "type", "transformer", 0.94),
    ("Llama", "made-by", "Meta", 0.95),
    ("Mistral", "type", "transformer", 0.93),
    ("Mistral", "made-by", "Mistral AI", 0.94),
    ("Google", "type", "company", 0.98),
    ("Meta", "type", "company", 0.98),

    # Medicine
    ("aspirin", "treats", "headache", 0.89),
    ("aspirin", "treats", "fever", 0.84),
    ("aspirin", "type", "medication", 0.96),
    ("aspirin", "contains", "acetylsalicylic acid", 0.92),
    ("ibuprofen", "treats", "pain", 0.88),
    ("ibuprofen", "type", "medication", 0.95),
    ("headache", "type", "symptom", 0.94),
]

ENTITY_TYPES: dict[str, str] = {
    # nodes get a "kind" used for color/icon assignment in the UI
    "France": "country", "Germany": "country", "Spain": "country", "Italy": "country", "Poland": "country",
    "Paris": "city", "Berlin": "city", "Madrid": "city", "Rome": "city",
    "Europe": "continent",
    "French": "language", "German": "language", "Spanish": "language", "Italian": "language",
    "Euro": "currency",
    "Seine": "river",
    "Eiffel Tower": "landmark",
    "Albert Einstein": "person", "Marie Curie": "person", "Vaswani et al.": "person",
    "physics": "field", "chemistry": "field",
    "relativity": "theory",
    "Nobel Prize": "award",
    "radium": "element",
    "transformer": "architecture", "attention": "concept",
    "Gemma": "model", "Llama": "model", "Mistral": "model",
    "Google": "company", "Meta": "company", "Mistral AI": "company",
    "aspirin": "drug", "ibuprofen": "drug",
    "headache": "symptom", "fever": "symptom", "pain": "symptom",
    "acetylsalicylic acid": "compound",
}


def kind_for(label: str) -> str:
    return ENTITY_TYPES.get(label, "concept")


def all_entities() -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    for src, _, tgt, _ in EDGES:
        for label in (src, tgt):
            if label not in seen:
                seen[label] = {
                    "id": label,
                    "label": label,
                    "kind": kind_for(label),
                    "degree": 0,
                }
    for src, _, tgt, _ in EDGES:
        seen[src]["degree"] += 1
        seen[tgt]["degree"] += 1
    return sorted(seen.values(), key=lambda e: (-e["degree"], e["label"]))


def describe(entity: str, limit: int = 25) -> dict[str, Any]:
    """Return a subgraph centered on `entity` (1-hop neighborhood)."""
    target = entity.strip().strip('"').strip("'")
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []

    def add_node(label: str, depth: int) -> None:
        if label not in nodes:
            nodes[label] = {
                "id": label,
                "label": label,
                "kind": kind_for(label),
                "depth": depth,
            }
        else:
            nodes[label]["depth"] = min(nodes[label]["depth"], depth)

    add_node(target, 0)
    matches = [(s, r, t, w) for (s, r, t, w) in EDGES if s == target or t == target]
    matches.sort(key=lambda x: -x[3])
    for s, r, t, w in matches[:limit]:
        add_node(s, 1 if s != target else 0)
        add_node(t, 1 if t != target else 0)
        edges.append({"source": s, "relation": r, "target": t, "weight": round(w, 3)})

    return {
        "kind": "describe",
        "entity": target,
        "nodes": list(nodes.values()),
        "edges": edges,
        "stats": {"nodes": len(nodes), "edges": len(edges)},
    }


def _next_token_candidates(tail: str) -> list[tuple[str, float]]:
    """Cheap, deterministic next-token scoring used by INFER/WALK mocks."""
    text = tail.lower()
    bag: list[tuple[str, float]] = []
    if "capital of france" in text:
        bag = [("Paris", 0.9791), ("the", 0.0042), ("a", 0.0031), ("Lyon", 0.0019)]
    elif "capital of germany" in text:
        bag = [("Berlin", 0.9712), ("the", 0.0051), ("Munich", 0.0028)]
    elif "capital of spain" in text:
        bag = [("Madrid", 0.9685), ("Barcelona", 0.0042), ("the", 0.0029)]
    elif "capital of italy" in text:
        bag = [("Rome", 0.9633), ("Milan", 0.0061), ("the", 0.0031)]
    elif "einstein" in text:
        bag = [("relativity", 0.41), ("physics", 0.27), ("Nobel", 0.18), ("German", 0.06)]
    elif "transformer" in text:
        bag = [("architecture", 0.38), ("attention", 0.34), ("model", 0.21), ("Gemma", 0.04)]
    elif "aspirin" in text:
        bag = [("headache", 0.46), ("fever", 0.22), ("pain", 0.20), ("medication", 0.08)]
    else:
        # A fallback: sample plausible tokens deterministically
        tokens = ["the", "a", "is", "of", "and", "model", "concept"]
        bag = [(t, max(0.01, 0.4 - i * 0.05)) for i, t in enumerate(tokens)]
    return bag


def infer(prompt: str, top: int = 3) -> dict[str, Any]:
    bag = _next_token_candidates(prompt)
    bag = sorted(bag, key=lambda b: -b[1])[:max(1, top)]
    return {
        "kind": "infer",
        "prompt": prompt,
        "predictions": [{"token": t, "probability": round(p, 4)} for t, p in bag],
    }


def walk(prompt: str, top: int = 10) -> dict[str, Any]:
    """Trace a path through the knowledge graph for a given prompt.

    The result contains both an ordered "trail" (for the player) and a
    standard nodes/edges payload so the visualization can render the path.
    """
    bag = sorted(_next_token_candidates(prompt), key=lambda b: -b[1])
    primary = bag[0][0] if bag else "?"

    # Build a small trail rooted at `primary`. Walk along strongest outgoing
    # edges to make the animation interesting.
    visited: list[str] = [primary]
    trail_edges: list[dict[str, Any]] = []
    cursor = primary
    for _ in range(min(top, 6)):
        out = sorted(
            [(s, r, t, w) for (s, r, t, w) in EDGES if s == cursor and t not in visited],
            key=lambda x: -x[3],
        )
        if not out:
            break
        s, r, t, w = out[0]
        trail_edges.append({"source": s, "relation": r, "target": t, "weight": round(w, 3)})
        visited.append(t)
        cursor = t

    # Expand to neighborhood for context
    nodes: dict[str, dict[str, Any]] = {}
    for i, label in enumerate(visited):
        nodes[label] = {
            "id": label,
            "label": label,
            "kind": kind_for(label),
            "depth": i,
            "on_trail": True,
        }
    extra_edges: list[dict[str, Any]] = []
    for label in visited:
        for s, r, t, w in EDGES:
            if (s == label or t == label) and (s in nodes or t in nodes):
                if s not in nodes:
                    nodes[s] = {"id": s, "label": s, "kind": kind_for(s), "depth": 99, "on_trail": False}
                if t not in nodes:
                    nodes[t] = {"id": t, "label": t, "kind": kind_for(t), "depth": 99, "on_trail": False}
                edge = {"source": s, "relation": r, "target": t, "weight": round(w, 3)}
                if edge not in trail_edges and edge not in extra_edges:
                    extra_edges.append(edge)

    return {
        "kind": "walk",
        "prompt": prompt,
        "predictions": [{"token": t, "probability": round(p, 4)} for t, p in bag[:max(3, top // 2)]],
        "trail": [{"step": i, "token": label} for i, label in enumerate(visited)],
        "trail_edges": trail_edges,
        "nodes": list(nodes.values()),
        "edges": trail_edges + extra_edges,
        "stats": {"nodes": len(nodes), "edges": len(trail_edges) + len(extra_edges), "depth": len(visited)},
    }


def insert_edge(entity: str, relation: str, target: str, weight: float = 0.8) -> dict[str, Any]:
    EDGES.append((entity, relation, target, max(0.0, min(1.0, weight))))
    if entity not in ENTITY_TYPES:
        ENTITY_TYPES[entity] = "custom"
    if target not in ENTITY_TYPES:
        ENTITY_TYPES[target] = "custom"
    return {"kind": "insert", "edge": {"source": entity, "relation": relation, "target": target, "weight": weight}}


def search(query: str, limit: int = 20) -> list[dict[str, Any]]:
    q = query.lower().strip()
    if not q:
        return all_entities()[:limit]
    return [e for e in all_entities() if q in e["label"].lower()][:limit]


def graph_summary() -> dict[str, Any]:
    ents = all_entities()
    kinds: dict[str, int] = {}
    for e in ents:
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    return {
        "vindex": "mock://gemma-3-4b-it-vindex",
        "entities": len(ents),
        "edges": len(EDGES),
        "kinds": kinds,
        "top_entities": ents[:8],
    }
