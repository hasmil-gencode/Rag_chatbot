import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, Trash2, Edit, X } from 'lucide-react';

export function PackagesPage() {
  const [packages, setPackages] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', storageLimitGB: 5, chatQuota: 0, quotaType: 'individual', renewDay: 1, departmentLimit: 0 });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  const load = () => api.getPackages().then(setPackages).catch(() => {});

  const openCreate = () => { setEditing(null); setForm({ name: '', storageLimitGB: 5, chatQuota: 0, quotaType: 'individual', renewDay: 1, departmentLimit: 0 }); setShowModal(true); };
  const openEdit = (p: any) => { setEditing(p); setForm({ name: p.name, storageLimitGB: p.storageLimitGB, chatQuota: p.chatQuota || 0, quotaType: p.quotaType || 'individual', renewDay: p.renewDay || 1, departmentLimit: p.departmentLimit || 0 }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.name) { setMsg('Name required'); return; }
    try {
      if (editing) await api.updatePackage(editing._id, form);
      else await api.createPackage(form);
      setShowModal(false); setMsg(''); load();
    } catch (e: any) { setMsg(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this package?')) return;
    try { await api.deletePackage(id); load(); } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Pricing</p>
          <h1 className="text-xl font-semibold">Packages</h1>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-foreground text-xs rounded-lg transition-colors"><Plus className="w-3.5 h-3.5" />Create Package</button>
      </div>

      {msg && <div className="mb-4 px-3 py-2 bg-secondary border border rounded-lg text-xs text-foreground flex justify-between"><span>{msg}</span><button onClick={() => setMsg('')}><X className="w-3 h-3" /></button></div>}

      <div className="bg-card border border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border">
              <th className="px-4 py-3 text-left text-[11px] font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-muted-foreground">Storage</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-muted-foreground">Chat Quota</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-muted-foreground">Departments</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {packages.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No packages yet</td></tr>
            ) : packages.map(p => (
              <tr key={p._id} className="border-t border hover:bg-card">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.storageLimitGB} GB</td>
                <td className="px-4 py-3 text-muted-foreground">{p.chatQuota > 0 ? `${p.chatQuota} / ${p.quotaType}` : 'Unlimited'}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.departmentLimit > 0 ? p.departmentLimit : 'Unlimited'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(p._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-background border border rounded-xl p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold mb-4">{editing ? 'Edit Package' : 'Create Package'}</h2>
            <div className="space-y-3">
              <div><label className="text-[11px] text-muted-foreground">Package Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Basic" className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              <div><label className="text-[11px] text-muted-foreground">Storage Limit (GB)</label><input type="number" min={1} value={form.storageLimitGB} onChange={e => setForm({ ...form, storageLimitGB: parseInt(e.target.value) || 5 })} className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              <div><label className="text-[11px] text-muted-foreground">Chat Quota (0 = unlimited)</label><input type="number" min={0} value={form.chatQuota} onChange={e => setForm({ ...form, chatQuota: parseInt(e.target.value) || 0 })} className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              <div>
                <label className="text-[11px] text-muted-foreground">Quota Type</label>
                <div className="flex gap-4 mt-2">
                  {['individual', 'total'].map(t => (
                    <label key={t} className="flex items-center gap-2 text-xs cursor-pointer"><input type="radio" name="qt" value={t} checked={form.quotaType === t} onChange={() => setForm({ ...form, quotaType: t })} className="w-3.5 h-3.5" />{t === 'individual' ? 'Per user' : 'Total pool'}</label>
                  ))}
                </div>
              </div>
              <div><label className="text-[11px] text-muted-foreground">Renew Day (1-31)</label><input type="number" min={1} max={31} value={form.renewDay} onChange={e => setForm({ ...form, renewDay: parseInt(e.target.value) || 1 })} className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              <div><label className="text-[11px] text-muted-foreground">Department Limit (0 = unlimited)</label><input type="number" min={0} value={form.departmentLimit} onChange={e => setForm({ ...form, departmentLimit: parseInt(e.target.value) || 0 })} className="w-full h-9 px-3 mt-1 text-sm rounded-lg bg-secondary border border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>
              {msg && <p className="text-xs text-red-400">{msg}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={handleSubmit} className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 text-foreground text-xs rounded-lg transition-colors">{editing ? 'Update' : 'Create'}</button>
                <button onClick={() => setShowModal(false)} className="h-9 px-4 bg-secondary hover:bg-muted text-xs rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
