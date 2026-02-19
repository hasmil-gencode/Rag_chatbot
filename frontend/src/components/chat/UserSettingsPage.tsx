import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { User, Building2, HardDrive, MessageSquare } from 'lucide-react';

interface UserSettings {
  fullName: string;
  email: string;
  hierarchy: string[];
  storageUsage?: {
    used: number;
    limit: number;
    percentage: number;
  };
  chatUsage?: {
    hasQuota: boolean;
    unlimited?: boolean;
    used?: number;
    limit?: number;
    percentage?: number;
    quotaType?: string;
    resetDate?: string;
    renewDay?: number;
  };
}

export function UserSettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [fullName, setFullName] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Get user info
      const userEmail = localStorage.getItem('userEmail') || '';
      
      // Get storage info
      const storageInfo = await api.getStorageInfo();
      
      // Get chat usage
      const chatUsage = await api.getChatUsage();
      
      // Get user's organizations for hierarchy
      const orgsResponse = await api.getMyOrganizations();
      const orgs = orgsResponse.organizations || [];
      
      // Build hierarchy from first org's path
      let hierarchy: string[] = [];
      if (orgs.length > 0 && orgs[0].path) {
        hierarchy = orgs[0].path;
      }
      
      setSettings({
        fullName: localStorage.getItem('userFullName') || userEmail.split('@')[0],
        email: userEmail,
        hierarchy,
        storageUsage: storageInfo.limit > 0 ? {
          used: storageInfo.used / (1024 * 1024 * 1024), // Convert to GB
          limit: storageInfo.limit,
          percentage: (storageInfo.used / (storageInfo.limit * 1024 * 1024 * 1024) * 100)
        } : undefined,
        chatUsage
      });
      
      setFullName(localStorage.getItem('userFullName') || userEmail.split('@')[0]);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSaveName = async () => {
    try {
      await api.updateUserName(fullName);
      localStorage.setItem('userFullName', fullName);
      setIsEditing(false);
      alert('Name updated successfully');
    } catch (error: any) {
      alert(error.message);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  if (!settings) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-6 max-w-4xl">
        <h1 className="text-2xl font-bold">User Settings</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={settings.email} disabled className="bg-muted" />
          </div>
          <div>
            <Label>Full Name</Label>
            <div className="flex gap-2">
              <Input 
                value={fullName} 
                onChange={(e) => setFullName(e.target.value)}
                disabled={!isEditing}
                className={!isEditing ? 'bg-muted' : ''}
              />
              {isEditing ? (
                <>
                  <Button onClick={handleSaveName}>Save</Button>
                  <Button variant="outline" onClick={() => { setIsEditing(false); setFullName(settings.fullName); }}>Cancel</Button>
                </>
              ) : (
                <Button onClick={() => setIsEditing(true)}>Edit</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hierarchy */}
      {settings.hierarchy.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Organization Hierarchy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm">
              {settings.hierarchy.map((org, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-muted rounded-md">{org}</span>
                  {index < settings.hierarchy.length - 1 && <span className="text-muted-foreground">→</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Storage Usage */}
      {settings.storageUsage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              File Storage Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{settings.storageUsage.used.toFixed(6)} GB / {settings.storageUsage.limit} GB</span>
                <span className="text-muted-foreground">({settings.storageUsage.percentage.toFixed(6)}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.max(Math.min(settings.storageUsage.percentage, 100), 1)}%`,
                    minWidth: '4px'
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chat Usage */}
      {settings.chatUsage?.hasQuota && !settings.chatUsage.unlimited && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Chat Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{settings.chatUsage.used} / {settings.chatUsage.limit} chats</span>
                  <span className="text-muted-foreground">({settings.chatUsage.percentage?.toFixed(6)}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${Math.max(Math.min(settings.chatUsage.percentage || 0, 100), 1)}%`,
                      minWidth: '4px'
                    }}
                  />
                </div>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Quota Type: <span className="font-medium text-foreground">{settings.chatUsage.quotaType === 'individual' ? 'Individual (per user)' : 'Total (entire group)'}</span></p>
                <p>Resets on: <span className="font-medium text-foreground">{formatDate(settings.chatUsage.resetDate || '')}</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {settings.chatUsage?.unlimited && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Chat Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Unlimited chats available</p>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
