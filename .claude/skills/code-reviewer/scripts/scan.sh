#!/usr/bin/env bash
# scan.sh - Master code review scanner
# Auto-detects file types and dispatches to relevant sub-scanners.
# Usage: bash scan.sh <path-to-file-or-directory>

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-.}"

if [ ! -e "$TARGET" ]; then
  echo "Error: path not found: $TARGET" >&2
  exit 1
fi

# Detect which scanners to run based on what's in the target
HAS_TS=0
HAS_PY=0
HAS_NEXT=0
HAS_SUPABASE=0

if [ -d "$TARGET" ]; then
  find "$TARGET" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.mjs" -o -name "*.cjs" \) -not -path "*/node_modules/*" -not -path "*/.next/*" -print -quit 2>/dev/null | grep -q . && HAS_TS=1
  find "$TARGET" -type f -name "*.py" -not -path "*/.venv/*" -not -path "*/venv/*" -not -path "*/__pycache__/*" -print -quit 2>/dev/null | grep -q . && HAS_PY=1
  [ -f "$TARGET/next.config.js" ] || [ -f "$TARGET/next.config.ts" ] || [ -f "$TARGET/next.config.mjs" ] || find "$TARGET" -maxdepth 3 -type d \( -name "app" -o -name "pages" \) -print -quit 2>/dev/null | grep -q . && HAS_NEXT=1
  grep -rlE "@supabase|createClient.*supabase|supabase\." "$TARGET" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | head -1 | grep -q . && HAS_SUPABASE=1
else
  case "$TARGET" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) HAS_TS=1 ;;
    *.py) HAS_PY=1 ;;
  esac
  grep -lE "@supabase|createClient.*supabase|supabase\." "$TARGET" 2>/dev/null | grep -q . && HAS_SUPABASE=1
fi

echo "==================================================================="
echo " Code Review Scan: $TARGET"
echo "==================================================================="
echo ""

# Always run secrets scan
echo "--- Secrets & Credentials ---"
bash "$SCRIPT_DIR/scan_secrets.sh" "$TARGET"
echo ""

if [ "$HAS_TS" = "1" ]; then
  echo "--- TypeScript / JavaScript ---"
  bash "$SCRIPT_DIR/scan_typescript.sh" "$TARGET"
  echo ""
fi

if [ "$HAS_PY" = "1" ]; then
  echo "--- Python ---"
  bash "$SCRIPT_DIR/scan_python.sh" "$TARGET"
  echo ""
fi

if [ "$HAS_NEXT" = "1" ]; then
  echo "--- Next.js ---"
  bash "$SCRIPT_DIR/scan_nextjs.sh" "$TARGET"
  echo ""
fi

if [ "$HAS_SUPABASE" = "1" ]; then
  echo "--- Supabase ---"
  bash "$SCRIPT_DIR/scan_supabase.sh" "$TARGET"
  echo ""
fi

echo "==================================================================="
echo " Scan complete. Read findings, then verify with the code."
echo "==================================================================="
