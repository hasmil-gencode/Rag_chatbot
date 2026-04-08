import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export const SettingsPage = () => {
  const [settings, setSettings] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [ollamaLocalModels, setOllamaLocalModels] = useState<any[]>([]);
  const [ollamaCloudModels, setOllamaCloudModels] = useState<any[]>([]);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [providerModels, setProviderModels] = useState<{id: string; name: string}[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => { try { setSettings(await api.getSettings()); } catch (e) { console.error(e); } };
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
    try { await api.updateSettings(settings); alert("Settings saved!"); }
    catch (e: any) { alert(e.message); }
    finally { setIsSaving(false); }
  };

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'upload', label: 'Upload Processing' },
    { id: 'chat', label: 'Chat' },
    { id: 'voice', label: 'Voice' }
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Configuration</p>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage application preferences and integrations.</p>
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
              <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs h-8"><Save className="w-3.5 h-3.5 mr-1.5" />{isSaving ? "Saving..." : "Save"}</Button>
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
                      {mode === 'online' ? '☁️ Online (Cloud APIs)' : '🖥️ Offline (Self-hosted)'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {settings.uploadProcessingMode === 'online' ? 'Uses cloud APIs for OCR, embedding, and vector storage. Requires API keys.' : 'Uses local containers for all processing. No external API calls.'}
                </p>
              </div>
            </div>

            {/* ── ONLINE MODE ── */}
            {settings.uploadProcessingMode === 'online' && (
              <>
                {/* OCR Provider */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">OCR Provider</p></div>
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Provider</label>
                      <select value={settings.ocrProvider || 'zai'} onChange={(e) => updateSetting('ocrProvider', e.target.value)}
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="zai">Z.ai (GLM-OCR) — ~$0.03/1M tokens</option>
                        <option value="mistral">Mistral OCR — ~$1/1000 pages</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">{settings.ocrProvider === 'mistral' ? 'Mistral' : 'Z.ai'} API Key</label>
                      <input type={showKeys.ocr ? 'text' : 'password'} value={settings.ocrApiKey || ''} onChange={(e) => updateSetting('ocrApiKey', e.target.value)}
                        placeholder={settings.ocrProvider === 'mistral' ? 'sk-...' : 'your-zai-api-key'}
                        className="w-full h-9 px-3 pr-10 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                      <button type="button" onClick={() => setShowKeys(p => ({...p, ocr: !p.ocr}))} className="absolute right-3 bottom-[26px] text-muted-foreground hover:text-foreground text-[11px]">{showKeys.ocr ? 'Hide' : 'Show'}</button>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {settings.ocrProvider === 'mistral' ? 'Get from https://console.mistral.ai' : 'Get from https://open.bigmodel.cn'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Embedding Provider */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Embedding Provider</p></div>
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Provider</label>
                      <select value={settings.embeddingProvider || 'ollama'} onChange={(e) => { const p = e.target.value; updateSettings({embeddingProvider: p, embeddingModel: p === 'gemini' ? 'text-embedding-004' : p === 'openai' ? 'text-embedding-3-small' : 'nomic-embed-text-v2-moe'}); }}
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="gemini">Gemini — $0.15/1M tokens</option>
                        <option value="openai">OpenAI — $0.02-$0.13/1M tokens</option>
                        <option value="ollama">Ollama (Self-hosted) — Free</option>
                      </select>
                    </div>
                    {settings.embeddingProvider !== 'ollama' && (
                      <div>
                        <label className="text-[11px] text-muted-foreground">{settings.embeddingProvider === 'gemini' ? 'Gemini' : 'OpenAI'} API Key</label>
                        <input type={showKeys.embed ? 'text' : 'password'} value={settings.embeddingApiKey || ''} onChange={(e) => updateSetting('embeddingApiKey', e.target.value)}
                          placeholder={settings.embeddingProvider === 'gemini' ? 'AIzaSy...' : 'sk-...'}
                          className="w-full h-9 px-3 pr-10 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                        <button type="button" onClick={() => setShowKeys(p => ({...p, embed: !p.embed}))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[11px]">{showKeys.embed ? 'Hide' : 'Show'}</button>
                      </div>
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
                      <select value={settings.embeddingModel || ''} onChange={(e) => updateSetting('embeddingModel', e.target.value)}
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
                      </select>
                    </div>
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
                        <label className="text-[11px] text-muted-foreground">Pinecone API Key</label>
                        <input type={showKeys.pinecone ? 'text' : 'password'} value={settings.pineconeApiKey || ''} onChange={(e) => updateSetting('pineconeApiKey', e.target.value)} placeholder="pc-..."
                          className="w-full h-9 px-3 pr-10 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                        <button type="button" onClick={() => setShowKeys(p => ({...p, pinecone: !p.pinecone}))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[11px]">{showKeys.pinecone ? 'Hide' : 'Show'}</button>
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
                    <input value={settings.offlineOcrUrl || 'http://glmocr-service:5002'} onChange={(e) => updateSetting('offlineOcrUrl', e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                    <p className="text-[10px] text-muted-foreground mt-1">GLM-OCR SDK + PP-DocLayoutV3 service</p>
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

            {/* Common Settings */}
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

            <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs h-8"><Save className="w-3.5 h-3.5 mr-1.5" />{isSaving ? "Saving..." : "Save Settings"}</Button>
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
                  <select value={settings.chatLlmProvider || 'gemini'} onChange={(e) => { const p = e.target.value; const defaults: Record<string,string> = {gemini:'gemini-2.5-flash',openai:'gpt-4o-mini',groq:'llama-3.3-70b-versatile',zai:'glm-5-turbo',ollama_cloud:'',ollama_local:''}; updateSettings({chatLlmProvider: p, chatLlmModel: defaults[p] || '', chatLlmApiKey: settings[`chatLlmApiKey_${p}`] || ''}); if (p === 'ollama_local') loadOllamaModels(); else if (p === 'ollama_cloud') loadOllamaCloudModels(); else loadProviderModels(p); }}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="gemini">Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="groq">Groq</option>
                    <option value="zai">Z.ai</option>
                    <option value="ollama_cloud">Ollama Cloud</option>
                    <option value="ollama_local">Ollama Local</option>
                  </select>
                </div>
                {!['ollama_local'].includes(settings.chatLlmProvider) && (
                  <div>
                    <label className="text-[11px] text-muted-foreground">API Key</label>
                    <div className="relative mt-1">
                      <input type={showKeys.chatLlm ? 'text' : 'password'} value={settings[`chatLlmApiKey_${settings.chatLlmProvider}`] || settings.chatLlmApiKey || ''} onChange={(e) => updateSettings({[`chatLlmApiKey_${settings.chatLlmProvider}`]: e.target.value, chatLlmApiKey: e.target.value})}
                        className="w-full h-9 px-3 pr-10 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                      <button type="button" onClick={() => setShowKeys(p => ({...p, chatLlm: !p.chatLlm}))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[11px]">{showKeys.chatLlm ? 'Hide' : 'Show'}</button>
                    </div>
                  </div>
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
                          {settings.chatLlmProvider === 'zai' && <><option value="glm-5">glm-5</option><option value="glm-5-turbo">glm-5-turbo</option></>}
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
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Chat Embedding (Query)</p></div>
              <div className="p-4 space-y-4">
                <p className="text-[10px] text-muted-foreground">Embedding model for search queries. Must match dimensions of upload embedding model.</p>
                <div>
                  <label className="text-[11px] text-muted-foreground">Provider</label>
                  <select value={settings.chatEmbeddingProvider || 'ollama'} onChange={(e) => updateSetting('chatEmbeddingProvider', e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="ollama">Ollama (Local)</option>
                    <option value="gemini">Gemini</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>
                {settings.chatEmbeddingProvider !== 'ollama' && (
                  <div>
                    <label className="text-[11px] text-muted-foreground">API Key</label>
                    <input type={showKeys.chatEmbed ? 'text' : 'password'} value={settings.chatEmbeddingApiKey || ''} onChange={(e) => updateSetting('chatEmbeddingApiKey', e.target.value)}
                      className="w-full h-9 px-3 pr-10 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button type="button" onClick={() => setShowKeys(p => ({...p, chatEmbed: !p.chatEmbed}))} className="absolute right-7 top-[38px] text-muted-foreground hover:text-foreground text-[11px]">{showKeys.chatEmbed ? 'Hide' : 'Show'}</button>
                  </div>
                )}
                {settings.chatEmbeddingProvider === 'ollama' && (
                  <div>
                    <label className="text-[11px] text-muted-foreground">Ollama URL</label>
                    <input value={settings.chatEmbeddingOllamaUrl || 'http://ollama:11434'} onChange={(e) => updateSetting('chatEmbeddingOllamaUrl', e.target.value)}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                )}
                <div>
                  <label className="text-[11px] text-muted-foreground">Model</label>
                  <select value={settings.chatEmbeddingModel || ''} onChange={(e) => updateSetting('chatEmbeddingModel', e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    {settings.chatEmbeddingProvider === 'ollama' && <><option value="nomic-embed-text-v2-moe">nomic-embed-text-v2-moe (768d)</option><option value="nomic-embed-text">nomic-embed-text (768d)</option></>}
                    {settings.chatEmbeddingProvider === 'gemini' && <><option value="text-embedding-004">text-embedding-004 (768d)</option><option value="gemini-embedding-001">gemini-embedding-001 (3072d)</option></>}
                    {settings.chatEmbeddingProvider === 'openai' && <><option value="text-embedding-3-small">text-embedding-3-small (1536d)</option><option value="text-embedding-3-large">text-embedding-3-large (3072d)</option></>}
                  </select>
                </div>
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
                  <label className="text-[11px] text-muted-foreground">Show Sources (default for new users)</label>
                  <select value={settings.chatShowSourcesDefault ? 'true' : 'false'} onChange={(e) => updateSetting('chatShowSourcesDefault', e.target.value === 'true')}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="true">Yes — Show source citations</option>
                    <option value="false">No — Hide source citations</option>
                  </select>
                </div>
              </div>
            </div>

            <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs h-8"><Save className="w-3.5 h-3.5 mr-1.5" />{isSaving ? "Saving..." : "Save Settings"}</Button>
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
                  <select value={settings.voiceMode || "browser"} onChange={(e) => updateSetting("voiceMode", e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="browser">Browser (Free, instant, Chrome only)</option>
                    <option value="gemini">Gemini AI (Best quality, AI-powered)</option>
                    <option value="elevenlabs">ElevenLabs (Fast, accurate)</option>
                  </select>
                </div>
                {settings.voiceMode === "gemini" && (
                  <div>
                    <label className="text-[11px] text-muted-foreground">Gemini STT API Key</label>
                    <input type="password" value={settings.geminiSttApiKey || ""} onChange={(e) => updateSetting("geminiSttApiKey", e.target.value)} placeholder="AIzaSy..."
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                )}
                {settings.voiceMode === "elevenlabs" && (
                  <div>
                    <label className="text-[11px] text-muted-foreground">ElevenLabs API Key</label>
                    <input type="password" value={settings.elevenlabsApiKey || ""} onChange={(e) => updateSetting("elevenlabsApiKey", e.target.value)} placeholder="sk_..."
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
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
                  <select value={settings.ttsMode || "browser"} onChange={(e) => updateSetting("ttsMode", e.target.value)}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="browser">Browser (Free, works offline)</option>
                    <option value="gemini">Gemini AI (High quality)</option>
                    <option value="elevenlabs">ElevenLabs (Best quality)</option>
                    <option value="gclas">Google Cloud Long Audio</option>
                  </select>
                </div>
                {settings.ttsMode === "gemini" && (
                  <div>
                    <label className="text-[11px] text-muted-foreground">Gemini TTS API Key</label>
                    <input type="password" value={settings.geminiTtsApiKey || ""} onChange={(e) => updateSetting("geminiTtsApiKey", e.target.value)} placeholder="AIzaSy..."
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                )}
                {settings.ttsMode === "gclas" && (
                  <>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Google Cloud Service Account JSON</label>
                      <textarea value={settings.gclasServiceAccount || ""} onChange={(e) => updateSetting("gclasServiceAccount", e.target.value)}
                        className="w-full h-24 px-3 py-2 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                    </div>
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
                {settings.ttsMode === "elevenlabs" && (
                  <>
                    <div>
                      <label className="text-[11px] text-muted-foreground">ElevenLabs API Key</label>
                      <input type="password" value={settings.elevenlabsApiKey || ""} onChange={(e) => updateSetting("elevenlabsApiKey", e.target.value)} placeholder="sk_..."
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Voice ID</label>
                      <input value={settings.elevenlabsVoice || ""} onChange={(e) => updateSetting("elevenlabsVoice", e.target.value)} placeholder="EXAVITQu4vr4xnSDxMaL"
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  </>
                )}
                <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs h-8"><Save className="w-3.5 h-3.5 mr-1.5" />{isSaving ? "Saving..." : "Save"}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
