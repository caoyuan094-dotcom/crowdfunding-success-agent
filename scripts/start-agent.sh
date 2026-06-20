#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Please install Node.js first." >&2
  exit 1
fi

if [ ! -f ".env.local" ]; then
  cp ".env.example" ".env.local"
  echo "Created .env.local from .env.example."
  echo "To enable AI assessment, edit .env.local and set OPENAI_API_KEY."
fi

PORT="${PORT:-4173}"

echo "Starting crowdfunding success agent..."
echo "Project: $ROOT_DIR"
echo "Preferred URL: http://localhost:${PORT}"
echo "If the preferred port is busy, the server will print the actual Local URL."
echo

npm run dev
