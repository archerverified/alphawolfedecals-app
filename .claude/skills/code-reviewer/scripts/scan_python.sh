#!/usr/bin/env bash
# scan_python.sh - Python antipattern detection
# Usage: bash scan_python.sh <path>

set -u
TARGET="${1:-.}"

if command -v rg >/dev/null 2>&1; then
  GREP="rg --no-heading --line-number --color=never -tpy"
  EXCLUDES="--glob=!.venv --glob=!venv --glob=!__pycache__ --glob=!*.pyc --glob=!build --glob=!dist --glob=!.tox"
else
  GREP="grep -rEn --include=*.py"
  EXCLUDES="--exclude-dir=.venv --exclude-dir=venv --exclude-dir=__pycache__ --exclude-dir=build --exclude-dir=dist --exclude-dir=.tox"
fi

flag() {
  local sev="$1"; local pattern="$2"; local msg="$3"
  local results
  results=$($GREP $EXCLUDES "$pattern" "$TARGET" 2>/dev/null | head -15)
  if [ -n "$results" ]; then
    echo "$results" | while IFS= read -r line; do
      echo "[$sev] $line"
      echo "       → $msg"
    done
  fi
}

# --- Code execution / injection ---
flag "BLOCKER" "(^|[^a-zA-Z_])eval\(" "eval() — RCE risk. Use ast.literal_eval() for safe literal parsing"
flag "BLOCKER" "(^|[^a-zA-Z_])exec\(" "exec() — RCE risk. Almost always avoidable"
flag "BLOCKER" "subprocess\.(call|run|Popen|check_output)\([^)]*shell=True" "subprocess with shell=True + user input = shell injection. Use list args instead"
flag "BLOCKER" "os\.system\(" "os.system() — shell injection risk. Use subprocess.run() with list args"
flag "BLOCKER" "pickle\.loads?\(" "pickle.load on untrusted data = arbitrary code execution. Use JSON or msgpack instead"
flag "SHOULD"  "yaml\.load\([^)]*\)(?!\s*,\s*Loader)" "yaml.load without explicit Loader — use yaml.safe_load()"

# --- SQL injection ---
flag "BLOCKER" "(execute|executemany)\(\s*f[\"']" "f-string in SQL execute() — SQL injection. Use parameterized queries (%s placeholders)"
flag "BLOCKER" "(execute|executemany)\(.*\+.*\)" "String concatenation in SQL execute() — SQL injection. Use parameters"
flag "BLOCKER" "(execute|executemany)\(.*%\s+\w" "% formatting in SQL — SQL injection. Use parameterized queries"
flag "SHOULD"  "\.format\([^)]+\).*SELECT|\.format\([^)]+\).*INSERT|\.format\([^)]+\).*UPDATE|\.format\([^)]+\).*DELETE" "str.format() building SQL — likely injection vector"

# --- Exception handling ---
flag "SHOULD" "except\s*:" "Bare 'except:' catches everything including KeyboardInterrupt and SystemExit — use 'except Exception:' at minimum"
flag "SHOULD" "except\s+Exception\s*:\s*$" "Catching Exception with no handler — at least log it"
flag "SHOULD" "except\s+\w+\s*:\s*pass" "Silently swallowing exceptions — at least log them"

# --- Mutable default args ---
flag "BLOCKER" "def\s+\w+\([^)]*=\s*\[\][^)]*\)" "Mutable default argument [] — shared across calls. Use None and set inside function"
flag "BLOCKER" "def\s+\w+\([^)]*=\s*\{\}[^)]*\)" "Mutable default argument {} — shared across calls. Use None and set inside function"

# --- Hashing / crypto ---
flag "SHOULD" "hashlib\.(md5|sha1)\(" "MD5/SHA1 are cryptographically broken — use sha256+ for security-sensitive contexts (file checksums are fine)"
flag "SHOULD" "random\.(random|randint|choice)\([^)]*\).*token|random\.(random|randint|choice)\([^)]*\).*secret|random\.(random|randint|choice)\([^)]*\).*password" "random module is not cryptographically secure — use secrets module"

# --- Async footguns ---
flag "SHOULD" "async\s+def[^:]+:[^a-zA-Z]+(?!.*await)" "async def with no await — function doesn't need to be async (or you forgot to await something)"
flag "SHOULD" "asyncio\.run\(.*\).*asyncio\.run\(" "Multiple asyncio.run() calls — creates new event loops, can't share state. Use a single entry point"

# --- HTTP ---
flag "SHOULD" "requests\.(get|post|put|delete|patch)\([^)]+\)(?!\s*\.|\s*$)" "requests call without timeout — will hang forever on bad networks. Add timeout=N"
flag "BLOCKER" "verify=False" "TLS certificate verification disabled — man-in-the-middle risk"

# --- Logging / debug leftovers ---
flag "NIT" "^\s*print\(" "print() in code — replace with logging module for anything beyond CLI tools"
flag "NIT" "breakpoint\(\)" "breakpoint() left in code"
flag "NIT" "import pdb|pdb\.set_trace" "pdb import or set_trace left in code"
flag "NIT" "TODO|FIXME|XXX|HACK" "TODO/FIXME comment — track in issue tracker"

# --- Path handling ---
flag "SHOULD" "open\([^)]+\)(?!\s*as)" "open() without context manager — file handle may leak. Use 'with open(...) as f:'"

# --- Datetime ---
flag "SHOULD" "datetime\.now\(\)(?!\s*\.replace.*tzinfo)" "datetime.now() without timezone — produces naive datetimes that bite in production. Use datetime.now(timezone.utc)"
flag "SHOULD" "datetime\.utcnow\(\)" "datetime.utcnow() is deprecated and returns naive datetime — use datetime.now(timezone.utc)"

echo "  (Python scan complete)"
