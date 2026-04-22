import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const SettingsPage = () => {
  const [settings, setSettings] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [ollamaLocalModels, setOllamaLocalModels] = useState<any[]>([]);
  const [ollamaCloudModels, setOllamaCloudModels] = useState<any[]>([]);
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
    const defaults: Record<string,string> = { gemini: 'text-embedding-004', openai: 'text-embedding-3-small', mistral: 'mistral-embed', ollama: 'nomic-embed-text-v2-moe' };
    const newModel = defaults[provider] || '';
    const newDim = MODEL_DIMS[newModel] || 768;
    if (qdrantInfo?.exists && qdrantInfo.points > 0 && qdrantInfo.dimension !== newDim) {
      setPendingProvider(provider); setShowReembedModal(true);
    } else {
      updateSettings({ embeddingProvider: provider, embeddingModel: newModel });
    }
  };

  const confirmReembed = () => { if (!pendingProvider) return; const defaults: Record<string,string> = { gemini: 'text-embedding-004', openai: 'text-embedding-3-small', mistral: 'mistral-embed', ollama: 'nomic-embed-text-v2-moe' }; updateSettings({ embeddingProvider: pendingProvider, embeddingModel: defaults[pendingProvider] || '' }); setShowReembedModal(false); setPendingProvider(null); };

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
  const loadOllamaModels = async () => { try { setOllamaLocalModels(await api.getOllamaModels()); } catch {} };
  const loadOllamaCloudModels = async () => { try { setOllamaCloudModels(await api.getOllamaCloudModels()); } catch {} };
  const loadProviderModels = async (provider?: string) => { 
    const p = provider || settings.chatLlmProvider; 
    if (!p || p === 'ollama_local' || p === 'ollama_cloud') return; 
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
                  {['online', 'offline'].map(mode => (
                    <button key={mode} onClick={() => updateSetting('uploadProcessingMode', mode)}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-medium border transition-colors ${settings.uploadProcessingMode === mode ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted'}`}>
                      {mode === 'online' ? 'Online (Cloud APIs)' : 'Offline (Self-hosted)'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {settings.uploadProcessingMode === 'online' ? 'Uses cloud APIs for OCR, embedding, and vector storage. Requires API keys.' : 'Uses local containers for all processing. No external API calls.'}
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
                      <select value={settings.embeddingProvider || 'ollama'} onChange={(e) => handleEmbeddingChange(e.target.value)}
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="gemini">Gemini — 3072d — $0.15/1M tokens</option>
                        <option value="mistral">Mistral — 1024d — $0.01/1M tokens</option>
                        <option value="openai">OpenAI — 1536d — $0.02/1M tokens</option>
                        <option value="ollama">Ollama (Self-hosted) — 768d — Free</option>
                      </select>
                    </div>
                    {settings.embeddingProvider && settings.embeddingProvider !== 'ollama' && (
                      <p className="text-[10px] text-muted-foreground">API key managed in Provider Keys.</p>
                    )}
                    {settings.embeddingProvider === 'ollama' && (
                      <div>
                        <label className="text-[11px] text-muted-foreground">Ollama URL</label>
                        <input value={settings.offlineOllamaUrl || 'http://ollama:11434'} onChange={(e) => updateSetting('offlineOllamaUrl', e.target.value)}
                          className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                      </div>
                    )}
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
                        {settings.embeddingProvider === 'ollama' && <>
                          <option value="nomic-embed-text-v2-moe">nomic-embed-text-v2-moe (768d)</option>
                          <option value="nomic-embed-text">nomic-embed-text (768d)</option>
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

            {/* ── OFFLINE MODE ── */}
            {settings.uploadProcessingMode === 'offline' && (
              <div className="border rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Local Services</p></div>
                <div className="p-4 space-y-4">
                  <div>
                    <label className="text-[11px] text-muted-foreground">OCR Service URL</label>
                    <input value={settings.offlineOcrUrl || 'http://ocr-service:5002'} onChange={(e) => updateSetting('offlineOcrUrl', e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                    <p className="text-[10px] text-muted-foreground mt-1">Offline OCR service URL</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Ollama URL</label>
                    <input value={settings.offlineOllamaUrl || 'http://ollama:11434'} onChange={(e) => updateSetting('offlineOllamaUrl', e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Embedding Model</label>
                    <select value={settings.offlineEmbeddingModel || 'nomic-embed-text-v2-moe'} onChange={(e) => updateSetting('offlineEmbeddingModel', e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="nomic-embed-text-v2-moe">nomic-embed-text-v2-moe (768d, multilingual)</option>
                      <option value="nomic-embed-text">nomic-embed-text (768d)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Qdrant Host</label>
                    <input value={settings.offlineQdrantHost || 'qdrant'} onChange={(e) => updateSetting('offlineQdrantHost', e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Qdrant Port</label>
                    <input type="number" value={settings.offlineQdrantPort || 6333} onChange={(e) => updateSetting('offlineQdrantPort', parseInt(e.target.value))}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </div>
              </div>
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
                  <select value={settings.chatLlmProvider || 'gemini'} onChange={(e) => { const p = e.target.value; const defaults: Record<string,string> = {gemini:'gemini-2.5-flash',openai:'gpt-4o-mini',groq:'llama-3.3-70b-versatile',ollama_cloud:'',ollama_local:''}; updateSettings({chatLlmProvider: p, chatLlmModel: defaults[p] || '', chatLlmApiKey: settings[`chatLlmApiKey_${p}`] || ''}); if (p === 'ollama_local') loadOllamaModels(); else if (p === 'ollama_cloud') loadOllamaCloudModels(); else loadProviderModels(p); }}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="gemini">Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="groq">Groq</option>
                    <option value="ollama_cloud">Ollama Cloud</option>
                    <option value="ollama_local">Ollama Local</option>
                  </select>
                </div>
                {!['ollama_local'].includes(settings.chatLlmProvider) && (
                  <p className="text-[10px] text-muted-foreground">API key managed in Provider Keys.</p>
                )}
                {settings.chatLlmProvider === 'ollama_local' && (
                  <div>
                    <label className="text-[11px] text-muted-foreground">Ollama URL</label>
                    <div className="flex gap-2 mt-1">
                      <input value={settings.chatLlmOllamaUrl || 'http://ollama:11434'} onChange={(e) => updateSetting('chatLlmOllamaUrl', e.target.value)}
                        className="flex-1 h-9 px-3 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                      <button onClick={loadOllamaModels} className="px-3 h-9 text-xs border rounded-lg hover:bg-muted">Refresh</button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-[11px] text-muted-foreground">Model</label>
                  {settings.chatLlmProvider === 'ollama_local' ? (
                    <select value={settings.chatLlmModel || ''} onChange={(e) => updateSetting('chatLlmModel', e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="">Select model...</option>
                      {ollamaLocalModels.map((m: any) => <option key={m.name} value={m.name}>{m.name} ({(m.size / 1e9).toFixed(1)}GB)</option>)}
                    </select>
                  ) : settings.chatLlmProvider === 'ollama_cloud' ? (
                    <select value={settings.chatLlmModel || ''} onChange={(e) => updateSetting('chatLlmModel', e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="">Select model...</option>
                      {ollamaCloudModels.map((m: any) => <option key={m.name} value={m.name}>{m.name}</option>)}
                    </select>
                  ) : (
                    <select value={settings.chatLlmModel || ''} onChange={(e) => updateSetting('chatLlmModel', e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                      {providerModels.length > 0 ? (
                        providerModels.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)
                      ) : (
                        <>
                          {settings.chatLlmProvider === 'gemini' && <><option value="gemini-2.5-flash">gemini-2.5-flash</option><option value="gemini-2.5-pro">gemini-2.5-pro</option></>}
                          {settings.chatLlmProvider === 'openai' && <><option value="gpt-4o">gpt-4o</option><option value="gpt-4o-mini">gpt-4o-mini</option></>}
                          {settings.chatLlmProvider === 'groq' && <><option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option><option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option></>}
                        </>
                      )}
                    </select>
                  )}
                  {!['ollama_local','ollama_cloud'].includes(settings.chatLlmProvider) && (
                    <button onClick={() => loadProviderModels()} disabled={loadingModels} className="text-[10px] text-muted-foreground hover:text-foreground mt-1 underline">
                      {loadingModels ? 'Loading...' : 'Refresh model list'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Chat Embedding */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Embedding</p></div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[11px] text-muted-foreground">Provider</label>
                  <select value={settings.chatEmbeddingProvider || 'ollama'} onChange={(e) => {
                    const p = e.target.value;
                    const defaults: Record<string,string> = { gemini: 'gemini-embedding-001', openai: 'text-embedding-3-small', mistral: 'mistral-embed', ollama: 'nomic-embed-text-v2-moe' };
                    updateSettings({ chatEmbeddingProvider: p, chatEmbeddingModel: defaults[p] || '' });
                  }}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="gemini">Gemini — 3072d — $0.15/1M tokens</option>
                    <option value="mistral">Mistral — 1024d — $0.01/1M tokens</option>
                    <option value="openai">OpenAI — 1536d — $0.02/1M tokens</option>
                    <option value="ollama">Ollama (Self-hosted) — 768d — Free</option>
                  </select>
                </div>
                {settings.chatEmbeddingProvider && settings.chatEmbeddingProvider !== 'ollama' && (
                  <p className="text-[10px] text-muted-foreground">API key managed in Provider Keys.</p>
                )}
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
                    <option value="mistral">Mistral Voxtral (Cheap, accurate, 13 langs)</option>
                  </select>
                </div>
                {settings.voiceMode === "gemini" && (
                  <p className="text-[10px] text-muted-foreground">API key managed in Provider Keys (Gemini).</p>
                )}
                {settings.voiceMode === "mistral" && (
                  <p className="text-[10px] text-muted-foreground">API key managed in Provider Keys (Mistral). Supports EN, ZH, HI, ES, AR, FR, PT, RU, DE, JA, KO, IT, NL.</p>
                )}
                {settings.voiceMode !== "gemini" && (
                  <div>
                    <label className="text-[11px] text-muted-foreground">Voice Language</label>
                    <select value={settings.voiceLanguage || "auto"} onChange={(e) => updateSetting("voiceLanguage", e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="auto">Auto Detect</option>
                      <option value="ms">Malay</option>
                      <option value="en">English</option>
                      <option value="zh">Chinese</option>
                      <option value="ta">Tamil</option>
                    </select>
                  </div>
                )}
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
