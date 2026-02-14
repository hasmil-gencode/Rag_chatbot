import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Upload, File, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export const FormsPage = () => {
  const [forms, setForms] = useState<any[]>([]);
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
  const hasFileManageAccess = userPermissions.includes('file:manage_access') || isDeveloper;

  useEffect(() => {
    loadForms();
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
        setTargetOrganization(data.organizationId);
        if (data.departmentId) {
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

  const loadForms = async () => {
    try {
      const response = await fetch('/api/forms', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to load forms');
      const data = await response.json();
      setForms(data);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load forms');
    }
  };

  const loadOrganizations = async () => {
    try {
      const response = await fetch('/api/organizations', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to load organizations');
      const data = await response.json();
      setOrganizations(data.filter((o: any) => o.status === 'active'));
    } catch (error) {
      console.error(error);
    }
  };

  const loadDepartments = async (orgId: string) => {
    try {
      const response = await fetch(`/api/departments?organizationId=${orgId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to load departments');
      const data = await response.json();
      setDepartments(data.filter((d: any) => d.status === 'active'));
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'form'); // Set type as 'form'
    
    if (hasFileManageAccess) {
      formData.append('organizationId', targetOrganization || 'all');
      formData.append('departmentId', targetDepartment || 'all');
    }

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');
      
      const result = await response.json();
      toast.success(result.message || 'Form uploaded successfully');
      await loadForms();
      e.target.value = '';
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
      const response = await fetch(`/api/files/${fileToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (!response.ok) throw new Error('Failed to delete form');
      
      toast.success("Form deleted successfully");
      await loadForms();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete form");
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
    <div className="h-full overflow-y-auto p-6 md:pt-6 pt-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Forms</h1>
        <p className="text-muted-foreground">Upload and manage downloadable forms</p>
      </div>

      {hasFileManageAccess && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Upload Form</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Organization</Label>
                <select
                  value={targetOrganization}
                  onChange={(e) => setTargetOrganization(e.target.value)}
                  className="w-full p-2 border rounded-md bg-background text-foreground"
                  disabled={!isDeveloper}
                >
                  <option value="">Select Organization</option>
                  {isDeveloper && <option value="all">All Organizations</option>}
                  {organizations.map((org) => (
                    <option key={org._id} value={org._id}>{org.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Department</Label>
                <select
                  value={targetDepartment}
                  onChange={(e) => setTargetDepartment(e.target.value)}
                  className="w-full p-2 border rounded-md bg-background text-foreground"
                  disabled={!targetOrganization || targetOrganization === 'all'}
                >
                  <option value="">Select Department</option>
                  {(isDeveloper || isAdmin) && <option value="all">All Departments</option>}
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id}>{dept.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Upload Form File</Label>
              <div className="mt-2">
                <Button
                  variant="outline"
                  disabled={isUploading}
                  className="relative"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading ? "Uploading..." : "Choose File"}
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.txt,.doc,.xls,.ppt,.pptx"
                    onChange={handleUpload}
                    disabled={isUploading}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Supported: PDF, DOCX, XLSX, TXT, PPT
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Available Forms</span>
            <span className="text-sm font-normal text-muted-foreground">({forms.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {forms.map((form) => (
              <div
                key={form.id}
                className="flex items-center justify-between p-4 rounded-lg border hover:bg-secondary transition-all duration-200"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <File className="w-5 h-5 text-primary flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{form.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(form.uploadedAt).toLocaleDateString()}
                      {form.uploadedBy && ` • Uploaded by ${form.uploadedBy}`}
                      {form.organizationName && ` • ${form.organizationName}`}
                    </p>
                  </div>
                </div>
                {(isAdmin || form.userId === userId) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(form.id, form.name)}
                    disabled={deletingFileId === form.id}
                    className="flex-shrink-0"
                  >
                    {deletingFileId === form.id ? (
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                )}
              </div>
            ))}
            {forms.length === 0 && (
              <div className="text-center py-12">
                <File className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  No forms uploaded yet
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
              <CardTitle>Delete Form</CardTitle>
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
