# Deployment Guide

## Prerequisites
- Docker & Docker Compose installed
- MongoDB Atlas account (or local MongoDB)
- n8n instance running (for RAG processing)

## Files to Configure

### 1. Environment Variables
Copy `.env.example` to `.env` and update:
```bash
cp .env.example .env
nano .env
```

Required variables:
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Random secret key for JWT tokens

### 2. Build & Deploy
```bash
# Build frontend
cd frontend
npm install
npm run build
cd ..

# Start containers
docker-compose up -d --build
```

### 3. Initialize Database
```bash
# Create first admin user (run once)
node init-rbac.js
```

### 4. Configure n8n Workflows
Import workflows from:
- `n8n-chat-workflow-updated.json`
- `n8n-upload-workflow-updated.json`

Update webhook URLs in Settings > Webhooks tab.

## Server Deployment

### Transfer Files
```bash
# From local machine
scp -r . user@server:/path/to/project

# Exclude unnecessary files (already in .gitignore)
rsync -av --exclude='node_modules' --exclude='uploads' --exclude='.env' . user@server:/path/to/project
```

### On Server
```bash
cd /path/to/project

# Configure environment
cp .env.example .env
nano .env  # Update MONGODB_URI and JWT_SECRET

# Build and start
docker-compose up -d --build

# Initialize (first time only)
docker exec -it rag_chatbot-rag-chatbot-ui-1 node init-rbac.js
```

## Default Settings
- Deleted chat retention: 360 days
- Auto cleanup: Daily at midnight
- First user must be created with role 'admin'

## Ports
- Application: 3000 (mapped to host port 1223 in docker-compose.yml)

## Troubleshooting

### Logs
```bash
docker-compose logs -f
```

### Restart
```bash
docker-compose restart
```

### Rebuild
```bash
docker-compose down
docker-compose up -d --build
```

## Security Notes
- Never commit `.env` file
- Change JWT_SECRET in production
- Use strong passwords for admin accounts
- Configure firewall rules for port 3000/1223
