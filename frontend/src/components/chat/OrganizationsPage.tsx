import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Plus, Trash2, Edit, Building2, X } from "lucide-react";

export const OrganizationsPage = () => {
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [formData, setFormData] = useState({ name: "", type: "department" as "organization" | "entity" | "department", parentId: null as string | null });
  const userRole = localStorage.getItem('userRole') || 'user';
  const isDeveloper = userRole === 'developer';

  useEffect(() => { loadData(); }, []);

  const loadData = async () => { try { const data = await api.getAllOrganizations(); setOrganizations(data.organizations || []); } catch (e) { console.error(e); } };

  const handleEdit = (org: any) => { setEditingOrg(org); setFormData({ name: org.name, type: org.type, parentId: org.parentId }); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingOrg) await api.updateOrganization(editingOrg._id, formData.name, formData.type, formData.parentId);
      else await api.createOrganization(formData.name, formData.type, formData.parentId);
      setShowForm(false); setEditingOrg(null); setFormData({ name: "", type: "organization", parentId: null }); loadData();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (orgId: string) => { if (confirm("Delete this organization?")) { try { await api.deleteOrganization(orgId); loadData(); } catch (e: any) { alert(e.message); } } };

  const orgsByType = {
    organization: organizations.filter(o => o.type === 'organization'),
    entity: organizations.filter(o => o.type === 'entity'),
    department: organizations.filter(o => o.type === 'department')
  };

  const renderTable = (title: string, orgs: any[], typeLabel: string) => (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b">
        <p className="text-xs font-medium flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {title}</p>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b">
            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Path</th>
            {isDeveloper && <th className="px-4 py-2.5 w-20"></th>}
          </tr>
        </thead>
        <tbody>
          {orgs.length === 0 ? (
            <tr><td colSpan={isDeveloper ? 3 : 2} className="px-4 py-8 text-center text-sm text-muted-foreground">No {typeLabel.toLowerCase()}s</td></tr>
          ) : orgs.map((org) => (
            <tr key={org._id} className="border-t hover:bg-muted/30 transition-colors">
              <td className="px-4 py-2.5 font-medium">{org.name}</td>
              <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{org.path?.join(' > ')}</td>
              {isDeveloper && (
                <td className="px-4 py-2.5 text-right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => handleEdit(org)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(org._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Get admin's org name
  const adminOrgName = !isDeveloper && orgsByType.organization.length > 0 ? orgsByType.organization[0].name : '';

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">{isDeveloper ? 'Structure' : adminOrgName}</p>
            <h1 className="text-xl font-semibold">{isDeveloper ? 'Organizations' : 'Departments'}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{isDeveloper ? 'Manage organizational hierarchy.' : 'Manage departments under your organization.'}</p>
          </div>
          <Button size="sm" onClick={() => { setShowForm(true); setEditingOrg(null); setFormData({ name: "", type: isDeveloper ? "organization" : "department", parentId: null }); }} className="text-xs h-8 rounded-lg">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> {isDeveloper ? 'Create' : 'Add Department'}
          </Button>
        </div>

        {/* Stats - Developer only */}
        {isDeveloper && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="border rounded-lg px-4 py-3">
              <p className="text-[11px] text-muted-foreground">Organizations</p>
              <p className="text-2xl font-semibold mt-0.5">{orgsByType.organization.length}</p>
            </div>
            <div className="border rounded-lg px-4 py-3">
              <p className="text-[11px] text-muted-foreground">Entities</p>
              <p className="text-2xl font-semibold mt-0.5">{orgsByType.entity.length}</p>
            </div>
            <div className="border rounded-lg px-4 py-3">
              <p className="text-[11px] text-muted-foreground">Departments</p>
              <p className="text-2xl font-semibold mt-0.5">{orgsByType.department.length}</p>
            </div>
          </div>
        )}

        {/* Tables */}
        <div className="space-y-5">
          {isDeveloper && renderTable('Organizations (Top Level)', orgsByType.organization, 'Organization')}
          {isDeveloper && orgsByType.entity.length > 0 && renderTable('Entities (Mid Level)', orgsByType.entity, 'Entity')}
          {orgsByType.department.length > 0 && renderTable('Departments', orgsByType.department, 'Department')}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-md mx-4 border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">{editingOrg ? 'Edit' : isDeveloper ? 'Create Organization' : 'Add Department'}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground">Name</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              {isDeveloper && (
                <div>
                  <label className="text-[11px] text-muted-foreground">Type</label>
                  <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as any })} disabled={!!editingOrg}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50">
                    <option value="organization">Organization (Top Level)</option>
                    <option value="entity">Entity (Mid Level)</option>
                    <option value="department">Department (Bottom Level)</option>
                  </select>
                </div>
              )}
              {(formData.type !== 'organization' || !isDeveloper) && (
                <div>
                  <label className="text-[11px] text-muted-foreground">Parent</label>
                  <select value={formData.parentId || ''} onChange={(e) => setFormData({ ...formData, parentId: e.target.value || null })} required
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="">Select parent...</option>
                    {formData.type === 'entity' && orgsByType.organization.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
                    {formData.type === 'department' && [...orgsByType.organization, ...orgsByType.entity].map((org) => <option key={org._id} value={org._id}>{org.name} ({org.type})</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button type="submit" size="sm" className="text-xs h-8 flex-1">{editingOrg ? 'Update' : 'Create'}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)} className="text-xs h-8">Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
