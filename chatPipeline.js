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
  const provider = settings.chatEmbeddingProvider || 'ollama';
  const model = settings.chatEmbeddingModel || 'nomic-embed-text-v2-moe';

  if (provider === 'ollama') {
    const url = settings.chatEmbeddingOllamaUrl || settings.offlineOllamaUrl || 'http://ollama:11434';
    const res = await axios.post(`${url}/api/embed`, { model, input: text });
    return res.data.embeddings[0];
  }
  if (provider === 'openai') {
    const openai = new OpenAI({ apiKey: settings.chatEmbeddingApiKey });
    const res = await openai.embeddings.create({ model, input: [text] });
    return res.data[0].embedding;
  }
  if (provider === 'gemini') {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${settings.chatEmbeddingApiKey}`,
      { content: { parts: [{ text }] }, taskType: 'RETRIEVAL_QUERY' }
    );
    return res.data.embedding.values;
  }
  throw new Error(`Unknown chat embedding provider: ${provider}`);
}

// ─── Vector Search ─────────────────────────────────────────────
async function searchVectors(queryVector, orgIds, settings, fileId = null) {
  const maxChunks = settings.chatMaxChunks || 5;
  const mode = settings.uploadProcessingMode || 'offline';
  const vectorDb = mode === 'offline' ? 'qdrant' : (settings.vectorDbProvider || 'qdrant');

  if (vectorDb === 'qdrant') {
    const host = mode === 'offline' ? (settings.offlineQdrantHost || 'qdrant') : (settings.qdrantHost || 'qdrant');
    const port = mode === 'offline' ? (settings.offlineQdrantPort || 6333) : (settings.qdrantPort || 6333);
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

// ─── Call LLM ──────────────────────────────────────────────────
async function callLLM(messages, settings) {
  const provider = settings.chatLlmProvider || 'gemini';
  const model = settings.chatLlmModel || 'gemini-2.5-flash';
  const apiKey = settings[`chatLlmApiKey_${provider}`] || settings.chatLlmApiKey || '';

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

  if (provider === 'zai') {
    const res = await axios.post('https://api.z.ai/api/paas/v4/chat/completions', {
      model, messages,
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000,
    });
    return res.data.choices?.[0]?.message?.content || '';
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
    const url = settings.chatLlmOllamaUrl || 'http://ollama:11434';
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
