import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Server, Users, Package } from 'lucide-react';

export function DashboardPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => { api.getServers().then(setServers).catch(() => {}); api.getTenants().then(setTenants).catch(() => {}); api.getPackages().then(setPackages).catch(() => {}); }, []);

  const activeServers = servers.filter(s => s.status === 'active').length;
  const totalSlots = servers.reduce((s, sv) => s + (sv.maxTenants || 5), 0);

  return (
    <div className="p-6">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Overview</p>
      <h1 className="text-xl font-semibold mb-6">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3"><Server className="w-5 h-5 text-blue-400" /><span className="text-sm text-muted-foreground">Servers</span></div>
          <p className="text-3xl font-semibold">{activeServers}<span className="text-lg text-muted-foreground">/{servers.length}</span></p>
          <p className="text-xs text-muted-foreground mt-1">active</p>
        </div>
        <div className="bg-card border border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3"><Users className="w-5 h-5 text-green-400" /><span className="text-sm text-muted-foreground">Tenants</span></div>
          <p className="text-3xl font-semibold">{tenants.length}<span className="text-lg text-muted-foreground">/{totalSlots}</span></p>
          <p className="text-xs text-muted-foreground mt-1">slots used</p>
        </div>
        <div className="bg-card border border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3"><Package className="w-5 h-5 text-purple-400" /><span className="text-sm text-muted-foreground">Packages</span></div>
          <p className="text-3xl font-semibold">{packages.length}</p>
          <p className="text-xs text-muted-foreground mt-1">defined</p>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-sm font-medium">Server Status</p>
        {servers.map(s => (
          <div key={s._id} className="flex items-center justify-between bg-card border border rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.url}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{s.tenantCount || 0}/{s.maxTenants || 5} tenants</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{s.status}</span>
            </div>
          </div>
        ))}
        {servers.length === 0 && <p className="text-sm text-muted-foreground">No servers added yet. Go to Servers page to add one.</p>}
      </div>
    </div>
  );
}
