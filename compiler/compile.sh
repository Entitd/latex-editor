
#!/usr/bin/env bash

set -uo pipefail

FILE="${1:-}"
ENGINE="${2:-pdflatex}"

# Only relative .tex paths inside the mounted project are accepted.
if [[ "$FILE" != *.tex || "$FILE" == /* || "$FILE" == *\\* || "$FILE" =~ (^|/)\.\.?(/|$) || "$FILE" =~ [[:cntrl:]] ]]; then
    echo "ERROR: Invalid TeX filename"
    exit 2
fi

SOURCE="$(realpath -e -- "/workspace/$FILE" 2>/dev/null)"
if [[ "$SOURCE" != /workspace/* || ! -f "$SOURCE" ]]; then
    echo "ERROR: File not found or outside workspace: $FILE"
    exit 2
fi

case "$ENGINE" in
    pdflatex)
        MODE="-pdf"
        ;;
    xelatex)
        MODE="-xelatex"
        ;;
    lualatex)
        MODE="-lualatex"
        ;;
    *)
        echo "ERROR: Unsupported engine: $ENGINE"
        exit 2
        ;;
esac

if [[ ! -f "/workspace/$FILE" ]]; then
    echo "ERROR: File not found: $FILE"
    exit 2
fi

NAME="$(basename -- "$FILE" .tex)"
OUTPUT="/output"

mkdir -p "$OUTPUT"

# Удаляем устаревший PDF, чтобы не вернуть
# результат предыдущей компиляции.
rm -f "$OUTPUT/$NAME.pdf"

echo "=================================="
echo "LaTeX Compiler"
echo "File: $FILE"
echo "Engine: $ENGINE"
echo "=================================="

# Запускаем компилятор с ограничением времени.
# pipefail позволяет сохранить код ошибки latexmk.
set +e

timeout --signal=TERM --kill-after=5s 60s \
    latexmk \
      "$MODE" \
      -gg \
      -no-shell-escape \
      -interaction=nonstopmode \
      -halt-on-error \
      -file-line-error \
      -outdir="$OUTPUT" \
      "./$FILE" \
    2>&1 | tee "$OUTPUT/compile.log"

STATUS=${PIPESTATUS[0]}

set -e

if [[ "$STATUS" -eq 0 && -f "$OUTPUT/$NAME.pdf" ]]; then
    RESULT="success"
    MESSAGE="Compilation completed"
elif [[ "$STATUS" -eq 124 || "$STATUS" -eq 137 ]]; then
    RESULT="timeout"
    MESSAGE="Compilation timed out"
else
    RESULT="error"
    MESSAGE="Compilation failed"
fi

# Escape the user-supplied path for JSON (control characters are rejected above).
JSON_FILE="${FILE//\\/\\\\}"
JSON_FILE="${JSON_FILE//\"/\\\"}"

cat > "$OUTPUT/result.json" <<EOF
{
  "status": "$RESULT",
  "exit_code": $STATUS,
  "engine": "$ENGINE",
  "source": "$JSON_FILE",
  "message": "$MESSAGE"
}
EOF

echo ""
echo "=================================="
echo "Status: $RESULT"
echo "Exit code: $STATUS"
echo "=================================="

if [[ "$RESULT" != "success" ]]; then
    if [[ "$STATUS" -eq 0 ]]; then
        exit 1
    fi
    exit "$STATUS"
fi

exit 0

