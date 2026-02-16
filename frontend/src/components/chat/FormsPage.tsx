import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export const FormsPage = () => {
  const [forms, setForms] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const userRole = localStorage.getItem('userRole') || 'user';
  const userId = localStorage.getItem('userId') || '';
  const isDeveloper = userRole.toLowerCase() === 'developer';

  useEffect(() => {
    loadForms();
    loadOrganizations();
  }, []);

  const loadForms = async () => {
    try {
      const data = await api.getForms();
      setForms(data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadOrganizations = async () => {
    try {
      const data = isDeveloper 
        ? await api.getAllOrganizations()
        : await api.getMyOrganizationsHierarchy();
      const orgs = data.organizations || data;
      setOrganizations(Array.isArray(orgs) ? orgs : []);
    } catch (error) {
      console.error('Error loading organizations:', error);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await api.uploadForm(file, selectedOrgs);
      await loadForms();
      setSelectedOrgs([]);
      toast.success("Form uploaded successfully");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this form?")) return;
    
    try {
      await api.deleteFile(id);
      await loadForms();
      toast.success("Form deleted");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Forms</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
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
                  id="form-upload"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                  accept=".pdf,.doc,.docx"
                />
                <Button 
                  onClick={() => document.getElementById('form-upload')?.click()}
                  disabled={isUploading}
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
          <CardTitle>Uploaded Forms</CardTitle>
        </CardHeader>
        <CardContent>
          {forms.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No forms uploaded yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Uploaded By</th>
                    <th className="text-left p-2">Shared With</th>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map((form) => (
                    <tr key={form._id} className="border-b">
                      <td className="p-2">{form.name}</td>
                      <td className="p-2">{form.uploadedBy}</td>
                      <td className="p-2 text-sm">
                        {form.sharedWith?.length > 0 ? form.sharedWith.join(', ') : 'All'}
                      </td>
                      <td className="p-2 text-sm">
                        {new Date(form.uploadedAt).toLocaleDateString()}
                      </td>
                      <td className="p-2">
                        {(isDeveloper || form.userId === userId) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(form._id)}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};
