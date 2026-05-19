import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useConfirm } from "./ConfirmDialog";
import { api } from "@/lib/api";
import { Plus, Copy, Power, Trash2, Eye, EyeOff, Key, X, Edit2 } from "lucide-react";

interface ApiKey { _id: string; key: string; shortKey?: string; hasShortKey?: boolean; name: string; description?: string; userId: string; userEmail: string; chatMode?: string; webhookUrl?: string; systemPrompt?: string; isActive: boolean; createdAt: string; lastUsedAt: string | null; }

export const ApiManagementPage = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [form, setForm] = useState({ name: "", description: "", userId: "", chatMode: "native", webhookUrl: "", systemPrompt: "", generateShortKey: false });
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const confirm = useConfirm();

  useEffect(() => { loadKeys(); loadUsers(); }, []);

  const loadKeys = async () => { try { setKeys(await api.getApiKeys()); } catch (e: any) { toast.error(e.message); } };
  const loadUsers = async () => { try { setUsers(await api.getUsers()); } catch (e) { setUsers([]); } };

  const openCreate = () => { setEditingKey(null); setForm({ name: "", description: "", userId: "", chatMode: "native", webhookUrl: "", systemPrompt: "", generateShortKey: false }); setShowModal(true); };
  const openEdit = (k: ApiKey) => { setEditingKey(k); setForm({ name: k.name, description: k.description || "", userId: k.userId, chatMode: k.chatMode || "webhook", webhookUrl: k.webhookUrl || "", systemPrompt: k.systemPrompt || "", generateShortKey: false }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.name || (!editingKey && !form.userId)) { toast.error("Fill required fields"); return; }
    if (form.chatMode === "webhook" && !form.webhookUrl) { toast.error("Webhook URL required for webhook mode"); return; }
    try {
      if (editingKey) {
        await api.updateApiKeyDetails(editingKey._id, { name: form.name, description: form.description, chatMode: form.chatMode, webhookUrl: form.webhookUrl, systemPrompt: form.systemPrompt });
      } else {
        await api.createApiKey(form.name, form.userId, form.generateShortKey, null, form.description, form.webhookUrl, form.chatMode, form.systemPrompt);
      }
      setShowModal(false); loadKeys(); toast.success(editingKey ? "Updated" : "Created");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleToggleKey = async (id: string, isActive: boolean) => { try { await api.toggleApiKey(id, !isActive); loadKeys(); } catch (e: any) { toast.error(e.message); } };
  const handleDeleteKey = async (id: string) => { if (!await confirm("Delete this API key?")) return; try { await api.deleteApiKey(id); loadKeys(); toast.success("Deleted"); } catch (e: any) { toast.error(e.message); } };
  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied!"); };
  const toggleKeyVisibility = (id: string) => setVisibleKeys(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const maskKey = (key: string) => key.substring(0, 8) + "..." + key.substring(key.length - 4);

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
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3"><p className="text-[11px] text-muted-foreground">Total Keys</p><p className="text-2xl font-semibold mt-0.5">{keys.length}</p></div>
          <div className="border rounded-lg px-4 py-3"><p className="text-[11px] text-muted-foreground">Active Keys</p><p className="text-2xl font-semibold mt-0.5">{keys.filter(k => k.isActive).length}</p></div>
          <div className="border rounded-lg px-4 py-3"><p className="text-[11px] text-muted-foreground">Active Keys</p><p className="text-2xl font-semibold mt-0.5">{keys.filter(k => k.isActive).length}</p></div>
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

        {/* API Docs */}
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">API Usage Guide</p></div>
          <div className="p-4 space-y-3">
            <div><p className="text-[11px] text-muted-foreground mb-1">Endpoint</p><code className="block text-xs bg-muted px-3 py-2 rounded">POST /api/v1/chat</code></div>
            <div><p className="text-[11px] text-muted-foreground mb-1">Streaming Endpoint</p><code className="block text-xs bg-muted px-3 py-2 rounded">POST /api/v1/chat/stream</code></div>
            <div><p className="text-[11px] text-muted-foreground mb-1">Headers</p><code className="block text-xs bg-muted px-3 py-2 rounded">x-api-key: YOUR_API_KEY</code></div>
            <div><p className="text-[11px] text-muted-foreground mb-1">Basic Request</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`{
  "message": "Your question",
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
            <div><p className="text-[11px] text-muted-foreground mb-1">Streaming Events</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`event: status  // processing state
event: token   // partial response text
event: replace // replace streamed text if response is blocked
event: done    // final response, sessionId, sources
event: error   // request failed`}</pre></div>
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

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  for (const eventBlock of buffer.split('\\n\\n')) {
    if (!eventBlock.includes('data:')) continue;
    const event = eventBlock.match(/^event: (.+)$/m)?.[1];
    const data = JSON.parse(eventBlock.match(/^data: (.+)$/m)?.[1] || '{}');
    if (event === 'token') process.stdout.write(data.token);
    if (event === 'done') console.log(data.sessionId);
  }
}`}</pre></div>
            <div className="pt-1">
              <p className="text-[11px] text-muted-foreground mb-1">Filter Notes</p>
              <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc pl-4">
                <li><code className="text-[10px]">filter</code> — optional object, any key/value pairs to filter Qdrant metadata</li>
                <li><code className="text-[10px]">externalUserId</code> — auto-prefixed with <code className="text-[10px]">ext_</code> and matched against <code className="text-[10px]">shared_with</code></li>
                <li>Other filter keys match exact values in vector payload metadata</li>
                <li>Metadata set during ingest via <code className="text-[10px]">POST /api/ingest</code></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Ingest API Docs — moved to External Knowledge page */}
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
