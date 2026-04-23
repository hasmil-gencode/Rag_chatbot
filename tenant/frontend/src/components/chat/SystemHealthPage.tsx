import { useState, useEffect } from "react";
import { RefreshCw, Database, Server, Brain, Workflow, Users, FileText, MessageSquare, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ServiceStatus { status: string; latency: number; dbSize?: number; collections?: number; vectors?: number; dimension?: number; }
interface HealthData {
  uptime: number; memory: { rss: number; heapUsed: number; heapTotal: number };
  nodeVersion: string;
  services: { mongodb: ServiceStatus; qdrant: ServiceStatus; n8n: ServiceStatus };
  stats: { users: number; files: number; sessions: number; messages: number };
  models: Record<string, { status: string; latency: number; error?: string }>;
  modelsCheckedAt: string | null;
  security: {
    jwtExpiry: string; loginRateLimit: string; accountLockout: string; apiRateLimit: string; passwordPolicy: string;
    guardrailEnabled: boolean; guardrailBlocked: number; guardrailBlockedToday: number;
    activeIpLocks: number; activeAccountLocks: number;
  };
}

export const SystemHealthPage = () => {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system-health', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setData(await res.json());
      setLastRefresh(new Date());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const formatUptime = (s: number) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };
  const formatBytes = (b: number) => b < 1e6 ? `${(b / 1024).toFixed(0)} KB` : b < 1e9 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e9).toFixed(2)} GB`;
  const StatusDot = ({ status }: { status: string }) => (
    <span className={`inline-block w-2 h-2 rounded-full ${status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">System</p>
            <h1 className="text-xl font-semibold">Health & Status</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Monitor services, resources, and application stats.</p>
          </div>
          <div className="flex items-center gap-2">
            {lastRefresh && <span className="text-[10px] text-muted-foreground">{lastRefresh.toLocaleTimeString()}</span>}
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="text-xs h-8">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        {!data ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
        ) : (
          <div className="space-y-5">
            {/* App Info */}
            <div className="grid grid-cols-3 gap-3">
              <div className="border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1"><Clock className="w-3.5 h-3.5 text-muted-foreground" /><p className="text-[11px] text-muted-foreground">Uptime</p></div>
                <p className="text-lg font-semibold">{formatUptime(data.uptime)}</p>
              </div>
              <div className="border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1"><Server className="w-3.5 h-3.5 text-muted-foreground" /><p className="text-[11px] text-muted-foreground">Memory (Heap)</p></div>
                <p className="text-lg font-semibold">{formatBytes(data.memory.heapUsed)}</p>
                <p className="text-[10px] text-muted-foreground">of {formatBytes(data.memory.heapTotal)}</p>
              </div>
              <div className="border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1"><Server className="w-3.5 h-3.5 text-muted-foreground" /><p className="text-[11px] text-muted-foreground">Node.js</p></div>
                <p className="text-lg font-semibold">{data.nodeVersion}</p>
              </div>
            </div>

            {/* Services */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Services</p></div>
              <div className="divide-y">
                {([
                  { key: 'mongodb', label: 'MongoDB', icon: Database, extra: data.services.mongodb.dbSize ? `${formatBytes(data.services.mongodb.dbSize)} · ${data.services.mongodb.collections} collections` : '' },
                  { key: 'qdrant', label: 'Qdrant Vector DB', icon: Brain, extra: data.services.qdrant.vectors !== undefined ? `${data.services.qdrant.vectors?.toLocaleString()} vectors · ${data.services.qdrant.dimension}d` : '' },
                  { key: 'n8n', label: 'n8n Workflows', icon: Workflow, extra: '' },
                ] as const).map(svc => {
                  const s = data.services[svc.key as keyof typeof data.services];
                  return (
                    <div key={svc.key} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <svc.icon className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{svc.label}</p>
                          {svc.extra && <p className="text-[10px] text-muted-foreground">{svc.extra}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {s.latency > 0 && <span className="text-[10px] text-muted-foreground">{s.latency}ms</span>}
                        <div className="flex items-center gap-1.5">
                          <StatusDot status={s.status} />
                          <span className={`text-xs font-medium ${s.status === 'online' ? 'text-green-500' : 'text-red-500'}`}>
                            {s.status === 'online' ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Models */}
            {data.models && Object.keys(data.models).length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b flex items-center justify-between">
                  <p className="text-xs font-medium flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> AI Models</p>
                  <p className="text-[10px] text-muted-foreground">{data.modelsCheckedAt ? `Last checked: ${new Date(data.modelsCheckedAt).toLocaleString()}` : 'Checking...'}</p>
                </div>
                <div className="divide-y">
                  {Object.entries(data.models).map(([name, info]) => (
                    <div key={name} className="px-4 py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${info.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="font-mono">{name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        {info.status === 'ok' ? (
                          <span>{info.latency}ms</span>
                        ) : (
                          <span className="text-red-500 text-[11px] max-w-[300px] truncate">{info.error || 'Unavailable'}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* App Stats */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Application Stats</p></div>
              <div className="grid grid-cols-4 divide-x">
                {[
                  { label: 'Users', value: data.stats.users, icon: Users },
                  { label: 'Files', value: data.stats.files, icon: FileText },
                  { label: 'Chat Sessions', value: data.stats.sessions, icon: MessageSquare },
                  { label: 'Messages', value: data.stats.messages, icon: MessageSquare },
                ].map(stat => (
                  <div key={stat.label} className="px-4 py-3 text-center">
                    <stat.icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-lg font-semibold">{stat.value.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Security */}
            {data.security && (
              <div className="border rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5" />
                  <p className="text-xs font-medium">Security</p>
                </div>
                <div className="divide-y">
                  <div className="grid grid-cols-4 divide-x">
                    <div className="px-4 py-3 text-center">
                      <p className="text-lg font-semibold">{data.security.guardrailBlockedToday}</p>
                      <p className="text-[10px] text-muted-foreground">Blocked Today</p>
                    </div>
                    <div className="px-4 py-3 text-center">
                      <p className="text-lg font-semibold">{data.security.guardrailBlocked}</p>
                      <p className="text-[10px] text-muted-foreground">Total Blocked</p>
                    </div>
                    <div className="px-4 py-3 text-center">
                      <p className="text-lg font-semibold">{data.security.activeIpLocks}</p>
                      <p className="text-[10px] text-muted-foreground">IP Locks Active</p>
                    </div>
                    <div className="px-4 py-3 text-center">
                      <p className="text-lg font-semibold">{data.security.activeAccountLocks}</p>
                      <p className="text-[10px] text-muted-foreground">Account Locks Active</p>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    {[
                      { label: 'AI Guardrail', value: data.security.guardrailEnabled ? 'Enabled' : 'Disabled', ok: data.security.guardrailEnabled },
                      { label: 'JWT Expiry', value: data.security.jwtExpiry, ok: true },
                      { label: 'Login Rate Limit', value: data.security.loginRateLimit, ok: true },
                      { label: 'Account Lockout', value: data.security.accountLockout, ok: true },
                      { label: 'API Rate Limit', value: data.security.apiRateLimit, ok: true },
                      { label: 'Password Policy', value: data.security.passwordPolicy, ok: true },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{item.label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${item.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span>{item.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
