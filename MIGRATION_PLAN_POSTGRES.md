# Migration Plan: MongoDB → PostgreSQL + pgvector

## Overview

| Item | Detail |
|---|---|
| Source | MongoDB Atlas (cloud) |
| Target | PostgreSQL 17 + pgvector (Docker, fully local) |
| Collections to migrate | 18 |
| Total DB operations in server.js | 187 collection calls |
| Aggregation pipelines | 3 |
| Estimated effort | 3-5 hari |

---

## Collections → Tables Mapping

| # | MongoDB Collection | PG Table | Operations Count | Complexity |
|---|---|---|---|---|
| 1 | `settings` | `settings` | 14 | Low |
| 2 | `users` | `users` | 27 | Medium |
| 3 | `organizations` | `organizations` | 32 | Medium |
| 4 | `user_organization_assignments` | `user_org_assignments` | 16 | Low |
| 5 | `groups` | `groups` | 11 | Low |
| 6 | `roles` | `roles` | 9 | Low |
| 7 | `messages` | `messages` | 9 | Medium (aggregation) |
| 8 | `deleted_messages` | `deleted_messages` | 4 | Medium (aggregation) |
| 9 | `files` | `files` | 11 | Medium |
| 10 | `embedding_files` | `embeddings` | 4 | High (vector) |
| 11 | `robot_settings` | `robot_settings` | 9 | Low |
| 12 | `chat_counts` | `chat_counts` | 9 | Low |
| 13 | `chat_resets` | `chat_resets` | 4 | Low |
| 14 | `api_keys` | `api_keys` | 8 | Low |
| 15 | `departments` | `departments` | 6 | Low |
| 16 | `download_tracking` | `download_tracking` | 4 | Medium (aggregation) |
| 17 | `api_usage` | `api_usage` | 3 | Low |
| 18 | `permissions` | `permissions` | 1 | Low |

---

## Phase 1: Setup Infrastructure (Hari 1)

### 1.1 Update `docker-compose.yml`

Tambah PostgreSQL + pgvector container:

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_USER: ${PG_USER:-raguser}
      POSTGRES_PASSWORD: ${PG_PASSWORD:-ragpass}
      POSTGRES_DB: ${PG_DATABASE:-ragchatbot}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped

  rag-chatbot-ui:
    build: .
    ports:
      - "1223:3000"
    depends_on:
      - postgres
    environment:
      - NODE_ENV=production
      - PG_HOST=postgres
      - PG_PORT=5432
      - PG_USER=${PG_USER:-raguser}
      - PG_PASSWORD=${PG_PASSWORD:-ragpass}
      - PG_DATABASE=${PG_DATABASE:-ragchatbot}
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./uploads:/app/uploads
      - ./public/logos:/app/public/logos
    restart: unless-stopped

volumes:
  pgdata:
```

### 1.2 Create Schema (`db/init.sql`)

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Settings (key-value store, replaces single document)
CREATE TABLE settings (
  id TEXT PRIMARY KEY DEFAULT 'config',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  organization_id UUID,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organizations (self-referencing for hierarchy)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  path TEXT,
  parent_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User-Organization assignments
CREATE TABLE user_org_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(user_id, organization_id)
);

-- Groups
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roles
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  permissions JSONB DEFAULT '[]'::jsonb,
  organization_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Departments
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  organization_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages (chat)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  user_id UUID,
  content TEXT,
  role TEXT, -- 'user' or 'assistant'
  started_by TEXT,
  started_by_email TEXT,
  organization_id UUID,
  current_organization_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_user ON messages(user_id);

-- Deleted messages
CREATE TABLE deleted_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT,
  content TEXT,
  role TEXT,
  started_by TEXT,
  started_by_email TEXT,
  deleted_by_email TEXT,
  organization_id UUID,
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Files
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  group_id UUID,
  shared_with UUID[] DEFAULT '{}',
  type TEXT, -- 'document' or 'form'
  is_downloadable BOOLEAN DEFAULT false,
  is_vectorized BOOLEAN DEFAULT false,
  uploaded_by TEXT,
  uploaded_by_email TEXT,
  name TEXT NOT NULL,
  size BIGINT,
  url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Embeddings (pgvector!) - replaces embedding_files
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text TEXT,
  embedding vector(3072), -- Gemini embedding dimension
  file_name TEXT,
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  shared_with TEXT[] DEFAULT '{}',
  organization_id UUID,
  department_id UUID,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Robot settings
CREATE TABLE robot_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID,
  data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat counts
CREATE TABLE chat_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  organization_id UUID,
  count INT DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  reset_at TIMESTAMPTZ
);

-- Chat resets
CREATE TABLE chat_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  organization_id UUID,
  reset_at TIMESTAMPTZ DEFAULT NOW()
);

-- API keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  key TEXT UNIQUE NOT NULL,
  organization_id UUID,
  permissions JSONB DEFAULT '[]'::jsonb,
  created_by UUID,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Download tracking
CREATE TABLE download_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID,
  file_name TEXT,
  user_email TEXT,
  organization_id UUID,
  downloaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- API usage
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID,
  endpoint TEXT,
  organization_id UUID,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.3 Update `package.json`

```bash
# Remove MongoDB driver, add PostgreSQL
npm uninstall mongodb
npm install pg
```

---

## Phase 2: Database Layer (Hari 1-2)

### 2.1 Create `db.js` — Database abstraction

Buat file `db.js` yang handle connection dan helper functions:

```js
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  user: process.env.PG_USER || 'raguser',
  password: process.env.PG_PASSWORD || 'ragpass',
  database: process.env.PG_DATABASE || 'ragchatbot',
});

export const query = (text, params) => pool.query(text, params);
export default pool;
```

### 2.2 Key Pattern Changes

**MongoDB → PostgreSQL cheat sheet:**

| MongoDB | PostgreSQL (pg) |
|---|---|
| `db.collection('users').findOne({ email })` | `query('SELECT * FROM users WHERE email = $1', [email])` → `.rows[0]` |
| `db.collection('users').find({}).toArray()` | `query('SELECT * FROM users')` → `.rows` |
| `db.collection('users').insertOne(doc)` | `query('INSERT INTO users (...) VALUES (...) RETURNING *', [...])` |
| `db.collection('users').updateOne({_id}, {$set: data})` | `query('UPDATE users SET ... WHERE id = $1', [...])` |
| `db.collection('users').deleteOne({_id})` | `query('DELETE FROM users WHERE id = $1', [id])` |
| `new ObjectId(id)` | UUID string langsung (tak perlu convert) |
| `{ $in: [...] }` | `WHERE id = ANY($1::uuid[])` |
| Aggregation pipeline | SQL `GROUP BY` + `ORDER BY` |

---

## Phase 3: Migrate server.js (Hari 2-4)

Migrate ikut priority — core features dulu:

### Batch 1: Auth & Settings (14 + 27 = 41 operations)
- `settings` — 14 calls
- `users` — 27 calls (login, register, profile, admin CRUD)
- **Test:** Login, register, profile update

### Batch 2: Organization & Roles (58 operations)
- `organizations` — 32 calls
- `user_organization_assignments` — 16 calls
- `roles` — 9 calls
- `permissions` — 1 call
- **Test:** Org CRUD, user assignment, role management

### Batch 3: Chat (22 operations)
- `messages` — 9 calls (includes 1 aggregation → SQL GROUP BY)
- `chat_counts` — 9 calls
- `chat_resets` — 4 calls
- **Test:** Send message, load history, session list

### Batch 4: Files & Embeddings (19 operations)
- `files` — 11 calls
- `embedding_files` → `embeddings` — 4 calls (pgvector!)
- **Test:** Upload file, embedding storage, vector search

### Batch 5: Admin & Misc (47 operations)
- `groups` — 11 calls
- `departments` — 6 calls
- `robot_settings` — 9 calls
- `api_keys` — 8 calls
- `deleted_messages` — 4 calls
- `download_tracking` — 4 calls
- `api_usage` — 3 calls
- `api_keys` — 2 calls
- **Test:** Admin panel, API keys, download tracking

---

## Phase 4: pgvector Integration (Hari 4)

### 4.1 Vector search query (replaces MongoDB Atlas Vector Search / n8n)

```sql
-- Cari similar documents
SELECT id, text, file_name,
  1 - (embedding <=> $1::vector) AS similarity
FROM embeddings
WHERE shared_with && $2  -- array overlap check
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

### 4.2 Insert embedding

```sql
INSERT INTO embeddings (text, embedding, file_name, file_id, shared_with)
VALUES ($1, $2::vector, $3, $4, $5);
```

### 4.3 n8n Impact

Kalau n8n sekarang handle vector search via MongoDB Atlas:
- Option A: Update n8n workflow guna PostgreSQL node + pgvector query
- Option B: Buat vector search endpoint dalam Express, n8n call API je

---

## Phase 5: Testing & Cleanup (Hari 5)

- [ ] Test semua auth flows
- [ ] Test chat send/receive/history
- [ ] Test file upload + embedding
- [ ] Test admin panel (users, orgs, roles)
- [ ] Test API keys
- [ ] Test voice input
- [ ] Remove MongoDB dependencies dari `package.json`
- [ ] Update `.env.example`
- [ ] Update `README.md`
- [ ] Update `docker-compose.yml` (remove MONGODB_URI)

---

## .env Changes

```bash
# REMOVE
MONGODB_URI=mongodb+srv://...

# ADD
PG_USER=raguser
PG_PASSWORD=ragpass
PG_DATABASE=ragchatbot
PG_HOST=postgres
PG_PORT=5432
```

---

## Risk & Mitigation

| Risk | Mitigation |
|---|---|
| Data loss during migration | Git committed, boleh rollback |
| Aggregation pipeline complex | Cuma 3 pipelines, semua straightforward GROUP BY |
| ObjectId → UUID mismatch | Frontend tak guna ObjectId directly (confirmed clean) |
| n8n workflow break | Test n8n integration last, boleh keep MongoDB temporarily |
| Embedding dimension mismatch | Gemini embedding-001 = 3072 dimensions, set dalam schema |
| `shared_with` array field | PostgreSQL native array type support |

---

## Rollback Plan

Dah commit MongoDB version. Kalau anything goes wrong:

```bash
git stash   # or git checkout .
# Revert docker-compose.yml to use MongoDB
docker-compose up -d
```
