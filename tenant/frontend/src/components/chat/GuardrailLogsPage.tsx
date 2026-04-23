import { useState, useEffect } from "react";
import { RefreshCw, Shield, ShieldAlert, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GuardrailLog { _id: string; userId?: string; sessionId: string; type: 'input' | 'output'; source?: string; message: string; reason: string; createdAt: string; }

export const GuardrailLogsPage = () => {
  const [logs, setLogs] = useState<GuardrailLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<GuardrailLog | null>(null);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mongo-browse/guardrail_logs?limit=100', { headers });
      const data = await res.json();
      setLogs(data.docs || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = logs.filter(l => !search ||
    l.message?.toLowerCase().includes(search.toLowerCase()) ||
    l.reason?.toLowerCase().includes(search.toLowerCase()) ||
    l.source?.toLowerCase().includes(search.toLowerCase())
  );

  const inputCount = logs.filter(l => l.type === 'input').length;
  const outputCount = logs.filter(l => l.type === 'output').length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">System</p>
            <h1 className="text-xl font-semibold">Guardrail Logs</h1>
            <p className="text-xs text-muted-foreground mt-0.5">View blocked requests and safety violations.</p>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="text-xs h-8">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Blocked</p>
            <p className="text-2xl font-semibold mt-0.5">{logs.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-red-500" /><p className="text-[11px] text-muted-foreground">Input Blocked</p></div>
            <p className="text-2xl font-semibold mt-0.5">{inputCount}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-orange-500" /><p className="text-[11px] text-muted-foreground">Output Blocked</p></div>
            <p className="text-2xl font-semibold mt-0.5">{outputCount}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by message, reason, or source..."
            className="w-full h-9 pl-9 pr-3 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {/* Logs table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground">Message</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground">Reason</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground">Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">{loading ? 'Loading...' : 'No blocked requests'}</td></tr>
              ) : filtered.map(log => (
                <tr key={log._id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedLog(log)}>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${log.type === 'input' ? 'bg-red-900/50 text-red-300' : 'bg-orange-900/50 text-orange-300'}`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{log.source || 'browser'}</td>
                  <td className="px-4 py-2.5 max-w-[300px] truncate font-mono">{log.message}</td>
                  <td className="px-4 py-2.5 max-w-[250px] truncate text-muted-foreground">{log.reason}</td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setSelectedLog(null)}>
          <div className="bg-background border rounded-xl p-5 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                <p className="text-sm font-semibold">Blocked Request Detail</p>
              </div>
              <button onClick={() => setSelectedLog(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${selectedLog.type === 'input' ? 'bg-red-900/50 text-red-300' : 'bg-orange-900/50 text-orange-300'}`}>
                  {selectedLog.type}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{selectedLog.source || 'browser'}</span>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Message:</p>
                <pre className="bg-muted rounded-lg p-3 text-[11px] whitespace-pre-wrap max-h-[200px] overflow-y-auto">{selectedLog.message}</pre>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Reason:</p>
                <p className="text-sm">{selectedLog.reason}</p>
              </div>
              <div className="flex justify-between text-muted-foreground pt-2 border-t">
                <span>Session: {selectedLog.sessionId?.slice(0, 12)}...</span>
                <span>{new Date(selectedLog.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
