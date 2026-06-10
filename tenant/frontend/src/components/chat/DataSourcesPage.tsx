import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "./ConfirmDialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Trash2, Database, X, Table, Play } from "lucide-react";

const COL_TYPES = ['string', 'number', 'integer', 'date', 'boolean'];

export const DataSourcesPage = () => {
  const [sources, setSources] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', columns: [] as { name: string; type: string; description: string }[], organizationIds: [] as string[] });
  const [viewSource, setViewSource] = useState<any>(null);
  const [records, setRecords] = useState<any>({ records: [], total: 0, page: 1 });
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const confirm = useConfirm();

  useEffect(() => { load(); loadOrgs(); }, []);
  const load = async () => { try { setSources(await api.getDataSources()); } catch (e: any) { toast.error(e.message); } };
  const loadOrgs = async () => { try { const d = await api.getAllOrganizations(); setOrganizations((d.organizations || []).filter((o: any) => o.type === 'organization')); } catch {} };

  const handleCreate = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    try {
      await api.createDataSource({ name: form.name, description: form.description, columns: form.columns.filter(c => c.name), organizationIds: form.organizationIds });
      setShowForm(false); setForm({ name: '', description: '', columns: [], organizationIds: [] }); load(); toast.success('Created');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (await confirm({ title: 'Delete Data Source', message: 'This will permanently drop the MySQL table and all data. Continue?', confirmText: 'Delete' })) {
      try { await api.deleteDataSource(id); load(); toast.success('Deleted'); } catch (e: any) { toast.error(e.message); }
    }
  };

  const handleClear = async (id: string) => {
    if (await confirm({ title: 'Clear All Records', message: 'This will delete all rows. Continue?', confirmText: 'Clear' })) {
      try { await api.clearDataSource(id); loadRecords(viewSource); toast.success('Cleared'); } catch (e: any) { toast.error(e.message); }
    }
  };

  const openView = async (s: any) => { setViewSource(s); await loadRecords(s); };
  const loadRecords = async (s: any, page = 1) => { try { setRecords(await api.getDataSourceRecords(s._id, page)); } catch { setRecords({ records: [], total: 0, page: 1 }); } };

  const handleQuery = async () => {
    if (!sqlQuery.trim()) return;
    try { setQueryResult(await api.queryDataSource(sqlQuery)); } catch (e: any) { setQueryResult({ error: e.message }); }
  };

  const isDynamic = (source: any) => source.kind === 'dynamic' || source.managed;
  const sourceBadge = (source: any) => isDynamic(source)
    ? { label: 'Dynamic Ingested', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' }
    : { label: 'Fixed SQL', className: 'bg-muted text-muted-foreground' };
  const formatSyncTime = (value?: string) => value ? new Date(value).toLocaleString() : 'Never synced';

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Developer</p>
            <h1 className="text-xl font-semibold">Data Sources</h1>
            <p className="text-xs text-muted-foreground mt-0.5">MySQL tables for structured data. AI can query these using natural language.</p>
          </div>
          <Button size="sm" onClick={() => setShowForm(true)} className="text-xs h-8 rounded-lg"><Plus className="w-3.5 h-3.5 mr-1.5" />Create Table</Button>
        </div>

        {/* Sources List */}
        <div className="space-y-2">
          {sources.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No data sources yet.</p>}
          {sources.map(s => (
            <div key={s._id} className="border rounded-lg px-4 py-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-500" />{s.name}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${sourceBadge(s).className}`}>{sourceBadge(s).label}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {s.description || s.tableName} · {s.columns?.length || 0} columns · {s.rowCount || 0} rows
                </p>
                {isDynamic(s) && (
                  <p className="text-[10px] text-muted-foreground">
                    Source: {s.sourceApp || 'external'} · External ID: <span className="font-mono select-all">{s.externalSourceId || '-'}</span> · Last synced: {formatSyncTime(s.lastIngestedAt)}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/60 font-mono select-all">ID: {s._id}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openView(s)} className="p-1.5 rounded hover:bg-muted"><Table className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(s._id)} className="p-1.5 rounded hover:bg-muted text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>

        {/* SQL Query Tool */}
        <div className="mt-6 border rounded-lg p-4">
          <p className="text-xs font-medium mb-2">SQL Query (SELECT only)</p>
          <div className="flex gap-2">
            <input value={sqlQuery} onChange={e => setSqlQuery(e.target.value)} placeholder="SELECT * FROM ds_customer_survey LIMIT 10" className="flex-1 h-8 px-3 text-xs border rounded-lg bg-transparent" onKeyDown={e => e.key === 'Enter' && handleQuery()} />
            <Button size="sm" onClick={handleQuery} className="text-xs h-8"><Play className="w-3 h-3 mr-1" />Run</Button>
          </div>
          {queryResult?.error && <p className="text-xs text-destructive mt-2">{queryResult.error}</p>}
          {queryResult?.rows && (
            <div className="mt-2 max-h-60 overflow-auto border rounded">
              <table className="w-full text-[11px]">
                <thead><tr className="bg-muted">{queryResult.rows[0] && Object.keys(queryResult.rows[0]).map(k => <th key={k} className="px-2 py-1 text-left font-medium">{k}</th>)}</tr></thead>
                <tbody>{queryResult.rows.map((r: any, i: number) => <tr key={i} className="border-t">{Object.values(r).map((v: any, j) => <td key={j} className="px-2 py-1">{v === null ? '—' : String(v)}</td>)}</tr>)}</tbody>
              </table>
              <p className="text-[10px] text-muted-foreground px-2 py-1">{queryResult.rowCount} rows</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-lg mx-4 border max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Create Data Source</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground">Table Name</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Customer Survey" className="w-full h-8 px-3 mt-1 text-xs border rounded-lg bg-transparent" />
                <p className="text-[10px] text-muted-foreground mt-0.5">MySQL table: ds_{form.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Description (AI uses this to understand the data)</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Customer feedback responses from HLA survey" className="w-full h-8 px-3 mt-1 text-xs border rounded-lg bg-transparent" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Link to Organizations</label>
                <div className="mt-1 max-h-24 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {organizations.map(org => (
                    <label key={org._id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={form.organizationIds.includes(org._id)} onChange={() => setForm(prev => ({ ...prev, organizationIds: prev.organizationIds.includes(org._id) ? prev.organizationIds.filter(id => id !== org._id) : [...prev.organizationIds, org._id] }))} className="w-3.5 h-3.5 rounded" />
                      {org.name}
                    </label>
                  ))}
                  {organizations.length === 0 && <p className="text-[10px] text-muted-foreground">No organizations found</p>}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Only users from selected orgs can query this data via chat</p>
              </div>
              <details className="border rounded-lg p-2">
                <summary className="text-[11px] text-muted-foreground cursor-pointer">Columns (optional — auto-detected from data if empty)</summary>
                <div className="mt-2">
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setForm({ ...form, columns: [...form.columns, { name: '', type: 'string', description: '' }] })} className="text-[10px] text-blue-500">+ Add</button>
                  </div>
                  {form.columns.map((col, i) => (
                    <div key={i} className="flex gap-1.5 mt-1.5 items-center">
                      <input value={col.name} onChange={e => { const c = [...form.columns]; c[i] = { ...c[i], name: e.target.value }; setForm({ ...form, columns: c }); }} placeholder="column_name" className="w-28 h-7 px-2 text-[11px] rounded border bg-transparent" />
                      <select value={col.type} onChange={e => { const c = [...form.columns]; c[i] = { ...c[i], type: e.target.value }; setForm({ ...form, columns: c }); }} className="w-20 h-7 px-1 text-[11px] rounded border bg-transparent">
                        {COL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input value={col.description} onChange={e => { const c = [...form.columns]; c[i] = { ...c[i], description: e.target.value }; setForm({ ...form, columns: c }); }} placeholder="Description for AI" className="flex-1 h-7 px-2 text-[11px] rounded border bg-transparent" />
                      <button onClick={() => setForm({ ...form, columns: form.columns.filter((_, j) => j !== i) })} className="text-red-500 text-[10px]">✕</button>
                    </div>
                  ))}
                </div>
              </details>
              <Button size="sm" onClick={handleCreate} className="w-full text-xs h-8">Create Table</Button>
            </div>
          </div>
        </div>
      )}

      {/* View Records Modal */}
      {viewSource && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setViewSource(null)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-3xl mx-4 border max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold">{viewSource.name}</h2>
                <p className="text-[10px] text-muted-foreground">
                  {sourceBadge(viewSource).label} · {viewSource.tableName} · {records.total} rows
                </p>
                {isDynamic(viewSource) && (
                  <p className="text-[10px] text-muted-foreground">
                    {viewSource.sourceApp || 'external'} · <span className="font-mono select-all">{viewSource.externalSourceId || '-'}</span> · Last synced: {formatSyncTime(viewSource.lastIngestedAt)}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleClear(viewSource._id)} className="text-xs h-7">Clear All</Button>
                <button onClick={() => setViewSource(null)}><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-auto max-h-[60vh] border rounded">
              <table className="w-full text-[11px]">
                <thead><tr className="bg-muted">{viewSource.columns.map((c: any) => <th key={c.name} className="px-2 py-1.5 text-left font-medium">{c.name}</th>)}</tr></thead>
                <tbody>
                  {records.records.map((r: any, i: number) => (
                    <tr key={i} className="border-t">{viewSource.columns.map((c: any) => <td key={c.name} className="px-2 py-1">{r[c.name] === null ? '—' : String(r[c.name])}</td>)}</tr>
                  ))}
                  {records.records.length === 0 && <tr><td colSpan={viewSource.columns.length} className="px-2 py-4 text-center text-muted-foreground">No records</td></tr>}
                </tbody>
              </table>
            </div>
            {records.pages > 1 && (
              <div className="flex gap-2 mt-2 justify-center">
                {Array.from({ length: Math.min(records.pages, 10) }, (_, i) => (
                  <button key={i} onClick={() => loadRecords(viewSource, i + 1)} className={`px-2 py-0.5 text-[10px] rounded ${records.page === i + 1 ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>{i + 1}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
