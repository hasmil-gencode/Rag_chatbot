import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Eye, EyeOff, Save, CheckCircle, XCircle } from "lucide-react";

const PROVIDERS = [
  { id: 'gemini', name: 'Gemini (Google AI)', placeholder: 'AIzaSy...', hint: 'https://aistudio.google.com/apikey' },
  { id: 'mistral', name: 'Mistral (OCR)', placeholder: 'sk-...', hint: 'https://console.mistral.ai/api-keys' },
  { id: 'google_cloud', name: 'Google Cloud (Service Account JSON)', placeholder: '{"type":"service_account",...}', hint: 'https://console.cloud.google.com/iam-admin/serviceaccounts', multiline: true },
];

export const ProviderKeysPage = () => {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [orgs, setOrgs] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("global");

  useEffect(() => { loadOrgs(); }, []);
  useEffect(() => { loadKeys(); }, [selectedOrg]);

  const loadOrgs = async () => {
    try { const data = await api.getAllOrganizations(); setOrgs(Array.isArray(data.organizations || data) ? (data.organizations || data) : []); } catch { setOrgs([]); }
  };

  const loadKeys = async () => {
    try {
      const data = await api.getProviderKeys(selectedOrg === "global" ? undefined : selectedOrg);
      setKeys(data); setOriginal(data);
      if (selectedOrg === "global" && Object.keys(data).some(k => data[k])) {
        try { await api.saveProviderKeys(data); } catch {}
      }
    } catch { setKeys({}); setOriginal({}); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveProviderKeys(keys, selectedOrg === "global" ? undefined : selectedOrg);
      setOriginal({ ...keys }); toast.success("API keys saved");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const hasChanges = JSON.stringify(keys) !== JSON.stringify(original);
  const isGlobal = selectedOrg === "global";

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-2xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Developer</p>
            <h1 className="text-xl font-semibold">Provider Key Management</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage API keys per organization. Client keys override global.</p>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges} className="text-xs h-8 rounded-lg">
            <Save className="w-3.5 h-3.5 mr-1.5" />{saving ? "Saving..." : "Save"}
          </Button>
        </div>

        {/* Org Selector */}
        <div className="border rounded-lg p-4 mb-5">
          <label className="text-[11px] text-muted-foreground">Organization</label>
          <select value={selectedOrg} onChange={e => setSelectedOrg(e.target.value)}
            className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="global">Global (Default — used when client has no own keys)</option>
            {orgs.filter(o => o.type === 'organization').map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
          </select>
          {!isGlobal && <p className="text-[10px] text-muted-foreground mt-1">Keys set here override global for this client. Empty fields fallback to global.</p>}
        </div>

        <div className="space-y-3">
          {PROVIDERS.map(p => (
            <div key={p.id} className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium">{p.name}</p>
                  {keys[p.id] ? <CheckCircle className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-muted-foreground/40" />}
                </div>
                <a href={p.hint} target="_blank" rel="noopener" className="text-[10px] text-muted-foreground hover:text-foreground">Get key</a>
              </div>
              <div className="px-4 pb-3">
                {p.multiline ? (
                  <textarea value={keys[p.id] || ''} onChange={e => setKeys({ ...keys, [p.id]: e.target.value })} placeholder={!isGlobal ? 'Empty = use global' : p.placeholder} rows={3}
                    className="w-full px-3 py-2 text-[12px] font-mono rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                ) : (
                  <div className="relative">
                    <input type={visible[p.id] ? 'text' : 'password'} value={keys[p.id] || ''} onChange={e => setKeys({ ...keys, [p.id]: e.target.value })} placeholder={!isGlobal ? 'Empty = use global' : p.placeholder}
                      className="w-full h-9 px-3 pr-10 text-[13px] font-mono rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button type="button" onClick={() => setVisible({ ...visible, [p.id]: !visible[p.id] })} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {visible[p.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
