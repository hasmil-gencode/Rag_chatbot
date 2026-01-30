import { Plus, MessageSquare, Settings, FolderOpen, LogOut, Trash2, Shield, Users, Building2, Users as UsersIcon, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ChatSession {
  id: string;
  title: string;
  date: string;
  isActive?: boolean;
  startedBy?: string;
  startedByEmail?: string;
}

interface ChatSidebarProps {
  sessions: ChatSession[];
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  currentPage: "chat" | "files" | "settings" | "roles" | "users" | "organizations" | "departments" | "deleted-chats" | "forms" | "download-tracking";
  onNavigate: (page: "chat" | "files" | "settings" | "roles" | "users" | "organizations" | "departments" | "deleted-chats" | "forms" | "download-tracking") => void;
  onLogout: () => void;
  userEmail: string;
  userRole: string;
  userOrganization: string;
  userPermissions?: string[];
}

export const ChatSidebar = ({
  sessions,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  currentPage,
  onNavigate,
  onLogout,
  userEmail,
  userRole,
  userOrganization: _userOrganization,
  userPermissions = [],
}: ChatSidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isDeveloper = userRole.toLowerCase() === 'developer';
  const canManageUsers = userPermissions.includes('user:manage') || isDeveloper;
  const canManageDepts = userPermissions.includes('dept:manage') || isDeveloper;
  const canManageOrgs = userPermissions.includes('org:manage') || isDeveloper;
  const canManageRoles = userPermissions.includes('role:manage') || isDeveloper;
  const canManageSettings = userPermissions.includes('setup:manage') || isDeveloper;
  const canAccessFiles = userPermissions.includes('file:manage_access') || userPermissions.includes('file:upload') || isDeveloper;
  
  // Role-based navigation access
  const navItems = [
    { id: "chat" as const, label: "Chat", icon: MessageSquare },
    ...(canAccessFiles ? [{ id: "files" as const, label: "Files", icon: FolderOpen }] : []),
    { id: "forms" as const, label: "Forms", icon: FileText }, // Everyone can access forms
    ...(canManageOrgs ? [{ id: "organizations" as const, label: "Organizations", icon: Building2 }] : []),
    ...(canManageDepts ? [{ id: "departments" as const, label: "Departments", icon: UsersIcon }] : []),
    ...(canManageRoles ? [{ id: "roles" as const, label: "Roles", icon: Shield }] : []),
    ...(canManageUsers ? [{ id: "users" as const, label: "Users", icon: Users }] : []),
    ...(canManageSettings ? [{ id: "settings" as const, label: "Settings", icon: Settings }] : []),
    ...(isDeveloper ? [{ id: "deleted-chats" as const, label: "Deleted Chats", icon: Trash2 }] : []),
    ...(isDeveloper ? [{ id: "download-tracking" as const, label: "Download Tracking", icon: Download }] : []),
  ];

  // Extract name from email and get first letter for avatar
  const userName = userEmail.split('@')[0];
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={cn(
        "h-screen flex-col bg-sidebar border-r border-border transition-all duration-300",
        // Desktop only
        "hidden md:flex",
        isCollapsed ? "w-16" : "w-64"
      )}>
        {/* Header */}
        <div className={cn("p-2 flex items-center", isCollapsed ? "justify-center" : "justify-between")}>
        {isCollapsed ? (
          <div className="relative h-10 w-10 flex items-center justify-center group/header">
            {/* Logo - default state */}
            <img 
              src="/logos/g14_thick.svg" 
              alt="Logo" 
              className="w-7 h-7 object-contain absolute group-hover/header:opacity-0 transition-opacity" 
              style={{ marginLeft: '0px', marginTop: '0px' }}
            />
            {/* Toggle button - hover state */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-10 w-10 flex-shrink-0 hover:bg-white/5 absolute opacity-0 group-hover/header:opacity-100 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </Button>
            {/* Tooltip */}
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover/header:opacity-100 group-hover/header:visible transition-all whitespace-nowrap z-50 pointer-events-none">
              Open sidebar
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2" style={{ marginLeft: '8px', marginTop: '10px' }}>
              <img src="/logos/g14_thick.svg" alt="Logo" className="w-8 h-7 object-contain" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-8 w-8 flex-shrink-0 hover:bg-white/5 relative group/toggle"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              {/* Tooltip */}
              <div className="absolute right-full mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover/toggle:opacity-100 group-hover/toggle:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                Close sidebar
              </div>
            </Button>
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="px-2 py-4 space-y-0.5">
        {navItems.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            onClick={() => onNavigate(item.id)}
            className={cn(
              "w-full h-10 transition-all duration-200 rounded-md relative group/nav",
              isCollapsed ? "justify-center px-0" : "justify-start gap-3 px-2",
              "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/5"
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {!isCollapsed && <span className="text-sm font-normal">{item.label}</span>}
            {/* Tooltip on hover for collapsed state */}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                {item.label}
              </div>
            )}
          </Button>
        ))}
      </div>

      {/* New Chat Button - Only show on chat page */}
      {currentPage === "chat" && (
        <div className="px-2 pt-1 pb-2">
          <Button
            onClick={onNewChat}
            variant="ghost"
            className={cn(
              "w-full h-10 hover:bg-white/5 transition-all duration-200 text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-md relative group/new",
              isCollapsed ? "justify-center px-0" : "justify-start gap-2 px-2"
            )}
          >
            <Plus className="w-4 h-4" />
            {!isCollapsed && <span className="text-sm font-normal">New chat</span>}
            {/* Tooltip for collapsed state */}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover/new:opacity-100 group-hover/new:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                New chat
              </div>
            )}
          </Button>
        </div>
      )}

      {/* Chat Sessions - Only show on chat page and when not collapsed */}
      {currentPage === "chat" && !isCollapsed && (
        <div className="flex-1 overflow-y-auto chat-scrollbar px-2 py-1">
          {sessions.length === 0 ? (
            <div className="text-center py-8 px-4">
              <p className="text-xs text-muted-foreground">No recent chats</p>
            </div>
          ) : (
            <div className="space-y-0">
              {sessions.map((session, index) => (
                <div key={session.id}>
                  <div
                    className={cn(
                      "w-full text-left rounded-lg transition-all duration-200 group relative",
                      session.isActive
                        ? "bg-sidebar-accent"
                        : "hover:bg-sidebar-accent/50"
                    )}
                  >
                    <button
                      onClick={() => onSelectChat(session.id)}
                      className="w-full text-left px-3 py-2.5 pr-9"
                    >
                      <div className="text-[13px] font-medium truncate text-sidebar-foreground leading-tight">
                        {session.title.length > 50 ? session.title.substring(0, 50) + '...' : session.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <span>{session.date}</span>
                        {(userRole.toLowerCase() === 'developer' || userRole === 'admin') && session.startedBy && session.startedBy !== userEmail && (
                          <span className="text-[10px] text-muted-foreground/70">• by {session.startedBy}</span>
                        )}
                      </div>
                    </button>
                    {/* Only show delete button for own chats */}
                    {session.startedByEmail === userEmail && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChat(session.id);
                        }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 text-sidebar-muted hover:text-destructive rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  {index < sessions.length - 1 && (
                    <div className="border-b border-border/50 my-1" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spacer for non-chat pages */}
      {currentPage !== "chat" && <div className="flex-1" />}

      {/* User Profile */}
      <div className="p-2 mt-auto">
        {isCollapsed ? (
          <div className="relative h-10 w-10 flex items-center justify-center group mx-auto">
            {/* User icon - default state */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center absolute group-hover:opacity-0 transition-opacity">
              <span className="text-white font-semibold text-xs">{userInitial}</span>
            </div>
            {/* Logout button - hover state */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              className="text-sidebar-muted hover:text-destructive h-10 w-10 absolute opacity-0 group-hover:opacity-100 transition-opacity hover:bg-sidebar-accent"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent/50 transition-all">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate capitalize">{userName}</p>
              <p className="text-xs text-muted-foreground capitalize truncate">{userRole}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              className="text-sidebar-muted hover:text-destructive flex-shrink-0 h-8 w-8 transition-all hover:bg-sidebar-accent"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </aside>

      {/* Mobile Sidebar - Full width overlay */}
      <aside className="h-screen flex flex-col bg-sidebar w-full md:hidden">
        {/* Mobile Header with Close Button */}
        <div className="p-3 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <img src="/logos/g14_thick.svg" alt="Logo" className="w-6 h-6 object-contain" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => document.querySelector('.sidebar-container')?.classList.remove('open')}
            className="h-8 w-8"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        {/* Mobile Navigation - Same as desktop but always expanded */}
        <div className="px-2 py-4 space-y-0.5">
          {navItems.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => onNavigate(item.id)}
              className="w-full h-10 justify-start gap-3 px-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/5 transition-all duration-200 rounded-md"
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-normal">{item.label}</span>
            </Button>
          ))}
        </div>

        {/* Mobile New Chat Button */}
        {currentPage === "chat" && (
          <div className="px-2 pt-1 pb-2">
            <Button
              onClick={onNewChat}
              variant="ghost"
              className="w-full h-10 justify-start gap-2 px-2 hover:bg-white/5 transition-all duration-200 text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-md"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-normal">New chat</span>
            </Button>
          </div>
        )}

        {/* Mobile Chat Sessions */}
        {currentPage === "chat" && (
          <div className="flex-1 overflow-y-auto chat-scrollbar px-2 py-1">
            {sessions.length === 0 ? (
              <div className="text-center py-8 px-4">
                <p className="text-xs text-muted-foreground">No recent chats</p>
              </div>
            ) : (
              <div className="space-y-0">
                {sessions.map((session) => (
                  <div key={session.id}>
                    <div
                      onClick={() => onSelectChat(session.id)}
                      className="px-3 py-2 rounded-lg hover:bg-sidebar-accent/50 cursor-pointer transition-all group"
                    >
                      <p className="text-sm text-sidebar-foreground truncate">{session.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{session.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mobile Spacer */}
        {currentPage !== "chat" && <div className="flex-1" />}

        {/* Mobile User Profile */}
        <div className="p-2 mt-auto">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent/50 transition-all">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate capitalize">{userName}</p>
              <p className="text-xs text-muted-foreground capitalize truncate">{userRole}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              className="text-sidebar-muted hover:text-destructive flex-shrink-0 h-8 w-8 transition-all hover:bg-sidebar-accent"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
};
