-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Settings (JSONB key-value, single row like MongoDB)
CREATE TABLE settings (
  id TEXT PRIMARY KEY DEFAULT 'config',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (id, data) VALUES ('config', '{
  "companyName": "GenBotChat",
  "storageMode": "local",
  "localStoragePath": "/app/uploads",
  "voiceMode": "browser",
  "voiceLanguage": "auto",
  "googleSttApiKey": "",
  "googleTtsApiKey": "",
  "geminiSttApiKey": "",
  "geminiTtsApiKey": "",
  "elevenlabsApiKey": "",
  "elevenlabsVoice": "onwK4e9ZLuTAKqWW03F9",
  "gclasServiceAccount": "",
  "gclasLanguage": "auto",
  "gclasVoice": "en-US-Neural2-C",
  "geminiVoice": "Aoede",
  "geminiTtsLanguage": "auto",
  "ttsMode": "browser",
  "ttsLanguage": "en-US",
  "whisperUrl": "",
  "chatterboxUrl": "",
  "chatterboxVoice": "default",
  "ollamaUrl": "http://ollama:11434",
  "ollamaModel": "qwen3:8b",
  "ollamaEmbeddingModel": "nomic-embed-text",
  "chatWebhook": "",
  "uploadWebhook": "",
  "transcribeWebhook": "",
  "formSubmissionWebhook": "",
  "s3Bucket": "",
  "s3Region": "",
  "s3AccessKey": "",
  "s3SecretKey": ""
}'::jsonb);

-- Organizations (self-referencing hierarchy)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  path JSONB,
  parent_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  group_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups (storage & quota management)
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  storage_limit_gb NUMERIC,
  chat_quota INT DEFAULT 0,
  bonus_quota INT DEFAULT 0,
  quota_type TEXT DEFAULT 'individual',
  renew_day INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK after both tables exist
ALTER TABLE organizations ADD CONSTRAINT fk_org_group FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;

-- Departments
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user',
  roles UUID[] DEFAULT '{}',
  status TEXT DEFAULT 'active',
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  can_upload_files BOOLEAN DEFAULT true,
  must_change_password BOOLEAN DEFAULT false,
  active_session_token TEXT,
  last_login TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roles
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT[] DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User-Organization assignments
CREATE TABLE user_org_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(user_id, organization_id)
);

-- Messages (chat)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT,
  session_id TEXT NOT NULL,
  current_organization_id UUID,
  started_by TEXT,
  started_by_email TEXT,
  role TEXT,
  content TEXT,
  chat_type TEXT DEFAULT 'browser',
  chat_name TEXT DEFAULT 'normal',
  organization_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- Deleted messages (audit trail)
CREATE TABLE deleted_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_id UUID,
  session_id TEXT,
  user_id TEXT,
  content TEXT,
  role TEXT,
  started_by TEXT,
  started_by_email TEXT,
  deleted_by TEXT,
  deleted_by_email TEXT,
  organization_id UUID,
  current_organization_id UUID,
  chat_type TEXT,
  chat_name TEXT,
  created_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Files
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  shared_with UUID[] DEFAULT '{}',
  type TEXT,
  is_downloadable BOOLEAN DEFAULT false,
  is_vectorized BOOLEAN DEFAULT false,
  uploaded_by TEXT,
  uploaded_by_email TEXT,
  name TEXT NOT NULL,
  size BIGINT,
  url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Embeddings (pgvector)
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text TEXT,
  embedding vector(768),
  file_name TEXT,
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  shared_with TEXT[] DEFAULT '{}',
  organization_id UUID,
  department_id UUID,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
-- Note: pgvector ivfflat/hnsw indexes max 2000 dims.
-- Gemini embedding-001 = 3072 dims, so we use exact search (no index).
-- For production with large data, consider dimensionality reduction or halfvec.
-- Exact search is fine for <100k rows.

-- Robot settings
CREATE TABLE robot_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  navigation JSONB DEFAULT '[]'::jsonb,
  motion JSONB DEFAULT '[]'::jsonb,
  emotion JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat counts (quota tracking)
CREATE TABLE chat_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID,
  month TEXT NOT NULL,
  count INT DEFAULT 0,
  UNIQUE(group_id, user_id, month)
);

-- Chat resets
CREATE TABLE chat_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  reset_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, month)
);

-- API keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  short_key TEXT UNIQUE,
  has_short_key BOOLEAN DEFAULT false,
  name TEXT,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  robot_setting_id UUID REFERENCES robot_settings(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- Download tracking
CREATE TABLE download_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID,
  file_name TEXT,
  user_id UUID,
  user_email TEXT,
  organization_id UUID,
  ip_address TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- API usage
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID,
  endpoint TEXT,
  method TEXT,
  response_status INT,
  ip_address TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
