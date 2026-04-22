import { useState, useEffect } from "react";
import { RefreshCw, ChevronRight, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VectorPoint { id: string; payload: { file_name?: string; page_number?: number; chunk_index?: number; content?: string; shared_with?: string[]; file_id?: string; is_public?: boolean }; }

export const VectorBrowserPage = () => {
  const [points, setPoints] = useState<VectorPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextOffset, setNextOffset] = useState<string | null>(null);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<VectorPoint | null>(null);
  const [search, setSearch] = useState("");

  const load = async (offset?: string | null) => {
    setLoading(true);
    try {
      const url = offset ? `/api/qdrant-browse?offset=${offset}&limit=100` : '/api/qdrant-browse?limit=100';
      const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const data = await res.json();
      if (offset) setPoints(prev => [...prev, ...(data.points || [])]);
      else setPoints(data.points || []);
      setNextOffset(data.nextOffset);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Group by file
  const grouped = points.reduce<Record<string, VectorPoint[]>>((acc, p) => {
    const name = p.payload?.file_name || 'Unknown';
    if (!acc[name]) acc[name] = [];
    acc[name].push(p);
    return acc;
  }, {});

  const filteredFiles = Object.keys(grouped).filter(f => !search || f.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">System</p>
            <h1 className="text-xl font-semibold">Vector Browser</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Browse vectors stored in Qdrant. {points.length} vectors loaded.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setPoints([]); setExpandedFile(null); load(); }} disabled={loading} className="text-xs h-8">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Reload
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by file name..."
            className="w-full h-9 pl-9 pr-3 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {/* File list */}
        <div className="border rounded-lg overflow-hidden">
          {filteredFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{loading ? 'Loading...' : 'No vectors found'}</p>
          ) : (
            <div className="divide-y">
              {filteredFiles.sort().map(fileName => {
                const filePoints = grouped[fileName].sort((a, b) => (a.payload?.page_number || 0) - (b.payload?.page_number || 0) || (a.payload?.chunk_index || 0) - (b.payload?.chunk_index || 0));
                const isExpanded = expandedFile === fileName;
                return (
                  <div key={fileName}>
                    <div className="px-4 py-3 hover:bg-muted/30 cursor-pointer flex items-center justify-between"
                      onClick={() => setExpandedFile(isExpanded ? null : fileName)}>
                      <div>
                        <p className="text-sm font-medium">{fileName}</p>
                        <p className="text-[10px] text-muted-foreground">{filePoints.length} vectors · Pages {[...new Set(filePoints.map(p => p.payload?.page_number))].sort((a,b) => (a||0)-(b||0)).join(', ')}</p>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>

                    {isExpanded && (
                      <div className="bg-muted/20 divide-y border-t">
                        {filePoints.map(p => (
                          <div key={p.id} className="px-6 py-2 hover:bg-muted/40 cursor-pointer flex items-center justify-between"
                            onClick={() => setSelectedPoint(p)}>
                            <div>
                              <p className="text-xs">Page {p.payload?.page_number || '?'} · Chunk {p.payload?.chunk_index ?? '?'}</p>
                              <p className="text-[10px] text-muted-foreground truncate max-w-[500px]">{p.payload?.content?.slice(0, 100)}...</p>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {nextOffset && (
          <div className="mt-3 text-center">
            <button onClick={() => load(nextOffset)} disabled={loading} className="text-xs text-blue-500 hover:underline">
              {loading ? 'Loading...' : 'Load more vectors'}
            </button>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedPoint && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setSelectedPoint(null)}>
          <div className="bg-background border rounded-xl p-5 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Vector Point Detail</p>
              <button onClick={() => setSelectedPoint(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 text-xs">
              <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{selectedPoint.id}</span></div>
              <div><span className="text-muted-foreground">File:</span> {selectedPoint.payload?.file_name}</div>
              <div><span className="text-muted-foreground">Page:</span> {selectedPoint.payload?.page_number}</div>
              <div><span className="text-muted-foreground">Chunk:</span> {selectedPoint.payload?.chunk_index}</div>
              {selectedPoint.payload?.shared_with && (
                <div><span className="text-muted-foreground">Shared with:</span> {JSON.stringify(selectedPoint.payload.shared_with)}</div>
              )}
              {selectedPoint.payload?.is_public !== undefined && (
                <div><span className="text-muted-foreground">Public:</span> {selectedPoint.payload.is_public ? 'Yes' : 'No'}</div>
              )}
              <div className="pt-2">
                <p className="text-muted-foreground mb-1">Content:</p>
                <pre className="bg-muted rounded-lg p-3 text-[11px] whitespace-pre-wrap max-h-[400px] overflow-y-auto">{selectedPoint.payload?.content || 'No content'}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
