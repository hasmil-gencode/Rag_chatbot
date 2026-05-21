#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:1223}}"
COLLECTION_ID="${2:-${SMOKE_COLLECTION_ID:-}}"
BASE_URL="${BASE_URL%/}"

if [ -z "$COLLECTION_ID" ]; then
  echo "Usage: $0 <base-url> <external-collection-id>" >&2
  echo "Auth: set SMOKE_API_KEY or INTERNAL_KEY." >&2
  exit 2
fi

auth_header=()
if [ -n "${SMOKE_API_KEY:-}" ]; then
  auth_header=(-H "x-api-key: ${SMOKE_API_KEY}")
elif [ -n "${INTERNAL_KEY:-}" ]; then
  auth_header=(-H "x-internal-key: ${INTERNAL_KEY}")
else
  echo "Missing auth. Set SMOKE_API_KEY or INTERNAL_KEY." >&2
  exit 2
fi

payload="$(cat <<JSON
{
  "collectionId": "${COLLECTION_ID}",
  "mode": "append",
  "records": [
    {
      "id": "smoke_$(date +%s)",
      "content": "Smoke ingest record for deployment verification.",
      "metadata": {
        "externalUserId": "smoke_user",
        "type": "smoke",
        "status": "test"
      }
    }
  ]
}
JSON
)"

echo "== Ingest: ${BASE_URL}/api/ingest (${COLLECTION_ID})"
curl -fsS \
  "${auth_header[@]}" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: smoke-ingest" \
  -d "$payload" \
  "${BASE_URL}/api/ingest"

echo
echo "OK"
