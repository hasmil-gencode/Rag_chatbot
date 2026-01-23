# RAG Chatbot UI

RAG chatbot with MongoDB Atlas backend and n8n for AI processing.

## Features
- Login/Authentication (MongoDB)
- Role management (User/Admin)
- Chat interface with history (MongoDB + n8n)
- Voice input with transcription (Groq Whisper)
- File upload and management (Local + n8n vector processing)
- Admin user management
- Webhook configuration

## Setup

1. **Copy files to server**
```bash
scp -r . user@server:/path/to/project
```

2. **Configure environment**
```bash
cd /path/to/project
cp .env.example .env
nano .env  # Update MONGODB_URI and JWT_SECRET
```

3. **Deploy**
```bash
docker-compose up -d --build
```

4. **Login**
- URL: `http://your-server:3000`
- Email: `admin@gencode.com.my` (or custom from .env)
- Password: `Admin@123` (or custom from .env)

Admin user auto-created on first run. Change credentials in `.env` before deployment.

## Voice Input

- Click microphone button to start recording
- Click again to stop and transcribe
- Transcribed text appears in input box
- Uses Groq Whisper API (free tier: 14,400 requests/day)

## Architecture
- **Frontend:** Vanilla JS
- **Backend:** Express.js + MongoDB Atlas
- **n8n:** Chat processing, file vectorization, voice transcription
- **Storage:** Local files + MongoDB metadata

See `WEBHOOK_SPEC.md` and `n8n-workflows/GROQ_WHISPER_SETUP.md` for details.
