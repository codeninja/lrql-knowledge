#!/usr/bin/env bash
# Boot the LRQL graph explorer.
#
# Usage:
#   ./run.sh              # uses mock vindex (no Rust binary required)
#   LARQL_BIN=/path/to/larql LARQL_VINDEX=./gemma-3-4b-it-vindex ./run.sh
set -euo pipefail

cd "$(dirname "$0")"

PORT=${PORT:-8000}
HOST=${HOST:-127.0.0.1}

if ! command -v uv >/dev/null 2>&1; then
  echo "→ uv is required. Install from https://docs.astral.sh/uv/" >&2
  exit 1
fi

echo "→ syncing dependencies"
uv sync --quiet

echo "→ launching on http://$HOST:$PORT"
exec uv run uvicorn backend.server:app --host "$HOST" --port "$PORT" --reload
