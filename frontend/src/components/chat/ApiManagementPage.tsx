import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Copy, Power, Trash2, Eye, EyeOff, Key, X } from "lucide-react";

interface ApiKey { _id: string; key: string; shortKey?: string; hasShortKey?: boolean; name: string; userId: string; userEmail: string; robotSettingId?: string; robotName?: string; isActive: boolean; createdAt: string; lastUsedAt: string | null; }
interface ApiUsage { _id: string; endpoint: string; method: string; timestamp: string; responseStatus: number; ipAddress: string; }

export const ApiManagementPage = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<ApiUsage[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [robots, setRobots] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRobotId, setSelectedRobotId] = useState("");
  const [generateShortKey, setGenerateShortKey] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => { loadKeys(); loadUsage(); loadUsers(); loadRobots(); }, []);

  const loadKeys = async () => { try { setKeys(await api.getApiKeys()); } catch (e: any) { toast.error(e.message); } };
  const loadUsage = async () => { try { setUsage(await api.getApiUsage()); } catch (e: any) { toast.error(e.message); } };
  const loadUsers = async () => { try { setUsers(await api.getUsers()); } catch (e) { setUsers([]); } };
  const loadRobots = async () => { try { setRobots(await api.getRobotSettings()); } catch (e) { setRobots([]); } };

  const handleCreateKey = async () => {
    if (!newKeyName || !selectedUserId) { toast.error("Please fill all fields"); return; }
    try { await api.createApiKey(newKeyName, selectedUserId, generateShortKey, selectedRobotId || null); setShowCreateModal(false); setNewKeyName(""); setSelectedUserId(""); setSelectedRobotId(""); setGenerateShortKey(false); loadKeys(); toast.success("API key created"); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleToggleKey = async (id: string, isActive: boolean) => { try { await api.toggleApiKey(id, !isActive); loadKeys(); toast.success(isActive ? "Key disabled" : "Key enabled"); } catch (e: any) { toast.error(e.message); } };
  const handleDeleteKey = async (id: string) => { if (!confirm("Delete this API key?")) return; try { await api.deleteApiKey(id); loadKeys(); toast.success("Key deleted"); } catch (e: any) { toast.error(e.message); } };
  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied!"); };
  const toggleKeyVisibility = (id: string) => setVisibleKeys(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const maskKey = (key: string) => key.substring(0, 8) + "..." + key.substring(key.length - 4);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Integration</p>
            <h1 className="text-xl font-semibold">API Management</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage API keys and track usage.</p>
          </div>
          <Button size="sm" onClick={() => setShowCreateModal(true)} className="text-xs h-8 rounded-lg">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create API Key
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Keys</p>
            <p className="text-2xl font-semibold mt-0.5">{keys.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Active Keys</p>
            <p className="text-2xl font-semibold mt-0.5">{keys.filter(k => k.isActive).length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">API Calls (Recent)</p>
            <p className="text-2xl font-semibold mt-0.5">{usage.length}</p>
          </div>
        </div>

        {/* API Keys */}
        <div className="border rounded-lg overflow-hidden mb-5">
          <div className="px-4 py-2.5 border-b">
            <p className="text-xs font-medium flex items-center gap-1.5"><Key className="w-3.5 h-3.5" /> API Keys</p>
          </div>
          {keys.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No API keys yet</div>
          ) : (
            <div className="divide-y">
              {keys.map((key) => (
                <div key={key._id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-medium">{key.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${key.isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>{key.isActive ? 'Active' : 'Disabled'}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-xs bg-muted px-2 py-1 rounded">{visibleKeys.has(key._id) ? key.key : maskKey(key.key)}</code>
                        <button onClick={() => toggleKeyVisibility(key._id)} className="text-muted-foreground hover:text-foreground">{visibleKeys.has(key._id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                        <button onClick={() => copyToClipboard(key.key)} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                      {key.hasShortKey && key.shortKey && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-muted-foreground">Short:</span>
                          <code className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-2 py-1 rounded font-bold">{key.shortKey}</code>
                          <button onClick={() => copyToClipboard(key.shortKey!)} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground">User: {key.userEmail} · Created: {new Date(key.createdAt).toLocaleDateString()}{key.robotName && ` · Robot: ${key.robotName}`}</p>
                    </div>
                    <div className="flex gap-1 ml-4">
                      <button onClick={() => handleToggleKey(key._id, key.isActive)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Power className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteKey(key._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Usage */}
        <div className="border rounded-lg overflow-hidden mb-5">
          <div className="px-4 py-2.5 border-b">
            <p className="text-xs font-medium">Recent API Usage</p>
          </div>
          {usage.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No API usage yet</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Timestamp</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Endpoint</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Method</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">IP</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((log) => (
                  <tr key={log._id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-2.5">{log.endpoint}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{log.method}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{log.responseStatus || '-'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{log.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* API Documentation */}
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b">
            <p className="text-xs font-medium">API Usage Guide</p>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Chat Endpoint</p>
              <code className="block text-xs bg-muted px-3 py-2 rounded">POST /api/v1/chat</code>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Headers</p>
              <code className="block text-xs bg-muted px-3 py-2 rounded">x-api-key: YOUR_API_KEY</code>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Request Body</p>
              <pre className="text-xs bg-muted px-3 py-2 rounded overflow-x-auto">{`{ "message": "Your question", "sessionId": "optional" }`}</pre>
            </div>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-md mx-4 border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Create API Key</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground">Key Name</label>
                <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g., Production App"
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">User</label>
                <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Select User</option>
                  {users.map((user) => <option key={user._id} value={user._id}>{user.fullName} ({user.email})</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Robot Setting</label>
                <select value={selectedRobotId} onChange={(e) => setSelectedRobotId(e.target.value)}
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Normal (No Robot)</option>
                  {robots.map((robot) => <option key={robot._id} value={robot._id}>{robot.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={generateShortKey} onChange={(e) => setGenerateShortKey(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                Generate Short Key (6 chars) - Easier for touchscreen
              </label>
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleCreateKey} disabled={!newKeyName || !selectedUserId} className="text-xs h-8 flex-1">Create</Button>
                <Button size="sm" variant="outline" onClick={() => setShowCreateModal(false)} className="text-xs h-8">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
