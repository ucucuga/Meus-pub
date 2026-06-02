#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SC_DIR="$ROOT/Smart-contract"
BOC_SRC="$SC_DIR/build/Meus.code.boc"
BOC_DST="$ROOT/backend/contract/meus.code.boc"

echo "==> Exporting Meus contract code BOC..."
if ! cd "$SC_DIR"; then
  echo "Error: Smart-contract directory not found at $SC_DIR" >&2
  exit 1
fi

if ! npm run export-code; then
  echo "Error: npm run export-code failed in Smart-contract/" >&2
  exit 1
fi

if [[ ! -f "$BOC_SRC" ]]; then
  echo "Error: BOC file not found at $BOC_SRC after export" >&2
  exit 1
fi

mkdir -p "$(dirname "$BOC_DST")"
cp "$BOC_SRC" "$BOC_DST"
SIZE=$(wc -c < "$BOC_DST" | tr -d ' ')

echo "Success: copied Meus.code.boc to backend/contract/meus.code.boc (${SIZE} bytes)"
