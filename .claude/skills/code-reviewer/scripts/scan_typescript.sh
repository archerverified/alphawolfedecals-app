#!/usr/bin/env bash
# scan_typescript.sh - TypeScript/JavaScript antipattern detection
# Usage: bash scan_typescript.sh <path>

set -u
TARGET="${1:-.}"

if command -v rg >/dev/null 2>&1; then
  GREP="rg --no-heading --line-number --color=never"
  TS_FILTER="-tts -tjs --type-add=tsx:*.tsx --type-add=jsx:*.jsx -ttsx -tjsx"
  EXCLUDES="--glob=!node_modules --glob=!.next --glob=!dist --glob=!build --glob=!*.d.ts --glob=!*.min.js"
else
  GREP="grep -rEn"
  TS_FILTER='--include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.mjs --include=*.cjs'
  EXCLUDES="--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude=*.d.ts --exclude=*.min.js"
fi

flag() {
  local sev="$1"; local pattern="$2"; local msg="$3"
  local results
  results=$($GREP $TS_FILTER $EXCLUDES "$pattern" "$TARGET" 2>/dev/null | head -15)
  if [ -n "$results" ]; then
    echo "$results" | while IFS= read -r line; do
      echo "[$sev] $line"
      echo "       → $msg"
    done
  fi
}

# --- Type-safety escape hatches ---
flag "SHOULD" "@ts-ignore" "@ts-ignore suppresses type errors — verify it's still needed and add a comment explaining why"
flag "SHOULD" "@ts-nocheck" "@ts-nocheck disables type checking for the whole file — high risk of silent bugs"
flag "NIT"    ":\s*any[\s,;)\\]>]" "Explicit 'any' type — consider 'unknown' if the shape is truly dynamic"
flag "SHOULD" "as\s+any" "'as any' cast bypasses type safety — fix the underlying type instead"
flag "SHOULD" "as\s+unknown\s+as" "Double cast through 'unknown' — almost always indicates a type modeling problem"

# --- Async / promise footguns ---
flag "BLOCKER" "new Promise\(.*await" "Wrapping await in 'new Promise' is almost always wrong — promises are already async"
flag "SHOULD"  "\.then\([^)]*\)[^.]*$" "Unchained .then() without .catch() — unhandled rejection risk"
flag "SHOULD"  "async\s+function[^{]+\{[^}]*await[^}]*\}(?!\s*\.catch)" "async function without try/catch — make sure caller handles rejections"

# --- React / DOM ---
flag "BLOCKER" "dangerouslySetInnerHTML" "dangerouslySetInnerHTML — XSS risk. Verify input is sanitized (DOMPurify) or escape-rendered"
flag "SHOULD"  "useEffect\([^,]+\)\s*[;}]" "useEffect missing dependency array — runs on every render"
flag "SHOULD"  "useEffect\([^,]+,\s*\[\]\s*\)" "useEffect with empty deps array — confirm this is intentional and no stale closures"
flag "NIT"     "document\.getElementById|document\.querySelector" "Direct DOM access in React — prefer refs unless interfacing with a non-React library"
flag "SHOULD"  "window\.\w+\s*=" "Direct mutation of window object — leaks across navigations and is hard to test"

# --- Console / debugging leftovers ---
flag "NIT" "console\.(log|debug|info)\(" "console statement left in code — remove or replace with proper logger"
flag "NIT" "debugger;" "'debugger' statement in committed code"
flag "NIT" "\.only\(" ".only() in test — will skip all other tests when CI runs"
flag "NIT" "TODO|FIXME|XXX|HACK" "TODO/FIXME comment — track these in your issue tracker, not the codebase"

# --- Error swallowing ---
flag "SHOULD" "catch\s*\(\s*\w*\s*\)\s*\{\s*\}" "Empty catch block — errors silently swallowed"
flag "SHOULD" "catch\s*\(\s*\w*\s*\)\s*\{\s*//" "catch block with only a comment — error swallowed"

# --- Insecure patterns ---
flag "BLOCKER" "eval\(" "eval() — RCE risk if any input is user-controlled. Almost always replaceable"
flag "BLOCKER" "new Function\(" "new Function() — same risks as eval()"
flag "SHOULD"  "Math\.random\(\).*token|Math\.random\(\).*secret|Math\.random\(\).*password" "Math.random() is not cryptographically secure — use crypto.randomBytes / crypto.randomUUID"

# --- HTTP / fetch ---
flag "SHOULD" "fetch\([^)]+\)(?!\.then|\s*\.catch|\s+\.then)" "fetch() without error handling — network failures will throw uncaught"
flag "SHOULD" "fetch\([^)]+\)\s*\.then\([^)]+\)(?!\s*\.catch)" "fetch().then() with no .catch() — unhandled rejection on network failure"

# --- Type definitions ---
flag "NIT" "interface\s+\w+\s*\{\s*\[key:\s*string\]:\s*any" "Index signature with 'any' — model the actual shape if possible"

echo "  (TypeScript/JavaScript scan complete)"
