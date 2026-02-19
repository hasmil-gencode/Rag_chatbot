import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Edit, Plus, RefreshCw, Gift, Calendar } from 'lucide-react';

export function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [managingGroup, setManagingGroup] = useState<any>(null);
  const [bonusAmount, setBonusAmount] = useState(5);
  const [newRenewDay, setNewRenewDay] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    storageLimitGB: 5,
    chatQuota: 0,
    quotaType: 'individual',
    renewDay: 1,
    organizationIds: [] as string[]
  });

  useEffect(() => {
    loadGroups();
    loadOrganizations();
  }, []);

  const loadGroups = async () => {
    try {
      const data = await api.getGroups();
      setGroups(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading groups:', error);
      setGroups([]);
    }
  };

  const loadOrganizations = async () => {
    try {
      const data = await api.getAllOrganizations();
      const orgs = data.organizations || data; // Handle both formats
      setOrganizations(Array.isArray(orgs) ? orgs : []);
    } catch (error) {
      console.error('Error loading organizations:', error);
      setOrganizations([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingGroup) {
      await api.updateGroup(editingGroup._id, formData);
    } else {
      await api.createGroup(formData);
    }
    setShowModal(false);
    setEditingGroup(null);
    setFormData({ name: '', storageLimitGB: 5, chatQuota: 0, quotaType: 'individual', renewDay: 1, organizationIds: [] });
    loadGroups();
  };

  const handleEdit = (group: any) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      storageLimitGB: group.storageLimitGB,
      chatQuota: group.chatQuota || 0,
      quotaType: group.quotaType || 'individual',
      renewDay: group.renewDay || 1,
      organizationIds: group.organizationIds || []
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this group? Organizations will be unassigned.')) {
      await api.deleteGroup(id);
      loadGroups();
    }
  };

  const handleManageQuota = (group: any) => {
    setManagingGroup(group);
    setNewRenewDay(group.renewDay || 1);
    setShowQuotaModal(true);
  };

  const handleResetQuota = async () => {
    if (confirm('Reset chat quota now? This will clear all usage for current month.')) {
      try {
        await api.resetGroupQuota(managingGroup._id);
        alert('Quota reset successfully!');
        setShowQuotaModal(false);
        loadGroups();
      } catch (error: any) {
        alert(error.message);
      }
    }
  };

  const handleAddBonus = async () => {
    if (bonusAmount <= 0) {
      alert('Bonus must be greater than 0');
      return;
    }
    try {
      await api.addGroupBonus(managingGroup._id, bonusAmount);
      alert(`Added ${bonusAmount} bonus chats!`);
      setShowQuotaModal(false);
      loadGroups();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleUpdateRenewDay = async () => {
    if (newRenewDay < 1 || newRenewDay > 31) {
      alert('Renew day must be between 1-31');
      return;
    }
    try {
      await api.updateGroupRenewDay(managingGroup._id, newRenewDay);
      alert(`Renew day updated to ${newRenewDay}!`);
      setShowQuotaModal(false);
      loadGroups();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const formatSize = (bytes: number) => {
    return (bytes / 1024 / 1024 / 1024).toFixed(2);
  };

  return (
    <div className="h-full overflow-y-auto"><div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Groups</h1>
        <Button onClick={() => { setShowModal(true); setEditingGroup(null); setFormData({ name: '', storageLimitGB: 5, chatQuota: 0, quotaType: 'individual', renewDay: 1, organizationIds: [] }); }}>
          <Plus className="w-4 h-4 mr-2" /> Create Group
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Groups</CardTitle>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No groups yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Storage Limit</th>
                    <th className="text-left p-2">Used</th>
                    <th className="text-left p-2">Organizations</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group._id} className="border-b">
                      <td className="p-2">{group.name}</td>
                      <td className="p-2">{group.storageLimitGB} GB</td>
                      <td className="p-2">
                        {formatSize(group.usedStorage || 0)} GB
                        <span className="text-xs text-muted-foreground ml-2">
                          ({((group.usedStorage || 0) / (group.storageLimitGB * 1024 * 1024 * 1024) * 100).toFixed(2)}%)
                        </span>
                      </td>
                      <td className="p-2 text-sm">{group.orgNames?.join(', ') || '-'}</td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          {group.chatQuota > 0 && (
                            <Button size="sm" variant="outline" onClick={() => handleManageQuota(group)} title="Manage Chat Quota">
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => handleEdit(group)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(group._id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>{editingGroup ? 'Edit Group' : 'Create Group'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Group Name</Label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Basic Plan"
                  />
                </div>
                <div>
                  <Label>Storage Limit (GB)</Label>
                  <Input
                    type="number"
                    required
                    min="1"
                    value={formData.storageLimitGB}
                    onChange={(e) => setFormData({ ...formData, storageLimitGB: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <Label>Chat Quota (0 = unlimited)</Label>
                  <Input
                    type="number"
                    required
                    min="0"
                    value={formData.chatQuota}
                    onChange={(e) => setFormData({ ...formData, chatQuota: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Quota Type</Label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="quotaType"
                        value="individual"
                        checked={formData.quotaType === 'individual'}
                        onChange={(e) => setFormData({ ...formData, quotaType: e.target.value })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Individual (per user)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="quotaType"
                        value="total"
                        checked={formData.quotaType === 'total'}
                        onChange={(e) => setFormData({ ...formData, quotaType: e.target.value })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Total (entire group)</span>
                    </label>
                  </div>
                </div>
                <div>
                  <Label>Renew Day (1-31)</Label>
                  <Input
                    type="number"
                    required
                    min="1"
                    max="31"
                    value={formData.renewDay}
                    onChange={(e) => setFormData({ ...formData, renewDay: parseInt(e.target.value) || 1 })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Day of month to reset chat quota</p>
                </div>
                <div>
                  <Label>Assign Organizations</Label>
                  {organizations.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">No organizations available</p>
                  ) : (
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
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="submit">{editingGroup ? 'Update' : 'Create'}</Button>
                  <Button type="button" variant="outline" onClick={() => { setShowModal(false); setEditingGroup(null); }}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {showQuotaModal && managingGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Manage Chat Quota - {managingGroup.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm"><strong>Current Quota:</strong> {managingGroup.chatQuota} chats</p>
                <p className="text-sm"><strong>Bonus Quota:</strong> {managingGroup.bonusQuota || 0} chats</p>
                <p className="text-sm"><strong>Total:</strong> {managingGroup.chatQuota + (managingGroup.bonusQuota || 0)} chats</p>
                <p className="text-sm"><strong>Renew Day:</strong> Day {managingGroup.renewDay} of month</p>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <RefreshCw className="w-4 h-4" />
                    Reset Quota Now
                  </Label>
                  <Button onClick={handleResetQuota} variant="outline" className="w-full">
                    Reset Current Month Usage
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">Clears all chat counts for this month</p>
                </div>

                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <Gift className="w-4 h-4" />
                    Add Bonus Quota
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      value={bonusAmount}
                      onChange={(e) => setBonusAmount(parseInt(e.target.value) || 1)}
                      placeholder="5"
                    />
                    <Button onClick={handleAddBonus}>Add</Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Temporary bonus, resets on renew day</p>
                </div>

                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4" />
                    Change Renew Day
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={newRenewDay}
                      onChange={(e) => setNewRenewDay(parseInt(e.target.value) || 1)}
                    />
                    <Button onClick={handleUpdateRenewDay}>Update</Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Day of month to auto-reset quota</p>
                </div>
              </div>

              <Button variant="outline" onClick={() => setShowQuotaModal(false)} className="w-full">
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </div>
  );
}
