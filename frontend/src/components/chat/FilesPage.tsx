import { useState, useEffect } from "react";
import { toast } from "sonner";
import { File, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export const FilesPage = () => {
  const [files, setFiles] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ used: number; limit: number } | null>(null);
  const userRole = localStorage.getItem('userRole') || 'user';
  const userId = localStorage.getItem('userId') || '';
  const isDeveloper = userRole.toLowerCase() === 'developer';

  useEffect(() => {
    loadFiles();
    loadOrganizations();
    loadStorageInfo();
  }, []);

  const loadFiles = async () => {
    try {
      // For Files page, show files from all user's orgs (not just current org)
      // Pass null to get all accessible files
      const data = await api.getFiles(null);
      setFiles(data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadOrganizations = async () => {
    try {
      console.log('Loading organizations, isDeveloper:', isDeveloper);
      // Developer sees all orgs, regular users see assigned orgs + children
      const data = isDeveloper 
        ? await api.getAllOrganizations()
        : await api.getMyOrganizationsHierarchy();
      console.log('Organizations loaded:', data);
      setOrganizations(data.organizations || []);
    } catch (error) {
      console.error('Error loading organizations:', error);
    }
  };

  const loadStorageInfo = async () => {
    try {
      const data = await api.getStorageInfo();
      console.log('Storage info loaded:', data);
      setStorageInfo(data);
    } catch (error) {
      console.error('Error loading storage info:', error);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await api.uploadFile(file, selectedOrgs);
      await loadFiles();
      await loadStorageInfo(); // Refresh storage info
      setSelectedOrgs([]);
      toast.success("File uploaded successfully");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this file?")) return;
    
    try {
      await api.deleteFile(id);
      await loadFiles();
      await loadStorageInfo(); // Refresh storage info
      toast.success("File deleted");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const formatSize = (bytes: number) => {
    const gb = bytes / 1024 / 1024 / 1024;
    return gb.toFixed(6); // Show 6 decimal places
  };

  return (
    <div className="h-full overflow-y-auto"><div className="p-6 space-y-4">
      {storageInfo && storageInfo.limit > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Storage Usage:</span>
                <span className="text-sm">
                  {formatSize(storageInfo.used)} GB / {storageInfo.limit} GB
                  <span className="text-xs text-muted-foreground ml-2">
                    ({((storageInfo.used / (storageInfo.limit * 1024 * 1024 * 1024)) * 100).toFixed(6)}%)
                  </span>
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.max(Math.min((storageInfo.used / (storageInfo.limit * 1024 * 1024 * 1024)) * 100, 100), 1)}%`,
                    minWidth: '4px'
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Upload Files</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-all">
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <div className="space-y-4">
              <div className="max-w-md mx-auto">
                <Label>Share with Organizations</Label>
                <div className="border rounded-md p-3 mt-1 max-h-32 overflow-y-auto space-y-2">
                  {organizations.map((org) => (
                    <label key={org._id} className="flex items-center gap-2 cursor-pointer hover:bg-muted p-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedOrgs.includes(org._id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedOrgs([...selectedOrgs, org._id]);
                          } else {
                            setSelectedOrgs(selectedOrgs.filter(id => id !== org._id));
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">{org.name} ({org.type})</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Select organizations to share with. Leave empty for no restrictions.
                </p>
              </div>
              
              <div>
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                />
                <Button
                  disabled={isUploading}
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  {isUploading ? "Uploading..." : "Choose File"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Uploaded Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">{/* File list */}

          {/* Files List */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Uploaded By</th>
                  <th className="px-4 py-3 text-left">Shared With</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <File className="w-4 h-4" />
                        {file.name}
                      </div>
                    </td>
                    <td className="px-4 py-3">{file.uploadedBy}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {file.sharedWith?.length > 0 ? file.sharedWith.join(', ') : 'All'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {new Date(file.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(file.userId === userId || isDeveloper) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(file.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
};
