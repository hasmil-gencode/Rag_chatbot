# Known Issues & TODOs

## 1. pgvector Index Limitation (3072 dimensions)

**Status:** Open — pilih model baru dari senarai bawah

**Problem:**
Gemini `embedding-001` outputs 3072-dimension vectors. pgvector HNSW & ivfflat indexes max 2000 dimensions.

**Current workaround:**
No vector index — exact (brute-force) search. Fine for <100k rows.

**Solutions (pick one):**

### Option A: Tukar embedding model ke local (Ollama) — RECOMMENDED

Semua model bawah ≤2000 dims, boleh HNSW index, fully offline/local via Docker.

| Model | Dims | Size | Context | Accuracy | Speed | Best For |
|---|---|---|---|---|---|---|
| `nomic-embed-text` | 768 | 274MB | 8192 tok | 0.847 | 125 doc/s | General purpose, best balance |
| `mxbai-embed-large` | 1024 | 670MB | 512 tok | 0.856 | 95 doc/s | Multilingual |
| `snowflake-arctic-embed` | 1024 | 560MB | 512 tok | 0.891 | 78 doc/s | Technical content |
| `bge-large` | 1024 | 1.34GB | 512 tok | 0.903 | 52 doc/s | Max accuracy |
| `all-minilm` | 384 | 67MB | 512 tok | 0.789 | 340 doc/s | Lightweight/fast |

**Recommendation: `nomic-embed-text`**
- 768 dims — well within pgvector HNSW limit (2000)
- 8192 token context — handles long documents
- Best accuracy-to-speed ratio
- 274MB — ringan, boleh run on small PC

### Option B: Guna Gemini tapi reduce dimensions

Gemini `gemini-embedding-001` supports `output_dimensionality` parameter:
```
output_dimensionality: 768   // or 1024, 1536
```
Reduce to ≤2000 and enable HNSW index. Tapi still need internet/API.

### Option C: Guna `halfvec` type

pgvector `halfvec` supports indexing up to 4000 dims. Tukar column type:
```sql
ALTER TABLE embeddings ALTER COLUMN embedding TYPE halfvec(3072);
CREATE INDEX ON embeddings USING hnsw (embedding halfvec_cosine_ops);
```
Keeps Gemini 3072 dims, tapi slightly lower precision (float16 vs float32).

## pgvector Index Limits Reference

| Index Type | Max Dimensions | Notes |
|---|---|---|
| HNSW | 2000 | Best recall, faster queries |
| ivfflat | 2000 | Needs training data, slower recall |
| halfvec HNSW | 4000 | Half precision (float16) |
| No index (exact) | 16000 | Brute force, fine for small datasets |

---

**Affected files:**
- `db/init.sql` — embeddings table & index
- `server.js` — embedding generation endpoint
- n8n workflows — if they generate embeddings

**Action required:**
Pick Option A, B, or C, then update schema + embedding generation code accordingly.
