#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:1223}}"
TOKEN="${2:-${SMOKE_TOKEN:-}}"
MESSAGE="${3:-${SMOKE_MESSAGE:-Say hello in one short sentence.}}"
BASE_URL="${BASE_URL%/}"

if [ -z "$TOKEN" ]; then
  echo "Usage: $0 <base-url> <jwt-token> [message]" >&2
  echo "Or set BASE_URL, SMOKE_TOKEN, SMOKE_MESSAGE." >&2
  exit 2
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
payload="$(SMOKE_MESSAGE_PAYLOAD="$MESSAGE" node -e "console.log(JSON.stringify({message:process.env.SMOKE_MESSAGE_PAYLOAD}))")"

echo "== Browser chat stream: ${BASE_URL}/api/chat/stream"
curl -N -sS --max-time "${SMOKE_STREAM_MAX_TIME:-45}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "X-Request-ID: smoke-chat-stream" \
  -d "$payload" \
  "${BASE_URL}/api/chat/stream" | tee "$tmp"

if ! grep -Eq '^event: (status|token|done|replace|error)' "$tmp"; then
  echo "No SSE events detected." >&2
  exit 1
fi

echo
echo "OK"
