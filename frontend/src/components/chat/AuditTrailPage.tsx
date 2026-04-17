import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { FileUp, Trash2 } from "lucide-react";

const ICONS: Record<string, any> = { file_upload: FileUp, file_delete: Trash2 };
const LABELS: Record<string, string> = { file_upload: 'Uploaded', file_delete: 'Deleted' };

export const AuditTrailPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => { api.getAuditLogs().then(setLogs).catch(() => setLogs([])); }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Activity</p>
          <h1 className="text-xl font-semibold">Audit Trail</h1>
          <p className="text-xs text-muted-foreground mt-0.5">File upload and delete activity log.</p>
        </div>

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
              {logs.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">No activity yet</td></tr>
              ) : logs.map(log => {
                const Icon = ICONS[log.action] || FileUp;
                return (
                  <tr key={log._id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${log.action === 'file_delete' ? 'text-red-500' : 'text-green-500'}`} />
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
      </div>
    </div>
  );
};
