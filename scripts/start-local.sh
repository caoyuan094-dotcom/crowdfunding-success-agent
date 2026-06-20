#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-4173}"

cd "$ROOT_DIR"

if command -v python3 >/dev/null 2>&1; then
  echo "海外众筹成功率提升智能体"
  echo "Local URL: http://localhost:${PORT}"
  echo "Press Ctrl+C to stop."
  python3 -m http.server "$PORT"
else
  echo "python3 is required to run the local static server." >&2
  exit 1
fi
