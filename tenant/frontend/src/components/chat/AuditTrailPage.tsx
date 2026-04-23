import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { FileUp, Trash2, Download, Search, X, Users, Settings, Key, Building2, Lock } from "lucide-react";

const ICONS: Record<string, any> = {
  file_upload: FileUp, file_delete: Trash2, file_download: Download,
  'settings.update': Settings, 'user.create': Users, 'user.update': Users, 'user.delete': Trash2,
  'user.password_reset': Lock, 'org.create': Building2, 'org.update': Building2, 'org.delete': Trash2,
  'apikey.create': Key, 'apikey.delete': Trash2,
};
const LABELS: Record<string, string> = { file_upload: 'Uploaded', file_delete: 'Deleted', file_download: 'Downloaded' };
const COLORS: Record<string, string> = { file_upload: 'text-green-500', file_delete: 'text-red-500', file_download: 'text-blue-500' };

export const AuditTrailPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");

  useEffect(() => { api.getAuditLogs().then(setLogs).catch(() => setLogs([])); }, []);

  const filtered = logs.filter(log => {
    if (actionFilter !== "all" && log.action !== actionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const fileName = (log.details?.fileName || '').toLowerCase();
      const userEmail = (log.userEmail || '').toLowerCase();
      if (!fileName.includes(q) && !userEmail.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    total: logs.length,
    uploads: logs.filter(l => l.action === 'file_upload').length,
    deletes: logs.filter(l => l.action === 'file_delete').length,
    downloads: logs.filter(l => l.action === 'file_download').length,
    settings: logs.filter(l => l.action === 'settings.update').length,
    users: logs.filter(l => l.action?.startsWith('user.')).length,
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Activity</p>
          <h1 className="text-xl font-semibold">Audit Trail</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Track all admin actions, file operations, and system changes.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold mt-0.5">{counts.total}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><FileUp className="w-3 h-3 text-green-500" />Files</p>
            <p className="text-2xl font-semibold mt-0.5">{counts.uploads + counts.downloads + counts.deletes}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3 text-blue-500" />Users</p>
            <p className="text-2xl font-semibold mt-0.5">{counts.users}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Settings className="w-3 h-3 text-orange-500" />Settings</p>
            <p className="text-2xl font-semibold mt-0.5">{counts.settings}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Trash2 className="w-3 h-3 text-red-500" />Deletes</p>
            <p className="text-2xl font-semibold mt-0.5">{counts.deletes}</p>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by file name or user..."
              className="w-full h-9 pl-9 pr-8 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="h-9 px-3 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="all">All Actions</option>
            <option value="file_upload">File Upload</option>
            <option value="file_download">File Download</option>
            <option value="file_delete">File Delete</option>
            <option value="settings.update">Settings Update</option>
            <option value="user.create">User Create</option>
            <option value="user.update">User Update</option>
            <option value="user.delete">User Delete</option>
            <option value="user.password_reset">Password Reset</option>
            <option value="org.create">Org Create</option>
            <option value="org.update">Org Update</option>
            <option value="org.delete">Org Delete</option>
            <option value="apikey.create">API Key Create</option>
            <option value="apikey.delete">API Key Delete</option>
          </select>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">File</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">User</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Date & Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {logs.length === 0 ? 'No activity yet' : 'No results match your search'}
                </td></tr>
              ) : filtered.map(log => {
                const Icon = ICONS[log.action] || FileUp;
                return (
                  <tr key={log._id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${COLORS[log.action] || 'text-muted-foreground'}`} />
                        <span>{LABELS[log.action] || log.action}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-medium">{log.details?.fileName || '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{log.userEmail}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && filtered.length !== logs.length && (
          <p className="text-[11px] text-muted-foreground mt-2">Showing {filtered.length} of {logs.length} entries</p>
        )}
      </div>
    </div>
  );
};
