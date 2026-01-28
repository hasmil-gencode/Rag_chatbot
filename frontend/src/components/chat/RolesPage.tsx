import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Shield, Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

interface Role {
  _id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  status: string;
}

interface Permission {
  name: string;
  category: string;
  description: string;
}

export const RolesPage = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const userRole = localStorage.getItem('userRole') || '';
  const isDeveloper = userRole.toLowerCase() === 'developer';
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
    status: "active"
  });

  useEffect(() => {
    loadRoles();
    loadPermissions();
  }, []);

  const loadRoles = async () => {
    try {
      const data = await api.getRoles();
      setRoles(data);
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  };

  const loadPermissions = async () => {
    try {
      const data = await api.getPermissions();
      setPermissions(data);
    } catch (error) {
      console.error("Failed to load permissions:", error);
    }
  };

  const handleCreate = async () => {
    try {
      await api.createRole(formData);
      setShowCreateModal(false);
      setFormData({ name: "", description: "", permissions: [], status: "active" });
      loadRoles();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const handleUpdate = async () => {
    if (!editingRole) return;
    try {
      await api.updateRole(editingRole._id, formData);
      setEditingRole(null);
      setFormData({ name: "", description: "", permissions: [], status: "active" });
      loadRoles();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this role?")) return;
    try {
      await api.deleteRole(id);
      loadRoles();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const openEditModal = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      status: role.status
    });
  };

  const togglePermission = (perm: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm]
    }));
  };

  const permissionsByCategory = permissions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Roles & Permissions</h1>
          <p className="text-muted-foreground">Manage roles and their permissions</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Role
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles
          .filter(role => isDeveloper || role.name !== 'Developer')
          .map(role => (
          <Card key={role._id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">{role.name}</CardTitle>
                    {role.isSystem && (
                      <span className="text-xs text-muted-foreground">System Role</span>
                    )}
                  </div>
                </div>
                {!role.isSystem && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditModal(role)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(role._id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">{role.description}</p>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  {role.permissions.length} permission(s) - Click to view
                </summary>
                <div className="mt-2 space-y-1 pl-4">
                  {role.permissions.map(permName => {
                    const perm = permissions.find(p => p.name === permName);
                    return (
                      <div key={permName} className="text-xs">
                        <span className="font-medium">{permName}</span>
                        {perm && <span className="text-muted-foreground"> - {perm.description}</span>}
                      </div>
                    );
                  })}
                </div>
              </details>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingRole) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{editingRole ? "Edit Role" : "Create Role"}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingRole(null);
                    setFormData({ name: "", description: "", permissions: [], status: "active" });
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Role Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter role name"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter role description"
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

              <div>
                <Label>Permissions ({formData.permissions.length} selected)</Label>
                <div className="space-y-4 mt-2">
                  {Object.entries(permissionsByCategory).map(([category, perms]) => (
                    <div key={category} className="border rounded-lg p-3">
                      <h4 className="font-medium mb-2">{category}</h4>
                      <div className="space-y-2">
                        {perms.map(perm => (
                          <label key={perm.name} className="flex items-start gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <input
                              type="checkbox"
                              checked={formData.permissions.includes(perm.name)}
                              onChange={() => togglePermission(perm.name)}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium">{perm.name}</div>
                              <div className="text-sm text-muted-foreground">{perm.description}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingRole(null);
                    setFormData({ name: "", description: "", permissions: [], status: "active" });
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={editingRole ? handleUpdate : handleCreate}>
                  {editingRole ? "Update" : "Create"} Role
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
