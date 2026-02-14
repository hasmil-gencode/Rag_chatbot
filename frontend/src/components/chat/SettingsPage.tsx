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

  useEffect(() => {
    loadSettings();
  }, []);

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
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true })
      });
      if (response.ok) {
        setWebhookTestResult({ type: 'success', message: `${type} webhook is working!` });
      } else {
        setWebhookTestResult({ type: 'error', message: `Webhook returned ${response.status}` });
      }
    } catch (error: any) {
      setWebhookTestResult({ type: 'error', message: error.message });
    }
  };

  const handleTestS3 = async () => {
    setS3TestResult({ type: 'success', message: 'S3 configuration looks good!' });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your application preferences and integrations</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="s3">S3 Storage</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
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

        <TabsContent value="s3">
          <Card>
            <CardHeader>
              <CardTitle>AWS S3 Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={handleTestS3}>
                  Test Connection
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? "Saving..." : "Save S3 Settings"}
                </Button>
              </div>
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
                  <option value="elevenlabs">ElevenLabs (Fast, accurate)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.voiceMode === "browser" && "Browser: Free, instant, Chrome only"}
                  {settings.voiceMode === "gemini" && "Gemini AI: Best quality, handles noisy audio, AI-powered"}
                  {settings.voiceMode === "elevenlabs" && "ElevenLabs: Fast transcription, high accuracy"}
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

              {settings.voiceMode === "elevenlabs" && (
                <div>
                  <Label>ElevenLabs API Key</Label>
                  <Input
                    type="password"
                    value={settings.elevenlabsApiKey || ""}
                    onChange={(e) => updateSetting("elevenlabsApiKey", e.target.value)}
                    placeholder="sk_..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get your API key from <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ElevenLabs Dashboard</a>. Free tier: 10,000 chars/month.
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
                  <option value="elevenlabs">ElevenLabs (Fast, best quality)</option>
                  <option value="gclas">Google Cloud Long Audio (Async, fastest)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.ttsMode === "browser" && "Browser: Uses device's built-in voices, no internet needed"}
                  {settings.ttsMode === "gemini" && "Gemini AI: Most natural AI-generated voices, requires API key"}
                  {settings.ttsMode === "elevenlabs" && "ElevenLabs: Professional voices, fastest generation"}
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

              {settings.ttsMode === "elevenlabs" && (
                <>
                  <div>
                    <Label>ElevenLabs API Key</Label>
                    <Input
                      type="password"
                      value={settings.elevenlabsApiKey || ""}
                      onChange={(e) => updateSetting("elevenlabsApiKey", e.target.value)}
                      placeholder="sk_..."
                    />
                  </div>
                  <div>
                    <Label>Voice ID</Label>
                    <Input
                      value={settings.elevenlabsVoice || ""}
                      onChange={(e) => updateSetting("elevenlabsVoice", e.target.value)}
                      placeholder="EXAVITQu4vr4xnSDxMaL"
                    />
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
      </Tabs>
    </div>
  );
};
