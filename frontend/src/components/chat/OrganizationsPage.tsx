import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Plus, Trash2, Edit } from "lucide-react";

export const OrganizationsPage = () => {
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    type: "organization" as "organization" | "entity" | "department",
    parentId: null as string | null
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await api.getAllOrganizations();
      setOrganizations(data.organizations || []);
    } catch (error) {
      console.error("Failed to load organizations:", error);
    }
  };

  const handleEdit = (org: any) => {
    setEditingOrg(org);
    setFormData({
      name: org.name,
      type: org.type,
      parentId: org.parentId
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingOrg) {
        await api.updateOrganization(editingOrg._id, formData.name, formData.type, formData.parentId);
      } else {
        await api.createOrganization(formData.name, formData.type, formData.parentId);
      }
      setShowForm(false);
      setEditingOrg(null);
      setFormData({ name: "", type: "organization", parentId: null });
      loadData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingOrg(null);
    setFormData({ name: "", type: "organization", parentId: null });
  };

  const handleDelete = async (orgId: string) => {
    if (!confirm("Delete this organization? This will affect all users assigned to it.")) return;
    try {
      await api.deleteOrganization(orgId);
      loadData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  // Group by type for better display
  const orgsByType = {
    organization: organizations.filter(o => o.type === 'organization'),
    entity: organizations.filter(o => o.type === 'entity'),
    department: organizations.filter(o => o.type === 'department')
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Organizations</h1>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
          Create Organization
        </Button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 border rounded-lg bg-card">
          <h2 className="text-lg font-semibold mb-4">{editingOrg ? 'Edit Organization' : 'Create New Organization'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                disabled={!!editingOrg}
              >
                <option value="organization">Organization (Top Level)</option>
                <option value="entity">Entity (Mid Level)</option>
                <option value="department">Department (Bottom Level)</option>
              </select>
            </div>
            {formData.type !== 'organization' && (
              <div>
                <label className="block text-sm font-medium mb-1">Parent Organization</label>
                <select
                  value={formData.parentId || ''}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value || null })}
                  className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                  required
                >
                  <option value="">Select parent...</option>
                  {formData.type === 'entity' && orgsByType.organization.map((org) => (
                    <option key={org._id} value={org._id}>{org.name}</option>
                  ))}
                  {formData.type === 'department' && [...orgsByType.organization, ...orgsByType.entity].map((org) => (
                    <option key={org._id} value={org._id}>{org.name} ({org.type})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit">{editingOrg ? 'Update' : 'Create'}</Button>
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-6">
        {/* Organizations */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Organizations (Top Level)</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Path</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgsByType.organization.map((org) => (
                  <tr key={org._id} className="border-t">
                    <td className="px-4 py-3 font-medium">{org.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{org.path?.join(' > ')}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(org)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(org._id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Entities */}
        {orgsByType.entity.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Entities (Mid Level)</h2>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Path</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orgsByType.entity.map((org) => (
                    <tr key={org._id} className="border-t">
                      <td className="px-4 py-3">{org.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{org.path?.join(' > ')}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(org)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(org._id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Departments */}
        {orgsByType.department.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Departments (Bottom Level)</h2>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Path</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orgsByType.department.map((org) => (
                    <tr key={org._id} className="border-t">
                      <td className="px-4 py-3">{org.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{org.path?.join(' > ')}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(org)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(org._id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
