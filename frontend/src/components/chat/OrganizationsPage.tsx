import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Building2, Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

interface Organization {
  _id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
}

export const OrganizationsPage = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "active"
  });

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      const data = await api.getOrganizations();
      setOrganizations(data);
    } catch (error) {
      console.error("Failed to load organizations:", error);
    }
  };

  const handleCreate = async () => {
    try {
      await api.createOrganization(formData);
      setShowModal(false);
      setFormData({ name: "", description: "", status: "active" });
      loadOrganizations();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const handleUpdate = async () => {
    if (!editingOrg) return;
    try {
      await api.updateOrganization(editingOrg._id, formData);
      setEditingOrg(null);
      setFormData({ name: "", description: "", status: "active" });
      loadOrganizations();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this organization? All departments will also be deleted.")) return;
    try {
      await api.deleteOrganization(id);
      loadOrganizations();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const openEditModal = (org: Organization) => {
    setEditingOrg(org);
    setFormData({
      name: org.name,
      description: org.description,
      status: org.status
    });
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Organizations</h1>
          <p className="text-muted-foreground">Manage organizations and their structure</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Organization
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {organizations.map(org => (
          <Card key={org._id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">{org.name}</CardTitle>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditModal(org)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(org._id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">{org.description}</p>
              <span className={`px-2 py-1 rounded text-xs ${
                org.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {org.status}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {(showModal || editingOrg) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{editingOrg ? "Edit Organization" : "Create Organization"}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowModal(false);
                    setEditingOrg(null);
                    setFormData({ name: "", description: "", status: "active" });
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Organization Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter organization name"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter description"
                />
              </div>

              <div>
                <Label>Status</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background text-foreground"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowModal(false);
                    setEditingOrg(null);
                    setFormData({ name: "", description: "", status: "active" });
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={editingOrg ? handleUpdate : handleCreate}>
                  {editingOrg ? "Update" : "Create"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
