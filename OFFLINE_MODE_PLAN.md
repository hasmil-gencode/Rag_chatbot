# Offline Mode Implementation Plan

Plan untuk add offline mode — local storage, local STT/TTS, Ollama LLM, n8n.

---

## Qwen3 Tool Calling — Confirmed ✅

Qwen3 8B **supports tool/function calling** via Ollama. Community reports excellent tool-calling accuracy
for tasks like file I/O, database queries, and real-time data fetching. n8n Ollama node boleh guna
Qwen3 as the model — tool calling untuk vector search, embeddings, etc semua OK.

---

## Phase 1: Docker Services (Ollama + n8n)

### Add to docker-compose.yml:

```yaml
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    restart: unless-stopped
    # GPU support (optional, uncomment if NVIDIA GPU available):
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: all
    #           capabilities: [gpu]

  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_USER:-admin}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD:-admin}
      - WEBHOOK_URL=http://n8n:5678
    volumes:
      - n8n_data:/home/node/.n8n
    restart: unless-stopped
```

### Model Pre-pull (after container up):
```bash
docker exec ollama ollama pull qwen3:8b
docker exec ollama ollama pull nomic-embed-text
```

---

## Phase 2: Settings — Add Offline Mode

### Current Settings Structure (JSONB in PostgreSQL):
```json
{
  "companyName": "GenBotChat",
  "voiceMode": "browser|gemini|elevenlabs",
  "ttsMode": "browser|gemini|elevenlabs|gclas",
  "s3Bucket": "", "s3Region": "", "s3AccessKey": "", "s3SecretKey": "",
  "chatWebhook": "", "uploadWebhook": "", ...
}
```

### New Settings Fields to Add:

```json
{
  "storageMode": "local",
  "localStoragePath": "/app/uploads",

  "voiceMode": "local",
  "whisperUrl": "http://ollama:11434",
  "whisperModel": "qwen3:8b",

  "ttsMode": "local",
  "chatterboxUrl": "http://chatterbox:8000",
  "chatterboxVoice": "default",

  "ollamaUrl": "http://ollama:11434",
  "ollamaModel": "qwen3:8b",
  "ollamaEmbeddingModel": "nomic-embed-text"
}
```

### What Changes Where:

#### A. Storage (S3 → Local)
- **Current:** S3 tab in settings — bucket, region, keys
- **New:** Add "Storage Mode" dropdown: `S3 (Cloud)` | `Local Folder`
- When `local`: files save to `localStoragePath` (default `/app/uploads`)
- When `s3`: existing S3 config works as-is
- **server.js change:** Upload endpoint checks `storageMode` before trying S3

#### B. STT (Voice Input)
- **Current dropdown options:** Browser, Gemini, ElevenLabs
- **Add new option:** `Local (Whisper)` — uses faster-whisper container
- When selected, show: Whisper URL field (default `http://faster-whisper:8080`)
- **server.js:** Already has `voiceMode === 'local'` handler! Just needs correct URL

#### C. TTS (Voice Output)
- **Current dropdown options:** Browser, Gemini, ElevenLabs, Google Cloud
- **Add new option:** `Local (Chatterbox)` — uses Chatterbox container
- When selected, show: Chatterbox URL, Voice selection
- **server.js change:** Add `ttsMode === 'local'` handler — POST to Chatterbox API

#### D. LLM / Chat Model
- **Current:** n8n webhook handles chat (cloud LLM inside n8n)
- **New:** n8n uses Ollama node → Qwen3 8B locally
- Settings: `ollamaUrl`, `ollamaModel` — for n8n to connect
- No server.js change needed — n8n workflow config handles this

#### E. Embedding
- **Current:** Gemini embedding-001 (via n8n or direct)
- **New:** Ollama nomic-embed-text (via n8n Ollama node)
- Settings: `ollamaEmbeddingModel` — for n8n workflow
- n8n workflow update: swap Gemini embedding node → Ollama embedding node

---

## Phase 3: Frontend Settings Page Changes

### Current Tabs:
1. General
2. Webhooks
3. S3 Storage
4. Voice

### New Tabs:
1. General
2. Webhooks
3. **Storage** (renamed from "S3 Storage")
4. Voice
5. **AI Models** (new)

### Tab: Storage (updated)
```
[Storage Mode]  ▼ Local Folder | S3 (Cloud)

--- If "Local Folder" selected ---
[Local Path]    /app/uploads    (read-only, info text)
"Files stored locally in Docker volume. No cloud needed."

--- If "S3 (Cloud)" selected ---
[S3 Bucket]     my-bucket
[S3 Region]     us-east-1
[Access Key]    ****
[Secret Key]    ****
[Test Connection]
```

### Tab: Voice (updated STT dropdown)
```
[Voice Recognition Mode]  ▼ Browser | Local (Whisper) | Gemini | ElevenLabs

--- If "Local (Whisper)" selected ---
[Whisper URL]     http://faster-whisper:8080
[Language]        ▼ Auto | Malay | English | Chinese | Tamil
"Uses local Whisper model. No internet needed."

[TTS Mode]  ▼ Browser | Local (Chatterbox) | Gemini | ElevenLabs | Google Cloud

--- If "Local (Chatterbox)" selected ---
[Chatterbox URL]  http://chatterbox:8000
[Voice]           ▼ default
[Language]        ▼ Auto | Malay | English | Chinese
"Uses local Chatterbox TTS. Supports Malay."
```

### Tab: AI Models (new)
```
[Ollama URL]           http://ollama:11434
[Chat Model]           ▼ qwen3:8b | qwen3:4b | llama3.1:8b
[Embedding Model]      ▼ nomic-embed-text | bge-m3
[Test Connection]      → calls GET http://ollama:11434/api/tags
"Configure local AI models for chat and embedding."
```

---

## Phase 4: server.js Changes

### 4A. Upload — Add storageMode check
```javascript
// In POST /api/upload
const storageMode = settings.storageMode || 'local';
if (storageMode === 's3') {
  // existing S3 logic
} else {
  fileUrl = `file://${req.file.path}`;
}
```

### 4B. TTS — Add local Chatterbox handler
```javascript
// In POST /api/tts, add new mode:
if (ttsMode === 'local') {
  const chatterboxUrl = settings.chatterboxUrl || 'http://chatterbox:8000';
  const { data } = await axios.post(`${chatterboxUrl}/v1/audio/speech`, {
    input: text,
    voice: settings.chatterboxVoice || 'default',
    model: 'chatterbox'
  }, { responseType: 'arraybuffer', timeout: 30000 });
  res.set('Content-Type', 'audio/wav');
  res.send(Buffer.from(data));
}
```

### 4C. STT — Already has local mode!
The `voiceMode === 'local'` handler already exists in server.js.
Just need to make sure `WHISPER_API_URL` env var or settings field points to faster-whisper.

### 4D. Settings API — Add new fields to GET response
```javascript
// Add to GET /api/settings response:
storageMode: s.storageMode || 'local',
localStoragePath: s.localStoragePath || '/app/uploads',
whisperUrl: s.whisperUrl || process.env.WHISPER_API_URL || 'http://faster-whisper:8080',
chatterboxUrl: s.chatterboxUrl || 'http://chatterbox:8000',
chatterboxVoice: s.chatterboxVoice || 'default',
ollamaUrl: s.ollamaUrl || 'http://ollama:11434',
ollamaModel: s.ollamaModel || 'qwen3:8b',
ollamaEmbeddingModel: s.ollamaEmbeddingModel || 'nomic-embed-text',
```

### 4E. Default settings in init.sql
Add new defaults to the INSERT statement.

---

## Phase 5: n8n Workflow Update

User will manually update n8n workflows to:
1. Swap cloud LLM node → Ollama Chat node (qwen3:8b)
2. Swap Gemini embedding → Ollama Embedding node (nomic-embed-text)
3. Vector search: n8n queries PostgreSQL pgvector directly
4. Ollama URL in n8n: `http://ollama:11434` (Docker internal network)

---

## Implementation Order

1. ✅ **docker-compose.yml** — add ollama + n8n services
2. ✅ **init.sql** — add new default settings fields
3. ✅ **server.js** — add storageMode logic, local TTS handler, new settings fields
4. ✅ **SettingsPage.tsx** — update Storage tab, Voice tab, add AI Models tab
5. 🔧 **Test** — docker-compose up, verify all services connect
6. 🔧 **n8n workflows** — user configures manually

---

## Files to Modify

| File | Changes |
|---|---|
| `docker-compose.yml` | Add ollama, n8n services + volumes |
| `db/init.sql` | Add new default settings fields |
| `server.js` | storageMode check, local TTS handler, settings fields |
| `frontend/src/components/chat/SettingsPage.tsx` | Storage tab, Voice options, AI Models tab |
| `.env.example` | Add N8N_USER, N8N_PASSWORD, WHISPER_API_URL |
