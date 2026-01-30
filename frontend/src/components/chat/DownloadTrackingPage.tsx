import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Download, Search, TrendingUp } from "lucide-react";

export const DownloadTrackingPage = () => {
  const [downloads, setDownloads] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredDownloads, setFilteredDownloads] = useState<any[]>([]);

  useEffect(() => {
    loadDownloads();
    loadStats();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredDownloads(downloads);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = downloads.filter(d => 
        d.fileName.toLowerCase().includes(query) ||
        d.userEmail.toLowerCase().includes(query)
      );
      setFilteredDownloads(filtered);
    }
  }, [searchQuery, downloads]);

  const loadDownloads = async () => {
    try {
      const response = await fetch('/api/download-tracking', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to load downloads');
      const data = await response.json();
      setDownloads(data);
      setFilteredDownloads(data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/download-tracking/stats', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to load stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Download Tracking</h1>
        <p className="text-muted-foreground">Monitor form downloads and usage statistics</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Downloads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{downloads.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unique Forms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Most Downloaded</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium truncate">{stats[0]?.fileName || 'N/A'}</div>
            <div className="text-xs text-muted-foreground">{stats[0]?.downloadCount || 0} downloads</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Download History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              <span>Recent Downloads</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by file name or user..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredDownloads.map((download, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border hover:bg-secondary transition-all"
                >
                  <p className="font-medium text-sm truncate">{download.fileName}</p>
                  <div className="text-xs text-muted-foreground mt-1">
                    <p>Downloaded by: {download.userEmail}</p>
                    <p>Date: {new Date(download.downloadedAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              {filteredDownloads.length === 0 && (
                <div className="text-center py-12">
                  <Download className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    {searchQuery ? "No matching downloads" : "No downloads yet"}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              <span>Download Statistics</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {stats.map((stat, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{stat.fileName}</p>
                      <div className="text-xs text-muted-foreground mt-1">
                        <p>{stat.downloadCount} downloads • {stat.uniqueUsers} unique users</p>
                        <p>Last: {new Date(stat.lastDownloaded).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="text-lg font-bold text-primary">{stat.downloadCount}</div>
                    </div>
                  </div>
                </div>
              ))}
              {stats.length === 0 && (
                <div className="text-center py-12">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No statistics available</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
