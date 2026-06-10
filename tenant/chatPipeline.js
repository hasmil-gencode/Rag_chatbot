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

function normalizeChartOption(option, fallbackTitle = 'Data Visualization') {
  const normalized = { ...option };
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

function summarizeToolOutput(output) {
  if (!output) return output;
  if (Array.isArray(output)) return { count: output.length };
  if (Array.isArray(output.rows)) return { rows: output.rows.length, columns: Object.keys(output.rows[0] || {}) };
  if (Array.isArray(output.chunks)) return { chunks: output.chunks.length };
  if (output.type === 'echart') return { type: output.type, title: output.title };
  if (typeof output === 'object') return output;
  return String(output).slice(0, 300);
}

function summarizeChartArtifact(artifact) {
  if (!artifact || artifact.type !== 'echart' || !artifact.option) return '';
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
    const chart = [...artifacts].reverse().find(artifact => artifact?.type === 'echart' && artifact.option);
    if (chart) return chart;
  }
  return null;
}

function inferChartTypeHint(text = '', fallback = 'auto') {
  const lower = String(text).toLowerCase();
  if (/\b(pie|donut|doughnut)\b|carta pai|pai chart/.test(lower)) return 'pie';
  if (/\b(bar|column)\b|bar chart|carta bar/.test(lower)) return 'bar';
  if (/\b(line|trend)\b|line chart|carta garis/.test(lower)) return 'line';
  return fallback || 'auto';
}

function isChartFollowUpRequest(text = '', hasPreviousChart = false) {
  if (!hasPreviousChart) return false;
  const lower = String(text).toLowerCase();
  return /\b(tukar|ubah|change|convert|switch|jadikan|make it|turn it|plot as|show as|display as)\b/.test(lower)
    && /\b(chart|graph|visual|pie|bar|line|carta|graf)\b/.test(lower);
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
  if (isChartFollowUpRequest(lower, hasPreviousChart)) return true;
  const asksWhyOnly = /^(why|kenapa|mengapa|apa sebab|how come)\b/.test(lower);
  const hasChartNoun = /\b(chart|graph|visuali[sz]ation|visualize|visualise|plot|dashboard|histogram|pie chart|bar chart|line chart|carta|graf)\b/.test(lower);
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
  const previousOption = previousArtifact?.option;
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
  return makeEChartArtifact(normalizeChartOption(option), {
    source: 'previous_chart',
    previousArtifactId: previousArtifact.id || null,
    chartTypeHint: hint,
    transformed: true,
  });
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

function normalizeToolName(name = '') {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function normalizeToolPlan(parsed = {}, fallback = {}, { chartModeOn = false, dataSourcesAvailable = false, message = '', hasPreviousChart = false, chartFollowUp = false, tableOnly = false } = {}) {
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
    if (chartFollowUp && hasPreviousChart && (name === 'sql_query' || name === 'rag_extract_dataset')) continue;
    if (tableOnly && (name === 'chart_generate' || name === 'rag_extract_dataset')) continue;
    if (name === 'sql_query' && !dataSourcesAvailable) continue;
    plan.tools.push({
      name,
      query: tool.query || tool.context || plan.data_query_context || message,
      input_from: tool.input_from || tool.inputFrom || undefined,
      reason: tool.reason || undefined,
    });
  }

  if (!plan.tools.some(tool => tool.name === 'rag_search')) {
    plan.tools.unshift({ name: 'rag_search', query: message, reason: 'Default context retrieval' });
  }

  const oldNeedsDataQuery = parsed.needs_data_query === true || fallback.needs_data_query === true;
  const oldNeedsChart = !tableOnly && (parsed.needs_chart === true || fallback.needs_chart === true || chartModeOn);
  if (chartFollowUp && hasPreviousChart) {
    const existingChartTool = plan.tools.find(tool => tool.name === 'chart_generate');
    if (existingChartTool) existingChartTool.input_from = existingChartTool.input_from || 'previous_chart';
    else plan.tools.push({ name: 'chart_generate', query: message, input_from: 'previous_chart', reason: 'Modify previous rendered chart' });
  }
  if (oldNeedsDataQuery && dataSourcesAvailable && !plan.tools.some(tool => tool.name === 'sql_query')) {
    plan.tools.push({ name: 'sql_query', query: plan.data_query_context || message, reason: 'Structured data requested' });
  }
  if (oldNeedsChart && !plan.tools.some(tool => tool.name === 'chart_generate')) {
    if (chartFollowUp && hasPreviousChart) {
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

async function extractRowsFromRagForChart(db, chunks, message, settings, debug, notify = null) {
  const t = Date.now();
  notify?.('Extracting chart data...');
  const tableRows = parseMarkdownTablesFromChunks(chunks);
  if (tableRows.length > 0) {
    addToolCall(debug, 'rag_extract_dataset', {
      input: { chunks: chunks.length, method: 'markdown_table' },
      output: { rows: tableRows },
      latencyMs: Date.now() - t,
    });
    return { rows: tableRows, source: 'rag', method: 'markdown_table' };
  }

  const relevantText = chunks.slice(0, 8).map((chunk, i) => (
    `[Chunk ${i + 1}: ${chunk.file_name || 'unknown'} p.${chunk.page_number || 0}]\n${String(chunk.content || '').slice(0, 1200)}`
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
- If the request is sentiment/feedback analysis, rows may be {"message":"..."} objects.
- Use only information present in context.
- Return at most 50 rows.
- If no chartable data exists, return {"rows":[]}.`;
      const raw = await callLLM([{ role: 'user', content: extractionPrompt }], settings, db, 'rag_extract_dataset');
      const parsed = JSON.parse(extractBalancedJson(raw) || '{"rows":[]}');
      const rows = Array.isArray(parsed.rows) ? parsed.rows.filter(row => row && typeof row === 'object').slice(0, 50) : [];
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
  const chartModel = settings.chartModel || 'gemini-2.5-flash';
  const apiKey = settings[`chatLlmApiKey_gemini`] || settings.chatLlmApiKey || settings.chatEmbeddingApiKey;
  const chartPrompt = `Generate a valid ECharts option JSON object for this data.
DATA:\n${tableStr}
USER REQUEST: "${message}"
CHART TYPE: ${hint}
DATA SOURCE: ${source}
Rules: Use ECharts format. Required: title.text, tooltip:{}, series:[]. For pie: series[0].type="pie", series[0].data=[{value:N,name:"X"},...]. For bar: xAxis.data=[], yAxis:{}, series[0].type="bar", series[0].data=[]. Use actual data from DATA above. Return ONLY the JSON object with no markdown.`;

  const deterministicOption = buildFallbackChartOption(rows, message, hint);
  if (deterministicOption && isSentimentRequest(message)) {
    chartOption = normalizeChartOption(deterministicOption);
    usedFallback = true;
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

  const artifact = makeEChartArtifact(chartOption, { source, chartTypeHint: hint, fallback: usedFallback });
  debug.chartGenerated = true;
  debug.chartFallback = usedFallback;
  addToolCall(debug, 'chart_generate', {
    input: { source, rows: rows.length, hint },
    output: artifact,
    latencyMs: Date.now() - t,
  });
  return artifact;
}

// Text-to-SQL: check if question can be answered from data sources
async function tryDataSourceQuery(db, message, settings, organizationId, forceQuery = false) {
  if (!_mysqlPool) return null;
  try {
    // Get data sources accessible to this org
    const filter = organizationId ? { organizationIds: new ObjectId(organizationId) } : {};
    const sources = await db.collection('data_sources').find(filter).toArray();
    if (sources.length === 0) return null;

    // Build schema description for LLM
    const schemaDesc = sources.map(s => {
      const cols = s.columns.map(c => `  - ${c.name} (${c.type}) — ${c.description || ''}`).join('\n');
      return `Table: ${s.tableName}\nDescription: ${s.description || s.name}\nColumns:\n${cols}`;
    }).join('\n\n');

    let cleaned;
    if (forceQuery) {
      // Chart mode: force LLM to generate SQL, never return NO_SQL
      const forcePrompt = `You have access to these MySQL tables:\n\n${schemaDesc}\n\nUser wants data analysis/visualization. Their exact request: "${message}"\n\nGenerate a SQL SELECT query to get the most relevant data for answering the exact request and creating a chart if needed. Always return a valid SELECT query, never say NO_SQL.\n\nRules:\n- If the user asks for recent/latest/last N responses, respondent text, comments, feedback, reviews, sentiment, positive/negative/neutral, or "respond", retrieve raw response/comment/message/answer/text fields plus submitted/created date fields. Do NOT aggregate by date first.\n- If the user asks to categorize positive/negative sentiment, raw text rows are more important than counts.\n- If the user asks for totals, trends, counts, or submissions over time, aggregate appropriately.\n- Use ORDER BY submitted/created/updated date DESC and LIMIT the requested N when the user asks for recent/latest/last N rows.\n- Prefer meaningful column aliases like message, response, submitted_at, rating, category.`;
      const sqlResult = await callLLM([{ role: 'user', content: forcePrompt }], { ...settings, chatLlmModel: settings.chatLlmModel || 'gemini-2.5-flash' }, db, 'text_to_sql');
      cleaned = cleanSqlResponse(sqlResult);
      // Fallback: if still not SELECT, just get all from first table
      if (!/^\s*SELECT\s/i.test(cleaned)) cleaned = `SELECT * FROM \`${sources[0].tableName}\` LIMIT 100`;
    } else {
      // Normal: Ask LLM if this question needs SQL
      const routerPrompt = `You have access to these MySQL tables:\n\n${schemaDesc}\n\nUser question: "${message}"\n\nIf this question can be answered by querying the tables above, respond with ONLY the SQL SELECT query (no explanation, no markdown). If the question is NOT about this data, respond with exactly "NO_SQL".`;
      const sqlResult = await callLLM([{ role: 'user', content: routerPrompt }], { ...settings, chatLlmModel: settings.chatLlmModel || 'gemini-2.5-flash' }, db, 'text_to_sql');
      cleaned = cleanSqlResponse(sqlResult);
      if (cleaned === 'NO_SQL' || !cleaned.toUpperCase().startsWith('SELECT')) return null;
    }

    // Safety: only SELECT allowed
    if (!/^\s*SELECT\s/i.test(cleaned)) return null;

    // Execute with timeout and limit
    const [rows] = await _mysqlPool.query({ sql: cleaned + (cleaned.toLowerCase().includes('limit') ? '' : ' LIMIT 100'), timeout: 5000 });
    if (!Array.isArray(rows) || rows.length === 0) return null;

    return { sql: cleaned, rows, rowCount: rows.length, tables: sources.map(s => s.name) };
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
  const debug = { chunksRetrieved: chunks.length, broadSearch: broadSearchTriggered, broadSearchChunks: maxResults, mandatoryFieldsCollected: null, mandatoryFieldsMissing: null, nextFieldAsked: null, toolCalls: [] };
  addToolCall(debug, 'rag_search', {
    input: { fileId: fileId || null, maxResults },
    output: { chunks },
  });

  // 4. Build messages array — org prompt overrides global
  let systemPrompt = settings.chatSystemPrompt || 'You are a helpful AI assistant.';
  if (organizationId) {
    const org = await db.collection('organizations').findOne({ _id: new ObjectId(organizationId) });

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
    } else if (org?.systemPrompt) {
      systemPrompt = org.systemPrompt;
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
  const autoNeedsChart = !tableOnly && isChartIntent(message, { chartModeOn, hasPreviousChart: Boolean(latestChartArtifact) });

  // ── SUB-AGENT 1: Planner ──
  const plannerModel = settings.classifierModel || 'gemini-2.5-flash';
  const historySnippet = history.slice(-4).map(m => `${m.role === 'bot' ? 'AI' : 'User'}: ${(m.content || '').slice(0, 200)}`).join('\n');
  let dataSourcesAvailable = '';
  if (_mysqlPool && organizationId) {
    try {
      const sources = await db.collection('data_sources').find({ organizationIds: new ObjectId(organizationId) }).toArray();
      if (sources.length > 0) dataSourcesAvailable = sources.map(s => `- ${s.name} (table: ${s.tableName}, columns: ${s.columns.map(c => c.name).join(', ')})`).join('\n');
    } catch {}
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
Table-only request detected: ${tableOnly}

Return shape:
{
  "language": "English|Malay|Chinese|Tamil|Arabic|Japanese|Korean",
  "chart_type_hint": "pie|bar|line|auto",
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
- Include chart_generate if user asks to create/show/visualize/plot a chart, or chart override is active.
- If the user asks to change/convert/switch a previous chart, include chart_generate with input_from="previous_chart".
- Do NOT include chart_generate just because the user mentions a chart in a question like "why is this chart wrong?" unless they ask to redraw/change it.
- If the user asks for a table/jadual/tabular format only, do NOT include chart_generate.
- If chart_generate uses SQL rows, set input_from="sql_query".
- If no SQL tool is available/useful, include rag_extract_dataset then chart_generate with input_from="rag_extract_dataset".`;

  const currentMessageLanguage = detectMessageLanguage(message);
  const fallbackPlan = { language: currentMessageLanguage, needs_data_query: false, needs_chart: autoNeedsChart, chart_type_hint: inferChartTypeHint(message, 'auto'), data_query_context: message };
  let plan = normalizeToolPlan({}, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, tableOnly });
  try {
    const planResult = await callLLM([{ role: 'user', content: plannerPrompt }], { ...settings, chatLlmModel: plannerModel }, db, 'planner');
    const parsed = JSON.parse(extractBalancedJson(planResult) || planResult.replace(/```json\n?/g, '').replace(/```/g, '').trim());
    plan = normalizeToolPlan(parsed, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, tableOnly });
  } catch (e) { debug.plannerError = e.message; }
  plan.language = currentMessageLanguage;
  // Keyword fallback: ensure chart/data detected even if planner fails
  const keywordNeedsChart = autoNeedsChart;
  const keywordNeedsSql = isStructuredDataIntent(message, Boolean(dataSourcesAvailable));
  if ((keywordNeedsChart && !plan.needs_chart) || (keywordNeedsSql && !plan.needs_data_query)) {
    plan = normalizeToolPlan({
      ...plan,
      needs_chart: plan.needs_chart || keywordNeedsChart,
      needs_data_query: plan.needs_data_query || keywordNeedsSql,
      chart_type_hint: inferChartTypeHint(message, plan.chart_type_hint),
    }, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, tableOnly });
  }
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
    const sqlResult = await tryDataSourceQuery(db, sqlContext, settings, organizationId, forceSqlForChart);
    if (sqlResult) {
      const tableStr = rowsToTableString(sqlResult.rows);
      sqlRows = sqlResult.rows;
      contextBlock += `\n\n## Data from database query:\nSQL: ${sqlResult.sql}\nResults (${sqlResult.rowCount} rows):\n${tableStr}\n\nPresent this data clearly using markdown tables.`;
      debug.sqlQuery = sqlResult.sql;
      debug.sqlRowCount = sqlResult.rowCount;
      addToolCall(debug, 'sql_query', {
        input: { context: sqlContext, forceQuery: forceSqlForChart },
        output: { sql: sqlResult.sql, rows: sqlResult.rows },
        latencyMs: Date.now() - sqlStart,
      });
    } else {
      addToolCall(debug, 'sql_query', {
        status: 'skipped',
        input: { context: sqlContext, forceQuery: forceSqlForChart },
        output: { reason: 'No SQL result' },
        latencyMs: Date.now() - sqlStart,
      });
    }
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
      chartArtifact = await generateChartArtifactFromRows({
        db,
        rows: chartRows,
        message: chartTool.query || message,
        hint: plan.chart_type_hint,
        settings,
        debug,
        source: chartSource,
      });
    }
  }

  // ── SUB-AGENT 4: Main LLM ──
  const langRule = `[LANGUAGE: ${plan.language}] You MUST reply ONLY in ${plan.language}. Ignore the language used in conversation history — always match the language of the CURRENT user message.\nYou CAN generate charts and visualizations — they are automatically rendered for the user. Just describe or summarize the data in text. Do NOT include raw JSON or code blocks in your response.`;
  const chartRule = chartArtifact
    ? '\n\nA chart artifact has already been generated by the chart tool and will be rendered separately. Do NOT write any chart JSON, Chart.js config, ECharts option, Mermaid, code block, or inline code for the chart. Only explain the result in natural language.'
    : '';
  const renderedChartContext = buildRenderedChartContext(history, chartArtifact);
  const messages = [
    { role: 'system', content: langRule + chartRule + '\n\n' + systemPrompt + contextBlock + renderedChartContext },
    ...history.map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: `[Reply in ${plan.language}] ${message}` },
  ];

  const artifacts = chartArtifact ? [chartArtifact] : [];
  let response = await callLLM(messages, settings, db, 'browser_chat');
  if (artifacts.length > 0) response = sanitizeChartTextResponse(response);

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
      return { response: 'Sorry, I\'m unable to provide that information.\n\nMaaf, saya tidak dapat memberikan maklumat tersebut.\n\nமன்னிக்கவும், அந்தத் தகவலை வழங்க இயலவில்லை.\n\n抱歉，无法提供该信息。', sources: [], artifacts: [], blocked: true, blockReason: outputCheck.reason };
    }
  }

  return { response, sources: uniqueSources, artifacts, debug };
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
  const embeddingStart = Date.now();
  const queryVector = await embedQuery(message, settings, db, 'browser_chat_stream');
  debug.embeddingLatencyMs = Date.now() - embeddingStart;

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
    input: { fileId: fileId || null, maxResults },
    output: { chunks },
    latencyMs: debug.embeddingLatencyMs,
  });

  let systemPrompt = settings.chatSystemPrompt || 'You are a helpful AI assistant.';
  if (organizationId) {
    const org = await db.collection('organizations').findOne({ _id: new ObjectId(organizationId) });

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
    } else if (org?.systemPrompt) {
      systemPrompt = org.systemPrompt;
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
  const autoNeedsChart = !tableOnly && isChartIntent(message, { chartModeOn, hasPreviousChart: Boolean(latestChartArtifact) });

  // ── SUB-AGENT 1: Planner (decides what to do) ──
  notify('Planning...');
  const plannerModel = settings.classifierModel || 'gemini-2.5-flash';
  const historySnippet = history.slice(-4).map(m => `${m.role === 'bot' ? 'AI' : 'User'}: ${(m.content || '').slice(0, 200)}`).join('\n');

  // Check what data sources are available
  let dataSourcesAvailable = '';
  if (_mysqlPool && organizationId) {
    try {
      const sources = await db.collection('data_sources').find({ organizationIds: new ObjectId(organizationId) }).toArray();
      if (sources.length > 0) {
        dataSourcesAvailable = sources.map(s => `- ${s.name} (table: ${s.tableName}, columns: ${s.columns.map(c => c.name).join(', ')})`).join('\n');
      }
    } catch {}
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
Table-only request detected: ${tableOnly}

Return ONLY valid JSON:
{
  "language": "English|Malay|Chinese|Tamil|Arabic|Japanese|Korean",
  "chart_type_hint": "pie|bar|line|auto",
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
- Include chart_generate if user asks to create/show/visualize/plot a chart, OR chart override is active.
- If the user asks to change/convert/switch a previous chart, include chart_generate with input_from="previous_chart".
- Do NOT include chart_generate just because the user mentions a chart in a question like "why is this chart wrong?" unless they ask to redraw/change it.
- If the user asks for a table/jadual/tabular format only, do NOT include chart_generate.
- If chart_generate uses SQL rows, set input_from="sql_query".
- If no SQL tool is available/useful, include rag_extract_dataset then chart_generate with input_from="rag_extract_dataset".
- data_query_context = summarize what data SQL should query, considering conversation history`;

  const currentMessageLanguage = detectMessageLanguage(message);
  const fallbackPlan = { language: currentMessageLanguage, needs_data_query: false, needs_chart: autoNeedsChart, chart_type_hint: inferChartTypeHint(message, 'auto'), data_query_context: message };
  let plan = normalizeToolPlan({}, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, tableOnly });

  try {
    const planResult = await callLLM([{ role: 'user', content: plannerPrompt }], { ...settings, chatLlmModel: plannerModel }, db, 'planner');
    const parsed = JSON.parse(extractBalancedJson(planResult) || planResult.replace(/```json\n?/g, '').replace(/```/g, '').trim());
    plan = normalizeToolPlan(parsed, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, tableOnly });
  } catch (e) { debug.plannerError = e.message; }
  plan.language = currentMessageLanguage;
  // Keyword fallback: ensure chart/data detected even if planner fails
  const keywordNeedsChart = autoNeedsChart;
  const keywordNeedsSql = isStructuredDataIntent(message, Boolean(dataSourcesAvailable));
  if ((keywordNeedsChart && !plan.needs_chart) || (keywordNeedsSql && !plan.needs_data_query)) {
    plan = normalizeToolPlan({
      ...plan,
      needs_chart: plan.needs_chart || keywordNeedsChart,
      needs_data_query: plan.needs_data_query || keywordNeedsSql,
      chart_type_hint: inferChartTypeHint(message, plan.chart_type_hint),
    }, fallbackPlan, { chartModeOn, dataSourcesAvailable: Boolean(dataSourcesAvailable), message, hasPreviousChart: Boolean(latestChartArtifact), chartFollowUp, tableOnly });
  }
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
    const sqlResult = await tryDataSourceQuery(db, sqlContext, settings, organizationId, forceSqlForChart);
    if (sqlResult) {
      const tableStr = rowsToTableString(sqlResult.rows);
      sqlRows = sqlResult.rows;
      contextBlock += `\n\n## Data from database query:\nSQL: ${sqlResult.sql}\nResults (${sqlResult.rowCount} rows):\n${tableStr}\n\nPresent this data clearly using markdown tables.`;
      debug.sqlQuery = sqlResult.sql;
      debug.sqlRowCount = sqlResult.rowCount;
      addToolCall(debug, 'sql_query', {
        input: { context: sqlContext, forceQuery: forceSqlForChart },
        output: { sql: sqlResult.sql, rows: sqlResult.rows },
        latencyMs: Date.now() - sqlStart,
      });
    } else {
      addToolCall(debug, 'sql_query', {
        status: 'skipped',
        input: { context: sqlContext, forceQuery: forceSqlForChart },
        output: { reason: 'No SQL result' },
        latencyMs: Date.now() - sqlStart,
      });
    }
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
      chartArtifact = await generateChartArtifactFromRows({
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
  }
  // ── SUB-AGENT 4: Main LLM (text response, streamed) ──
  const langRule = `[LANGUAGE: ${plan.language}] You MUST reply ONLY in ${plan.language}. Ignore the language used in conversation history — always match the language of the CURRENT user message.\nYou CAN generate charts and visualizations — they are automatically rendered for the user. Just describe or summarize the data in text. Do NOT include raw JSON or code blocks in your response.`;
  const chartRule = chartArtifact
    ? '\n\nA chart artifact has already been generated by the chart tool and will be rendered separately. Do NOT write any chart JSON, Chart.js config, ECharts option, Mermaid, code block, or inline code for the chart. Only explain the result in natural language.'
    : '';
  const renderedChartContext = buildRenderedChartContext(history, chartArtifact);

  const messages = [
    { role: 'system', content: langRule + chartRule + '\n\n' + systemPrompt + contextBlock + renderedChartContext },
    ...history.map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: `[Reply in ${plan.language}] ${message}` },
  ];
  debug.promptUsed = {
    system: (langRule + chartRule + '\n\n' + systemPrompt + contextBlock + renderedChartContext).slice(0, 6000),
    messageCount: messages.length,
    historyCount: history.length,
  };

  notify('Generating answer...');
  const providerStart = Date.now();
  let response = await streamLLM(messages, settings, callbacks.onToken || (() => {}), db, 'browser_chat_stream');
  debug.providerLatencyMs = Date.now() - providerStart;
  const artifacts = chartArtifact ? [chartArtifact] : [];
  if (artifacts.length > 0) response = sanitizeChartTextResponse(response);

  const seen = new Set();
  const sources = chunks.filter(c => c.file_name).map(c => ({
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

  return { response, sources, artifacts, debug };
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
