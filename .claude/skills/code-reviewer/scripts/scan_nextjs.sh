#!/usr/bin/env bash
# scan_nextjs.sh - Next.js-specific antipattern detection
# Focuses on App Router footguns: client/server boundary, env var exposure, hydration
# Usage: bash scan_nextjs.sh <path>

set -u
TARGET="${1:-.}"

if command -v rg >/dev/null 2>&1; then
  GREP="rg --no-heading --line-number --color=never"
  TS_FILTER="-tts -tjs --type-add=tsx:*.tsx --type-add=jsx:*.jsx -ttsx -tjsx"
  EXCLUDES="--glob=!node_modules --glob=!.next --glob=!dist --glob=!build"
else
  GREP="grep -rEn"
  TS_FILTER='--include=*.ts --include=*.tsx --include=*.js --include=*.jsx'
  EXCLUDES="--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build"
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

# --- Environment variable exposure ---
# NEXT_PUBLIC_ prefixed vars are bundled into client JS — should never contain secrets
flag "BLOCKER" "NEXT_PUBLIC_[A-Z_]*(SECRET|KEY|TOKEN|PASSWORD|PRIVATE|SERVICE_ROLE)" "NEXT_PUBLIC_ prefix bundles this var into the client JS — exposing a secret. Rename without NEXT_PUBLIC_ and access only in server components/route handlers"

# Env vars used in client components (without NEXT_PUBLIC_)
# This is approximate — looking for process.env access in files with 'use client'
echo "  Checking for process.env access in 'use client' files..."
if command -v rg >/dev/null 2>&1; then
  rg -l "['\"]use client['\"]" "$TARGET" -tts -ttsx -tjs -tjsx --glob=!node_modules --glob=!.next 2>/dev/null | while read -r f; do
    matches=$(grep -nE "process\.env\.(?!NEXT_PUBLIC_)" "$f" 2>/dev/null | head -3)
    if [ -n "$matches" ]; then
      echo "$matches" | while IFS= read -r m; do
        echo "[SHOULD] $f:$m"
        echo "       → process.env access in 'use client' file — non-NEXT_PUBLIC_ vars are undefined in browser. Either rename with NEXT_PUBLIC_ prefix (if safe to expose) or move logic to server"
      done
    fi
  done
fi

# --- Client/server boundary issues ---

# Server-only imports in client components
flag "BLOCKER" "^import.*from\s+['\"]fs['\"]|^import.*from\s+['\"]node:fs['\"]" "Importing 'fs' — only works in Node runtime, will crash in client components or edge runtime"
flag "BLOCKER" "^import.*from\s+['\"]child_process['\"]" "child_process import — only valid server-side, will crash in client bundle"

# Using server-only API in client component (heuristic: cookies/headers in files with 'use client')
# This needs the two-file check, so emit a hint
echo "  Tip: also check that next/headers (cookies, headers) is only used in server components"

# --- Image / Link / metadata mistakes ---
flag "SHOULD" "<img\s+src=" "Native <img> instead of next/image — slower LCP, no auto-optimization. Use <Image> from 'next/image'"
flag "SHOULD" "<a\s+href=\"/" "Native <a href=\"/...\"> for internal nav — does a full page reload. Use <Link> from 'next/link'"

# --- Data fetching ---
flag "SHOULD" "fetch\([^)]+\)(?!\s*,\s*\{)" "fetch() without options in Next.js — defaults changed between versions. Be explicit about caching: { cache: 'no-store' } or { next: { revalidate: N } }"
flag "SHOULD"  "useEffect\([^,]+,\s*\[\]\s*\).*fetch\(" "Client-side fetch in useEffect — usually better as a server component or with React Query/SWR for caching"

# --- Hydration mismatches ---
flag "SHOULD" "Math\.random\(\)|Date\.now\(\)|new Date\(\)" "Math.random/Date.now/new Date in component body — will cause hydration mismatch between server and client renders. Move to useEffect or a server component"
flag "SHOULD" "typeof window" "'typeof window' check usually papers over a hydration bug. Consider useEffect or 'use client'"

# --- API routes / route handlers ---
flag "SHOULD" "NextResponse\.json\([^)]+\)(?!\s*,)" "NextResponse.json without explicit status — defaults to 200 even on errors. Pass { status: 4xx/5xx } for error responses"
flag "BLOCKER" "export\s+const\s+runtime\s*=\s*['\"]edge['\"]" "Edge runtime restricts Node APIs — verify all imports work in edge (no fs, no native modules)"

# --- Middleware ---
flag "SHOULD" "middleware\.ts.*\.then\(|middleware\.js.*\.then\(" "Async work in middleware — runs on every request, watch latency. Keep middleware fast and stateless"

# --- Common 'use client' mistakes ---
flag "SHOULD" "['\"]use client['\"][^a-zA-Z]+async\s+function" "Async function in 'use client' file at top level — async components are server-only in App Router"

echo "  (Next.js scan complete)"
