#!/bin/sh
# Check completo dentro de Docker: lint + typecheck + tests + build.
# Corre exactamente lo mismo que el CI (.github/workflows/ci.yml): la imagen
# de dockerfile.dev (que instala con `npm ci`) y el modo dev apagado, como en
# staging y producción.
#
#   sh scripts/check.sh
set -e
cd "$(dirname "$0")/.."
docker build -f dockerfile.dev -t panel-coordinadores-dev .
docker run --rm -e NEXT_PUBLIC_MODO_DEV=0 panel-coordinadores-dev sh -c "npm ci && npm run check"
