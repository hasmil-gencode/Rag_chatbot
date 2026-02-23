#!/bin/bash

echo "📦 Creating production deployment archive..."
echo ""

cd /Users/hasmil/Documents/Gencode_docker_Project

# Create archive excluding unnecessary files
tar -czf rag_chatbot_prod.tar.gz \
  --exclude='Rag_chatbot/node_modules' \
  --exclude='Rag_chatbot/frontend/node_modules' \
  --exclude='Rag_chatbot/frontend/dist' \
  --exclude='Rag_chatbot/*.png' \
  --exclude='Rag_chatbot/.DS_Store' \
  --exclude='Rag_chatbot/frontend/.DS_Store' \
  --exclude='Rag_chatbot/public/.DS_Store' \
  --exclude='Rag_chatbot/*.doc' \
  --exclude='Rag_chatbot/*.txt' \
  --exclude='Rag_chatbot/SPLIT_SCREEN_WEBVIEW_FEATURE.md' \
  --exclude='Rag_chatbot/CLEANUP_SENSITIVE.md' \
  --exclude='Rag_chatbot/duplicate-db.js' \
  --exclude='Rag_chatbot/check-prod-db.js' \
  --exclude='Rag_chatbot/clean-prod-db.js' \
  --exclude='Rag_chatbot/clean-stag-orphaned.js' \
  --exclude='Rag_chatbot/cleanup.sh' \
  Rag_chatbot/

echo ""
echo "✅ Archive created: rag_chatbot_prod.tar.gz"
echo ""
echo "📊 Archive contents:"
tar -tzf rag_chatbot_prod.tar.gz | head -20
echo "..."
echo ""
echo "📏 Archive size:"
ls -lh rag_chatbot_prod.tar.gz | awk '{print $5}'
echo ""
echo "📋 Files to transfer:"
echo "  1. rag_chatbot_prod.tar.gz"
echo ""
echo "🚀 On server, run:"
echo "  tar -xzf rag_chatbot_prod.tar.gz"
echo "  cd Rag_chatbot"
echo "  # Update .env to use ragchatbot_prod"
echo "  docker compose up -d --build"
