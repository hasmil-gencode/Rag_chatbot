import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useConfirm } from "./ConfirmDialog";
import { Download, FileText, Trash2, Search, X, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { downloadFile } from "@/lib/fileHelper";

export const FilesPage = () => {
  const [files, setFiles] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [isPublicUpload, setIsPublicUpload] = useState(false);
  const [orgPublicEnabled, setOrgPublicEnabled] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState("");
  const [uploadPreviews, setUploadPreviews] = useState<string[]>([]);
  const [waitingForConfirm, setWaitingForConfirm] = useState(false);
  const confirmResolveRef = useRef<(() => void) | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ used: number; limit: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const confirm = useConfirm();
  const userRole = localStorage.getItem('userRole') || 'user';
  const userId = localStorage.getItem('userId') || '';
  const isDeveloper = userRole.toLowerCase() === 'developer';

  useEffect(() => { loadFiles(); loadOrganizations(); loadStorageInfo(); }, []);

  const loadFiles = async () => { try { setFiles(await api.getFiles(null)); } catch (e) { console.error(e); } };
  const loadOrganizations = async () => { try { const d = isDeveloper ? await api.getAllOrganizations() : await api.getMyOrganizationsHierarchy(); const orgList = d.organizations || []; setOrganizations(orgList); setOrgPublicEnabled(orgList.some((o: any) => o.type === 'organization' && o.publicEnabled)); } catch (e) { console.error(e); } };
  const loadStorageInfo = async () => { try { setStorageInfo(await api.getStorageInfo()); } catch (e) { console.error(e); } };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadPreviews([]);
    const total = files.length;
    for (let i = 0; i < total; i++) {
      const file = files[i];
      setUploadStep(`Uploading ${i + 1}/${total}: ${file.name}`);
      try {
        await api.uploadFile(file, selectedOrgs, (_step, detail) => {
          if (_step === 'preview') {
            setUploadPreviews(prev => [...prev, detail]);
          } else {
            setUploadStep(`[${i + 1}/${total}] ${detail}`);
          }
        }, isPublicUpload);
      } catch (error: any) { toast.error(`Failed: ${file.name} — ${error.message}`); }
    }
    await loadFiles();
    await loadStorageInfo();
    setSelectedOrgs([]);
    setIsPublicUpload(false);
    setUploadStep(`Done — ${total} file(s) uploaded`);
    setWaitingForConfirm(true);
    await new Promise<void>(resolve => { confirmResolveRef.current = resolve; });
    setWaitingForConfirm(false);
    setShowUploadModal(false);
    setUploadStep("");
    setUploadPreviews([]);
    toast.success(`${total} file(s) uploaded successfully`);
    setIsUploading(false);
    if (e.target) e.target.value = '';
  };

  const handleDelete = async (id: string) => {
    if (!await confirm("Delete this file?")) return;
    try { await api.deleteFile(id); await loadFiles(); await loadStorageInfo(); toast.success("File deleted"); }
    catch (error: any) { toast.error(error.message); }
  };

  const handleDownload = async (id: string) => {
    try { const fn = await downloadFile(id); toast.success(`Downloaded: ${fn}`); }
    catch (error: any) { toast.error(error.message || "Download failed"); }
  };

  const getExt = (name: string) => name.split('.').pop()?.toLowerCase() || '';
  const getTypeLabel = (name: string) => {
    const ext = getExt(name);
    const map: Record<string, string> = { pdf: 'PDF', doc: 'Word', docx: 'Word', xls: 'Excel', xlsx: 'Excel', ppt: 'PPT', pptx: 'PPT', txt: 'Text', md: 'Markdown', csv: 'CSV', png: 'Image', jpg: 'Image', jpeg: 'Image' };
    return map[ext] || ext.toUpperCase();
  };

  // Build org tree hierarchy
  const getChildren = (parentId: string) => organizations.filter(o => o.parentId === parentId);
  const getAllDescendantIds = (orgId: string): string[] => {
    const children = getChildren(orgId);
    return children.flatMap(c => [c._id, ...getAllDescendantIds(c._id)]);
  };
  const getParentId = (orgId: string) => organizations.find(o => o._id === orgId)?.parentId;

  const toggleOrg = (orgId: string) => {
    const org = organizations.find(o => o._id === orgId);
    if (!org) return;
    let next = [...selectedOrgs];

    if (next.includes(orgId)) {
      // Deselect: remove this + all descendants
      const toRemove = new Set([orgId, ...getAllDescendantIds(orgId)]);
      next = next.filter(id => !toRemove.has(id));
      // Also remove parent if it was selected (since not all children selected anymore)
      let pid = getParentId(orgId);
      while (pid) {
        next = next.filter(id => id !== pid);
        pid = getParentId(pid!);
      }
    } else {
      // Select: add this + all descendants
      next = [...new Set([...next, orgId, ...getAllDescendantIds(orgId)])];
      // Auto-select parent if all siblings now selected
      let pid = getParentId(orgId);
      while (pid) {
        const sibs = getChildren(pid);
        if (sibs.every(s => next.includes(s._id))) {
          next = [...new Set([...next, pid])];
        } else break;
        pid = getParentId(pid);
      }
    }
    setSelectedOrgs(next);
  };

  // Org tree for rendering
  const rootOrgs = organizations.filter(o => !o.parentId);
  const allTypes = [...new Set(files.map(f => getTypeLabel(f.name)))];

  const filtered = files.filter(f => {
    if (searchQuery && !f.name.toLowerCase().includes(searchQuery.toLowerCase()) && !f.uploadedBy?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortBy === 'uploader') cmp = (a.uploadedBy || '').localeCompare(b.uploadedBy || '');
    else if (sortBy === 'date') cmp = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };
  const sortIcon = (col: string) => sortBy === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  const totalSizeBytes = storageInfo?.used || 0;
  const totalSizeDisplay = totalSizeBytes >= 1024 * 1024 
    ? `${(totalSizeBytes / 1024 / 1024).toFixed(1)} MB` 
    : `${(totalSizeBytes / 1024).toFixed(1)} KB`;
  const usedGB = (totalSizeBytes / 1024 / 1024 / 1024).toFixed(2);
  const limitGB = storageInfo?.limit || 0;
  const usedPercent = limitGB > 0 ? Math.min((totalSizeBytes / (limitGB * 1024 * 1024 * 1024)) * 100, 100) : 0;
  const recentCount = files.filter(f => {
    const d = new Date(f.uploadedAt);
    const now = new Date();
    return (now.getTime() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Document Center</p>
            <h1 className="text-xl font-semibold">Files</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage uploads, permissions, and team access.</p>
          </div>
          <Button size="sm" onClick={() => setShowUploadModal(true)} className="text-xs h-8 rounded-lg">
            + Upload File
          </Button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Files</p>
            <p className="text-2xl font-semibold mt-0.5">{files.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Uploaded This Week</p>
            <p className="text-2xl font-semibold mt-0.5">{recentCount}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">File Types</p>
            <p className="text-2xl font-semibold mt-0.5">{allTypes.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Storage Used</p>
            <p className="text-2xl font-semibold mt-0.5">{totalSizeDisplay}</p>
            {limitGB > 0 && (
              <>
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className="bg-foreground/50 h-1.5 rounded-full transition-all" style={{ width: `${Math.max(usedPercent, 0.5)}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{usedGB} GB of {limitGB} GB ({usedPercent.toFixed(2)}%)</p>
              </>
            )}
          </div>
        </div>

        {/* Search only */}
        <div className="relative mb-5">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search by file name or uploader..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {/* File table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b">
                <th onClick={() => toggleSort('name')} className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none">Name{sortIcon('name')}</th>
                <th onClick={() => toggleSort('uploader')} className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none">Uploaded By{sortIcon('uploader')}</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Shared With</th>
                <th onClick={() => toggleSort('date')} className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none">Date{sortIcon('date')}</th>
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No files found</td></tr>
              ) : filtered.map((file) => (
                <tr key={file.id} className="border-t hover:bg-muted/30 transition-colors group">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[13px]">{file.name}</p>
                        <p className="text-[11px] text-muted-foreground">{getTypeLabel(file.name)}{file.size ? ` · ${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{file.uploadedBy}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {file.sharedWith?.length > 0 ? file.sharedWith.map((org: string) => (
                        <span key={org} className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{org}</span>
                      )) : <span className="text-[11px] text-muted-foreground">All</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(file.uploadedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => handleDownload(file.id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Download className="w-4 h-4" /></button>
                      {(file.userId === userId || isDeveloper) && (
                        <button onClick={() => handleDelete(file.id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
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
              <h2 className="text-sm font-semibold">Upload File</h2>
              <button onClick={() => !isUploading && setShowUploadModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <p className="text-xs font-medium mb-2">Share with</p>
            <div className="border rounded-lg p-3 mb-4 space-y-1">
              {rootOrgs.length === 0 && isDeveloper && (
                <p className="text-[11px] text-muted-foreground py-2 text-center">No organizations. File will be private (developer only).</p>
              )}
              {rootOrgs.length === 0 && !isDeveloper && (
                <p className="text-[11px] text-muted-foreground py-2 text-center">No organizations available.</p>
              )}
              {rootOrgs.map(root => {
                const children = getChildren(root._id);
                const isSelected = selectedOrgs.includes(root._id);
                return (
                  <div key={root._id}>
                    <button onClick={() => toggleOrg(root._id)} className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${isSelected ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-foreground border-foreground' : 'border-muted-foreground/40'}`}>
                        {isSelected && <span className="text-background text-[10px]">✓</span>}
                      </span>
                      <span className="font-medium">{root.name}</span>
                      <span className="text-[10px] opacity-60">{root.type}</span>
                    </button>
                    {children.length > 0 && (
                      <div className="ml-5 mt-0.5 space-y-0.5">
                        {children.map(child => {
                          const childSelected = selectedOrgs.includes(child._id);
                          const subChildren = getChildren(child._id);
                          return (
                            <div key={child._id}>
                              <button onClick={() => toggleOrg(child._id)} className={`flex items-center gap-2 w-full text-left px-2 py-1 rounded-md text-xs transition-colors ${childSelected ? 'bg-foreground/10' : 'hover:bg-muted'}`}>
                                <span className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${childSelected ? 'bg-foreground border-foreground' : 'border-muted-foreground/40'}`}>
                                  {childSelected && <span className="text-background text-[9px]">✓</span>}
                                </span>
                                {child.name}
                                <span className="text-[10px] opacity-60">{child.type}</span>
                              </button>
                              {subChildren.length > 0 && (
                                <div className="ml-5 mt-0.5 space-y-0.5">
                                  {subChildren.map(sub => {
                                    const subSel = selectedOrgs.includes(sub._id);
                                    return (
                                      <button key={sub._id} onClick={() => toggleOrg(sub._id)} className={`flex items-center gap-2 w-full text-left px-2 py-1 rounded-md text-xs transition-colors ${subSel ? 'bg-foreground/10' : 'hover:bg-muted'}`}>
                                        <span className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${subSel ? 'bg-foreground border-foreground' : 'border-muted-foreground/40'}`}>
                                          {subSel && <span className="text-background text-[9px]">✓</span>}
                                        </span>
                                        {sub.name}
                                        <span className="text-[10px] opacity-60">{sub.type}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {storageInfo && storageInfo.limit > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                  <span>Storage</span>
                  <span>{(storageInfo.used / 1024 / 1024).toFixed(1)} MB / {storageInfo.limit} GB</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div className="bg-foreground/50 h-1.5 rounded-full" style={{ width: `${Math.min((storageInfo.used / (storageInfo.limit * 1024 * 1024 * 1024)) * 100, 100)}%` }} />
                </div>
              </div>
            )}

            {orgPublicEnabled && (
              <label className="flex items-center gap-2 py-2 cursor-pointer">
                <input type="checkbox" checked={isPublicUpload} onChange={e => setIsPublicUpload(e.target.checked)} className="rounded" />
                <span className="text-xs flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />Make available for public widget</span>
              </label>
            )}

            <input type="file" id="file-upload-modal" className="hidden" onChange={handleFileSelect} disabled={isUploading} multiple accept=".pdf,.txt,.csv,.json,.docx,.html,.md,.xlsx,.xls,.png,.jpg,.jpeg,.tiff,.bmp,.webp,.pptx,.ppt" />
            <div className="relative group">
              <Button disabled={isUploading || (!isDeveloper && selectedOrgs.length === 0)} onClick={() => document.getElementById('file-upload-modal')?.click()} className="w-full text-xs h-9 rounded-lg">
                {isUploading ? "Processing..." : "Choose File & Upload"}
              </Button>
              {isUploading && uploadStep && (
                <p className={`text-[11px] text-muted-foreground text-center mt-2 ${!waitingForConfirm ? 'animate-pulse' : ''}`}>{uploadStep}</p>
              )}
              {uploadPreviews.length > 0 && (
                <div className="mt-2 border rounded-lg max-h-72 overflow-y-auto p-2 bg-muted/30">
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Extracted Text Preview:</p>
                  {uploadPreviews.map((text, i) => (
                    <pre key={i} className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all font-mono mb-2">{text}</pre>
                  ))}
                </div>
              )}
              {waitingForConfirm && (
                <Button size="sm" onClick={() => { if (confirmResolveRef.current) confirmResolveRef.current(); }} className="w-full text-xs h-9 rounded-lg mt-2">
                  Done
                </Button>
              )}
              {!isDeveloper && selectedOrgs.length === 0 && !isUploading && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-foreground text-background text-[11px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  Please choose share with first
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/60 text-center mt-2">Supported: PDF, DOCX, PPTX, PPT, XLSX, XLS, TXT, CSV, JSON, HTML, MD, PNG, JPG, JPEG, TIFF, BMP, WEBP</p>
          </div>
        </div>
      )}
    </div>
  );
};
