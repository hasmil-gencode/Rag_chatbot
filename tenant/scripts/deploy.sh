#!/bin/bash
# ============================================================
# RAG Chatbot — Full Deployment Script
# Run this on your server after copying all project files.
# ============================================================
set -e

echo "============================================"
echo "  RAG Chatbot — Deployment"
echo "============================================"
echo ""

# ── Step 1: Environment file ────────────────────────────────
echo "── Step 1: Setting up .env ──"
if [ ! -f .env ]; then
  cp .env.example .env
  # Generate random JWT secret
  JWT=$(openssl rand -hex 64)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/change-this-to-random-secret/$JWT/" .env
  else
    sed -i "s/change-this-to-random-secret/$JWT/" .env
  fi
  echo "  ✅ .env created with random JWT_SECRET"
  echo "  ⚠️  Edit .env to set N8N_USER and N8N_PASSWORD if needed"
else
  echo "  ✅ .env already exists, skipping"
fi
echo ""

# ── Step 2: Build and start containers ──────────────────────
echo "── Step 2: Building and starting containers ──"
docker compose up -d --build 2>&1
echo "  ✅ All containers started"
echo ""

# ── Step 3: Wait for services to be healthy ─────────────────
echo "── Step 3: Waiting for services ──"

echo -n "  MongoDB: "
for i in $(seq 1 30); do
  if docker compose exec -T mongodb mongosh --eval "db.adminCommand('ping')" --quiet 2>/dev/null | grep -q "ok"; then
    echo "✅ ready"
    break
  fi
  [ $i -eq 30 ] && echo "❌ timeout" && exit 1
  sleep 2
done

echo -n "  Qdrant: "
for i in $(seq 1 30); do
  if curl -sf http://localhost:6333/healthz > /dev/null 2>&1; then
    echo "✅ ready"
    break
  fi
  [ $i -eq 30 ] && echo "❌ timeout"
  sleep 2
done

echo -n "  Ollama: "
for i in $(seq 1 30); do
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ ready"
    break
  fi
  [ $i -eq 30 ] && echo "❌ timeout"
  sleep 2
done

echo -n "  n8n: "
for i in $(seq 1 30); do
  if curl -sf http://localhost:5678/healthz > /dev/null 2>&1; then
    echo "✅ ready"
    break
  fi
  [ $i -eq 30 ] && echo "⚠️  may still be starting"
  sleep 2
done

echo -n "  App: "
for i in $(seq 1 30); do
  if curl -sf http://localhost:1223 > /dev/null 2>&1; then
    echo "✅ ready"
    break
  fi
  [ $i -eq 30 ] && echo "❌ timeout"
  sleep 2
done
echo ""

# ── Step 4: Seed developer user ─────────────────────────────
echo "── Step 4: Creating developer user ──"
docker compose exec -T rag-chatbot node seed.js 2>&1
echo ""

# ── Step 5: Pull Ollama models ──────────────────────────────
echo "── Step 5: Pulling Ollama models ──"

echo -n "  glm-ocr (~2.2GB): "
docker compose exec -T ollama ollama pull glm-ocr:latest 2>&1 | tail -1
echo "  ✅ glm-ocr pulled"

echo -n "  nomic-embed-text-v2-moe (~700MB): "
docker compose exec -T ollama ollama pull nomic-embed-text-v2-moe 2>&1 | tail -1
echo "  ✅ nomic-embed-text-v2-moe pulled"

echo ""

# ── Step 6: Verify GLM-OCR service ─────────────────────────
echo "── Step 6: Checking GLM-OCR service ──"
echo -n "  glmocr-service: "
for i in $(seq 1 60); do
  if curl -sf http://localhost:5002/health > /dev/null 2>&1; then
    echo "✅ ready"
    break
  fi
  [ $i -eq 60 ] && echo "⚠️  may still be loading PP-DocLayoutV3 model"
  sleep 3
done
echo ""

# ── Done ────────────────────────────────────────────────────
echo "============================================"
echo "  ✅ Deployment Complete!"
echo "============================================"
echo ""
echo "  Services:"
echo "    App:     http://localhost:1223"
echo "    n8n:     http://localhost:5678"
echo "    Qdrant:  http://localhost:6333/dashboard"
echo "    Ollama:  http://localhost:11434"
echo "    MongoDB: mongodb://localhost:27017"
echo ""
echo "  Next steps:"
echo "    1. Open http://localhost:1223"
echo "    2. Login: developer@gencode.com.my / Developer@123"
echo "    3. Go to Settings → Chat → set LLM provider + API key"
echo "    4. Go to Settings → Upload Processing → configure OCR + embedding"
echo "    5. Go to Settings → Webhooks → set n8n URLs (http://n8n:5678/webhook/...)"
echo ""
