#!/bin/bash
# Installs dependencies at the start of Claude Code cloud sessions so lint, typecheck and tests
# can run right away. Local machines install once by hand, so this exits early there.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
