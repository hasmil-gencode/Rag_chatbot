#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:1223}}"
EMAIL="${2:-${SMOKE_EMAIL:-}}"
PASSWORD="${3:-${SMOKE_PASSWORD:-}}"
BASE_URL="${BASE_URL%/}"

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "Usage: $0 <base-url> <email> <password>" >&2
  echo "Or set BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD." >&2
  exit 2
fi

echo "== Login: ${BASE_URL}/api/login (${EMAIL})"
payload="$(SMOKE_LOGIN_EMAIL="$EMAIL" SMOKE_LOGIN_PASSWORD="$PASSWORD" node -e "console.log(JSON.stringify({email:process.env.SMOKE_LOGIN_EMAIL,password:process.env.SMOKE_LOGIN_PASSWORD}))")"
response="$(curl -fsS \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: smoke-login" \
  -d "$payload" \
  "${BASE_URL}/api/login")"

token="$(printf '%s' "$response" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); if (j.mustChangePassword) { console.error('User must change password first.'); process.exit(3); } console.log(j.token||'')})")"

if [ -z "$token" ]; then
  echo "Login did not return token." >&2
  printf '%s\n' "$response" >&2
  exit 1
fi

echo "$token"
