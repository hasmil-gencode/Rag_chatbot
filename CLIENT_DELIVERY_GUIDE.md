# Client Delivery Guide (Docker Offline)

Panduan untuk package dan deliver project ke client tanpa perlu internet/registry.

## Prasyarat (Mesin Kau)

- Docker & Docker Compose installed
- Project source code

## Prasyarat (Mesin Client)

- Docker & Docker Compose installed
- Takde perlu internet selepas load image

---

## Step 1: Build Image

```bash
docker-compose build
```

## Step 2: Export Image ke File

```bash
# Check nama image
docker images | grep rag-chatbot

# Export
docker save -o rag-chatbot.tar rag-chatbot-ui:latest

# Compress (optional, jimat space)
gzip rag-chatbot.tar
```

## Step 3: Sediakan File untuk Client

Buat folder delivery:

```bash
mkdir -p delivery
cp rag-chatbot.tar.gz delivery/       # atau .tar kalau tak gzip
cp .env.example delivery/.env
cp docker-compose.yml delivery/
mkdir -p delivery/uploads
mkdir -p delivery/public/logos
```

Edit `delivery/docker-compose.yml` — tukar `build: .` ke `image:`:

```yaml
version: '3.8'

services:
  rag-chatbot-ui:
    image: rag-chatbot-ui:latest
    ports:
      - "1223:3000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./uploads:/app/uploads
      - ./public/logos:/app/public/logos
    restart: unless-stopped
```

## Step 4: Hantar ke Client

Copy semua dalam `delivery/` folder ke small PC client:

```
delivery/
├── rag-chatbot.tar.gz
├── docker-compose.yml
├── .env
├── uploads/
└── public/
    └── logos/
```

Boleh guna USB drive, SCP, atau apa-apa cara.

---

## Arahan untuk Client

### Setup Pertama Kali

```bash
# 1. Extract & load image
gunzip rag-chatbot.tar.gz
docker load -i rag-chatbot.tar

# 2. Edit config
nano .env    # Update MONGODB_URI dan JWT_SECRET

# 3. Start
docker-compose up -d
```

### Operasi Harian

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Tengok logs
docker-compose logs -f

# Restart
docker-compose restart
```

### Akses App

Buka browser: `http://localhost:1223`

---

## Update Deployment

Bila ada update baru, ulang proses:

```bash
# Kat mesin kau
docker-compose build
docker save -o rag-chatbot.tar rag-chatbot-ui:latest
gzip rag-chatbot.tar
```

Hantar `rag-chatbot.tar.gz` baru ke client, client run:

```bash
gunzip rag-chatbot.tar.gz
docker load -i rag-chatbot.tar
docker-compose down
docker-compose up -d
```

---

## Quick Script

Letak script ni dalam project untuk automate export:

**`export-delivery.sh`**
```bash
#!/bin/bash
echo "Building image..."
docker-compose build

echo "Exporting image..."
docker save rag-chatbot-ui:latest | gzip > delivery/rag-chatbot.tar.gz

echo "Done! Files ready in delivery/ folder"
ls -lh delivery/rag-chatbot.tar.gz
```

```bash
chmod +x export-delivery.sh
./export-delivery.sh
```
