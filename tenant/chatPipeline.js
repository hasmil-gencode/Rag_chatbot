// Chat Pipeline — Built-in browser chat
// Vector search (with org hierarchy filter) → Build prompt → Call LLM

import axios from 'axios';
import { ObjectId } from 'mongodb';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const QDRANT_COLLECTION = 'documents';

// ─── Org Hierarchy Filter ──────────────────────────────────────
export async function getUserAccessibleOrgIds(db, userId) {
  const assignments = await db.collection('user_organization_assignments')
    .find({ userId: new ObjectId(userId) }).toArray();
  if (!assignments.length) return [];

  const orgIds = assignments.map(a => a.organizationId);
  const orgs = await db.collection('organizations')
    .find({ _id: { $in: orgIds.map(id => new ObjectId(id)) } }).toArray();

  // For each org, find all child orgs via path
  const allOrgIds = new Set(orgIds.map(String));
  for (const org of orgs) {
    if (org.name) {
      const children = await db.collection('organizations')
        .find({ path: org.name }).toArray();
      children.forEach(c => allOrgIds.add(c._id.toString()));
    }
  }
  return [...allOrgIds];
}

// ─── Embed Query ───────────────────────────────────────────────
async function embedQuery(text, settings) {
  const provider = settings.chatEmbeddingProvider;
  const model = settings.chatEmbeddingModel;
  if (!provider) throw new Error('Chat Embedding Provider not configured. Go to Settings → Chat → Embedding.');
  if (!model) throw new Error('Chat Embedding Model not configured. Go to Settings → Chat → Embedding.');

  if (provider === 'ollama') {
    const url = settings.chatEmbeddingOllamaUrl;
    if (!url) throw new Error('Chat Embedding Ollama URL not configured.');
    const res = await axios.post(`${url}/api/embed`, { model, input: text });
    return res.data.embeddings[0];
  }
  if (provider === 'openai') {
    const key = settings[`chatEmbeddingApiKey_openai`] || settings.chatEmbeddingApiKey;
    if (!key) throw new Error('Chat Embedding API key not set for OpenAI. Check Settings or Provider Keys.');
    const openai = new OpenAI({ apiKey: key });
    const res = await openai.embeddings.create({ model, input: [text] });
    return res.data[0].embedding;
  }
  if (provider === 'gemini') {
    const key = settings[`chatEmbeddingApiKey_gemini`] || settings.chatEmbeddingApiKey;
    if (!key) throw new Error('Chat Embedding API key not set for Gemini. Check Settings or Provider Keys.');
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`,
      { content: { parts: [{ text }] }, taskType: 'RETRIEVAL_QUERY' }
    );
    return res.data.embedding.values;
  }
  throw new Error(`Unknown chat embedding provider: ${provider}`);
}

// ─── Vector Search ─────────────────────────────────────────────
async function searchVectors(queryVector, orgIds, settings, fileId = null) {
  const maxChunks = settings.chatMaxChunks || 5;
  const mode = settings.uploadProcessingMode;
  if (!mode) throw new Error('Upload Processing Mode not configured. Go to Settings → Upload Processing.');
  const vectorDb = mode === 'offline' ? 'qdrant' : (settings.vectorDbProvider);
  if (!vectorDb) throw new Error('Vector Database Provider not configured. Go to Settings → Upload Processing → Vector Database.');

  if (vectorDb === 'qdrant') {
    const host = mode === 'offline' ? settings.offlineQdrantHost : settings.qdrantHost;
    const port = mode === 'offline' ? settings.offlineQdrantPort : settings.qdrantPort;
    if (!host || !port) throw new Error('Qdrant host/port not configured. Go to Settings → Upload Processing → Vector Database.');
    const client = new QdrantClient({ host, port });

    // Build filter
    const must = [];
    if (fileId) {
      must.push({ key: 'file_id', match: { value: fileId } });
    }
    const should = orgIds.length > 0 ? orgIds.map(id => ({ key: 'shared_with', match: { value: id } })) : undefined;
    const filter = (must.length > 0 || should) ? { must: must.length > 0 ? must : undefined, should } : undefined;

    const results = await client.search(QDRANT_COLLECTION, {
      vector: queryVector,
      limit: maxChunks,
      with_payload: true,
      filter,
    }).catch(() => []);

    return results.map(r => ({
      content: r.payload?.content || '',
      file_name: r.payload?.file_name || '',
      page_number: r.payload?.page_number || 0,
      score: r.score,
    }));
  }

  // Pinecone
  const pc = new Pinecone({ apiKey: settings.pineconeApiKey });
  const index = pc.index(settings.pineconeIndexName);
  const filter = {};
  if (orgIds.length > 0) filter.shared_with = { $in: orgIds };
  if (fileId) filter.file_id = fileId;
  const results = await index.query({ vector: queryVector, topK: maxChunks, includeMetadata: true, filter: Object.keys(filter).length > 0 ? filter : undefined });
  return (results.matches || []).map(m => ({
    content: m.metadata?.content || '',
    file_name: m.metadata?.file_name || '',
    page_number: m.metadata?.page_number || 0,
    score: m.score,
  }));
}

// ─── Public Vector Search (is_public: true + org scope) ────────
async function searchPublicVectors(queryVector, orgIds, settings) {
  const maxChunks = settings.chatMaxChunks || 5;
  const mode = settings.uploadProcessingMode;
  const vectorDb = mode === 'offline' ? 'qdrant' : (settings.vectorDbProvider || 'qdrant');

  if (vectorDb === 'qdrant') {
    const host = mode === 'offline' ? settings.offlineQdrantHost : settings.qdrantHost;
    const port = mode === 'offline' ? settings.offlineQdrantPort : settings.qdrantPort;
    const client = new QdrantClient({ host, port });

    const must = [{ key: 'is_public', match: { value: true } }];
    const should = orgIds.length > 0 ? orgIds.map(id => ({ key: 'shared_with', match: { value: id } })) : undefined;
    const filter = { must, should };

    const results = await client.search(QDRANT_COLLECTION, {
      vector: queryVector, limit: maxChunks, with_payload: true, filter,
    }).catch(() => []);

    return results.map(r => ({
      content: r.payload?.content || '', file_name: r.payload?.file_name || '',
      page_number: r.payload?.page_number || 0, score: r.score,
    }));
  }

  // Pinecone
  const pc = new Pinecone({ apiKey: settings.pineconeApiKey });
  const index = pc.index(settings.pineconeIndexName);
  const filter = { is_public: true };
  if (orgIds.length > 0) filter.shared_with = { $in: orgIds };
  const results = await index.query({ vector: queryVector, topK: maxChunks, includeMetadata: true, filter });
  return (results.matches || []).map(m => ({
    content: m.metadata?.content || '', file_name: m.metadata?.file_name || '',
    page_number: m.metadata?.page_number || 0, score: m.score,
  }));
}

// ─── Call LLM ──────────────────────────────────────────────────
export async function callLLM(messages, settings) {
  const provider = settings.chatLlmProvider;
  const model = settings.chatLlmModel;
  const apiKey = settings[`chatLlmApiKey_${provider}`] || settings.chatLlmApiKey;
  if (!provider) throw new Error('Chat LLM Provider not configured. Go to Settings → Chat → LLM.');
  if (!model) throw new Error('Chat LLM Model not configured. Go to Settings → Chat → LLM.');
  if (!apiKey && provider !== 'ollama_local') throw new Error(`Chat LLM API key not set for ${provider}. Check Settings or Provider Keys.`);

  if (provider === 'gemini') {
    // Gemini: system role goes in systemInstruction, not in contents
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');
    const body = {
      contents: chatMsgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    };
    if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      body, { timeout: 60000 }
    );
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (provider === 'openai' || provider === 'groq') {
    const baseURL = provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
    const openai = new OpenAI({ apiKey, baseURL });
    const res = await openai.chat.completions.create({ model, messages });
    return res.choices[0]?.message?.content || '';
  }

  if (provider === 'ollama_cloud') {
    const res = await axios.post('https://ollama.com/api/chat', {
      model, messages: messages.map(m => ({ role: m.role, content: m.content })), stream: false,
    }, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 60000,
    });
    return res.data.message?.content || '';
  }

  if (provider === 'ollama_local') {
    const url = settings.chatLlmOllamaUrl;
    if (!url) throw new Error('Chat LLM Ollama URL not configured. Go to Settings → Chat → LLM.');
    const res = await axios.post(`${url}/api/chat`, {
      model, messages: messages.map(m => ({ role: m.role, content: m.content })), stream: false,
    }, { timeout: 120000 });
    return res.data.message?.content || '';
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}

// ─── Main Chat Pipeline ────────────────────────────────────────
export async function processBrowserChat(db, userId, message, sessionId, settings, fileId = null) {
  // 1. Get user's accessible org IDs
  const orgIds = await getUserAccessibleOrgIds(db, userId);

  // 2. Embed the user's query
  const queryVector = await embedQuery(message, settings);

  // 3. Search vectors with org filter + optional file filter
  const chunks = await searchVectors(queryVector, orgIds, settings, fileId);

  // 4. Build messages array
  const systemPrompt = settings.chatSystemPrompt || 'You are a helpful AI assistant.';
  let contextBlock = '';
  if (chunks.length > 0) {
    contextBlock = '\n\n## Context from documents:\n' +
      chunks.map((c, i) => `[Source ${i + 1}: ${c.file_name}, Page ${c.page_number}]\n${c.content}`).join('\n\n');
  }

  // Get chat history for this session
  const history = await db.collection('messages')
    .find({ sessionId, role: { $in: ['user', 'bot'] } })
    .sort({ createdAt: 1 })
    .limit(20)
    .toArray();

  const messages = [
    { role: 'system', content: systemPrompt + contextBlock },
    ...history.map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: message },
  ];

  // 5. Call LLM
  const response = await callLLM(messages, settings);

  // 6. Build sources
  const sources = chunks.filter(c => c.file_name).map(c => ({
    file_name: c.file_name,
    page_number: c.page_number,
    score: c.score,
  }));
  // Deduplicate sources
  const seen = new Set();
  const uniqueSources = sources.filter(s => {
    const key = `${s.file_name}:${s.page_number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { response, sources: uniqueSources };
}

// ─── Public Embed Chat (no user, only public docs) ─────────────
export async function processPublicChat(db, message, sessionId, settings, orgIds) {
  const queryVector = await embedQuery(message, settings);
  const chunks = await searchPublicVectors(queryVector, orgIds, settings);

  const systemPrompt = settings.chatSystemPrompt || 'You are a helpful AI assistant.';
  let contextBlock = '';
  if (chunks.length > 0) {
    contextBlock = '\n\n## Context from documents:\n' +
      chunks.map((c, i) => `[Source ${i + 1}: ${c.file_name}, Page ${c.page_number}]\n${c.content}`).join('\n\n');
  }

  const history = await db.collection('messages')
    .find({ sessionId, role: { $in: ['user', 'bot'] } })
    .sort({ createdAt: 1 }).limit(10).toArray();

  const messages = [
    { role: 'system', content: systemPrompt + contextBlock },
    ...history.map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: message },
  ];

  const response = await callLLM(messages, settings);
  const seen = new Set();
  const sources = chunks.filter(c => c.file_name).map(c => ({ file_name: c.file_name, page_number: c.page_number, score: c.score })).filter(s => { const k = `${s.file_name}:${s.page_number}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { response, sources };
}
