import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, Trash2, RefreshCw, X, Download, ExternalLink } from 'lucide-react';

export function ServersPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', internalKey: '', maxTenants: 5 });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  const load = () => api.getServers().then(setServers).catch(() => {});

  const handleAdd = async () => {
    if (!form.name || !form.url || !form.internalKey) { setMsg('All fields required'); return; }
    if (form.internalKey.trim().length < 24) { setMsg('Internal key must be at least 24 characters'); return; }
    try { await api.addServer(form); setShowModal(false); setForm({ name: '', url: '', internalKey: '', maxTenants: 5 }); setMsg(''); load(); } catch (e: any) { setMsg(e.message); }
  };

  const handleHealth = async (id: string) => {
    try { const r = await api.healthCheck(id); setMsg(r.status === 'ok' ? 'Server is healthy' : 'Server is offline'); load(); } catch { setMsg('Health check failed'); }
  };

  const handleSync = async (id: string) => {
    try { const r = await api.syncTenants(id); setMsg(`Synced ${r.synced} new, removed ${r.removed || 0} (${r.total} total on server)`); load(); } catch (e: any) { setMsg(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this server?')) return;
    try { await api.deleteServer(id); load(); } catch (e: any) { setMsg(e.message); }
  };

  const handleManage = async (id: string) => {
    try {
      const r = await api.manageServer(id);
      // Set cookie via gateway and stay on gateway domain
      document.cookie = `__gw_manage_token=${r.token}; path=/; max-age=60`;
      window.location.href = `/?token=${r.token}&gateway=${encodeURIComponent(window.location.origin)}`;
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Infrastructure</p>
          <h1 className="text-xl font-semibold">Servers</h1>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-foreground text-xs rounded-lg transition-colors"><Plus className="w-3.5 h-3.5" />Add Server</button>
      </div>

      {msg && <div className="mb-4 px-3 py-2 bg-secondary border border rounded-lg text-xs text-foreground flex justify-between"><span>{msg}</span><button onClick={() => setMsg('')}><X className="w-3 h-3" /></button></div>}

      <div className="space-y-3">
        {servers.map(s => (
          <div key={s._id} className="bg-card border border rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{s.name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{s.status}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{s.url}</p>
                <p className="text-xs text-muted-foreground">Tenants: {s.tenantCount || 0} / {s.maxTenants || 5}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleManage(s._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Manage server"><ExternalLink className="w-4 h-4" /></button>
                <button onClick={() => handleHealth(s._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Health check"><RefreshCw className="w-4 h-4" /></button>
                <button onClick={() => handleSync(s._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Sync tenants"><Download className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(s._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-red-400" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ))}
        {servers.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No servers yet. Add your first tenant server.</p>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-background border border rounded-xl p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold mb-4">Add Server</h2>
            <div className="space-y-3">
              <div><label className="text-[11px] text-muted-foreground">Server Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Server A" className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              <div><label className="text-[11px] text-muted-foreground">Server URL (internal)</label><input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="http://10.0.0.1:3000" className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              <div><label className="text-[11px] text-muted-foreground">Internal Key</label><input value={form.internalKey} onChange={e => setForm({ ...form, internalKey: e.target.value })} placeholder="Shared secret with tenant server" className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /><p className="mt-1 text-[10px] text-muted-foreground">Use the same key as tenant INTERNAL_KEY. Recommended: openssl rand -hex 32.</p></div>
              <div><label className="text-[11px] text-muted-foreground">Max Tenants</label><input type="number" min={1} value={form.maxTenants} onChange={e => setForm({ ...form, maxTenants: parseInt(e.target.value) || 5 })} className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              {msg && <p className="text-xs text-red-400">{msg}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={handleAdd} className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 text-foreground text-xs rounded-lg transition-colors">Add Server</button>
                <button onClick={() => setShowModal(false)} className="h-9 px-4 bg-secondary hover:bg-muted text-xs rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
