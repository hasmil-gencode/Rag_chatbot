import { Plus, MessageSquare, Settings, FolderOpen, LogOut, Bot, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatSession {
  id: string;
  title: string;
  date: string;
  isActive?: boolean;
  startedBy?: string;
}

interface ChatSidebarProps {
  sessions: ChatSession[];
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  currentPage: "chat" | "files" | "settings";
  onNavigate: (page: "chat" | "files" | "settings") => void;
  onLogout: () => void;
  logo?: string | null;
  userEmail: string;
  userRole: string;
  userOrganization: string;
}

export const ChatSidebar = ({
  sessions,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  currentPage,
  onNavigate,
  onLogout,
  logo,
  userEmail,
  userRole,
  userOrganization,
}: ChatSidebarProps) => {
  // Role-based navigation access
  // Admin: chat, files, settings
  // Manager: chat, files
  // User: chat only
  const navItems = [
    { id: "chat" as const, label: "Chat", icon: MessageSquare },
    ...(userRole === "admin" || userRole === "manager" ? [{ id: "files" as const, label: "Files", icon: FolderOpen }] : []),
    ...(userRole === "admin" ? [{ id: "settings" as const, label: "Settings", icon: Settings }] : []),
  ];

  // Extract name from email and get first letter for avatar
  const userName = userEmail.split('@')[0];
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <aside className="h-screen flex flex-col bg-sidebar w-64 border-r border-border">
      {/* Header */}
      <div className="p-1.5 flex items-center bg-white border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
            {logo ? (
              <img src={logo} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <Bot className="w-5 h-5 text-primary" />
            )}
          </div>
          <span className="font-bold text-gray-900 text-lg">Genie</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-2 py-4 space-y-0.5">
        {navItems.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            onClick={() => onNavigate(item.id)}
            className={cn(
              "w-full justify-start gap-2.5 h-9 px-3 transition-all duration-200 rounded-lg",
              currentPage === item.id
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="text-[13px] font-medium">{item.label}</span>
          </Button>
        ))}
      </div>

      {/* New Chat Button - Only show on chat page */}
      {currentPage === "chat" && (
        <div className="px-2 pt-1 pb-2">
          <Button
            onClick={onNewChat}
            variant="ghost"
            className="w-full h-9 hover:bg-sidebar-accent transition-all duration-200 text-sidebar-foreground rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span className="ml-2 text-[13px] font-medium">New chat</span>
          </Button>
        </div>
      )}

      {/* Chat Sessions - Only show on chat page */}
      {currentPage === "chat" && (
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
                        {userRole === 'admin' && session.startedBy && session.startedBy !== userEmail && (
                          <span className="text-[10px] text-muted-foreground/70">• by {session.startedBy}</span>
                        )}
                      </div>
                    </button>
                    {/* Only show delete button if user owns the chat */}
                    {(!session.startedBy || session.startedBy === userEmail) && (
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
        <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-sidebar-accent/50 transition-all group">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-xs">{userInitial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-sidebar-foreground truncate capitalize">{userName}</p>
            <p className="text-[11px] text-muted-foreground capitalize">
              {userRole}
              {userOrganization && userRole !== "admin" && ` • ${userOrganization}`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            className="text-sidebar-muted hover:text-destructive flex-shrink-0 h-7 w-7 transition-all"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
};