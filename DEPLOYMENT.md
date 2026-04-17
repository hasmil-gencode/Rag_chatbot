# Deployment Guide — AWS Server

## Files to Transfer

```bash
# From project root, transfer these:
scp -r \
  Dockerfile \
  docker-compose.prod.yml \
  package.json \
  package-lock.json \
  server.js \
  uploadPipeline.js \
  frontend/ \
  glmocr-service/ \
  public/ \
  .env \
  user@YOUR_SERVER:/opt/rag-chatbot/
```

Or use rsync (faster for updates):
```bash
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='uploads' \
  ./ user@YOUR_SERVER:/opt/rag-chatbot/
```

## Files NOT to transfer
- `node_modules/` — rebuilt in Docker
- `uploads/` — user data, keep on server
- `docker-compose.yml` — dev only, use `docker-compose.prod.yml` on server

## AWS Security Group

Only open these ports:

| Port | Service | Access |
|------|---------|--------|
| 22   | SSH     | Your IP only |
| 80   | HTTP (optional, for reverse proxy) | 0.0.0.0/0 |
| 443  | HTTPS (optional, for reverse proxy) | 0.0.0.0/0 |
| 1223 | App     | 0.0.0.0/0 (or behind reverse proxy) |
| 5678 | n8n UI  | Your IP only |

**DO NOT open:** 27017 (MongoDB), 6333 (Qdrant), 11434 (Ollama), 5002 (GLM-OCR)
These stay internal to Docker network.

## Deploy

```bash
cd /opt/rag-chatbot

# Create .env file
cat > .env << 'EOF'
JWT_SECRET=your-secure-random-string-here
N8N_USER=admin
N8N_PASSWORD=your-n8n-password
EOF

# Create uploads directory
mkdir -p uploads public/logos

# Build and start (use prod compose file)
docker compose -f docker-compose.prod.yml up -d --build

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f rag-chatbot
```

## Network Architecture

```
Internet
  │
  ├── :1223 → rag-chatbot (Express.js + React)
  ├── :5678 → n8n (workflow UI — restrict to your IP)
  │
  └── [ragnet] Docker internal network
        ├── mongodb:27017    (no external access)
        ├── qdrant:6333      (no external access)
        ├── ollama:11434     (no external access)
        ├── glmocr-service:5002 (no external access)
        └── n8n:5678         (internal webhooks)
```

All services talk to each other via service names (e.g., `mongodb`, `qdrant`, `ollama`) inside the `ragnet` network. No port conflicts with other projects.

## Multiple Projects on Same Server

Each project gets its own network. Example:

```
Project A: ragnet      → mongodb, qdrant, ollama (isolated)
Project B: project-b   → mongodb, qdrant (isolated, different data)
```

No port conflicts because internal services don't expose ports.
Only app ports (1223, 1224, etc.) need to be different.

## Optional: Nginx Reverse Proxy

For HTTPS and domain name:

```nginx
server {
    listen 443 ssl;
    server_name chat.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/chat.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:1223;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Update Deployment

```bash
cd /opt/rag-chatbot
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='uploads' \
  user@local:~/project/ ./
docker compose -f docker-compose.prod.yml up -d --build rag-chatbot
```

Only rebuilds the app container. MongoDB, Qdrant, Ollama data persists in Docker volumes.
