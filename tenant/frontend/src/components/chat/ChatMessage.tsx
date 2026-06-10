import { useState, useEffect } from "react";
import { FileText, Loader2, Square, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseFileNamesFromMessage, checkDownloadableFiles } from "@/lib/fileHelper";
import { DownloadButton } from "./DownloadButton";
import { ExportableTable } from "./ExportableTable";
import { EChartBlock } from "./EChartBlock";
import type { ChatArtifact } from "@/lib/api";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean;
  isStreaming?: boolean;
  status?: string;
  userName?: string;
  startedBy?: string;
  timestamp?: Date | string;
  sources?: { file_name: string; page_number: number; file_id?: string; score?: number }[];
  artifacts?: ChatArtifact[];
  responseTimeMs?: number;
  onWebViewOpen?: (url: string) => void;
  debug?: any;
}

function stripModelFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json|echart|echarts|chart)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractBalancedJson(text: string) {
  const input = stripModelFence(text);
  const start = input.search(/[\[{]/);
  if (start < 0) return "";

  const open = input[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
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

function parseChartOption(raw: string) {
  try {
    const candidate = extractBalancedJson(raw);
    if (!candidate) return null;
    let parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) parsed = parsed[0];
    if (parsed?.type && parsed?.data?.datasets) parsed = chartJsToECharts(parsed);
    if (parsed?.option && typeof parsed.option === "object") parsed = parsed.option;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.series && !Array.isArray(parsed.series)) parsed.series = [parsed.series];
    if (Array.isArray(parsed.series) && parsed.series.length > 0) return parsed;
    if (parsed.chartType || parsed.xAxis || parsed.yAxis) return parsed;
  } catch {
    return null;
  }
  return null;
}

function chartJsToECharts(chart: any) {
  if (!chart || typeof chart !== "object" || !chart.data?.datasets) return null;
  const labels = Array.isArray(chart.data.labels) ? chart.data.labels.map(String) : [];
  const datasets = Array.isArray(chart.data.datasets) ? chart.data.datasets : [];
  const firstDataset = datasets[0] || {};
  const chartType = String(chart.type || firstDataset.type || "bar").toLowerCase();
  const title = chart.options?.plugins?.title?.text || chart.options?.title?.text || "Chart";

  if (chartType === "pie" || chartType === "doughnut") {
    return {
      title: { text: title, left: "center" },
      tooltip: { trigger: "item" },
      legend: { bottom: 0 },
      series: [{
        name: firstDataset.label || title,
        type: "pie",
        radius: chartType === "doughnut" ? ["38%", "68%"] : "62%",
        data: labels.map((name: string, index: number) => ({ name, value: Number(firstDataset.data?.[index]) || 0 })),
      }],
    };
  }

  return {
    title: { text: title, left: "center" },
    tooltip: { trigger: "axis" },
    grid: { top: 70, left: 45, right: 24, bottom: 70 },
    xAxis: { type: "category", data: labels },
    yAxis: { type: "value" },
    series: datasets.map((dataset: any) => ({
      name: dataset.label || title,
      type: chartType === "line" ? "line" : "bar",
      data: Array.isArray(dataset.data) ? dataset.data.map((value: any) => Number(value) || 0) : [],
    })),
  };
}

function looksLikeChartJson(raw: string) {
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

function removeBareChartJson(text: string) {
  let output = text;
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

function extractChartOptions(content: string) {
  const charts: Record<string, any>[] = [];
  const seen = new Set<string>();
  const pushChart = (raw: string) => {
    const option = parseChartOption(raw);
    if (!option) return;
    const key = JSON.stringify(option);
    if (seen.has(key)) return;
    seen.add(key);
    charts.push(option);
  };

  for (const match of content.matchAll(/```([a-zA-Z0-9_-]*)\s*\n?([\s\S]*?)```/g)) {
    const language = match[1]?.toLowerCase();
    const body = match[2] || "";
    if (language === "echart" || language === "echarts" || language === "chart" || language === "json" || /"series"|"xAxis"|"yAxis"|"chartType"|"datasets"/.test(body)) {
      pushChart(body);
    }
  }

  if (charts.length === 0) {
    for (const match of content.matchAll(/`([\s\S]*?(?:"series"|"xAxis"|"yAxis"|"chartType"|"datasets")[\s\S]*?)`/g)) {
      pushChart(match[1]);
    }
  }

  return charts;
}

function stripChartBlocks(content: string) {
  let stripped = content.replace(/```([a-zA-Z0-9_-]*)\s*\n?([\s\S]*?)```/g, (full, language, body) => {
    const lang = String(language || "").toLowerCase();
    if (lang === "echart" || lang === "echarts" || lang === "chart") return "";
    if ((lang === "json" || /"series"|"xAxis"|"yAxis"|"chartType"|"datasets"/.test(body)) && looksLikeChartJson(body)) return "";
    return full;
  });

  stripped = stripped.replace(/```(?:echart|echarts|chart)\s*\n?[\s\S]*$/i, "");
  stripped = stripped.replace(/```json\s*\n[\s\S]*?(?:"series"|"xAxis"|"yAxis"|"chartType"|"datasets")[\s\S]*$/i, "");

  stripped = stripped.replace(/`([\s\S]*?(?:"series"|"xAxis"|"yAxis"|"chartType"|"datasets")[\s\S]*?)`/g, (full, body) => (
    looksLikeChartJson(body) ? "" : full
  ));

  return removeBareChartJson(stripped).trim();
}

export const ChatMessage = ({ role, content: rawContent, isTyping, isStreaming, status, startedBy, sources, artifacts, responseTimeMs, onWebViewOpen, debug }: ChatMessageProps) => {
  const isUser = role === "user";
  const content = rawContent.replace(/\n?\n?\[\/?\s*GENERATE_ECHART\s*\]/g, '').replace(/<br\s*\/?>/g, '\n');
  const [showDebug, setShowDebug] = useState(false);
  const userRole = localStorage.getItem('userRole') || 'user';
  const canShowSourceCitations = userRole.toLowerCase() === 'developer';
  const showStartedBy = (userRole.toLowerCase() === 'developer' || userRole === 'admin' || userRole === 'manager') && startedBy;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ttsMode, setTtsMode] = useState<string>("browser");
  const [ttsLanguage, setTtsLanguage] = useState<string>("en-US");
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [downloadableMatches, setDownloadableMatches] = useState<any[]>([]);
  const displayStatus = (() => {
    const raw = (status || 'Thinking').replace(/\.+$/, '').trim();
    if (/safety|checking/i.test(raw)) return 'Thinking';
    if (/search/i.test(raw)) return 'Searching knowledge';
    if (/generat/i.test(raw)) return 'Generating';
    return raw || 'Thinking';
  })();
  const formatMs = (value?: number | null) => {
    if (typeof value !== 'number') return 'n/a';
    return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
  };
  const makeSourceUrl = (source: { file_id?: string; page_number?: number }) => {
    if (!source.file_id) return '';
    const token = localStorage.getItem('token') || '';
    const page = source.page_number && source.page_number > 0 ? `#page=${source.page_number}` : '';
    return `/api/files/${source.file_id}/view?token=${encodeURIComponent(token)}${page}`;
  };

  // Auto-open form if message contains form link
  // Custom link renderer for ReactMarkdown
  const LinkRenderer = ({ href, children }: any) => {
    // External links - open in split screen
    if (href?.startsWith('http://') || href?.startsWith('https://')) {
      return (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onWebViewOpen?.(href);
          }}
          className="text-blue-500 underline hover:text-blue-600 cursor-pointer"
        >
          {children}
        </a>
      );
    }
    
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">{children}</a>;
  };

  useEffect(() => {
    // Load TTS settings
    fetch('/api/public-settings')
      .then(res => res.json())
      .then(data => {
        setTtsMode(data.ttsMode || 'browser');
        setTtsLanguage(data.ttsLanguage || 'en-US');
      })
      .catch(err => console.error('Failed to load TTS settings:', err));
  }, []);

  // Check for downloadable files in bot messages
  useEffect(() => {
    // Reset state first
    setDownloadableMatches([]);
    
    if (!isUser && content && !isTyping && !isStreaming) {
      const fileNames = parseFileNamesFromMessage(content);
      // Only check if file names found AND message mentions download/form keywords
      const hasDownloadContext = /download|form|file|document|attachment/i.test(content);
      if (fileNames.length > 0 && hasDownloadContext) {
        checkDownloadableFiles(fileNames)
          .then(matches => {
            if (matches && matches.length > 0) {
              setDownloadableMatches(matches);
            }
          })
          .catch(err => console.error('Failed to check downloadable files:', err));
      }
    }
  }, [content, isUser, isTyping, isStreaming]);

  const handleSpeak = async () => {
    if (isPlaying) {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setIsPlaying(false);
      setIsLoading(false);
      localStorage.removeItem('ttsPlaying');
      if (localStorage.getItem('continuousMode') === 'true') {
        localStorage.setItem('continuousModeMessage', 'Listening...');
      }
      window.dispatchEvent(new CustomEvent('ttsEnded'));
      return;
    }

    setIsLoading(true);

    // Strip markdown formatting for TTS
    const cleanText = content
      .replace(/\*\*(.+?)\*\*/g, '$1')  // **bold** -> bold
      .replace(/\*(.+?)\*/g, '$1')      // *italic* -> italic
      .replace(/`(.+?)`/g, '$1')        // `code` -> code
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // [link](url) -> link
      .replace(/#+\s/g, '')             // # heading -> heading
      .replace(/>\s/g, '')              // > quote -> quote
      .replace(/[-*]\s/g, '')           // - list -> list
      .replace(/\n+/g, '. ');           // newlines -> periods

    const effectiveMode = (ttsMode === 'browser') ? 'gemini' : ttsMode;
    {
      // API-based TTS (Gemini / Google Cloud)
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ text: cleanText, language: ttsLanguage, mode: effectiveMode })
        });

        if (!response.ok) throw new Error('TTS failed');

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const newAudio = new Audio(audioUrl);
        
        newAudio.onloadeddata = () => {
          setIsLoading(false);
          setIsPlaying(true);
        };
        newAudio.onended = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(audioUrl);
          localStorage.removeItem('ttsPlaying');
          if (localStorage.getItem('continuousMode') === 'true') {
            localStorage.setItem('continuousModeMessage', 'Listening...');
          }
          window.dispatchEvent(new CustomEvent('ttsEnded'));
        };
        newAudio.onerror = () => {
          setIsPlaying(false);
          setIsLoading(false);
          URL.revokeObjectURL(audioUrl);
          localStorage.removeItem('ttsPlaying');
          if (localStorage.getItem('continuousMode') === 'true') {
            localStorage.setItem('continuousModeMessage', 'Listening...');
          }
          window.dispatchEvent(new CustomEvent('ttsEnded'));
        };

        setAudio(newAudio);
        await newAudio.play();
      } catch (error) {
        console.error('TTS error:', error);
        setIsPlaying(false);
        setIsLoading(false);
        toast.error('Failed to play audio. Please check API key in Settings.');
      }
    }
  };

  const markdownContent = (() => {
    const withDownloadLinks = content.replace(/\[Download:\s*(.+?)\]/g, (_, filename: string) => (
      `[📥 ${filename.trim()}](/api/files/download-by-name/${encodeURIComponent(filename.trim())}?token=${localStorage.getItem('token')})`
    ));
    return stripChartBlocks(withDownloadLinks);
  })();
  const artifactChartOptions = (artifacts || [])
    .filter((artifact) => artifact.type === "echart" && artifact.option)
    .map((artifact) => artifact.option as Record<string, any>);
  const chartOptions = isUser ? [] : (artifactChartOptions.length > 0 ? artifactChartOptions : extractChartOptions(content));

  return (
    <div className={cn("mb-6 message-enter w-full", isUser && "flex justify-end")}>
      <div className={cn("flex flex-col gap-1.5", isUser ? "items-end max-w-[70%]" : "items-start max-w-[85%]")}>
        {showStartedBy && (
          <span className="text-[10px] text-muted-foreground/70 px-1">
            {startedBy}
          </span>
        )}
        
        {/* Verbose: response time */}
        {!isUser && !isTyping && responseTimeMs !== undefined && (
          <span className="text-[10px] text-muted-foreground/50 mb-0.5">
            ⚡ {responseTimeMs >= 1000 ? `${(responseTimeMs / 1000).toFixed(1)}s` : `${responseTimeMs}ms`}
          </span>
        )}

        {isUser ? (
          <div className="bg-zinc-700 text-white rounded-2xl px-4 py-2.5 inline-block">
            <p className="text-[14px] whitespace-pre-wrap">{content}</p>
          </div>
        ) : (
          <div>
            {isTyping ? (
              <div className="flex items-center gap-1.5 py-2 text-[14px] text-muted-foreground">
                <span>{displayStatus}</span>
                <span className="flex items-center gap-0.5 pt-1">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/70 thinking-dot" />
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/70 thinking-dot" />
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/70 thinking-dot" />
                </span>
              </div>
            ) : (
              <div className="text-[14px] leading-relaxed text-foreground prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:my-3 prose-headings:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                {isStreaming && status && (
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground not-prose">
                    <span>{displayStatus}</span>
                    <span className="flex items-center gap-0.5 pt-1">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/70 thinking-dot" />
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/70 thinking-dot" />
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/70 thinking-dot" />
                    </span>
                  </div>
                )}
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: LinkRenderer,
                    table: ({ children }) => <ExportableTable>{children}</ExportableTable>,
                    thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
                    th: ({ children }) => <th className="px-3 py-2 text-left text-[11px] font-semibold border-b">{children}</th>,
                    td: ({ children }) => <td className="px-3 py-1.5 border-b border-muted/50">{children}</td>,
                    tr: ({ children }) => <tr className="hover:bg-muted/30">{children}</tr>,
                    code: ({ className, children }) => {
                      const text = String(children).trim();
                      // Hide chart JSON from display (rendered separately below)
                      if (text.length > 50 && text.startsWith('{') && /["'](?:series|datasets|xAxis|yAxis|chartType)["']/.test(text) && looksLikeChartJson(text)) return null;
                      if (/language-(echart|echarts|chart)/.test(className || '')) return null;
                      return <code className={className}>{children}</code>;
                    },
                    pre: ({ children }) => <>{children}</>,
                  }}
                >
                  {markdownContent}
                </ReactMarkdown>
                {/* Render ECharts extracted from content */}
                {chartOptions.map((opt, i) => <EChartBlock key={i} option={opt} />)}
              </div>
            )}
          </div>
        )}
        
        {/* Actions row - only for bot */}
        {!isUser && !isTyping && (
          <div className="flex items-center gap-3 mt-1">
            <button
              onClick={handleSpeak}
              disabled={isLoading}
              data-tts-play
              className="text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-50"
              title={isLoading ? "Loading..." : isPlaying ? "Stop" : "Play audio"}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <Square className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            
            {downloadableMatches.length > 0 && (
              <DownloadButton matches={downloadableMatches} />
            )}
          </div>
        )}

        {/* Source citations */}
        {canShowSourceCitations && !isUser && !isTyping && sources && sources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {sources.map((s, i) => (
              s.file_id ? (
                <a key={i} href={makeSourceUrl(s)} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!onWebViewOpen) return;
                    e.preventDefault();
                    onWebViewOpen(makeSourceUrl(s));
                  }}
                  title={typeof s.score === 'number' ? `Score: ${s.score.toFixed(3)}` : undefined}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors">
                  <FileText className="h-3 w-3" /> {s.file_name}{s.page_number > 0 ? ` - p.${s.page_number}` : ''}
                </a>
              ) : (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  <FileText className="h-3 w-3" /> {s.file_name}{s.page_number > 0 ? ` - p.${s.page_number}` : ''}
                </span>
              )
            ))}
          </div>
        )}
        {/* Developer debug panel */}
        {!isUser && debug && (
          <div className="mt-2">
            <button onClick={() => setShowDebug(!showDebug)} className="text-[9px] text-muted-foreground hover:text-foreground transition-colors">
              {showDebug ? '▼' : '▶'} Debug
            </button>
            {showDebug && (
              <div className="mt-1 w-full max-w-2xl rounded-md border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div><span className="block text-[9px] uppercase">Chunks</span><span className="font-mono text-foreground">{debug.chunksRetrieved ?? 0}/{debug.broadSearchChunks ?? '-'}</span></div>
                  <div><span className="block text-[9px] uppercase">Search</span><span className="font-mono text-foreground">{debug.broadSearch ? 'Broad' : 'Normal'}</span></div>
                  <div><span className="block text-[9px] uppercase">Provider</span><span className="font-mono text-foreground">{debug.provider || '-'}</span></div>
                  <div><span className="block text-[9px] uppercase">Latency</span><span className="font-mono text-foreground">{formatMs(debug.providerLatencyMs)}</span></div>
                </div>

                {(debug.embeddingLatencyMs || debug.model) && (
                  <div className="mt-2 grid grid-cols-1 gap-1 font-mono sm:grid-cols-2">
                    <div>model: {debug.model || '-'}</div>
                    <div>embedding: {formatMs(debug.embeddingLatencyMs)}</div>
                  </div>
                )}

                {Array.isArray(debug.chunks) && debug.chunks.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[9px] font-medium uppercase tracking-wide">Retrieved Chunks</p>
                    {debug.chunks.slice(0, 8).map((chunk: any) => (
                      <div key={chunk.index} className="rounded border bg-background/60 p-2">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-foreground">
                          <span>#{chunk.index}</span>
                          <span>{chunk.file_name || 'unknown'}</span>
                          {chunk.page_number > 0 && <span>p.{chunk.page_number}</span>}
                          {typeof chunk.score === 'number' && <span>score {chunk.score.toFixed(3)}</span>}
                        </div>
                        {chunk.content && <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{chunk.content}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {Array.isArray(debug.toolCalls) && debug.toolCalls.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[9px] font-medium uppercase tracking-wide">Tool Calls</p>
                    {debug.toolCalls.map((tool: any, index: number) => (
                      <div key={`${tool.name}-${index}`} className="rounded border bg-background/60 p-2">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-foreground">
                          <span>{tool.name}</span>
                          <span className={tool.status === 'ok' ? 'text-green-500' : tool.status === 'skipped' ? 'text-amber-500' : 'text-red-500'}>
                            {tool.status || 'ok'}
                          </span>
                          {typeof tool.latencyMs === 'number' && <span>{formatMs(tool.latencyMs)}</span>}
                        </div>
                        {tool.output && <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[10px]">{JSON.stringify(tool.output, null, 2)}</pre>}
                        {tool.error && <p className="mt-1 font-mono text-[10px] text-red-500">{tool.error}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {debug.promptUsed?.system && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[9px] font-medium uppercase tracking-wide">Prompt Used</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-background/60 p-2 font-mono text-[10px]">{debug.promptUsed.system}</pre>
                  </details>
                )}

                {(debug.mandatoryFieldsCollected || debug.mandatoryFieldsMissing || debug.nextFieldAsked) && (
                  <div className="mt-3 space-y-1 font-mono">
                    {debug.mandatoryFieldsCollected && <div>collected: {JSON.stringify(debug.mandatoryFieldsCollected)}</div>}
                    {debug.mandatoryFieldsMissing && <div>missing: {debug.mandatoryFieldsMissing.join(', ') || 'none'}</div>}
                    {debug.nextFieldAsked && <div>asking: {debug.nextFieldAsked}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
