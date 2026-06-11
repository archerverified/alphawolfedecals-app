#!/usr/bin/env bash
# scan_secrets.sh - Detect exposed secrets, API keys, tokens
# Usage: bash scan_secrets.sh <path>

set -u
TARGET="${1:-.}"

# Pick the grep tool
if command -v rg >/dev/null 2>&1; then
  GREP="rg --no-heading --line-number --color=never"
  EXCLUDES="--glob=!node_modules --glob=!.next --glob=!.venv --glob=!venv --glob=!__pycache__ --glob=!dist --glob=!build --glob=!.git --glob=!*.lock --glob=!*.lockb"
else
  GREP="grep -rEn"
  EXCLUDES="--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.venv --exclude-dir=venv --exclude-dir=__pycache__ --exclude-dir=dist --exclude-dir=build --exclude-dir=.git --exclude=*.lock --exclude=*.lockb"
fi

flag() {
  local sev="$1"; local pattern="$2"; local msg="$3"
  local results
  results=$($GREP $EXCLUDES "$pattern" "$TARGET" 2>/dev/null | grep -vE "\.env\.example|\.env\.sample|README|\.md:" | head -20)
  if [ -n "$results" ]; then
    echo "$results" | while IFS= read -r line; do
      echo "[$sev] $line"
      echo "       → $msg"
    done
  fi
}

# --- High-confidence secret patterns ---

# AWS
flag "BLOCKER" "AKIA[0-9A-Z]{16}" "AWS Access Key ID hardcoded — rotate immediately and move to env vars"
flag "BLOCKER" "aws_secret_access_key[\"']?\s*[:=]\s*[\"'][A-Za-z0-9/+=]{40}[\"']" "AWS Secret Access Key hardcoded"

# GitHub tokens
flag "BLOCKER" "ghp_[A-Za-z0-9]{36}" "GitHub Personal Access Token hardcoded"
flag "BLOCKER" "github_pat_[A-Za-z0-9_]{82}" "GitHub fine-grained PAT hardcoded"
flag "BLOCKER" "ghs_[A-Za-z0-9]{36}" "GitHub Server-to-Server token hardcoded"

# OpenAI / Anthropic
flag "BLOCKER" "sk-ant-[A-Za-z0-9_-]{50,}" "Anthropic API key hardcoded"
flag "BLOCKER" "sk-proj-[A-Za-z0-9_-]{40,}" "OpenAI project API key hardcoded"
flag "BLOCKER" "sk-[A-Za-z0-9]{48}" "OpenAI API key hardcoded"

# Stripe
flag "BLOCKER" "sk_live_[A-Za-z0-9]{24,}" "Stripe LIVE secret key hardcoded — rotate immediately"
flag "SHOULD"  "sk_test_[A-Za-z0-9]{24,}" "Stripe test secret key hardcoded — should be in env var"
flag "BLOCKER" "rk_live_[A-Za-z0-9]{24,}" "Stripe LIVE restricted key hardcoded"

# Supabase
flag "BLOCKER" "eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{100,}" "Long JWT hardcoded — likely a Supabase service_role or anon key. Move to env."

# Generic high-entropy patterns
flag "SHOULD" "(api[_-]?key|apikey|secret|password|passwd|token)[\"']?\s*[:=]\s*[\"'][A-Za-z0-9_/+=-]{20,}[\"']" "Hardcoded credential-looking string — verify it isn't a real secret"

# Connection strings
flag "BLOCKER" "(mongodb|postgres|postgresql|mysql|redis|rediss)://[^:]+:[^@\s]+@" "Database connection string with embedded credentials"

# Private keys
flag "BLOCKER" "-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----" "Private key material in source"

# Slack / Discord webhooks (less catastrophic, but still leak vectors)
flag "SHOULD" "hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+" "Slack webhook URL hardcoded"
flag "SHOULD" "discord\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+" "Discord webhook URL hardcoded"

# Twilio
flag "BLOCKER" "SK[a-f0-9]{32}" "Twilio API Key hardcoded"
flag "BLOCKER" "AC[a-f0-9]{32}.*[a-f0-9]{32}" "Twilio Account SID + Auth Token pair hardcoded"

# Generic .env in committed files (different from .env.example)
if [ -d "$TARGET" ]; then
  if [ -f "$TARGET/.env" ] && [ ! -f "$TARGET/.gitignore" ]; then
    echo "[BLOCKER] $TARGET/.env"
    echo "       → .env file exists with no .gitignore — risk of committing secrets"
  fi
fi

echo "  (secrets scan complete)"
