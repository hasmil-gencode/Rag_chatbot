// Chat Pipeline — Built-in browser chat
// Vector search (with org hierarchy filter) → Build prompt → Call LLM

import axios from 'axios';
import { ObjectId } from 'mongodb';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const QDRANT_COLLECTION = 'documents';

async function logAiCall(db, provider, model, type, source, latency, status = 'ok') {
  try { await db.collection('ai_api_logs').insertOne({ provider, model, type, source, latency, status, createdAt: new Date() }); } catch {}
}

// ─── Guardrail Check ───────────────────────────────────────────
export async function checkGuardrail(text, prompt, settings, db = null) {
  if (!settings.guardrailEnabled) return { safe: true, reason: 'guardrail disabled' };
  const model = settings.guardrailModel || 'gemini-2.5-flash-lite';
  const apiKey = settings[`chatLlmApiKey_gemini`] || settings.chatLlmApiKey || settings.chatEmbeddingApiKey;
  if (!apiKey) return { safe: true, reason: 'no API key for guardrail' };
  const t = Date.now();
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [{ role: 'user', parts: [{ text }] }],
        systemInstruction: { parts: [{ text: prompt }] },
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      },
      { timeout: 10000 }
    );
    if (db) logAiCall(db, 'gemini', model, 'guardrail', 'system', Date.now() - t);
    const raw = res.data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(raw);
    return { safe: parsed.safe !== false, reason: parsed.reason || '' };
  } catch (e) {
    if (db) logAiCall(db, 'gemini', model, 'guardrail', 'system', Date.now() - t, 'error');
    console.error('Guardrail check failed:', e.message);
    return { safe: true, reason: 'guardrail error, allowing through' };
  }
}

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
async function embedQuery(text, settings, db = null, source = 'chat') {
  const provider = settings.chatEmbeddingProvider;
  const model = settings.chatEmbeddingModel;
  if (!provider) throw new Error('Chat Embedding Provider not configured. Go to Settings → Chat → Embedding.');
  if (!model) throw new Error('Chat Embedding Model not configured. Go to Settings → Chat → Embedding.');

  const t = Date.now();
  if (provider === 'openai') {
    const key = settings[`chatEmbeddingApiKey_openai`] || settings.chatEmbeddingApiKey;
    if (!key) throw new Error('Chat Embedding API key not set for OpenAI. Check Settings or Provider Keys.');
    const openai = new OpenAI({ apiKey: key });
    const res = await openai.embeddings.create({ model, input: [text] });
    if (db) logAiCall(db, provider, model, 'embedding', source, Date.now() - t);
    return res.data[0].embedding;
  }
  if (provider === 'gemini') {
    const key = settings[`chatEmbeddingApiKey_gemini`] || settings.chatEmbeddingApiKey;
    if (!key) throw new Error('Chat Embedding API key not set for Gemini. Check Settings or Provider Keys.');
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`,
      { content: { parts: [{ text }] }, taskType: 'RETRIEVAL_QUERY' }
    );
    if (db) logAiCall(db, provider, model, 'embedding', source, Date.now() - t);
    return res.data.embedding.values;
  }
  throw new Error(`Unknown chat embedding provider: ${provider}`);
}

// ─── Vector Search ─────────────────────────────────────────────
async function searchVectors(queryVector, orgIds, settings, fileId = null, overrideLimit = null) {
  const maxChunks = overrideLimit || settings.chatMaxChunks || 15;
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
      file_id: r.payload?.file_id || '',
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
  const maxChunks = settings.chatMaxChunks || 15;
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
export async function callLLM(messages, settings, db = null, source = 'chat') {
  const provider = settings.chatLlmProvider;
  const model = settings.chatLlmModel;
  const apiKey = settings[`chatLlmApiKey_${provider}`] || settings.chatLlmApiKey;
  if (!provider) throw new Error('Chat LLM Provider not configured. Go to Settings → Chat → LLM.');
  if (!model) throw new Error('Chat LLM Model not configured. Go to Settings → Chat → LLM.');
  if (!apiKey) throw new Error(`Chat LLM API key not set for ${provider}. Check Settings or Provider Keys.`);

  const t = Date.now();
  let result;
  try {
    if (provider === 'gemini') {
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
      result = res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (provider === 'openai' || provider === 'groq') {
      const baseURL = provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
      const openai = new OpenAI({ apiKey, baseURL });
      const res = await openai.chat.completions.create({ model, messages });
      result = res.choices[0]?.message?.content || '';
    } else if (provider === 'mistral') {
      const res = await axios.post('https://api.mistral.ai/v1/chat/completions', { model, messages }, { headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 60000 });
      result = res.data.choices?.[0]?.message?.content || '';
    } else {
      throw new Error(`Unknown LLM provider: ${provider}`);
    }
    if (db) logAiCall(db, provider, model, 'chat', source, Date.now() - t);
    return result;
  } catch (e) {
    if (db) logAiCall(db, provider, model, 'chat', source, Date.now() - t, 'error');
    throw e;
  }
}

// ─── Main Chat Pipeline ────────────────────────────────────────
export async function processBrowserChat(db, userId, message, sessionId, settings, fileId = null, organizationId = null) {
  // 0. Input guardrail check
  if (settings.guardrailEnabled) {
    const inputCheck = await checkGuardrail(message, settings.guardrailInputPrompt, settings, db);
    if (!inputCheck.safe) {
      // Log blocked attempt
      await db.collection('guardrail_logs').insertOne({
        userId, sessionId, type: 'input', message, reason: inputCheck.reason, createdAt: new Date()
      });
      return { response: 'Sorry, I\'m unable to process this request.\n\nMaaf, saya tidak dapat memproses permintaan ini.\n\nமன்னிக்கவும், இந்தக் கோரிக்கையை செயல்படுத்த இயலவில்லை.\n\n抱歉，无法处理此请求。', sources: [], blocked: true, blockReason: inputCheck.reason };
    }
  }

  // 1. Get user's accessible org IDs
  const orgIds = await getUserAccessibleOrgIds(db, userId);

  // 2. Embed the user's query
  const queryVector = await embedQuery(message, settings, db, 'browser_chat');

  // 3. Search vectors with org filter + optional file filter
  // Check if first message in session — if org has broadFirstSearch, get more context
  let maxResults = settings.chatMaxChunks || 15;
  let broadSearchTriggered = false;
  if (organizationId && !fileId) {
    const msgCount = await db.collection('messages').countDocuments({ sessionId });
    if (msgCount <= 1) {
      const orgCheck = await db.collection('organizations').findOne({ _id: new ObjectId(organizationId) });
      if (orgCheck?.broadFirstSearch) {
        maxResults = orgCheck.broadFirstSearchChunks || 40;
        broadSearchTriggered = true;
      }
    }
  }
  const chunks = await searchVectors(queryVector, orgIds, settings, fileId, maxResults);
  const debug = { chunksRetrieved: chunks.length, broadSearch: broadSearchTriggered, broadSearchChunks: maxResults, mandatoryFieldsCollected: null, mandatoryFieldsMissing: null, nextFieldAsked: null };

  // 4. Build messages array — org prompt overrides global
  let systemPrompt = settings.chatSystemPrompt || 'You are a helpful AI assistant.';
  if (organizationId) {
    const org = await db.collection('organizations').findOne({ _id: new ObjectId(organizationId) });
    if (org?.systemPrompt) systemPrompt = org.systemPrompt;

    // Mandatory fields enforcement
    if (org?.mandatoryFields?.length > 0) {
      const historyForCheck = await db.collection('messages')
        .find({ sessionId, role: { $in: ['user', 'bot'] } })
        .sort({ createdAt: 1 })
        .limit(20)
        .toArray();
      const convo = historyForCheck.map(m => `${m.role === 'bot' ? 'Assistant' : 'User'}: ${m.content}`).join('\n') + `\nUser: ${message}`;
      const fieldList = org.mandatoryFields.map(f => `"${f.name}" (${f.description})`).join(', ');
      const checkPrompt = `From this conversation, extract what has been clearly stated by the user.
Fields to check: ${fieldList}

For "intent", classify as one of: "find_plan" (looking for new insurance), "claim" (making a claim), "check_policy" (checking existing policy), "general" (general question).

Conversation:
${convo}

Respond ONLY as JSON object with collected fields. Example: {"intent":"find_plan","occupation":"engineer","age":"35"}
Only include fields that are CLEARLY stated. If not mentioned, omit.`;
      try {
        const checkResult = await callLLM([{ role: 'user', content: checkPrompt }], { ...settings, chatLlmModel: settings.chatLlmModel || 'gemini-2.5-flash' });
        const collected = JSON.parse(checkResult.trim().replace(/```json?\n?/g, '').replace(/```/g, ''));
        
        // Determine which fields are required based on intent
        const intent = collected.intent || null;
        let requiredFields = org.mandatoryFields.filter(f => f.alwaysRequired);
        if (intent) {
          requiredFields = [...requiredFields, ...org.mandatoryFields.filter(f => f.requiredFor?.includes(intent))];
        }
        
        const missing = requiredFields.filter(f => !collected[f.name]);
        debug.mandatoryFieldsCollected = collected;
        debug.mandatoryFieldsMissing = missing.map(f => f.name);
        if (missing.length > 0) {
          const nextField = missing[0];
          debug.nextFieldAsked = nextField.name;
          if (nextField.name === 'intent') {
            systemPrompt += `\n\n## MANDATORY INSTRUCTION (DO NOT IGNORE):\nYou have NOT yet determined what the user needs help with. You MUST ask what they are looking for FIRST (e.g., find a new plan, make a claim, check existing policy, or general question). Do NOT recommend any plans yet. Do NOT ask for age/occupation yet. Ask naturally in one short question.`;
          } else {
            systemPrompt += `\n\n## MANDATORY INSTRUCTION (DO NOT IGNORE):\nYou have NOT yet collected the user's "${nextField.name}" (${nextField.description}). You MUST ask for this information NOW. Do NOT recommend any plans yet. Do NOT skip this. Ask naturally in one short question.`;
          }
        }
      } catch {}
    }
  }
  let contextBlock = '';
  if (chunks.length > 0) {
    contextBlock = '\n\n## Context from documents:\n' +
      chunks.map((c, i) => `[Source ${i + 1}: ${c.file_name}, Page ${c.page_number}]\n${c.content}`).join('\n\n');
  }

  // Get chat history for this session (exclude current message which is appended separately)
  const history = await db.collection('messages')
    .find({ sessionId, role: { $in: ['user', 'bot'] } })
    .sort({ createdAt: 1 })
    .limit(20)
    .toArray();

  // Remove last entry if it's the current user message (already saved before pipeline call)
  if (history.length > 0 && history[history.length - 1].role === 'user' && history[history.length - 1].content === message) {
    history.pop();
  }

  const messages = [
    { role: 'system', content: systemPrompt + contextBlock },
    ...history.map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: message },
  ];

  // 5. Call LLM
  const response = await callLLM(messages, settings, db, 'browser_chat');

  // 6. Build sources
  const sources = chunks.filter(c => c.file_name).map(c => ({
    file_name: c.file_name,
    file_id: c.file_id,
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

  // 7. Output guardrail check
  if (settings.guardrailEnabled && response) {
    const outputCheck = await checkGuardrail(response, settings.guardrailOutputPrompt, settings, db);
    if (!outputCheck.safe) {
      await db.collection('guardrail_logs').insertOne({
        userId, sessionId, type: 'output', message: response.substring(0, 500), reason: outputCheck.reason, createdAt: new Date()
      });
      return { response: 'Sorry, I\'m unable to provide that information.\n\nMaaf, saya tidak dapat memberikan maklumat tersebut.\n\nமன்னிக்கவும், அந்தத் தகவலை வழங்க இயலவில்லை.\n\n抱歉，无法提供该信息。', sources: [], blocked: true, blockReason: outputCheck.reason };
    }
  }

  return { response, sources: uniqueSources, debug };
}
// ─── Public Embed Chat (no user, only public docs) ─────────────
export async function processPublicChat(db, message, sessionId, settings, orgIds) {
  // Input guardrail
  if (settings.guardrailEnabled) {
    const inputCheck = await checkGuardrail(message, settings.guardrailInputPrompt, settings, db);
    if (!inputCheck.safe) {
      await db.collection('guardrail_logs').insertOne({ sessionId, type: 'input', source: 'widget', message, reason: inputCheck.reason, createdAt: new Date() });
      return { response: 'Sorry, I\'m unable to process this request.\n\nMaaf, saya tidak dapat memproses permintaan ini.\n\nமன்னிக்கவும், இந்தக் கோரிக்கையை செயல்படுத்த இயலவில்லை.\n\n抱歉，无法处理此请求。', sources: [], blocked: true };
    }
  }

  const queryVector = await embedQuery(message, settings, db, 'embed_widget');
  const chunks = await searchPublicVectors(queryVector, orgIds, settings);

  const systemPrompt = await (async () => {
    if (orgIds?.length) {
      const org = await db.collection('organizations').findOne({ _id: orgIds[0], systemPrompt: { $exists: true, $ne: '' } });
      if (org?.systemPrompt) return org.systemPrompt;
    }
    return settings.chatSystemPrompt || 'You are a helpful AI assistant.';
  })();
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

  const response = await callLLM(messages, settings, db, 'embed_widget');

  // Output guardrail
  if (settings.guardrailEnabled && response) {
    const outputCheck = await checkGuardrail(response, settings.guardrailOutputPrompt, settings, db);
    if (!outputCheck.safe) {
      await db.collection('guardrail_logs').insertOne({ sessionId, type: 'output', source: 'widget', message: response.substring(0, 500), reason: outputCheck.reason, createdAt: new Date() });
      return { response: 'Sorry, I\'m unable to provide that information.\n\nMaaf, saya tidak dapat memberikan maklumat tersebut.\n\nமன்னிக்கவும், அந்தத் தகவலை வழங்க இயலவில்லை.\n\n抱歉，无法提供该信息。', sources: [], blocked: true };
    }
  }

  const seen = new Set();
  const sources = chunks.filter(c => c.file_name).map(c => ({ file_name: c.file_name, page_number: c.page_number, score: c.score })).filter(s => { const k = `${s.file_name}:${s.page_number}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { response, sources };
}
