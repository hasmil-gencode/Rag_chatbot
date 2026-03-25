import { useState, useEffect, useRef } from "react";
import { Save, Trash2, Download, X, Loader2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";

export const SettingsPage = () => {
  const [settings, setSettings] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [webhookTestResult, setWebhookTestResult] = useState<any>(null);
  const [s3TestResult, setS3TestResult] = useState<any>(null);
  const [ollamaTestResult, setOllamaTestResult] = useState<any>(null);
  const [ollamaModels, setOllamaModels] = useState<any[]>([]);
  const [showModelManager, setShowModelManager] = useState(false);
  const [pullModelName, setPullModelName] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<{ status: string; percent: number } | null>(null);
  const [termModel, setTermModel] = useState("");
  const [termInput, setTermInput] = useState("");
  const [termOutput, setTermOutput] = useState<string[]>([]);
  const [termLoading, setTermLoading] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try { setSettings(await api.getSettings()); } catch (error) { console.error(error); }
    loadOllamaModels();
  };

  const loadOllamaModels = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/test-ollama", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
      const data = await res.json();
      if (data.success) setOllamaModels(data.models || []);
    } catch {}
  };

  const handlePullModel = async () => {
    if (!pullModelName.trim()) return;
    setIsPulling(true);
    setPullProgress({ status: 'Starting...', percent: 0 });
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/ollama/pull", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: pullModelName.trim() }) });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.error) { setPullProgress({ status: `Error: ${d.error}`, percent: 0 }); continue; }
            if (d.status === 'done') { setPullProgress({ status: 'Done!', percent: 100 }); continue; }
            const pct = d.total ? Math.round((d.completed || 0) / d.total * 100) : 0;
            const sizeMB = d.total ? `${((d.completed || 0) / 1e6).toFixed(0)}/${(d.total / 1e6).toFixed(0)} MB` : '';
            setPullProgress({ status: `${d.status}${sizeMB ? ' — ' + sizeMB : ''}`, percent: pct });
          } catch {}
        }
      }
      setPullModelName("");
      await loadOllamaModels();
      setTimeout(() => setPullProgress(null), 2000);
    } catch (e: any) { setPullProgress({ status: `Error: ${e.message}`, percent: 0 }); }
    finally { setIsPulling(false); }
  };

  const handleDeleteModel = async (name: string) => {
    if (!confirm(`Delete model "${name}"?`)) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/ollama/delete", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: name }) });
      const data = await res.json();
      if (res.ok) { await loadOllamaModels(); alert(data.message); }
      else alert(data.error || "Failed to delete");
    } catch (e: any) { alert(e.message); }
  };

  const handleTermSend = async () => {
    if (!termInput.trim() || !termModel || termLoading) return;
    const msg = termInput.trim();
    setTermInput("");
    setTermOutput(prev => [...prev, `> ${msg}`]);
    setTermLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/ollama/chat", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: termModel, message: msg }) });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");
      let full = '';
      setTermOutput(prev => [...prev, '']);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.response) {
              full += d.response;
              setTermOutput(prev => [...prev.slice(0, -1), full]);
            }
          } catch {}
        }
      }
      setTimeout(() => termRef.current?.scrollTo(0, termRef.current.scrollHeight), 50);
    } catch (e: any) { setTermOutput(prev => [...prev, `Error: ${e.message}`]); }
    finally { setTermLoading(false); }
  };

  const updateSetting = (key: string, value: any) => setSettings({ ...settings, [key]: value });

  const handleSave = async () => {
    setIsSaving(true);
    try { await api.updateSettings(settings); alert("Settings saved successfully!"); }
    catch (error: any) { alert(error.message); }
    finally { setIsSaving(false); }
  };

  const handleTestWebhook = async (type: string) => {
    setWebhookTestResult(null);
    try {
      const url = type === 'chat' ? settings.chatWebhook : settings.uploadWebhook;
      const token = localStorage.getItem("token");
      const response = await fetch("/api/test-webhook", { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await response.json();
      setWebhookTestResult(data.success ? { type: 'success', message: `${type} webhook is working!` } : { type: 'error', message: data.error || 'Webhook test failed' });
    } catch (error: any) { setWebhookTestResult({ type: 'error', message: error.message }); }
  };

  const handleTestS3 = async () => {
    setS3TestResult(null);
    try { await api.testS3(settings); setS3TestResult({ type: 'success', message: 'S3 connection successful!' }); }
    catch (error: any) { setS3TestResult({ type: 'error', message: error.message }); }
  };

  const handleTestOllama = async () => {
    setOllamaTestResult(null);
    try {
      const result = await api.testOllama();
      const names = result.models?.map((m: any) => m.name || m) || [];
      setOllamaModels(result.models || []);
      setOllamaTestResult({ type: 'success', message: `Connected! Models: ${names.join(', ') || 'none'}` });
    } catch (error: any) { setOllamaTestResult({ type: 'error', message: error.message }); }
  };

  const SaveButton = ({ label = "Save Settings" }: { label?: string }) => (
    <Button onClick={handleSave} disabled={isSaving}><Save className="w-4 h-4 mr-2" />{isSaving ? "Saving..." : label}</Button>
  );

  const ResultBanner = ({ result }: { result: any }) => result ? (
    <div className={`p-3 rounded-lg text-sm ${result.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{result.message}</div>
  ) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your application preferences and integrations</p>
        </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="ai">AI Models</TabsTrigger>
        </TabsList>

        {/* ===== GENERAL ===== */}
        <TabsContent value="general">
          <Card>
            <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Deleted Chat Retention (days)</Label>
                <Input type="number" value={settings.deletedChatRetentionDays || 360} onChange={(e) => updateSetting("deletedChatRetentionDays", parseInt(e.target.value))} placeholder="360" />
                <p className="text-xs text-muted-foreground mt-1">Deleted chats will be automatically removed after this many days.</p>
              </div>
              <SaveButton />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== WEBHOOKS ===== */}
        <TabsContent value="webhooks">
          <Card>
            <CardHeader><CardTitle>n8n Webhook URLs</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Chat Webhook</Label>
                <div className="flex gap-2">
                  <Input value={settings.chatWebhook || ""} onChange={(e) => updateSetting("chatWebhook", e.target.value)} placeholder="https://n8n.example.com/webhook/chat" className="flex-1" />
                  <Button variant="outline" onClick={() => handleTestWebhook('chat')} disabled={!settings.chatWebhook}>Test</Button>
                </div>
              </div>
              <div>
                <Label>Upload Webhook</Label>
                <div className="flex gap-2">
                  <Input value={settings.uploadWebhook || ""} onChange={(e) => updateSetting("uploadWebhook", e.target.value)} placeholder="https://n8n.example.com/webhook/upload" className="flex-1" />
                  <Button variant="outline" onClick={() => handleTestWebhook('upload')} disabled={!settings.uploadWebhook}>Test</Button>
                </div>
              </div>
              <ResultBanner result={webhookTestResult} />
              <SaveButton label="Save Webhooks" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== STORAGE ===== */}
        <TabsContent value="storage">
          <Card>
            <CardHeader><CardTitle>File Storage</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Storage Mode</Label>
                <select value={settings.storageMode || "local"} onChange={(e) => updateSetting("storageMode", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                  <option value="local">Local Folder (Offline)</option>
                  <option value="s3">AWS S3 (Cloud)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.storageMode === "s3" ? "Files uploaded to AWS S3 bucket. Requires internet." : "Files stored locally in Docker volume. No internet needed."}
                </p>
              </div>

              {settings.storageMode === "s3" && (
                <>
                  <div><Label>S3 Bucket Name</Label><Input value={settings.s3Bucket || ""} onChange={(e) => updateSetting("s3Bucket", e.target.value)} placeholder="my-bucket-name" /></div>
                  <div><Label>S3 Region</Label><Input value={settings.s3Region || ""} onChange={(e) => updateSetting("s3Region", e.target.value)} placeholder="us-east-1" /></div>
                  <div><Label>AWS Access Key ID</Label><Input value={settings.s3AccessKey || ""} onChange={(e) => updateSetting("s3AccessKey", e.target.value)} placeholder="AKIAIOSFODNN7EXAMPLE" /></div>
                  <div><Label>AWS Secret Access Key</Label><Input type="password" value={settings.s3SecretKey || ""} onChange={(e) => updateSetting("s3SecretKey", e.target.value)} placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" /></div>
                  <ResultBanner result={s3TestResult} />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleTestS3}>Test Connection</Button>
                    <SaveButton label="Save S3 Settings" />
                  </div>
                </>
              )}

              {settings.storageMode !== "s3" && (
                <>
                  <div>
                    <Label>Local Storage Path</Label>
                    <Input value={settings.localStoragePath || "/app/uploads"} disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground mt-1">Files are stored in the Docker volume mapped to this path.</p>
                  </div>
                  <SaveButton />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== VOICE ===== */}
        <TabsContent value="voice">
          <Card>
            <CardHeader><CardTitle>Voice Input (STT)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Voice Recognition Mode</Label>
                <select value={settings.voiceMode || "browser"} onChange={(e) => updateSetting("voiceMode", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                  <option value="browser">Browser (Free, instant, Chrome only)</option>
                  <option value="local">Local Whisper (Offline, multilingual)</option>
                  <option value="gemini">Gemini AI (Best quality, cloud)</option>
                  <option value="elevenlabs">ElevenLabs (Fast, cloud)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.voiceMode === "local" && "Uses local Faster-Whisper model. Supports 100+ languages including Malay. No internet needed."}
                  {settings.voiceMode === "browser" && "Uses browser's built-in speech recognition. Chrome only."}
                  {settings.voiceMode === "gemini" && "Gemini AI: Best quality, handles noisy audio, requires API key."}
                  {settings.voiceMode === "elevenlabs" && "ElevenLabs: Fast transcription, requires API key."}
                </p>
              </div>

              {settings.voiceMode === "local" && (
                <div>
                  <Label>Whisper API URL</Label>
                  <Input value={settings.whisperUrl || ""} onChange={(e) => updateSetting("whisperUrl", e.target.value)} placeholder="http://faster-whisper:8080" />
                  <p className="text-xs text-muted-foreground mt-1">URL of the Faster-Whisper container.</p>
                </div>
              )}

              {settings.voiceMode === "gemini" && (
                <div>
                  <Label>Gemini STT API Key</Label>
                  <Input type="password" value={settings.geminiSttApiKey || ""} onChange={(e) => updateSetting("geminiSttApiKey", e.target.value)} placeholder="AIzaSy..." />
                  <p className="text-xs text-muted-foreground mt-1">Get from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google AI Studio</a>.</p>
                </div>
              )}

              {settings.voiceMode === "elevenlabs" && (
                <div>
                  <Label>ElevenLabs API Key</Label>
                  <Input type="password" value={settings.elevenlabsApiKey || ""} onChange={(e) => updateSetting("elevenlabsApiKey", e.target.value)} placeholder="sk_..." />
                </div>
              )}

              {settings.voiceMode !== "gemini" && (
                <div>
                  <Label>Voice Language</Label>
                  <select value={settings.voiceLanguage || "auto"} onChange={(e) => updateSetting("voiceLanguage", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="auto">Auto Detect</option>
                    <option value="ms">Malay</option>
                    <option value="en">English</option>
                    <option value="zh">Chinese</option>
                    <option value="ta">Tamil</option>
                  </select>
                </div>
              )}

              <SaveButton label="Save Voice Input" />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader><CardTitle>Text-to-Speech (TTS)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>TTS Mode</Label>
                <select value={settings.ttsMode || "browser"} onChange={(e) => updateSetting("ttsMode", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                  <option value="browser">Browser (Free, works offline)</option>
                  <option value="local">Local Chatterbox (Offline, Malay supported)</option>
                  <option value="gemini">Gemini AI (High quality, cloud)</option>
                  <option value="elevenlabs">ElevenLabs (Best quality, cloud)</option>
                  <option value="gclas">Google Cloud Long Audio (Async, cloud)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.ttsMode === "local" && "Uses local Chatterbox TTS. Supports 23 languages including Malay. No internet needed."}
                  {settings.ttsMode === "browser" && "Uses device's built-in voices, no internet needed."}
                  {settings.ttsMode === "gemini" && "Gemini AI: Natural voices, requires API key."}
                  {settings.ttsMode === "elevenlabs" && "ElevenLabs: Professional voices, requires API key."}
                  {settings.ttsMode === "gclas" && "Google Cloud: Async processing, requires service account."}
                </p>
              </div>

              {settings.ttsMode === "local" && (
                <>
                  <div>
                    <Label>Chatterbox URL</Label>
                    <Input value={settings.chatterboxUrl || ""} onChange={(e) => updateSetting("chatterboxUrl", e.target.value)} placeholder="http://chatterbox:8000" />
                  </div>
                  <div>
                    <Label>Voice</Label>
                    <Input value={settings.chatterboxVoice || "default"} onChange={(e) => updateSetting("chatterboxVoice", e.target.value)} placeholder="default" />
                  </div>
                </>
              )}

              {settings.ttsMode === "gemini" && (
                <>
                  <div><Label>Gemini TTS API Key</Label><Input type="password" value={settings.geminiTtsApiKey || ""} onChange={(e) => updateSetting("geminiTtsApiKey", e.target.value)} placeholder="AIzaSy..." /></div>
                  <div>
                    <Label>Voice</Label>
                    <Input value={settings.geminiVoice || "Aoede"} onChange={(e) => updateSetting("geminiVoice", e.target.value)} placeholder="Aoede" />
                  </div>
                </>
              )}

              {settings.ttsMode === "gclas" && (
                <>
                  <div>
                    <Label>Google Cloud Service Account JSON</Label>
                    <textarea value={settings.gclasServiceAccount || ""} onChange={(e) => updateSetting("gclasServiceAccount", e.target.value)} placeholder='{"type": "service_account", ...}' className="w-full h-32 px-3 py-2 rounded-md border border-input bg-background text-sm font-mono" />
                  </div>
                  <div>
                    <Label>Language</Label>
                    <select value={settings.gclasLanguage || "auto"} onChange={(e) => updateSetting("gclasLanguage", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                      <option value="auto">Auto-detect</option>
                      <option value="en-US">English (US)</option>
                      <option value="ms-MY">Malay (Malaysia)</option>
                      <option value="cmn-CN">Chinese (Mandarin)</option>
                      <option value="ta-IN">Tamil (India)</option>
                    </select>
                  </div>
                  <div><Label>Voice</Label><Input value={settings.gclasVoice || ""} onChange={(e) => updateSetting("gclasVoice", e.target.value)} placeholder="ms-MY-Standard-C" /></div>
                </>
              )}

              {settings.ttsMode === "elevenlabs" && (
                <>
                  <div><Label>ElevenLabs API Key</Label><Input type="password" value={settings.elevenlabsApiKey || ""} onChange={(e) => updateSetting("elevenlabsApiKey", e.target.value)} placeholder="sk_..." /></div>
                  <div><Label>Voice ID</Label><Input value={settings.elevenlabsVoice || ""} onChange={(e) => updateSetting("elevenlabsVoice", e.target.value)} placeholder="EXAVITQu4vr4xnSDxMaL" /></div>
                </>
              )}

              <SaveButton label="Save TTS Settings" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== AI MODELS ===== */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Ollama Configuration</CardTitle>
                <Button variant="outline" size="sm" onClick={() => { setShowModelManager(true); loadOllamaModels(); }}>Manage Models</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Configure local AI models for chat and embedding. Used by n8n workflows.</p>
              <div>
                <Label>Ollama URL</Label>
                <Input value={settings.ollamaUrl || ""} onChange={(e) => updateSetting("ollamaUrl", e.target.value)} placeholder="http://ollama:11434" />
                <p className="text-xs text-muted-foreground mt-1">Internal Docker URL for Ollama service.</p>
              </div>
              <div>
                <Label>Chat Model</Label>
                <select value={settings.ollamaModel || ""} onChange={(e) => updateSetting("ollamaModel", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                  <option value="">-- Select Model --</option>
                  {ollamaModels.filter(m => m.family !== 'nomic-bert').map(m => (
                    <option key={m.name} value={m.name}>{m.name} ({(m.size / 1e9).toFixed(1)}GB)</option>
                  ))}
                </select>
                {settings.ollamaModel && !ollamaModels.find(m => m.name === settings.ollamaModel) && ollamaModels.length > 0 && (
                  <p className="text-xs text-red-500 mt-1">⚠ Model "{settings.ollamaModel}" not found. Pull it or select another.</p>
                )}
              </div>
              <div>
                <Label>Embedding Model</Label>
                <select value={settings.ollamaEmbeddingModel || ""} onChange={(e) => updateSetting("ollamaEmbeddingModel", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                  <option value="">-- Select Model --</option>
                  {ollamaModels.filter(m => m.family === 'nomic-bert' || m.name.includes('embed')).map(m => (
                    <option key={m.name} value={m.name}>{m.name} ({(m.size / 1e6).toFixed(0)}MB)</option>
                  ))}
                </select>
              </div>
              <ResultBanner result={ollamaTestResult} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleTestOllama}>Test Connection</Button>
                <SaveButton label="Save AI Settings" />
              </div>
            </CardContent>
          </Card>

          {/* Model Manager Modal */}
          {showModelManager && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModelManager(false)}>
              <div className="bg-background border rounded-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-semibold text-lg">Manage Ollama Models</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowModelManager(false)}><X className="w-4 h-4" /></Button>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto max-h-[78vh]">
                  {/* Pull new model */}
                  <div>
                    <Label>Pull New Model</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={pullModelName} onChange={e => setPullModelName(e.target.value)} placeholder="e.g. qwen2.5:3b, gemma3:4b" className="flex-1" disabled={isPulling} onKeyDown={e => e.key === 'Enter' && handlePullModel()} />
                      <Button onClick={handlePullModel} disabled={isPulling || !pullModelName.trim()}>
                        {isPulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Browse models at <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ollama.com/library</a></p>
                    {pullProgress && (
                      <div className="mt-2 space-y-1">
                        <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                          <div className="bg-primary h-full rounded-full transition-all duration-300" style={{ width: `${pullProgress.percent}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">{pullProgress.status} {pullProgress.percent > 0 && pullProgress.percent < 100 ? `(${pullProgress.percent}%)` : ''}</p>
                      </div>
                    )}
                  </div>

                  {/* Installed models */}
                  <div>
                    <Label>Installed Models ({ollamaModels.length})</Label>
                    <div className="mt-2 space-y-2">
                      {ollamaModels.length === 0 && <p className="text-sm text-muted-foreground">No models installed</p>}
                      {ollamaModels.map(m => (
                        <div key={m.name} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium text-sm">{m.name}</p>
                            <p className="text-xs text-muted-foreground">{(m.size / 1e9).toFixed(2)} GB • {m.family || 'unknown'}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteModel(m.name)} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Terminal - Test Model */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Terminal className="w-4 h-4" />
                      <Label>Test Model</Label>
                    </div>
                    <select value={termModel} onChange={e => { setTermModel(e.target.value); setTermOutput([]); }} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm mb-2">
                      <option value="">-- Select Model --</option>
                      {ollamaModels.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                    </select>
                    {termModel && (
                      <>
                        <div ref={termRef} className="bg-black text-green-400 font-mono text-xs p-3 rounded-lg h-48 overflow-y-auto whitespace-pre-wrap">
                          <p className="text-muted-foreground mb-1">ollama run {termModel}</p>
                          {termOutput.map((line, i) => <p key={i} className={line.startsWith('>') ? 'text-white' : ''}>{line}</p>)}
                          {termLoading && <span className="animate-pulse">▊</span>}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Input value={termInput} onChange={e => setTermInput(e.target.value)} placeholder="Type a message..." className="flex-1 font-mono text-sm" disabled={termLoading} onKeyDown={e => e.key === 'Enter' && handleTermSend()} />
                          <Button size="sm" onClick={handleTermSend} disabled={termLoading || !termInput.trim()}>Send</Button>
                          <Button size="sm" variant="outline" onClick={() => setTermOutput([])}>Clear</Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};
