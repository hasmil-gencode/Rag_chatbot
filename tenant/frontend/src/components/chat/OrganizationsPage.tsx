import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "./ConfirmDialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Trash2, Edit, Building2, X, Globe, Bot } from "lucide-react";

export const OrganizationsPage = () => {
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [formData, setFormData] = useState({ name: "", type: "department" as "organization" | "entity" | "department", parentId: null as string | null, publicEnabled: false, systemPrompt: "", mandatoryFields: [] as { name: string; description: string; alwaysRequired?: boolean; requiredFor?: string[] }[], broadFirstSearch: false, broadFirstSearchChunks: 40, roleMode: 'single' as string, routerModel: '' });
  const [showRolesModal, setShowRolesModal] = useState<any>(null); // org object
  const [roles, setRoles] = useState<any[]>([]);
  const [roleForm, setRoleForm] = useState<any>(null); // null = hidden, {} = new, {id} = edit
  const userRole = localStorage.getItem('userRole') || 'user';
  const isDeveloper = userRole === 'developer';
  const confirm = useConfirm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => { try { const data = await api.getAllOrganizations(); setOrganizations(data.organizations || []); } catch (e) { console.error(e); } };

  const handleEdit = (org: any) => { setEditingOrg(org); setFormData({ name: org.name, type: org.type, parentId: org.parentId, publicEnabled: org.publicEnabled || false, systemPrompt: org.systemPrompt || "", mandatoryFields: org.mandatoryFields || [], broadFirstSearch: org.broadFirstSearch || false, broadFirstSearchChunks: org.broadFirstSearchChunks || 40, roleMode: org.roleMode || 'single', routerModel: org.routerModel || '' }); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingOrg) await api.updateOrganization(editingOrg._id, formData.name, formData.type, formData.parentId, formData.publicEnabled, formData.systemPrompt, formData.mandatoryFields, formData.broadFirstSearch, formData.broadFirstSearchChunks, formData.roleMode, formData.routerModel);
      else await api.createOrganization(formData.name, formData.type, formData.parentId, formData.publicEnabled, formData.systemPrompt, formData.mandatoryFields, formData.broadFirstSearch, formData.broadFirstSearchChunks);
      setShowForm(false); setEditingOrg(null); setFormData({ name: "", type: "organization", parentId: null, publicEnabled: false, systemPrompt: "", mandatoryFields: [], broadFirstSearch: false, broadFirstSearchChunks: 40, roleMode: 'single', routerModel: '' }); loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const openRolesModal = async (org: any) => {
    setShowRolesModal(org);
    try { setRoles(await api.getAiRoles(org._id)); } catch { setRoles([]); }
  };

  const handleRoleSave = async () => {
    if (!showRolesModal || !roleForm) return;
    try {
      if (roleForm.id) await api.updateAiRole(showRolesModal._id, roleForm.id, roleForm);
      else await api.createAiRole(showRolesModal._id, roleForm);
      setRoles(await api.getAiRoles(showRolesModal._id));
      setRoleForm(null);
      toast.success('Role saved');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRoleDelete = async (roleId: string) => {
    if (!showRolesModal) return;
    if (await confirm('Delete this role?')) {
      await api.deleteAiRole(showRolesModal._id, roleId);
      setRoles(await api.getAiRoles(showRolesModal._id));
    }
  };

  const handleDelete = async (orgId: string) => { if (await confirm("Delete this organization?")) { try { await api.deleteOrganization(orgId); loadData(); } catch (e: any) { toast.error(e.message); } } };

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
              <td className="px-4 py-2.5 font-medium">{org.name}{org.publicEnabled && <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"><Globe className="w-3 h-3" />Public</span>}{org.roleMode === 'multi' && <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"><Bot className="w-3 h-3" />Multi-Role</span>}</td>
              <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{org.path?.join(' > ')}</td>
              {isDeveloper && (
                <td className="px-4 py-2.5 text-right">
                  <div className="flex gap-1 justify-end">
                    {org.type === 'organization' && org.roleMode === 'multi' && <button onClick={() => openRolesModal(org)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-purple-500" title="AI Roles"><Bot className="w-4 h-4" /></button>}
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
          <Button size="sm" onClick={() => { setShowForm(true); setEditingOrg(null); setFormData({ name: "", type: isDeveloper ? "organization" : "department", parentId: null, publicEnabled: false, systemPrompt: "", mandatoryFields: [], broadFirstSearch: false, broadFirstSearchChunks: 40, roleMode: 'single', routerModel: '' }); }} className="text-xs h-8 rounded-lg">
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
              {isDeveloper && formData.type === 'organization' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.publicEnabled} onChange={e => setFormData({ ...formData, publicEnabled: e.target.checked })} className="rounded" />
                  <span className="text-xs flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />Enable public access (embed widget for external visitors)</span>
                </label>
              )}
              {formData.type === 'organization' && (
                <>
                {formData.roleMode !== 'multi' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">AI System Prompt <span className="text-[10px] font-normal">(leave empty to use global default)</span></label>
                  <textarea value={formData.systemPrompt} onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })} rows={4} placeholder="Custom AI instructions for this organization..." className="w-full mt-1 px-3 py-2 text-xs border rounded-lg bg-background resize-none" />
                </div>
                )}
                {/* Mandatory Fields */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Mandatory Fields <span className="text-[10px] font-normal">(AI must collect before recommending)</span></label>
                    <button type="button" onClick={() => setFormData({ ...formData, mandatoryFields: [...formData.mandatoryFields, { name: '', description: '', requiredFor: ['find_plan'] }] })} className="text-[10px] text-blue-500 hover:underline">+ Add</button>
                  </div>
                  {formData.mandatoryFields.map((f, i) => (
                    <div key={i} className="flex gap-1.5 mt-1.5 items-center">
                      <input value={f.name} onChange={e => { const mf = [...formData.mandatoryFields]; mf[i] = { ...mf[i], name: e.target.value }; setFormData({ ...formData, mandatoryFields: mf }); }} placeholder="Field name" className="w-24 h-7 px-2 text-[11px] rounded border bg-transparent" />
                      <input value={f.description} onChange={e => { const mf = [...formData.mandatoryFields]; mf[i] = { ...mf[i], description: e.target.value }; setFormData({ ...formData, mandatoryFields: mf }); }} placeholder="Description" className="flex-1 h-7 px-2 text-[11px] rounded border bg-transparent" />
                      <input value={f.alwaysRequired ? 'always' : (f.requiredFor || []).join(',')} onChange={e => { const mf = [...formData.mandatoryFields]; const val = e.target.value.trim(); if (val === 'always') { mf[i] = { ...mf[i], alwaysRequired: true, requiredFor: undefined }; } else { mf[i] = { ...mf[i], alwaysRequired: false, requiredFor: val.split(',').map(s => s.trim()).filter(Boolean) }; } setFormData({ ...formData, mandatoryFields: mf }); }} placeholder="always or intent1,intent2" className="w-28 h-7 px-2 text-[10px] rounded border bg-transparent" />
                      <button type="button" onClick={() => setFormData({ ...formData, mandatoryFields: formData.mandatoryFields.filter((_, j) => j !== i) })} className="text-red-500 text-[10px]">✕</button>
                    </div>
                  ))}
                </div>
                {/* Broad First Search */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Broad First Search</p>
                    <p className="text-[10px] text-muted-foreground">AI studies all documents on first message for full product knowledge</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" value={formData.broadFirstSearchChunks} onChange={e => setFormData({ ...formData, broadFirstSearchChunks: parseInt(e.target.value) || 40 })} className="w-14 h-7 px-2 text-[11px] rounded border bg-transparent text-center" min={10} max={100} />
                    <button type="button" onClick={() => setFormData({ ...formData, broadFirstSearch: !formData.broadFirstSearch })}
                      className={`w-10 h-5 rounded-full transition-colors ${formData.broadFirstSearch ? 'bg-foreground' : 'bg-muted'}`}>
                      <div className={`w-4 h-4 rounded-full bg-background transition-transform mx-0.5 ${formData.broadFirstSearch ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
                {/* Role Mode */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Multi-Role Mode</p>
                    <p className="text-[10px] text-muted-foreground">Bot auto-routes to different AI roles based on user intent</p>
                  </div>
                  <button type="button" onClick={() => setFormData({ ...formData, roleMode: formData.roleMode === 'multi' ? 'single' : 'multi' })}
                    className={`w-10 h-5 rounded-full transition-colors ${formData.roleMode === 'multi' ? 'bg-purple-500' : 'bg-muted'}`}>
                    <div className={`w-4 h-4 rounded-full bg-background transition-transform mx-0.5 ${formData.roleMode === 'multi' ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {formData.roleMode === 'multi' && (
                  <div>
                    <label className="text-[11px] text-muted-foreground">Router Model <span className="text-[10px]">(fast model for intent classification)</span></label>
                    <input type="text" value={formData.routerModel} onChange={e => setFormData({ ...formData, routerModel: e.target.value })} placeholder="e.g. gemini-2.5-flash-lite" className="w-full h-8 px-3 mt-1 text-[12px] rounded-lg border bg-transparent" />
                  </div>
                )}
                </>
              )}
              <div className="flex gap-2 pt-2">
                <Button type="submit" size="sm" className="text-xs h-8 flex-1">{editingOrg ? 'Update' : 'Create'}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)} className="text-xs h-8">Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Roles Modal */}
      {showRolesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowRolesModal(null); setRoleForm(null); }}>
          <div className="bg-background rounded-xl p-5 w-full max-w-lg mx-4 border max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">AI Roles — {showRolesModal.name}</h2>
                <p className="text-[10px] text-muted-foreground">Bot auto-routes users to the matching role</p>
              </div>
              <button onClick={() => { setShowRolesModal(null); setRoleForm(null); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            {/* Role List */}
            {!roleForm && (
              <>
                <div className="space-y-2 mb-3">
                  {roles.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No roles yet. Add one to get started.</p>}
                  {roles.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                      <div>
                        <p className="text-xs font-medium">{r.name} {r.isDefault && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 ml-1">Default</span>}</p>
                        <p className="text-[10px] text-muted-foreground">{r.description || 'No description'}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setRoleForm({ ...r })} className="p-1 rounded hover:bg-muted"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleRoleDelete(r.id)} className="p-1 rounded hover:bg-muted text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button size="sm" onClick={() => setRoleForm({ name: '', description: '', systemPrompt: '', fileIds: [], isDefault: false })} className="text-xs h-7 w-full"><Plus className="w-3 h-3 mr-1" />Add Role</Button>
              </>
            )}

            {/* Role Form */}
            {roleForm && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-muted-foreground">Role Name</label>
                  <input value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="e.g. Customer Service" className="w-full h-8 px-3 mt-1 text-[12px] rounded-lg border bg-transparent" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Description <span className="text-[10px]">(used by router to classify intent)</span></label>
                  <input value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} placeholder="e.g. Handle complaints, feedback, issues" className="w-full h-8 px-3 mt-1 text-[12px] rounded-lg border bg-transparent" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">System Prompt</label>
                  <textarea value={roleForm.systemPrompt} onChange={e => setRoleForm({ ...roleForm, systemPrompt: e.target.value })} rows={5} placeholder="AI instructions for this role..." className="w-full mt-1 px-3 py-2 text-xs border rounded-lg bg-background resize-none" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={roleForm.isDefault} onChange={e => setRoleForm({ ...roleForm, isDefault: e.target.checked })} className="rounded" />
                  <span className="text-[11px]">Default role (fallback when intent is unclear)</span>
                </label>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleRoleSave} className="text-xs h-7 flex-1">Save Role</Button>
                  <Button size="sm" variant="outline" onClick={() => setRoleForm(null)} className="text-xs h-7">Back</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
