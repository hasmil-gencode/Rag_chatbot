import { useState, useEffect } from "react";
import { Download, Search, TrendingUp } from "lucide-react";

export const DownloadTrackingPage = () => {
  const [downloads, setDownloads] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredDownloads, setFilteredDownloads] = useState<any[]>([]);

  useEffect(() => { loadDownloads(); loadStats(); }, []);

  useEffect(() => {
    if (!searchQuery.trim()) setFilteredDownloads(downloads);
    else {
      const q = searchQuery.toLowerCase();
      setFilteredDownloads(downloads.filter(d => d.fileName.toLowerCase().includes(q) || d.userEmail.toLowerCase().includes(q)));
    }
  }, [searchQuery, downloads]);

  const loadDownloads = async () => {
    try {
      const res = await fetch('/api/download-tracking', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setDownloads(data); setFilteredDownloads(data);
    } catch (e) { console.error(e); }
  };

  const loadStats = async () => {
    try {
      const res = await fetch('/api/download-tracking/stats', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) throw new Error('Failed');
      setStats(await res.json());
    } catch (e) { console.error(e); }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Analytics</p>
          <h1 className="text-xl font-semibold">Download Tracking</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Monitor form downloads and usage statistics.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Downloads</p>
            <p className="text-2xl font-semibold mt-0.5">{downloads.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Unique Forms</p>
            <p className="text-2xl font-semibold mt-0.5">{stats.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Most Downloaded</p>
            <p className="text-lg font-semibold mt-0.5 truncate">{stats[0]?.fileName || '—'}</p>
            <p className="text-[10px] text-muted-foreground">{stats[0]?.downloadCount || 0} downloads</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search by file name or user..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Recent Downloads */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b">
              <p className="text-xs font-medium flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Recent Downloads</p>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {filteredDownloads.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Download className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{searchQuery ? "No matching downloads" : "No downloads yet"}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredDownloads.map((download, idx) => (
                    <div key={idx} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                      <p className="text-[13px] font-medium truncate">{download.fileName}</p>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        <p>Downloaded by: {download.userEmail}</p>
                        <p>Date: {new Date(download.downloadedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Statistics */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b">
              <p className="text-xs font-medium flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Download Statistics</p>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {stats.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No statistics available</p>
                </div>
              ) : (
                <div className="divide-y">
                  {stats.map((stat, idx) => (
                    <div key={idx} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate">{stat.fileName}</p>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            <p>{stat.downloadCount} downloads · {stat.uniqueUsers} unique users</p>
                            <p>Last: {new Date(stat.lastDownloaded).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="text-lg font-semibold ml-3">{stat.downloadCount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
