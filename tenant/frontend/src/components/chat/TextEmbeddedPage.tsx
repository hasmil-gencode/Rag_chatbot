import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useConfirm } from "./ConfirmDialog";
import { Loader2, Send, Trash2, FileText } from "lucide-react";

export const TextEmbeddedPage = () => {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [embeddings, setEmbeddings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const confirm = useConfirm();

  useEffect(() => { loadEmbeddings(); }, []);

  const loadEmbeddings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/text-embeddings", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setEmbeddings(Array.isArray(data) ? data : []);
    } catch (e) { toast.error("Failed to load"); setEmbeddings([]); }
    finally { setIsLoading(false); }
  };

  const handleSubmit = async () => {
    if (!text.trim()) { toast.error("Please enter text"); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/text-embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ text: text.trim(), fileName: fileName.trim() || "Custom Knowledge" })
      });
      if (res.ok) { toast.success("Text embedded!"); setText(""); setFileName(""); loadEmbeddings(); }
      else { const r = await res.json(); toast.error(r.error || "Failed"); }
    } catch (e) { toast.error("Failed"); }
    finally { setIsSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm("Delete this embedding?")) return;
    try {
      const res = await fetch(`/api/text-embeddings/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      if (res.ok) { toast.success("Deleted"); loadEmbeddings(); } else toast.error("Failed");
    } catch (e) { toast.error("Failed"); }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Knowledge Base</p>
          <h1 className="text-xl font-semibold">Text Embedded</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Add knowledge directly to the vector store without uploading files.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Embeddings</p>
            <p className="text-2xl font-semibold mt-0.5">{embeddings.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Characters</p>
            <p className="text-2xl font-semibold mt-0.5">{embeddings.reduce((sum, e) => sum + (e.text?.length || 0), 0).toLocaleString()}</p>
          </div>
        </div>

        {/* Input Form */}
        <div className="border rounded-lg overflow-hidden mb-5">
          <div className="px-4 py-2.5 border-b">
            <p className="text-xs font-medium">Add New Knowledge</p>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="text-[11px] text-muted-foreground">Display Name</label>
              <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="e.g., Service Booking Knowledge"
                className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Knowledge Text</label>
              <textarea value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Enter your knowledge text here...&#10;&#10;Example:&#10;Q: How to book service?&#10;A: Click [here](/form/booking-service) to book."
                className="w-full h-48 px-3 py-2 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
              <p className="text-[10px] text-muted-foreground mt-1">Tip: Use markdown links like [click here](/form/booking-service)</p>
            </div>
            <Button size="sm" onClick={handleSubmit} disabled={isSubmitting || !text.trim()} className="text-xs h-8">
              {isSubmitting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Embedding...</> : <><Send className="w-3.5 h-3.5 mr-1.5" /> Embed Text</>}
            </Button>
          </div>
        </div>

        {/* Existing Embeddings */}
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b">
            <p className="text-xs font-medium">Existing Text Embeddings</p>
          </div>
          {isLoading ? (
            <div className="px-4 py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
          ) : embeddings.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No text embeddings yet</div>
          ) : (
            <div className="divide-y">
              {embeddings.map((item) => (
                <div key={item._id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium">{item.fileName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Added: {new Date(item.uploadedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <button onClick={() => handleDelete(item._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive ml-2">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
