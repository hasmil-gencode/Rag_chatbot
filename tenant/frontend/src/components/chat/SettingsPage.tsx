import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const SettingsPage = () => {
  const [settings, setSettings] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [providerModels, setProviderModels] = useState<{id: string; name: string}[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  // Re-embed state
  const [qdrantInfo, setQdrantInfo] = useState<{dimension: number; points: number; exists: boolean} | null>(null);
  const [showReembedModal, setShowReembedModal] = useState(false);
  const [reembedProgress, setReembedProgress] = useState<{step: string; detail: string; current: number; total: number} | null>(null);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);

  useEffect(() => { loadSettings(); loadQdrantInfo(); }, []);

  const loadSettings = async () => { try { setSettings(await api.getSettings()); } catch (e) { console.error(e); } };
  const loadQdrantInfo = async () => { try { const r = await fetch('/api/qdrant-info', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); setQdrantInfo(await r.json()); } catch {} };
  const MODEL_DIMS: Record<string, number> = { 'text-embedding-004': 768, 'gemini-embedding-001': 3072, 'text-embedding-3-small': 1536, 'text-embedding-3-large': 3072, 'nomic-embed-text-v2-moe': 768, 'nomic-embed-text': 768, 'mistral-embed': 1024 };

  const handleEmbeddingChange = (provider: string) => {
    const defaults: Record<string,string> = { gemini: 'text-embedding-004', openai: 'text-embedding-3-small', mistral: 'mistral-embed' };
    const newModel = defaults[provider] || '';
    const newDim = MODEL_DIMS[newModel] || 768;
    if (qdrantInfo?.exists && qdrantInfo.points > 0 && qdrantInfo.dimension !== newDim) {
      setPendingProvider(provider); setShowReembedModal(true);
    } else {
      updateSettings({ embeddingProvider: provider, embeddingModel: newModel });
    }
  };

  const confirmReembed = () => { if (!pendingProvider) return; const defaults: Record<string,string> = { gemini: 'text-embedding-004', openai: 'text-embedding-3-small', mistral: 'mistral-embed' }; updateSettings({ embeddingProvider: pendingProvider, embeddingModel: defaults[pendingProvider] || '' }); setShowReembedModal(false); setPendingProvider(null); };

  const startReembed = async () => {
    setReembedProgress({ step: 'starting', detail: 'Starting...', current: 0, total: 0 });
    // Save settings first
    try { await api.updateSettings(settings); } catch {}
    const res = await fetch('/api/reembed', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try { const d = JSON.parse(line.slice(6)); setReembedProgress(d); } catch {}
        }
      }
    }
    loadQdrantInfo();
  };
  const loadProviderModels = async (provider?: string) => { 
    const p = provider || settings.chatLlmProvider; 
    if (!p) return; 
    setLoadingModels(true); 
    try { setProviderModels(await api.getProviderModels(p)); } catch {} 
    setLoadingModels(false); 
  };
  const updateSetting = (key: string, value: any) => setSettings((prev: any) => ({ ...prev, [key]: value }));
  const updateSettings = (updates: Record<string, any>) => setSettings((prev: any) => ({ ...prev, ...updates }));

  const handleSave = async () => {
    setIsSaving(true);
    try { await api.updateSettings(settings); toast.success("Settings saved!"); }
    catch (e: any) { toast.error(e.message); }
    finally { setIsSaving(false); }
  };

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'upload', label: 'Upload Processing' },
    { id: 'chat', label: 'Chat' },
    { id: 'guardrail', label: 'Guardrail' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'voice', label: 'Voice' },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Configuration</p>
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage application preferences and integrations.</p>
          </div>
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs h-8 rounded-lg"><Save className="w-3.5 h-3.5 mr-1.5" />{isSaving ? "Saving..." : "Save"}</Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">General Settings</p></div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground">Deleted Chat Retention (days)</label>
                <input type="number" value={settings.deletedChatRetentionDays || 360} onChange={(e) => updateSetting("deletedChatRetentionDays", parseInt(e.target.value))}
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                <p className="text-[10px] text-muted-foreground mt-1">Deleted chats auto-removed after this many days.</p>
              </div>
            </div>
          </div>
        )}

        {/* Webhooks Tab */}
        {/* Upload Processing Tab */}
        {activeTab === 'upload' && (
          <div className="space-y-5">
            {/* Mode Toggle */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Processing Mode</p></div>
              <div className="p-4">
                <div className="flex gap-2">
                  <div className="flex-1 px-4 py-2.5 rounded-lg text-xs font-medium border bg-foreground text-background border-foreground">
                    Online (Cloud APIs)
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Uses cloud APIs for OCR, embedding, and vector storage. Requires API keys.
                </p>
              </div>
            </div>

            {/* OCR Settings */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">OCR Settings</p></div>
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px]">Enable OCR</p>
                    <p className="text-[10px] text-muted-foreground">When disabled, scanned PDFs and images will not be processed.</p>
                  </div>
                  <button onClick={() => updateSetting('ocrEnabled', !settings.ocrEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors ${settings.ocrEnabled !== false ? 'bg-foreground' : 'bg-muted'}`}>
                    <div className={`w-4 h-4 rounded-full bg-background transition-transform mx-0.5 ${settings.ocrEnabled !== false ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Min Text Threshold (characters)</label>
                  <input type="number" value={settings.ocrMinTextThreshold || 50} onChange={(e) => updateSetting('ocrMinTextThreshold', parseInt(e.target.value))}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-1">PDFs with extractable text above this threshold skip OCR. Lower = more OCR, higher = less OCR.</p>
                </div>
              </div>
            </div>

            {/* ── ONLINE MODE ── */}
            {settings.uploadProcessingMode === 'online' && (
              <>
                {/* OCR Provider */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">OCR Provider</p></div>
                  <div className="p-4">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Provider</label>
                      <select value={settings.ocrProvider || 'mistral'} onChange={(e) => updateSetting('ocrProvider', e.target.value)}
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="mistral">Mistral OCR — ~$1/1000 pages</option>
                        <option value="gcdai">Google Cloud Document AI — $1.50/1000 pages</option>
                      </select>
                      <p className="text-[10px] text-muted-foreground mt-1">API key managed in Provider Keys.</p>
                    </div>
                    {settings.ocrProvider === 'gcdai' && (
                      <>
                        <div>
                          <label className="text-[11px] text-muted-foreground">Project ID</label>
                          <input value={settings.gcdaiProjectId || ''} onChange={(e) => updateSetting('gcdaiProjectId', e.target.value)} placeholder="my-project-123"
                            className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground">Location</label>
                          <select value={settings.gcdaiLocation || 'us'} onChange={(e) => updateSetting('gcdaiLocation', e.target.value)}
                            className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                            <option value="us">US</option>
                            <option value="eu">EU</option>
                            <option value="asia-southeast1">Asia Southeast 1 (Singapore)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground">Processor ID</label>
                          <input value={settings.gcdaiProcessorId || ''} onChange={(e) => updateSetting('gcdaiProcessorId', e.target.value)} placeholder="abc123def456"
                            className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                          <p className="text-[10px] text-muted-foreground mt-1">Create an Enterprise Document OCR processor at console.cloud.google.com/document-ai</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Embedding Provider */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Embedding Provider</p></div>
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Provider</label>
                      <select value={settings.embeddingProvider || 'gemini'} onChange={(e) => handleEmbeddingChange(e.target.value)}
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="gemini">Gemini — 3072d — $0.15/1M tokens</option>
                        <option value="mistral">Mistral — 1024d — $0.01/1M tokens</option>
                        <option value="openai">OpenAI — 1536d — $0.02/1M tokens</option>
                      </select>
                    </div>
                    <p className="text-[10px] text-muted-foreground">API key managed in Provider Keys.</p>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Embedding Model</label>
                      <select value={settings.embeddingModel || ''} onChange={(e) => { const m = e.target.value; const newDim = MODEL_DIMS[m] || 768; if (qdrantInfo?.exists && qdrantInfo.points > 0 && qdrantInfo.dimension !== newDim) { setPendingProvider(null); setShowReembedModal(true); updateSetting('embeddingModel', m); } else { updateSetting('embeddingModel', m); } }}
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                        {settings.embeddingProvider === 'gemini' && <>
                          <option value="text-embedding-004">text-embedding-004 (768d)</option>
                          <option value="gemini-embedding-001">gemini-embedding-001 (3072d)</option>
                        </>}
                        {settings.embeddingProvider === 'openai' && <>
                          <option value="text-embedding-3-small">text-embedding-3-small (1536d) — $0.02/1M</option>
                          <option value="text-embedding-3-large">text-embedding-3-large (3072d) — $0.13/1M</option>
                        </>}
                        {settings.embeddingProvider === 'mistral' && <>
                          <option value="mistral-embed">mistral-embed (1024d)</option>
                        </>}
                      </select>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Embedding provider for file upload processing.</p>
                  </div>
                </div>

                {/* Vector DB */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Vector Database</p></div>
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Provider</label>
                      <select value={settings.vectorDbProvider || 'qdrant'} onChange={(e) => updateSetting('vectorDbProvider', e.target.value)}
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="qdrant">Qdrant (Self-hosted) — Free</option>
                        <option value="pinecone">Pinecone (Cloud) — Free tier 2GB</option>
                      </select>
                    </div>
                    {settings.vectorDbProvider === 'pinecone' && <>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Pinecone API key managed in Provider Keys.</p>
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Index Name</label>
                        <input value={settings.pineconeIndexName || ''} onChange={(e) => updateSetting('pineconeIndexName', e.target.value)} placeholder="rag-chatbot"
                          className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Environment</label>
                        <input value={settings.pineconeEnvironment || ''} onChange={(e) => updateSetting('pineconeEnvironment', e.target.value)} placeholder="us-east-1"
                          className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                      </div>
                    </>}
                    {settings.vectorDbProvider === 'qdrant' && <>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Qdrant Host</label>
                        <input value={settings.qdrantHost || 'qdrant'} onChange={(e) => updateSetting('qdrantHost', e.target.value)}
                          className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Qdrant Port</label>
                        <input type="number" value={settings.qdrantPort || 6333} onChange={(e) => updateSetting('qdrantPort', parseInt(e.target.value))}
                          className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                      </div>
                    </>}
                  </div>
                </div>
              </>
            )}

            {/* Chunking Settings */}
              <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Chunking Settings</p></div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[11px] text-muted-foreground">File Storage Path</label>
                  <input value={settings.fileStoragePath || '/app/uploads'} onChange={(e) => updateSetting('fileStoragePath', e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-muted-foreground">Chunk Size (tokens)</label>
                    <input type="number" value={settings.chunkSize || 1000} onChange={(e) => updateSetting('chunkSize', parseInt(e.target.value))}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Chunk Overlap (tokens)</label>
                    <input type="number" value={settings.chunkOverlap || 200} onChange={(e) => updateSetting('chunkOverlap', parseInt(e.target.value))}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Larger chunks retain more context. Overlap ensures no information is lost between chunks.</p>
              </div>
            </div>
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="space-y-5">
            {/* System Prompt */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">System Prompt</p></div>
              <div className="p-4">
                <textarea value={settings.chatSystemPrompt || ''} onChange={(e) => updateSetting('chatSystemPrompt', e.target.value)} rows={6}
                  className="w-full px-3 py-2 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring font-mono" placeholder="You are a helpful AI assistant..." />
                <p className="text-[10px] text-muted-foreground mt-1">System prompt for browser chat. Context from documents will be appended automatically.</p>
              </div>
            </div>

            {/* LLM Provider */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">LLM Provider</p></div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[11px] text-muted-foreground">Provider</label>
                  <select value={settings.chatLlmProvider || 'gemini'} onChange={(e) => { const p = e.target.value; const defaults: Record<string,string> = {gemini:'gemini-2.5-flash'}; updateSettings({chatLlmProvider: p, chatLlmModel: defaults[p] || '', chatLlmApiKey: settings[`chatLlmApiKey_${p}`] || ''}); loadProviderModels(p); }}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="gemini">Gemini</option>
                  </select>
                </div>
                <p className="text-[10px] text-muted-foreground">API key managed in Provider Keys.</p>
                <div>
                  <label className="text-[11px] text-muted-foreground">Model</label>
                    <select value={settings.chatLlmModel || ''} onChange={(e) => updateSetting('chatLlmModel', e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                      {providerModels.length > 0 ? (
                        providerModels.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)
                      ) : (
                        <>
                          {settings.chatLlmProvider === 'gemini' && <><option value="gemini-2.5-flash">gemini-2.5-flash</option><option value="gemini-2.5-pro">gemini-2.5-pro</option></>}
                        </>
                      )}
                    </select>
                  <button onClick={() => loadProviderModels()} disabled={loadingModels} className="text-[10px] text-muted-foreground hover:text-foreground mt-1 underline">
                    {loadingModels ? 'Loading...' : 'Refresh model list'}
                  </button>
                </div>
              </div>
            </div>

            {/* Chat Embedding */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Embedding</p></div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[11px] text-muted-foreground">Provider</label>
                  <select value={settings.chatEmbeddingProvider || 'gemini'} onChange={(e) => {
                    const p = e.target.value;
                    const defaults: Record<string,string> = { gemini: 'gemini-embedding-001', mistral: 'mistral-embed' };
                    updateSettings({ chatEmbeddingProvider: p, chatEmbeddingModel: defaults[p] || '' });
                  }}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="gemini">Gemini — 3072d — $0.15/1M tokens</option>
                    <option value="mistral">Mistral — 1024d — $0.01/1M tokens</option>
                  </select>
                </div>
                <p className="text-[10px] text-muted-foreground">API key managed in Provider Keys.</p>
                <p className="text-[10px] text-amber-500">⚠️ Must match Upload Embedding provider to work correctly.</p>
              </div>
            </div>

            {/* RAG Settings */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">RAG Settings</p></div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[11px] text-muted-foreground">Max Context Chunks</label>
                  <input type="number" value={settings.chatMaxChunks || 5} onChange={(e) => updateSetting('chatMaxChunks', parseInt(e.target.value))}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-1">Number of document chunks to include as context for each chat message.</p>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Streaming Speed</label>
                  <div className="mt-1 grid grid-cols-3 rounded-lg border p-1">
                    {(['fast', 'balanced', 'smooth'] as const).map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => updateSetting('chatStreamingSpeed', speed)}
                        className={`h-8 rounded-md text-[12px] capitalize transition-colors ${
                          (settings.chatStreamingSpeed || 'balanced') === speed
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {speed}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Controls the browser typewriter effect for streamed chat responses.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Guardrail Tab */}
        {activeTab === 'guardrail' && (
          <div className="space-y-5">
            {/* Enable/Disable */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">AI Guardrail</p></div>
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable Guardrail</p>
                    <p className="text-[10px] text-muted-foreground">Check user inputs and AI outputs for safety violations before processing.</p>
                  </div>
                  <button onClick={() => updateSetting('guardrailEnabled', !settings.guardrailEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors ${settings.guardrailEnabled ? 'bg-green-500' : 'bg-muted'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.guardrailEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Guardrail Model</label>
                  <input value={settings.guardrailModel || 'gemini-2.5-flash-lite'} onChange={(e) => updateSetting('guardrailModel', e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-1">Lightweight model for safety classification. Uses Gemini API key from Provider Keys.</p>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Classifier Model (Language & Intent)</label>
                  <input value={settings.classifierModel || 'gemini-2.5-flash'} onChange={(e) => updateSetting('classifierModel', e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-1">Fast model to detect user language and chart intent.</p>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Chart Generation Model</label>
                  <input value={settings.chartModel || 'gemini-2.5-flash'} onChange={(e) => updateSetting('chartModel', e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-1">Model for generating ECharts JSON. Dedicated call — outputs only chart data.</p>
                </div>
              </div>
            </div>

            {/* Input Guard Prompt */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Input Guard Prompt</p></div>
              <div className="p-4">
                <textarea value={settings.guardrailInputPrompt || ''} onChange={(e) => updateSetting('guardrailInputPrompt', e.target.value)} rows={12}
                  className="w-full px-3 py-2 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                <p className="text-[10px] text-muted-foreground mt-1">Checks user messages BEFORE sending to LLM. Must output JSON: {`{"safe": true/false, "reason": "..."}`}</p>
              </div>
            </div>

            {/* Output Guard Prompt */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Output Guard Prompt</p></div>
              <div className="p-4">
                <textarea value={settings.guardrailOutputPrompt || ''} onChange={(e) => updateSetting('guardrailOutputPrompt', e.target.value)} rows={12}
                  className="w-full px-3 py-2 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                <p className="text-[10px] text-muted-foreground mt-1">Checks AI responses BEFORE showing to user. Must output JSON: {`{"safe": true/false, "reason": "..."}`}</p>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-5">
            {/* Toggle */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Quota Notifications</p></div>
              <div className="p-4 space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={settings.notificationsEnabled !== false} onChange={e => updateSetting('notificationsEnabled', e.target.checked)} className="rounded" />
                  <span className="text-xs">Enable quota/storage notifications</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={settings.notifyEmail !== false} onChange={e => updateSetting('notifyEmail', e.target.checked)} className="rounded" />
                  <span className="text-xs">Send email notifications</span>
                </label>
                <div>
                  <label className="text-[11px] text-muted-foreground">Thresholds (%)</label>
                  <input value={(settings.notifyThresholds || [50,60,70,80,90,100]).join(', ')} onChange={e => updateSetting('notifyThresholds', e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)))}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="50, 60, 70, 80, 90, 100" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Notify Roles</label>
                  <div className="flex gap-4 mt-1">
                    {['developer', 'admin'].map(r => (
                      <label key={r} className="flex items-center gap-1.5 cursor-pointer text-xs">
                        <input type="checkbox" checked={(settings.notifyRoles || ['admin','developer']).includes(r)} onChange={e => {
                          const roles = settings.notifyRoles || ['admin','developer'];
                          updateSetting('notifyRoles', e.target.checked ? [...roles, r] : roles.filter((x: string) => x !== r));
                        }} className="rounded" />
                        <span className="capitalize">{r}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* SMTP */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">SMTP Settings</p></div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-muted-foreground">SMTP Host</label>
                    <input value={settings.smtpHost || ''} onChange={e => updateSetting('smtpHost', e.target.value)} placeholder="e.g. smtp.office365.com"
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">SMTP Port</label>
                    <input type="number" value={settings.smtpPort || 587} onChange={e => updateSetting('smtpPort', parseInt(e.target.value))}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">SMTP User (email)</label>
                  <input value={settings.smtpUser || ''} onChange={e => updateSetting('smtpUser', e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="noreply@gencode.com.my" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">SMTP Password</label>
                  <input type="password" value={settings.smtpPassword || ''} onChange={e => updateSetting('smtpPassword', e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-muted-foreground">From Name</label>
                    <input value={settings.smtpFrom || 'Genia System'} onChange={e => updateSetting('smtpFrom', e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={settings.smtpTls !== false} onChange={e => updateSetting('smtpTls', e.target.checked)} className="rounded" />
                      <span className="text-xs">Use TLS</span>
                    </label>
                  </div>
                </div>
                <button type="button" onClick={async () => {
                  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) { toast.error('Fill SMTP settings first'); return; }
                  const testEmail = prompt('Send test email to:', localStorage.getItem('userEmail') || '');
                  if (!testEmail) return;
                  try {
                    const res = await fetch('/api/org-smtp/test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ host: settings.smtpHost, port: settings.smtpPort, user: settings.smtpUser, password: settings.smtpPassword, from: settings.smtpFrom, tls: settings.smtpTls, testEmail }) });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error);
                    toast.success(json.message);
                  } catch (e: any) { toast.error(e.message); }
                }} className="text-xs text-muted-foreground hover:text-foreground underline">Send test email</button>
              </div>
            </div>

            {/* Email Template */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Email Template</p></div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[11px] text-muted-foreground">Subject</label>
                  <input value={settings.notifyEmailSubject || ''} onChange={e => updateSetting('notifyEmailSubject', e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="⚠️ Genia Alert: {{type}} {{threshold}}% used — {{orgName}}" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Body</label>
                  <textarea value={settings.notifyEmailBody || ''} onChange={e => updateSetting('notifyEmailBody', e.target.value)} rows={8}
                    className="w-full px-3 py-2 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring resize-none font-mono"
                    placeholder={'Hi {{adminName}},\n\nYour organization "{{orgName}}" has used {{threshold}}% of the {{type}}.\n\nUsed: {{used}} / {{limit}}\nRemaining: {{remaining}}\n\n— Genia System'} />
                </div>
                <p className="text-[10px] text-muted-foreground">Variables: {'{{orgName}}'}, {'{{adminName}}'}, {'{{type}}'}, {'{{threshold}}'}, {'{{used}}'}, {'{{limit}}'}, {'{{remaining}}'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Voice Tab */}
        {activeTab === 'voice' && (
          <div className="space-y-5">
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Voice Input Configuration</p></div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[11px] text-muted-foreground">Voice Recognition Mode</label>
                  <select value={settings.voiceMode || "gemini"} onChange={(e) => updateSetting("voiceMode", e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="gemini">Gemini AI (Best quality, mixed language)</option>
                  </select>
                </div>
                <p className="text-[10px] text-muted-foreground">API key managed in Provider Keys (Gemini).</p>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Text-to-Speech Configuration</p></div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[11px] text-muted-foreground">TTS Mode</label>
                  <select value={settings.ttsMode || "gemini"} onChange={(e) => updateSetting("ttsMode", e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="gemini">Gemini AI (High quality)</option>
                    <option value="gclas">Google Cloud Long Audio</option>
                  </select>
                </div>
                {settings.ttsMode === "gemini" && (
                  <p className="text-[10px] text-muted-foreground">API key managed in Provider Keys (Gemini).</p>
                )}
                {settings.ttsMode === "gclas" && (
                  <>
                    <p className="text-[10px] text-muted-foreground">Service account managed in Provider Keys (Google Cloud).</p>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Language</label>
                      <select value={settings.gclasLanguage || "auto"} onChange={(e) => updateSetting("gclasLanguage", e.target.value)}
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="auto">Auto-detect</option>
                        <option value="en-US">English (US)</option>
                        <option value="ms-MY">Malay</option>
                        <option value="cmn-CN">Chinese</option>
                        <option value="ta-IN">Tamil</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Voice</label>
                      <input value={settings.gclasVoice || ""} onChange={(e) => updateSetting("gclasVoice", e.target.value)} placeholder="ms-MY-Standard-C"
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Re-embed Warning Modal */}
      {showReembedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl p-5 w-full max-w-md mx-4 border">
            {!reembedProgress ? (<>
              <h2 className="text-sm font-semibold mb-3">Dimension Mismatch</h2>
              <p className="text-xs text-muted-foreground mb-2">Current collection: <span className="text-foreground font-medium">{qdrantInfo?.dimension}d</span> with <span className="text-foreground font-medium">{qdrantInfo?.points}</span> vectors.</p>
              <p className="text-xs text-muted-foreground mb-4">Switching provider requires deleting all vectors and re-embedding all files. This may take a while and cost API credits.</p>
              <div className="flex gap-2">
                <Button size="sm" className="text-xs h-8 flex-1" onClick={() => { confirmReembed(); startReembed(); }}>Re-embed All Files</Button>
                <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => { confirmReembed(); }}>Switch Only (re-embed later)</Button>
                <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => { setShowReembedModal(false); setPendingProvider(null); }}>Cancel</Button>
              </div>
            </>) : (<>
              <h2 className="text-sm font-semibold mb-3">Re-embedding Files</h2>
              <p className="text-xs mb-2">{reembedProgress.detail}</p>
              {reembedProgress.total > 0 && (
                <div className="mb-3">
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-foreground rounded-full transition-all duration-300" style={{ width: `${Math.round((reembedProgress.current / reembedProgress.total) * 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{reembedProgress.current} / {reembedProgress.total} ({Math.round((reembedProgress.current / reembedProgress.total) * 100)}%)</p>
                </div>
              )}
              {reembedProgress.step === 'done' || reembedProgress.step === 'error' ? (
                <Button size="sm" className="text-xs h-8 w-full" onClick={() => { setShowReembedModal(false); setReembedProgress(null); }}>Close</Button>
              ) : null}
            </>)}
          </div>
        </div>
      )}
    </div>
  );
};
