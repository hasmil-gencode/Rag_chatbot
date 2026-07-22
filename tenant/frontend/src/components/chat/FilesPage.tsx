import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useConfirm } from "./ConfirmDialog";
import { Download, FileText, Trash2, Search, X, Globe, Table2, Cloud, Sparkles } from "lucide-react";
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
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ used: number; limit: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [convertingFile, setConvertingFile] = useState<{ id: string; name: string } | null>(null);
  const [s3Enabled, setS3Enabled] = useState(false);
  const [convertStep, setConvertStep] = useState("");
  const [convertPct, setConvertPct] = useState(0);
  const [progressTitle, setProgressTitle] = useState("Converting to Data Table");
  const confirm = useConfirm();
  const userRole = localStorage.getItem('userRole') || 'user';
  const userId = localStorage.getItem('userId') || '';
  const isDeveloper = userRole.toLowerCase() === 'developer';

  useEffect(() => { loadFiles(); loadOrganizations(); loadStorageInfo(); if (isDeveloper) { api.getS3Status().then(s => setS3Enabled(!!s.enabled)).catch(() => setS3Enabled(false)); } }, []);

  const normalizeId = (value: any) => value?._id?.toString?.() || value?.toString?.() || value || '';

  const loadFiles = async () => { try { setFiles(await api.getFiles(null)); } catch (e) { console.error(e); } };
  const loadOrganizations = async () => {
    try {
      const d = isDeveloper ? await api.getAllOrganizations() : await api.getMyOrganizationsHierarchy();
      const orgList = d.organizations || [];
      setOrganizations(orgList);
      setOrgPublicEnabled(orgList.some((o: any) => o.type === 'organization' && o.publicEnabled));
      if (!isDeveloper) {
        const assignedIds = orgList.filter((o: any) => o.isAssigned).map((o: any) => normalizeId(o._id));
        if (assignedIds.length > 0) setSelectedOrgs(assignedIds);
      }
    } catch (e) {
      console.error(e);
    }
  };
  const loadStorageInfo = async () => { try { setStorageInfo(await api.getStorageInfo()); } catch (e) { console.error(e); } };

  const resetUploadModal = () => {
    setWaitingForConfirm(false);
    setShowUploadModal(false);
    setUploadStep("");
    setUploadPreviews([]);
    setIsUploading(false);
  };

  const finishUploadModal = async () => {
    await loadFiles();
    await loadStorageInfo();
    resetUploadModal();
  };

  const getUploadOrgIds = () => {
    const selected = selectedOrgs.length > 0
      ? selectedOrgs
      : organizations.filter((org: any) => org.isAssigned).map((org: any) => normalizeId(org._id));
    const ids = new Set(selected);
    selected.forEach((orgId) => {
      let parentId = getParentId(orgId);
      while (parentId) {
        ids.add(parentId);
        parentId = getParentId(parentId);
      }
    });
    return Array.from(ids);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadPreviews([]);
    const total = files.length;
    for (let i = 0; i < total; i++) {
      const file = files[i];
      // Check duplicate
      try {
        const dup = await api.checkDuplicateFile(file.name);
        if (dup.exists && dup.existingFile) {
          const uploadedDate = new Date(dup.existingFile.uploadedAt).toLocaleDateString();
          const action = await confirm({
            title: 'File Already Exists',
            message: `"${file.name}" already exists (uploaded ${uploadedDate}). What would you like to do?`,
            confirmText: 'Replace',
            cancelText: 'Cancel',
            extraAction: { text: 'Keep Both', value: 'keep' }
          });
          if (action === false) { continue; } // Cancel — skip this file
          if (action === 'keep') {
            // Rename old file with date suffix
            await api.renameOldFile(dup.existingFile.id);
          } else {
            // Replace — delete old file first
            await api.deleteFile(dup.existingFile.id);
          }
        }
      } catch (dupErr: any) { console.error('Duplicate check failed:', dupErr.message); }

      setUploadStep(`Uploading ${i + 1}/${total}: ${file.name}`);
      try {
        await api.uploadFile(file, getUploadOrgIds(), (_step, detail) => {
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
    setWaitingForConfirm(true);
    setUploadStep(`Done — ${total} file(s) uploaded`);
    setIsUploading(false);
    toast.success(`${total} file(s) uploaded successfully`);
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

  // Tabular files not yet stored as a SQL table can be converted.
  const isConvertible = (file: any) => ['csv', 'tsv', 'xls', 'xlsx'].includes(getExt(file.name)) && !file.isTabular;

  const convertStepPct: Record<string, number> = {
    locating: 8, downloading: 18, cleaning: 30, parsing: 45, table: 62, inserting: 82, done: 100,
  };

  const handleConvert = async (file: any) => {
    if (!await confirm({
      title: 'Convert to Data Table',
      message: `Convert "${file.name}" into a SQL data table? Any existing vector data for this file will be removed, and the data will be queryable via chat.`,
      confirmText: 'Convert',
      cancelText: 'Cancel',
    })) return;
    setProgressTitle('Converting to Data Table');
    setConvertingFile({ id: file.id, name: file.name });
    setConvertStep('Starting...');
    setConvertPct(3);
    try {
      const result = await api.convertToTable(file.id, (step, detail) => {
        setConvertStep(detail);
        setConvertPct(prev => convertStepPct[step] ?? prev);
      });
      setConvertPct(100);
      toast.success(result.message || 'Converted to data table');
      await loadFiles();
    } catch (e: any) {
      // The conversion may have completed server-side even if the streaming
      // response was interrupted by a proxy. Re-check before reporting failure.
      try {
        const refreshed = await api.getFiles(null);
        const updated = refreshed.find((f: any) => f.id === file.id);
        if (updated?.isTabular) {
          toast.success('Converted to data table');
          setFiles(refreshed);
          return;
        }
      } catch { /* ignore */ }
      toast.error(e.message || 'Conversion failed');
    } finally {
      setConvertingFile(null);
      setConvertStep('');
      setConvertPct(0);
    }
  };

  const handleConvertS3 = async (file: any) => {
    if (!await confirm({
      title: 'Move to S3',
      message: `Move "${file.name}" to S3 storage? The local server copy will be deleted after upload.`,
      confirmText: 'Move to S3',
      cancelText: 'Cancel',
    })) return;
    try {
      const result = await api.convertToS3(file.id);
      toast.success(result.message || 'Moved to S3');
      await loadFiles();
    } catch (e: any) {
      toast.error(e.message || 'Failed to move to S3');
    }
  };

  const handleReembed = async (file: any) => {
    if (!await confirm({
      title: 'Re-embed Rows for Search',
      message: `Generate a semantic "card" per row of "${file.name}" and embed them so entity lookups (e.g. a specific model/name) work in chat. Existing row vectors for this file are replaced. Large tables (over 5,000 rows) are skipped.`,
      confirmText: 'Re-embed',
      cancelText: 'Cancel',
    })) return;
    const reembedPct: Record<string, number> = { cleaning: 15, embedding_rows: 65, skipping: 65, done: 100 };
    setProgressTitle('Re-embedding Rows for Search');
    setConvertingFile({ id: file.id, name: file.name });
    setConvertStep('Starting...');
    setConvertPct(3);
    try {
      const result = await api.reembedRows(file.id, (step, detail) => {
        setConvertStep(detail);
        setConvertPct(prev => reembedPct[step] ?? prev);
      });
      setConvertPct(100);
      toast.success(result.message || 'Rows re-embedded');
      await loadFiles();
    } catch (e: any) {
      toast.error(e.message || 'Re-embed failed');
    } finally {
      setConvertingFile(null);
      setConvertStep('');
      setConvertPct(0);
    }
  };

  const getTypeLabel = (name: string) => {
    const ext = getExt(name);
    const map: Record<string, string> = { pdf: 'PDF', doc: 'Word', docx: 'Word', xls: 'Excel', xlsx: 'Excel', ppt: 'PPT', pptx: 'PPT', txt: 'Text', md: 'Markdown', csv: 'CSV', png: 'Image', jpg: 'Image', jpeg: 'Image' };
    return map[ext] || ext.toUpperCase();
  };

  // Build org tree hierarchy
  const getChildren = (parentId: string) => organizations.filter(o => normalizeId(o.parentId) === parentId);
  const getAllDescendantIds = (orgId: string): string[] => {
    const children = getChildren(orgId);
    return children.flatMap(c => [normalizeId(c._id), ...getAllDescendantIds(normalizeId(c._id))]);
  };
  const getParentId = (orgId: string) => normalizeId(organizations.find(o => normalizeId(o._id) === orgId)?.parentId);

  const toggleOrg = (orgId: string) => {
    const org = organizations.find(o => normalizeId(o._id) === orgId);
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
        if (sibs.every(s => next.includes(normalizeId(s._id)))) {
          next = [...new Set([...next, pid])];
        } else break;
        pid = getParentId(pid);
      }
    }
    setSelectedOrgs(next);
  };

  // Org tree for rendering
  const rootOrgs = organizations.filter(o => !normalizeId(o.parentId));
  const uploadOrgIds = getUploadOrgIds();
  const canChooseUploadFile = isDeveloper || uploadOrgIds.length > 0;
  const allTypes = [...new Set(files.map(f => getTypeLabel(f.name)))];

  // Shared org picker (used by the file upload modal)
  const renderOrgPicker = () => (
    <div className="border rounded-lg p-3 mb-4 space-y-1">
      {rootOrgs.length === 0 && isDeveloper && (
        <p className="text-[11px] text-muted-foreground py-2 text-center">No organizations. Entry will be private (developer only).</p>
      )}
      {rootOrgs.length === 0 && !isDeveloper && (
        <p className="text-[11px] text-muted-foreground py-2 text-center">No organizations available.</p>
      )}
      {rootOrgs.map(root => {
        const rootId = normalizeId(root._id);
        const children = getChildren(rootId);
        const isSelected = selectedOrgs.includes(rootId);
        return (
          <div key={rootId}>
            <button onClick={() => toggleOrg(rootId)} className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${isSelected ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-foreground border-foreground' : 'border-muted-foreground/40'}`}>
                {isSelected && <span className="text-background text-[10px]">✓</span>}
              </span>
              <span className="font-medium">{root.name}</span>
              <span className="text-[10px] opacity-60">{root.type}</span>
            </button>
            {children.length > 0 && (
              <div className="ml-5 mt-0.5 space-y-0.5">
                {children.map(child => {
                  const childId = normalizeId(child._id);
                  const childSelected = selectedOrgs.includes(childId);
                  const subChildren = getChildren(childId);
                  return (
                    <div key={childId}>
                      <button onClick={() => toggleOrg(childId)} className={`flex items-center gap-2 w-full text-left px-2 py-1 rounded-md text-xs transition-colors ${childSelected ? 'bg-foreground/10' : 'hover:bg-muted'}`}>
                        <span className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${childSelected ? 'bg-foreground border-foreground' : 'border-muted-foreground/40'}`}>
                          {childSelected && <span className="text-background text-[9px]">✓</span>}
                        </span>
                        {child.name}
                        <span className="text-[10px] opacity-60">{child.type}</span>
                      </button>
                      {subChildren.length > 0 && (
                        <div className="ml-5 mt-0.5 space-y-0.5">
                          {subChildren.map(sub => {
                            const subId = normalizeId(sub._id);
                            const subSel = selectedOrgs.includes(subId);
                            return (
                              <button key={subId} onClick={() => toggleOrg(subId)} className={`flex items-center gap-2 w-full text-left px-2 py-1 rounded-md text-xs transition-colors ${subSel ? 'bg-foreground/10' : 'hover:bg-muted'}`}>
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
  );

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
                        <p className="text-[11px] text-muted-foreground">{file.isTextNote ? 'Text Note' : getTypeLabel(file.name)}{file.isTabular ? ' · Data Table (SQL)' : ''}{file.size ? ` · ${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}</p>
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
                      {isDeveloper && s3Enabled && file.hasLocal && (
                        <button onClick={() => handleConvertS3(file)} title="Move to S3 storage" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Cloud className="w-4 h-4" /></button>
                      )}
                      {isDeveloper && file.isTabular && file.embeddable && (
                        <button onClick={() => handleReembed(file)} title="Re-embed rows for semantic search" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Sparkles className="w-4 h-4" /></button>
                      )}
                      {isConvertible(file) && (
                        <button onClick={() => handleConvert(file)} title="Convert to data table (SQL)" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Table2 className="w-4 h-4" /></button>
                      )}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !isUploading && finishUploadModal()}>
          <div className="bg-background rounded-xl p-5 w-full max-w-md mx-4 border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Upload File</h2>
              <button onClick={() => !isUploading && finishUploadModal()} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <p className="text-xs font-medium mb-2">Share with</p>
            {renderOrgPicker()}

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
              <Button disabled={isUploading || waitingForConfirm || !canChooseUploadFile} onClick={() => document.getElementById('file-upload-modal')?.click()} className="w-full text-xs h-9 rounded-lg">
                {waitingForConfirm ? "Upload complete" : isUploading ? "Processing..." : "Choose File & Upload"}
              </Button>
              {(isUploading || waitingForConfirm) && uploadStep && (
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
                <Button size="sm" onClick={finishUploadModal} className="w-full text-xs h-9 rounded-lg mt-2">
                  Done
                </Button>
              )}
              {!canChooseUploadFile && !isUploading && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-foreground text-background text-[11px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  No organization access for upload
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/60 text-center mt-2">Supported: PDF, DOCX, PPTX, PPT, XLSX, XLS, TXT, CSV, JSON, HTML, MD, PNG, JPG, JPEG, TIFF, BMP, WEBP</p>
          </div>
        </div>
      )}

      {/* Convert to Table progress */}
      {convertingFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl p-5 w-full max-w-sm mx-4 border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Table2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{progressTitle}</h2>
            </div>
            <p className="text-xs text-muted-foreground truncate mb-3">{convertingFile.name}</p>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="bg-foreground h-2 rounded-full transition-all duration-300" style={{ width: `${Math.max(convertPct, 3)}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 animate-pulse">{convertStep || 'Processing...'}</p>
          </div>
        </div>
      )}
    </div>
  );
};
