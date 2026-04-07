import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Upload, Trash2, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export const FormsPage = () => {
  const [forms, setForms] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const userRole = localStorage.getItem('userRole') || 'user';
  const userId = localStorage.getItem('userId') || '';
  const isDeveloper = userRole.toLowerCase() === 'developer';

  useEffect(() => { loadForms(); loadOrganizations(); }, []);

  const loadForms = async () => { try { setForms(await api.getForms()); } catch (e) { console.error(e); } };
  const loadOrganizations = async () => {
    try {
      const data = isDeveloper ? await api.getAllOrganizations() : await api.getMyOrganizationsHierarchy();
      setOrganizations(Array.isArray(data.organizations || data) ? (data.organizations || data) : []);
    } catch (e) { console.error(e); }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try { await api.uploadForm(file, selectedOrgs); await loadForms(); setSelectedOrgs([]); setShowUploadModal(false); toast.success("Form uploaded"); }
    catch (error: any) { toast.error(error.message); }
    finally { setIsUploading(false); if (e.target) e.target.value = ''; }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this form?")) return;
    try { await api.deleteFile(id); await loadForms(); toast.success("Form deleted"); }
    catch (error: any) { toast.error(error.message); }
  };

  const getTypeLabel = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = { pdf: 'PDF', doc: 'Word', docx: 'Word' };
    return map[ext] || ext.toUpperCase();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Document Center</p>
            <h1 className="text-xl font-semibold">Forms</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Upload and manage downloadable forms.</p>
          </div>
          <Button size="sm" onClick={() => setShowUploadModal(true)} className="text-xs h-8 rounded-lg">
            <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload Form
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Forms</p>
            <p className="text-2xl font-semibold mt-0.5">{forms.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">PDF Forms</p>
            <p className="text-2xl font-semibold mt-0.5">{forms.filter(f => f.name.toLowerCase().endsWith('.pdf')).length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Word Forms</p>
            <p className="text-2xl font-semibold mt-0.5">{forms.filter(f => f.name.toLowerCase().endsWith('.doc') || f.name.toLowerCase().endsWith('.docx')).length}</p>
          </div>
        </div>

        {/* Forms Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Uploaded By</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Shared With</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {forms.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No forms uploaded yet</td></tr>
              ) : forms.map((form) => (
                <tr key={form._id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[13px]">{form.name}</p>
                        <p className="text-[11px] text-muted-foreground">{getTypeLabel(form.name)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{form.uploadedBy}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {form.sharedWith?.length > 0 ? form.sharedWith.map((org: string) => (
                        <span key={org} className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{org}</span>
                      )) : <span className="text-[11px] text-muted-foreground">All</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(form.uploadedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    {(isDeveloper || form.userId === userId) && (
                      <button onClick={() => handleDelete(form._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !isUploading && setShowUploadModal(false)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-md mx-4 border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Upload Form</h2>
              <button onClick={() => !isUploading && setShowUploadModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <p className="text-xs font-medium mb-2">Share with Organizations</p>
            <div className="border rounded-lg p-3 mb-4 max-h-40 overflow-y-auto space-y-1">
              {organizations.map((org) => (
                <label key={org._id} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted cursor-pointer">
                  <input type="checkbox" checked={selectedOrgs.includes(org._id)}
                    onChange={(e) => setSelectedOrgs(e.target.checked ? [...selectedOrgs, org._id] : selectedOrgs.filter(id => id !== org._id))}
                    className="w-3.5 h-3.5 rounded" />
                  {org.name} <span className="text-[10px] text-muted-foreground">({org.type})</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mb-4">Leave empty for no restrictions.</p>

            <input type="file" id="form-upload" className="hidden" onChange={handleFileSelect} disabled={isUploading} accept=".pdf,.doc,.docx" />
            <Button size="sm" disabled={isUploading} onClick={() => document.getElementById('form-upload')?.click()} className="w-full text-xs h-9 rounded-lg">
              {isUploading ? "Uploading..." : "Choose File & Upload"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
