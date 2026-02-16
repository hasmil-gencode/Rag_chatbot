import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Plus, Trash2, Edit } from "lucide-react";

export const UsersPage = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    organizationIds: [] as string[],
    canUploadFiles: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersData, orgsData] = await Promise.all([
        api.getUsers(),
        api.getAllOrganizations()
      ]);
      setUsers(usersData);
      setOrganizations(orgsData.organizations || []);
      
      // Load user assignments
      const usersWithOrgs = await Promise.all(usersData.map(async (user: any) => {
        try {
          const assignments = await api.getUserAssignments(user._id);
          return { ...user, organizationIds: assignments.map((a: any) => a.organizationId) };
        } catch {
          return { ...user, organizationIds: [] };
        }
      }));
      setUsers(usersWithOrgs);
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  };

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: "",
      fullName: user.fullName,
      organizationIds: user.organizationIds || [],
      canUploadFiles: user.canUploadFiles !== false
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        // Update user
        await api.updateUser(editingUser._id, formData.fullName, formData.password, formData.canUploadFiles);
        // Update org assignments
        await api.assignUserToOrganizations(editingUser._id, formData.organizationIds);
      } else {
        // Create new user
        const userData = await api.createUser(formData.email, formData.password, formData.fullName, formData.canUploadFiles);
        // Assign to organizations
        if (formData.organizationIds.length > 0) {
          await api.assignUserToOrganizations(userData.userId, formData.organizationIds);
        }
      }
      
      setShowForm(false);
      setEditingUser(null);
      setFormData({ email: "", password: "", fullName: "", organizationIds: [], canUploadFiles: true });
      loadData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingUser(null);
    setFormData({ email: "", password: "", fullName: "", organizationIds: [], canUploadFiles: true });
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Delete this user?")) return;
    try {
      await api.deleteUser(userId);
      loadData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create User
        </Button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 border rounded-lg bg-card max-h-[80vh] overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">{editingUser ? 'Edit User' : 'Create New User'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                required
                disabled={!!editingUser}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password {editingUser && '(leave empty to keep current)'}</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                required={!editingUser}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Assign to Organizations</label>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                {organizations.map((org) => (
                  <label key={org._id} className="flex items-center gap-2 cursor-pointer hover:bg-muted p-1 rounded">
                    <input
                      type="checkbox"
                      checked={formData.organizationIds.includes(org._id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, organizationIds: [...formData.organizationIds, org._id] });
                        } else {
                          setFormData({ ...formData, organizationIds: formData.organizationIds.filter(id => id !== org._id) });
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{org.name} ({org.type})</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Select organizations to assign user</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="canUploadFiles"
                checked={formData.canUploadFiles}
                onChange={(e) => setFormData({ ...formData, canUploadFiles: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="canUploadFiles" className="text-sm font-medium">
                Can upload files (uncheck for chat-only users)
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit">{editingUser ? 'Update' : 'Create'}</Button>
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Full Name</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id} className="border-t">
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">{user.fullName}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${
                    user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {user.role !== 'developer' && (
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(user)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(user._id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
