import { useState, useEffect } from "react";
import { RefreshCw, Search, ChevronRight, ChevronLeft, X, Database, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Collection { name: string; count: number; }

export const MongoBrowserPage = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const loadCollections = async () => {
    try { const res = await fetch('/api/mongo-browse', { headers }); setCollections(await res.json()); } catch {}
  };

  const loadDocs = async (col: string, p = 1, q = "") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mongo-browse/${col}?page=${p}&limit=20&search=${encodeURIComponent(q)}`, { headers });
      const data = await res.json();
      setDocs(data.docs || []); setTotal(data.total); setPage(data.page); setPages(data.pages);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadCollections(); }, []);

  const selectCollection = (name: string) => {
    setSelected(name); setSearch(""); setPage(1); loadDocs(name, 1, "");
  };

  const handleSearch = () => { if (selected) loadDocs(selected, 1, search); };

  const truncate = (val: any, max = 80): string => {
    if (val === null || val === undefined) return 'null';
    const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return s.length > max ? s.slice(0, max) + '...' : s;
  };

  // Get display columns from first few docs (exclude large fields)
  const getColumns = (): string[] => {
    if (docs.length === 0) return [];
    const skip = new Set(['password', 'activeSessionToken', '__v']);
    const allKeys = new Set<string>();
    docs.slice(0, 5).forEach(d => Object.keys(d).forEach(k => { if (!skip.has(k)) allKeys.add(k); }));
    const priority = ['_id', 'email', 'name', 'fullName', 'role', 'status', 'content', 'originalName', 'file_name', 'createdAt'];
    const sorted = [...allKeys].sort((a, b) => {
      const ai = priority.indexOf(a), bi = priority.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
    return sorted.slice(0, 6);
  };

  const columns = getColumns();

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">System</p>
            <h1 className="text-xl font-semibold">MongoDB Browser</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Browse collections and documents.</p>
          </div>
          <Button size="sm" variant="outline" onClick={loadCollections} className="text-xs h-8">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        <div className="flex gap-4">
          {/* Collections sidebar */}
          <div className="w-52 flex-shrink-0 border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b"><p className="text-[11px] font-medium text-muted-foreground">Collections</p></div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {collections.map(c => (
                <div key={c.name} onClick={() => selectCollection(c.name)}
                  className={`px-3 py-2 cursor-pointer hover:bg-muted/40 flex items-center justify-between ${selected === c.name ? 'bg-muted' : ''}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Database className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs truncate">{c.name}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{c.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          <div className="flex-1 min-w-0">
            {!selected ? (
              <div className="border rounded-lg py-16 text-center">
                <p className="text-sm text-muted-foreground">Select a collection to browse</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Search + info */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      placeholder="Search documents..." className="w-full h-9 pl-9 pr-3 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <Button size="sm" variant="outline" onClick={handleSearch} className="text-xs h-9">Search</Button>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{total} docs</span>
                </div>

                {/* Table */}
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        {columns.map(col => (
                          <th key={col} className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                        ))}
                        <th className="px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-muted-foreground">Loading...</td></tr>
                      ) : docs.length === 0 ? (
                        <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-muted-foreground">No documents</td></tr>
                      ) : docs.map((doc, i) => (
                        <tr key={i} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedDoc(doc)}>
                          {columns.map(col => (
                            <td key={col} className="px-3 py-2 max-w-[200px] truncate font-mono text-[11px]">
                              {truncate(doc[col])}
                            </td>
                          ))}
                          <td className="px-3 py-2"><ChevronRight className="w-3 h-3 text-muted-foreground" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {pages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button disabled={page <= 1} onClick={() => loadDocs(selected, page - 1, search)}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
                    <button disabled={page >= pages} onClick={() => loadDocs(selected, page + 1, search)}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Document detail modal */}
      {selectedDoc && (
        <DocModal doc={selectedDoc} collection={selected!} onClose={() => setSelectedDoc(null)}
          onSaved={() => { setSelectedDoc(null); if (selected) loadDocs(selected, page, search); }} />
      )}
    </div>
  );
};

const DocModal = ({ doc, collection, onClose, onSaved }: { doc: any; collection: string; onClose: () => void; onSaved: () => void }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(JSON.stringify(doc, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const parsed = JSON.parse(text);
      const { _id, ...update } = parsed;
      const res = await fetch(`/api/mongo-browse/${collection}/${doc._id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(update),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onSaved();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border rounded-xl p-5 w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Document Detail</p>
          <div className="flex items-center gap-2">
            {!editing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="text-xs h-7">
                <Pencil className="w-3 h-3 mr-1" /> Edit
              </Button>
            ) : (
              <Button size="sm" onClick={handleSave} disabled={saving} className="text-xs h-7">
                <Save className="w-3 h-3 mr-1" /> {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
            <button onClick={onClose}><X className="w-4 h-4" /></button>
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        {editing ? (
          <textarea value={text} onChange={e => setText(e.target.value)}
            className="flex-1 bg-muted rounded-lg p-4 text-[11px] font-mono whitespace-pre overflow-auto resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[400px]" />
        ) : (
          <pre className="flex-1 bg-muted rounded-lg p-4 text-[11px] whitespace-pre-wrap overflow-y-auto">{JSON.stringify(doc, null, 2)}</pre>
        )}
      </div>
    </div>
  );
};
