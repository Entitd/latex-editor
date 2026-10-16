
#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

FILE="${1:-main.tex}"
ENGINE="${2:-pdflatex}"

echo "Starting Docker LaTeX compiler..."

docker compose run \
    --rm \
    --no-deps \
    -T \
    compiler \
    bash /scripts/compile.sh "$FILE" "$ENGINE"
