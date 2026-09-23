#!/bin/sh
# Check completo dentro de Docker: lint + typecheck + tests + build.
# Es lo mismo que corre el CI (.github/workflows/ci.yml).
#
#   sh scripts/check.sh
set -e
cd "$(dirname "$0")/.."
docker compose -f compose.dev.yml build app
docker compose -f compose.dev.yml run --rm app sh -c "npm install --no-audit --no-fund && npm run check"
