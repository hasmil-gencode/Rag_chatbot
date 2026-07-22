import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useConfirm } from "./ConfirmDialog";
import { StickyNote, Plus, Pencil, Trash2, X, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export const TextNotesPage = () => {
  const [notes, setNotes] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [orgPublicEnabled, setOrgPublicEnabled] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState("");
  const [loadingNote, setLoadingNote] = useState(false);
  const confirm = useConfirm();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const files = await api.getFiles(null);
      setNotes((files as any[]).filter((f) => f.isTextNote));
    } catch (e) { console.error(e); }
    try {
      const d = await api.getAllOrganizations();
      const orgList = d.organizations || [];
      setOrganizations(orgList);
      setOrgPublicEnabled(orgList.some((o: any) => o.type === "organization" && o.publicEnabled));
    } catch (e) { console.error(e); }
  };

  const normalizeId = (v: any) => v?._id?.toString?.() || v?.toString?.() || v || "";
  const toggleOrg = (id: string) =>
    setSelectedOrgs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const reset = () => {
    setShowModal(false);
    setEditingId(null);
    setTitle("");
    setContent("");
    setStep("");
    setSaving(false);
    setLoadingNote(false);
    setSelectedOrgs([]);
    setIsPublic(false);
  };

  const openCreate = () => { reset(); setShowModal(true); };

  const openEdit = async (id: string) => {
    reset();
    setEditingId(id);
    setShowModal(true);
    setLoadingNote(true);
    try {
      const note = await api.getTextNote(id);
      setTitle(note.title || "");
      setContent(note.content || "");
    } catch (e: any) {
      toast.error(e.message || "Failed to load note");
      reset();
    } finally {
      setLoadingNote(false);
    }
  };

  const save = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    if (!content.trim()) { toast.error("Content required"); return; }
    setSaving(true);
    setStep("Saving...");
    const onProgress = (_s: string, d: string) => setStep(d);
    try {
      if (editingId) {
        await api.updateTextNote(editingId, title, content, onProgress);
        toast.success("Text note updated");
      } else {
        await api.uploadText(title, content, selectedOrgs, onProgress, isPublic);
        toast.success("Text note created");
      }
      await load();
      reset();
    } catch (e: any) {
      toast.error(e.message || "Failed to save text note");
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this text note?"))) return;
    try {
      await api.deleteFile(id);
      await load();
      toast.success("Text note deleted");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Knowledge Base</p>
            <h1 className="text-xl font-semibold">Text Notes</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Type knowledge directly into the RAG. Include links to open them in split-screen.</p>
          </div>
          <Button size="sm" onClick={openCreate} className="text-xs h-8 rounded-lg">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Text
          </Button>
        </div>

        {/* Notes table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Title</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Shared With</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Updated</th>
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {notes.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">No text notes yet. Click "Add Text" to create one.</td></tr>
              ) : notes.map((note) => (
                <tr key={note.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <StickyNote className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <p className="truncate font-medium text-[13px]">{(note.name || "").replace(/\.md$/, "")}</p>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {note.sharedWith?.length > 0 ? note.sharedWith.map((org: string) => (
                        <span key={org} className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{org}</span>
                      )) : <span className="text-[11px] text-muted-foreground">All</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(note.uploadedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(note.id)} title="Edit" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remove(note.id)} title="Delete" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !saving && reset()}>
          <div className="bg-background rounded-xl p-5 w-full max-w-lg mx-4 border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">{editingId ? "Edit Text Note" : "Add Text Note"}</h2>
              <button onClick={() => !saving && reset()} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            {loadingNote ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Loading...</p>
            ) : (
              <>
                <p className="text-xs font-medium mb-1">Title</p>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. How to book a service"
                  disabled={saving}
                  className="w-full h-9 px-3 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring mb-3"
                />

                <p className="text-xs font-medium mb-1">Content</p>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={"Write the knowledge here. Include links so they open in split-screen, e.g.\n[Book a service](https://example.com/booking)"}
                  disabled={saving}
                  rows={8}
                  className="w-full px-3 py-2 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring mb-1 resize-y font-mono"
                />
                <p className="text-[10px] text-muted-foreground/70 mb-3">Tip: paste links as <span className="font-mono">[text](https://...)</span> or raw URLs — they become clickable and open in split-screen.</p>

                {!editingId && (
                  <>
                    <p className="text-xs font-medium mb-2">Share with</p>
                    <div className="border rounded-lg p-3 mb-3 space-y-1 max-h-48 overflow-y-auto">
                      {organizations.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground py-2 text-center">No organizations. Note will be private (developer only).</p>
                      ) : organizations.map((org) => {
                        const id = normalizeId(org._id);
                        const sel = selectedOrgs.includes(id);
                        return (
                          <button key={id} onClick={() => toggleOrg(id)} className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${sel ? "bg-foreground text-background" : "hover:bg-muted"}`}>
                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${sel ? "bg-foreground border-foreground" : "border-muted-foreground/40"}`}>
                              {sel && <span className="text-background text-[10px]">✓</span>}
                            </span>
                            <span className="font-medium">{org.name}</span>
                            <span className="text-[10px] opacity-60">{org.type}</span>
                          </button>
                        );
                      })}
                    </div>
                    {orgPublicEnabled && (
                      <label className="flex items-center gap-2 py-2 cursor-pointer">
                        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="rounded" />
                        <span className="text-xs flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />Make available for public widget</span>
                      </label>
                    )}
                  </>
                )}

                <Button disabled={saving} onClick={save} className="w-full text-xs h-9 rounded-lg mt-2">
                  {saving ? "Processing..." : editingId ? "Save & Re-embed" : "Create & Embed"}
                </Button>
                {saving && step && (
                  <p className="text-[11px] text-muted-foreground text-center mt-2 animate-pulse">{step}</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
