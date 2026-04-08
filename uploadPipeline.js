// Upload Processing Pipeline
// Handles: OCR → Text Extraction → Chunking → Embedding → Vector Storage

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import crypto from 'crypto';

const QDRANT_COLLECTION = 'documents';

// ─── File Type Detection ───────────────────────────────────────
function getFileCategory(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'].includes(ext)) return 'ocr';
  if (['.docx'].includes(ext)) return 'docx';
  if (['.xlsx', '.xls'].includes(ext)) return 'excel';
  if (['.txt', '.md', '.csv', '.json', '.html'].includes(ext)) return 'text';
  return 'text'; // fallback
}

// ─── Text Extraction (non-OCR files) ───────────────────────────
async function extractTextFromDocx(filePath) {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return [{ page_number: 1, content: result.value, regions: [] }];
}

function extractTextFromExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const pages = [];
  workbook.SheetNames.forEach((name, idx) => {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    pages.push({ page_number: idx + 1, content: `## Sheet: ${name}\n${csv}`, regions: [] });
  });
  return pages;
}

function extractTextFromPlain(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return [{ page_number: 1, content, regions: [] }];
}

// ─── OCR ───────────────────────────────────────────────────────
async function ocrOffline(filePath, settings) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  const res = await axios.post(`${settings.offlineOcrUrl}/ocr`, form, {
    headers: form.getHeaders(),
    timeout: 600000, // 10 min for large PDFs
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return res.data.pages || [{ page_number: 1, content: '', regions: [] }];
}

async function ocrOnlineZai(filePath, settings) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mime = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const dataUri = `data:${mime};base64,${base64}`;

  const res = await axios.post('https://api.z.ai/api/paas/v4/layout_parsing', {
    model: 'glm-ocr',
    file: dataUri,
  }, {
    headers: { Authorization: `Bearer ${settings.ocrApiKey}`, 'Content-Type': 'application/json' },
    timeout: 300000,
  });

  const data = res.data;
  const layoutPages = data.layout_details || [];
  const numPages = data.data_info?.num_pages || 1;

  // If layout_details has per-page arrays, build structured pages
  if (layoutPages.length > 0 && Array.isArray(layoutPages[0])) {
    return layoutPages.map((pageRegions, idx) => ({
      page_number: idx + 1,
      content: pageRegions.map(r => r.content || '').join('\n\n'),
      regions: pageRegions.map(r => ({
        type: r.label || 'text',
        content: r.content || '',
        bbox: r.bbox_2d || [],
      })),
    }));
  }

  // Fallback: use md_results as single/combined content, split by page count
  const md = data.md_results || '';
  if (numPages <= 1) {
    return [{ page_number: 1, content: md, regions: [] }];
  }
  // Best-effort split for multi-page: divide markdown evenly
  const lines = md.split('\n');
  const linesPerPage = Math.ceil(lines.length / numPages);
  const pages = [];
  for (let i = 0; i < numPages; i++) {
    pages.push({
      page_number: i + 1,
      content: lines.slice(i * linesPerPage, (i + 1) * linesPerPage).join('\n'),
      regions: [],
    });
  }
  return pages;
}

async function ocrOnlineMistral(filePath, settings) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mime = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  const res = await axios.post('https://api.mistral.ai/v1/ocr', {
    model: 'mistral-ocr-latest',
    document: { type: 'base64', data: base64, mime_type: mime },
  }, {
    headers: { Authorization: `Bearer ${settings.ocrApiKey}`, 'Content-Type': 'application/json' },
    timeout: 300000,
  });

  // Mistral returns { pages: [{ index, markdown, images, dimensions }] }
  const pages = (res.data?.pages || []).map(p => ({
    page_number: p.index || 1,
    content: p.markdown || '',
    regions: [],
  }));
  return pages.length ? pages : [{ page_number: 1, content: '', regions: [] }];
}

// ─── Chunking ──────────────────────────────────────────────────
function chunkText(text, chunkSize = 1000, overlap = 200) {
  if (!text || text.length === 0) return [];
  // Simple word-based chunking
  const words = text.split(/\s+/);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim()) chunks.push(chunk);
    i += chunkSize - overlap;
  }
  return chunks;
}

// ─── Embedding ─────────────────────────────────────────────────
async function embedTexts(texts, settings) {
  const mode = settings.uploadProcessingMode;
  const provider = mode === 'offline' ? 'ollama' : (settings.embeddingProvider || 'ollama');
  const model = mode === 'offline' ? (settings.offlineEmbeddingModel || 'nomic-embed-text-v2-moe') : (settings.embeddingModel || 'nomic-embed-text-v2-moe');

  if (provider === 'ollama') {
    const ollamaUrl = mode === 'offline' ? (settings.offlineOllamaUrl || 'http://ollama:11434') : (settings.offlineOllamaUrl || 'http://ollama:11434');
    const results = [];
    for (const text of texts) {
      const res = await axios.post(`${ollamaUrl}/api/embed`, { model, input: text });
      results.push(res.data.embeddings[0]);
    }
    return results;
  }

  if (provider === 'openai') {
    const openai = new OpenAI({ apiKey: settings.embeddingApiKey });
    const res = await openai.embeddings.create({ model, input: texts });
    return res.data.map(d => d.embedding);
  }

  if (provider === 'gemini') {
    const results = [];
    for (const text of texts) {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${settings.embeddingApiKey}`,
        { content: { parts: [{ text }] }, taskType: 'RETRIEVAL_DOCUMENT' }
      );
      results.push(res.data.embedding.values);
    }
    return results;
  }

  throw new Error(`Unknown embedding provider: ${provider}`);
}

// ─── Vector Storage ────────────────────────────────────────────
async function getQdrantClient(settings) {
  const mode = settings.uploadProcessingMode;
  const host = mode === 'offline' ? (settings.offlineQdrantHost || 'qdrant') : (settings.qdrantHost || 'qdrant');
  const port = mode === 'offline' ? (settings.offlineQdrantPort || 6333) : (settings.qdrantPort || 6333);
  return new QdrantClient({ host, port });
}

async function ensureQdrantCollection(client, vectorSize) {
  try {
    await client.getCollection(QDRANT_COLLECTION);
  } catch {
    await client.createCollection(QDRANT_COLLECTION, {
      vectors: { size: vectorSize, distance: 'Cosine' },
    });
  }
}

async function storeInQdrant(client, vectors, payloads) {
  const points = vectors.map((vector, i) => ({
    id: crypto.randomUUID(),
    vector,
    payload: payloads[i],
  }));
  await client.upsert(QDRANT_COLLECTION, { points });
  return points.length;
}

async function storeInPinecone(vectors, payloads, settings) {
  const pc = new Pinecone({ apiKey: settings.pineconeApiKey });
  const index = pc.index(settings.pineconeIndexName);
  const records = vectors.map((values, i) => ({
    id: crypto.randomUUID(),
    values,
    metadata: payloads[i],
  }));
  // Pinecone batch limit is 100
  for (let i = 0; i < records.length; i += 100) {
    await index.upsert(records.slice(i, i + 100));
  }
  return records.length;
}

// ─── Delete vectors for a file ─────────────────────────────────
export async function deleteFileVectors(fileId, settings) {
  const mode = settings.uploadProcessingMode;
  const vectorDb = mode === 'offline' ? 'qdrant' : (settings.vectorDbProvider || 'qdrant');

  if (vectorDb === 'qdrant') {
    const client = await getQdrantClient(settings);
    try {
      await client.delete(QDRANT_COLLECTION, {
        filter: { must: [{ key: 'file_id', match: { value: fileId } }] },
      });
    } catch (e) { console.error('Qdrant delete error:', e.message); }
  } else {
    const pc = new Pinecone({ apiKey: settings.pineconeApiKey });
    const index = pc.index(settings.pineconeIndexName);
    try {
      // Query vectors with file_id filter, then delete by IDs
      const queryRes = await index.query({
        vector: new Array(768).fill(0), // dummy vector
        filter: { file_id: fileId },
        topK: 10000,
        includeValues: false,
      });
      const ids = (queryRes.matches || []).map(m => m.id);
      if (ids.length > 0) {
        for (let i = 0; i < ids.length; i += 1000) {
          await index.deleteMany(ids.slice(i, i + 1000));
        }
      }
    } catch (e) { console.error('Pinecone delete error:', e.message); }
  }
}

// ─── Main Pipeline ─────────────────────────────────────────────
export async function processUploadedFile(filePath, fileName, fileId, metadata, settings) {
  const category = getFileCategory(fileName);
  const mode = settings.uploadProcessingMode || 'offline';
  let pages;

  // Step 1: Extract text
  if (category === 'ocr') {
    if (mode === 'offline') {
      pages = await ocrOffline(filePath, settings);
    } else if (settings.ocrProvider === 'mistral') {
      pages = await ocrOnlineMistral(filePath, settings);
    } else {
      pages = await ocrOnlineZai(filePath, settings);
    }
  } else if (category === 'docx') {
    pages = await extractTextFromDocx(filePath);
  } else if (category === 'excel') {
    pages = extractTextFromExcel(filePath);
  } else {
    pages = extractTextFromPlain(filePath);
  }

  // Step 2: Chunk each page
  const chunkSize = settings.chunkSize || 1000;
  const chunkOverlap = settings.chunkOverlap || 200;
  const allChunks = [];
  const allPayloads = [];

  for (const page of pages) {
    const chunks = chunkText(page.content, chunkSize, chunkOverlap);
    chunks.forEach((chunk, idx) => {
      allChunks.push(chunk);
      allPayloads.push({
        file_id: fileId,
        file_name: fileName,
        page_number: page.page_number,
        chunk_index: idx,
        content: chunk,
        region_types: (page.regions || []).map(r => r.type || 'text'),
        ...metadata,
      });
    });
  }

  if (allChunks.length === 0) {
    return { success: true, chunks: 0, pages: pages.length, message: 'No text content extracted' };
  }

  // Step 3: Embed all chunks
  const vectors = await embedTexts(allChunks, settings);

  // Step 4: Store in vector DB
  const vectorDb = mode === 'offline' ? 'qdrant' : (settings.vectorDbProvider || 'qdrant');
  let stored = 0;

  if (vectorDb === 'qdrant') {
    const client = await getQdrantClient(settings);
    await ensureQdrantCollection(client, vectors[0].length);
    stored = await storeInQdrant(client, vectors, allPayloads);
  } else {
    stored = await storeInPinecone(vectors, allPayloads, settings);
  }

  return {
    success: true,
    chunks: stored,
    pages: pages.length,
    message: `Processed ${pages.length} page(s), created ${stored} vector(s)`,
  };
}
