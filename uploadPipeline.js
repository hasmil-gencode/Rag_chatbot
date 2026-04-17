// Upload Processing Pipeline
// Handles: OCR → Text Extraction → Chunking → Embedding → Vector Storage

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import pdfParse from 'pdf-parse';
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

async function ocrOnlineMistral(filePath, settings) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  const ext = path.extname(filePath).toLowerCase().replace('.', '');

  // Determine mime type
  const mimeMap = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', tiff: 'image/tiff', bmp: 'image/bmp', webp: 'image/webp', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
  const mime = mimeMap[ext] || 'application/octet-stream';
  const dataUri = `data:${mime};base64,${base64}`;

  // Images use image_url, everything else (pdf, docx, pptx) uses document_url
  const isImage = ['png', 'jpg', 'jpeg', 'tiff', 'bmp', 'webp', 'avif'].includes(ext);
  const document = isImage
    ? { type: 'image_url', image_url: dataUri }
    : { type: 'document_url', document_url: dataUri };

  const res = await axios.post('https://api.mistral.ai/v1/ocr', {
    model: 'mistral-ocr-latest',
    document,
    table_format: 'html',
  }, {
    headers: { Authorization: `Bearer ${settings[`ocrApiKey_${settings.ocrProvider}`] || settings.ocrApiKey}`, 'Content-Type': 'application/json' },
    timeout: 300000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  // Mistral returns { pages: [{ index, markdown, images, dimensions, tables }] }
  const pages = (res.data?.pages || []).map(p => {
    let content = p.markdown || '';

    // Replace table placeholders [tbl-N.html](tbl-N.html) with actual table content
    if (p.tables && p.tables.length > 0) {
      for (const t of p.tables) {
        const id = t.id || t.name || '';
        const tableContent = t.content || t.html || t.markdown || '';
        if (id && tableContent) {
          content = content.replace(`[${id}](${id})`, tableContent);
        }
      }
    }

    // Remove image placeholders — no text value for RAG
    content = content.replace(/!\[.*?\]\(.*?\)\n*/g, '');

    // Clean up excessive blank lines
    content = content.replace(/\n{3,}/g, '\n\n').trim();

    return {
      page_number: p.index || 1,
      content,
      regions: [],
    };
  });
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

async function ocrOnlineGcDocAI(filePath, settings) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mime = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  const projectId = settings.gcdaiProjectId;
  const location = settings.gcdaiLocation || 'us';
  const processorId = settings.gcdaiProcessorId;
  if (!projectId || !processorId) throw new Error('Document AI Project ID and Processor ID required. Set in Settings → OCR.');

  const { GoogleAuth } = await import('google-auth-library');
  const sa = JSON.parse(settings.gclasServiceAccount || '{}');
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;
  const res = await axios.post(url, {
    rawDocument: { content: base64, mimeType: mime },
    processOptions: { ocrConfig: { enableNativePdfParsing: true } }
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 120000 });

  const doc = res.data.document || {};
  const text = doc.text || '';
  const docPages = doc.pages || [];

  if (docPages.length <= 1) return [{ page_number: 1, content: text, regions: [] }];

  // Split text by page using textAnchor offsets
  return docPages.map((p, i) => {
    const segments = p.layout?.textAnchor?.textSegments || [];
    const pageText = segments.map(s => text.substring(parseInt(s.startIndex || '0'), parseInt(s.endIndex || '0'))).join('');
    return { page_number: i + 1, content: pageText || '', regions: [] };
  }).filter(p => p.content);
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
    const apiKey = settings[`embeddingApiKey_openai`] || settings.embeddingApiKey;
    const openai = new OpenAI({ apiKey });
    const res = await openai.embeddings.create({ model, input: texts });
    return res.data.map(d => d.embedding);
  }

  if (provider === 'gemini') {
    const apiKey = settings[`embeddingApiKey_gemini`] || settings.embeddingApiKey;
    const results = [];
    for (const text of texts) {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
        { content: { parts: [{ text }] }, taskType: 'RETRIEVAL_DOCUMENT' }
      );
      results.push(res.data.embedding.values);
    }
    return results;
  }

  if (provider === 'mistral') {
    const apiKey = settings[`embeddingApiKey_mistral`] || settings.embeddingApiKey;
    const res = await axios.post('https://api.mistral.ai/v1/embeddings', { model, input: texts }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    return res.data.data.map(d => d.embedding);
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
export async function processUploadedFile(filePath, fileName, fileId, metadata, settings, onProgress = null) {
  const notify = (step, detail) => { if (onProgress) onProgress(step, detail); };
  const category = getFileCategory(fileName);
  const mode = settings.uploadProcessingMode || 'offline';
  let pages;

  // Step 1: Extract text
  notify('ocr', `Extracting text from ${fileName}...`);
  if (category === 'ocr') {
    const ext = path.extname(fileName).toLowerCase();
    let needsOcr = false;
    let pdfText = '';

    if (ext === '.pdf') {
      // Try text extraction first
      try {
        const buf = fs.readFileSync(filePath);
        const parsed = await pdfParse(buf);
        pdfText = (parsed.text || '').trim();
        const threshold = settings.ocrMinTextThreshold || 50;
        needsOcr = pdfText.length < threshold;
      } catch (e) {
        console.error('pdf-parse failed:', e.message);
        needsOcr = true;
      }
    } else {
      // Images always need OCR
      needsOcr = true;
    }

    if (needsOcr) {
      if (settings.ocrEnabled === false) {
        // OCR disabled — use whatever text we got from pdf-parse (may be empty for scanned)
        if (pdfText) {
          pages = [{ page_number: 1, content: pdfText, regions: [] }];
          notify('ocr_done', 'OCR disabled. Used PDF text extraction.');
        } else {
          pages = [{ page_number: 1, content: '', regions: [] }];
          notify('ocr_done', 'OCR disabled. No extractable text found — scanned PDF needs OCR enabled.');
        }
      } else if (mode === 'offline') {
        pages = await ocrOffline(filePath, settings);
      } else if (settings.ocrProvider === 'gcdai') {
        pages = await ocrOnlineGcDocAI(filePath, settings);
      } else {
        pages = await ocrOnlineMistral(filePath, settings);
      }
    } else {
      // PDF has enough text — no OCR needed
      pages = [{ page_number: 1, content: pdfText, regions: [] }];
    }
  } else if (category === 'docx') {
    pages = await extractTextFromDocx(filePath);
  } else if (category === 'excel') {
    pages = extractTextFromExcel(filePath);
  } else {
    pages = extractTextFromPlain(filePath);
  }
  notify('ocr_done', `Extracted ${pages.length} page(s)`);

  // Send text preview for developer debugging
  for (const page of pages) {
    if (page.content) {
      // Convert HTML tables to readable text for preview
      let preview = page.content
        .replace(/<table>/gi, '')
        .replace(/<\/table>/gi, '')
        .replace(/<tr>/gi, '')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<td>/gi, '')
        .replace(/<\/td>/gi, ' | ')
        .replace(/\n{2,}/g, '\n')
        .trim();
      notify('preview', `--- Page ${page.page_number} ---\n${preview}`);
    }
  }

  // Step 2: Chunk each page
  notify('chunking', 'Splitting text into chunks...');
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
    notify('done', 'No text content extracted');
    return { success: true, chunks: 0, pages: pages.length, message: 'No text content extracted' };
  }

  // Step 3: Embed all chunks
  notify('embedding', `Embedding ${allChunks.length} chunk(s)...`);
  const vectors = await embedTexts(allChunks, settings);
  notify('embedding_done', `Embedded ${vectors.length} chunk(s)`);

  // Step 4: Store in vector DB
  notify('storing', 'Storing vectors in database...');
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
