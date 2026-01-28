import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

interface User {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roles: { id: string; name: string }[];
  createdAt: string;
}

interface Role {
  _id: string;
  name: string;
  status: string;
  description?: string;
}

interface Organization {
  _id: string;
  name: string;
}

interface Department {
  _id: string;
  name: string;
  organizationId: string;
}

export const UsersPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [currentUserOrgId, setCurrentUserOrgId] = useState<string>("");
  const [currentUserDeptId, setCurrentUserDeptId] = useState<string>("");
  const userRole = localStorage.getItem('userRole') || '';
  const isDeveloper = userRole.toLowerCase() === 'developer';
  const isAdmin = userRole.toLowerCase() === 'admin';
  const isManager = userRole.toLowerCase() === 'manager';
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "" as string, // Changed from roles array to single role
    organizationId: "",
    departmentId: "",
    status: "active"
  });

  useEffect(() => {
    loadUsers();
    loadRoles();
    loadOrganizations();
    loadDepartments();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  };

  const loadOrganizations = async () => {
    try {
      const data = await api.getOrganizations();
      setOrganizations(data.filter((o: any) => o.status === 'active'));
    } catch (error) {
      console.error("Failed to load organizations:", error);
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await api.getDepartments();
      setDepartments(data.filter((d: any) => d.status === 'active'));
    } catch (error) {
      console.error("Failed to load departments:", error);
    }
  };

  const loadRoles = async () => {
    try {
      // Use /api/roles/list for user creation (no permission required)
      const response = await fetch('/api/roles/list', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      setRoles(data);
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  };

  const handleCreate = async () => {
    try {
      const userData = {
        ...formData,
        roles: [formData.role],
        // Use current user's org/dept if not selectable
        organizationId: formData.organizationId || (!canSelectOrg ? currentUserOrgId : ""),
        departmentId: formData.departmentId || (!canSelectDept && userRole.toLowerCase() === 'manager' ? currentUserDeptId : "")
      };
      
      await api.createUser(userData);
      setShowCreateModal(false);
      setFormData({ email: "", password: "", fullName: "", role: "", organizationId: "", departmentId: "", status: "active" });
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    try {
      const userData = {
        ...formData,
        roles: [formData.role],
        organizationId: formData.organizationId || (!canSelectOrg ? currentUserOrgId : ""),
        departmentId: formData.departmentId || (!canSelectDept && userRole.toLowerCase() === 'manager' ? currentUserDeptId : "")
      };
      
      await api.updateUser(editingUser.id, userData);
      setEditingUser(null);
      setFormData({ email: "", password: "", fullName: "", role: "", organizationId: "", departmentId: "", status: "active" });
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (email === 'developer@gencode.com.my') {
      toast.error("Cannot delete developer account!");
      return;
    }
    if (!confirm("Delete this user?")) return;
    try {
      await api.deleteUser(id);
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    }
  };

  const openEditModal = (user: any) => {
    if (user.email === 'developer@gencode.com.my') {
      toast.error("Cannot edit developer account!");
      return;
    }
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: "",
      fullName: user.fullName,
      role: user.roles[0]?.id || "", // Take first role only
      organizationId: user.organizationId || "",
      departmentId: user.departmentId || "",
      status: user.status
    });
  };

  const selectRole = (roleId: string) => {
    setFormData(prev => ({
      ...prev,
      role: roleId,
      // Reset org/dept when role changes
      organizationId: "",
      departmentId: ""
    }));
  };

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const response = await fetch('/api/user/me', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        setCurrentUserOrgId(data.organizationId || "");
        setCurrentUserDeptId(data.departmentId || "");
      } catch (error) {
        console.error(error);
      }
    };
    loadCurrentUser();
  }, []);

  // Check if selected role needs org/dept
  const selectedRoleObj = roles.find(r => r._id === formData.role);
  const selectedRoleName = selectedRoleObj?.name || "";
  
  // Developer: Can assign any org/dept based on role
  // Admin: Can only assign own org, dept selection for Manager/User
  // Manager: Can only assign own dept for User
  const canSelectOrg = isDeveloper;
  const canSelectDept = isDeveloper || (userRole.toLowerCase() === 'admin' && ['Manager', 'User'].includes(selectedRoleName));
  
  const needsOrganization = selectedRoleName === 'Admin' || selectedRoleName === 'Manager' || selectedRoleName === 'User';
  const needsDepartment = selectedRoleName === 'Manager' || selectedRoleName === 'User';

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground">Manage system users and their roles</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add User
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="border-b">
              <tr>
                <th className="text-left p-4">User</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Roles</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users
                .filter(user => isDeveloper || user.email !== 'developer@gencode.com.my')
                .map(user => (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="p-4">
                    <div>
                      <div className="font-medium">{user.fullName}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs ${
                      user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map(role => (
                        <span key={role.id} className="px-2 py-1 bg-primary/10 text-primary rounded text-xs">
                          {role.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(user)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(user.id, user.email)}
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
      {(showCreateModal || editingUser) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <Card className="w-full max-w-md my-8">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{editingUser ? "Edit User" : "Create User"}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingUser(null);
                    setFormData({ email: "", password: "", fullName: "", role: "", organizationId: "", departmentId: "", status: "active" });
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <Label>Email Address *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <Label>Full Name *</Label>
                <Input
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <Label>Password {editingUser && "(leave blank to keep current)"}</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter password"
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
                <Label>Select Role *</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background text-foreground"
                  value={formData.role}
                  onChange={(e) => selectRole(e.target.value)}
                >
                  <option value="">Select Role</option>
                  {roles
                    .filter(role => {
                      // Developer can see all roles
                      if (isDeveloper) return true;
                      // Admin can only create Manager and User
                      if (isAdmin) return ['Manager', 'User'].includes(role.name);
                      // Manager can only create User
                      if (isManager) return role.name === 'User';
                      return false;
                    })
                    .map(role => (
                      <option key={role._id} value={role._id}>{role.name}</option>
                    ))}
                </select>
              </div>

              {/* Only Developer can select organization when creating Admin/Manager/User */}
              {needsOrganization && canSelectOrg && (
                <div>
                  <Label>Organization *</Label>
                  <select
                    className="w-full border rounded-md p-2 bg-background text-foreground"
                    value={formData.organizationId || ""}
                    onChange={(e) => setFormData({ ...formData, organizationId: e.target.value, departmentId: "" })}
                  >
                    <option value="">Select Organization</option>
                    {organizations.map(org => (
                      <option key={org._id} value={org._id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Department field - only show if user can select dept */}
              {needsDepartment && canSelectDept && (formData.organizationId || currentUserOrgId) && (
                <div>
                  <Label>Department *</Label>
                  <select
                    className="w-full border rounded-md p-2 bg-background text-foreground"
                    value={formData.departmentId || ""}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                  >
                    <option value="">Select Department</option>
                    {departments
                      .filter(d => {
                        const targetOrgId = formData.organizationId || currentUserOrgId;
                        return d.organizationId === targetOrgId;
                      })
                      .map(dept => (
                        <option key={dept._id} value={dept._id}>{dept.name}</option>
                      ))}
                  </select>
                  {!canSelectDept && userRole.toLowerCase() === 'manager' && (
                    <p className="text-xs text-muted-foreground mt-1">Your department only</p>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingUser(null);
                    setFormData({ email: "", password: "", fullName: "", role: "", organizationId: "", departmentId: "", status: "active" });
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={editingUser ? handleUpdate : handleCreate}>
                  {editingUser ? "Update" : "Create"} User
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
