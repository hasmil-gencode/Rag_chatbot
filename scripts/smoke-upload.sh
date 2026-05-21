#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:1223}}"
TOKEN="${2:-${SMOKE_TOKEN:-}}"
FILE_PATH="${3:-${SMOKE_UPLOAD_FILE:-}}"
BASE_URL="${BASE_URL%/}"

if [ -z "$TOKEN" ]; then
  echo "Usage: $0 <base-url> <jwt-token> [file-path]" >&2
  echo "Or set BASE_URL, SMOKE_TOKEN, SMOKE_UPLOAD_FILE." >&2
  exit 2
fi

created_temp=0
if [ -z "$FILE_PATH" ]; then
  FILE_PATH="$(mktemp /tmp/genia-smoke-upload.XXXXXX.txt)"
  created_temp=1
  cat > "$FILE_PATH" <<'TXT'
Genia smoke upload file.
This file verifies that multipart upload reaches the tenant server.
TXT
fi
if [ "$created_temp" = "1" ]; then trap 'rm -f "$FILE_PATH"' EXIT; fi

echo "== Upload: ${BASE_URL}/api/upload (${FILE_PATH})"
curl -fsS \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Request-ID: smoke-upload" \
  -F "file=@${FILE_PATH}" \
  -F "type=document" \
  -F "sharedWith=[]" \
  "${BASE_URL}/api/upload"

echo
echo "OK"
