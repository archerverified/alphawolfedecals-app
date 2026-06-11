#!/usr/bin/env bash
# scan_supabase.sh - Supabase-specific antipattern detection
# Focuses on the cardinal sins: service_role in client code, RLS bypass, auth misuse
# Usage: bash scan_supabase.sh <path>

set -u
TARGET="${1:-.}"

if command -v rg >/dev/null 2>&1; then
  GREP="rg --no-heading --line-number --color=never"
  TS_FILTER="-tts -tjs --type-add=tsx:*.tsx --type-add=jsx:*.jsx -ttsx -tjsx --type-add=py:*.py -tpy"
  EXCLUDES="--glob=!node_modules --glob=!.next --glob=!.venv --glob=!venv --glob=!dist --glob=!build"
else
  GREP="grep -rEn"
  TS_FILTER='--include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.py'
  EXCLUDES="--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.venv --exclude-dir=venv --exclude-dir=dist --exclude-dir=build"
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

# --- THE CARDINAL SIN: service_role key in client code ---
# Look for SERVICE_ROLE usage in any file
echo "  Checking for service_role key usage and where it appears..."

if command -v rg >/dev/null 2>&1; then
  SERVICE_FILES=$(rg -l "SERVICE_ROLE|service_role" "$TARGET" -tts -ttsx -tjs -tjsx -tpy --glob=!node_modules --glob=!.next --glob=!.env.example 2>/dev/null)
else
  SERVICE_FILES=$(grep -rlE "SERVICE_ROLE|service_role" "$TARGET" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null)
fi

if [ -n "$SERVICE_FILES" ]; then
  echo "$SERVICE_FILES" | while read -r f; do
    # Files in /app, /components, /pages, /src/components, etc. with 'use client' are client-side
    has_use_client=$(grep -l "['\"]use client['\"]" "$f" 2>/dev/null)
    in_client_path=$(echo "$f" | grep -E "(^|/)(components|pages|app)(/|$)" | grep -v "/api/" | grep -v "route\.(ts|js)$")

    if [ -n "$has_use_client" ] || [ -n "$in_client_path" ]; then
      matches=$(grep -nE "SERVICE_ROLE|service_role" "$f" 2>/dev/null)
      echo "$matches" | while IFS= read -r m; do
        echo "[BLOCKER] $f:$m"
        echo "       → service_role key in client-accessible code! This key bypasses ALL Row Level Security. Move to a server-only route handler/server action/API route. Rotate the key if this is in production."
      done
    fi
  done
fi

# --- Service role key in NEXT_PUBLIC_ env var ---
flag "BLOCKER" "NEXT_PUBLIC_.*SERVICE_ROLE|NEXT_PUBLIC_.*SUPABASE_SERVICE" "service_role key in NEXT_PUBLIC_ env var — bundled into client JS, equivalent to making your entire DB public. Rotate the key immediately"

# --- Auth misuse ---
flag "SHOULD" "supabase\.auth\.signInWithPassword\([^)]+\)(?!\s*\.then|\s*\.catch|\s*\.\w)" "signInWithPassword without error handling — silent failure on invalid credentials"
flag "SHOULD" "supabase\.auth\.getUser\(\).*\.\w+" "Chaining off auth.getUser() — destructure { data, error } and handle the null/error case before accessing user fields"
flag "BLOCKER" "supabase\.auth\.getSession\(\)" "auth.getSession() returns potentially stale data and CAN be spoofed via cookie tampering in server contexts. Use auth.getUser() in server code — it validates with the auth server"

# --- RLS bypass patterns ---
flag "SHOULD" "createClient\([^)]*SERVICE_ROLE[^)]*\)" "Client created with service_role key — confirm this file is server-only and document why RLS bypass is needed"

# --- Realtime subscriptions ---
flag "SHOULD" "\.subscribe\(\)(?!\s*\.then)" "Realtime subscribe without unsubscribe — memory leak on component unmount. Return channel.unsubscribe() from useEffect"

# --- Query patterns ---
flag "SHOULD" "\.select\(\s*['\"]?\*['\"]?\s*\)" "select('*') — returns all columns including potentially sensitive ones. Be explicit about columns"
flag "SHOULD" "\.eq\(['\"](id|user_id|email)['\"],\s*[a-zA-Z_]+\\.[a-zA-Z]" "Filtering by user-provided ID without explicit validation — confirm the ID is from a verified source (auth.uid()), not request body"

# --- Storage ---
flag "SHOULD" "\.storage\.from\([^)]+\)\.upload\([^)]+\)(?!\s*,\s*\{)" "Storage upload without options — defaults may not match intent (cacheControl, upsert, contentType). Be explicit"
flag "BLOCKER" "\.storage\.from\([^)]+\)\.createSignedUrl\([^,]+,\s*\d{7,}\)" "Signed URL with very long expiry (>10 days) — large blast radius if leaked. Use shorter expiry and re-sign on demand"

# --- Type generation reminder ---
if [ -d "$TARGET" ]; then
  has_supabase=$(find "$TARGET" -name "*.ts" -o -name "*.tsx" 2>/dev/null | xargs grep -l "createClient" 2>/dev/null | head -1)
  has_types=$(find "$TARGET" -name "database.types.ts" -o -name "supabase.types.ts" 2>/dev/null | head -1)
  if [ -n "$has_supabase" ] && [ -z "$has_types" ]; then
    echo "[NIT] (no generated types found)"
    echo "       → Consider running: npx supabase gen types typescript --linked > types/database.types.ts"
  fi
fi

echo "  (Supabase scan complete)"
