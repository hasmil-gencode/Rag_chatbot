import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useConfirm } from './ConfirmDialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Trash2, Edit, Plus, RefreshCw, Gift, Calendar, X, Users } from 'lucide-react';

export function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [managingGroup, setManagingGroup] = useState<any>(null);
  const [bonusAmount, setBonusAmount] = useState(5);
  const [newRenewDay, setNewRenewDay] = useState(1);
  const [formData, setFormData] = useState({ name: '', storageLimitGB: 5, chatQuota: 0, quotaType: 'individual', renewDay: 1, departmentLimit: 0, organizationIds: [] as string[] });
  const confirm = useConfirm();

  useEffect(() => { loadGroups(); loadOrganizations(); }, []);

  const loadGroups = async () => { try { const data = await api.getGroups(); setGroups(Array.isArray(data) ? data : []); } catch (e) { console.error(e); setGroups([]); } };
  const loadOrganizations = async () => { try { const data = await api.getAllOrganizations(); setOrganizations(Array.isArray(data.organizations || data) ? (data.organizations || data) : []); } catch (e) { console.error(e); setOrganizations([]); } };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingGroup) await api.updateGroup(editingGroup._id, formData);
    else await api.createGroup(formData);
    setShowModal(false); setEditingGroup(null); setFormData({ name: '', storageLimitGB: 5, chatQuota: 0, quotaType: 'individual', renewDay: 1, departmentLimit: 0, organizationIds: [] }); loadGroups();
  };

  const handleEdit = (group: any) => {
    setEditingGroup(group);
    setFormData({ name: group.name, storageLimitGB: group.storageLimitGB, chatQuota: group.chatQuota || 0, quotaType: group.quotaType || 'individual', renewDay: group.renewDay || 1, departmentLimit: group.departmentLimit || 0, organizationIds: group.organizationIds || [] });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => { if (await confirm('Delete this package?')) { await api.deleteGroup(id); loadGroups(); } };
  const handleManageQuota = (group: any) => { setManagingGroup(group); setNewRenewDay(group.renewDay || 1); setShowQuotaModal(true); };

  const handleResetQuota = async () => {
    if (await confirm('Reset chat quota now?')) { try { await api.resetGroupQuota(managingGroup._id); toast.success('Quota reset!'); setShowQuotaModal(false); loadGroups(); } catch (e: any) { toast.error(e.message); } }
  };

  const handleAddBonus = async () => {
    if (bonusAmount <= 0) { toast.error('Bonus must be > 0'); return; }
    try { await api.addGroupBonus(managingGroup._id, bonusAmount); toast.success(`Added ${bonusAmount} bonus chats!`); setShowQuotaModal(false); loadGroups(); } catch (e: any) { toast.error(e.message); }
  };

  const handleUpdateRenewDay = async () => {
    if (newRenewDay < 1 || newRenewDay > 31) { toast.error('Day must be 1-31'); return; }
    try { await api.updateGroupRenewDay(managingGroup._id, newRenewDay); toast.success('Renew day updated!'); setShowQuotaModal(false); loadGroups(); } catch (e: any) { toast.error(e.message); }
  };

  const totalStorage = groups.reduce((sum, g) => sum + g.storageLimitGB, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Pricing</p>
            <h1 className="text-xl font-semibold">Packages</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage storage limits and chat quotas.</p>
          </div>
          <Button size="sm" onClick={() => { setShowModal(true); setEditingGroup(null); setFormData({ name: '', storageLimitGB: 5, chatQuota: 0, quotaType: 'individual', renewDay: 1, departmentLimit: 0, organizationIds: [] }); }} className="text-xs h-8 rounded-lg">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Package
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Packages</p>
            <p className="text-2xl font-semibold mt-0.5">{groups.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Storage Allocated</p>
            <p className="text-2xl font-semibold mt-0.5">{totalStorage} GB</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Nodes Assigned</p>
            <p className="text-2xl font-semibold mt-0.5">{groups.reduce((sum, g) => sum + (g.organizationIds?.length || 0), 0)}</p>
          </div>
        </div>

        {/* Groups Table */}
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b">
            <p className="text-xs font-medium flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> All Packages</p>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Storage</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Chat Quota</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Departments</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Assigned To</th>
                <th className="px-4 py-2.5 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No packages yet</td></tr>
              ) : groups.map((group) => (
                <tr key={group._id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{group.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{group.storageLimitGB} GB</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{group.chatQuota > 0 ? `${group.chatQuota} / ${group.quotaType || 'individual'}` : 'Unlimited'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{group.departmentLimit > 0 ? group.departmentLimit : 'Unlimited'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {group.orgNames?.length > 0 ? group.orgNames.slice(0, 2).map((name: string) => (
                        <span key={name} className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{name}</span>
                      )) : <span className="text-[11px] text-muted-foreground">—</span>}
                      {group.orgNames?.length > 2 && <span className="text-[10px] text-muted-foreground">+{group.orgNames.length - 2}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex gap-1 justify-end">
                      {group.chatQuota > 0 && <button onClick={() => handleManageQuota(group)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><RefreshCw className="w-4 h-4" /></button>}
                      <button onClick={() => handleEdit(group)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(group._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-md mx-4 border max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">{editingGroup ? 'Edit Package' : 'Create Package'}</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground">Package Name</label>
                <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required placeholder="e.g., Basic"
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Storage Limit (GB)</label>
                <input type="number" min="1" value={formData.storageLimitGB} onChange={(e) => setFormData({ ...formData, storageLimitGB: parseInt(e.target.value) || 1 })} required
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Chat Quota (0 = unlimited)</label>
                <input type="number" min="0" value={formData.chatQuota} onChange={(e) => setFormData({ ...formData, chatQuota: parseInt(e.target.value) || 0 })} required
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Quota Type</label>
                <div className="flex gap-4 mt-2">
                  {['individual', 'total'].map(type => (
                    <label key={type} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="radio" name="quotaType" value={type} checked={formData.quotaType === type} onChange={(e) => setFormData({ ...formData, quotaType: e.target.value })} className="w-3.5 h-3.5" />
                      {type === 'individual' ? 'Individual (per user)' : 'Total (entire plan)'}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Renew Day (1-31)</label>
                <input type="number" min="1" max="31" value={formData.renewDay} onChange={(e) => setFormData({ ...formData, renewDay: parseInt(e.target.value) || 1 })} required
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                <p className="text-[10px] text-muted-foreground mt-1">Day of month to reset chat quota</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Department Limit (0 = unlimited)</label>
                <input type="number" min="0" value={formData.departmentLimit} onChange={(e) => setFormData({ ...formData, departmentLimit: parseInt(e.target.value) || 0 })}
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                <p className="text-[10px] text-muted-foreground mt-1">Max departments per organization</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Assign To Organization / Department</label>
                <div className="border rounded-lg p-3 mt-1 max-h-40 overflow-y-auto space-y-1">
                  {organizations.length === 0 ? <p className="text-xs text-muted-foreground">No organizations</p> : organizations.map((org) => (
                    <label key={org._id} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted cursor-pointer">
                      <input type="checkbox" checked={formData.organizationIds.includes(org._id)}
                        onChange={(e) => setFormData({ ...formData, organizationIds: e.target.checked ? [...formData.organizationIds, org._id] : formData.organizationIds.filter(id => id !== org._id) })}
                        className="w-3.5 h-3.5 rounded" />
                      {org.name} <span className="text-[10px] text-muted-foreground">({org.type})</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" size="sm" className="text-xs h-8 flex-1">{editingGroup ? 'Update' : 'Create'}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowModal(false)} className="text-xs h-8">Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quota Management Modal */}
      {showQuotaModal && managingGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowQuotaModal(false)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-md mx-4 border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Manage Quota - {managingGroup.name}</h2>
              <button onClick={() => setShowQuotaModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 bg-muted rounded-lg mb-4 text-xs space-y-1">
              <p><span className="text-muted-foreground">Current Quota:</span> {managingGroup.chatQuota} chats</p>
              <p><span className="text-muted-foreground">Bonus Quota:</span> {managingGroup.bonusQuota || 0} chats</p>
              <p><span className="text-muted-foreground">Total:</span> {managingGroup.chatQuota + (managingGroup.bonusQuota || 0)} chats</p>
              <p><span className="text-muted-foreground">Renew Day:</span> Day {managingGroup.renewDay}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Reset Quota Now</label>
                <Button size="sm" variant="outline" onClick={handleResetQuota} className="w-full text-xs h-8 mt-1">Reset Current Month Usage</Button>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> Add Bonus Quota</label>
                <div className="flex gap-2 mt-1">
                  <input type="number" min="1" value={bonusAmount} onChange={(e) => setBonusAmount(parseInt(e.target.value) || 1)}
                    className="flex-1 h-8 px-3 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  <Button size="sm" onClick={handleAddBonus} className="text-xs h-8">Add</Button>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Change Renew Day</label>
                <div className="flex gap-2 mt-1">
                  <input type="number" min="1" max="31" value={newRenewDay} onChange={(e) => setNewRenewDay(parseInt(e.target.value) || 1)}
                    className="flex-1 h-8 px-3 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  <Button size="sm" onClick={handleUpdateRenewDay} className="text-xs h-8">Update</Button>
                </div>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowQuotaModal(false)} className="w-full text-xs h-8 mt-4">Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}
