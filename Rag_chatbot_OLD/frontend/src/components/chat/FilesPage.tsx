import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Upload, File, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export const FilesPage = () => {
  const [files, setFiles] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [targetOrganization, setTargetOrganization] = useState<string>("");
  const [targetDepartment, setTargetDepartment] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{id: string, name: string} | null>(null);
  const userRole = localStorage.getItem('userRole') || 'user';
  const userId = localStorage.getItem('userId') || '';
  const userPermissions = JSON.parse(localStorage.getItem('userPermissions') || '[]');
  const isDeveloper = userRole.toLowerCase() === 'developer';
  const isAdmin = userRole.toLowerCase() === 'admin';
  const isManager = userRole.toLowerCase() === 'manager';
  const hasFileManageAccess = userPermissions.includes('file:manage_access') || isDeveloper;
  const [userOrgId, setUserOrgId] = useState<string>("");
  const [userDeptId, setUserDeptId] = useState<string>("");

  useEffect(() => {
    loadFiles();
    if (hasFileManageAccess) {
      loadOrganizations();
    }
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const response = await fetch('/api/user/me', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.organizationId) {
        setUserOrgId(data.organizationId);
        setTargetOrganization(data.organizationId);
        if (data.departmentId) {
          setUserDeptId(data.departmentId);
          loadDepartments(data.organizationId);
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (targetOrganization) {
      loadDepartments(targetOrganization);
    } else {
      setDepartments([]);
      setTargetDepartment("");
    }
  }, [targetOrganization]);

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
      const data = await api.getOrganizations();
      setOrganizations(data.filter((o: any) => o.status === 'active'));
    } catch (error) {
      console.error(error);
    }
  };

  const loadDepartments = async (orgId: string) => {
    try {
      const data = await api.getDepartments(orgId);
      setDepartments(data.filter((d: any) => d.status === 'active'));
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
      
      // Manager: Use own org/dept automatically
      if (isManager) {
        formData.append('organizationId', userOrgId);
        formData.append('departmentId', userDeptId);
      } 
      // Admin/Developer: Use selected org/dept
      else if (hasFileManageAccess) {
        formData.append('organizationId', targetOrganization || 'all');
        formData.append('departmentId', targetDepartment || 'all');
      }
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      await loadFiles();
      toast.success("File uploaded successfully");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setFileToDelete({ id, name });
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;
    
    setDeletingFileId(fileToDelete.id);
    setShowDeleteConfirm(false);
    
    try {
      await api.deleteFile(fileToDelete.id);
      toast.success("File deleted successfully");
      await loadFiles();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete file");
    } finally {
      setDeletingFileId(null);
      setFileToDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setFileToDelete(null);
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto chat-scrollbar p-6 md:pt-6 pt-16 bg-background">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">File Management</h1>
        <p className="text-muted-foreground">Upload documents for RAG processing</p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-all duration-200">
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">Upload Files</h3>
            <p className="text-sm text-muted-foreground mb-4">
              PDF, DOCX, TXT, JSON supported
            </p>
            
            {hasFileManageAccess && (
              <div className="mb-4 max-w-md mx-auto space-y-3">
                {/* Developer can select organization */}
                {isDeveloper && (
                  <div>
                    <Label className="text-sm">Upload For Organization</Label>
                    <select
                      value={targetOrganization}
                      onChange={(e) => setTargetOrganization(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm mt-1"
                    >
                      <option value="">All Organizations</option>
                      {organizations.map(org => (
                        <option key={org._id} value={org._id}>{org.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                {/* Developer & Admin can select department */}
                {(isDeveloper || isAdmin) && (
                  <div>
                    <Label className="text-sm">Upload For Department</Label>
                    <select
                      value={targetDepartment}
                      onChange={(e) => setTargetDepartment(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm mt-1"
                    >
                      <option value="">All Departments in Organization</option>
                      {departments.map(dept => (
                        <option key={dept._id} value={dept._id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                {/* Manager: Show info only, no selection */}
                {isManager && (
                  <div className="text-sm text-muted-foreground">
                    File will be uploaded to your department only
                  </div>
                )}
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
                  {/* Admin cannot delete developer files, others can only delete their own */}
                  {((isAdmin && file.uploaderRole?.toLowerCase() !== 'developer') || (!isAdmin && file.userId === userId)) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(file.id, file.name)}
                      disabled={deletingFileId === file.id}
                      className="flex-shrink-0"
                    >
                      {deletingFileId === file.id ? (
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  )}
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

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Delete File</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete <span className="font-semibold text-foreground">{fileToDelete?.name}</span>?
                This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={cancelDelete}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmDelete}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
