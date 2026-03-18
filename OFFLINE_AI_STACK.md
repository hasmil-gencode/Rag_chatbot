# Offline AI Stack — Local Models Reference

Panduan model-model AI yang boleh run fully local/Docker untuk replace cloud APIs.

---

## 1. Embedding Models (Vector Search)

**Current:** Gemini `embedding-001` (3072 dims, cloud, kena internet)
**Problem:** pgvector HNSW/ivfflat index max 2000 dims

### Ollama Local Embedding Models

| Model | Dims | Size | Context | Accuracy | Speed | Best For |
|---|---|---|---|---|---|---|
| `nomic-embed-text` ⭐ | 768 | 274MB | 8192 tok | 0.847 | 125 doc/s | General purpose, best balance |
| `snowflake-arctic-embed` | 1024 | 560MB | 512 tok | 0.891 | 78 doc/s | Technical content |
| `mxbai-embed-large` | 1024 | 670MB | 512 tok | 0.856 | 95 doc/s | Multilingual |
| `bge-large` | 1024 | 1.34GB | 512 tok | 0.903 | 52 doc/s | Max accuracy |
| `all-minilm` | 384 | 67MB | 512 tok | 0.789 | 340 doc/s | Lightweight/fast |

**Recommendation:** `nomic-embed-text`
- 768 dims — within pgvector HNSW limit (2000), boleh index
- 8192 token context — paling panjang, handle long docs
- 274MB — ringan untuk small PC
- Run via Ollama Docker container

### pgvector Index Limits

| Index Type | Max Dims | Notes |
|---|---|---|
| HNSW | 2000 | Best recall, faster queries |
| ivfflat | 2000 | Needs training data |
| halfvec HNSW | 4000 | Half precision (float16) |
| No index (exact) | 16000 | Brute force, fine for small data |

---

## 2. STT — Speech-to-Text

**Current:** Gemini AI (cloud, boleh rojak bahasa)

### Faster-Whisper ⭐ RECOMMENDED

| Item | Detail |
|---|---|
| Model | `whisper-large-v3-turbo` |
| Languages | 100+ termasuk Malay, Chinese, Tamil, English |
| Code-switching | ✅ Boleh handle rojak/mixed languages |
| Docker | `linuxserver/faster-whisper` |
| Size | ~1.5GB (turbo), ~3GB (large-v3) |
| CPU/GPU | Dua-dua OK, GPU lagi laju |
| Speed | 4x faster than original Whisper |
| Accuracy | 10-20% better than v2 |
| API | Wyoming protocol / REST API |

**Why this:**
- Closest replacement to Gemini STT
- Multilingual + rojak bahasa support
- Proven production-ready, banyak orang guna
- CTranslate2 engine — optimized inference

### Other STT Options

| Model | Languages | Size | Notes |
|---|---|---|---|
| Whisper.cpp | 100+ | ~1.5-3GB | C++ impl, faster on CPU, manual setup |
| Vosk | 20+ | 50MB-1.5GB | Very lightweight, less accurate |

---

## 3. TTS — Text-to-Speech

**Current:** Google Cloud Long Audio Synthesis (cloud API)

### Chatterbox Multilingual ⭐ RECOMMENDED

| Item | Detail |
|---|---|
| Languages | 23 languages |
| Malay | ✅ YES — out of the box |
| Size | ~2GB |
| Docker | ✅ Ready (OpenAI-compatible API) |
| Quality | Very natural, #1 HuggingFace TTS Arena |
| Voice Clone | ✅ Zero-shot voice cloning |
| API | OpenAI-compatible `/v1/audio/speech` |
| License | Open source (Resemble AI) |

**Supported languages:**
Arabic, Danish, German, Greek, English, Spanish, Finnish, French, Hebrew, Hindi, Italian, Japanese, Korean, **Malay**, Dutch, Norwegian, Polish, Portuguese, Russian, Swedish, Swahili, Turkish, Chinese

**Why this:**
- Satu-satunya local TTS dengan Malay support
- OpenAI-compatible API — senang integrate
- Voice cloning capability
- Docker ready

### Other TTS Options

| Model | Languages | Malay? | Size | Quality | Notes |
|---|---|---|---|---|---|
| Piper | 30+ | ❌ | ~20MB/voice | Good | Super fast, CPU only |
| Kokoro | EN,JA,ZH,KO | ❌ | 82M params | Very natural | Tiny, English-focused |
| Coqui XTTS-v2 | 17 | ❌ | ~2GB | Natural | Voice cloning, no Malay |

---

## 4. Chat LLM — Language Model (Brain)

**Current:** n8n + cloud LLM (via API)

### Top Local LLM Models untuk Small PC (8-16GB RAM)

| Model | Params | RAM (Q4) | Context | Languages | Speed (CPU) | RAG Score | Best For |
|---|---|---|---|---|---|---|---|
| `qwen3:8b` ⭐ | 8B | ~5GB | 128K | 119 languages | 10-20 t/s | 0.91* | Best overall, multilingual |
| `qwen3:4b` | 4B | ~2.5GB | 32K | 119 languages | 20-40 t/s | ~0.85 | Ultra-lightweight |
| `llama3.1:8b` | 8B | ~5GB | 128K | 8 languages | 10-18 t/s | 0.88 | Ecosystem, fine-tunes |
| `phi4-mini` | 3.8B | ~2.5GB | 128K | 20+ languages | 25-45 t/s | 0.83 | Fastest, low resource |
| `gemma3:4b` | 4B | ~2.5GB | 128K | 140+ languages | 20-35 t/s | ~0.82 | Google ecosystem |
| `mistral:7b` | 7B | ~4.5GB | 32K | EU languages | 12-20 t/s | 0.86 | European languages |

*RAG faithfulness score (RAGAS benchmark). Speed varies by CPU — tested on DDR5 systems.

### Qwen3 8B ⭐ RECOMMENDED

| Item | Detail |
|---|---|
| Parameters | 8B (dense) |
| RAM needed | ~5GB (Q4_K_M quantization) |
| Context window | 128K tokens |
| Languages | 119 languages termasuk **Malay**, Chinese, English |
| Speed (CPU only) | 10-20 tokens/sec (DDR4), 18-25 t/s (DDR5) |
| Speed (GPU 8GB) | 40-89 tokens/sec |
| License | Apache 2.0 (free commercial use) |
| Ollama | `ollama pull qwen3:8b` |
| RAG faithfulness | 0.91 (best in class for 8B) |
| Thinking mode | ✅ Hybrid thinking/non-thinking |

**Why Qwen3 8B:**
- #1 ranked for RAG faithfulness among small models
- 119 languages — Malay, English, Chinese semua ada
- 128K context — boleh handle banyak document chunks sekaligus
- Apache 2.0 — free untuk commercial, boleh deliver ke client
- Hybrid thinking mode — boleh toggle deep reasoning on/off
- Fits in 8GB RAM — sesuai untuk small PC client

### Qwen3 30B-A3B (MoE) — Kalau Ada GPU

| Item | Detail |
|---|---|
| Total params | 30B (tapi activate 3B je per token — MoE) |
| RAM needed | ~18.6GB (Q4_K_M) |
| Context window | 262K tokens |
| Speed (CPU DDR5) | 18-25 tokens/sec |
| Speed (RTX 3090) | 89 tokens/sec |
| RAG faithfulness | 0.91 (best overall, #1 ranked) |

**Why consider:**
- 30B quality tapi speed macam 3B model (MoE architecture)
- #1 ranked for RAG overall (Prem AI benchmark 2026)
- Tapi perlukan 24GB+ RAM/VRAM — tak sesuai untuk 8GB small PC
- Best kalau client PC ada 16-32GB RAM

### Decision Guide — Pilih Mana?

| Client PC Spec | Recommended Model | RAM Used | Notes |
|---|---|---|---|
| 8GB RAM, no GPU | `qwen3:4b` | ~2.5GB | Leaves room for other services |
| 16GB RAM, no GPU | `qwen3:8b` | ~5GB | Best balance |
| 16GB RAM + GPU | `qwen3:8b` | ~5GB VRAM | Much faster with GPU |
| 32GB RAM / 24GB GPU | `qwen3:30b-a3b` | ~18.6GB | Premium quality |

### Embedding Model Update

Qwen3 juga ada embedding model yang #1 ranked:

| Model | MTEB Score | Dims | Languages | Size |
|---|---|---|---|---|
| `qwen3-embedding` (8B) | 70.58 | 4096 (configurable) | 100+ | ~5GB |
| `nomic-embed-text` | 62.4 | 768 | English-focused | 274MB |
| `bge-m3` | 63.0 | 1024 | 100+ | ~1.5GB |

**Note:** `qwen3-embedding` is #1 MTEB multilingual tapi 4096 dims default — exceeds pgvector 2000 limit.
Boleh configure ke lower dims (768/1024) via Matryoshka representation.
Atau stick dengan `nomic-embed-text` (768 dims) yang lebih ringan untuk small PC.

---

## Full Offline Stack Summary

```
┌─────────────┬──────────────────────────┬────────────────────────┐
│ Function    │ Cloud (Current)          │ Local (Target)         │
├─────────────┼──────────────────────────┼────────────────────────┤
│ Chat LLM    │ n8n + cloud LLM          │ Qwen3 8B (Ollama)      │
│ Embedding   │ Gemini embedding-001     │ nomic-embed-text       │
│ STT         │ Gemini AI                │ faster-whisper (turbo) │
│ TTS         │ Google Cloud TTS         │ Chatterbox Multilingual│
│ Database    │ MongoDB Atlas            │ PostgreSQL + pgvector  │
└─────────────┴──────────────────────────┴────────────────────────┘
```

## Hardware Requirements (Small PC)

### Minimum (8GB RAM — basic mode)
| Component | Spec | Notes |
|---|---|---|
| RAM | 8GB | Use `qwen3:4b` (2.5GB) + lighter services |
| Storage | 30GB free | Models + Docker images |
| CPU | 4 cores | Expect slower inference (~10 t/s) |
| GPU | Not required | CPU-only works |

### Recommended (16GB RAM — full stack)
| Component | Spec | Notes |
|---|---|---|
| RAM | 16GB | `qwen3:8b` (5GB) + all services comfortable |
| Storage | 50GB free | All models + data |
| CPU | 8 cores | Good inference speed (~20 t/s) |
| GPU | NVIDIA 8GB+ VRAM | 3-4x faster LLM + STT |

### Estimated RAM Usage (Full Stack)

| Service | RAM Usage |
|---|---|
| PostgreSQL + pgvector | ~200MB |
| Ollama (qwen3:8b + nomic-embed) | ~6GB |
| Faster-Whisper (turbo) | ~2GB |
| Chatterbox TTS | ~2.5GB |
| Node.js App | ~200MB |
| **Total** | **~11GB** |

*16GB RAM recommended untuk run semua serentak. 8GB kena guna smaller models.*

---

## Docker Services (Target)

```yaml
services:
  postgres:        # DB + pgvector
  ollama:          # Chat LLM (qwen3:8b) + Embedding (nomic-embed-text)
  faster-whisper:  # STT
  chatterbox:      # TTS
  rag-chatbot-ui:  # App
```

## References

- Ollama Embedding Models: https://ollama.com/blog/embedding-models
- Faster-Whisper Docker: https://hub.docker.com/r/linuxserver/faster-whisper
- Chatterbox Multilingual: https://huggingface.co/ResembleAI/chatterbox
- Chatterbox TTS API: https://chatterboxtts.com/
- pgvector HNSW Limits: https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes
- Qwen3 Models: https://huggingface.co/Qwen/Qwen3-8B
- Qwen3 Hardware Requirements: https://www.hardware-corner.net/guides/qwen3-hardware-requirements/
- Best LLMs for RAG 2026: https://blog.premai.io/best-open-source-llms-for-rag-in-2026-10-models-ranked-by-retrieval-accuracy/
- Qwen3 119 Languages: https://markaicode.com/qwen3-multilingual-ollama-setup-guide/
- Best Small LLMs 2026: https://www.siliconflow.com/articles/en/best-small-LLMs-for-on-device-chatbots
