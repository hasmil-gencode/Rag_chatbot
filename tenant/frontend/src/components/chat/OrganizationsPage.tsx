import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "./ConfirmDialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Trash2, Edit, Building2, X, Globe, Bot, ChevronRight, Layers, Package as PackageIcon, UserPlus, Users } from "lucide-react";

export const OrganizationsPage = () => {
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [gatewayPackages, setGatewayPackages] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [formData, setFormData] = useState({ name: "", type: "department" as "organization" | "entity" | "department", parentId: null as string | null, publicEnabled: false, systemPrompt: "", mandatoryFields: [] as { name: string; description: string; alwaysRequired?: boolean; requiredFor?: string[] }[], broadFirstSearch: false, broadFirstSearchChunks: 40, roleMode: 'single' as string, routerModel: '', managerName: "", managerEmail: "", managerPassword: "" });
  const [showRolesModal, setShowRolesModal] = useState<any>(null); // org object
  const [roles, setRoles] = useState<any[]>([]);
  const [roleForm, setRoleForm] = useState<any>(null); // null = hidden, {} = new, {id} = edit
  const [addManagerFor, setAddManagerFor] = useState<any>(null); // department org to add a manager to
  const [mgrForm, setMgrForm] = useState({ name: '', email: '', password: '' });
  const [members, setMembers] = useState<Record<string, any[]>>({}); // orgId -> [{id, fullName, email, role}]
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const userRole = localStorage.getItem('userRole') || 'user';
  const isDeveloper = userRole === 'developer';
  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';
  const confirm = useConfirm();
  const toggleNode = (id: string) => setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  const roleBadgeClass = (role: string) => role === 'manager'
    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
    : role === 'admin' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-muted text-muted-foreground';

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const orgReq = isDeveloper ? api.getAllOrganizations() : api.getMySubtreeOrganizations();
      const [orgData, groupData, memberData] = await Promise.all([
        orgReq,
        isDeveloper ? api.getGroups().catch(() => []) : Promise.resolve([]),
        api.getOrganizationMembers().catch(() => ({ members: {} })),
      ]);
      const gatewayPackageData = isDeveloper
        ? await api.getGatewayPackageTemplates().catch(() => [])
        : [];
      setOrganizations(orgData.organizations || []);
      setGroups(Array.isArray(groupData) ? groupData : []);
      setGatewayPackages(Array.isArray(gatewayPackageData) ? gatewayPackageData : []);
      setMembers(memberData.members || {});
    } catch (e) {
      console.error(e);
    }
  };

  const handleEdit = (org: any) => { setEditingOrg(org); setFormData({ name: org.name, type: org.type, parentId: org.parentId, publicEnabled: org.publicEnabled || false, systemPrompt: org.systemPrompt || "", mandatoryFields: org.mandatoryFields || [], broadFirstSearch: org.broadFirstSearch || false, broadFirstSearchChunks: org.broadFirstSearchChunks || 40, roleMode: org.roleMode || 'single', routerModel: org.routerModel || '', managerName: "", managerEmail: "", managerPassword: "" }); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingOrg) {
        await api.updateOrganization(editingOrg._id, formData.name, formData.type, formData.parentId, formData.publicEnabled, formData.systemPrompt, formData.mandatoryFields, formData.broadFirstSearch, formData.broadFirstSearchChunks, formData.roleMode, formData.routerModel);
      } else if (!isDeveloper) {
        // Admin creates a department together with its manager in one call.
        if (!formData.parentId) { toast.error('Please select a parent organization'); return; }
        if (!formData.managerName || !formData.managerEmail || !formData.managerPassword) { toast.error('Manager name, email and password are required'); return; }
        await api.createDepartmentWithManager(formData.name, formData.parentId, { name: formData.managerName, email: formData.managerEmail, password: formData.managerPassword }, formData.systemPrompt);
      } else {
        await api.createOrganization(formData.name, formData.type, formData.parentId, formData.publicEnabled, formData.systemPrompt, formData.mandatoryFields, formData.broadFirstSearch, formData.broadFirstSearchChunks);
      }
      setShowForm(false); setEditingOrg(null); setFormData({ name: "", type: "organization", parentId: null, publicEnabled: false, systemPrompt: "", mandatoryFields: [], broadFirstSearch: false, broadFirstSearchChunks: 40, roleMode: 'single', routerModel: '', managerName: "", managerEmail: "", managerPassword: "" }); loadData();
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

  const handleAddManager = async () => {
    if (!addManagerFor) return;
    if (!mgrForm.name || !mgrForm.email || !mgrForm.password) { toast.error('Manager name, email and password are required'); return; }
    try {
      await api.addManagerToOrg(addManagerFor._id, mgrForm);
      toast.success('Manager added');
      setAddManagerFor(null); setMgrForm({ name: '', email: '', password: '' });
    } catch (e: any) { toast.error(e.message); }
  };

  const handlePackageChange = async (orgId: string, groupId: string) => {
    try {
      if (groupId.startsWith('gateway:')) {
        const gatewayPackageId = groupId.replace('gateway:', '');
        const result = await api.assignGatewayPackage(orgId, gatewayPackageId);
        const localGroupId = normalizeId(result.groupId || result.group?._id);
        if (result.group) {
          setGroups(prev => {
            const existingIndex = prev.findIndex(group => normalizeId(group._id) === normalizeId(result.group._id));
            if (existingIndex >= 0) {
              const next = [...prev];
              next[existingIndex] = result.group;
              return next;
            }
            return [...prev, result.group];
          });
        }
        setOrganizations(prev => prev.map(org => normalizeId(org._id) === orgId ? { ...org, groupId: localGroupId || null } : org));
        toast.success('Gateway package imported and assigned');
        await loadData();
      } else {
        await api.updateOrganizationPackage(orgId, groupId || null);
        setOrganizations(prev => prev.map(org => normalizeId(org._id) === orgId ? { ...org, groupId: groupId || null } : org));
        toast.success(groupId ? 'Package updated' : 'Package removed');
        await loadData();
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to update package');
    }
  };

  const normalizeId = (value: any) => value?._id?.toString?.() || value?.toString?.() || value || '';

  const groupById = useMemo(() => {
    const map: Record<string, any> = {};
    groups.forEach((group) => {
      map[normalizeId(group._id)] = group;
    });
    return map;
  }, [groups]);

  const packageSignature = (group: any) => [
    (group.name || '').trim().toLowerCase(),
    group.storageLimitGB ?? '',
    group.chatQuota ?? 0,
    group.quotaType || 'individual',
    group.renewDay || 1,
    group.departmentLimit || 0,
  ].join('|');

  const getPackageOptions = (selectedGroupId: string) => {
    const seen = new Set<string>();
    const options: any[] = [];
    const selected = selectedGroupId ? groupById[selectedGroupId] : null;
    const localGatewaySourceIds = new Set(groups.map((group) => String(group.sourcePackageId || '')).filter(Boolean));
    if (selected) {
      options.push({ value: normalizeId(selected._id), label: selected.name, source: 'tenant', item: selected });
      seen.add(packageSignature(selected));
    }
    groups.forEach((group) => {
      const signature = packageSignature(group);
      if (seen.has(signature)) return;
      seen.add(signature);
      options.push({ value: normalizeId(group._id), label: group.name, source: 'tenant', item: group });
    });
    gatewayPackages.forEach((pkg) => {
      const gatewayPackageId = String(pkg.gatewayPackageId || pkg._id || '');
      if (!gatewayPackageId || localGatewaySourceIds.has(gatewayPackageId)) return;
      const signature = packageSignature(pkg);
      if (seen.has(signature)) return;
      seen.add(signature);
      options.push({
        value: `gateway:${gatewayPackageId}`,
        label: `${pkg.name} (Gateway)`,
        source: 'gateway',
        item: pkg,
      });
    });
    return options;
  };

  const getChildren = (parentId: string) => organizations
    .filter((org) => normalizeId(org.parentId) === parentId)
    .sort((a, b) => {
      const typeOrder: Record<string, number> = { organization: 0, entity: 1, department: 2 };
      return (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || a.name.localeCompare(b.name);
    });

  const hierarchyRoots = useMemo(() => {
    const idSet = new Set(organizations.map((org) => normalizeId(org._id)));
    return organizations
      .filter((org) => !org.parentId || !idSet.has(normalizeId(org.parentId)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [organizations]);

  const typeBadgeClass = (type: string) => {
    if (type === 'organization') return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    if (type === 'entity') return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  };

  const renderHierarchyNode = (org: any, depth = 0) => {
    const children = getChildren(org._id.toString());
    const selectedGroupId = normalizeId(org.groupId);
    const group = groupById[selectedGroupId];
    const effectiveGroupId = normalizeId(org.effectiveGroupId);
    const effectiveGroup = effectiveGroupId ? groupById[effectiveGroupId] || { name: org.effectiveGroupName } : null;
    const packageLabel = group?.name || effectiveGroup?.name || '';
    const nodeMembers = members[org._id.toString()] || [];
    const isExpanded = !!expandedNodes[org._id.toString()];
    const canEditNode = isDeveloper || (isAdmin && !!org.parentId); // admin cannot edit/delete their own root org
    const canAddManager = isDeveloper || isAdmin;

    return (
      <div key={org._id} className="relative">
        {depth > 0 && <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />}
        <div className="flex items-center gap-2 py-2.5 pr-3 hover:bg-muted/30 transition-colors" style={{ paddingLeft: `${depth * 24 + 12}px` }}>
          <div className="flex items-center justify-center w-5 h-5 text-muted-foreground">
            {children.length > 0 ? <ChevronRight className="w-3.5 h-3.5 rotate-90" /> : <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />}
          </div>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg border bg-background">
            {org.type === 'organization' ? <Building2 className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">{org.name}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${typeBadgeClass(org.type)}`}>{org.type}</span>
              <button
                onClick={() => toggleNode(org._id.toString())}
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${nodeMembers.length > 0 ? 'bg-muted hover:bg-muted/70 text-foreground' : 'bg-muted/40 text-muted-foreground'}`}
                title="Show users & managers"
              >
                <Users className="w-3 h-3" /> {nodeMembers.length}
                {nodeMembers.length > 0 && <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />}
              </button>
              {packageLabel && (
                <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${group ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground'}`}>
                  <PackageIcon className="w-3 h-3" /> {packageLabel}{!group && org.packageInherited ? ` inherited from ${org.packageOwnerOrgName || 'parent'}` : ''}
                </span>
              )}
              {org.publicEnabled && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"><Globe className="w-3 h-3" />Public</span>}
              {org.roleMode === 'multi' && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"><Bot className="w-3 h-3" />Multi-Role</span>}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{org.path?.join(' > ') || org.name}</p>
          </div>
          {isDeveloper && (
              <select
              value={selectedGroupId}
              onChange={(e) => handlePackageChange(normalizeId(org._id), e.target.value)}
              className="h-8 w-36 rounded-md border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              title="Assign package"
            >
              <option value="">{org.parentId ? 'Inherit package' : 'No package'}</option>
              {getPackageOptions(selectedGroupId).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          )}
          <div className="flex gap-1">
            {isDeveloper && org.type === 'organization' && org.roleMode === 'multi' && <button onClick={() => openRolesModal(org)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-purple-500" title="AI Roles"><Bot className="w-4 h-4" /></button>}
            {canAddManager && <button onClick={() => { setAddManagerFor(org); setMgrForm({ name: '', email: '', password: '' }); }} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Add manager"><UserPlus className="w-4 h-4" /></button>}
            {canEditNode && <button onClick={() => handleEdit(org)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit"><Edit className="w-4 h-4" /></button>}
            {canEditNode && <button onClick={() => handleDelete(org._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="w-4 h-4" /></button>}
          </div>
        </div>
        {isExpanded && (
          <div className="pb-1" style={{ paddingLeft: `${depth * 24 + 52}px` }}>
            {nodeMembers.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-1">No users assigned to this node</p>
            ) : nodeMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                <span className="text-[12px] font-medium truncate">{m.fullName}</span>
                <span className="text-[11px] text-muted-foreground truncate">{m.email}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full capitalize ${roleBadgeClass(m.role)}`}>{m.role}</span>
              </div>
            ))}
          </div>
        )}
        {children.length > 0 && (
          <div>
            {children.map((child) => renderHierarchyNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const orgsByType = {
    organization: organizations.filter(o => o.type === 'organization'),
    entity: organizations.filter(o => o.type === 'entity'),
    department: organizations.filter(o => o.type === 'department')
  };

  // Get admin's org name
  const adminOrgName = !isDeveloper && orgsByType.organization.length > 0 ? orgsByType.organization[0].name : '';

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">{isDeveloper ? 'Structure' : adminOrgName || (isManager ? 'Department' : 'Organization')}</p>
            <h1 className="text-xl font-semibold">{isDeveloper ? 'Organizations' : isManager ? 'My Department' : 'Departments'}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{isDeveloper ? 'Manage organizational hierarchy.' : isManager ? 'View users and managers in your department.' : 'Manage departments, managers and members under your organization.'}</p>
          </div>
          {(isDeveloper || isAdmin) && (
            <Button size="sm" onClick={() => { setShowForm(true); setEditingOrg(null); setFormData({ name: "", type: isDeveloper ? "organization" : "department", parentId: null, publicEnabled: false, systemPrompt: "", mandatoryFields: [], broadFirstSearch: false, broadFirstSearchChunks: 40, roleMode: 'single', routerModel: '', managerName: "", managerEmail: "", managerPassword: "" }); }} className="text-xs h-8 rounded-lg">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> {isDeveloper ? 'Create' : 'Add Department'}
            </Button>
          )}
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

        {/* Hierarchy tree with expandable members — all roles */}
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div>
              <p className="text-xs font-medium flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {isDeveloper ? 'Organization Hierarchy' : 'Structure & Members'}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{isDeveloper ? 'Packages can be assigned directly or inherited from a parent node.' : 'Click the people badge on a node to see its users and managers.'}</p>
            </div>
            <div className="text-[11px] text-muted-foreground">{organizations.length} node{organizations.length === 1 ? '' : 's'}</div>
          </div>
          {hierarchyRoots.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing to show yet</p>
          ) : (
            <div className="divide-y">
              {hierarchyRoots.map((org) => renderHierarchyNode(org))}
            </div>
          )}
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
              {!isDeveloper && !editingOrg && (
                <div className="space-y-3 border-t pt-3">
                  <p className="text-[11px] font-medium text-muted-foreground">Department Manager</p>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Manager Full Name</label>
                    <input type="text" value={formData.managerName} onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="e.g., Ahmad" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Manager Email</label>
                    <input type="email" value={formData.managerEmail} onChange={(e) => setFormData({ ...formData, managerEmail: e.target.value })}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="manager@client.com" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Manager Password</label>
                    <input type="password" value={formData.managerPassword} onChange={(e) => setFormData({ ...formData, managerPassword: e.target.value })}
                      className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Min 8 chars, upper/lower/number" />
                  </div>
                  <p className="text-[10px] text-muted-foreground">The manager manages users and views chats within this department, and must change this password on first login.</p>
                </div>
              )}
              {!isDeveloper && !editingOrg && (
                <div>
                  <label className="text-[11px] text-muted-foreground">AI Instructions <span className="text-[10px]">(optional — how this department's bot behaves; identity is auto-set)</span></label>
                  <textarea value={formData.systemPrompt} onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })} rows={3} placeholder="e.g. Handle sales enquiries, quote prices, escalate complaints to the manager." className="w-full mt-1 px-3 py-2 text-xs border rounded-lg bg-background resize-none" />
                </div>
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

      {/* Add Manager Modal */}
      {addManagerFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setAddManagerFor(null)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-sm mx-4 border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Add Manager — {addManagerFor.name}</h2>
              <button onClick={() => setAddManagerFor(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground">Manager Full Name</label>
                <input type="text" value={mgrForm.name} onChange={e => setMgrForm({ ...mgrForm, name: e.target.value })} className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="e.g., Ahmad" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Manager Email</label>
                <input type="email" value={mgrForm.email} onChange={e => setMgrForm({ ...mgrForm, email: e.target.value })} className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="manager@client.com" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Manager Password</label>
                <input type="password" value={mgrForm.password} onChange={e => setMgrForm({ ...mgrForm, password: e.target.value })} className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Min 8 chars, upper/lower/number" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleAddManager} className="text-xs h-8 flex-1">Add Manager</Button>
                <Button size="sm" variant="outline" onClick={() => setAddManagerFor(null)} className="text-xs h-8">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
