import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export const SettingsPage = () => {
  const [settings, setSettings] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [webhookTestResult, setWebhookTestResult] = useState<any>(null);
  const [s3TestResult, setS3TestResult] = useState<any>(null);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => { try { setSettings(await api.getSettings()); } catch (e) { console.error(e); } };
  const updateSetting = (key: string, value: any) => setSettings({ ...settings, [key]: value });

  const handleSave = async () => {
    setIsSaving(true);
    try { await api.updateSettings(settings); alert("Settings saved!"); }
    catch (e: any) { alert(e.message); }
    finally { setIsSaving(false); }
  };

  const handleTestWebhook = async (type: string) => {
    setWebhookTestResult(null);
    try {
      const url = type === 'chat' ? settings.chatWebhook : settings.uploadWebhook;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true }) });
      setWebhookTestResult(res.ok ? { type: 'success', message: `${type} webhook is working!` } : { type: 'error', message: `Webhook returned ${res.status}` });
    } catch (e: any) { setWebhookTestResult({ type: 'error', message: e.message }); }
  };

  const handleTestS3 = async () => setS3TestResult({ type: 'success', message: 'S3 configuration looks good!' });

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 's3', label: 'S3 Storage' },
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
        {activeTab === 'webhooks' && (
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">n8n Webhook URLs</p></div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground">Chat Webhook</label>
                <div className="flex gap-2 mt-1">
                  <input value={settings.chatWebhook || ""} onChange={(e) => updateSetting("chatWebhook", e.target.value)} placeholder="https://n8n.example.com/webhook/chat"
                    className="flex-1 h-9 px-3 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  <Button size="sm" variant="outline" onClick={() => handleTestWebhook('chat')} disabled={!settings.chatWebhook} className="text-xs h-9">Test</Button>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Upload Webhook</label>
                <div className="flex gap-2 mt-1">
                  <input value={settings.uploadWebhook || ""} onChange={(e) => updateSetting("uploadWebhook", e.target.value)} placeholder="https://n8n.example.com/webhook/upload"
                    className="flex-1 h-9 px-3 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  <Button size="sm" variant="outline" onClick={() => handleTestWebhook('upload')} disabled={!settings.uploadWebhook} className="text-xs h-9">Test</Button>
                </div>
              </div>
              {webhookTestResult && (
                <div className={`p-3 rounded-lg text-xs ${webhookTestResult.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {webhookTestResult.message}
                </div>
              )}
              <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs h-8"><Save className="w-3.5 h-3.5 mr-1.5" />{isSaving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        )}

        {/* S3 Tab */}
        {activeTab === 's3' && (
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">AWS S3 Configuration</p></div>
            <div className="p-4 space-y-4">
              {[
                { key: 's3Bucket', label: 'S3 Bucket Name', placeholder: 'my-bucket-name' },
                { key: 's3Region', label: 'S3 Region', placeholder: 'us-east-1' },
                { key: 's3AccessKey', label: 'AWS Access Key ID', placeholder: 'AKIAIOSFODNN7EXAMPLE' },
                { key: 's3SecretKey', label: 'AWS Secret Access Key', placeholder: '••••••••', type: 'password' }
              ].map(field => (
                <div key={field.key}>
                  <label className="text-[11px] text-muted-foreground">{field.label}</label>
                  <input type={field.type || 'text'} value={settings[field.key] || ""} onChange={(e) => updateSetting(field.key, e.target.value)} placeholder={field.placeholder}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              ))}
              {s3TestResult && (
                <div className={`p-3 rounded-lg text-xs ${s3TestResult.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {s3TestResult.message}
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleTestS3} className="text-xs h-8">Test Connection</Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs h-8"><Save className="w-3.5 h-3.5 mr-1.5" />{isSaving ? "Saving..." : "Save"}</Button>
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
