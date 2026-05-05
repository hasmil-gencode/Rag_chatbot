import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Trash2, Edit, Mail, X } from "lucide-react";

export const SmtpSettingsPage = () => {
  const [configs, setConfigs] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ orgId: "", host: "smtp.office365.com", port: 587, user: "", password: "", from: "Genia System", tls: true });
  const isDeveloper = (localStorage.getItem('userRole') || '') === 'developer';

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [smtps, orgs] = await Promise.all([
        fetch('/api/org-smtp', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json()),
        api.getAllOrganizations()
      ]);
      setConfigs(smtps);
      setOrganizations((orgs.organizations || []).filter((o: any) => o.type === 'organization'));
    } catch {}
  };

  const handleEdit = (c: any) => {
    setEditing(c);
    setForm({ orgId: c.orgId, host: c.host, port: c.port, user: c.user, password: c.password, from: c.from || '', tls: c.tls !== false });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/org-smtp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(form) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setShowForm(false); setEditing(null); load(); toast.success('Saved');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (orgId: string) => {
    try {
      await fetch(`/api/org-smtp/${orgId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      load(); toast.success('Deleted');
    } catch (e: any) { toast.error(e.message); }
  };

  const getOrgName = (orgId: string) => organizations.find(o => o._id === orgId)?.name || orgId;
  const configuredOrgIds = configs.map(c => c.orgId);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Configuration</p>
            <h1 className="text-xl font-semibold">SMTP Settings</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Per-organization email server configuration. Falls back to global SMTP in Settings → Notifications.</p>
          </div>
          <Button size="sm" onClick={() => { setShowForm(true); setEditing(null); setForm({ orgId: "", host: "smtp.office365.com", port: 587, user: "", password: "", from: "Genia System", tls: true }); }} className="text-xs h-8 rounded-lg">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add SMTP
          </Button>
        </div>

        {/* List */}
        <div className="space-y-3">
          {configs.length === 0 ? (
            <div className="border rounded-lg px-4 py-12 text-center text-sm text-muted-foreground">
              No per-org SMTP configured. All emails use global SMTP from Settings → Notifications.
            </div>
          ) : configs.map(c => (
            <div key={c.orgId} className="border rounded-lg overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{getOrgName(c.orgId)}</p>
                    <p className="text-[11px] text-muted-foreground">{c.host}:{c.port} · {c.user || 'No user set'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleEdit(c)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Edit className="w-4 h-4" /></button>
                  {isDeveloper && <button onClick={() => handleDelete(c.orgId)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
            <div className="bg-background border rounded-xl p-5 w-[480px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">{editing ? 'Edit SMTP' : 'Add SMTP'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-[11px] text-muted-foreground">Organization</label>
                  <select value={form.orgId} onChange={e => setForm({ ...form, orgId: e.target.value })} required disabled={!!editing}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="">Select organization...</option>
                    {organizations.filter(o => !configuredOrgIds.includes(o._id) || o._id === editing?.orgId).map(o => (
                      <option key={o._id} value={o._id}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-muted-foreground">SMTP Host</label>
                    <input value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} required
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Port</label>
                    <input type="number" value={form.port} onChange={e => setForm({ ...form, port: parseInt(e.target.value) })}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">User (email)</label>
                  <input value={form.user} onChange={e => setForm({ ...form, user: e.target.value })}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="noreply@company.com" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Password</label>
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-muted-foreground">From Name</label>
                    <input value={form.from} onChange={e => setForm({ ...form, from: e.target.value })}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.tls} onChange={e => setForm({ ...form, tls: e.target.checked })} className="rounded" />
                      <span className="text-xs">Use TLS</span>
                    </label>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" size="sm" className="text-xs h-8 flex-1">{editing ? 'Update' : 'Save'}</Button>
                  <Button type="button" size="sm" variant="outline" onClick={async () => {
                    if (!form.host || !form.user || !form.password) { toast.error('Fill host, user and password first'); return; }
                    const testEmail = prompt('Send test email to:', localStorage.getItem('userEmail') || '');
                    if (!testEmail) return;
                    try {
                      const res = await fetch('/api/org-smtp/test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ ...form, testEmail }) });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error);
                      toast.success(json.message);
                    } catch (e: any) { toast.error(e.message); }
                  }} className="text-xs h-8">Test</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)} className="text-xs h-8">Cancel</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
