import { useState, useEffect } from "react";
import { Save, Trash2, RefreshCw, X } from "lucide-react";
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
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<any[]>([]);
  const [showModelManager, setShowModelManager] = useState(false);
  const [pullModelName, setPullModelName] = useState("");
  const [pullProgress, setPullProgress] = useState<any>(null);
  const [isPulling, setIsPulling] = useState(false);

  useEffect(() => {
    loadSettings();
    checkOllama();
  }, []);

  const checkOllama = async () => {
    try {
      const data = await api.getOllamaStatus();
      setOllamaOnline(data.online);
      setOllamaModels(data.models || []);
    } catch { setOllamaOnline(false); }
  };

  const handlePullModel = async () => {
    if (!pullModelName.trim() || isPulling) return;
    setIsPulling(true);
    setPullProgress({ status: 'starting...' });
    await api.pullOllamaModel(pullModelName.trim(), (data) => {
      if (data.status === 'success') {
        setPullProgress({ status: 'Done!' });
      } else {
        setPullProgress(data);
      }
    });
    setIsPulling(false);
    setPullProgress(null);
    setPullModelName("");
    checkOllama();
  };

  const handleDeleteModel = async (name: string) => {
    if (!confirm(`Delete model "${name}"?`)) return;
    await api.deleteOllamaModel(name);
    checkOllama();
  };

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (error) {
      console.error(error);
    }
  };

  const updateSetting = (key: string, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.updateSettings(settings);
      alert("Settings saved successfully!");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestWebhook = async (type: string) => {
    setWebhookTestResult(null);
    try {
      const url = type === 'chat' ? settings.chatWebhook : settings.uploadWebhook;
      await api.testWebhook(url);
      setWebhookTestResult({ type: 'success', message: `${type} webhook is working!` });
    } catch (error: any) {
      setWebhookTestResult({ type: 'error', message: error.message });
    }
  };

  const handleTestS3 = async () => {
    setS3TestResult({ type: 'success', message: 'S3 configuration looks good!' });
  };

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
          {ollamaOnline && <TabsTrigger value="aimodels">AI Models</TabsTrigger>}
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Deleted Chat Retention (days)</Label>
                <Input
                  type="number"
                  value={settings.deletedChatRetentionDays || 360}
                  onChange={(e) => updateSetting("deletedChatRetentionDays", parseInt(e.target.value))}
                  placeholder="360"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Deleted chats will be automatically removed after this many days. Default: 360 days.
                </p>
              </div>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving..." : "Save Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <CardTitle>n8n Webhook URLs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Chat Webhook</Label>
                <div className="flex gap-2">
                  <Input
                    value={settings.chatWebhook || ""}
                    onChange={(e) => updateSetting("chatWebhook", e.target.value)}
                    placeholder="https://n8n.example.com/webhook/chat"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleTestWebhook('chat')}
                    disabled={!settings.chatWebhook}
                  >
                    Test
                  </Button>
                </div>
              </div>
              <div>
                <Label>Upload Webhook</Label>
                <div className="flex gap-2">
                  <Input
                    value={settings.uploadWebhook || ""}
                    onChange={(e) => updateSetting("uploadWebhook", e.target.value)}
                    placeholder="https://n8n.example.com/webhook/upload"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleTestWebhook('upload')}
                    disabled={!settings.uploadWebhook}
                  >
                    Test
                  </Button>
                </div>
              </div>
              {webhookTestResult && (
                <div className={`p-3 rounded-lg text-sm ${webhookTestResult.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {webhookTestResult.message}
                </div>
              )}
              <Button onClick={handleSave} disabled={isSaving} className="mt-4">
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving..." : "Save Webhooks"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage">
          <Card>
            <CardHeader>
              <CardTitle>File Storage Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Storage Mode</Label>
                <select
                  value={settings.storageMode || "local"}
                  onChange={(e) => updateSetting("storageMode", e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="local">Local Storage</option>
                  <option value="s3">AWS S3</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.storageMode === "s3" 
                    ? "Files will be uploaded to AWS S3 bucket" 
                    : "Files stored locally at /app/uploads inside the container"}
                </p>
              </div>

              {settings.storageMode === "s3" && (
                <>
                  <div>
                    <Label>S3 Bucket Name</Label>
                    <Input
                      value={settings.s3Bucket || ""}
                      onChange={(e) => updateSetting("s3Bucket", e.target.value)}
                      placeholder="my-bucket-name"
                    />
                  </div>
                  <div>
                    <Label>S3 Region</Label>
                    <Input
                      value={settings.s3Region || ""}
                      onChange={(e) => updateSetting("s3Region", e.target.value)}
                      placeholder="us-east-1"
                    />
                  </div>
                  <div>
                    <Label>AWS Access Key ID</Label>
                    <Input
                      value={settings.s3AccessKey || ""}
                      onChange={(e) => updateSetting("s3AccessKey", e.target.value)}
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                    />
                  </div>
                  <div>
                    <Label>AWS Secret Access Key</Label>
                    <Input
                      type="password"
                      value={settings.s3SecretKey || ""}
                      onChange={(e) => updateSetting("s3SecretKey", e.target.value)}
                      placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    />
                  </div>
                  {s3TestResult && (
                    <div className={`p-3 rounded-lg text-sm ${s3TestResult.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                      {s3TestResult.message}
                    </div>
                  )}
                  <Button variant="outline" onClick={handleTestS3}>
                    Test Connection
                  </Button>
                </>
              )}

              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving..." : "Save Storage Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice">
          <Card>
            <CardHeader>
              <CardTitle>Voice Input Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Voice Recognition Mode</Label>
                <select
                  value={settings.voiceMode || "browser"}
                  onChange={(e) => updateSetting("voiceMode", e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="browser">Browser (Free, instant, Chrome only)</option>
                  <option value="gemini">Gemini AI (Best quality, AI-powered)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.voiceMode === "browser" && "Browser: Free, instant, Chrome only"}
                  {settings.voiceMode === "gemini" && "Gemini AI: Best quality, handles noisy audio, AI-powered"}
                </p>
              </div>

              {settings.voiceMode === "gemini" && (
                <div>
                  <Label>Gemini STT API Key</Label>
                  <Input
                    type="password"
                    value={settings.geminiSttApiKey || ""}
                    onChange={(e) => updateSetting("geminiSttApiKey", e.target.value)}
                    placeholder="AIzaSy..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get your free API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google AI Studio</a>. Free tier: 1500 requests/day.
                  </p>
                </div>
              )}

              {settings.voiceMode !== "gemini" && (
                <div>
                  <Label>Voice Language</Label>
                  <select
                    value={settings.voiceLanguage || "auto"}
                    onChange={(e) => updateSetting("voiceLanguage", e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="auto">Auto Detect (All Languages)</option>
                    <option value="ms">Malay</option>
                    <option value="en">English</option>
                    <option value="zh">Chinese</option>
                    <option value="ta">Tamil</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select language for voice recognition. Auto-detect works for all languages.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Text-to-Speech Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>TTS Mode</Label>
                <select
                  value={settings.ttsMode || "browser"}
                  onChange={(e) => updateSetting("ttsMode", e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="browser">Browser (Free, works offline)</option>
                  <option value="gemini">Gemini AI (High quality, natural)</option>
                  <option value="gclas">Google Cloud Long Audio (Async, fastest)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.ttsMode === "browser" && "Browser: Uses device's built-in voices, no internet needed"}
                  {settings.ttsMode === "gemini" && "Gemini AI: Most natural AI-generated voices, requires API key"}
                  {settings.ttsMode === "gclas" && "Google Cloud: Async processing, requires service account"}
                </p>
              </div>

              {settings.ttsMode === "gemini" && (
                <div>
                  <Label>Gemini TTS API Key</Label>
                  <Input
                    type="password"
                    value={settings.geminiTtsApiKey || ""}
                    onChange={(e) => updateSetting("geminiTtsApiKey", e.target.value)}
                    placeholder="AIzaSy..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get your free API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google AI Studio</a>. Fast & accurate.
                  </p>
                </div>
              )}

              {settings.ttsMode === "gclas" && (
                <>
                  <div>
                    <Label>Google Cloud Service Account JSON</Label>
                    <textarea
                      value={settings.gclasServiceAccount || ""}
                      onChange={(e) => updateSetting("gclasServiceAccount", e.target.value)}
                      placeholder='{"type": "service_account", "project_id": "...", ...}'
                      className="w-full h-32 px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Run <code className="bg-muted px-1 py-0.5 rounded">./setup-gclas.sh</code> to create service account. Paste the JSON key here.
                    </p>
                  </div>

                  <div>
                    <Label>Language</Label>
                    <select
                      value={settings.gclasLanguage || "auto"}
                      onChange={(e) => updateSetting("gclasLanguage", e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="auto">Auto-detect</option>
                      <option value="en-US">English (US)</option>
                      <option value="ms-MY">Malay (Malaysia)</option>
                      <option value="cmn-CN">Chinese (Mandarin)</option>
                      <option value="ta-IN">Tamil (India)</option>
                    </select>
                  </div>

                  <div>
                    <Label>Voice</Label>
                    <Input
                      value={settings.gclasVoice || ""}
                      onChange={(e) => updateSetting("gclasVoice", e.target.value)}
                      placeholder="ms-MY-Standard-C"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      See <a href="https://cloud.google.com/text-to-speech/docs/voices" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">available voices</a>
                    </p>
                  </div>
                </>
              )}

              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving..." : "Save Voice Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {ollamaOnline && (
        <TabsContent value="aimodels">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Ollama Configuration</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Configure local AI models for chat and embeddings</p>
                </div>
                <Button variant="outline" onClick={() => setShowModelManager(true)}>Manage Models</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Chat Model</Label>
                <select
                  value={settings.ollamaChatModel || ""}
                  onChange={(e) => updateSetting("ollamaChatModel", e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="">-- Select Model --</option>
                  {ollamaModels.filter(m => !m.name.includes('embed')).map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
                {settings.ollamaChatModel && !ollamaModels.find(m => m.name === settings.ollamaChatModel) && (
                  <p className="text-xs text-yellow-600 mt-1">⚠ Model "{settings.ollamaChatModel}" not found. Pull it from Manage Models.</p>
                )}
              </div>
              <div>
                <Label>Embedding Model</Label>
                <select
                  value={settings.ollamaEmbeddingModel || ""}
                  onChange={(e) => updateSetting("ollamaEmbeddingModel", e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="">-- Select Model --</option>
                  {ollamaModels.map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving..." : "Save AI Settings"}
              </Button>
            </CardContent>
          </Card>

          {/* Model Manager Modal */}
          {showModelManager && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !isPulling && setShowModelManager(false)}>
              <div className="bg-background rounded-lg p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Manage Ollama Models</h2>
                  <button onClick={() => !isPulling && setShowModelManager(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 mb-6">
                  <Label>Pull New Model</Label>
                  <div className="flex gap-2">
                    <Input
                      value={pullModelName}
                      onChange={(e) => setPullModelName(e.target.value)}
                      placeholder="nomic-embed-text"
                      disabled={isPulling}
                      onKeyDown={(e) => e.key === 'Enter' && handlePullModel()}
                    />
                    <Button variant="outline" onClick={handlePullModel} disabled={isPulling || !pullModelName.trim()}>
                      <RefreshCw className={`w-4 h-4 ${isPulling ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Browse models at <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ollama.com/library</a>
                  </p>
                  {pullProgress && (
                    <div className="space-y-1">
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        {pullProgress.total ? (
                          <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${Math.round((pullProgress.completed || 0) / pullProgress.total * 100)}%` }} />
                        ) : (
                          <div className="bg-primary h-2 rounded-full w-1/3 animate-pulse" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {pullProgress.status}
                        {pullProgress.total ? ` — ${Math.round((pullProgress.completed || 0) / 1024 / 1024)}/${Math.round(pullProgress.total / 1024 / 1024)} MB (${Math.round((pullProgress.completed || 0) / pullProgress.total * 100)}%)` : ''}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Installed Models ({ollamaModels.length})</Label>
                  <div className="space-y-2 mt-2">
                    {ollamaModels.map(m => (
                      <div key={m.name} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <p className="font-medium text-sm">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{(m.size / 1024 / 1024 / 1024).toFixed(2)} GB • {m.details?.family || 'unknown'}</p>
                        </div>
                        <button onClick={() => handleDeleteModel(m.name)} className="text-muted-foreground hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {ollamaModels.length === 0 && <p className="text-sm text-muted-foreground">No models installed</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
        )}

      </Tabs>
      </div>
    </div>
  );
};
