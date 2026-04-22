import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { UserPlus, Eye, EyeOff, Check, Globe } from "lucide-react";

export const NewClientPage = ({ onNavigate }: { onNavigate: (page: any) => void }) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [form, setForm] = useState({ orgName: "", adminName: "", adminEmail: "", adminPassword: "", planId: "", publicEnabled: false });
  const [showPass, setShowPass] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  useEffect(() => { api.getGroups().then(d => setPlans(Array.isArray(d) ? d : [])).catch(() => {}); }, []);

  const handleCreate = async () => {
    if (!form.orgName || !form.adminName || !form.adminEmail || !form.adminPassword) { toast.error("Fill all required fields"); return; }
    if (form.adminPassword.length < 6) { toast.error("Password min 6 characters"); return; }
    setCreating(true);
    try {
      await api.createClient(form.orgName, form.adminEmail, form.adminPassword, form.adminName, form.planId || null, form.publicEnabled);
      toast.success("Client created successfully");
      setCreated(true);
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  if (created) return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto"><Check className="w-6 h-6 text-green-500" /></div>
        <div>
          <p className="text-sm font-medium">Client Created</p>
          <p className="text-xs text-muted-foreground mt-1">{form.orgName} — {form.adminEmail}</p>
        </div>
        <div className="flex gap-2 justify-center">
          <Button size="sm" className="text-xs h-8" onClick={() => { setForm({ orgName: "", adminName: "", adminEmail: "", adminPassword: "", planId: "", publicEnabled: false }); setCreated(false); }}>Create Another</Button>
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => onNavigate("organizations")}>View Organizations</Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-lg">
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Onboarding</p>
          <h1 className="text-xl font-semibold">Create New Client</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Creates organization, admin account, and assigns plan in one step.</p>
        </div>

        <div className="space-y-4">
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Organization</p></div>
            <div className="p-4">
              <label className="text-[11px] text-muted-foreground">Organization Name *</label>
              <input value={form.orgName} onChange={e => setForm({ ...form, orgName: e.target.value })} placeholder="e.g., Soon Chye HQ"
                className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={form.publicEnabled} onChange={e => setForm({ ...form, publicEnabled: e.target.checked })} className="rounded" />
                <span className="text-xs flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />Enable public access (embed widget for external visitors)</span>
              </label>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Admin Account</p></div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground">Full Name *</label>
                <input value={form.adminName} onChange={e => setForm({ ...form, adminName: e.target.value })} placeholder="e.g., Ahmad bin Ali"
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Email *</label>
                <input type="email" value={form.adminEmail} onChange={e => setForm({ ...form, adminEmail: e.target.value })} placeholder="e.g., admin@soonchye.com"
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Password *</label>
                <div className="relative mt-1">
                  <input type={showPass ? "text" : "password"} value={form.adminPassword} onChange={e => setForm({ ...form, adminPassword: e.target.value })} placeholder="Min 6 characters"
                    className="w-full h-9 px-3 pr-10 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">User will be prompted to change password on first login.</p>
              </div>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Package</p></div>
            <div className="p-4">
              <label className="text-[11px] text-muted-foreground">Assign Package</label>
              <select value={form.planId} onChange={e => setForm({ ...form, planId: e.target.value })}
                className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="">No package (assign later)</option>
                {plans.map(p => <option key={p._id} value={p._id}>{p.name} — {p.storageLimitGB}GB, {p.chatQuota || '∞'} chats</option>)}
              </select>
            </div>
          </div>

          <Button onClick={handleCreate} disabled={creating} className="w-full text-xs h-9 rounded-lg">
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />{creating ? "Creating..." : "Create Client"}
          </Button>
        </div>
      </div>
    </div>
  );
};
