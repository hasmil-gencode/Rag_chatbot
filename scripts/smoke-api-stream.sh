#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:1223}}"
API_KEY="${2:-${SMOKE_API_KEY:-}}"
MESSAGE="${3:-${SMOKE_MESSAGE:-Say hello in one short sentence.}}"
BASE_URL="${BASE_URL%/}"

if [ -z "$API_KEY" ]; then
  echo "Usage: $0 <base-url> <api-key> [message]" >&2
  echo "Or set BASE_URL, SMOKE_API_KEY, SMOKE_MESSAGE." >&2
  exit 2
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
payload="$(SMOKE_MESSAGE_PAYLOAD="$MESSAGE" node -e "console.log(JSON.stringify({message:process.env.SMOKE_MESSAGE_PAYLOAD}))")"

echo "== API stream: ${BASE_URL}/api/v1/chat/stream"
curl -N -sS --max-time "${SMOKE_STREAM_MAX_TIME:-45}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: smoke-api-stream" \
  -d "$payload" \
  "${BASE_URL}/api/v1/chat/stream" | tee "$tmp"

if [ ! -s "$tmp" ]; then
  echo "No streamed text received." >&2
  exit 1
fi

if grep -Eq '^(event|data): ' "$tmp"; then
  echo "Unexpected SSE wrapper detected; expected raw streamed text." >&2
  exit 1
fi

echo
echo "OK"
