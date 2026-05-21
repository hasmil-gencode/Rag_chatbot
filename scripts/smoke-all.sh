#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:1223}}"
BASE_URL="${BASE_URL%/}"

echo "Running smoke tests against ${BASE_URL}"
echo

"$(dirname "$0")/smoke-health.sh" "$BASE_URL"

if [ -z "${SMOKE_TOKEN:-}" ] && [ -n "${SMOKE_EMAIL:-}" ] && [ -n "${SMOKE_PASSWORD:-}" ]; then
  echo
  echo "Fetching token via login..."
  SMOKE_TOKEN="$("$(dirname "$0")/smoke-login.sh" "$BASE_URL" "$SMOKE_EMAIL" "$SMOKE_PASSWORD" | tail -n 1)"
  export SMOKE_TOKEN
fi

if [ -n "${SMOKE_TOKEN:-}" ]; then
  echo
  "$(dirname "$0")/smoke-chat-stream.sh" "$BASE_URL" "$SMOKE_TOKEN"

  if [ "${SMOKE_RUN_UPLOAD:-0}" = "1" ]; then
    echo
    "$(dirname "$0")/smoke-upload.sh" "$BASE_URL" "$SMOKE_TOKEN"
  else
    echo
    echo "Skipping upload smoke. Set SMOKE_RUN_UPLOAD=1 to enable."
  fi
else
  echo
  echo "Skipping login/chat/upload smoke. Set SMOKE_EMAIL+SMOKE_PASSWORD or SMOKE_TOKEN."
fi

if [ -n "${SMOKE_API_KEY:-}" ]; then
  echo
  "$(dirname "$0")/smoke-api-stream.sh" "$BASE_URL" "$SMOKE_API_KEY"
else
  echo
  echo "Skipping API stream smoke. Set SMOKE_API_KEY."
fi

if [ -n "${SMOKE_COLLECTION_ID:-}" ] && { [ -n "${SMOKE_API_KEY:-}" ] || [ -n "${INTERNAL_KEY:-}" ]; }; then
  echo
  "$(dirname "$0")/smoke-ingest.sh" "$BASE_URL" "$SMOKE_COLLECTION_ID"
else
  echo
  echo "Skipping ingest smoke. Set SMOKE_COLLECTION_ID and SMOKE_API_KEY or INTERNAL_KEY."
fi

echo
echo "Smoke test run complete."
