import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Download, Trash2, Search, HardDrive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
}

interface PullProgress {
  status: string;
  total?: number;
  completed?: number;
}

export const OllamaModelsPage = () => {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [pullName, setPullName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState<PullProgress | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { loadModels(); }, []);

  const loadModels = async () => { try { setModels(await api.getOllamaModels()); } catch {} };

  const totalSize = models.reduce((s, m) => s + m.size, 0);

  const handlePull = async () => {
    if (!pullName.trim() || pulling) return;
    setPulling(true);
    setProgress({ status: "starting..." });

    try {
      const token = localStorage.getItem("token");
      abortRef.current = new AbortController();
      const res = await fetch("/api/ollama-pull", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: pullName.trim() }),
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) { toast.error(data.error); setPulling(false); setProgress(null); return; }
            if (data.status === "done") { toast.success(`${pullName} pulled successfully`); setPullName(""); await loadModels(); setPulling(false); setProgress(null); return; }
            setProgress(data);
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message);
    }
    setPulling(false);
    setProgress(null);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete model "${name}"?`)) return;
    try { await api.deleteOllamaModel(name); await loadModels(); toast.success(`${name} deleted`); }
    catch (e: any) { toast.error(e.message); }
  };

  const progressPercent = progress?.total && progress?.completed ? Math.round((progress.completed / progress.total) * 100) : 0;

  const filtered = models.filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Local AI</p>
            <h1 className="text-xl font-semibold">Ollama Models</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage models in the local Ollama container.</p>
          </div>
          <Button size="sm" variant="outline" onClick={loadModels} className="text-xs h-8">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Models Installed</p>
            <p className="text-2xl font-semibold mt-0.5">{models.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Size</p>
            <p className="text-2xl font-semibold mt-0.5">{(totalSize / 1e9).toFixed(1)} GB</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Container</p>
            <p className="text-2xl font-semibold mt-0.5 text-green-500">Online</p>
          </div>
        </div>

        {/* Pull Model */}
        <div className="border rounded-lg overflow-hidden mb-5">
          <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Pull New Model</p></div>
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <input value={pullName} onChange={(e) => setPullName(e.target.value)} placeholder="e.g. llama3.2, mistral, nomic-embed-text"
                onKeyDown={(e) => e.key === "Enter" && handlePull()} disabled={pulling}
                className="flex-1 h-9 px-3 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              <Button size="sm" onClick={handlePull} disabled={pulling || !pullName.trim()} className="text-xs h-9">
                <Download className="w-3.5 h-3.5 mr-1.5" />{pulling ? "Pulling..." : "Pull"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Browse models at <a href="https://ollama.com/search" target="_blank" rel="noopener" className="underline">ollama.com/search</a></p>

            {/* Progress bar */}
            {pulling && progress && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{progress.status}</span>
                  {progress.total ? <span>{progressPercent}%</span> : null}
                </div>
                {progress.total ? (
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-foreground/60 h-2 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                  </div>
                ) : (
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-foreground/60 h-2 rounded-full w-1/3 animate-pulse" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search models..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {/* Models table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Model</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Size</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Modified</th>
                <th className="px-4 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">No models found</td></tr>
              ) : filtered.map((m) => (
                <tr key={m.digest} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <HardDrive className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{m.digest?.slice(0, 12)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{(m.size / 1e9).toFixed(1)} GB</td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(m.modified_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => handleDelete(m.name)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
