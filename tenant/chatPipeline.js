// Chat Pipeline — Built-in browser chat
// Vector search (with org hierarchy filter) → Build prompt → Call LLM

import axios from 'axios';
import { ObjectId } from 'mongodb';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const QDRANT_COLLECTION = 'documents';

// MySQL pool reference (set from server.js)
let _mysqlPool = null;
export function setMysqlPool(pool) { _mysqlPool = pool; }

async function logAiCall(db, provider, model, type, source, latency, status = 'ok') {
  try { await db.collection('ai_api_logs').insertOne({ provider, model, type, source, latency, status, createdAt: new Date() }); } catch {}
}

function stripModelFence(text = '') {
  return String(text)
    .trim()
    .replace(/^```(?:json|echart|echarts)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractBalancedJson(text = '') {
  const input = stripModelFence(text);
  const start = input.search(/[\[{]/);
  if (start < 0) return '';

  const open = input[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth += 1;
    if (ch === close) depth -= 1;
    if (depth === 0) return input.slice(start, i + 1);
  }

  return input.slice(start);
}

function parseChartOption(raw) {
  const candidate = extractBalancedJson(raw);
  if (!candidate) return null;
  let parsed = JSON.parse(candidate);
  if (Array.isArray(parsed)) parsed = parsed[0];
  if (parsed?.type && parsed?.data?.datasets) parsed = chartJsToECharts(parsed);
  if (parsed?.option && typeof parsed.option === 'object') parsed = parsed.option;
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.series && !Array.isArray(parsed.series)) parsed.series = [parsed.series];
  if (!Array.isArray(parsed.series) || parsed.series.length === 0) return null;
  return parsed;
}

function chartJsToECharts(chart) {
  if (!chart || typeof chart !== 'object' || !chart.data?.datasets) return null;
  const labels = Array.isArray(chart.data.labels) ? chart.data.labels.map(String) : [];
  const datasets = Array.isArray(chart.data.datasets) ? chart.data.datasets : [];
  const firstDataset = datasets[0] || {};
  const chartType = String(chart.type || firstDataset.type || 'bar').toLowerCase();
  const title = chart.options?.plugins?.title?.text || chart.options?.title?.text || 'Chart';

  if (chartType === 'pie' || chartType === 'doughnut') {
    return {
      title: { text: title, left: 'center' },
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{
        name: firstDataset.label || title,
        type: 'pie',
        radius: chartType === 'doughnut' ? ['38%', '68%'] : '62%',
        data: labels.map((name, index) => ({ name, value: Number(firstDataset.data?.[index]) || 0 })),
      }],
    };
  }

  return {
    title: { text: title, left: 'center' },
    tooltip: { trigger: 'axis' },
    grid: { top: 70, left: 45, right: 24, bottom: 70 },
    xAxis: { type: 'category', data: labels },
    yAxis: { type: 'value' },
    series: datasets.map((dataset) => ({
      name: dataset.label || title,
      type: chartType === 'line' ? 'line' : 'bar',
      data: Array.isArray(dataset.data) ? dataset.data.map((value) => Number(value) || 0) : [],
    })),
  };
}

function looksLikeChartJson(raw = '') {
  const candidate = extractBalancedJson(raw);
  if (!candidate) return false;
  try {
    const parsed = JSON.parse(candidate);
    return Boolean(parseChartOption(candidate))
      || Boolean(parsed?.type && parsed?.data?.datasets)
      || Boolean(parsed?.chartType && parsed?.data)
      || Boolean(parsed?.data?.labels && parsed?.data?.datasets);
  } catch {
    return false;
  }
}

function removeBareChartJson(text = '') {
  let output = String(text);
  let cursor = 0;
  while (cursor < output.length) {
    const relativeStart = output.slice(cursor).search(/[\[{]/);
    if (relativeStart < 0) break;
    const start = cursor + relativeStart;
    const fragment = extractBalancedJson(output.slice(start));
    if (!fragment) break;
    if (looksLikeChartJson(fragment)) {
      output = `${output.slice(0, start)}${output.slice(start + fragment.length)}`;
      cursor = Math.max(0, start - 1);
    } else {
      cursor = start + Math.max(fragment.length, 1);
    }
  }
  return output;
}

function sanitizeChartTextResponse(text = '') {
  let cleaned = String(text);
  cleaned = cleaned.replace(/```([a-zA-Z0-9_-]*)\s*\n?([\s\S]*?)```/g, (full, language, body) => {
    const lang = String(language || '').toLowerCase();
    if (['echart', 'echarts', 'chart'].includes(lang)) return '';
    if ((lang === 'json' || /"series"|"xAxis"|"yAxis"|"chartType"|"datasets"/.test(body)) && looksLikeChartJson(body)) return '';
    return full;
  });
  cleaned = cleaned.replace(/`([\s\S]*?(?:"series"|"xAxis"|"yAxis"|"chartType"|"datasets")[\s\S]*?)`/g, (full, body) => (
    looksLikeChartJson(body) ? '' : full
  ));
  cleaned = removeBareChartJson(cleaned);
  return cleaned
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeEChartOptionValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeEChartOptionValue);
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /^\s*(function\s*\(|\([^)]*\)\s*=>|[a-zA-Z_$][\w$]*\s*=>)/.test(value)) return undefined;
    return value;
  }
  const cleaned = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const nextValue = sanitizeEChartOptionValue(rawValue);
    if (nextValue !== undefined) cleaned[key] = nextValue;
  }
  return cleaned;
}

function normalizeChartOption(option, fallbackTitle = 'Data Visualization') {
  const normalized = sanitizeEChartOptionValue({ ...option });
  normalized.title = normalized.title || { text: fallbackTitle };
  if (typeof normalized.title === 'string') normalized.title = { text: normalized.title };
  normalized.title = { left: 'center', ...(normalized.title || {}) };
  normalized.tooltip = normalized.tooltip || {};
  if (normalized.series && !Array.isArray(normalized.series)) normalized.series = [normalized.series];
  const hasPie = normalized.series?.some(series => series?.type === 'pie');
  const hasCartesian = normalized.xAxis || normalized.yAxis || normalized.series?.some(series => ['bar', 'line'].includes(series?.type));
  if (hasPie) {
    normalized.legend = { orient: 'horizontal', bottom: 0, ...(normalized.legend || {}) };
  } else if (normalized.legend || normalized.series?.length > 1) {
    normalized.legend = { top: 36, ...(normalized.legend || {}) };
  }
  if (hasCartesian) {
    normalized.grid = { top: normalized.legend ? 82 : 70, left: 48, right: 24, bottom: 72, containLabel: true, ...(normalized.grid || {}) };
  }
  return normalized;
}

function cleanSqlResponse(text = '') {
  return String(text)
    .trim()
    .replace(/^```sql\s*/i, '')
    .replace(/```$/i, '')
    .trim()
    .split(';')[0]
    .trim();
}

function makeEChartArtifact(option, metadata = {}) {
  if (!option || typeof option !== 'object') return null;
  const title = typeof option.title === 'string'
    ? option.title
    : option.title?.text || 'Chart';
  return {
    id: new ObjectId().toString(),
    type: 'echart',
    title,
    option,
    metadata,
  };
}

function makeDashboardArtifact({ title = 'Dashboard', charts = [], kpis = [], table = [], metadata = {} } = {}) {
  const validCharts = charts.filter(chart => chart?.option && typeof chart.option === 'object');
  if (validCharts.length === 0) return null;
  return {
    id: new ObjectId().toString(),
    type: 'dashboard',
    title,
    charts: validCharts.map((chart, index) => ({
      id: chart.id || new ObjectId().toString(),
      title: chart.title || `Chart ${index + 1}`,
      option: chart.option,
      size: chart.size || (index === 0 ? 'large' : 'medium'),
    })),
    kpis,
    table,
    metadata,
  };
}

function classifySentiment(text = '') {
  const lower = String(text).toLowerCase();
  const positive = [
    '5 bintang', 'bintang', 'recommend', 'terbaik', 'puas', 'sangat puas', 'bagus',
    'baik', 'mantap', 'excellent', 'great', 'good', 'love', 'happy', 'satisfied'
  ];
  const negative = [
    'lambat', 'slow', 'bad', 'poor', 'teruk', 'kecewa', 'tak puas', 'tidak puas',
    'complaint', 'problem', 'issue', 'improve', 'tambah baik', 'kurang', 'mahal'
  ];
  if (negative.some(word => lower.includes(word))) return 'Negative';
  if (positive.some(word => lower.includes(word))) return 'Positive';
  return 'Neutral';
}

function isSentimentRequest(text = '') {
  return /sentiment|positive|negative|neutral|positif|negatif|survey|feedback|respond|response|review|kepuasan/i.test(String(text));
}

function detectMessageLanguage(text = '') {
  const original = String(text || '').trim();
  const lower = original.toLowerCase();

  if (/\b(reply|respond|answer|speak|write)\s+(in\s+)?(english|eng|en)\b/.test(lower)) return 'English';
  if (/\b(reply|respond|answer|speak|write)\s+(in\s+)?(malay|bahasa malaysia|bahasa melayu|bm|ms)\b/.test(lower)) return 'Malay';
  if (/\b(jawab|balas|cakap|tulis)\s+(dalam\s+)?(english|inggeris|bahasa inggeris)\b/.test(lower)) return 'English';
  if (/\b(jawab|balas|cakap|tulis)\s+(dalam\s+)?(melayu|bahasa melayu|bahasa malaysia|bm)\b/.test(lower)) return 'Malay';

  if (/[\u4e00-\u9fff]/.test(original)) return 'Chinese';
  if (/[\u0B80-\u0BFF]/.test(original)) return 'Tamil';
  if (/[\u0600-\u06FF]/.test(original)) return 'Arabic';
  if (/[\u3040-\u30FF]/.test(original)) return 'Japanese';
  if (/[\uAC00-\uD7AF]/.test(original)) return 'Korean';

  const malayWords = lower.match(/\b(aku|saya|kau|awak|anda|nak|tak|takde|takleh|boleh|buat|tunjuk|papar|jadikan|jadi|tukar|ubah|macam|kenapa|mengapa|apa|ini|itu|yang|dan|atau|dengan|dalam|untuk|daripada|ke|kat|dekat|la|lah|je|ni|tu|bro|jadual|carta|graf|positif|negatif|respon|pelanggan|tinjauan)\b/g) || [];
  const englishWords = lower.match(/\b(i|you|me|my|we|they|it|is|are|was|were|the|a|an|this|that|these|those|can|could|should|would|please|make|show|change|switch|better|chart|graph|table|response|customer|survey|positive|negative|neutral|think|want|need|what|why|how)\b/g) || [];

  if (malayWords.length >= 2 && malayWords.length >= englishWords.length) return 'Malay';
  if (englishWords.length >= 2 && englishWords.length > malayWords.length) return 'English';
  if (malayWords.length > 0 && englishWords.length === 0) return 'Malay';
  return 'English';
}

function buildFallbackChartOption(rows, message = '', hint = 'auto') {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const headers = Object.keys(rows[0] || {});
  const lowerMessage = String(message).toLowerCase();
  const textHeaders = headers.filter((h) => rows.some((row) => typeof row[h] === 'string' && row[h].trim()));
  const shouldUseSentiment = isSentimentRequest(lowerMessage);

  if (shouldUseSentiment && textHeaders.length > 0) {
    const preferredTextHeader = textHeaders.find((h) => /message|response|respond|feedback|comment|review|answer|text|remarks?/i.test(h)) || textHeaders[0];
    const counts = { Positive: 0, Negative: 0, Neutral: 0 };
    rows.forEach((row) => {
      const sentiment = classifySentiment(row[preferredTextHeader]);
      counts[sentiment] += 1;
    });
    const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
    if (hint === 'bar' || hint === 'line') {
      return {
        title: { text: 'Customer Survey Sentiment Distribution', left: 'center' },
        tooltip: { trigger: 'axis' },
        grid: { top: 70, left: 48, right: 24, bottom: 56, containLabel: true },
        xAxis: { type: 'category', data: data.map(item => item.name) },
        yAxis: { type: 'value', minInterval: 1 },
        series: [{
          name: 'Responses',
          type: hint === 'line' ? 'line' : 'bar',
          data: data.map(item => item.value),
        }],
      };
    }
    return {
      title: { text: 'Customer Survey Sentiment Distribution', left: 'center' },
      tooltip: { trigger: 'item' },
      legend: { orient: 'horizontal', bottom: 0 },
      series: [{
        name: 'Sentiment',
        type: 'pie',
        radius: ['38%', '68%'],
        center: ['50%', '48%'],
        data,
        label: { formatter: '{b}: {d}%' },
      }],
    };
  }

  const numericHeaders = headers.filter((h) => rows.some((row) => row[h] !== null && row[h] !== '' && !Number.isNaN(Number(row[h]))))
    .filter((h) => !/^id$/i.test(h));
  const categoryHeader = textHeaders.find((h) => !/created|updated|date|time/i.test(h)) || headers.find((h) => !numericHeaders.includes(h));
  const numericHeader = numericHeaders[0];

  if (categoryHeader && numericHeader) {
    const limitedRows = rows.slice(0, 20);
    const type = hint === 'line' ? 'line' : 'bar';
    return {
      title: { text: `${numericHeader} by ${categoryHeader}`, left: 'center' },
      tooltip: { trigger: 'axis' },
      grid: { top: 70, left: 45, right: 24, bottom: 70 },
      xAxis: { type: 'category', data: limitedRows.map((row) => String(row[categoryHeader] ?? 'Unknown')) },
      yAxis: { type: 'value' },
      series: [{ name: numericHeader, type, data: limitedRows.map((row) => Number(row[numericHeader]) || 0) }],
    };
  }

  if (categoryHeader) {
    const counts = new Map();
    rows.forEach((row) => {
      const label = String(row[categoryHeader] ?? 'Unknown').trim() || 'Unknown';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    const data = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, value]) => ({ name, value }));
    const usePie = hint === 'pie' || data.length <= 6;
    if (usePie) {
      return {
        title: { text: `Distribution by ${categoryHeader}`, left: 'center' },
        tooltip: { trigger: 'item' },
        legend: { orient: 'horizontal', bottom: 0 },
        series: [{ name: categoryHeader, type: 'pie', radius: '62%', data }],
      };
    }
    return {
      title: { text: `Count by ${categoryHeader}`, left: 'center' },
      tooltip: { trigger: 'axis' },
      grid: { top: 70, left: 45, right: 24, bottom: 70 },
      xAxis: { type: 'category', data: data.map((item) => item.name) },
      yAxis: { type: 'value' },
      series: [{ name: 'Count', type: 'bar', data: data.map((item) => item.value) }],
    };
  }

  return null;
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function columnScore(name = '', samples = [], patterns = []) {
  const normalizedName = normalizeLookupText(name);
  let score = 0;
  for (const pattern of patterns) {
    if (pattern.test(normalizedName)) score += 20;
  }
  const nonEmpty = samples.filter(value => normalizeCellValue(value)).length;
  const unique = new Set(samples.map(normalizeCellValue).filter(Boolean)).size;
  if (nonEmpty > 0) score += 5;
  if (unique > 1) score += 5;
  if (unique > 0 && unique <= Math.max(12, samples.length * 0.8)) score += 3;
  return score;
}

function pickDimensionColumn(rows = [], message = '') {
  const headers = Object.keys(rows[0] || {});
  if (headers.length === 0) return null;
  const lower = normalizeLookupText(message);
  const requestedPatterns = [];
  if (/\b(maker|manufacturer|brand|make|jenama|pengeluar)\b/i.test(lower)) {
    requestedPatterns.push(/^(maker|manufacturer|brand|make|jenama|pengeluar)$/i, /maker|manufacturer|brand|make|jenama|pengeluar/i);
  }
  if (/\b(category|kategori|type|jenis|group|segment)\b/i.test(lower)) {
    requestedPatterns.push(/category|kategori|type|jenis|group|segment/i);
  }
  if (/\b(sentiment|positive|negative|neutral|positif|negatif)\b/i.test(lower)) {
    requestedPatterns.push(/sentiment|mood|tone/i);
  }
  const genericPatterns = [
    /maker|manufacturer|brand|make|jenama|pengeluar/i,
    /category|kategori|type|jenis|group|segment/i,
    /name|label|title/i,
  ];
  const scored = headers.map(header => {
    const samples = rows.slice(0, 100).map(row => row[header]);
    const numericLike = samples.filter(value => normalizeCellValue(value) && !Number.isNaN(Number(value))).length;
    const textLike = samples.filter(value => normalizeCellValue(value) && Number.isNaN(Number(value))).length;
    let score = columnScore(header, samples, requestedPatterns.length ? requestedPatterns : genericPatterns);
    if (/id|uuid|email|phone|tel|url|date|time|created|updated|submitted/i.test(header)) score -= 20;
    if (textLike > 0) score += 10;
    if (numericLike > textLike) score -= 8;
    return { header, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].header : headers[0];
}

function pickNumericColumn(rows = [], message = '') {
  const headers = Object.keys(rows[0] || {});
  const lower = normalizeLookupText(message);
  const preferred = headers.find(header => (
    /\b(total|sum|amount|revenue|sales|count|registrations?|quantity|qty|number|bilangan|jumlah)\b/i.test(lower)
    && /total|sum|amount|revenue|sales|count|registrations?|quantity|qty|number|bilangan|jumlah/i.test(header)
  ));
  if (preferred) return preferred;
  const scored = headers.map(header => {
    const samples = rows.slice(0, 100).map(row => row[header]);
    const numericValues = samples.filter(value => normalizeCellValue(value) && !Number.isNaN(Number(value)));
    let score = numericValues.length;
    if (/id|uuid|phone|tel|year|date|time|created|updated|submitted/i.test(header)) score -= 20;
    if (/total|sum|amount|revenue|sales|count|registrations?|quantity|qty|number|bilangan|jumlah/i.test(header)) score += 12;
    return { header, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].header : null;
}

function inferAnalysisOperation(message = '') {
  const lower = normalizeLookupText(message);
  if (/\b(sentiment|positive|negative|neutral|positif|negatif)\b/i.test(lower)) return 'sentiment_count';
  if (/\b(sum|total amount|jumlah nilai|revenue|sales total)\b/i.test(lower)) return 'sum_by';
  if (/\b(average|avg|mean|purata)\b/i.test(lower)) return 'average_by';
  if (/\b(count|number of|total number|registrations?|responses?|records?|rows?|bilangan|jumlah)\b/i.test(lower)) return 'count_by';
  return 'count_by';
}

function extractTopN(message = '', fallback = 12) {
  if (/\b(all|each|every|complete|dont miss|do not miss|semua|setiap)\b/i.test(message)
    && /\b(brand|brands|manufacturer|manufacturers|maker|makers|pengeluar|jenama|category|categories)\b/i.test(message)) {
    return 100;
  }
  const match = String(message).match(/\btop\s+(\d+)|\b(\d+)\s+(?:teratas|atas)\b/i);
  const value = Number(match?.[1] || match?.[2]);
  if (Number.isFinite(value) && value > 0) return Math.min(value, 50);
  return fallback;
}

function buildSafeAnalysisChartOption(analysis, hint = 'auto') {
  if (!analysis?.table?.length) return null;
  const chartType = hint === 'scatter' ? 'scatter' : hint === 'pie' || analysis.chartType === 'pie' ? 'pie' : hint === 'line' ? 'line' : 'bar';
  const title = analysis.title || 'Analysis';
  const labels = analysis.table.map(row => row.label);
  const values = analysis.table.map(row => Number(row.value) || 0);
  const name = analysis.valueLabel || 'Value';

  if (chartType === 'pie') {
    return normalizeChartOption({
      title: { text: title, left: 'center' },
      tooltip: { trigger: 'item' },
      legend: { orient: 'horizontal', bottom: 0 },
      series: [{
        name,
        type: 'pie',
        radius: ['38%', '66%'],
        center: ['50%', '48%'],
        data: analysis.table.map(row => ({ name: row.label, value: row.value })),
        label: { formatter: '{b}: {d}%' },
      }],
    }, title);
  }

  if (chartType === 'scatter') {
    return normalizeChartOption({
      title: { text: title, left: 'center' },
      tooltip: { trigger: 'axis' },
      grid: { top: 72, left: 56, right: 28, bottom: 72, containLabel: true },
      xAxis: { type: 'category', data: labels, axisLabel: { interval: 0, rotate: labels.some(label => String(label).length > 10) ? 28 : 0 } },
      yAxis: { type: 'value', minInterval: 1, name },
      series: [{
        name,
        type: 'scatter',
        symbolSize: 14,
        data: values,
      }],
    }, title);
  }

  const horizontal = chartType === 'bar' && labels.some(label => String(label).length > 12);
  if (horizontal) {
    return normalizeChartOption({
      title: { text: title, left: 'center' },
      tooltip: { trigger: 'axis' },
      grid: { top: 72, left: 120, right: 32, bottom: 36, containLabel: true },
      xAxis: { type: 'value', minInterval: 1, name },
      yAxis: { type: 'category', inverse: true, data: labels },
      series: [{
        name,
        type: 'bar',
        data: values,
        label: { show: false },
      }],
    }, title);
  }

  return normalizeChartOption({
    title: { text: title, left: 'center' },
    tooltip: { trigger: 'axis' },
    grid: { top: 72, left: 56, right: 28, bottom: 72, containLabel: true },
    xAxis: { type: 'category', data: labels, axisLabel: { interval: 0, rotate: labels.some(label => String(label).length > 10) ? 28 : 0 } },
    yAxis: { type: 'value', minInterval: 1, name },
    series: [{
      name,
      type: chartType === 'line' ? 'line' : 'bar',
      data: values,
      label: { show: false },
    }],
  }, title);
}

function buildSharePieOption(analysis) {
  if (!analysis?.table?.length || analysis.table.length < 2) return null;
  return normalizeChartOption({
    title: { text: `Share by ${analysis.dimensionColumn || 'Category'}`, left: 'center' },
    tooltip: { trigger: 'item' },
    legend: { orient: 'horizontal', bottom: 0 },
    series: [{
      name: 'Share',
      type: 'pie',
      radius: ['38%', '66%'],
      center: ['50%', '48%'],
      data: analysis.table.map(row => ({ name: row.label, value: row.value })),
      label: { formatter: '{b}: {d}%' },
    }],
  }, `Share by ${analysis.dimensionColumn || 'Category'}`);
}

function pickDateColumn(rows = []) {
  const headers = Object.keys(rows[0] || {});
  const scored = headers.map(header => {
    const samples = rows.slice(0, 50).map(row => normalizeCellValue(row[header]));
    let score = /date|month|year|created|updated|submitted|time|tarikh|bulan|tahun/i.test(header) ? 20 : 0;
    score += samples.filter(value => {
      if (!value) return false;
      if (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?/.test(value)) return true;
      if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s]?\d{2,4}$/i.test(value)) return true;
      return !Number.isNaN(Date.parse(value)) && /[a-zA-Z0-9]/.test(value);
    }).length;
    return { header, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 10 ? scored[0].header : null;
}

function normalizePeriodLabel(value = '') {
  const text = normalizeCellValue(value);
  const monthMatch = text.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s]?(\d{2,4})$/i);
  if (monthMatch) return `${monthMatch[1].slice(0, 3)}-${monthMatch[2].slice(-2)}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' ', '-');
  }
  return text || 'Unknown';
}

function buildTrendOption(rows = [], message = '', source = 'unknown') {
  const dateColumn = pickDateColumn(rows);
  if (!dateColumn) return null;
  const numericColumn = pickNumericColumn(rows, message);
  const groups = new Map();
  for (const row of rows) {
    const label = normalizePeriodLabel(row[dateColumn]);
    if (!label) continue;
    const numeric = numericColumn ? Number(row[numericColumn]) : NaN;
    const value = !Number.isNaN(numeric) ? numeric : 1;
    groups.set(label, (groups.get(label) || 0) + value);
  }
  const points = [...groups.entries()].map(([label, value]) => ({ label, value }));
  if (points.length < 2) return null;
  const title = `${numericColumn || 'Count'} Trend`;
  return normalizeChartOption({
    title: { text: title, left: 'center' },
    tooltip: { trigger: 'axis' },
    grid: { top: 72, left: 56, right: 28, bottom: 72, containLabel: true },
    xAxis: { type: 'category', data: points.map(point => point.label), axisLabel: { interval: 0, rotate: points.length > 8 ? 30 : 0 } },
    yAxis: { type: 'value', minInterval: numericColumn ? undefined : 1, name: numericColumn || 'Count' },
    series: [{
      name: numericColumn || 'Count',
      type: 'line',
      smooth: true,
      data: points.map(point => Number(point.value.toFixed(2))),
    }],
  }, title);
}

function buildScatterOptionFromRows(rows = [], message = '', source = 'unknown') {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const headers = Object.keys(rows[0] || {});
  const numericHeaders = headers.filter((header) => rows.some((row) => {
    const value = normalizeCellValue(row[header]);
    return value !== '' && !Number.isNaN(Number(value));
  })).filter(header => !/id|uuid|phone|tel|created|updated|submitted|date|time/i.test(header));
  const textHeaders = headers.filter(header => rows.some(row => normalizeCellValue(row[header]) && Number.isNaN(Number(row[header]))));
  const lower = normalizeLookupText(message);
  const mentionedNumeric = numericHeaders.filter(header => lower.includes(normalizeLookupText(header)));
  const xNumeric = mentionedNumeric[0] || numericHeaders[0];
  const yNumeric = mentionedNumeric.find(header => header !== xNumeric) || numericHeaders.find(header => header !== xNumeric);

  if (xNumeric && yNumeric) {
    const data = rows
      .map(row => [Number(row[xNumeric]), Number(row[yNumeric])])
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      .slice(0, 200);
    if (data.length === 0) return null;
    const title = `${yNumeric} vs ${xNumeric}`;
    return normalizeChartOption({
      title: { text: title, left: 'center' },
      tooltip: { trigger: 'item', formatter: `${xNumeric}: {@[0]}<br/>${yNumeric}: {@[1]}` },
      grid: { top: 72, left: 64, right: 28, bottom: 64, containLabel: true },
      xAxis: { type: 'value', name: xNumeric },
      yAxis: { type: 'value', name: yNumeric },
      series: [{
        name: title,
        type: 'scatter',
        symbolSize: 12,
        data,
      }],
    }, title);
  }

  const yColumn = xNumeric;
  const labelColumn = textHeaders.find(header => !/date|time|created|updated|submitted/i.test(header))
    || headers.find(header => header !== yColumn);
  if (!yColumn || !labelColumn) return null;
  const points = rows
    .map((row, index) => ({
      label: normalizeCellValue(row[labelColumn]) || String(index + 1),
      value: Number(row[yColumn]),
    }))
    .filter(point => Number.isFinite(point.value))
    .slice(0, 80);
  if (points.length === 0) return null;
  const title = `${yColumn} by ${labelColumn}`;
  return normalizeChartOption({
    title: { text: title, left: 'center' },
    tooltip: { trigger: 'axis' },
    grid: { top: 72, left: 56, right: 28, bottom: 72, containLabel: true },
    xAxis: { type: 'category', data: points.map(point => point.label), axisLabel: { interval: 0, rotate: points.length > 8 ? 30 : 0 } },
    yAxis: { type: 'value', name: yColumn },
    series: [{
      name: yColumn,
      type: 'scatter',
      symbolSize: 14,
      data: points.map(point => point.value),
    }],
  }, title);
}

function runAnalysisTool(rows = [], message = '', hint = 'auto', source = 'unknown') {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const operation = inferAnalysisOperation(message);
  const explicitCount = /\b(count|number of|total number|registrations?|responses?|records?|rows?|bilangan)\b/i.test(message);
  const topN = extractTopN(message, /top/i.test(message) ? 5 : 12);
  const wantsPercent = /\b(percent|percentage|share|market share|peratus|bahagian)\b/i.test(message);
  let table = [];
  let dimensionColumn = null;
  let valueColumn = null;
  let title = 'Analysis';
  let valueLabel = 'Count';

  if (operation === 'sentiment_count') {
    const headers = Object.keys(rows[0] || {});
    const textHeader = headers.find(h => /message|response|respond|feedback|comment|review|answer|text|remarks?/i.test(h))
      || headers.find(h => rows.some(row => Number.isNaN(Number(row[h])) && normalizeCellValue(row[h])))
      || headers[0];
    const counts = { Positive: 0, Negative: 0, Neutral: 0 };
    rows.forEach(row => { counts[classifySentiment(row[textHeader])] += 1; });
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    table = Object.entries(counts).map(([label, value]) => ({
      label,
      value,
      percentage: total ? Number(((value / total) * 100).toFixed(2)) : 0,
    }));
    dimensionColumn = 'sentiment';
    title = 'Sentiment Distribution';
  } else {
    dimensionColumn = pickDimensionColumn(rows, message);
    valueColumn = pickNumericColumn(rows, message);
    const groups = new Map();
    for (const row of rows) {
      const label = normalizeCellValue(row[dimensionColumn]) || 'Unknown';
      const numeric = valueColumn ? Number(row[valueColumn]) : NaN;
      if (!groups.has(label)) groups.set(label, { label, count: 0, sum: 0, numericCount: 0 });
      const item = groups.get(label);
      item.count += 1;
      if (!Number.isNaN(numeric)) {
        item.sum += numeric;
        item.numericCount += 1;
      }
    }
    let raw = [...groups.values()];
    const shouldUseNumericValue = valueColumn && (
      operation === 'sum_by'
      || operation === 'average_by'
      || !explicitCount
      || /count|total|registrations?|responses?|records?|quantity|qty|number|bilangan|jumlah/i.test(valueColumn)
    );
    if ((operation === 'sum_by' || (operation === 'count_by' && shouldUseNumericValue)) && valueColumn) {
      valueLabel = valueColumn;
      raw = raw.map(item => ({ label: item.label, value: item.sum, count: item.count }));
    } else if (operation === 'average_by' && valueColumn) {
      valueLabel = `Average ${valueColumn}`;
      raw = raw.map(item => ({ label: item.label, value: item.numericCount ? item.sum / item.numericCount : 0, count: item.count }));
    } else {
      valueLabel = 'Count';
      raw = raw.map(item => ({ label: item.label, value: item.count }));
    }
    raw.sort((a, b) => Number(b.value) - Number(a.value));
    const total = raw.reduce((sum, item) => sum + Number(item.value || 0), 0);
    table = raw.slice(0, topN).map((item, index) => ({
      rank: index + 1,
      label: item.label,
      value: Number(item.value) || 0,
      percentage: total ? Number(((Number(item.value) / total) * 100).toFixed(2)) : 0,
    }));
    title = `${topN < raw.length ? `Top ${topN} ` : ''}${valueLabel} by ${dimensionColumn}`;
  }

  if (table.length === 0) return null;
  const chartType = hint === 'scatter' ? 'scatter' : hint === 'pie' || (hint === 'auto' && table.length <= 6 && wantsPercent) ? 'pie' : hint === 'line' ? 'line' : 'bar';
  const analysis = {
    operation,
    source,
    dimensionColumn,
    valueColumn,
    valueLabel,
    totalRows: rows.length,
    totalValue: table.reduce((sum, item) => sum + Number(item.value || 0), 0),
    topN,
    includesPercentage: wantsPercent || operation === 'sentiment_count',
    title,
    chartType,
    table,
    summaryStats: {
      groups: table.length,
      highest: table[0] || null,
    },
  };
  analysis.echartsOption = buildSafeAnalysisChartOption(analysis, chartType);
  return analysis.echartsOption ? analysis : null;
}

function formatAnalysisForPrompt(analysis) {
  if (!analysis?.table?.length) return '';
  const headers = ['rank', 'label', 'value', 'percentage'].filter(header => analysis.table.some(row => row[header] !== undefined));
  const lines = [
    '## Analysis tool result:',
    `Operation: ${analysis.operation}`,
    `Source: ${analysis.source}`,
    `Dimension: ${analysis.dimensionColumn || '-'}`,
    `Value: ${analysis.valueLabel || 'Value'}`,
    `Total source rows: ${analysis.totalRows}`,
    headers.join(' | '),
    analysis.table.map(row => headers.map(header => row[header] ?? '').join(' | ')).join('\n'),
    '',
    'Use this analysis result as the single source of truth for any numbers mentioned in the answer and rendered chart.',
  ];
  return `\n\n${lines.join('\n')}`;
}

function summarizeToolOutput(output) {
  if (!output) return output;
  if (Array.isArray(output)) return { count: output.length };
  if (Array.isArray(output.rows)) return { rows: output.rows.length, columns: Object.keys(output.rows[0] || {}) };
  if (Array.isArray(output.chunks)) return { chunks: output.chunks.length };
  if (output.type === 'echart') return { type: output.type, title: output.title };
  if (output.type === 'dashboard') return { type: output.type, title: output.title, charts: output.charts?.length || 0 };
  if (Array.isArray(output.table) && output.operation) return {
    operation: output.operation,
    rows: output.table.length,
    dimension: output.dimensionColumn,
    value: output.valueLabel,
    highest: output.summaryStats?.highest || null,
  };
  if (typeof output === 'object') return output;
  return String(output).slice(0, 300);
}

function summarizeChartArtifact(artifact) {
  if (!artifact) return '';
  if (artifact.type === 'dashboard' && Array.isArray(artifact.charts)) {
    const chartSummaries = artifact.charts
      .slice(0, 4)
      .map(chart => summarizeChartArtifact({ type: 'echart', title: chart.title, option: chart.option }))
      .filter(Boolean);
    return chartSummaries.length > 0
      ? `${artifact.title || 'Dashboard'} — ${chartSummaries.join(' | ')}`
      : artifact.title || 'Dashboard';
  }
  if (artifact.type !== 'echart' || !artifact.option) return '';
  const option = artifact.option;
  const title = typeof option.title === 'string' ? option.title : option.title?.text || artifact.title || 'Chart';
  const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
  const parts = [];
  for (const item of series.slice(0, 3)) {
    const type = item?.type || 'chart';
    if (Array.isArray(item?.data) && item.data.some(point => typeof point === 'object' && point?.name !== undefined)) {
      const values = item.data
        .map(point => `${point.name}: ${point.value ?? 0}`)
        .join(', ');
      parts.push(`${type} ${item.name || ''}: ${values}`.trim());
      continue;
    }
    const xAxis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis;
    const labels = Array.isArray(xAxis?.data) ? xAxis.data : [];
    if (labels.length > 0 && Array.isArray(item?.data)) {
      const values = labels
        .map((label, index) => `${label}: ${item.data[index] ?? 0}`)
        .join(', ');
      parts.push(`${type} ${item.name || ''}: ${values}`.trim());
    }
  }
  return parts.length > 0 ? `${title} — ${parts.join(' | ')}` : title;
}

function buildRenderedChartContext(history = [], currentArtifact = null) {
  const summaries = [];
  for (const message of history.slice(-8)) {
    const artifacts = Array.isArray(message.artifacts) ? message.artifacts : [];
    for (const artifact of artifacts) {
      const summary = summarizeChartArtifact(artifact);
      if (summary) summaries.push(summary);
    }
  }
  const currentSummary = summarizeChartArtifact(currentArtifact);
  if (currentSummary) summaries.push(`Current chart: ${currentSummary}`);
  const recent = summaries.slice(-4);
  return recent.length > 0
    ? `\n\n## Rendered chart artifacts visible to the user:\n${recent.map((summary, index) => `${index + 1}. ${summary}`).join('\n')}\nWhen the user asks about a previous chart, answer based on this rendered chart summary. If a previous chart omitted a category that appears in the data, acknowledge the chart issue clearly.`
    : '';
}

function getLatestChartArtifact(history = []) {
  for (const message of [...history].reverse()) {
    const artifacts = Array.isArray(message.artifacts) ? message.artifacts : [];
    const chart = [...artifacts].reverse().find(artifact => (
      (artifact?.type === 'echart' && artifact.option)
      || (artifact?.type === 'dashboard' && Array.isArray(artifact.charts))
    ));
    if (chart) return chart;
  }
  return null;
}

function inferChartTypeHint(text = '', fallback = 'auto') {
  const lower = String(text).toLowerCase();
  if (/\b(scat{1,2}er\w*|scatterplot|scatter plot)\b|graf sebaran|carta sebaran/.test(lower)) return 'scatter';
  if (/\b(pie|donut|doughnut)\b|carta pai|pai chart/.test(lower)) return 'pie';
  if (/\b(bar|column)\b|bar chart|carta bar/.test(lower)) return 'bar';
  if (/\b(line|trend)\b|line chart|carta garis/.test(lower)) return 'line';
  return fallback || 'auto';
}

function inferVisualizationMode(text = '') {
  const lower = String(text).toLowerCase();
  if (/\b(dashboard|report|overview|summary dashboard|multi[-\s]?chart|multiple charts?|several charts?|excel dashboard|macam\s+excel|macam\s+dashboard|like\s+excel|like\s+dashboard)\b/.test(lower)) {
    return 'dashboard';
  }
  const chartTerms = ['pie', 'bar', 'line', 'trend', 'share', 'percentage', 'stacked', '100%'];
  const mentioned = chartTerms.filter(term => lower.includes(term));
  if (mentioned.length >= 2 && /\b(and|with|plus|dan|serta|bersama|sekali)\b/.test(lower)) return 'dashboard';
  if (/\b(total|kpi|trend|share|percentage)\b.*\b(chart|visual|dashboard|graf|carta)\b/.test(lower) && mentioned.length >= 2) return 'dashboard';
  return 'single';
}

function isChartFollowUpRequest(text = '', hasPreviousChart = false) {
  if (!hasPreviousChart) return false;
  const lower = String(text).toLowerCase();
  return /\b(tukar|ubah|change|convert|switch|jadikan|make it|turn it|plot as|show as|display as)\b/.test(lower)
    && /\b(chart|graph|visual|pie|bar|line|scat{1,2}er\w*|carta|graf)\b/.test(lower);
}

function shouldUsePreviousChartForRequest(text = '', hasPreviousChart = false) {
  if (!hasPreviousChart) return false;
  const lower = String(text).toLowerCase();
  if (isChartCapabilityQuestion(lower)) return false;
  if (isChartFollowUpRequest(lower, hasPreviousChart)) return true;

  const asksForChart = /\b(make|create|generate|show|display|visuali[sz]e|plot|buat|hasilkan|tunjuk|papar|lukis)\b/.test(lower)
    && /\b(chart|graph|dashboard|visual|plot|pie|bar|line|scat{1,2}er\w*|carta|graf)\b/.test(lower);
  if (!asksForChart) return false;

  const explicitlyNewSource = /\b(file|document|dokumen|pdf|csv|excel|table|jadual|data source|sumber data|rag|vector|uploaded|upload)\b/.test(lower)
    || /\b(from|using|based on|dari|daripada|guna|gunakan|berdasarkan|ikut)\b.{0,80}\b(data|file|document|dokumen|pdf|csv|excel|table|jadual|source|sumber|rag|vector)\b/.test(lower);
  return !explicitlyNewSource;
}

function isChartCapabilityQuestion(text = '') {
  const lower = String(text).toLowerCase();
  const mentionsChart = /\b(chart|graph|visual|plot|dashboard|pie|bar|line|scat{1,2}er\w*|histogram|carta|graf)\b/.test(lower);
  if (!mentionsChart) return false;

  const asksChartTypes = /\b(what|which|apa|jenis|type|types|macam mana)\b.{0,50}\b(chart|graph|visual|plot|carta|graf)\b/.test(lower)
    || /\b(chart|graph|visual|plot|carta|graf)\b.{0,50}\b(type|types|jenis|lain|selain)\b/.test(lower)
    || /\b(selain|other than|besides)\b.{0,60}\b(bar|pie|pai|line|scat{1,2}er\w*|carta|graf)\b/.test(lower);
  const asksCapability = /\b(can|could|support|available|boleh|ada)\b.{0,60}\b(chart|graph|visual|plot|carta|graf)\b/.test(lower);
  const directDataRequest = /\b(generate|create|draw|plot|show|display|visuali[sz]e|buatkan|hasilkan|tunjuk|papar|lukis)\b.{0,80}\b(data|table|document|file|survey|response|respond|record|feedback|source|based on|from|dari|daripada|ikut|berdasarkan)\b/.test(lower)
    || /\b(tukar|ubah|change|convert|switch|jadikan|make it|turn it)\b/.test(lower);

  return (asksChartTypes || asksCapability) && !directDataRequest;
}

function isTableOnlyRequest(text = '') {
  const lower = String(text).toLowerCase();
  const wantsTable = /\b(table|tabular|spreadsheet|csv|excel|jadual)\b/.test(lower)
    || /\b(make|create|show|display|present|format|buat|hasilkan|tunjuk|papar)\b.{0,30}\b(table|jadual)\b/.test(lower)
    || /\b(table|jadual)\b.{0,30}\b(format|form)\b/.test(lower);
  const wantsChart = /\b(chart|graph|visuali[sz]ation|visualize|visualise|plot|dashboard|histogram|pie chart|bar chart|line chart|carta|graf)\b/.test(lower);
  return wantsTable && !wantsChart;
}

function isChartIntent(text = '', { chartModeOn = false, hasPreviousChart = false } = {}) {
  if (chartModeOn) return true;
  const lower = String(text).toLowerCase();
  if (isTableOnlyRequest(lower)) return false;
  if (isChartCapabilityQuestion(lower)) return false;
  if (isChartFollowUpRequest(lower, hasPreviousChart)) return true;
  const asksWhyOnly = /^(why|kenapa|mengapa|apa sebab|how come)\b/.test(lower);
  const hasChartNoun = /\b(chart|graph|visuali[sz]ation|visualize|visualise|plot|dashboard|histogram|pie chart|bar chart|line chart|scat{1,2}er\w*|carta|graf)\b/.test(lower);
  const hasChartVerb = /\b(generate|create|draw|plot|show|display|visuali[sz]e|buat|hasilkan|tunjuk|papar|lukis)\b/.test(lower);
  const hasAnalyticShape = /\b(distribution|breakdown|trend|compare|comparison|percentage|ratio|share|count by|group by|pecahan|taburan|perbandingan|kategori|sentiment|positive|negative|neutral|positif|negatif)\b/.test(lower);
  if (asksWhyOnly && !hasChartVerb && !/\b(tukar|ubah|change|convert|switch)\b/.test(lower)) return false;
  return (hasChartNoun && (hasChartVerb || hasAnalyticShape))
    || (hasChartVerb && hasAnalyticShape && /\b(data|survey|response|respond|record|feedback|sales|revenue|customer|rows?)\b/.test(lower));
}

function isStructuredDataIntent(text = '', dataSourcesAvailable = false) {
  if (!dataSourcesAvailable) return false;
  const lower = String(text).toLowerCase();
  if (/\b(why|kenapa|explain|jelaskan)\b/.test(lower) && !/\b(data|survey|record|response|respond|customer|show|list|latest|recent|last|count|total)\b/.test(lower)) return false;
  return /\b(data|survey|respond|response|record|records|customer|show me|show|list|latest|recent|last \d+|top \d+|count|total|average|sum|trend|breakdown|distribution|feedback|review)\b/i.test(lower);
}

function wantsExternalSearch(text = '') {
  return /\b(web|internet|online|google|external|outside|public source|news|market today|current market|real[-\s]?time|cari luar|carikan luar|search web|web search|cari internet|sumber luar|data luar)\b/i.test(String(text));
}

// Entity/attribute lookup, e.g. "tell me about Y16ZR", "apa itu R15M", "specs MT-09".
// Used so structured (SQL) data is probed even when the user does not name a file
// or data source. Requires data sources to exist to be meaningful.
function isEntityLookupIntent(text = '', dataSourcesAvailable = false) {
  if (!dataSourcesAvailable) return false;
  if (isLowRiskConversational(text)) return false;
  // Product/model code tokens like Y16ZR, MT09, R15M, NVX155 — strong lookup signal.
  const hasCodeToken = /\b(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)[a-z0-9-]{2,}\b/i.test(String(text));
  const lower = normalizeLookupText(text);
  const asksLookup = /\b(tell me about|what is|what are|who is|whats|info|information|detail|details|explain|describe|spec|specs|specification|specifications|compare|about|apa itu|apakah|maklumat|butiran|terangkan|ceritakan|cerita pasal|pasal)\b/.test(lower);
  return hasCodeToken || asksLookup;
}

function isLowRiskConversational(text = '') {
  const lower = normalizeLookupText(text);
  if (!lower) return true;
  if (/^(hi|hello|hey|hai|helo|salam|thanks|thank you|terima kasih|ok|okay|baik|noted|test)$/.test(lower)) return true;
  if (/\b(who are you|what can you do|help|bantuan|siapa awak|siapa kamu|apa boleh buat|reply in|jawab dalam|tukar bahasa|change language)\b/i.test(lower)) return true;
  return false;
}

function isLikelyFactualOrDataRequest(text = '') {
  const lower = normalizeLookupText(text);
  if (!lower || isLowRiskConversational(lower)) return false;
  if (/\b(what|why|how|when|where|which|who|apa|kenapa|mengapa|bila|mana|siapa|berapa|cemana|macam mana)\b/.test(lower)) return true;
  return /\b(show|give|list|find|search|calculate|summarize|analyse|analyze|compare|explain|tell|cari|tunjuk|papar|kira|jumlah|ringkas|buat|hasilkan|data|record|records|survey|response|respond|feedback|customer|form|file|document|dokumen|fail|table|jadual|chart|graph|dashboard|spec|specs|price|registration|policy|product|motor|nmax)\b/.test(lower);
}

const GROUNDING_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'these', 'those', 'please', 'show', 'give',
  'make', 'create', 'generate', 'calculate', 'total', 'number', 'data', 'table', 'chart', 'graph',
  'what', 'why', 'how', 'when', 'where', 'which', 'who',
  'saya', 'aku', 'kau', 'awak', 'anda', 'yang', 'dan', 'atau', 'dengan', 'dalam', 'untuk',
  'daripada', 'nak', 'boleh', 'buat', 'tunjuk', 'papar', 'cari', 'kira', 'jumlah', 'jadual',
  'carta', 'graf', 'apa', 'kenapa', 'mengapa', 'bila', 'mana', 'siapa', 'berapa', 'macam',
  'cemana', 'je', 'la', 'lah', 'tu', 'ni', 'bro',
]);

function groundingTokens(text = '') {
  return normalizeLookupText(text)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !GROUNDING_STOPWORDS.has(token))
    .slice(0, 30);
}

function chunkEvidenceScore(message = '', chunks = []) {
  const tokens = groundingTokens(message);
  if (!tokens.length || !Array.isArray(chunks) || chunks.length === 0) {
    return { lexical: 0, maxVectorScore: 0, matchedTokens: [] };
  }
  const haystack = chunks.slice(0, 8).map(chunk => `${chunk.file_name || ''} ${chunk.content || ''}`).join(' ').toLowerCase();
  const matchedTokens = [...new Set(tokens.filter(token => haystack.includes(token)))];
  const vectorScores = chunks
    .map(chunk => Number(chunk.score))
    .filter(score => Number.isFinite(score));
  return {
    lexical: matchedTokens.length / tokens.length,
    maxVectorScore: vectorScores.length ? Math.max(...vectorScores) : 0,
    matchedTokens,
  };
}

function hasUsableRagEvidence(message = '', chunks = [], { fileId = null, broadSearch = false } = {}) {
  if (!Array.isArray(chunks) || chunks.length === 0) return { ok: false, reason: 'no_rag_chunks' };
  if (fileId) return { ok: true, reason: 'file_scoped_rag' };

  const score = chunkEvidenceScore(message, chunks);
  const tokenCount = groundingTokens(message).length;
  if (score.lexical >= 0.25 && score.matchedTokens.length >= Math.min(2, Math.max(1, tokenCount))) {
    return { ok: true, reason: 'lexical_match', ...score };
  }
  if (!broadSearch && score.maxVectorScore >= 0.72) return { ok: true, reason: 'vector_score', ...score };
  return { ok: false, reason: 'weak_rag_match', ...score };
}

function uniqueSourceCitations(chunks = []) {
  const seen = new Set();
  return chunks.filter(c => c.file_name).map(c => ({
    file_name: c.file_name,
    file_id: c.file_id,
    page_number: c.page_number,
    score: c.score,
  })).filter(s => {
    const key = `${s.file_name}:${s.page_number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Distinct downloadable source FILES from retrieved chunks, deduped by file_id
// (not per page like citations). Filters out weakly-relevant files so the chat
// only offers downloads for documents that actually match the query.
function uniqueSourceFiles(chunks = [], limit = 20) {
  if (!Array.isArray(chunks) || chunks.length === 0) return [];

  // Best score per file
  const bestByFile = new Map();
  let topScore = 0;
  for (const c of chunks) {
    if (!c || !c.file_id || !c.file_name) continue;
    const score = typeof c.score === 'number' ? c.score : 0;
    if (score > topScore) topScore = score;
    const key = String(c.file_id);
    const prev = bestByFile.get(key);
    if (!prev || score > prev.score) bestByFile.set(key, { file_id: key, file_name: c.file_name, score });
  }
  if (bestByFile.size === 0) return [];

  // Relevance gate: keep files near the strongest match, with an absolute floor.
  // Embedding models give a high baseline similarity to same-domain text, so a
  // relative (top-cluster) threshold separates real matches from noise better
  // than a fixed cutoff. If even the top match is weak (< floor), offer nothing.
  const threshold = Math.max(0.5, topScore * 0.9);

  return [...bestByFile.values()]
    .filter(f => f.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ file_id, file_name }) => ({ file_id, file_name }));
}

// Instruction that tells the LLM to place an inline download tag under each
// person/item that is backed by a retrieved document. The frontend converts
// [Download: <file name>] into a clickable download link, so the file appears
// directly under its owner (e.g. a resume under a candidate).
function buildDownloadInstruction(chunks = []) {
  const files = uniqueSourceFiles(chunks);
  if (!files.length) return '';
  const list = files.map(f => `- ${f.file_name}`).join('\n');
  return `\n\n## Downloadable source documents
The user can download these source files. When your answer presents a person, candidate, profile, or item that is drawn from one of these documents, append on its OWN line, immediately under that item's details, the exact tag:
[Download: <file name>]
Rules:
- Use ONLY the exact file names listed below, copied verbatim. Never invent, translate, or alter a file name.
- Add at most one [Download: ...] tag per listed item, and only when that item is backed by one of these documents.
- Do NOT list these documents together at the end — put each tag under its own item.
Available files:
${list}`;
}

function buildInsufficientEvidenceResponse(language = 'English', grounding = {}) {
  const externalHint = wantsExternalSearch(grounding.message || '')
    ? 'External web search is not connected in this workspace yet, so I cannot verify it from outside sources.'
    : 'Do you want me to search external sources if that feature is enabled?';
  const chartHint = grounding.chartRequested
    ? ' I also cannot create a reliable chart without usable source rows.'
    : '';

  if (language === 'Malay') {
    const searchLine = wantsExternalSearch(grounding.message || '')
      ? 'Carian web luaran belum disambungkan dalam workspace ini, jadi saya tak boleh sahkan daripada sumber luar.'
      : 'Nak saya cari daripada sumber luar jika fungsi itu diaktifkan?';
    return `Saya tak jumpa maklumat yang cukup dalam data yang tersedia sekarang.${chartHint ? ' Saya juga tak boleh bina carta yang boleh dipercayai tanpa data sumber yang cukup.' : ''}\n\n${searchLine}`;
  }

  return `I could not find enough information in the available data.${chartHint}\n\n${externalHint}`;
}

function buildGroundingInstruction(grounding) {
  if (!grounding?.requiresGrounding) return '';
  const evidence = grounding.evidenceTypes?.length ? grounding.evidenceTypes.join(', ') : 'none';
  return `\n\n## Grounding and source-of-truth rule:\nThis request requires grounded evidence. Allowed evidence available for this answer: ${evidence}.\nUse ONLY the evidence in the document context, SQL query results, extracted dataset, previous rendered artifact, or explicit user-provided conversation context. Do NOT use outside knowledge, training memory, invented facts, or assumptions. If the evidence does not contain the requested fact, say that the information is not available in the current data and ask whether the user wants an external search.`;
}

function evaluateGroundingGate({
  message = '',
  plan = {},
  chunks = [],
  sqlRows = [],
  chartArtifact = null,
  chartTool = null,
  fileId = null,
  dataSourceIntent = null,
  documentScoped = false,
  chartFollowUp = false,
  latestChartArtifact = null,
  history = [],
  broadSearch = false,
} = {}) {
  const chartRequested = Boolean(chartTool);
  const externalAllowed = wantsExternalSearch(message);
  const requiresGrounding = Boolean(
    fileId
    || dataSourceIntent
    || documentScoped
    || chartRequested
    || plan.needs_data_query
    || isLikelyFactualOrDataRequest(message)
  ) && !isLowRiskConversational(message);

  if (!requiresGrounding) {
    return { allow: true, requiresGrounding: false, evidenceTypes: [], externalAllowed, chartRequested, message };
  }

  const evidenceTypes = [];
  if (Array.isArray(sqlRows) && sqlRows.length > 0) evidenceTypes.push('sql');
  if (chartArtifact) evidenceTypes.push(chartArtifact.type === 'dashboard' ? 'dashboard_artifact' : 'chart_artifact');
  if (chartFollowUp && latestChartArtifact) evidenceTypes.push('previous_chart');

  const ragEvidence = hasUsableRagEvidence(message, chunks, { fileId, broadSearch });
  if (ragEvidence.ok && !dataSourceIntent?.suppressRagWhenSql) evidenceTypes.push('rag');

  const contextualFollowUp = /\b(more|continue|explain more|detail|lagi|lanjut|terangkan|jelaskan|why|kenapa)\b/i.test(message)
    && history.some(item => item.role === 'bot' && item.content);
  if (contextualFollowUp) evidenceTypes.push('conversation_context');

  let allow = evidenceTypes.length > 0;
  let reason = allow ? 'grounded' : 'insufficient_evidence';

  if (chartRequested && !chartArtifact && chartTool?.input_from !== 'previous_chart') {
    allow = false;
    reason = 'chart_requested_without_rows';
  }
  if (dataSourceIntent?.suppressRagWhenSql && (!Array.isArray(sqlRows) || sqlRows.length === 0)) {
    allow = false;
    reason = 'matched_sql_source_no_rows';
  }
  if (externalAllowed) {
    allow = false;
    reason = 'external_search_unavailable';
  }

  return {
    allow,
    reason,
    requiresGrounding,
    evidenceTypes,
    ragEvidence,
    externalAllowed,
    chartRequested,
    message,
  };
}

function extractChartDataPoints(option = {}) {
  const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
  const first = series[0] || {};
  if (Array.isArray(first.data) && first.data.some(point => point && typeof point === 'object' && point.name !== undefined)) {
    return first.data.map(point => ({ name: String(point.name), value: Number(point.value) || 0 }));
  }
  const xAxis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis;
  const labels = Array.isArray(xAxis?.data) ? xAxis.data : [];
  if (labels.length > 0 && Array.isArray(first.data)) {
    return labels.map((label, index) => ({ name: String(label), value: Number(first.data[index]) || 0 }));
  }
  return [];
}

function transformChartArtifact(previousArtifact, message = '', fallbackHint = 'auto') {
  const previousOption = previousArtifact?.option || previousArtifact?.charts?.find(chart => chart?.option)?.option;
  if (!previousOption || typeof previousOption !== 'object') return null;
  const hint = inferChartTypeHint(message, fallbackHint);
  if (hint === 'auto') return null;
  const points = extractChartDataPoints(previousOption);
  if (points.length === 0) return null;
  const previousTitle = typeof previousOption.title === 'string' ? previousOption.title : previousOption.title?.text || previousArtifact.title || 'Chart';
  let option;
  if (hint === 'pie') {
    option = {
      title: { text: previousTitle, left: 'center' },
      tooltip: { trigger: 'item' },
      legend: { orient: 'horizontal', bottom: 0 },
      series: [{
        name: 'Value',
        type: 'pie',
        radius: ['38%', '68%'],
        center: ['50%', '48%'],
        data: points,
        label: { formatter: '{b}: {d}%' },
      }],
    };
  } else if (hint === 'scatter') {
    option = {
      title: { text: previousTitle, left: 'center' },
      tooltip: { trigger: 'axis' },
      grid: { top: 70, left: 48, right: 24, bottom: 56, containLabel: true },
      xAxis: { type: 'category', data: points.map(point => point.name) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{
        name: 'Value',
        type: 'scatter',
        symbolSize: 14,
        data: points.map(point => point.value),
      }],
    };
  } else {
    option = {
      title: { text: previousTitle, left: 'center' },
      tooltip: { trigger: 'axis' },
      grid: { top: 70, left: 48, right: 24, bottom: 56, containLabel: true },
      xAxis: { type: 'category', data: points.map(point => point.name) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{
        name: 'Value',
        type: hint === 'line' ? 'line' : 'bar',
        data: points.map(point => point.value),
      }],
    };
  }
  const normalizedOption = normalizeChartOption(option);
  const metadata = {
    source: 'previous_chart',
    previousArtifactId: previousArtifact.id || null,
    chartTypeHint: hint,
    transformed: true,
  };
  if (inferVisualizationMode(message) === 'dashboard') {
    const table = points.map(point => ({
      label: point.name,
      value: point.value,
    }));
    const total = points.reduce((sum, point) => sum + Number(point.value || 0), 0);
    return makeDashboardArtifact({
      title: previousTitle,
      charts: [{ title: previousTitle, option: normalizedOption, size: 'large' }],
      kpis: [
        { label: 'Data points', value: points.length, detail: '' },
        { label: 'Total', value: total, detail: '' },
        { label: 'Top', value: points.sort((a, b) => Number(b.value) - Number(a.value))[0]?.name || '-', detail: points[0]?.value ?? '' },
      ],
      table,
      metadata,
    });
  }
  return makeEChartArtifact(normalizedOption, metadata);
}

function addToolCall(debug, name, { status = 'ok', input = {}, output = null, error = null, latencyMs = null } = {}) {
  if (!debug) return;
  if (!Array.isArray(debug.toolCalls)) debug.toolCalls = [];
  debug.toolCalls.push({
    name,
    status,
    input,
    output: summarizeToolOutput(output),
    error: error ? String(error).slice(0, 500) : null,
    latencyMs,
    at: new Date().toISOString(),
  });
}

function normalizeDataSourceKind(source = {}) {
  return source.kind || (source.managed ? 'dynamic' : 'fixed');
}

function buildDataSourceOrgFilter(organizationId) {
  if (!organizationId) return {};
  const id = organizationId?.toString?.() || organizationId;
  if (!ObjectId.isValid(id)) return { organizationIds: '__invalid_org__' };
  return { organizationIds: new ObjectId(id) };
}

async function loadAccessibleDataSources(db, organizationId = null) {
  if (!_mysqlPool) return [];
  const sources = await db.collection('data_sources')
    .find(buildDataSourceOrgFilter(organizationId))
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();
  return sources.map(source => ({
    ...source,
    kind: normalizeDataSourceKind(source),
    managed: Boolean(source.managed),
    columns: Array.isArray(source.columns) ? source.columns : [],
  }));
}

// Load data sources visible to a specific user, mirroring the Data Sources page
// access rules: developers see ALL sources; others see sources shared to their
// accessible organizations (or the selected org). This is org-independent so it
// also works for developer chats that carry no organizationId.
async function loadDataSourcesForUser(db, userId, organizationId = null) {
  if (!_mysqlPool) return [];
  let filter;
  const user = userId ? await db.collection('users').findOne({ _id: new ObjectId(userId) }) : null;
  const orgIdStr = organizationId?.toString?.() || organizationId;

  if (user?.role === 'developer') {
    filter = {}; // developer sees all data sources
  } else if (orgIdStr && ObjectId.isValid(orgIdStr)) {
    filter = { organizationIds: new ObjectId(orgIdStr) };
  } else {
    const orgIds = await getUserAccessibleOrgIds(db, userId);
    if (!orgIds.length) return [];
    filter = { organizationIds: { $in: orgIds.map(id => new ObjectId(id)) } };
  }

  const sources = await db.collection('data_sources')
    .find(filter)
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();
  return sources.map(source => ({
    ...source,
    kind: normalizeDataSourceKind(source),
    managed: Boolean(source.managed),
    columns: Array.isArray(source.columns) ? source.columns : [],
  }));
}

function formatColumnForPrompt(column = {}) {
  const label = column.label && column.label !== column.name ? ` label="${column.label}"` : '';
  const sourceKey = column.sourceKey && column.sourceKey !== column.name ? ` sourceKey="${column.sourceKey}"` : '';
  const description = column.description ? ` — ${column.description}` : '';
  return `  - ${column.name} (${column.type || 'string'})${label}${sourceKey}${description}`;
}

function formatDataSourceForPlanner(source = {}) {
  const kindLabel = source.kind === 'dynamic' ? 'Dynamic Ingested' : 'Fixed SQL';
  const sourceDetails = source.kind === 'dynamic'
    ? `, sourceApp: ${source.sourceApp || 'external'}, externalSourceId: ${source.externalSourceId || '-'}, lastSynced: ${source.lastIngestedAt ? new Date(source.lastIngestedAt).toISOString() : 'never'}`
    : '';
  const columnNames = source.columns.map(c => c.name).join(', ') || 'auto-detected on insert';
  return `- ${source.name} [${kindLabel}] (table: ${source.tableName}, columns: ${columnNames}${sourceDetails})`;
}

function formatDataSourceForSqlPrompt(source = {}) {
  const kindLabel = source.kind === 'dynamic' ? 'Dynamic Ingested' : 'Fixed SQL';
  const details = [
    `Type: ${kindLabel}`,
    `Name: ${source.name}`,
    `Description: ${source.description || source.name || ''}`,
  ];
  if (source.kind === 'dynamic') {
    details.push(`Source app: ${source.sourceApp || 'external'}`);
    details.push(`External source ID: ${source.externalSourceId || '-'}`);
    details.push(`Last synced: ${source.lastIngestedAt ? new Date(source.lastIngestedAt).toISOString() : 'never'}`);
    details.push('This table was dynamically ingested from an external app. Use it normally for SQL if it matches the user request.');
  }
  const cols = source.columns.map(formatColumnForPrompt).join('\n') || '  - Columns will be inferred from inserted records.';
  return `Table: ${source.tableName}\n${details.join('\n')}\nColumns:\n${cols}`;
}

function normalizeLookupText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCompletenessCriticalAggregateRequest(text = '') {
  const lower = normalizeLookupText(text);
  const asksAggregate = /\b(total|sum|count|number|registrations?|sales|volume|share|percentage|market share|breakdown|compare|comparison|forecast|jumlah|bilangan|pecahan|peratus)\b/.test(lower);
  const asksDimension = /\b(each|every|all|complete|dont miss|do not miss|missing|manufacturer|manufacturers|maker|makers|brand|brands|pengeluar|jenama|category|categories)\b/.test(lower);
  const asksPeriod = /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december|month|months|202\d)\b/.test(lower);
  return (asksAggregate && asksDimension) || (asksAggregate && asksPeriod && /\b(manufacturer|maker|brand|pengeluar|jenama)\b/.test(lower));
}

function isAggregateAnalysisRequest(text = '') {
  const lower = normalizeLookupText(text);
  return /\b(calculate|kira|total|sum|count|number of|registrations?|sales|volume|market share|percentage|share|breakdown|compare|comparison|forecast|table sorted|sort|rank|dominant|anomalies|trend|jumlah|bilangan|pecahan|peratus|banding)\b/.test(lower)
    && /\b(data|manufacturer|manufacturers|maker|makers|brand|brands|pengeluar|jenama|category|month|months|january|february|march|april|202\d|registration|registrations|sales|volume)\b/.test(lower);
}

function buildRagSearchText(message = '', history = []) {
  const recent = [...history]
    .reverse()
    .filter(item => item?.content && item.role !== 'bot')
    .slice(0, 2)
    .map(item => item.content)
    .reverse();
  const base = [...recent, message].filter(Boolean).join('\n');
  if (!isCompletenessCriticalAggregateRequest(base)) return base || message;
  return `${base}

Completeness-critical structured analysis. Retrieve all relevant rows/categories/manufacturers/brands/months from the source data. Include Honda, Modenas, Yamaha, SM Sport, WMoto, SYM, Benelli, Suzuki, Aveta, Kawasaki and any other available makers if present.`;
}

function sourceLookupCandidates(source = {}) {
  return [
    source.name,
    source.description,
    source.tableName,
    source.externalSourceId,
  ].filter(Boolean).map(normalizeLookupText).filter(Boolean);
}

function hasStructuredRecordLanguage(message = '') {
  const lower = normalizeLookupText(message);
  return /\b(data|survey|respond|response|responses|submission|submissions|record|records|row|rows|feedback|review|table|jadual|borang|jawapan|respon|maklum balas|latest|recent|last|one|satu|show|list|give|cari|tunjuk|papar)\b/i.test(lower);
}

function isDocumentScopedRequest(message = '') {
  const lower = normalizeLookupText(message);
  const mentionsDocument = /\b(document|documents|doc|docs|file|files|pdf|manual|uploaded|upload|knowledge base|rag|vector|chunk|dokumen|fail|dalam dokumen|dalam file|dalam fail)\b/i.test(lower);
  const mentionsSql = /\b(sql|mysql|database|data source|datasource|structured data|ingested data|sumber data)\b/i.test(lower);
  return mentionsDocument && !mentionsSql;
}

function scoreDataSourceMatch(message = '', source = {}) {
  const normalizedMessage = normalizeLookupText(message);
  if (!normalizedMessage) return 0;
  const primaryName = normalizeLookupText(source.name || '');
  let score = 0;

  if (primaryName && normalizedMessage.includes(primaryName)) score = Math.max(score, 120);

  for (const candidate of sourceLookupCandidates(source)) {
    if (candidate.length >= 4 && normalizedMessage.includes(candidate)) {
      score = Math.max(score, candidate === primaryName ? 120 : 95);
    }
  }

  const nameTokens = primaryName.split(' ').filter(token => token.length > 2);
  if (nameTokens.length > 0) {
    const matched = nameTokens.filter(token => normalizedMessage.includes(token)).length;
    const coverage = matched / nameTokens.length;
    if (coverage >= 0.8) score = Math.max(score, 90);
    else if (coverage >= 0.6) score = Math.max(score, 72);
    else if (matched >= 2 && hasStructuredRecordLanguage(message)) score = Math.max(score, 65);
  }

  return score;
}

function resolveDataSourceIntent(message = '', sources = []) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const ranked = sources
    .map(source => ({ source, score: scoreDataSourceMatch(message, source) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top) return null;

  const recordLanguage = hasStructuredRecordLanguage(message);
  const confident = top.score >= 90 || (top.score >= 65 && recordLanguage);
  if (!confident) return null;

  // A single uploaded spreadsheet can become several data sources (one per
  // sheet). When the matched source came from a file, include all sibling
  // sheets so the SQL step can pick the table that actually holds the answer.
  let intentSources = [top.source];
  if (top.source.sourceFileId) {
    const fid = String(top.source.sourceFileId);
    const siblings = sources.filter(s => s.sourceFileId && String(s.sourceFileId) === fid);
    if (siblings.length > 1) intentSources = siblings;
  }
  const multi = intentSources.length > 1;
  const baseName = (top.source.name || '').split(' — ')[0];

  const query = [
    multi
      ? `Use only the structured data source(s) derived from file "${baseName}". Available tables: ${intentSources.map(s => s.tableName).join(', ')}. Pick the table whose columns best answer the request.`
      : `Use the matched structured data source "${top.source.name}" only.`,
    multi ? '' : `MySQL table: ${top.source.tableName}.`,
    `User request: ${message}`,
    recordLanguage ? 'The user appears to be asking for records/data from this source. Prefer raw rows unless aggregation is explicitly requested.' : '',
  ].filter(Boolean).join('\n');

  return {
    source: top.source,
    sources: intentSources,
    score: top.score,
    query,
    suppressRagWhenSql: true,
  };
}

function applyDataSourceIntentToPlan(plan, dataSourceIntent, message = '') {
  if (!dataSourceIntent?.source) return plan;
  const next = {
    ...plan,
    data_query_context: dataSourceIntent.query || plan.data_query_context || message,
    tools: Array.isArray(plan.tools) ? [...plan.tools] : [],
  };
  next.tools = next.tools
    .filter(tool => tool.name !== 'sql_query' && tool.name !== 'rag_extract_dataset')
    .map(tool => (
      tool.name === 'chart_generate' && tool.input_from !== 'previous_chart'
        ? { ...tool, input_from: 'sql_query', reason: tool.reason || `Chart from matched data source: ${dataSourceIntent.source.name}` }
        : tool
    ));
  next.tools.push({
    name: 'sql_query',
    query: dataSourceIntent.query || message,
    reason: `Matched data source: ${dataSourceIntent.source.name}`,
  });
  next.needs_data_query = true;
  next.needs_chart = next.tools.some(tool => tool.name === 'chart_generate');
  return next;
}

function applyDocumentIntentToPlan(plan, message = '', { needsChart = false } = {}) {
  const next = {
    ...plan,
    tools: Array.isArray(plan.tools) ? [...plan.tools] : [],
  };
  next.tools = next.tools.filter(tool => tool.name !== 'sql_query');
  if (!next.tools.some(tool => tool.name === 'rag_search')) {
    next.tools.unshift({ name: 'rag_search', query: message, reason: 'Document-scoped request' });
  }
  if (needsChart) {
    next.tools = next.tools
      .filter(tool => tool.name !== 'chart_generate' && tool.name !== 'rag_extract_dataset')
      .concat([
        { name: 'rag_extract_dataset', query: message, input_from: 'rag_search', reason: 'Chart requested from document/RAG data' },
        { name: 'chart_generate', query: message, input_from: 'rag_extract_dataset', reason: 'Chart from document/RAG data' },
      ]);
  } else {
    next.tools = next.tools.filter(tool => tool.name !== 'rag_extract_dataset');
  }
  next.needs_data_query = false;
  next.needs_chart = next.tools.some(tool => tool.name === 'chart_generate');
  return next;
}

function normalizeToolName(name = '') {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function normalizeToolPlan(parsed = {}, fallback = {}, { chartModeOn = false, dataSourcesAvailable = false, message = '', hasPreviousChart = false, chartFollowUp = false, preferPreviousChart = false, tableOnly = false } = {}) {
  const chartCapabilityQuestion = !chartModeOn && !chartFollowUp && isChartCapabilityQuestion(message);
  const plan = {
    language: parsed.language || fallback.language || 'English',
    chart_type_hint: parsed.chart_type_hint || fallback.chart_type_hint || 'auto',
    data_query_context: parsed.data_query_context || fallback.data_query_context || message,
    tools: [],
  };

  const allowed = new Set(['rag_search', 'sql_query', 'rag_extract_dataset', 'chart_generate']);
  const rawTools = Array.isArray(parsed.tools) ? parsed.tools : [];
  for (const tool of rawTools) {
    const name = normalizeToolName(tool?.name);
    if (!allowed.has(name)) continue;
    if ((chartFollowUp || preferPreviousChart) && hasPreviousChart && (name === 'sql_query' || name === 'rag_extract_dataset')) continue;
    if (chartCapabilityQuestion && (name === 'chart_generate' || name === 'rag_extract_dataset' || name === 'sql_query')) continue;
    if (tableOnly && (name === 'chart_generate' || name === 'rag_extract_dataset')) continue;
    if (name === 'sql_query' && !dataSourcesAvailable) continue;
    plan.tools.push({
      name,
      query: tool.query || tool.context || plan.data_query_context || message,
      input_from: preferPreviousChart && name === 'chart_generate' ? 'previous_chart' : tool.input_from || tool.inputFrom || undefined,
      reason: tool.reason || undefined,
    });
  }

  if (!plan.tools.some(tool => tool.name === 'rag_search')) {
    plan.tools.unshift({ name: 'rag_search', query: message, reason: 'Default context retrieval' });
  }

  const oldNeedsDataQuery = parsed.needs_data_query === true || fallback.needs_data_query === true;
  const oldNeedsChart = !chartCapabilityQuestion && !tableOnly && (parsed.needs_chart === true || fallback.needs_chart === true || chartModeOn);
  if ((chartFollowUp || preferPreviousChart) && hasPreviousChart) {
    const existingChartTool = plan.tools.find(tool => tool.name === 'chart_generate');
    if (existingChartTool) existingChartTool.input_from = 'previous_chart';
    else plan.tools.push({ name: 'chart_generate', query: message, input_from: 'previous_chart', reason: 'Modify previous rendered chart' });
  }
  if (oldNeedsDataQuery && dataSourcesAvailable && !plan.tools.some(tool => tool.name === 'sql_query')) {
    plan.tools.push({ name: 'sql_query', query: plan.data_query_context || message, reason: 'Structured data requested' });
  }
  if (oldNeedsChart && !plan.tools.some(tool => tool.name === 'chart_generate')) {
    if ((chartFollowUp || preferPreviousChart) && hasPreviousChart) {
      plan.tools.push({ name: 'chart_generate', query: message, input_from: 'previous_chart', reason: 'Modify previous rendered chart' });
      plan.needs_data_query = plan.tools.some(tool => tool.name === 'sql_query');
      plan.needs_chart = true;
      return plan;
    }
    const hasSql = plan.tools.some(tool => tool.name === 'sql_query');
    if (!hasSql && !plan.tools.some(tool => tool.name === 'rag_extract_dataset')) {
      plan.tools.push({ name: 'rag_extract_dataset', query: message, input_from: 'rag_search', reason: 'Chart needs structured rows from documents' });
    }
    plan.tools.push({ name: 'chart_generate', query: message, input_from: hasSql ? 'sql_query' : 'rag_extract_dataset', reason: 'User requested visualization' });
  }

  plan.needs_data_query = plan.tools.some(tool => tool.name === 'sql_query');
  plan.needs_chart = plan.tools.some(tool => tool.name === 'chart_generate');
  return plan;
}

function getPlannedTool(plan, name) {
  return (plan.tools || []).find(tool => tool.name === name) || null;
}

function rowsToTableString(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = Object.keys(rows[0] || {});
  return headers.join(' | ') + '\n' + rows.map(r => headers.map(h => r[h] ?? '').join(' | ')).join('\n');
}

function parseMarkdownTablesFromChunks(chunks = []) {
  const rows = [];
  for (const chunk of chunks) {
    const lines = String(chunk.content || '').split('\n').map(line => line.trim()).filter(Boolean);
    for (let i = 0; i < lines.length - 1; i += 1) {
      const headerLine = lines[i];
      const separatorLine = lines[i + 1];
      if (!headerLine.includes('|') || !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(separatorLine)) continue;
      const headers = headerLine.split('|').map(cell => cell.trim()).filter(Boolean);
      if (headers.length < 2) continue;
      for (let j = i + 2; j < lines.length; j += 1) {
        const rowLine = lines[j];
        if (!rowLine.includes('|')) break;
        const cells = rowLine.split('|').map(cell => cell.trim()).filter(Boolean);
        if (cells.length !== headers.length) break;
        const row = {};
        headers.forEach((header, index) => { row[header] = cells[index]; });
        rows.push(row);
        if (rows.length >= 100) return rows;
      }
    }
  }
  return rows;
}

function parseDelimitedLine(line = '', delimiter = ',') {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function looksLikeHeader(cells = []) {
  const nonEmpty = cells.filter(Boolean);
  if (nonEmpty.length < 2) return false;
  const textish = nonEmpty.filter(cell => /[a-zA-Z_ ]/.test(cell) && Number.isNaN(Number(cell))).length;
  return textish >= Math.ceil(nonEmpty.length / 2);
}

function parseDelimitedTablesFromChunks(chunks = []) {
  const rows = [];
  for (const chunk of chunks) {
    const lines = String(chunk.content || '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !/^\[?source\s+\d+/i.test(line));
    if (lines.length < 2) continue;

    const delimiter = [',', '\t', ';'].find(candidate => (
      lines[0].split(candidate).length >= 2 && lines[1].split(candidate).length >= 2
    ));
    if (!delimiter) continue;

    const headers = parseDelimitedLine(lines[0], delimiter).map(header => normalizeLookupText(header).replace(/\s+/g, '_'));
    if (!looksLikeHeader(headers)) continue;
    for (const line of lines.slice(1)) {
      const cells = parseDelimitedLine(line, delimiter);
      if (cells.length < Math.min(headers.length, 2)) continue;
      const row = {};
      headers.forEach((header, index) => {
        if (header) row[header] = cells[index] ?? '';
      });
      if (Object.values(row).some(value => normalizeCellValue(value))) rows.push(row);
      if (rows.length >= 1000) return rows;
    }
  }
  return rows;
}

function dedupeRows(rows = []) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const normalized = Object.entries(row)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${normalizeLookupText(key)}=${normalizeLookupText(value)}`)
      .join('|');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(row);
  }
  return deduped;
}

async function extractRowsFromRagForChart(db, chunks, message, settings, debug, notify = null) {
  const t = Date.now();
  notify?.('Extracting chart data...');
  const completenessCritical = isCompletenessCriticalAggregateRequest(message);
  const tableRows = parseMarkdownTablesFromChunks(chunks);
  const delimitedRows = parseDelimitedTablesFromChunks(chunks);
  const parsedRows = dedupeRows([...tableRows, ...delimitedRows]);
  if (parsedRows.length > 0) {
    addToolCall(debug, 'rag_extract_dataset', {
      input: { chunks: chunks.length, method: 'parsed_tables', markdownRows: tableRows.length, delimitedRows: delimitedRows.length, completenessCritical },
      output: { rows: parsedRows },
      latencyMs: Date.now() - t,
    });
    return { rows: parsedRows, source: 'rag', method: 'parsed_tables' };
  }

  const chunkLimit = completenessCritical ? 30 : 8;
  const charLimit = completenessCritical ? 2200 : 1200;
  const rowLimit = completenessCritical ? 250 : 50;
  const relevantText = chunks.slice(0, chunkLimit).map((chunk, i) => (
    `[Chunk ${i + 1}: ${chunk.file_name || 'unknown'} p.${chunk.page_number || 0}]\n${String(chunk.content || '').slice(0, charLimit)}`
  )).join('\n\n');

  if (relevantText) {
    try {
      const extractionPrompt = `Extract structured rows that can support the requested chart.
User request: "${message}"

Context:
${relevantText}

Return ONLY valid JSON in this shape:
{"rows":[{"label":"...", "value": 1}]}

Rules:
- If there is a table/list in context, preserve meaningful columns as row keys.
- For all/each/every manufacturer, maker, brand, category, or month requests, extract EVERY matching row visible in context. Do not return only top rows.
- Merge rows across all chunks. Do not omit a brand/manufacturer just because another brand has a larger value.
- If the request is sentiment/feedback analysis, rows may be {"message":"..."} objects.
- Use only information present in context.
- Return at most ${rowLimit} rows.
- If no chartable data exists, return {"rows":[]}.`;
      const raw = await callLLM([{ role: 'user', content: extractionPrompt }], settings, db, 'rag_extract_dataset');
      const parsed = JSON.parse(extractBalancedJson(raw) || '{"rows":[]}');
      const rows = Array.isArray(parsed.rows) ? dedupeRows(parsed.rows.filter(row => row && typeof row === 'object')).slice(0, rowLimit) : [];
      if (rows.length > 0) {
        addToolCall(debug, 'rag_extract_dataset', {
          input: { chunks: chunks.length, method: 'llm_extract' },
          output: { rows },
          latencyMs: Date.now() - t,
        });
        return { rows, source: 'rag', method: 'llm_extract' };
      }
    } catch (e) {
      addToolCall(debug, 'rag_extract_dataset', {
        status: 'error',
        input: { chunks: chunks.length, method: 'llm_extract' },
        error: e.message,
        latencyMs: Date.now() - t,
      });
    }
  }

  if (chunks.length > 0 && /sentiment|positive|negative|neutral|positif|negatif|survey|feedback|respond|response|review|kepuasan/i.test(message)) {
    const rows = chunks.slice(0, 50).map((chunk, i) => ({
      source: chunk.file_name || `Chunk ${i + 1}`,
      message: String(chunk.content || '').slice(0, 1000),
    }));
    addToolCall(debug, 'rag_extract_dataset', {
      input: { chunks: chunks.length, method: 'chunk_text' },
      output: { rows },
      latencyMs: Date.now() - t,
    });
    return { rows, source: 'rag', method: 'chunk_text' };
  }

  addToolCall(debug, 'rag_extract_dataset', {
    status: 'skipped',
    input: { chunks: chunks.length },
    output: { reason: 'No chartable RAG rows found' },
    latencyMs: Date.now() - t,
  });
  return null;
}

async function generateChartArtifactFromRows({ db, rows, message, hint = 'auto', settings, debug, source = 'unknown', notify = null }) {
  const t = Date.now();
  if (!Array.isArray(rows) || rows.length === 0) {
    addToolCall(debug, 'chart_generate', { status: 'skipped', input: { source, rows: 0, hint }, output: { reason: 'No rows' } });
    return null;
  }

  notify?.('Generating chart...');
  const tableStr = rowsToTableString(rows);
  let chartOption = null;
  let usedFallback = false;
  let analysis = null;
  const chartModel = settings.chartModel || 'gemini-2.5-flash';
  const apiKey = settings[`chatLlmApiKey_gemini`] || settings.chatLlmApiKey || settings.chatEmbeddingApiKey;
  const chartPrompt = `Generate a valid ECharts option JSON object for this data.
DATA:\n${tableStr}
USER REQUEST: "${message}"
CHART TYPE: ${hint}
DATA SOURCE: ${source}
Rules: Use ECharts format. Required: title.text, tooltip:{}, series:[]. For pie: series[0].type="pie", series[0].data=[{value:N,name:"X"},...]. For bar: xAxis.data=[], yAxis:{}, series[0].type="bar", series[0].data=[]. Use actual data from DATA above. Return ONLY the JSON object with no markdown.`;

  const deterministicOption = buildFallbackChartOption(rows, message, hint);
  if (hint === 'scatter') {
    chartOption = buildScatterOptionFromRows(rows, message, source);
    if (chartOption) {
      usedFallback = true;
      analysis = {
        operation: 'scatter',
        source,
        totalRows: rows.length,
        title: chartOption.title?.text || 'Scatter Plot',
        chartType: 'scatter',
        table: [],
        echartsOption: chartOption,
      };
      debug.analysisGenerated = true;
      addToolCall(debug, 'analysis_tool', {
        input: { source, rows: rows.length, message, hint },
        output: analysis,
        latencyMs: Date.now() - t,
      });
    } else {
      addToolCall(debug, 'analysis_tool', {
        status: 'skipped',
        input: { source, rows: rows.length, message, hint },
        output: { reason: 'Scatter chart requires at least one numeric value column, preferably two numeric columns.' },
        latencyMs: Date.now() - t,
      });
      return null;
    }
  }
  analysis = analysis || runAnalysisTool(rows, message, hint, source);
  if (!chartOption && analysis?.echartsOption) {
    chartOption = analysis.echartsOption;
    usedFallback = true;
    debug.analysisGenerated = true;
    addToolCall(debug, 'analysis_tool', {
      input: { source, rows: rows.length, message, hint },
      output: analysis,
      latencyMs: Date.now() - t,
    });
  } else if (deterministicOption && isSentimentRequest(message)) {
    chartOption = normalizeChartOption(deterministicOption);
    usedFallback = true;
    addToolCall(debug, 'analysis_tool', {
      status: 'skipped',
      input: { source, rows: rows.length, message, hint },
      output: { reason: 'No deterministic analysis; used sentiment fallback chart' },
      latencyMs: Date.now() - t,
    });
  }

  if (!chartOption && apiKey) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${chartModel}:generateContent?key=${apiKey}`,
        {
          contents: [{ role: 'user', parts: [{ text: chartPrompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        },
        { timeout: 30000 }
      );
      const raw = res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = parseChartOption(raw);
      if (!parsed) throw new Error('Chart model did not return a valid ECharts option');
      chartOption = normalizeChartOption(parsed);
      if (db) logAiCall(db, 'gemini', chartModel, 'chat', 'chart_gen', 0);
    } catch (e) {
      debug.chartError = e.message;
    }
  } else {
    debug.chartError = 'Missing Gemini API key for chart model';
  }

  if (!chartOption) {
    const fallbackOption = deterministicOption || buildFallbackChartOption(rows, message, hint);
    if (fallbackOption) {
      chartOption = normalizeChartOption(fallbackOption);
      usedFallback = true;
    }
  }

  if (!chartOption) {
    addToolCall(debug, 'chart_generate', {
      status: 'error',
      input: { source, rows: rows.length, hint },
      error: debug.chartError || 'Unable to build chart option',
      latencyMs: Date.now() - t,
    });
    return null;
  }

  const artifact = makeEChartArtifact(chartOption, { source, chartTypeHint: hint, fallback: usedFallback, analysis });
  debug.chartGenerated = true;
  debug.chartFallback = usedFallback;
  addToolCall(debug, 'chart_generate', {
    input: { source, rows: rows.length, hint },
    output: artifact,
    latencyMs: Date.now() - t,
  });
  return artifact;
}

async function generateDashboardArtifactFromRows({ rows, message, hint = 'auto', debug, source = 'unknown', notify = null }) {
  const t = Date.now();
  if (!Array.isArray(rows) || rows.length === 0) {
    addToolCall(debug, 'dashboard_generate', { status: 'skipped', input: { source, rows: 0, hint }, output: { reason: 'No rows' } });
    return null;
  }

  notify?.('Generating dashboard...');
  const analysis = runAnalysisTool(rows, message, hint === 'auto' ? 'bar' : hint, source);
  if (!analysis?.echartsOption) {
    addToolCall(debug, 'dashboard_generate', {
      status: 'skipped',
      input: { source, rows: rows.length, hint },
      output: { reason: 'No deterministic analysis available' },
      latencyMs: Date.now() - t,
    });
    return null;
  }

  const charts = [
    { title: analysis.title, option: analysis.echartsOption, size: 'large' },
  ];
  const shareOption = buildSharePieOption(analysis);
  if (shareOption) charts.push({ title: 'Share', option: shareOption, size: 'medium' });
  const trendOption = buildTrendOption(rows, message, source);
  if (trendOption) charts.push({ title: 'Trend', option: trendOption, size: 'medium' });

  const kpis = [
    { label: 'Rows analyzed', value: analysis.totalRows },
    { label: analysis.valueLabel || 'Total', value: Number(analysis.totalValue.toFixed?.(2) ?? analysis.totalValue) },
  ];
  if (analysis.summaryStats?.highest) {
    kpis.push({ label: 'Top', value: analysis.summaryStats.highest.label, detail: analysis.summaryStats.highest.value });
  }

  const artifact = makeDashboardArtifact({
    title: analysis.title || 'Analysis Dashboard',
    charts,
    kpis,
    table: analysis.table,
    metadata: { source, chartTypeHint: hint, analysis, visualizationMode: 'dashboard' },
  });
  if (!artifact) return null;

  debug.dashboardGenerated = true;
  addToolCall(debug, 'dashboard_generate', {
    input: { source, rows: rows.length, hint, charts: charts.length },
    output: { type: artifact.type, title: artifact.title, charts: artifact.charts.length },
    latencyMs: Date.now() - t,
  });
  addToolCall(debug, 'analysis_tool', {
    input: { source, rows: rows.length, message, hint, mode: 'dashboard' },
    output: analysis,
    latencyMs: Date.now() - t,
  });
  return artifact;
}

async function runDeterministicAnalysisForRequest({ db, chunks = [], sqlRows = [], message = '', settings = {}, debug, notify = null }) {
  if (!isAggregateAnalysisRequest(message)) return null;
  const t = Date.now();
  let rows = Array.isArray(sqlRows) && sqlRows.length > 0 ? sqlRows : [];
  let source = rows.length > 0 ? 'sql' : 'rag';

  if (rows.length === 0) {
    const ragDataset = await extractRowsFromRagForChart(db, chunks, message, settings, debug, notify);
    rows = ragDataset?.rows || [];
    source = ragDataset?.source || 'rag';
  }

  if (rows.length === 0) {
    addToolCall(debug, 'analysis_tool', {
      status: 'skipped',
      input: { source, rows: 0, message, mode: 'answer' },
      output: { reason: 'No structured rows available for deterministic analysis' },
      latencyMs: Date.now() - t,
    });
    return null;
  }

  const analysis = runAnalysisTool(rows, message, 'bar', source);
  if (!analysis) {
    addToolCall(debug, 'analysis_tool', {
      status: 'skipped',
      input: { source, rows: rows.length, message, mode: 'answer' },
      output: { reason: 'Unable to infer deterministic aggregate analysis' },
      latencyMs: Date.now() - t,
    });
    return null;
  }

  addToolCall(debug, 'analysis_tool', {
    input: { source, rows: rows.length, message, mode: 'answer' },
    output: analysis,
    latencyMs: Date.now() - t,
  });
  return { analysis, rows, source };
}

// ── Value-aware SQL helpers (#1 value grounding, #2 relaxed fallback) ──

// Pick a few text/label-ish columns from a data source to ground/relax on.
function pickTextColumns(source = {}) {
  const cols = Array.isArray(source.columns) ? source.columns : [];
  const isTexty = (c) => {
    const type = String(c.type || 'string').toLowerCase();
    return type.includes('string') || type.includes('text') || type.includes('char') || type === 'enum' || type === '';
  };
  const texty = cols.filter(isTexty).map(c => c.name).filter(Boolean);
  const labelRe = /(model|name|title|label|categor|brand|maker|make|type|code|product|item|company|state|colou?r|status|position|city|country|region)/i;
  const preferred = texty.filter(n => labelRe.test(n));
  return (preferred.length ? preferred : texty).slice(0, 4);
}

// #1: Build a compact "known existing values" block for small/reference tables
// so the LLM filters on real values instead of the user's approximate term.
async function buildKnownValuesBlock(sources = []) {
  if (!_mysqlPool) return '';
  const lines = [];
  for (const src of sources.slice(0, 4)) {
    if (!src.tableName) continue;
    let count = null;
    try {
      const [cnt] = await _mysqlPool.query({ sql: `SELECT COUNT(*) AS c FROM \`${src.tableName}\``, timeout: 3000 });
      count = cnt?.[0]?.c;
    } catch { continue; }
    if (count == null || count > 50000) continue; // skip only very large tables (protect DISTINCT-scan latency); low-cardinality columns are still gated per-column below
    for (const col of pickTextColumns(src)) {
      try {
        const [vals] = await _mysqlPool.query({
          sql: `SELECT DISTINCT \`${col}\` AS v FROM \`${src.tableName}\` WHERE \`${col}\` IS NOT NULL AND \`${col}\` <> '' LIMIT 41`,
          timeout: 3000,
        });
        const list = vals.map(r => r.v).filter(v => v != null && String(v).length <= 80);
        if (list.length > 0 && list.length <= 40) {
          lines.push(`- ${src.tableName}.${col}: ${list.map(v => `"${String(v).replace(/"/g, '')}"`).join(', ')}`);
        }
      } catch {}
    }
  }
  if (!lines.length) return '';
  return `\n\nKnown existing values (use these EXACT values when filtering; if the user's term is not in the list, pick the closest existing value and note that the exact term may not exist):\n${lines.join('\n')}`;
}

// Extract meaningful lookup tokens (keeps model codes like "Y16ZR", "V3").
function entityTokens(message = '') {
  const stop = new Set(['the','and','for','about','tell','give','show','what','which','list','based','file','from','with','please','are','of','in','on','to','me','about','information','info','detail','details','specs','spec','specification','specifications']);
  return [...new Set(String(message)
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t && !stop.has(t.toLowerCase()))
    .filter(t => t.length >= 3 || /\d/.test(t)))];
}

// #2: When the primary query returns 0 rows, retry with a relaxed OR-match of the
// strongest tokens across candidate text columns, so we surface closest records.
async function relaxedValueLookup(sources = [], message = '') {
  if (!_mysqlPool) return null;
  const tokens = entityTokens(message);
  if (!tokens.length) return null;
  // Prefer the most specific identifier tokens (letters+digits, longer first) and
  // drop short version suffixes like "V2"/"V3" that would match unrelated models.
  const codeTokens = tokens.filter(t => /[A-Za-z]/.test(t) && /\d/.test(t)).sort((a, b) => b.length - a.length);
  const strongCodes = codeTokens.filter(t => t.length >= 4);
  const searchTokens = (strongCodes.length ? strongCodes : (codeTokens.length ? codeTokens : tokens)).slice(0, 3);
  for (const src of sources.slice(0, 4)) {
    if (!src.tableName) continue;
    const cols = pickTextColumns(src);
    if (!cols.length) continue;
    const conds = [];
    const params = [];
    for (const col of cols) {
      for (const tok of searchTokens) {
        conds.push(`LOWER(\`${col}\`) LIKE LOWER(?)`);
        params.push(`%${tok}%`);
      }
    }
    if (!conds.length) continue;
    const sql = `SELECT * FROM \`${src.tableName}\` WHERE ${conds.join(' OR ')} LIMIT 25`;
    try {
      const [rows] = await _mysqlPool.query({ sql, values: params, timeout: 5000 });
      if (Array.isArray(rows) && rows.length > 0) {
        return { sql, rows, rowCount: rows.length, tables: [src.name], matchedSource: src.name, relaxed: true, searchedTerms: searchTokens };
      }
    } catch {}
  }
  return null;
}

// Text-to-SQL: check if question can be answered from data sources
async function tryDataSourceQuery(db, message, settings, organizationId, forceQuery = false, options = {}) {
  if (!_mysqlPool) return null;
  try {
    // Get fixed and dynamic data sources accessible to this org.
    const allSources = options.userId
      ? await loadDataSourcesForUser(db, options.userId, organizationId)
      : await loadAccessibleDataSources(db, organizationId);
    const optionSources = Array.isArray(options.sources) ? options.sources.filter(Boolean) : [];
    const sources = optionSources.length > 0 ? optionSources : allSources;
    if (sources.length === 0) return null;

    // Build schema description for LLM
    const schemaDesc = sources.map(formatDataSourceForSqlPrompt).join('\n\n');
    // #1: ground the LLM on actual stored values for small/reference tables.
    const knownValuesBlock = await buildKnownValuesBlock(sources);
    const matchedSourceRule = optionSources.length > 0
      ? `\nThe user explicitly matched these data source(s): ${sources.map(s => `"${s.name}"`).join(', ')}. Use ONLY these table(s). Do not use other tables.`
      : '';

    // Value-matching guidance: user-typed text values often differ slightly from
    // the stored values (suffixes, versions, spacing), so filter with partial,
    // case-insensitive LIKE rather than exact equality.
    const valueMatchingRule = `\n\nValue matching rules:\n- For text/string filters on values the user mentions (names, models, codes, categories, brands, makers), use case-insensitive partial matching, e.g. WHERE LOWER(\`col\`) LIKE LOWER('%value%'). Do NOT use exact "=" for these, because stored values often include suffixes or variations (e.g. the user says "Y16ZR" but the stored row is "Y16ZR V2").\n- Use exact "=" only for numeric IDs, dates, or clear enumerations where the user gives the precise value.\n- When several tables are provided, choose the one whose columns best fit the request; ignore tables that clearly do not contain the requested fields.`;

    let cleaned;
    if (forceQuery) {
      // Chart mode: force LLM to generate SQL, never return NO_SQL
      const forcePrompt = `You have access to these MySQL tables:\n\n${schemaDesc}${matchedSourceRule}${valueMatchingRule}${knownValuesBlock}\n\nUser wants data from the structured source. Their exact request: "${message}"\n\nGenerate a SQL SELECT query to get the most relevant data for answering the exact request and creating a chart if needed. Always return a valid SELECT query, never say NO_SQL.\n\nRules:\n- If the user asks for one/a single/satu response, respondent, feedback, review, record, or row, return one raw row with useful columns and LIMIT 1.\n- If the user asks for recent/latest/last N responses, respondent text, comments, feedback, reviews, sentiment, positive/negative/neutral, or "respond", retrieve raw response/comment/message/answer/text fields plus submitted/created date fields. Do NOT aggregate by date first.\n- If the user asks to categorize positive/negative sentiment, raw text rows are more important than counts.\n- If the user asks for totals, trends, counts, or submissions over time, aggregate appropriately.\n- Use ORDER BY submitted/created/updated date DESC and LIMIT the requested N when the user asks for recent/latest/last N rows.\n- Prefer meaningful column aliases like message, response, submitted_at, rating, category.`;
      const sqlResult = await callLLM([{ role: 'user', content: forcePrompt }], { ...settings, chatLlmModel: settings.chatLlmModel || 'gemini-2.5-flash' }, db, 'text_to_sql');
      cleaned = cleanSqlResponse(sqlResult);
      // Fallback: if still not SELECT, just get all from first table
      if (!/^\s*SELECT\s/i.test(cleaned)) cleaned = `SELECT * FROM \`${sources[0].tableName}\` LIMIT 100`;
    } else {
      // Normal: Ask LLM if this question needs SQL
      const routerPrompt = `You have access to these MySQL tables:\n\n${schemaDesc}${matchedSourceRule}${valueMatchingRule}${knownValuesBlock}\n\nUser question: "${message}"\n\nIf this question can be answered by querying the tables above, respond with ONLY the SQL SELECT query (no explanation, no markdown). If the question is NOT about this data, respond with exactly "NO_SQL".`;
      const sqlResult = await callLLM([{ role: 'user', content: routerPrompt }], { ...settings, chatLlmModel: settings.chatLlmModel || 'gemini-2.5-flash' }, db, 'text_to_sql');
      cleaned = cleanSqlResponse(sqlResult);
      if (cleaned === 'NO_SQL' || !cleaned.toUpperCase().startsWith('SELECT')) return null;
    }

    // Safety: only SELECT allowed
    if (!/^\s*SELECT\s/i.test(cleaned)) return null;

    // Execute with timeout and limit
    const [rows] = await _mysqlPool.query({ sql: cleaned + (cleaned.toLowerCase().includes('limit') ? '' : ' LIMIT 100'), timeout: 5000 });
    if (Array.isArray(rows) && rows.length > 0) {
      return { sql: cleaned, rows, rowCount: rows.length, tables: sources.map(s => s.name), matchedSource: optionSources[0]?.name || null };
    }

    // #2: primary query found nothing — retry with a relaxed token match so we can
    // surface the closest available records instead of a dead-end answer.
    const relaxed = await relaxedValueLookup(sources, message);
    if (relaxed) return relaxed;
    return null;
  } catch (e) {
    return null;
  }
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

// ─── Org identity + inherited prompt ───────────────────────────
// Auto-derived "who this bot works for" line from the org hierarchy path, so
// the bot always knows its organization/department without anyone typing it.
function buildOrgIdentityLine(org) {
  const path = Array.isArray(org?.path) && org.path.length ? org.path : (org?.name ? [org.name] : []);
  if (!path.length) return '';
  return `You are the AI assistant working for: ${path.join(' › ')}. Always respond as the assistant of this organization/department and use its knowledge base. This organization identity overrides any other identity mentioned below.`;
}

// Nearest custom instructions walking UP the hierarchy (department → parent org),
// mirroring how packages inherit. Returns '' if none in the chain.
async function resolveInheritedOrgPrompt(db, org) {
  let current = org;
  let guard = 0;
  while (current && guard < 20) {
    guard += 1;
    if (typeof current.systemPrompt === 'string' && current.systemPrompt.trim()) {
      return current.systemPrompt.trim();
    }
    if (!current.parentId) break;
    current = await db.collection('organizations').findOne({ _id: new ObjectId(current.parentId) });
  }
  return '';
}

// ─── Org Hierarchy Filter ──────────────────────────────────────
export async function getUserAccessibleOrgIds(db, userId) {  const assignments = await db.collection('user_organization_assignments')
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

// ─── Stream LLM ────────────────────────────────────────────────
export async function streamLLM(messages, settings, onToken, db = null, source = 'chat') {
  const provider = settings.chatLlmProvider;
  const model = settings.chatLlmModel;
  const apiKey = settings[`chatLlmApiKey_${provider}`] || settings.chatLlmApiKey;
  if (!provider) throw new Error('Chat LLM Provider not configured. Go to Settings → Chat → LLM.');
  if (!model) throw new Error('Chat LLM Model not configured. Go to Settings → Chat → LLM.');
  if (!apiKey) throw new Error(`Chat LLM API key not set for ${provider}. Check Settings or Provider Keys.`);
  if (provider !== 'gemini') {
    throw new Error(`Streaming is not supported for provider: ${provider}`);
  }

  const t = Date.now();
  let fullText = '';
  const emit = (text) => {
    if (!text) return;
    fullText += text;
    onToken(text);
  };

  try {
    if (provider === 'gemini') {
      const systemMsg = messages.find(m => m.role === 'system');
      const chatMsgs = messages.filter(m => m.role !== 'system');
      const body = {
        contents: chatMsgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      };
      if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
        body,
        { responseType: 'stream', timeout: 60000 }
      );

      let buffer = '';
      for await (const chunk of res.data) {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload);
            emit(parsed.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '');
          } catch {}
        }
      }
    }

    if (db) logAiCall(db, provider, model, 'chat_stream', source, Date.now() - t);
    return fullText;
  } catch (e) {
    if (db) logAiCall(db, provider, model, 'chat_stream', source, Date.now() - t, 'error');
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

  const preSearchHistory = await db.collection('messages')
    .find({ sessionId, role: { $in: ['user', 'bot'] } })
    .sort({ createdAt: 1 })
    .limit(8)
    .toArray();
  if (preSearchHistory.length > 0 && preSearchHistory[preSearchHistory.length - 1].role === 'user' && preSearchHistory[preSearchHistory.length - 1].content === message) {
    preSearchHistory.pop();
  }
  const ragSearchText = buildRagSearchText(message, preSearchHistory);
  const completenessCriticalSearch = isCompletenessCriticalAggregateRequest(ragSearchText);

  // 2. Embed the user's query
  const queryVector = await embedQuery(ragSearchText, settings, db, 'browser_chat');

  // 3. Search vectors with org filter + optional file filter
  // Check if first message in session — if org has broadFirstSearch, get more context
  let maxResults = settings.chatMaxChunks || 15;
  let broadSearchTriggered = false;
  if (completenessCriticalSearch) {
    maxResults = Math.max(maxResults, settings.analysisMaxChunks || settings.broadSearchChunks || 80);
    broadSearchTriggered = true;
  }
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
  const debug = { chunksRetrieved: chunks.length, broadSearch: broadSearchTriggered, broadSearchChunks: maxResults, mandatoryFieldsCollected: null, mandatoryFieldsMissing: null, nextFieldAsked: null, toolCalls: [] };
  addToolCall(debug, 'rag_search', {
    input: { fileId: fileId || null, maxResults, query: ragSearchText, completenessCritical: completenessCriticalSearch },
    output: { chunks },
  });

  // 4. Build messages array — global base + auto org identity + inherited custom
  let systemPrompt = settings.chatSystemPrompt || 'You are a helpful AI assistant.';
  let orgIdentityLine = '';
  if (organizationId) {
    const org = await db.collection('organizations').findOne({ _id: new ObjectId(organizationId) });
    if (org) orgIdentityLine = buildOrgIdentityLine(org);

    // Multi-role routing
    if (org?.roleMode === 'multi' && org.roles?.length > 0) {
      let roleId = null;
      // Check if session already has a role assigned
      const sessionMsg = await db.collection('messages').findOne({ sessionId, roleId: { $exists: true, $ne: null } });
      if (sessionMsg) {
        roleId = sessionMsg.roleId;
      } else {
        // Route: classify user intent to pick a role
        const roleList = org.roles.map(r => `- "${r.id}": ${r.name} — ${r.description}`).join('\n');
        const routerPrompt = `You are a router. Based on the user message, classify which role should handle it.\n\nAvailable roles:\n${roleList}\n\nRespond with ONLY the role id (the value in quotes). If unclear, respond with "unclear".`;
        try {
          const routerResult = await callLLM([{ role: 'system', content: routerPrompt }, { role: 'user', content: message }], { ...settings, chatLlmModel: org.routerModel || settings.chatLlmModel || 'gemini-2.5-flash-lite' }, db, 'router');
          const cleaned = routerResult.trim().replace(/['"]/g, '');
          const matchedRole = org.roles.find(r => r.id === cleaned || r.name.toLowerCase() === cleaned.toLowerCase());
          if (matchedRole) roleId = matchedRole.id;
        } catch {}
        // Fallback to default role
        if (!roleId) {
          const defaultRole = org.roles.find(r => r.isDefault) || org.roles[0];
          roleId = defaultRole.id;
        }
        // Tag session with roleId
        await db.collection('messages').updateMany({ sessionId }, { $set: { roleId } });
      }
      const activeRole = org.roles.find(r => r.id === roleId);
      if (activeRole?.systemPrompt) systemPrompt = activeRole.systemPrompt;
      // If role has specific fileIds, filter chunks later (stored in debug for now)
      if (activeRole?.fileIds?.length > 0) debug.roleFileIds = activeRole.fileIds;
    } else {
      const inheritedPrompt = await resolveInheritedOrgPrompt(db, org);
      if (inheritedPrompt) systemPrompt = `${systemPrompt}\n\n## Organization-specific instructions:\n${inheritedPrompt}`;
    }

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
  if (orgIdentityLine) systemPrompt = `${orgIdentityLine}\n\n${systemPrompt}`;
  let contextBlock = '';
  if (chunks.length > 0) {
    contextBlock = '\n\n## Context from documents:\n' +
      chunks.map((c, i) => `[Source ${i + 1}: ${c.file_name}, Page ${c.page_number}]\n${c.content}`).join('\n\n');
  }

  // ── Clean chart mode flag ──
  const chartModeOn = message.includes('[GENERATE_ECHART]');
  if (chartModeOn) message = message.replace(/\n?\n?\[GENERATE_ECHART\]/g, '').trim();

  // ── Chat history ──
  const history = await db.collection('messages')
    .find({ sessionId, role: { $in: ['user', 'bot'] } })
    .sort({ createdAt: 1 })
    .limit(20)
    .toArray();
  if (history.length > 0 && history[history.length - 1].role === 'user' && history[history.length - 1].content === message) {
    history.pop();
  }
  const latestChartArtifact = getLatestChartArtifact(history);
  const latestChartSummary = summarizeChartArtifact(latestChartArtifact);
  const chartFollowUp = isChartFollowUpRequest(message, Boolean(latestChartArtifact));
  const tableOnly = isTableOnlyRequest(message);
  const chartCapabilityQuestion = isChartCapabilityQuestion(message);
  const preferPreviousChart = shouldUsePreviousChartForRequest(message, Boolean(latestChartArtifact));
  const autoNeedsChart = !chartCapabilityQuestion && !tableOnly && (
    isChartIntent(message, { chartModeOn, hasPreviousChart: Boolean(latestChartArtifact) })
    || inferVisualizationMode(message) === 'dashboard'
  );

  // ── SUB-AGENT 1: Planner ──
  const plannerModel = settings.classifierModel || 'gemini-2.5-flash';
  const historySnippet = history.slice(-4).map(m => `${m.role === 'bot' ? 'AI' : 'User'}: ${(m.content || '').slice(0, 200)}`).join('\n');
  let accessibleDataSources = [];
  let dataSourcesAvailable = '';
  if (_mysqlPool) {
    try {
      accessibleDataSources = await loadDataSourcesForUser(db, userId, organizationId);
      if (accessibleDataSources.length > 0) dataSourcesAvailable = accessibleDataSources.map(formatDataSourceForPlanner).join('\n');
    } catch {}
  }
  const dataSourceIntent = resolveDataSourceIntent(message, accessibleDataSources);
  const documentScoped = !dataSourceIntent && isDocumentScopedRequest(message);
  if (dataSourceIntent) {
    debug.dataSourceIntent = {
      source: dataSourceIntent.source.name,
      tableName: dataSourceIntent.source.tableName,
      score: dataSourceIntent.score,
    };
  } else if (documentScoped) {
    debug.dataSourceIntent = { source: 'rag_documents', mode: 'document_scoped' };
  }
  const plannerPrompt = `You are a tool planner. Analyze the user message and decide which internal tools to run.
Return ONLY valid JSON.

Available tools:
- rag_search: search uploaded documents/vector knowledge.
- sql_query: query structured MySQL data sources. Use ONLY when available data sources are relevant.
- rag_extract_dataset: extract chartable rows from RAG chunks. Use when chart is requested but sql_query is unavailable/not useful.
- chart_generate: generate an ECharts artifact from sql_query or rag_extract_dataset rows.

Available data sources:
${dataSourcesAvailable || 'None'}

Recent conversation:
${historySnippet || 'None'}

Previous rendered chart:
${latestChartSummary || 'None'}

User message: "${message.replace(/"/g, '\\"')}"
Chart override active: ${chartModeOn}
Chart follow-up detected: ${chartFollowUp}
Prefer previous chart detected: ${preferPreviousChart}
Table-only request detected: ${tableOnly}
Chart capability question detected: ${chartCapabilityQuestion}

Return shape:
{
  "language": "English|Malay|Chinese|Tamil|Arabic|Japanese|Korean",
  "chart_type_hint": "pie|bar|line|scatter|auto",
  "data_query_context": "brief SQL data request if sql_query is needed",
  "tools": [
    {"name":"rag_search","query":"..."},
    {"name":"sql_query","query":"..."},
    {"name":"rag_extract_dataset","input_from":"rag_search","query":"..."},
    {"name":"chart_generate","input_from":"sql_query|rag_extract_dataset","query":"..."}
  ]
}

Rules:
- language must be based ONLY on the current user message, not recent conversation.
- Include rag_search for general answer context.
- Include sql_query only if data sources are available and the user asks about structured records/analytics.
- If the user mentions an exact or near-exact available data source name, include sql_query and prefer that data source over RAG/vector documents.
- If the user explicitly says the data is in a document/file/PDF/RAG/vector knowledge base, do NOT include sql_query unless a data source name is also explicitly matched. Use rag_search and rag_extract_dataset for charts from documents.
- Include chart_generate if user asks to create/show/visualize/plot a chart, or chart override is active.
- If the user asks to change/convert/switch a previous chart, include chart_generate with input_from="previous_chart".
- If the user is only asking what chart types are possible or whether charts are supported, do NOT include chart_generate.
- Do NOT include chart_generate just because the user mentions a chart in a question like "why is this chart wrong?" unless they ask to redraw/change it.
- If the user asks for a table/jadual/tabular format only, do NOT include chart_generate.
- If chart_generate uses SQL rows, set input_from="sql_query".
- If no SQL tool is available/useful, include rag_extract_dataset then chart_generate with input_from="rag_extract_dataset".`;

  const currentMessageLanguage = detectMessageLanguage(message);
  const fallbackPlan = { language: currentMessageLanguage, needs_data_query: false, needs_chart: autoNeedsChart, chart_type_hint: inferChartTypeHint(message, 'auto'), data_query_context: message };
  let plan = normalizeToolPlan({}, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, preferPreviousChart, tableOnly });
  try {
    const planResult = await callLLM([{ role: 'user', content: plannerPrompt }], { ...settings, chatLlmModel: plannerModel }, db, 'planner');
    const parsed = JSON.parse(extractBalancedJson(planResult) || planResult.replace(/```json\n?/g, '').replace(/```/g, '').trim());
    plan = normalizeToolPlan(parsed, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, preferPreviousChart, tableOnly });
  } catch (e) { debug.plannerError = e.message; }
  plan.language = currentMessageLanguage;
  // Keyword fallback: ensure chart/data detected even if planner fails
  const keywordNeedsChart = autoNeedsChart;
  const keywordNeedsSql = !documentScoped && (isStructuredDataIntent(message, Boolean(dataSourcesAvailable)) || isEntityLookupIntent(message, Boolean(dataSourcesAvailable)));
  if ((keywordNeedsChart && !plan.needs_chart) || (keywordNeedsSql && !plan.needs_data_query)) {
    plan = normalizeToolPlan({
      ...plan,
      needs_chart: plan.needs_chart || keywordNeedsChart,
      needs_data_query: plan.needs_data_query || keywordNeedsSql,
      chart_type_hint: inferChartTypeHint(message, plan.chart_type_hint),
    }, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, preferPreviousChart, tableOnly });
  }
  plan = applyDataSourceIntentToPlan(plan, dataSourceIntent, message);
  if (documentScoped) plan = applyDocumentIntentToPlan(plan, message, { needsChart: autoNeedsChart || plan.needs_chart });
  plan.language = currentMessageLanguage;
  debug.plan = plan;
  addToolCall(debug, 'planner', {
    input: { dataSourcesAvailable: Boolean(dataSourcesAvailable), chartModeOn },
    output: plan,
  });

  // ── SUB-AGENT 2: Data Query ──
  let sqlRows = [];
  const sqlTool = getPlannedTool(plan, 'sql_query');
  const chartTool = getPlannedTool(plan, 'chart_generate');
  if (sqlTool) {
    const sqlStart = Date.now();
    const sqlContext = `${sqlTool.query || plan.data_query_context || message}\n\nOriginal user request: ${message}`;
    const forceSqlForChart = chartTool?.input_from === 'sql_query' || plan.needs_chart || chartModeOn;
    const forceSql = forceSqlForChart || Boolean(dataSourceIntent);
    const sqlResult = await tryDataSourceQuery(db, sqlContext, settings, organizationId, forceSql, {
      sources: dataSourceIntent?.sources,
      userId,
    });
    if (sqlResult) {
      const tableStr = rowsToTableString(sqlResult.rows);
      sqlRows = sqlResult.rows;
      const sqlContextBlock = `\n\n## Data from database query:\nMatched data source: ${sqlResult.matchedSource || sqlResult.tables?.join(', ') || 'structured data'}\nSQL: ${sqlResult.sql}\nResults (${sqlResult.rowCount} rows):\n${tableStr}${sqlResult.relaxed ? `\n\nNote: no exact match was found for the user's term (searched: ${(sqlResult.searchedTerms || []).join(', ')}). These ARE the closest available records from the data. Present their details directly in a markdown table now. You may briefly mention the exact variant may not exist, but do NOT ask the user for permission before showing what you found, and do NOT claim the information is unavailable.` : ''}\n\nPresent this data clearly using markdown tables.`;
      contextBlock = dataSourceIntent?.suppressRagWhenSql ? sqlContextBlock : contextBlock + sqlContextBlock;
      debug.sqlQuery = sqlResult.sql;
      debug.sqlRowCount = sqlResult.rowCount;
      addToolCall(debug, 'sql_query', {
        input: { context: sqlContext, forceQuery: forceSql, matchedSource: dataSourceIntent?.source?.name || null },
        output: { sql: sqlResult.sql, rows: sqlResult.rows },
        latencyMs: Date.now() - sqlStart,
      });
    } else {
      if (dataSourceIntent?.suppressRagWhenSql) {
        contextBlock = `\n\n## Structured data request:\nThe user explicitly asked for matched data source "${dataSourceIntent.source.name}", but the database query returned no usable rows. Do not answer from RAG/vector documents for this request. Explain that the structured data could not be retrieved or has no matching rows.`;
      }
      addToolCall(debug, 'sql_query', {
        status: 'skipped',
        input: { context: sqlContext, forceQuery: forceSql, matchedSource: dataSourceIntent?.source?.name || null },
        output: { reason: 'No SQL result' },
        latencyMs: Date.now() - sqlStart,
      });
    }
  }

  let deterministicAnalysis = null;
  if (!chartTool && isAggregateAnalysisRequest(message)) {
    deterministicAnalysis = await runDeterministicAnalysisForRequest({
      db,
      chunks,
      sqlRows,
      message,
      settings,
      debug,
    });
    const analysisContext = formatAnalysisForPrompt(deterministicAnalysis?.analysis);
    if (analysisContext) contextBlock += analysisContext;
  }

  // ── SUB-AGENT 3: Chart Generation tool ──
  let chartArtifact = null;
  if (chartTool) {
    if (chartTool.input_from === 'previous_chart' && latestChartArtifact) {
      chartArtifact = transformChartArtifact(latestChartArtifact, chartTool.query || message, plan.chart_type_hint);
      addToolCall(debug, 'chart_generate', {
        status: chartArtifact ? 'ok' : 'skipped',
        input: { source: 'previous_chart', hint: plan.chart_type_hint },
        output: chartArtifact || { reason: 'Unable to transform previous chart' },
      });
    }
    let chartRows = (chartArtifact || chartTool.input_from === 'rag_extract_dataset') ? [] : sqlRows;
    let chartSource = chartRows.length > 0 ? 'sql' : 'rag';
    if (!chartArtifact && chartRows.length === 0) {
      const ragTool = getPlannedTool(plan, 'rag_extract_dataset');
      const ragDataset = await extractRowsFromRagForChart(db, chunks, ragTool?.query || chartTool.query || message, settings, debug);
      chartRows = ragDataset?.rows || [];
      chartSource = ragDataset?.source || 'rag';
      if (ragDataset?.rows?.length) {
        const ragTableStr = rowsToTableString(ragDataset.rows.slice(0, 30));
        contextBlock += `\n\n## Structured data extracted from documents for charting (${ragDataset.method}):\n${ragTableStr}`;
      }
    }
    if (!chartArtifact) {
      const visualizationMode = inferVisualizationMode(chartTool.query || message);
      debug.visualizationMode = visualizationMode;
      chartArtifact = visualizationMode === 'dashboard'
        ? await generateDashboardArtifactFromRows({
          rows: chartRows,
          message: chartTool.query || message,
          hint: plan.chart_type_hint,
          debug,
          source: chartSource,
        })
        : await generateChartArtifactFromRows({
          db,
          rows: chartRows,
          message: chartTool.query || message,
          hint: plan.chart_type_hint,
          settings,
          debug,
          source: chartSource,
        });
    }
    const analysisContext = formatAnalysisForPrompt(chartArtifact?.metadata?.analysis);
    if (analysisContext) contextBlock += analysisContext;
  }

  const grounding = evaluateGroundingGate({
    message,
    plan,
    chunks,
    sqlRows,
    chartArtifact,
    chartTool,
    fileId,
    dataSourceIntent,
    documentScoped,
    chartFollowUp,
    latestChartArtifact,
    history,
    broadSearch: broadSearchTriggered,
  });
  debug.grounding = grounding;
  addToolCall(debug, 'grounding_gate', {
    status: grounding.allow ? 'ok' : 'blocked',
    input: { requiresGrounding: grounding.requiresGrounding, tools: plan.tools?.map(tool => tool.name) || [] },
    output: grounding,
  });
  if (!grounding.allow) {
    return {
      response: buildInsufficientEvidenceResponse(plan.language, grounding),
      sources: [],
      artifacts: [],
      blocked: true,
      blockReason: grounding.reason,
      debug,
    };
  }

  // ── SUB-AGENT 4: Main LLM ──
  const langRule = `[LANGUAGE: ${plan.language}] You MUST reply ONLY in ${plan.language}. Ignore the language used in conversation history — always match the language of the CURRENT user message.\nYou CAN generate charts and visualizations — they are automatically rendered for the user. Just describe or summarize the data in text. Do NOT include raw JSON or code blocks in your response.`;
  const chartRule = chartArtifact
    ? '\n\nA chart artifact has already been generated by the chart tool and will be rendered separately. Do NOT write any chart JSON, Chart.js config, ECharts option, Mermaid, code block, or inline code for the chart. If an analysis tool result is present, use it as the only source of truth for counts, totals, percentages, ordering, and chart explanation. Do not recalculate different numbers from document context.'
    : '';
  const analysisRule = deterministicAnalysis?.analysis
    ? '\n\nAn internal analysis tool result is present. Use it as the ONLY source of truth for aggregate numbers, totals, percentages, ordering, included categories, and omitted/missing-data notes. Do not recompute from raw document context and do not drop rows/categories from the analysis table.'
    : '';
  const groundingRule = buildGroundingInstruction(grounding);
  const renderedChartContext = buildRenderedChartContext(history, chartArtifact);
  const messages = [
    { role: 'system', content: langRule + chartRule + analysisRule + groundingRule + '\n\n' + systemPrompt + contextBlock + renderedChartContext + buildDownloadInstruction(chunks) },
    ...history.map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: `[Reply in ${plan.language}] ${message}` },
  ];

  const artifacts = chartArtifact ? [chartArtifact] : [];
  let response = await callLLM(messages, settings, db, 'browser_chat');
  if (artifacts.length > 0) response = sanitizeChartTextResponse(response);

  // 6. Build sources
  const uniqueSources = uniqueSourceCitations(chunks);

  // 7. Output guardrail check
  if (settings.guardrailEnabled && response) {
    const outputCheck = await checkGuardrail(response, settings.guardrailOutputPrompt, settings, db);
    if (!outputCheck.safe) {
      await db.collection('guardrail_logs').insertOne({
        userId, sessionId, type: 'output', message: response.substring(0, 500), reason: outputCheck.reason, createdAt: new Date()
      });
      return { response: 'Sorry, I\'m unable to provide that information.\n\nMaaf, saya tidak dapat memberikan maklumat tersebut.\n\nமன்னிக்கவும், அந்தத் தகவலை வழங்க இயலவில்லை.\n\n抱歉，无法提供该信息。', sources: [], artifacts: [], blocked: true, blockReason: outputCheck.reason };
    }
  }

  return { response, sources: uniqueSources, attachmentFiles: uniqueSourceFiles(chunks), artifacts, debug };
}

// ─── Main Chat Pipeline (Streaming) ────────────────────────────
export async function processBrowserChatStream(db, userId, message, sessionId, settings, fileId = null, organizationId = null, callbacks = {}) {
  const notify = (status) => callbacks.onStatus?.(status);
  const debug = {
    chunksRetrieved: 0,
    broadSearch: false,
    broadSearchChunks: settings.chatMaxChunks || 15,
    mandatoryFieldsCollected: null,
    mandatoryFieldsMissing: null,
    nextFieldAsked: null,
    chunks: [],
    promptUsed: null,
    provider: settings.chatLlmProvider || 'gemini',
    model: settings.chatLlmModel || 'gemini-2.5-flash',
    embeddingLatencyMs: null,
    providerLatencyMs: null,
    toolCalls: [],
  };

  // 0. Input guardrail check
  if (settings.guardrailEnabled) {
    notify('Checking safety...');
    const inputCheck = await checkGuardrail(message, settings.guardrailInputPrompt, settings, db);
    if (!inputCheck.safe) {
      await db.collection('guardrail_logs').insertOne({
        userId, sessionId, type: 'input', message, reason: inputCheck.reason, createdAt: new Date()
      });
      return { response: 'Sorry, I\'m unable to process this request.\n\nMaaf, saya tidak dapat memproses permintaan ini.\n\nமன்னிக்கவும், இந்தக் கோரிக்கையை செயல்படுத்த இயலவில்லை.\n\n抱歉，无法处理此请求。', sources: [], blocked: true, blockReason: inputCheck.reason };
    }
  }

  notify('Searching knowledge base...');
  const orgIds = await getUserAccessibleOrgIds(db, userId);
  const preSearchHistory = await db.collection('messages')
    .find({ sessionId, role: { $in: ['user', 'bot'] } })
    .sort({ createdAt: 1 })
    .limit(8)
    .toArray();
  if (preSearchHistory.length > 0 && preSearchHistory[preSearchHistory.length - 1].role === 'user' && preSearchHistory[preSearchHistory.length - 1].content === message) {
    preSearchHistory.pop();
  }
  const ragSearchText = buildRagSearchText(message, preSearchHistory);
  const completenessCriticalSearch = isCompletenessCriticalAggregateRequest(ragSearchText);
  const embeddingStart = Date.now();
  const queryVector = await embedQuery(ragSearchText, settings, db, 'browser_chat_stream');
  debug.embeddingLatencyMs = Date.now() - embeddingStart;

  let maxResults = settings.chatMaxChunks || 15;
  let broadSearchTriggered = false;
  if (completenessCriticalSearch) {
    maxResults = Math.max(maxResults, settings.analysisMaxChunks || settings.broadSearchChunks || 80);
    broadSearchTriggered = true;
  }
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
  debug.chunksRetrieved = chunks.length;
  debug.broadSearch = broadSearchTriggered;
  debug.broadSearchChunks = maxResults;
  debug.chunks = chunks.map((c, i) => ({
    index: i + 1,
    file_name: c.file_name,
    file_id: c.file_id,
    page_number: c.page_number,
    score: c.score,
    content: (c.content || '').slice(0, 700),
  }));
  addToolCall(debug, 'rag_search', {
    input: { fileId: fileId || null, maxResults, query: ragSearchText, completenessCritical: completenessCriticalSearch },
    output: { chunks },
    latencyMs: debug.embeddingLatencyMs,
  });

  let systemPrompt = settings.chatSystemPrompt || 'You are a helpful AI assistant.';
  let orgIdentityLine = '';
  if (organizationId) {
    const org = await db.collection('organizations').findOne({ _id: new ObjectId(organizationId) });
    if (org) orgIdentityLine = buildOrgIdentityLine(org);

    // Multi-role routing
    if (org?.roleMode === 'multi' && org.roles?.length > 0) {
      let roleId = null;
      const sessionMsg = await db.collection('messages').findOne({ sessionId, roleId: { $exists: true, $ne: null } });
      if (sessionMsg) {
        roleId = sessionMsg.roleId;
      } else {
        const roleList = org.roles.map(r => `- "${r.id}": ${r.name} — ${r.description}`).join('\n');
        const routerPrompt = `You are a router. Based on the user message, classify which role should handle it.\n\nAvailable roles:\n${roleList}\n\nRespond with ONLY the role id (the value in quotes). If unclear, respond with "unclear".`;
        try {
          const routerResult = await callLLM([{ role: 'system', content: routerPrompt }, { role: 'user', content: message }], { ...settings, chatLlmModel: org.routerModel || settings.chatLlmModel || 'gemini-2.5-flash-lite' }, db, 'router');
          const cleaned = routerResult.trim().replace(/['"]/g, '');
          const matchedRole = org.roles.find(r => r.id === cleaned || r.name.toLowerCase() === cleaned.toLowerCase());
          if (matchedRole) roleId = matchedRole.id;
        } catch {}
        if (!roleId) {
          const defaultRole = org.roles.find(r => r.isDefault) || org.roles[0];
          roleId = defaultRole.id;
        }
        await db.collection('messages').updateMany({ sessionId }, { $set: { roleId } });
      }
      const activeRole = org.roles.find(r => r.id === roleId);
      if (activeRole?.systemPrompt) systemPrompt = activeRole.systemPrompt;
      if (activeRole?.fileIds?.length > 0) debug.roleFileIds = activeRole.fileIds;
    } else {
      const inheritedPrompt = await resolveInheritedOrgPrompt(db, org);
      if (inheritedPrompt) systemPrompt = `${systemPrompt}\n\n## Organization-specific instructions:\n${inheritedPrompt}`;
    }

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
        const intent = collected.intent || null;
        let requiredFields = org.mandatoryFields.filter(f => f.alwaysRequired);
        if (intent) requiredFields = [...requiredFields, ...org.mandatoryFields.filter(f => f.requiredFor?.includes(intent))];
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
  if (orgIdentityLine) systemPrompt = `${orgIdentityLine}\n\n${systemPrompt}`;

  let contextBlock = chunks.length > 0
    ? '\n\n## Context from documents:\n' + chunks.map((c, i) => `[Source ${i + 1}: ${c.file_name}, Page ${c.page_number}]\n${c.content}`).join('\n\n')
    : '';
  // ── Clean chart mode flag ──
  const chartModeOn = message.includes('[GENERATE_ECHART]');
  if (chartModeOn) message = message.replace(/\n?\n?\[GENERATE_ECHART\]/g, '').trim();

  // ── Chat history ──
  const history = await db.collection('messages')
    .find({ sessionId, role: { $in: ['user', 'bot'] } })
    .sort({ createdAt: 1 })
    .limit(20)
    .toArray();
  if (history.length > 0 && history[history.length - 1].role === 'user' && history[history.length - 1].content === message) {
    history.pop();
  }
  const latestChartArtifact = getLatestChartArtifact(history);
  const latestChartSummary = summarizeChartArtifact(latestChartArtifact);
  const chartFollowUp = isChartFollowUpRequest(message, Boolean(latestChartArtifact));
  const tableOnly = isTableOnlyRequest(message);
  const chartCapabilityQuestion = isChartCapabilityQuestion(message);
  const preferPreviousChart = shouldUsePreviousChartForRequest(message, Boolean(latestChartArtifact));
  const autoNeedsChart = !chartCapabilityQuestion && !tableOnly && (
    isChartIntent(message, { chartModeOn, hasPreviousChart: Boolean(latestChartArtifact) })
    || inferVisualizationMode(message) === 'dashboard'
  );

  // ── SUB-AGENT 1: Planner (decides what to do) ──
  notify('Planning...');
  const plannerModel = settings.classifierModel || 'gemini-2.5-flash';
  const historySnippet = history.slice(-4).map(m => `${m.role === 'bot' ? 'AI' : 'User'}: ${(m.content || '').slice(0, 200)}`).join('\n');

  // Check what data sources are available
  let accessibleDataSources = [];
  let dataSourcesAvailable = '';
  if (_mysqlPool) {
    try {
      accessibleDataSources = await loadDataSourcesForUser(db, userId, organizationId);
      if (accessibleDataSources.length > 0) {
        dataSourcesAvailable = accessibleDataSources.map(formatDataSourceForPlanner).join('\n');
      }
    } catch {}
  }
  const dataSourceIntent = resolveDataSourceIntent(message, accessibleDataSources);
  const documentScoped = !dataSourceIntent && isDocumentScopedRequest(message);
  if (dataSourceIntent) {
    debug.dataSourceIntent = {
      source: dataSourceIntent.source.name,
      tableName: dataSourceIntent.source.tableName,
      score: dataSourceIntent.score,
    };
  } else if (documentScoped) {
    debug.dataSourceIntent = { source: 'rag_documents', mode: 'document_scoped' };
  }

  const plannerPrompt = `You are a tool planner. Analyze the user message and conversation context to decide which internal tools to run.

Available tools:
- rag_search: search uploaded documents/vector knowledge.
- sql_query: query structured MySQL data sources. Use ONLY when available data sources are relevant.
- rag_extract_dataset: extract chartable rows from RAG chunks. Use when chart is requested but sql_query is unavailable/not useful.
- chart_generate: generate an ECharts artifact from sql_query or rag_extract_dataset rows.

Available data sources:
${dataSourcesAvailable || 'None'}

Recent conversation:
${historySnippet || 'None'}

Previous rendered chart:
${latestChartSummary || 'None'}

User message: "${message}"
Chart override active: ${chartModeOn}
Chart follow-up detected: ${chartFollowUp}
Prefer previous chart detected: ${preferPreviousChart}
Table-only request detected: ${tableOnly}
Chart capability question detected: ${chartCapabilityQuestion}

Return ONLY valid JSON:
{
  "language": "English|Malay|Chinese|Tamil|Arabic|Japanese|Korean",
  "chart_type_hint": "pie|bar|line|scatter|auto",
  "data_query_context": "brief SQL data request if sql_query is needed",
  "tools": [
    {"name":"rag_search","query":"..."},
    {"name":"sql_query","query":"..."},
    {"name":"rag_extract_dataset","input_from":"rag_search","query":"..."},
    {"name":"chart_generate","input_from":"sql_query|rag_extract_dataset","query":"..."}
  ]
}

Rules:
- language = the language the user is writing in now. Use ONLY the current user message, not recent conversation.
- Include rag_search for general answer context.
- Include sql_query only if data sources are available and the user asks about structured records/analytics.
- If the user mentions an exact or near-exact available data source name, include sql_query and prefer that data source over RAG/vector documents.
- If the user explicitly says the data is in a document/file/PDF/RAG/vector knowledge base, do NOT include sql_query unless a data source name is also explicitly matched. Use rag_search and rag_extract_dataset for charts from documents.
- Include chart_generate if user asks to create/show/visualize/plot a chart, OR chart override is active.
- If the user asks to change/convert/switch a previous chart, include chart_generate with input_from="previous_chart".
- If the user is only asking what chart types are possible or whether charts are supported, do NOT include chart_generate.
- Do NOT include chart_generate just because the user mentions a chart in a question like "why is this chart wrong?" unless they ask to redraw/change it.
- If the user asks for a table/jadual/tabular format only, do NOT include chart_generate.
- If chart_generate uses SQL rows, set input_from="sql_query".
- If no SQL tool is available/useful, include rag_extract_dataset then chart_generate with input_from="rag_extract_dataset".
- data_query_context = summarize what data SQL should query, considering conversation history`;

  const currentMessageLanguage = detectMessageLanguage(message);
  const fallbackPlan = { language: currentMessageLanguage, needs_data_query: false, needs_chart: autoNeedsChart, chart_type_hint: inferChartTypeHint(message, 'auto'), data_query_context: message };
  let plan = normalizeToolPlan({}, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, preferPreviousChart, tableOnly });

  try {
    const planResult = await callLLM([{ role: 'user', content: plannerPrompt }], { ...settings, chatLlmModel: plannerModel }, db, 'planner');
    const parsed = JSON.parse(extractBalancedJson(planResult) || planResult.replace(/```json\n?/g, '').replace(/```/g, '').trim());
    plan = normalizeToolPlan(parsed, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, preferPreviousChart, tableOnly });
  } catch (e) { debug.plannerError = e.message; }
  plan.language = currentMessageLanguage;
  // Keyword fallback: ensure chart/data detected even if planner fails
  const keywordNeedsChart = autoNeedsChart;
  const keywordNeedsSql = !documentScoped && (isStructuredDataIntent(message, Boolean(dataSourcesAvailable)) || isEntityLookupIntent(message, Boolean(dataSourcesAvailable)));
  if ((keywordNeedsChart && !plan.needs_chart) || (keywordNeedsSql && !plan.needs_data_query)) {
    plan = normalizeToolPlan({
      ...plan,
      needs_chart: plan.needs_chart || keywordNeedsChart,
      needs_data_query: plan.needs_data_query || keywordNeedsSql,
      chart_type_hint: inferChartTypeHint(message, plan.chart_type_hint),
    }, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, preferPreviousChart, tableOnly });
  }
  plan = applyDataSourceIntentToPlan(plan, dataSourceIntent, message);
  if (documentScoped) plan = applyDocumentIntentToPlan(plan, message, { needsChart: autoNeedsChart || plan.needs_chart });
  plan.language = currentMessageLanguage;
  debug.plan = plan;
  addToolCall(debug, 'planner', {
    input: { dataSourcesAvailable: Boolean(dataSourcesAvailable), chartModeOn },
    output: plan,
  });
  // ── SUB-AGENT 2: Data Query (if needed) ──
  let sqlRows = [];
  const sqlTool = getPlannedTool(plan, 'sql_query');
  const chartTool = getPlannedTool(plan, 'chart_generate');
  if (sqlTool) {
    notify('Querying data...');
    const sqlStart = Date.now();
    const sqlContext = `${sqlTool.query || plan.data_query_context || message}\n\nOriginal user request: ${message}`;
    const forceSqlForChart = chartTool?.input_from === 'sql_query' || plan.needs_chart || chartModeOn;
    const forceSql = forceSqlForChart || Boolean(dataSourceIntent);
    const sqlResult = await tryDataSourceQuery(db, sqlContext, settings, organizationId, forceSql, {
      sources: dataSourceIntent?.sources,
      userId,
    });
    if (sqlResult) {
      const tableStr = rowsToTableString(sqlResult.rows);
      sqlRows = sqlResult.rows;
      const sqlContextBlock = `\n\n## Data from database query:\nMatched data source: ${sqlResult.matchedSource || sqlResult.tables?.join(', ') || 'structured data'}\nSQL: ${sqlResult.sql}\nResults (${sqlResult.rowCount} rows):\n${tableStr}${sqlResult.relaxed ? `\n\nNote: no exact match was found for the user's term (searched: ${(sqlResult.searchedTerms || []).join(', ')}). These ARE the closest available records from the data. Present their details directly in a markdown table now. You may briefly mention the exact variant may not exist, but do NOT ask the user for permission before showing what you found, and do NOT claim the information is unavailable.` : ''}\n\nPresent this data clearly using markdown tables.`;
      contextBlock = dataSourceIntent?.suppressRagWhenSql ? sqlContextBlock : contextBlock + sqlContextBlock;
      debug.sqlQuery = sqlResult.sql;
      debug.sqlRowCount = sqlResult.rowCount;
      addToolCall(debug, 'sql_query', {
        input: { context: sqlContext, forceQuery: forceSql, matchedSource: dataSourceIntent?.source?.name || null },
        output: { sql: sqlResult.sql, rows: sqlResult.rows },
        latencyMs: Date.now() - sqlStart,
      });
    } else {
      if (dataSourceIntent?.suppressRagWhenSql) {
        contextBlock = `\n\n## Structured data request:\nThe user explicitly asked for matched data source "${dataSourceIntent.source.name}", but the database query returned no usable rows. Do not answer from RAG/vector documents for this request. Explain that the structured data could not be retrieved or has no matching rows.`;
      }
      addToolCall(debug, 'sql_query', {
        status: 'skipped',
        input: { context: sqlContext, forceQuery: forceSql, matchedSource: dataSourceIntent?.source?.name || null },
        output: { reason: 'No SQL result' },
        latencyMs: Date.now() - sqlStart,
      });
    }
  }

  let deterministicAnalysis = null;
  if (!chartTool && isAggregateAnalysisRequest(message)) {
    deterministicAnalysis = await runDeterministicAnalysisForRequest({
      db,
      chunks,
      sqlRows,
      message,
      settings,
      debug,
      notify,
    });
    const analysisContext = formatAnalysisForPrompt(deterministicAnalysis?.analysis);
    if (analysisContext) contextBlock += analysisContext;
  }

  // ── SUB-AGENT 3: Chart Generation tool ──
  let chartArtifact = null;
  if (chartTool) {
    if (chartTool.input_from === 'previous_chart' && latestChartArtifact) {
      notify('Updating chart...');
      chartArtifact = transformChartArtifact(latestChartArtifact, chartTool.query || message, plan.chart_type_hint);
      addToolCall(debug, 'chart_generate', {
        status: chartArtifact ? 'ok' : 'skipped',
        input: { source: 'previous_chart', hint: plan.chart_type_hint },
        output: chartArtifact || { reason: 'Unable to transform previous chart' },
      });
    }
    let chartRows = (chartArtifact || chartTool.input_from === 'rag_extract_dataset') ? [] : sqlRows;
    let chartSource = chartRows.length > 0 ? 'sql' : 'rag';
    if (!chartArtifact && chartRows.length === 0) {
      const ragTool = getPlannedTool(plan, 'rag_extract_dataset');
      const ragDataset = await extractRowsFromRagForChart(db, chunks, ragTool?.query || chartTool.query || message, settings, debug, notify);
      chartRows = ragDataset?.rows || [];
      chartSource = ragDataset?.source || 'rag';
      if (ragDataset?.rows?.length) {
        const ragTableStr = rowsToTableString(ragDataset.rows.slice(0, 30));
        contextBlock += `\n\n## Structured data extracted from documents for charting (${ragDataset.method}):\n${ragTableStr}`;
      }
    }
    if (!chartArtifact) {
      const visualizationMode = inferVisualizationMode(chartTool.query || message);
      debug.visualizationMode = visualizationMode;
      chartArtifact = visualizationMode === 'dashboard'
        ? await generateDashboardArtifactFromRows({
          rows: chartRows,
          message: chartTool.query || message,
          hint: plan.chart_type_hint,
          debug,
          source: chartSource,
          notify,
        })
        : await generateChartArtifactFromRows({
          db,
          rows: chartRows,
          message: chartTool.query || message,
          hint: plan.chart_type_hint,
          settings,
          debug,
          source: chartSource,
          notify,
        });
    }
    const analysisContext = formatAnalysisForPrompt(chartArtifact?.metadata?.analysis);
    if (analysisContext) contextBlock += analysisContext;
  }

  notify('Checking evidence...');
  const grounding = evaluateGroundingGate({
    message,
    plan,
    chunks,
    sqlRows,
    chartArtifact,
    chartTool,
    fileId,
    dataSourceIntent,
    documentScoped,
    chartFollowUp,
    latestChartArtifact,
    history,
    broadSearch: broadSearchTriggered,
  });
  debug.grounding = grounding;
  addToolCall(debug, 'grounding_gate', {
    status: grounding.allow ? 'ok' : 'blocked',
    input: { requiresGrounding: grounding.requiresGrounding, tools: plan.tools?.map(tool => tool.name) || [] },
    output: grounding,
  });
  if (!grounding.allow) {
    return {
      response: buildInsufficientEvidenceResponse(plan.language, grounding),
      sources: [],
      artifacts: [],
      blocked: true,
      blockReason: grounding.reason,
      debug,
    };
  }

  // ── SUB-AGENT 4: Main LLM (text response, streamed) ──
  const langRule = `[LANGUAGE: ${plan.language}] You MUST reply ONLY in ${plan.language}. Ignore the language used in conversation history — always match the language of the CURRENT user message.\nYou CAN generate charts and visualizations — they are automatically rendered for the user. Just describe or summarize the data in text. Do NOT include raw JSON or code blocks in your response.`;
  const chartRule = chartArtifact
    ? '\n\nA chart artifact has already been generated by the chart tool and will be rendered separately. Do NOT write any chart JSON, Chart.js config, ECharts option, Mermaid, code block, or inline code for the chart. If an analysis tool result is present, use it as the only source of truth for counts, totals, percentages, ordering, and chart explanation. Do not recalculate different numbers from document context.'
    : '';
  const analysisRule = deterministicAnalysis?.analysis
    ? '\n\nAn internal analysis tool result is present. Use it as the ONLY source of truth for aggregate numbers, totals, percentages, ordering, included categories, and omitted/missing-data notes. Do not recompute from raw document context and do not drop rows/categories from the analysis table.'
    : '';
  const groundingRule = buildGroundingInstruction(grounding);
  const renderedChartContext = buildRenderedChartContext(history, chartArtifact);

  const systemInstruction = langRule + chartRule + analysisRule + groundingRule + '\n\n' + systemPrompt + contextBlock + renderedChartContext + buildDownloadInstruction(chunks);
  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: `[Reply in ${plan.language}] ${message}` },
  ];
  debug.promptUsed = {
    system: systemInstruction.slice(0, 6000),
    messageCount: messages.length,
    historyCount: history.length,
  };

  notify('Generating answer...');
  const providerStart = Date.now();
  let response = await streamLLM(messages, settings, callbacks.onToken || (() => {}), db, 'browser_chat_stream');
  debug.providerLatencyMs = Date.now() - providerStart;
  const artifacts = chartArtifact ? [chartArtifact] : [];
  if (artifacts.length > 0) response = sanitizeChartTextResponse(response);

  const sources = uniqueSourceCitations(chunks);

  if (settings.guardrailEnabled && response) {
    notify('Checking response...');
    const outputCheck = await checkGuardrail(response, settings.guardrailOutputPrompt, settings, db);
    if (!outputCheck.safe) {
      await db.collection('guardrail_logs').insertOne({
        userId, sessionId, type: 'output', message: response.substring(0, 500), reason: outputCheck.reason, createdAt: new Date()
      });
      return { response: 'Sorry, I\'m unable to provide that information.\n\nMaaf, saya tidak dapat memberikan maklumat tersebut.\n\nமன்னிக்கவும், அந்தத் தகவலை வழங்க இயலவில்லை.\n\n抱歉，无法提供该信息。', sources: [], artifacts: [], blocked: true, blockReason: outputCheck.reason };
    }
  }

  return { response, sources, attachmentFiles: uniqueSourceFiles(chunks), artifacts, debug };
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

// ─── Public Embed Chat (Streaming) ─────────────────────────────
export async function processPublicChatStream(db, message, sessionId, settings, orgIds, callbacks = {}) {
  const notify = (status) => callbacks.onStatus?.(status);

  if (settings.guardrailEnabled) {
    notify('Checking safety...');
    const inputCheck = await checkGuardrail(message, settings.guardrailInputPrompt, settings, db);
    if (!inputCheck.safe) {
      await db.collection('guardrail_logs').insertOne({ sessionId, type: 'input', source: 'widget', message, reason: inputCheck.reason, createdAt: new Date() });
      return { response: 'Sorry, I\'m unable to process this request.\n\nMaaf, saya tidak dapat memproses permintaan ini.\n\nமன்னிக்கவும், இந்தக் கோரிக்கையை செயல்படுத்த இயலவில்லை.\n\n抱歉，无法处理此请求。', sources: [], blocked: true };
    }
  }

  notify('Searching knowledge base...');
  const queryVector = await embedQuery(message, settings, db, 'embed_widget_stream');
  const chunks = await searchPublicVectors(queryVector, orgIds, settings);

  const systemPrompt = await (async () => {
    if (orgIds?.length) {
      const org = await db.collection('organizations').findOne({ _id: orgIds[0], systemPrompt: { $exists: true, $ne: '' } });
      if (org?.systemPrompt) return org.systemPrompt;
    }
    return settings.chatSystemPrompt || 'You are a helpful AI assistant.';
  })();

  const contextBlock = chunks.length > 0
    ? '\n\n## Context from documents:\n' + chunks.map((c, i) => `[Source ${i + 1}: ${c.file_name}, Page ${c.page_number}]\n${c.content}`).join('\n\n')
    : '';

  const history = await db.collection('messages')
    .find({ sessionId, role: { $in: ['user', 'bot'] } })
    .sort({ createdAt: 1 }).limit(10).toArray();

  if (history.length > 0 && history[history.length - 1].role === 'user' && history[history.length - 1].content === message) {
    history.pop();
  }

  const messages = [
    { role: 'system', content: systemPrompt + contextBlock },
    ...history.map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: message },
  ];

  notify('Generating answer...');
  const response = await streamLLM(messages, settings, callbacks.onToken || (() => {}), db, 'embed_widget_stream');

  if (settings.guardrailEnabled && response) {
    notify('Checking response...');
    const outputCheck = await checkGuardrail(response, settings.guardrailOutputPrompt, settings, db);
    if (!outputCheck.safe) {
      await db.collection('guardrail_logs').insertOne({ sessionId, type: 'output', source: 'widget', message: response.substring(0, 500), reason: outputCheck.reason, createdAt: new Date() });
      return { response: 'Sorry, I\'m unable to provide that information.\n\nMaaf, saya tidak dapat memberikan maklumat tersebut.\n\nமன்னிக்கவும், அந்தத் தகவலை வழங்க இயலவில்லை.\n\n抱歉，无法提供该信息。', sources: [], blocked: true };
    }
  }

  const seen = new Set();
  const sources = chunks.filter(c => c.file_name).map(c => ({ file_name: c.file_name, page_number: c.page_number, score: c.score })).filter(s => {
    const k = `${s.file_name}:${s.page_number}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { response, sources };
}
