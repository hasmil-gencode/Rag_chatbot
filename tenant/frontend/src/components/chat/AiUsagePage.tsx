import { useState, useEffect } from "react";
import { RefreshCw, Zap, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const AiUsagePage = () => {
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai-usage?days=${days}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setData(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [days]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">System</p>
            <h1 className="text-xl font-semibold">AI Usage</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Track outbound AI API calls — LLM, embedding, guardrail, OCR.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={days} onChange={e => setDays(Number(e.target.value))} className="h-8 px-2 text-xs border rounded-lg bg-transparent">
              <option value={1}>Today</option>
              <option value={7}>7 Days</option>
              <option value={30}>30 Days</option>
              <option value={90}>90 Days</option>
            </select>
            <button onClick={load} className="p-1.5 rounded-lg border hover:bg-muted"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        {!data ? (
          <div className="text-center py-20 text-sm text-muted-foreground">Loading...</div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              <div className="border rounded-lg px-4 py-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" />Total Calls</p>
                <p className="text-2xl font-semibold mt-0.5">{data.total.toLocaleString()}</p>
              </div>
              <div className="border rounded-lg px-4 py-3">
                <p className="text-[11px] text-muted-foreground">Avg / Day</p>
                <p className="text-2xl font-semibold mt-0.5">{data.days > 0 ? Math.round(data.total / data.days).toLocaleString() : 0}</p>
              </div>
              <div className="border rounded-lg px-4 py-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Errors</p>
                <p className="text-2xl font-semibold mt-0.5">{data.errors}</p>
              </div>
              <div className="border rounded-lg px-4 py-3">
                <p className="text-[11px] text-muted-foreground">Providers</p>
                <p className="text-2xl font-semibold mt-0.5">{data.byProvider.length}</p>
              </div>
            </div>

            {/* Calls Over Time */}
            <div className="border rounded-lg overflow-hidden mb-5">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Calls Over Time</p></div>
              <div className="p-4" style={{ height: 250 }}>
                {data.byHour.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No data for this period</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(() => {
                      const grouped: Record<string, any> = {};
                      data.byHour.forEach((d: any) => {
                        const dt = new Date(d._id.time.includes('T') ? d._id.time : d._id.time + 'T00:00');
                        const label = dt.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ', ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        if (!grouped[label]) grouped[label] = { time: label };
                        grouped[label][d._id.type || 'other'] = (grouped[label][d._id.type || 'other'] || 0) + d.count;
                      });
                      return Object.values(grouped);
                    })()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12, background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                      <Bar dataKey="chat" stackId="a" fill="#3b82f6" name="Chat" />
                      <Bar dataKey="embedding" stackId="a" fill="#10b981" name="Embedding" />
                      <Bar dataKey="guardrail" stackId="a" fill="#f59e0b" name="Guardrail" />
                      <Bar dataKey="ocr" stackId="a" fill="#ef4444" name="OCR" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Recent Calls */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Recent Calls (last 50)</p></div>
              {(!data.recent || data.recent.length === 0) ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">No calls yet</div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b">
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Time</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Provider</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Model</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground">Latency</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground">Status</th>
                  </tr></thead>
                  <tbody>
                    {data.recent.map((r: any) => (
                      <tr key={r._id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2 text-muted-foreground text-[12px]">{new Date(r.createdAt).toLocaleString([], { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' })}</td>
                        <td className="px-4 py-2"><span className={`text-[11px] px-1.5 py-0.5 rounded-full ${r.type === 'chat' ? 'bg-blue-500/10 text-blue-500' : r.type === 'embedding' ? 'bg-green-500/10 text-green-500' : r.type === 'guardrail' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-red-500/10 text-red-500'}`}>{r.type}</span></td>
                        <td className="px-4 py-2">{r.provider}</td>
                        <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground">{r.model}</td>
                        <td className="px-4 py-2 text-muted-foreground text-[12px]">{r.source}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{r.latency}ms</td>
                        <td className="px-4 py-2 text-right">{r.status === 'ok' ? <span className="text-green-500">✓</span> : <span className="text-red-500">✗</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
