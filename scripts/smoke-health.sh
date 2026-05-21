#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:1223}}"
BASE_URL="${BASE_URL%/}"

echo "== Health: ${BASE_URL}/api/health"
response="$(curl -fsS -H "X-Request-ID: smoke-health" "${BASE_URL}/api/health")"
printf '%s\n' "$response"

status="$(printf '%s' "$response" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.status||'')})")"
if [ "$status" != "ok" ]; then
  echo "Health check failed: expected status=ok" >&2
  exit 1
fi

echo "OK"
