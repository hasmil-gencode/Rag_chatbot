import { useState, useEffect } from "react";
import { Save } from "lucide-react";
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

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try { setSettings(await api.getSettings()); } catch (error) { console.error(error); }
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
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true }) });
      setWebhookTestResult(response.ok ? { type: 'success', message: `${type} webhook is working!` } : { type: 'error', message: `Webhook returned ${response.status}` });
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
      setOllamaTestResult({ type: 'success', message: `Connected! Models: ${result.models?.join(', ') || 'none'}` });
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
            <CardHeader><CardTitle>Ollama Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Configure local AI models for chat and embedding. Used by n8n workflows.</p>
              <div>
                <Label>Ollama URL</Label>
                <Input value={settings.ollamaUrl || ""} onChange={(e) => updateSetting("ollamaUrl", e.target.value)} placeholder="http://ollama:11434" />
                <p className="text-xs text-muted-foreground mt-1">Internal Docker URL for Ollama service.</p>
              </div>
              <div>
                <Label>Chat Model</Label>
                <Input value={settings.ollamaModel || ""} onChange={(e) => updateSetting("ollamaModel", e.target.value)} placeholder="qwen3:8b" />
                <p className="text-xs text-muted-foreground mt-1">LLM model for chat responses. Default: qwen3:8b (119 languages, tool calling).</p>
              </div>
              <div>
                <Label>Embedding Model</Label>
                <Input value={settings.ollamaEmbeddingModel || ""} onChange={(e) => updateSetting("ollamaEmbeddingModel", e.target.value)} placeholder="nomic-embed-text" />
                <p className="text-xs text-muted-foreground mt-1">Model for vector embeddings. Default: nomic-embed-text (768 dims).</p>
              </div>
              <ResultBanner result={ollamaTestResult} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleTestOllama}>Test Connection</Button>
                <SaveButton label="Save AI Settings" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};
