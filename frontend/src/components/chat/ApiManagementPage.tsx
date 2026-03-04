import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Copy, Power, Trash2, Eye, EyeOff } from "lucide-react";

interface ApiKey {
  _id: string;
  key: string;
  shortKey?: string;
  hasShortKey?: boolean;
  name: string;
  userId: string;
  userEmail: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface ApiUsage {
  _id: string;
  endpoint: string;
  method: string;
  timestamp: string;
  responseStatus: number;
  ipAddress: string;
}

export const ApiManagementPage = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<ApiUsage[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [generateShortKey, setGenerateShortKey] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadKeys();
    loadUsage();
    loadUsers();
  }, []);

  const loadKeys = async () => {
    try {
      const data = await api.getApiKeys();
      setKeys(data);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const loadUsage = async () => {
    try {
      const data = await api.getApiUsage();
      setUsage(data);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (error: any) {
      console.error(error);
      setUsers([]);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName || !selectedUserId) {
      toast.error("Please fill all fields");
      return;
    }
    try {
      await api.createApiKey(newKeyName, selectedUserId, generateShortKey);
      setShowCreateModal(false);
      setNewKeyName("");
      setSelectedUserId("");
      setGenerateShortKey(false);
      loadKeys();
      toast.success("API key created");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleKey = async (id: string, isActive: boolean) => {
    try {
      await api.toggleApiKey(id, !isActive);
      loadKeys();
      toast.success(isActive ? "Key disabled" : "Key enabled");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm("Delete this API key?")) return;
    try {
      await api.deleteApiKey(id);
      loadKeys();
      toast.success("Key deleted");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const maskKey = (key: string) => {
    return key.substring(0, 8) + "..." + key.substring(key.length - 4);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">API Management</h1>
          <p className="text-muted-foreground">Manage API keys and track usage</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create API Key
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No API keys yet</p>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div key={key._id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{key.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${key.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {key.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {visibleKeys.has(key._id) ? key.key : maskKey(key.key)}
                      </code>
                      <button onClick={() => toggleKeyVisibility(key._id)} className="text-muted-foreground hover:text-foreground">
                        {visibleKeys.has(key._id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => copyToClipboard(key.key)} className="text-muted-foreground hover:text-foreground">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    {key.hasShortKey && key.shortKey && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground">Short Key:</span>
                        <code className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-2 py-1 rounded font-bold">
                          {key.shortKey}
                        </code>
                        <button onClick={() => copyToClipboard(key.shortKey!)} className="text-muted-foreground hover:text-foreground">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      User: {key.userEmail} | Created: {new Date(key.createdAt).toLocaleString()} | 
                      Last used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleToggleKey(key._id, key.isActive)}>
                      <Power className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDeleteKey(key._id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent API Usage</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No API usage yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Timestamp</th>
                    <th className="text-left p-2">Endpoint</th>
                    <th className="text-left p-2">Method</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((log) => (
                    <tr key={log._id} className="border-b">
                      <td className="p-2 text-sm">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="p-2 text-sm">{log.endpoint}</td>
                      <td className="p-2 text-sm">{log.method}</td>
                      <td className="p-2 text-sm">{log.responseStatus || '-'}</td>
                      <td className="p-2 text-sm">{log.ipAddress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Documentation */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>API Usage Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Chat Endpoint</h3>
            <div className="bg-muted p-3 rounded text-sm font-mono">
              POST /api/v1/chat
            </div>
            <p className="text-sm text-muted-foreground mt-2">Headers:</p>
            <div className="bg-muted p-3 rounded text-sm font-mono mt-1">
              x-api-key: YOUR_API_KEY
            </div>
            <p className="text-sm text-muted-foreground mt-2">Request Body:</p>
            <div className="bg-muted p-3 rounded text-sm font-mono mt-1">
              {`{
  "message": "Your question here",
  "organizationId": "optional-org-id",
  "sessionId": "optional-session-id"
}`}
            </div>
            <p className="text-sm text-muted-foreground mt-2">Response:</p>
            <div className="bg-muted p-3 rounded text-sm font-mono mt-1">
              {`{
  "response": "AI response text",
  "sessionId": "session-id-123"
}`}
            </div>
          </div>
        </CardContent>
      </Card>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Create API Key</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Key Name</Label>
                <Input
                  placeholder="e.g., Production App"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
              <div>
                <Label>User</Label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full p-2 border rounded-md bg-background"
                >
                  <option value="">Select User</option>
                  {users.map((user) => (
                    <option key={user._id} value={user._id}>
                      {user.fullName} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="generateShortKey"
                  checked={generateShortKey}
                  onChange={(e) => setGenerateShortKey(e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="generateShortKey" className="cursor-pointer">
                  Generate Short Key (6 characters) - Easier for touchscreen devices
                </Label>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateKey} disabled={!newKeyName || !selectedUserId}>Create</Button>
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </div>
    </div>
  );
};
