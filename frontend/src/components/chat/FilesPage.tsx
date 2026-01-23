import { useState, useEffect } from "react";
import { Upload, File, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export const FilesPage = () => {
  const [files, setFiles] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [targetOrganization, setTargetOrganization] = useState<string>("all");
  const [isUploading, setIsUploading] = useState(false);
  const userRole = localStorage.getItem('userRole') || 'user';

  useEffect(() => {
    loadFiles();
    if (userRole === 'admin') {
      loadOrganizations();
    }
  }, []);

  const loadFiles = async () => {
    try {
      const data = await api.getFiles();
      setFiles(data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadOrganizations = async () => {
    try {
      const response = await fetch('/api/organizations', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      setOrganizations(data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (userRole === 'admin') {
        formData.append('targetOrganization', targetOrganization);
      }
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      await loadFiles();
      alert("File uploaded successfully!");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this file?")) return;
    
    try {
      await api.deleteFile(id);
      await loadFiles();
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto chat-scrollbar p-6 bg-background">
      <div className="mb-6">
        <h1 className="text-xl font-semibold mb-1">File Management</h1>
        <p className="text-sm text-muted-foreground">Upload documents for RAG processing</p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-all duration-200">
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">Upload Files</h3>
            <p className="text-sm text-muted-foreground mb-4">
              PDF, DOCX, TXT, JSON supported
            </p>
            
            {userRole === 'admin' && (
              <div className="mb-4 max-w-xs mx-auto">
                <Label className="text-sm">Target Organization</Label>
                <select
                  value={targetOrganization}
                  onChange={(e) => setTargetOrganization(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm mt-1"
                >
                  <option value="all">All Organizations</option>
                  {organizations.map(org => (
                    <option key={org._id} value={org._id}>{org.name}</option>
                  ))}
                </select>
              </div>
            )}
            
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
        </CardContent>
      </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Uploaded Files</span>
              <span className="text-sm font-normal text-muted-foreground">({files.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-secondary transition-all duration-200"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <File className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(file.uploadedAt).toLocaleDateString()}
                        {file.uploadedBy && ` • Uploaded by ${file.uploadedBy}`}
                        {file.organizationName && ` • ${file.organizationName}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(file.id)}
                    className="flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {files.length === 0 && (
                <div className="text-center py-12">
                  <File className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    No files uploaded yet
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
    </div>
  );
};
