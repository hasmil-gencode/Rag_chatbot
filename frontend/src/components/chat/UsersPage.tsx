import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "./ConfirmDialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Trash2, Edit, KeyRound, X } from "lucide-react";

export const UsersPage = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [resetUserEmail, setResetUserEmail] = useState("");
  const [defaultPassword, setDefaultPassword] = useState("");
  const [formData, setFormData] = useState({ email: "", password: "", fullName: "", organizationIds: [] as string[], canUploadFiles: true, isAdmin: false });
  const userRole = localStorage.getItem('userRole') || 'user';
  const isDeveloper = userRole === 'developer';
  const confirm = useConfirm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [usersData, orgsData] = await Promise.all([api.getUsers(), api.getAllOrganizations()]);
      const orgs = orgsData.organizations || [];
      setOrganizations(orgs);
      const usersWithOrgs = await Promise.all(usersData.map(async (user: any) => {
        try {
          const assignments = await api.getUserAssignments(user._id);
          const orgIds = assignments.map((a: any) => a.organizationId);
          const orgNames = orgIds.map((id: string) => orgs.find((o: any) => o._id === id)?.name).filter(Boolean);
          return { ...user, organizationIds: orgIds, orgNames };
        }
        catch { return { ...user, organizationIds: [], orgNames: [] }; }
      }));
      setUsers(usersWithOrgs);
    } catch (e) { console.error(e); }
  };

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setFormData({ email: user.email, password: "", fullName: user.fullName, organizationIds: user.organizationIds || [], canUploadFiles: user.canUploadFiles !== false, isAdmin: user.role === 'admin' });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.updateUser(editingUser._id, formData.fullName, formData.password, formData.canUploadFiles);
        await api.assignUserToOrganizations(editingUser._id, formData.organizationIds);
      } else {
        const userData = await api.createUser(formData.email, formData.password, formData.fullName, formData.canUploadFiles, formData.isAdmin);
        if (formData.organizationIds.length > 0) await api.assignUserToOrganizations(userData.userId, formData.organizationIds);
      }
      setShowForm(false); setEditingUser(null); setFormData({ email: "", password: "", fullName: "", organizationIds: [], canUploadFiles: true, isAdmin: false }); loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (userId: string) => { if (await confirm("Delete this user?")) { try { await api.deleteUser(userId); loadData(); } catch (e: any) { toast.error(e.message); } } };
  const handleResetPassword = (userId: string, email: string) => { setResetUserId(userId); setResetUserEmail(email); setDefaultPassword(""); setShowResetPasswordModal(true); };

  const handleConfirmResetPassword = async () => {
    if (!defaultPassword || defaultPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    try { await api.resetUserPassword(resetUserId, defaultPassword); toast.success(`Password reset for ${resetUserEmail}`); setShowResetPasswordModal(false); }
    catch (e: any) { toast.error(e.message); }
  };

  const activeUsers = users.filter(u => u.status === 'active').length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">User Management</p>
            <h1 className="text-xl font-semibold">Users</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage user accounts and permissions.</p>
          </div>
          <Button size="sm" onClick={() => { setShowForm(true); setEditingUser(null); setFormData({ email: "", password: "", fullName: "", organizationIds: [], canUploadFiles: true, isAdmin: false }); }} className="text-xs h-8 rounded-lg">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create User
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Users</p>
            <p className="text-2xl font-semibold mt-0.5">{users.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Active</p>
            <p className="text-2xl font-semibold mt-0.5">{activeUsers}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Organizations</p>
            <p className="text-2xl font-semibold mt-0.5">{organizations.length}</p>
          </div>
        </div>

        {/* User Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Full Name</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Assigned To</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No users found</td></tr>
              ) : users.map((user) => (
                <tr key={user._id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">{user.email}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{user.fullName}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {user.orgNames?.length > 0 ? user.orgNames.map((name: string) => (
                        <span key={name} className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{name}</span>
                      )) : <span className="text-[11px] text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground capitalize">{user.role}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{user.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {user.role !== 'developer' && user.role !== 'admin' && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleResetPassword(user._id, user.email)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><KeyRound className="w-4 h-4" /></button>
                        <button onClick={() => handleEdit(user)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(user._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                    {isDeveloper && user.role !== 'developer' && user.role === 'admin' && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleResetPassword(user._id, user.email)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><KeyRound className="w-4 h-4" /></button>
                        <button onClick={() => handleEdit(user)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(user._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-md mx-4 border max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">{editingUser ? 'Edit User' : 'Create User'}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground">Email</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} disabled={!!editingUser} required
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Full Name</label>
                <input type="text" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} required
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Password {editingUser && '(leave empty to keep)'}</label>
                <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required={!editingUser}
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Assign to Organizations</label>
                <div className="border rounded-lg p-3 mt-1 max-h-40 overflow-y-auto space-y-1">
                  {organizations.map((org) => (
                    <label key={org._id} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted cursor-pointer">
                      <input type="checkbox" checked={formData.organizationIds.includes(org._id)}
                        onChange={(e) => setFormData({ ...formData, organizationIds: e.target.checked ? [...formData.organizationIds, org._id] : formData.organizationIds.filter(id => id !== org._id) })}
                        className="w-3.5 h-3.5 rounded" />
                      {org.name} <span className="text-[10px] text-muted-foreground">({org.type})</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={formData.canUploadFiles} onChange={(e) => setFormData({ ...formData, canUploadFiles: e.target.checked })} className="w-3.5 h-3.5 rounded" />
                Can upload files
              </label>
              {isDeveloper && !editingUser && (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={formData.isAdmin} onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })} className="w-3.5 h-3.5 rounded" />
                  Admin (can manage users & departments under their org)
                </label>
              )}
              <div className="flex gap-2 pt-2">
                <Button type="submit" size="sm" className="text-xs h-8 flex-1">{editingUser ? 'Update' : 'Create'}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)} className="text-xs h-8">Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowResetPasswordModal(false)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-sm mx-4 border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Reset Password</h2>
              <button onClick={() => setShowResetPasswordModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">User: <span className="text-foreground font-medium">{resetUserEmail}</span></p>
            <div className="mb-4">
              <label className="text-[11px] text-muted-foreground">Default Password</label>
              <input type="text" value={defaultPassword} onChange={(e) => setDefaultPassword(e.target.value)} placeholder="At least 8 characters" autoFocus
                className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleConfirmResetPassword} className="text-xs h-8 flex-1">Reset</Button>
              <Button size="sm" variant="outline" onClick={() => setShowResetPasswordModal(false)} className="text-xs h-8">Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
