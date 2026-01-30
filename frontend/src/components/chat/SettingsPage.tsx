import { useState, useEffect } from "react";
import { Save, UserPlus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";

interface SettingsPageProps {
  onLogoChange?: (logo: string | null) => void;
}

interface User {
  id: string;
  email: string;
  role: string;
  organizationId?: string;
}

interface Organization {
  _id: string;
  name: string;
}

export const SettingsPage = ({ onLogoChange }: SettingsPageProps) => {
  const [activeTab, setActiveTab] = useState("branding");
  const [settings, setSettings] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "user", organizationId: "" });
  const [newOrgName, setNewOrgName] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ type: string; message: string } | null>(null);
  const [s3TestResult, setS3TestResult] = useState<{ type: string; message: string } | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ email: "", password: "", role: "", organizationId: "" });

  useEffect(() => {
    loadSettings();
    if (activeTab === "users" || activeTab === "organizations") {
      loadUsers();
      loadOrganizations();
    }
  }, [activeTab]);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  };

  const loadOrganizations = async () => {
    try {
      const data = await api.getOrganizations();
      setOrganizations(data);
    } catch (error) {
      console.error("Failed to load organizations:", error);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password) {
      alert("Please enter email and password");
      return;
    }
    setIsCreatingUser(true);
    try {
      // Deprecated
      await loadUsers();
      setNewUser({ email: "", password: "", role: "user", organizationId: "" });
      alert("User created successfully!");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditForm({
      email: user.email,
      password: "",
      role: user.role,
      organizationId: user.organizationId || ""
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    try {
      // Deprecated
      alert("User updated!");
      setEditingUser(null);
      await loadUsers();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}?`)) return;
    try {
      await api.deleteUser(userId);
      alert("User deleted!");
      await loadUsers();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    setIsCreatingOrg(true);
    try {
      // Deprecated
      setNewOrgName("");
      await loadOrganizations();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleDeleteOrg = async (id: string) => {
    if (!confirm("Delete this organization?")) return;
    try {
      await api.deleteOrganization(id);
      await loadOrganizations();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleTestWebhook = async (webhookType: 'chat' | 'upload') => {
    const url = webhookType === 'chat' ? settings.chatWebhook : settings.uploadWebhook;
    if (!url) {
      setWebhookTestResult({ type: 'error', message: 'Please enter webhook URL first' });
      return;
    }
    setWebhookTestResult(null);
    try {
      await api.testWebhook(url);
      setWebhookTestResult({ type: 'success', message: `${webhookType === 'chat' ? 'Chat' : 'Upload'} webhook is working!` });
    } catch (error: any) {
      setWebhookTestResult({ type: 'error', message: `Webhook test failed: ${error.message}` });
    }
  };

  const handleTestS3 = async () => {
    if (!settings.s3Bucket || !settings.s3Region || !settings.s3AccessKey || !settings.s3SecretKey) {
      setS3TestResult({ type: 'error', message: 'Please fill in all S3 settings first' });
      return;
    }
    setS3TestResult(null);
    try {
      await api.testS3(settings);
      setS3TestResult({ type: 'success', message: 'S3 connection successful!' });
    } catch (error: any) {
      setS3TestResult({ type: 'error', message: `S3 test failed: ${error.message}` });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.updateSettings(settings);
      if (settings.logo && onLogoChange) {
        onLogoChange(settings.logo);
      }
      alert("Settings saved!");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = (key: string, value: string | boolean | number) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const result = await api.uploadLogo(file);
      setSettings((prev: any) => ({ ...prev, logo: result.logo }));
      if (onLogoChange) {
        onLogoChange(result.logo);
      }
      alert('Logo uploaded successfully!');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto chat-scrollbar p-6 bg-background">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your application preferences and integrations</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="s3">S3 Storage</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
          </TabsList>

          <TabsContent value="branding">
            <Card>
              <CardHeader>
                <CardTitle>Logo & Icon</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Company Name</Label>
                  <Input
                    value={settings.companyName || ""}
                    onChange={(e) => updateSetting("companyName", e.target.value)}
                    placeholder="GenBotChat"
                  />
                </div>
                <div>
                  <Label>Logo</Label>
                  <div className="space-y-3">
                    {settings.logo && (
                      <div className="flex items-center gap-4 p-4 border rounded-lg">
                        <img
                          src={settings.logo}
                          alt="Current logo"
                          className="w-16 h-16 object-contain rounded-lg bg-card"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Current Logo</p>
                          <p className="text-xs text-muted-foreground">This logo will appear in login and sidebar</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        disabled={isUploadingLogo}
                        className="relative"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {isUploadingLogo ? "Uploading..." : "Upload New Logo"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg"
                          onChange={handleLogoUpload}
                          disabled={isUploadingLogo}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </Button>
                      <p className="text-xs text-muted-foreground">Square image, PNG or JPG, max 2MB</p>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="mt-4"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Branding"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

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
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                >
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
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="mt-4"
                >
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
                  <Button
                    variant="outline"
                    onClick={handleTestS3}
                  >
                    Test Connection
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                  >
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
                      <p className="text-xs text-muted-foreground mt-1">
                        {settings.gclasLanguage === "auto" ? "Auto-detect analyzes text and selects appropriate language" : "Select voice below for this language"}
                      </p>
                    </div>

                    {settings.gclasLanguage !== "auto" && (
                      <div>
                        <Label>Voice</Label>
                        <select
                          value={settings.gclasVoice || "en-US-Neural2-C"}
                          onChange={(e) => updateSetting("gclasVoice", e.target.value)}
                          className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                        >
                          {settings.gclasLanguage === "en-US" && (
                            <>
                              <option value="en-US-Neural2-C">Neural2-C (Female)</option>
                              <option value="en-US-Neural2-D">Neural2-D (Male)</option>
                              <option value="en-US-Neural2-F">Neural2-F (Female)</option>
                              <option value="en-US-Neural2-J">Neural2-J (Male)</option>
                            </>
                          )}
                          {settings.gclasLanguage === "ms-MY" && (
                            <>
                              <option value="ms-MY-Standard-A">Standard-A (Female)</option>
                              <option value="ms-MY-Standard-B">Standard-B (Male)</option>
                              <option value="ms-MY-Standard-C">Standard-C (Female)</option>
                              <option value="ms-MY-Standard-D">Standard-D (Male)</option>
                            </>
                          )}
                          {settings.gclasLanguage === "cmn-CN" && (
                            <>
                              <option value="cmn-CN-Standard-A">Standard-A (Female)</option>
                              <option value="cmn-CN-Standard-B">Standard-B (Male)</option>
                              <option value="cmn-CN-Standard-C">Standard-C (Male)</option>
                              <option value="cmn-CN-Standard-D">Standard-D (Female)</option>
                            </>
                          )}
                          {settings.gclasLanguage === "ta-IN" && (
                            <>
                              <option value="ta-IN-Standard-A">Standard-A (Female)</option>
                              <option value="ta-IN-Standard-B">Standard-B (Male)</option>
                            </>
                          )}
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">
                          {settings.gclasLanguage === "en-US" ? "Neural2 voices offer best quality" : "Standard voices for this language"}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {settings.ttsMode === "elevenlabs" && (
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

                {settings.ttsMode === "elevenlabs" && (
                  <div>
                    <Label>ElevenLabs Voice</Label>
                    <select
                      value={settings.elevenlabsVoice || "pNInz6obpgDQGcFmaJgB"}
                      onChange={(e) => updateSetting("elevenlabsVoice", e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    >
                      <optgroup label="English">
                        <option value="pNInz6obpgDQGcFmaJgB">Adam (Deep, Professional)</option>
                        <option value="EXAVITQu4vr4xnSDxMaL">Sarah (Warm, Friendly)</option>
                        <option value="21m00Tcm4TlvDq8ikWAM">Rachel (Calm, Clear)</option>
                      </optgroup>
                      <optgroup label="Multilingual">
                        <option value="onwK4e9ZLuTAKqWW03F9">Daniel (Multilingual, Versatile)</option>
                        <option value="XB0fDUnXU5powFXDhCwa">Charlotte (Multilingual, Smooth)</option>
                      </optgroup>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Multilingual voices support English, Malay, Chinese, Tamil
                    </p>
                  </div>
                )}

                {settings.ttsMode === "gemini" && (
                  <div>
                    <Label>Gemini Voice</Label>
                    <select
                      value={settings.geminiVoice || "Aoede"}
                      onChange={(e) => updateSetting("geminiVoice", e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="Kore">Kore (Firm, Professional)</option>
                      <option value="Puck">Puck (Upbeat, Friendly)</option>
                      <option value="Zephyr">Zephyr (Bright, Clear)</option>
                      <option value="Charon">Charon (Informative, Calm)</option>
                      <option value="Aoede">Aoede (Breezy, Natural)</option>
                      <option value="Callirrhoe">Callirrhoe (Easy-going)</option>
                      <option value="Fenrir">Fenrir (Excitable, Energetic)</option>
                      <option value="Leda">Leda (Youthful, Warm)</option>
                      <option value="Iapetus">Iapetus (Clear, Steady)</option>
                      <option value="Despina">Despina (Smooth, Gentle)</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Gemini auto-detects language from text (English, Malay, Chinese, Tamil)
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="mt-4 w-full"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Saving..." : "Save Voice Settings"}
            </Button>
          </TabsContent>

          <TabsContent value="organizations">
            <Card>
              <CardHeader>
                <CardTitle>Organizations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      placeholder="Organization name"
                      className="flex-1"
                    />
                    <Button
                      onClick={handleCreateOrg}
                      disabled={isCreatingOrg || !newOrgName.trim()}
                    >
                      {isCreatingOrg ? "Adding..." : "Add Organization"}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {organizations.map((org) => (
                      <div key={org._id} className="flex items-center justify-between p-3 border rounded-lg">
                        <span className="font-medium">{org.name}</span>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteOrg(org._id)}
                        >
                          Delete
                        </Button>
                      </div>
                    ))}
                    {organizations.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No organizations yet</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Invite New User</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-5">
                    <div className="sm:col-span-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        placeholder="user@example.com"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Password</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Role</Label>
                      <select
                        value={newUser.role}
                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                      >
                        <option value="user">User</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div>
                      <Label>Organization</Label>
                      <select
                        value={newUser.organizationId}
                        onChange={(e) => setNewUser({ ...newUser, organizationId: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                        disabled={newUser.role === 'admin'}
                      >
                        <option value="">None (Admin only)</option>
                        {organizations.map(org => (
                          <option key={org._id} value={org._id}>{org.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <Button
                    onClick={handleCreateUser}
                    disabled={isCreatingUser}
                    className="mt-4"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    {isCreatingUser ? "Creating..." : "Invite User"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span>User Management</span>
                    <span className="text-sm font-normal text-muted-foreground">({users.length} users)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {users.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-semibold text-sm">
                              {user.email.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{user.email}</p>
                            <p className="text-xs text-muted-foreground">
                              {user.role} {user.organizationId && `• ${organizations.find(o => o._id === user.organizationId)?.name || 'Unknown Org'}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditUser(user)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteUser(user.id, user.email)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                    {users.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        No users found
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Edit User Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingUser(null)}>
            <div className="bg-gray-900 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-700" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-white mb-6">Edit User</h3>
              
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-300 font-medium">Email</Label>
                  <Input
                    value={editForm.email}
                    onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                    placeholder="user@example.com"
                    className="mt-1 bg-white text-gray-900 border-gray-600"
                  />
                </div>

                <div>
                  <Label className="text-gray-300 font-medium">Password</Label>
                  <Input
                    type="password"
                    value={editForm.password}
                    onChange={(e) => setEditForm({...editForm, password: e.target.value})}
                    placeholder="Leave empty to keep current"
                    className="mt-1 bg-white text-gray-900 border-gray-600"
                  />
                </div>

                <div>
                  <Label className="text-gray-300 font-medium">Role</Label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({...editForm, role: e.target.value})}
                    className="w-full h-10 px-3 mt-1 rounded-md border border-gray-600 bg-white text-gray-900"
                  >
                    <option value="user">User</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <Label className="text-gray-300 font-medium">Organization</Label>
                  <select
                    value={editForm.organizationId}
                    onChange={(e) => setEditForm({...editForm, organizationId: e.target.value})}
                    className="w-full h-10 px-3 mt-1 rounded-md border border-gray-600 bg-white text-gray-900"
                  >
                    <option value="">None</option>
                    {organizations.map((org) => (
                      <option key={org._id} value={org._id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button onClick={handleSaveEdit} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  Save Changes
                </Button>
                <Button variant="outline" onClick={() => setEditingUser(null)} className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};
