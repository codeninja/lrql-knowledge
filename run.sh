#!/usr/bin/env bash
# Boot the LRQL graph explorer.
#
# Usage:
#   ./run.sh              # uses mock vindex (no Rust binary required)
#   LARQL_BIN=/path/to/larql LARQL_VINDEX=./gemma-3-4b-it-vindex ./run.sh
set -euo pipefail

cd "$(dirname "$0")"

PYTHON=${PYTHON:-python3}
PORT=${PORT:-8000}
HOST=${HOST:-127.0.0.1}

if [ ! -d ".venv" ]; then
  echo "→ creating virtualenv"
  "$PYTHON" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo "→ launching on http://$HOST:$PORT"
exec uvicorn backend.server:app --host "$HOST" --port "$PORT" --reload
