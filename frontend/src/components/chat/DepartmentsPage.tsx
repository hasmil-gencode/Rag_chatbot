import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Users as UsersIcon, Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

interface Department {
  _id: string;
  name: string;
  description: string;
  organizationId: string;
  organizationName: string;
  status: string;
}

interface Organization {
  _id: string;
  name: string;
  status: string;
}

export const DepartmentsPage = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    organizationId: "",
    status: "active"
  });
  
  const userRole = localStorage.getItem('userRole') || '';
  const isDeveloper = userRole.toLowerCase() === 'developer';

  useEffect(() => {
    loadDepartments();
    loadOrganizations();
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const response = await fetch('/api/user/me', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.organizationId && !isDeveloper) {
        // Auto-set org for Admin
        setFormData(prev => ({ ...prev, organizationId: data.organizationId }));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await api.getDepartments();
      setDepartments(data);
    } catch (error) {
      console.error("Failed to load departments:", error);
    }
  };

  const loadOrganizations = async () => {
    try {
      const data = await api.getOrganizations();
      setOrganizations(data.filter((o: Organization) => o.status === 'active'));
    } catch (error) {
      console.error("Failed to load organizations:", error);
    }
  };

  const handleCreate = async () => {
    try {
      await api.createDepartment(formData);
      setShowModal(false);
      setFormData({ name: "", description: "", organizationId: "", status: "active" });
      loadDepartments();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const handleUpdate = async () => {
    if (!editingDept) return;
    try {
      await api.updateDepartment(editingDept._id, formData);
      setEditingDept(null);
      setFormData({ name: "", description: "", organizationId: "", status: "active" });
      loadDepartments();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this department?")) return;
    try {
      await api.deleteDepartment(id);
      loadDepartments();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const openEditModal = (dept: Department) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name,
      description: dept.description,
      organizationId: dept.organizationId,
      status: dept.status
    });
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Departments</h1>
          <p className="text-muted-foreground">Manage departments within organizations</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Department
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="border-b">
              <tr>
                <th className="text-left p-4">Department</th>
                <th className="text-left p-4">Organization</th>
                <th className="text-left p-4">Status</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.map(dept => (
                <tr key={dept._id} className="border-b last:border-0">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <UsersIcon className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{dept.name}</div>
                        <div className="text-sm text-muted-foreground">{dept.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">{dept.organizationName}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs ${
                      dept.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {dept.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(dept)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(dept._id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      {(showModal || editingDept) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{editingDept ? "Edit Department" : "Create Department"}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowModal(false);
                    setEditingDept(null);
                    setFormData({ name: "", description: "", organizationId: "", status: "active" });
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Department Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter department name"
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

              {/* Only Developer can select organization */}
              {isDeveloper && (
                <div>
                  <Label>Organization *</Label>
                  <select
                    className="w-full border rounded-md p-2 bg-background text-foreground"
                    value={formData.organizationId}
                    onChange={(e) => setFormData({ ...formData, organizationId: e.target.value })}
                  >
                    <option value="">Select organization</option>
                    {organizations.map(org => (
                      <option key={org._id} value={org._id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}

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
                    setEditingDept(null);
                    setFormData({ name: "", description: "", organizationId: "", status: "active" });
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={editingDept ? handleUpdate : handleCreate}>
                  {editingDept ? "Update" : "Create"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
