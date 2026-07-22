import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useConfirm } from "./ConfirmDialog";
import { api } from "@/lib/api";
import { Plus, Copy, Power, Trash2, Eye, EyeOff, Key, X, Edit2, Activity, ChevronDown } from "lucide-react";

interface ApiKey { _id: string; key: string; shortKey?: string; hasShortKey?: boolean; name: string; description?: string; userId: string; userEmail: string; chatMode?: string; webhookUrl?: string; systemPrompt?: string; scopes?: string[]; streamChunkSize?: number; streamDelayMs?: number; isActive: boolean; createdAt: string; lastUsedAt: string | null; }
interface ApiUsageSummary {
  totalRequests: number;
  totalErrors: number;
  streamingRequests: number;
  normalRequests: number;
  avgLatencyMs: number;
  lastRequestAt: string | null;
  lastError?: { timestamp?: string; endpoint?: string; apiKeyName?: string; status?: number; code?: string; message?: string } | null;
}

export const ApiManagementPage = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [form, setForm] = useState({ name: "", description: "", userId: "", chatMode: "native", webhookUrl: "", systemPrompt: "", generateShortKey: false, scopes: ["chat"] as string[], streamChunkSize: 10, streamDelayMs: 22 });
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [docsTab, setDocsTab] = useState<'streaming' | 'ingest'>('streaming');
  const [usageExpanded, setUsageExpanded] = useState(false);
  const confirm = useConfirm();

  useEffect(() => { loadKeys(); loadUsers(); loadUsage(); }, []);

  const loadKeys = async () => { try { setKeys(await api.getApiKeys()); } catch (e: any) { toast.error(e.message); } };
  const loadUsers = async () => { try { setUsers(await api.getUsers()); } catch (e) { setUsers([]); } };
  const loadUsage = async () => { try { setUsage(await api.getApiUsage()); } catch (e) { setUsage(null); } };

  const openCreate = () => { setEditingKey(null); setForm({ name: "", description: "", userId: "", chatMode: "native", webhookUrl: "", systemPrompt: "", generateShortKey: false, scopes: ["chat"], streamChunkSize: 10, streamDelayMs: 22 }); setShowModal(true); };
  const openEdit = (k: ApiKey) => { setEditingKey(k); setForm({ name: k.name, description: k.description || "", userId: k.userId, chatMode: k.chatMode || "webhook", webhookUrl: k.webhookUrl || "", systemPrompt: k.systemPrompt || "", generateShortKey: false, scopes: k.scopes?.length ? k.scopes : ["chat"], streamChunkSize: k.streamChunkSize || 10, streamDelayMs: k.streamDelayMs ?? 22 }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.name || (!editingKey && !form.userId)) { toast.error("Fill required fields"); return; }
    if (form.chatMode === "webhook" && !form.webhookUrl) { toast.error("Webhook URL required for webhook mode"); return; }
    try {
      if (editingKey) {
        await api.updateApiKeyDetails(editingKey._id, { name: form.name, description: form.description, chatMode: form.chatMode, webhookUrl: form.webhookUrl, systemPrompt: form.systemPrompt, scopes: form.scopes, streamChunkSize: form.streamChunkSize, streamDelayMs: form.streamDelayMs });
      } else {
        await api.createApiKey(form.name, form.userId, form.generateShortKey, null, form.description, form.webhookUrl, form.chatMode, form.systemPrompt, form.scopes, undefined, form.streamChunkSize, form.streamDelayMs);
      }
      setShowModal(false); loadKeys(); loadUsage(); toast.success(editingKey ? "Updated" : "Created");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleToggleKey = async (id: string, isActive: boolean) => { try { await api.toggleApiKey(id, !isActive); loadKeys(); loadUsage(); } catch (e: any) { toast.error(e.message); } };
  const handleDeleteKey = async (id: string) => { if (!await confirm("Delete this API key?")) return; try { await api.deleteApiKey(id); loadKeys(); loadUsage(); toast.success("Deleted"); } catch (e: any) { toast.error(e.message); } };
  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied!"); };
  const toggleKeyVisibility = (id: string) => setVisibleKeys(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const maskKey = (key: string) => key.substring(0, 8) + "..." + key.substring(key.length - 4);
  const toggleScope = (scope: string) => setForm(prev => {
    const scopes = prev.scopes.includes(scope) ? prev.scopes.filter(s => s !== scope) : [...prev.scopes, scope];
    return { ...prev, scopes: scopes.length ? scopes : ["chat"] };
  });
  const usageSummary: ApiUsageSummary = usage?.summary || {
    totalRequests: Array.isArray(usage) ? usage.length : 0,
    totalErrors: Array.isArray(usage) ? usage.filter((item: any) => item.responseStatus >= 400).length : 0,
    streamingRequests: Array.isArray(usage) ? usage.filter((item: any) => item.streaming).length : 0,
    normalRequests: Array.isArray(usage) ? usage.filter((item: any) => !item.streaming).length : 0,
    avgLatencyMs: 0,
    lastRequestAt: Array.isArray(usage) ? usage[0]?.timestamp || null : null,
    lastError: null,
  };
  const recentUsage = usage?.recent || (Array.isArray(usage) ? usage : []);
  const formatLatency = (ms?: number) => typeof ms === 'number' && ms > 0 ? `${ms.toLocaleString()}ms` : '-';
  const formatTime = (value?: string) => value ? new Date(value).toLocaleString() : '-';

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Integration</p>
            <h1 className="text-xl font-semibold">API Management</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage API keys and track usage.</p>
          </div>
          <Button size="sm" onClick={openCreate} className="text-xs h-8 rounded-lg"><Plus className="w-3.5 h-3.5 mr-1.5" /> Create API Key</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3"><p className="text-[11px] text-muted-foreground">Total Keys</p><p className="text-2xl font-semibold mt-0.5">{keys.length}</p></div>
          <div className="border rounded-lg px-4 py-3"><p className="text-[11px] text-muted-foreground">Active Keys</p><p className="text-2xl font-semibold mt-0.5">{keys.filter(k => k.isActive).length}</p></div>
          <div className="border rounded-lg px-4 py-3"><p className="text-[11px] text-muted-foreground">API Requests</p><p className="text-2xl font-semibold mt-0.5">{usageSummary.totalRequests.toLocaleString()}</p></div>
          <div className="border rounded-lg px-4 py-3"><p className="text-[11px] text-muted-foreground">Avg Latency</p><p className="text-2xl font-semibold mt-0.5">{formatLatency(usageSummary.avgLatencyMs)}</p></div>
        </div>

        {/* Keys List */}
        <div className="border rounded-lg overflow-hidden mb-5">
          <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium flex items-center gap-1.5"><Key className="w-3.5 h-3.5" /> API Keys</p></div>
          {keys.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No API keys yet</div>
          ) : (
            <div className="divide-y">
              {keys.map((key) => (
                <div key={key._id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-medium">{key.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${key.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>{key.isActive ? 'Active' : 'Disabled'}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${key.chatMode === 'native' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'}`}>{key.chatMode === 'native' ? 'Native' : 'Webhook'}</span>
                        {(key.scopes?.length ? key.scopes : ['chat']).map(scope => (
                          <span key={scope} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{scope}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-xs bg-muted px-2 py-1 rounded">{visibleKeys.has(key._id) ? key.key : maskKey(key.key)}</code>
                        <button onClick={() => toggleKeyVisibility(key._id)} className="text-muted-foreground hover:text-foreground">{visibleKeys.has(key._id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                        <button onClick={() => copyToClipboard(key.key)} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                      {key.hasShortKey && key.shortKey && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-muted-foreground">Short:</span>
                          <code className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-2 py-1 rounded font-bold">{key.shortKey}</code>
                          <button onClick={() => copyToClipboard(key.shortKey!)} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground">User: {key.userEmail} · Created: {new Date(key.createdAt).toLocaleDateString()}{key.description && ` · ${key.description}`}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Stream: {key.streamChunkSize || 10} chars / {key.streamDelayMs ?? 22}ms
                      </p>
                    </div>
                    <div className="flex gap-1 ml-4">
                      <button onClick={() => openEdit(key)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleToggleKey(key._id, key.isActive)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Power className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteKey(key._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usage */}
        <div className="border rounded-lg overflow-hidden mb-5">
          <div className="px-4 py-2.5 border-b flex items-center justify-between">
            <button onClick={() => setUsageExpanded(v => !v)} className="text-xs font-medium flex items-center gap-1.5 hover:text-foreground">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${usageExpanded ? 'rotate-180' : ''}`} />
              <Activity className="w-3.5 h-3.5" /> API Usage
              <span className="text-[10px] font-normal text-muted-foreground">({usageSummary.totalRequests.toLocaleString()} requests)</span>
            </button>
            {usageExpanded && (
              <button onClick={loadUsage} className="text-[11px] text-muted-foreground hover:text-foreground">Refresh</button>
            )}
          </div>
          {usageExpanded && (
          <div className="p-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Normal</p>
                <p className="text-lg font-semibold">{usageSummary.normalRequests.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Streaming</p>
                <p className="text-lg font-semibold">{usageSummary.streamingRequests.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Errors</p>
                <p className="text-lg font-semibold">{usageSummary.totalErrors.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Last Error</p>
                <p className="text-xs font-medium truncate">{usageSummary.lastError?.code || (usageSummary.lastError?.status ? `${usageSummary.lastError.status}` : '-')}</p>
              </div>
            </div>

            {recentUsage.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No API usage yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-muted-foreground border-b">
                    <tr>
                      <th className="text-left font-medium py-2 pr-3">Time</th>
                      <th className="text-left font-medium py-2 pr-3">Key</th>
                      <th className="text-left font-medium py-2 pr-3">Endpoint</th>
                      <th className="text-left font-medium py-2 pr-3">Provider</th>
                      <th className="text-left font-medium py-2 pr-3">Mode</th>
                      <th className="text-left font-medium py-2 pr-3">Status</th>
                      <th className="text-left font-medium py-2">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recentUsage.slice(0, 12).map((item: any) => (
                      <tr key={item._id} className="align-top">
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{formatTime(item.timestamp)}</td>
                        <td className="py-2 pr-3 max-w-[160px] truncate">{item.apiKeyName || 'Unknown key'}</td>
                        <td className="py-2 pr-3"><code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{item.endpoint || '-'}</code></td>
                        <td className="py-2 pr-3 text-muted-foreground">{item.provider || '-'}{item.model ? ` / ${item.model}` : ''}</td>
                        <td className="py-2 pr-3">
                          <span className="capitalize">{item.chatMode || '-'}</span>
                          {item.streaming && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">stream</span>}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.responseStatus >= 400 ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'}`}>
                            {item.responseStatus || '-'}
                          </span>
                          {item.errorCode && <span className="ml-1 text-[10px] text-muted-foreground">{item.errorCode}</span>}
                        </td>
                        <td className="py-2">{formatLatency(item.latencyMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}
        </div>

        {/* API Docs (tabbed) */}
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs font-medium">API Usage Guide</p>
            <div className="flex gap-0.5 bg-muted/50 rounded-lg p-0.5">
              <button
                onClick={() => setDocsTab('streaming')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${docsTab === 'streaming' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Chat Streaming
              </button>
              <button
                onClick={() => setDocsTab('ingest')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${docsTab === 'ingest' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Ingest Write
              </button>
            </div>
          </div>

          {docsTab === 'streaming' && (
            <div className="p-4 space-y-3">
              <div><p className="text-[11px] text-muted-foreground mb-1">Endpoint</p><code className="block text-xs bg-muted px-3 py-2 rounded">POST /api/v1/chat/stream</code></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Required scope</p><code className="block text-xs bg-muted px-3 py-2 rounded">chat</code></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Headers</p><code className="block text-xs bg-muted px-3 py-2 rounded">x-api-key: YOUR_API_KEY</code></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Streaming Curl</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`curl -N https://YOUR_DOMAIN/api/v1/chat/stream \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{"message":"Your question","sessionId":"optional"}'`}</pre></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Basic Request</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`{
  "message": "Your question",
  "sessionId": "optional"
}

Ollama-style prompt is also accepted:
{
  "prompt": "Your question",
  "sessionId": "optional"
}`}</pre></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">With Filter (for external data scoping)</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`{
  "message": "show my purchase orders",
  "filter": {
    "externalUserId": "user_123",
    "type": "purchase_order",
    "company": "ABC Sdn Bhd"
  }
}`}</pre></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Streaming Response</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`Response is newline-delimited JSON, compatible with Ollama-style streaming:
{"model":"gemini-2.5-flash","created_at":"2026-06-15T00:00:00.000Z","response":"Hello","done":false}
{"model":"gemini-2.5-flash","created_at":"2026-06-15T00:00:00.100Z","response":" there","done":false}
{"model":"gemini-2.5-flash","created_at":"2026-06-15T00:00:00.250Z","response":"","done":true,"session_id":"...","sources":[],"artifacts":[],"blocked":false,"response_time_ms":250,"total_duration":250000000}

Chunk size and delay are configurable per API key in API Stream Timing.`}</pre></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Postman Notes</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`Chat API:
- Use POST /api/v1/chat/stream for all chat requests.
- Use Postman Send and Download / stream-capable clients for best results.
- Response body is newline-delimited JSON.
- Native mode streams while the LLM generates. Webhook mode streams after the webhook returns its response.
- Stop reading when the JSON chunk has done: true.`}</pre></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Streaming Fetch Example</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`const res = await fetch('/api/v1/chat/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'YOUR_API_KEY'
  },
  body: JSON.stringify({ message: 'Your question', sessionId: 'optional' })
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let fullText = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    const chunk = JSON.parse(line);
    if (chunk.response) {
      fullText += chunk.response;
      process.stdout.write(chunk.response);
    }
    if (chunk.done) {
      console.log('\\nSession:', chunk.session_id);
      break;
    }
  }
}`}</pre></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Error Codes</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`400 BAD_REQUEST              Missing/invalid request body
401 Unauthorized             Missing/invalid API key
403 API_SCOPE_DENIED         API key lacks required scope
429 Too Many Requests        API rate limit hit
502 LLM_AUTH_ERROR           Provider key rejected
503 LLM_RATE_LIMIT           Provider quota/rate limit
504 LLM_TIMEOUT              Provider timeout
500 SERVER_ERROR             Unexpected server error`}</pre></div>
            </div>
          )}

          {docsTab === 'ingest' && (
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-muted-foreground">Push structured (tabular) data from an external app into a managed MySQL data source. Ingested tables become queryable by the chatbot via text-to-SQL and appear under Data Sources.</p>
              <div><p className="text-[11px] text-muted-foreground mb-1">Endpoint</p><code className="block text-xs bg-muted px-3 py-2 rounded">POST /api/v1/ingest/dynamic</code></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Required scope</p><code className="block text-xs bg-muted px-3 py-2 rounded">ingest:write</code></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Headers</p><code className="block text-xs bg-muted px-3 py-2 rounded">x-api-key: YOUR_API_KEY</code></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Dynamic Ingest Curl</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`curl https://YOUR_DOMAIN/api/v1/ingest/dynamic \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "sourceApp": "genform",
    "externalSourceId": "genform:FORM_ID",
    "displayName": "Customer Survey",
    "description": "Responses from the customer survey form",
    "mode": "replace",
    "organizationId": "optional-org-id",
    "fields": [
      { "id": "message", "label": "Message", "type": "text" },
      { "id": "submitted_at", "label": "Submitted At", "type": "date" }
    ],
    "records": [
      { "message": "Great service", "submitted_at": "2026-06-10T04:20:21.000Z" }
    ]
  }'`}</pre></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Body Fields</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`sourceApp        Label for the source system (e.g. "genform"). Default "external".
externalSourceId REQUIRED. Stable unique id for this dataset. Same id updates the same table.
displayName      Human-friendly name shown in Data Sources.
description      Optional description shown to the model + UI.
fields[]         Column schema: { id, label, type }.
                 type: string | text | number | integer | date | boolean
records[]        REQUIRED. Array of row objects keyed by field id. Max 10,000 per request.
mode             "replace" (default) rebuilds/overwrites rows, or "append" adds rows.
organizationId   Optional. Scopes the data source to an organization.`}</pre></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Modes</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`replace  Truncates the table then inserts the sent records.
         Required when the column schema (fields) changes — rebuilds the table.
append   Keeps existing rows and adds the new records (schema must match).`}</pre></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Success Response</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`{
  "success": true,
  "created": true,
  "dataSourceId": "665f...",
  "tableName": "ds_genform_...",
  "inserted": 1,
  "columns": [
    { "name": "message", "type": "text", "label": "Message", "sourceKey": "message" },
    { "name": "submitted_at", "type": "date", "label": "Submitted At", "sourceKey": "submitted_at" }
  ]
}`}</pre></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Notes</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`- Rate limit: 120 requests / minute per API key.
- Re-send with the same externalSourceId to refresh a dataset (use mode=replace).
- Row values are inserted with parameterized queries; table/column names are sanitized.
- Metadata (table name, columns, org scope) is stored in MongoDB; rows live in MySQL.`}</pre></div>
              <div><p className="text-[11px] text-muted-foreground mb-1">Error Codes</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`400 BAD_REQUEST              Missing externalSourceId/records, too many records, or schema changed without mode=replace
401 Unauthorized             Missing/invalid API key
403 API_SCOPE_DENIED         API key lacks the ingest:write scope
429 Too Many Requests        Ingest rate limit hit
503                          MySQL data source storage unavailable
500 INGEST_ERROR             Unexpected server error`}</pre></div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-md mx-4 border max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">{editingKey ? 'Edit API Key' : 'Create API Key'}</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground">Key Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Production App"
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              {!editingKey && (
                <div>
                  <label className="text-[11px] text-muted-foreground">User *</label>
                  <select value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="">Select User</option>
                    {users.map(u => <option key={u._id} value={u._id}>{u.fullName} ({u.email})</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[11px] text-muted-foreground">Description</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g., Robot kiosk at lobby"
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground">Scopes</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { id: 'chat', label: 'Chat' },
                    { id: 'ingest:write', label: 'Ingest Write' },
                  ].map(scope => (
                    <label key={scope.id} className="flex items-center gap-2 text-xs border rounded-lg px-3 py-2 cursor-pointer hover:bg-muted">
                      <input type="checkbox" checked={form.scopes.includes(scope.id)} onChange={() => toggleScope(scope.id)} className="w-3.5 h-3.5 rounded" />
                      {scope.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Chat Mode */}
              <div>
                <label className="text-[11px] text-muted-foreground">Chat Mode</label>
                <div className="flex gap-2 mt-1">
                  {['native', 'webhook'].map(m => (
                    <button key={m} onClick={() => setForm({ ...form, chatMode: m })}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-medium border transition-colors ${form.chatMode === m ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted'}`}>
                      {m === 'native' ? 'Native (Direct)' : 'Webhook (n8n)'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{form.chatMode === 'native' ? 'Server handles RAG search and LLM response directly.' : 'Forwards to n8n webhook for processing.'}</p>
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground">API Stream Timing</label>
                <div className="mt-2 space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs">Chunk size</span>
                      <input type="number" min={2} max={40} value={form.streamChunkSize}
                        onChange={e => setForm({ ...form, streamChunkSize: Math.min(40, Math.max(2, Number(e.target.value) || 10)) })}
                        className="w-20 h-8 px-2 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                    <input type="range" min={2} max={40} value={form.streamChunkSize}
                      onChange={e => setForm({ ...form, streamChunkSize: Number(e.target.value) })}
                      className="w-full mt-1" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs">Delay</span>
                      <input type="number" min={0} max={250} value={form.streamDelayMs}
                        onChange={e => setForm({ ...form, streamDelayMs: Math.min(250, Math.max(0, Number(e.target.value) || 0)) })}
                        className="w-20 h-8 px-2 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                    <input type="range" min={0} max={250} step={5} value={form.streamDelayMs}
                      onChange={e => setForm({ ...form, streamDelayMs: Number(e.target.value) })}
                      className="w-full mt-1" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Applies only to external API stream. Lower chunk size and higher delay make short replies visibly smoother.</p>
              </div>

              {form.chatMode === 'webhook' && (
                <div>
                  <label className="text-[11px] text-muted-foreground">Webhook URL *</label>
                  <input value={form.webhookUrl} onChange={e => setForm({ ...form, webhookUrl: e.target.value })} placeholder="http://n8n:5678/webhook/chat"
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              )}

              {/* System Prompt - only for Native mode */}
              {form.chatMode === 'native' && (
                <div>
                  <label className="text-[11px] text-muted-foreground">System Prompt</label>
                  <textarea value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} rows={4}
                    placeholder="Custom instructions for this API key's chat behavior..."
                    className="w-full px-3 py-2 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                  <p className="text-[10px] text-muted-foreground mt-1">Overrides global system prompt. Leave empty to use default.</p>
                </div>
              )}

              {!editingKey && (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={form.generateShortKey} onChange={e => setForm({ ...form, generateShortKey: e.target.checked })} className="w-3.5 h-3.5 rounded" />
                  Generate Short Key (6 chars)
                </label>
              )}
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleSubmit} className="text-xs h-8 flex-1">{editingKey ? 'Update' : 'Create'}</Button>
                <Button size="sm" variant="outline" onClick={() => setShowModal(false)} className="text-xs h-8">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
