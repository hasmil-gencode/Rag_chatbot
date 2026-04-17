import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { User, Building2, MessageSquare, Pencil, Check, X } from 'lucide-react';

interface OrgItem { _id: string; name: string; type: string; parentId?: string; path?: string[] }

interface UserSettings {
  fullName: string;
  email: string;
  organizations: OrgItem[];
  storageUsage?: { used: number; limit: number; percentage: number };
  chatUsage?: { hasQuota: boolean; unlimited?: boolean; used?: number; limit?: number; percentage?: number; quotaType?: string; resetDate?: string; renewDay?: number };
}

export function UserSettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [fullName, setFullName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showSources, setShowSources] = useState(true);
  const [verboseMode, setVerboseMode] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const userInfo = await api.getUserInfo();
      const storageInfo = await api.getStorageInfo();
      const chatUsage = await api.getChatUsage();
      const orgsResponse = await api.getMyOrganizationsHierarchy();
      const orgs: OrgItem[] = orgsResponse.organizations || [];

      setSettings({
        fullName: userInfo.fullName || userInfo.email.split('@')[0],
        email: userInfo.email,
        organizations: orgs,
        storageUsage: storageInfo.limit > 0 ? {
          used: storageInfo.used / (1024 * 1024 * 1024),
          limit: storageInfo.limit,
          percentage: (storageInfo.used / (storageInfo.limit * 1024 * 1024 * 1024) * 100)
        } : undefined,
        chatUsage
      });
      setFullName(userInfo.fullName || userInfo.email.split('@')[0]);
      const prefs = await api.getUserPreferences();
      setShowSources(prefs.showSources !== false);
      setVerboseMode(prefs.verboseMode || false);
    } catch (error) { console.error('Failed to load settings:', error); }
  };

  const handleSaveName = async () => {
    try {
      await api.updateUserName(fullName);
      localStorage.setItem('userFullName', fullName);
      setIsEditing(false);
    } catch (error: any) { toast.error(error.message); }
  };

  if (!settings) return <div className="px-6 py-5 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Account</p>
          <h1 className="text-xl font-semibold">My Account</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage your profile, view usage and organization info.</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Role</p>
            <p className="text-lg font-semibold mt-0.5 capitalize">{localStorage.getItem('userRole') || 'user'}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Organization</p>
            <p className="text-lg font-semibold mt-0.5 truncate">{settings.organizations.find(o => !o.parentId)?.name || settings.organizations[0]?.name || '—'}</p>
          </div>
          {settings.storageUsage && (
            <div className="border rounded-lg px-4 py-3">
              <p className="text-[11px] text-muted-foreground">Storage</p>
              <p className="text-lg font-semibold mt-0.5">{(settings.storageUsage.used * 1024).toFixed(1)} MB</p>
              <div className="w-full bg-muted rounded-full h-1.5 mt-1.5">
                <div className="bg-foreground/50 h-1.5 rounded-full" style={{ width: `${Math.min(settings.storageUsage.percentage, 100)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{settings.storageUsage.percentage.toFixed(1)}% of {settings.storageUsage.limit} GB</p>
            </div>
          )}
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Chat Quota</p>
            {settings.chatUsage?.unlimited ? (
              <p className="text-lg font-semibold mt-0.5">Unlimited</p>
            ) : settings.chatUsage?.hasQuota ? (
              <>
                <p className="text-lg font-semibold mt-0.5">{settings.chatUsage.used} / {settings.chatUsage.limit}</p>
                <div className="w-full bg-muted rounded-full h-1.5 mt-1.5">
                  <div className="bg-foreground/50 h-1.5 rounded-full" style={{ width: `${Math.min(settings.chatUsage.percentage || 0, 100)}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{settings.chatUsage.quotaType === 'individual' ? 'Per user' : 'Group total'}</p>
              </>
            ) : (
              <p className="text-lg font-semibold mt-0.5">Unlimited</p>
            )}
          </div>
        </div>

        {/* Profile section */}
        <div className="border rounded-lg overflow-hidden mb-5">
          <div className="px-4 py-2.5 border-b">
            <p className="text-xs font-medium flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Profile</p>
          </div>
          <div className="divide-y">
            <div className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-[11px] text-muted-foreground">Email</p>
                <p className="text-[13px]">{settings.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex-1">
                <p className="text-[11px] text-muted-foreground">Full Name</p>
                {isEditing ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                      className="h-7 px-2 text-[13px] rounded border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring flex-1" autoFocus />
                    <button onClick={handleSaveName} className="p-1 rounded hover:bg-muted text-green-500"><Check className="w-4 h-4" /></button>
                    <button onClick={() => { setIsEditing(false); setFullName(settings.fullName); }} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <p className="text-[13px]">{settings.fullName}</p>
                )}
              </div>
              {!isEditing && (
                <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Organization Hierarchy */}
        {settings.organizations.length > 0 && (
          <div className="border rounded-lg overflow-hidden mb-5">
            <div className="px-4 py-2.5 border-b">
              <p className="text-xs font-medium flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Organization Hierarchy</p>
            </div>
            <div className="px-4 py-3">
              {(() => {
                const roots = settings.organizations.filter(o => !o.parentId);
                const getChildren = (pid: string) => settings.organizations.filter(o => o.parentId === pid);
                return roots.map(root => (
                  <div key={root._id}>
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      <span className="px-2.5 py-1 bg-muted rounded-md text-xs">{root.name}</span>
                      <span className="text-[10px] text-muted-foreground">{root.type}</span>
                    </div>
                    {getChildren(root._id).length > 0 && (
                      <div className="ml-4 mt-1.5 space-y-1 border-l pl-3">
                        {getChildren(root._id).map(child => (
                          <div key={child._id}>
                            <div className="flex items-center gap-2 text-[13px]">
                              <span className="px-2.5 py-1 bg-muted rounded-md text-xs">{child.name}</span>
                              <span className="text-[10px] text-muted-foreground">{child.type}</span>
                            </div>
                            {getChildren(child._id).length > 0 && (
                              <div className="ml-4 mt-1 space-y-1 border-l pl-3">
                                {getChildren(child._id).map(sub => (
                                  <div key={sub._id} className="flex items-center gap-2 text-[13px]">
                                    <span className="px-2.5 py-1 bg-muted rounded-md text-xs">{sub.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{sub.type}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Chat Preferences */}
        <div className="border rounded-lg overflow-hidden mb-5">
          <div className="px-4 py-2.5 border-b">
            <p className="text-xs font-medium flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Chat Preferences</p>
          </div>
          <div className="divide-y">
            <div className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-[11px] text-muted-foreground">Show Source Citations</p>
                <p className="text-[10px] text-muted-foreground/60">Display document sources referenced in AI responses</p>
              </div>
              <button onClick={async () => { const v = !showSources; setShowSources(v); await api.updateUserPreferences({ showSources: v }); }}
                className={`w-10 h-5 rounded-full transition-colors ${showSources ? 'bg-foreground' : 'bg-muted'}`}>
                <div className={`w-4 h-4 rounded-full bg-background transition-transform mx-0.5 ${showSources ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-[11px] text-muted-foreground">Verbose Mode</p>
                <p className="text-[10px] text-muted-foreground/60">Show response time for each AI reply</p>
              </div>
              <button onClick={async () => { const v = !verboseMode; setVerboseMode(v); await api.updateUserPreferences({ verboseMode: v }); }}
                className={`w-10 h-5 rounded-full transition-colors ${verboseMode ? 'bg-foreground' : 'bg-muted'}`}>
                <div className={`w-4 h-4 rounded-full bg-background transition-transform mx-0.5 ${verboseMode ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Chat Usage Details */}
        {settings.chatUsage?.hasQuota && !settings.chatUsage.unlimited && (
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b">
              <p className="text-xs font-medium flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Chat Usage Details</p>
            </div>
            <div className="divide-y">
              <div className="flex items-center justify-between px-4 py-2.5">
                <p className="text-[11px] text-muted-foreground">Quota Type</p>
                <p className="text-[13px]">{settings.chatUsage.quotaType === 'individual' ? 'Individual (per user)' : 'Total (entire group)'}</p>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <p className="text-[11px] text-muted-foreground">Used</p>
                <p className="text-[13px]">{settings.chatUsage.used} / {settings.chatUsage.limit} chats</p>
              </div>
              {settings.chatUsage.resetDate && (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-[11px] text-muted-foreground">Resets on</p>
                  <p className="text-[13px]">{new Date(settings.chatUsage.resetDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
