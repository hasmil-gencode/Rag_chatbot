import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "./ConfirmDialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Trash2, Edit, Database, X, Copy, Clock, CheckCircle2, AlertTriangle, Search, Eraser, History, PlusCircle } from "lucide-react";

type MetadataField = { key: string; type: string; required: boolean; filterable: boolean };

export const ExternalKnowledgePage = () => {
  const [collections, setCollections] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [formData, setFormData] = useState({ name: "", description: "", organizationIds: [] as string[], metadataSchema: [] as MetadataField[] });
  const [searchState, setSearchState] = useState<Record<string, { query: string; loading?: boolean; results?: any[]; error?: string }>>({});
  const [logs, setLogs] = useState<Record<string, any[]>>({});
  const [openLogs, setOpenLogs] = useState<Set<string>>(new Set());
  const confirm = useConfirm();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [cols, orgs] = await Promise.all([api.getExternalCollections(), api.getAllOrganizations()]);
      setCollections(cols);
      setOrganizations((orgs.organizations || []).filter((o: any) => o.type === 'organization'));
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await api.updateExternalCollection(editing._id, formData);
      else await api.createExternalCollection(formData);
      setShowForm(false); setEditing(null); setFormData({ name: "", description: "", organizationIds: [], metadataSchema: [] }); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = (col: any) => {
    setEditing(col);
    setFormData({ name: col.name, description: col.description || "", organizationIds: (col.organizationIds || []).map((id: any) => id.toString ? id.toString() : id), metadataSchema: col.metadataSchema || [] });
    setShowForm(true);
  };

  const handleDelete = async (col: any) => {
    if (await confirm(`Delete "${col.name}"? This will also remove all ${col.recordCount || 0} vectors from Qdrant.`)) {
      try { await api.deleteExternalCollection(col._id); load(); } catch (e: any) { toast.error(e.message); }
    }
  };

  const copyEndpoint = (id: string) => {
    const example = `curl https://YOUR_DOMAIN/api/ingest \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "collectionId": "${id}",
    "mode": "append",
    "records": [
      {
        "id": "po_001",
        "content": "PO-001, Customer: ABC, RM5000",
        "metadata": {
          "externalUserId": "ali_123",
          "company": "ABC Sdn Bhd",
          "type": "purchase_order"
        }
      }
    ]
  }'`;
    navigator.clipboard.writeText(example);
    toast.success("Ingest example copied to clipboard");
  };

  const copySamplePayload = (col: any) => {
    const metadata = (col.metadataSchema || []).reduce((acc: any, field: MetadataField) => {
      acc[field.key] = field.type === 'number' ? 123 : field.type === 'date' ? '2026-05-19' : field.type === 'boolean' ? true : `${field.key}_value`;
      return acc;
    }, { externalUserId: 'ali_123' });
    const sample = {
      collectionId: col._id,
      mode: 'append',
      records: [{ id: 'record_001', content: 'Record text to embed', metadata }],
    };
    navigator.clipboard.writeText(JSON.stringify(sample, null, 2));
    toast.success("Sample payload copied");
  };

  const toggleOrg = (orgId: string) => {
    setFormData(prev => ({
      ...prev,
      organizationIds: prev.organizationIds.includes(orgId)
        ? prev.organizationIds.filter(id => id !== orgId)
        : [...prev.organizationIds, orgId]
    }));
  };

  const addMetadataField = () => setFormData(prev => ({
    ...prev,
    metadataSchema: [...prev.metadataSchema, { key: "", type: "string", required: false, filterable: true }],
  }));

  const updateMetadataField = (index: number, patch: Partial<MetadataField>) => setFormData(prev => ({
    ...prev,
    metadataSchema: prev.metadataSchema.map((field, i) => i === index ? { ...field, ...patch } : field),
  }));

  const removeMetadataField = (index: number) => setFormData(prev => ({
    ...prev,
    metadataSchema: prev.metadataSchema.filter((_, i) => i !== index),
  }));

  const runSearch = async (col: any) => {
    const state = searchState[col._id];
    if (!state?.query?.trim()) { toast.error("Type a test query first"); return; }
    setSearchState(prev => ({ ...prev, [col._id]: { ...state, loading: true, error: undefined } }));
    try {
      const data = await api.searchExternalCollection(col._id, { query: state.query, limit: 5 });
      setSearchState(prev => ({ ...prev, [col._id]: { ...state, loading: false, results: data.results || [] } }));
    } catch (e: any) {
      setSearchState(prev => ({ ...prev, [col._id]: { ...state, loading: false, error: e.message } }));
    }
  };

  const toggleLogs = async (col: any) => {
    const next = new Set(openLogs);
    if (next.has(col._id)) {
      next.delete(col._id);
      setOpenLogs(next);
      return;
    }
    next.add(col._id);
    setOpenLogs(next);
    try {
      const data = await api.getExternalIngestLogs(col._id);
      setLogs(prev => ({ ...prev, [col._id]: data }));
    } catch (e: any) { toast.error(e.message); }
  };

  const clearVectors = async (col: any) => {
    if (!await confirm(`Clear vectors for "${col.name}"? The collection stays, but all indexed external records are removed.`)) return;
    try {
      await api.clearExternalCollectionVectors(col._id);
      toast.success("Vectors cleared");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const statusClass = (status?: string) => {
    if (status === 'success') return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
    if (status === 'failed') return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
    if (status === 'processing') return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
    if (status === 'cleared') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
    return 'bg-muted text-muted-foreground';
  };

  const statusLabel = (status?: string) => status || 'never';
  const formatDuration = (ms?: number) => typeof ms === 'number' ? `${ms.toLocaleString()}ms` : '-';

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Developer</p>
            <h1 className="text-xl font-semibold">External Knowledge</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage external data collections for AI knowledge base.</p>
          </div>
          <Button size="sm" onClick={() => { setShowForm(true); setEditing(null); setFormData({ name: "", description: "", organizationIds: [], metadataSchema: [] }); }} className="text-xs h-8 rounded-lg">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Collection
          </Button>
        </div>

        {/* Collections */}
        <div className="space-y-3">
          {collections.length === 0 ? (
            <div className="border rounded-lg px-4 py-12 text-center text-sm text-muted-foreground">
              No external collections yet. Create one and use the Ingest API from Node-RED.
            </div>
          ) : collections.map(col => (
            <div key={col._id} className="border rounded-lg overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{col.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusClass(col.lastIngestStatus)}`}>{statusLabel(col.lastIngestStatus)}</span>
                    </div>
                    {col.description && <p className="text-[11px] text-muted-foreground">{col.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => copyEndpoint(col._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Copy curl example"><Copy className="w-4 h-4" /></button>
                  <button onClick={() => copySamplePayload(col)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Copy sample payload"><PlusCircle className="w-4 h-4" /></button>
                  <button onClick={() => toggleLogs(col)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Ingest history"><History className="w-4 h-4" /></button>
                  <button onClick={() => clearVectors(col)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Clear vectors"><Eraser className="w-4 h-4" /></button>
                  <button onClick={() => handleEdit(col)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(col)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="px-4 py-2 border-t bg-muted/30">
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                  <span>{(col.recordCount || 0).toLocaleString()} records</span>
                  <span>{(col.totalIngested || 0).toLocaleString()} total ingested</span>
                  <span>Schema: {col.metadataSchema?.length || 0} fields</span>
                  <span>Orgs: {col.organizationIds?.length || 0}</span>
                  {col.lastIngestAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last ingest: {new Date(col.lastIngestAt).toLocaleString()}</span>}
                  <span>Last count: {(col.lastIngestCount || 0).toLocaleString()}</span>
                  {typeof col.lastIngestSkipped === 'number' && <span>Skipped: {col.lastIngestSkipped.toLocaleString()}</span>}
                  <span>Duration: {formatDuration(col.lastIngestDurationMs)}</span>
                  <span className="font-mono text-[10px] ml-auto select-all">ID: {col._id}</span>
                </div>
                {col.lastIngestStatus === 'success' && (
                  <p className="mt-1 text-[11px] text-green-700 dark:text-green-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Last ingest completed using {col.lastIngestMode || 'append'} mode.
                  </p>
                )}
                {col.lastIngestStatus === 'failed' && (
                  <p className="mt-1 text-[11px] text-red-700 dark:text-red-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {col.lastIngestError || col.lastIngest?.error || 'Last ingest failed'}
                  </p>
                )}
              </div>
              <div className="px-4 py-3 border-t space-y-3">
                <div className="flex gap-2">
                  <input
                    value={searchState[col._id]?.query || ""}
                    onChange={e => setSearchState(prev => ({ ...prev, [col._id]: { ...(prev[col._id] || {}), query: e.target.value } }))}
                    placeholder="Test search this collection..."
                    className="flex-1 h-8 px-3 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button size="sm" variant="outline" onClick={() => runSearch(col)} className="h-8 text-xs">
                    <Search className="w-3.5 h-3.5 mr-1.5" /> {searchState[col._id]?.loading ? 'Searching' : 'Search'}
                  </Button>
                </div>
                {searchState[col._id]?.error && <p className="text-[11px] text-red-600">{searchState[col._id]?.error}</p>}
                {!!searchState[col._id]?.results?.length && (
                  <div className="space-y-2">
                    {searchState[col._id]?.results?.map((result, index) => (
                      <div key={`${result.recordId || index}`} className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Score: {Number(result.score || 0).toFixed(4)} {result.recordId && `· Record: ${result.recordId}`}</p>
                        <p className="text-xs mt-1 line-clamp-3">{result.content}</p>
                      </div>
                    ))}
                  </div>
                )}
                {openLogs.has(col._id) && (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="px-3 py-2 border-b text-xs font-medium">Ingest History</div>
                    {(logs[col._id] || []).length === 0 ? (
                      <div className="px-3 py-4 text-xs text-muted-foreground">No ingest history yet</div>
                    ) : (
                      <div className="divide-y">
                        {(logs[col._id] || []).map(log => (
                          <div key={log._id} className="px-3 py-2 text-xs flex items-center gap-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusClass(log.status)}`}>{log.status}</span>
                            <span>{new Date(log.createdAt).toLocaleString()}</span>
                            <span>{log.ingested || 0}/{log.requestedRecords || 0} ingested</span>
                            <span>{log.skipped || 0} skipped</span>
                            <span>{formatDuration(log.durationMs)}</span>
                            <span className="text-muted-foreground ml-auto">{log.apiKeyName || log.authType || '-'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Ingest API Docs */}
        <div className="border rounded-lg overflow-hidden mt-5">
          <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Ingest API</p></div>
          <div className="p-4 space-y-3">
            <div><p className="text-[11px] text-muted-foreground mb-1">Endpoint</p><code className="block text-xs bg-muted px-3 py-2 rounded">POST /api/ingest</code></div>
            <div><p className="text-[11px] text-muted-foreground mb-1">Auth (any one)</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`x-internal-key: YOUR_INTERNAL_KEY\nx-api-key: YOUR_API_KEY\nAuthorization: Bearer JWT_TOKEN`}</pre></div>
            <div><p className="text-[11px] text-muted-foreground mb-1">Body</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`{
  "collectionId": "collection_id_here",
  "mode": "append",
  "records": [
    {
      "id": "po_001",
      "content": "PO-001, Customer: ABC, RM5000",
      "metadata": {
        "externalUserId": "ali_123",
        "company": "ABC Sdn Bhd",
        "type": "purchase_order"
      }
    }
  ]
}`}</pre></div>
            <div><p className="text-[11px] text-muted-foreground mb-1">Success Response</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`{
  "success": true,
  "ingested": 1,
  "skipped": 0,
  "mode": "append",
  "durationMs": 1234,
  "recordCount": 25
}`}</pre></div>
            <div className="pt-1">
              <p className="text-[11px] text-muted-foreground mb-1">Notes</p>
              <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc pl-4">
                <li><code className="text-[10px]">mode</code> — <code className="text-[10px]">append</code> adds/upserts records, <code className="text-[10px]">replace</code> clears this collection first</li>
                <li><code className="text-[10px]">id</code> — optional stable record id; same id will update the same vector</li>
                <li><code className="text-[10px]">content</code> — text to embed (or auto-generated from record fields)</li>
                <li><code className="text-[10px]">metadata</code> — optional, stored in Qdrant payload for filtering</li>
                <li><code className="text-[10px]">externalUserId</code> — restricts access to this external user only</li>
                <li>Records without <code className="text-[10px]">externalUserId</code> are accessible to all users in assigned orgs</li>
                <li>Maximum 1000 records per request; empty records are skipped and counted</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
            <div className="bg-background border rounded-xl p-5 w-[480px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">{editing ? 'Edit Collection' : 'Create Collection'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-[11px] text-muted-foreground">Name</label>
                  <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="e.g. Diagnosis Data" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Description</label>
                  <input value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Optional description" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-2 block">Assign to Organizations</label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {organizations.map(org => (
                      <label key={org._id} className="flex items-center gap-2 cursor-pointer text-xs">
                        <input type="checkbox" checked={formData.organizationIds.includes(org._id)} onChange={() => toggleOrg(org._id)} className="rounded" />
                        {org.name}
                      </label>
                    ))}
                    {organizations.length === 0 && <p className="text-[11px] text-muted-foreground">No organizations found</p>}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] text-muted-foreground">Metadata Schema</label>
                    <button type="button" onClick={addMetadataField} className="text-[11px] text-muted-foreground hover:text-foreground">Add field</button>
                  </div>
                  <div className="space-y-2">
                    {formData.metadataSchema.map((field, index) => (
                      <div key={index} className="grid grid-cols-[1fr_110px_auto] gap-2 items-center">
                        <input value={field.key} onChange={e => updateMetadataField(index, { key: e.target.value })} placeholder="field_name"
                          className="h-8 px-2 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                        <select value={field.type} onChange={e => updateMetadataField(index, { type: e.target.value })}
                          className="h-8 px-2 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="date">date</option>
                          <option value="boolean">boolean</option>
                        </select>
                        <button type="button" onClick={() => removeMetadataField(index)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        <label className="col-span-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1.5"><input type="checkbox" checked={field.required} onChange={e => updateMetadataField(index, { required: e.target.checked })} /> Required</span>
                          <span className="flex items-center gap-1.5"><input type="checkbox" checked={field.filterable} onChange={e => updateMetadataField(index, { filterable: e.target.checked })} /> Filterable</span>
                        </label>
                      </div>
                    ))}
                    {formData.metadataSchema.length === 0 && <p className="text-[11px] text-muted-foreground">Optional. Add fields like company, type, date, status.</p>}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" size="sm" className="text-xs h-8 flex-1">{editing ? 'Update' : 'Create'}</Button>
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
