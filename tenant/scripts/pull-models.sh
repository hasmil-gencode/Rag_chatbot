#!/bin/bash
# Pull required models into Ollama container after it starts.
# Run once after first `docker-compose up -d`.

set -e

OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"

echo "Waiting for Ollama to be ready..."
until curl -sf "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; do
  sleep 2
done
echo "Ollama is ready."

echo "Pulling glm-ocr model (~2.2GB)..."
curl -sf "$OLLAMA_HOST/api/pull" -d '{"name":"glm-ocr:latest"}' | while read -r line; do
  status=$(echo "$line" | grep -o '"status":"[^"]*"' | head -1)
  [ -n "$status" ] && echo "  $status"
done
echo "glm-ocr pulled."

echo "Pulling nomic-embed-text-v2-moe (~700MB)..."
curl -sf "$OLLAMA_HOST/api/pull" -d '{"name":"nomic-embed-text-v2-moe"}' | while read -r line; do
  status=$(echo "$line" | grep -o '"status":"[^"]*"' | head -1)
  [ -n "$status" ] && echo "  $status"
done
echo "nomic-embed-text-v2-moe pulled."

echo "All models ready."
