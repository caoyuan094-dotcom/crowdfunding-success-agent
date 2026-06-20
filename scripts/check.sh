#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

test -f index.html
test -f styles.css
test -f app.js
test -f vercel.json

node --check app.js
node --check api/agent.js
node --check scripts/dev-server.mjs
node --check scripts/health-check.mjs
bash -n scripts/start-local.sh
bash -n scripts/start-agent.sh
bash -n 启动众筹评估智能体.command

echo "Static app check passed."
