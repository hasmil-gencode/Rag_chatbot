import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, X } from 'lucide-react';

export function TenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ orgName: '', adminName: '', adminEmail: '', adminPassword: '', packageId: '', publicEnabled: false });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); api.getPackages().then(setPackages).catch(() => {}); }, []);
  const load = () => api.getTenants().then(setTenants).catch(() => {});

  const handleCreate = async () => {
    if (!form.orgName || !form.adminName || !form.adminEmail || !form.adminPassword) { setMsg('All fields required'); return; }
    try { const r = await api.createTenant(form); setMsg(''); setShowModal(false); setForm({ orgName: '', adminName: '', adminEmail: '', adminPassword: '', packageId: '', publicEnabled: false }); load(); } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Clients</p>
          <h1 className="text-xl font-semibold">Tenants</h1>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-foreground text-xs rounded-lg transition-colors"><Plus className="w-3.5 h-3.5" />Create Tenant</button>
      </div>

      {msg && <div className="mb-4 px-3 py-2 bg-secondary border border rounded-lg text-xs text-foreground flex justify-between"><span>{msg}</span><button onClick={() => setMsg('')}><X className="w-3 h-3" /></button></div>}

      <div className="bg-card border border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border">
              <th className="px-4 py-3 text-left text-[11px] font-medium text-muted-foreground">Organization</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-muted-foreground">Admin Email</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-muted-foreground">Server</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No tenants yet</td></tr>
            ) : tenants.map(t => (
              <tr key={t._id} className="border-t border hover:bg-card">
                <td className="px-4 py-3 font-medium">{t.orgName}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.adminEmail}</td>
                <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{t.serverName}</span></td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-background border border rounded-xl p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold mb-4">Create Tenant</h2>
            <div className="space-y-3">
              <div><label className="text-[11px] text-muted-foreground">Organization Name</label><input value={form.orgName} onChange={e => setForm({ ...form, orgName: e.target.value })} placeholder="e.g., Client ABC" className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              <div><label className="text-[11px] text-muted-foreground">Admin Full Name</label><input value={form.adminName} onChange={e => setForm({ ...form, adminName: e.target.value })} placeholder="e.g., Ahmad" className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              <div><label className="text-[11px] text-muted-foreground">Admin Email</label><input value={form.adminEmail} onChange={e => setForm({ ...form, adminEmail: e.target.value })} placeholder="admin@client.com" className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              <div><label className="text-[11px] text-muted-foreground">Admin Password</label><input type="password" value={form.adminPassword} onChange={e => setForm({ ...form, adminPassword: e.target.value })} placeholder="Min 6 characters" className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              <div>
                <label className="text-[11px] text-muted-foreground">Package</label>
                <select value={form.packageId} onChange={e => setForm({ ...form, packageId: e.target.value })} className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">No package</option>
                  {packages.map(p => <option key={p._id} value={p._id}>{p.name} — {p.storageLimitGB}GB, {p.chatQuota || '∞'} chats</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.publicEnabled} onChange={e => setForm({ ...form, publicEnabled: e.target.checked })} className="rounded" /><span className="text-xs">Enable public access</span></label>
              {msg && <p className="text-xs text-red-400">{msg}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={handleCreate} className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 text-foreground text-xs rounded-lg transition-colors">Create</button>
                <button onClick={() => setShowModal(false)} className="h-9 px-4 bg-secondary hover:bg-muted text-xs rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
