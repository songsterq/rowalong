#!/usr/bin/env bash
# Build build/icon.icns from build/icon-1024.png using native macOS tools
# (sips + iconutil). Re-run after changing the master PNG.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="build/icon-1024.png"
SET="build/RowAlong.iconset"
rm -rf "$SET"; mkdir -p "$SET"
for sz in 16 32 128 256 512; do
  sips -z "$sz" "$sz" "$SRC" --out "$SET/icon_${sz}x${sz}.png" >/dev/null
  sips -z "$((sz * 2))" "$((sz * 2))" "$SRC" --out "$SET/icon_${sz}x${sz}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o build/icon.icns
rm -rf "$SET"
echo "wrote build/icon.icns"
