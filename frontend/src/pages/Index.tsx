import { useState, useEffect, useRef } from "react";
import { Toaster, toast } from "sonner";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatArea } from "@/components/chat/ChatArea";
import { FilesPage } from "@/components/chat/FilesPage";
import { SettingsPage } from "@/components/chat/SettingsPage";
import { RolesPage } from "@/components/chat/RolesPage";
import { UsersPage } from "@/components/chat/UsersPage";
import { OrganizationsPage } from "@/components/chat/OrganizationsPage";
import { DepartmentsPage } from "@/components/chat/DepartmentsPage";
import { DeletedChatsPage } from "@/components/chat/DeletedChatsPage";
import { FormsPage } from "@/components/chat/FormsPage";
import { DownloadTrackingPage } from "@/components/chat/DownloadTrackingPage";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  date: string;
  isActive?: boolean;
  startedBy?: string;
  startedByEmail?: string;
}

const Index = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState<"chat" | "files" | "settings" | "roles" | "users" | "organizations" | "departments" | "deleted-chats" | "forms" | "download-tracking">("chat");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [userOrganization, setUserOrganization] = useState<string>("");
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedEmail = localStorage.getItem("userEmail");
    const storedRole = localStorage.getItem("userRole");
    const storedOrg = localStorage.getItem("userOrganization");
    const storedPerms = localStorage.getItem("userPermissions");
    if (token) {
      setIsAuthenticated(true);
      if (storedEmail) setUserEmail(storedEmail);
      if (storedRole) setUserRole(storedRole);
      if (storedOrg) setUserOrganization(storedOrg);
      if (storedPerms) setUserPermissions(JSON.parse(storedPerms));
      
      // Reset to chat page on load
      setCurrentPage("chat");
      
      loadInitialData();
    }
  }, []);

  const loadInitialData = async () => {
    try {
      const sessionsData = await api.getSessions();
      setSessions(sessionsData.map(s => {
        const date = new Date(s.lastMessageAt);
        const formattedDate = date.toLocaleDateString("en-MY", { 
          day: '2-digit', 
          month: 'short' 
        }) + ', ' + date.toLocaleTimeString("en-MY", { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        });
        return {
          ...s,
          date: formattedDate,
          isActive: false,
        };
      }));
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const data = await api.login({ email, password });

      localStorage.setItem("token", data.token);
      localStorage.setItem("userId", data.user?.id || "");
      localStorage.setItem("userEmail", data.user?.email || email);
      localStorage.setItem("userRole", data.user?.roles?.[0] || "user");
      localStorage.setItem("userOrganization", data.user?.organizationName || "");
      localStorage.setItem("userPermissions", JSON.stringify(data.user?.permissions || []));
      setUserEmail(data.user?.email || email);
      setUserRole(data.user?.roles?.[0] || "user");
      setUserOrganization(data.user?.organizationName || "");
      setUserPermissions(data.user?.permissions || []);
      
      // Always redirect to chat page after login
      setCurrentPage("chat");
      
      setIsAuthenticated(true);
      await loadInitialData();
      toast.success("Welcome back!");
    } catch (error: any) {
      toast.error(error.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userOrganization");
    localStorage.removeItem("userPermissions");
    setIsAuthenticated(false);
    setSessions([]);
    setMessages([]);
    setCurrentSessionId(null);
    setUserEmail("");
    setUserRole("");
    setUserOrganization("");
    setUserPermissions([]);
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
    currentSessionIdRef.current = null;
    setMessages([]);
    setSessions(prev => prev.map(s => ({ ...s, isActive: false })));
    
    // Stop continuous mode if active
    localStorage.removeItem('continuousMode');
    localStorage.removeItem('continuousModeMessage');
    localStorage.removeItem('ttsPlaying');
    localStorage.removeItem('ttsBlocking');
    localStorage.removeItem('waitingForTTS');
  };

  const handleSelectChat = async (id: string) => {
    setCurrentSessionId(id);
    currentSessionIdRef.current = id;
    setSessions(prev => prev.map(s => ({ ...s, isActive: s.id === id })));
    
    try {
      const msgs = await api.getMessages(id);
      setMessages(msgs.map((m, i) => ({
        id: i.toString(),
        role: m.role === "bot" ? "assistant" : "user",
        content: m.content || "",
      })));
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await api.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        handleNewChat();
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSendMessage = async (content: string, fileId?: string | null) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Use ref for immediate session ID (avoids race condition)
      const sessionId = currentSessionIdRef.current;
      const response = await api.sendMessage(content, sessionId || undefined, fileId || undefined);
      
      // Update session ID immediately if this was first message
      if (!sessionId && response.sessionId) {
        setCurrentSessionId(response.sessionId);
        currentSessionIdRef.current = response.sessionId;
      }
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.response,
      };

      setMessages(prev => [...prev, botMessage]);
      
      // Reload sessions list if new session was created
      if (!sessionId) {
        await loadInitialData();
      }
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${error.message}`,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <div className="h-screen flex">
        {/* Left Side - Marketing */}
        <div className="hidden lg:flex lg:w-[60%] bg-gradient-to-br from-stone-300 via-slate-800 to-slate-900 p-9 flex-col justify-between relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: 'url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80")',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }} />
          </div>
          
          {/* Logo & Company Name */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center overflow-hidden">
              <img src="/logos/g14.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-white text-2xl font-bold">Genie</span>
          </div>

          {/* Marketing Content */}
          <div className="relative z-10">
            <p className="text-white text-sm font-medium mb-4 tracking-wider uppercase">
              AI OPERATIONS SUITE
            </p>
            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
              Streamline your<br />
              <span className="text-primary">knowledge workflows.</span>
            </h1>
            <p className="text-slate-300 text-lg mb-6 leading-relaxed">
              Intelligent AI-powered conversations for your business. Streamline workflows, 
              enhance productivity, and unlock insights with advanced RAG technology.
            </p>
            <p className="text-slate-400 leading-relaxed">
              Optimize retrieval, govern access, and ship accurate answers in seconds.
            </p>
          </div>

          {/* Footer */}
          <div className="relative z-10">
            <p className="text-slate-500 text-sm">
              © 2026 Gencode Sdn Bhd. All rights reserved.
            </p>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full lg:w-[40%] flex items-center justify-center p-8 bg-slate-50">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome back</h2>
              <p className="text-slate-600">Please sign in to your dashboard</p>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <Input
                    type="email"
                    placeholder="e.g. admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-12 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white text-base font-medium"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
                <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Protected by GenCode Secure Access
              </p>
              
              {/* Powered by GenCode image */}
              <div className="mt-4 flex justify-center">
                <img src="/powerbygencode.png" alt="Powered by GenCode" className="h-12 object-contain" />
              </div>
            </div>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" richColors />
      <div 
        className="flex h-screen bg-background overflow-hidden"
        onClick={() => {
          // Close mobile menu when clicking outside
          setShowMobileMenu(false);
        }}
      >
      
      {/* Mobile Header Bar - Only when there's an active chat */}
      {currentPage === "chat" && currentSessionId && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-[50] bg-background border-b border-border">
          <div className="flex items-center justify-between px-3 py-2">
            {/* Hamburger */}
            <button
              onClick={() => {
                const sidebar = document.querySelector('.sidebar-container');
                sidebar?.classList.add('open');
              }}
              className="p-2 hover:bg-white/5 rounded-md transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Chat Title */}
            <div className="flex-1 text-center px-2 min-w-0">
              <h1 className="text-sm font-medium truncate max-w-[200px] mx-auto">
                {sessions.find(s => s.id === currentSessionId)?.title || 'Chat'}
              </h1>
            </div>

            {/* Three dots menu */}
            <div className="relative">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMobileMenu(!showMobileMenu);
                }}
                className="p-2 hover:bg-white/5 rounded-md transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="5" r="1" fill="currentColor" />
                  <circle cx="12" cy="12" r="1" fill="currentColor" />
                  <circle cx="12" cy="19" r="1" fill="currentColor" />
                </svg>
              </button>
              
              {/* Dropdown Menu */}
              {showMobileMenu && (
                <div 
                  className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-[60]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="py-1">
                    <button
                      onClick={() => {
                        handleNewChat();
                        setShowMobileMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      New chat
                    </button>
                    
                    {(userRole === 'developer' || currentSessionId) && (
                      <button
                        onClick={() => {
                          if (currentSessionId && confirm('Delete this chat?')) {
                            handleDeleteChat(currentSessionId);
                            setShowMobileMenu(false);
                          }
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2 text-destructive"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete chat
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Hamburger - Only for new chat (no active session) */}
      {currentPage === "chat" && !currentSessionId && (
        <button
          onClick={() => {
            const sidebar = document.querySelector('.sidebar-container');
            sidebar?.classList.add('open');
          }}
          className="md:hidden fixed top-4 left-4 z-[50] p-2 hover:bg-white/5 rounded-md transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      <div 
        className="sidebar-container"
        onClick={(e) => {
          // Close sidebar when clicking outside (on overlay)
          if (e.target === e.currentTarget) {
            e.currentTarget.classList.remove('open');
          }
        }}
      >
        <ChatSidebar
          sessions={sessions}
          onNewChat={() => {
            handleNewChat();
            // Close sidebar on mobile after action
            document.querySelector('.sidebar-container')?.classList.remove('open');
          }}
          onSelectChat={(id) => {
            handleSelectChat(id);
            document.querySelector('.sidebar-container')?.classList.remove('open');
          }}
          onDeleteChat={handleDeleteChat}
          currentPage={currentPage}
          onNavigate={(page) => {
            setCurrentPage(page);
            document.querySelector('.sidebar-container')?.classList.remove('open');
          }}
          onLogout={handleLogout}
          userEmail={userEmail}
          userRole={userRole}
          userOrganization={userOrganization}
          userPermissions={userPermissions}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden chat-container">
        {currentPage === "chat" && (
          <ChatArea
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            userEmail={userEmail}
            hasActiveSession={!!currentSessionId}
          />
        )}
        {currentPage === "files" && <FilesPage />}
        {currentPage === "forms" && <FormsPage />}
        {currentPage === "deleted-chats" && <DeletedChatsPage />}
        {currentPage === "download-tracking" && <DownloadTrackingPage />}
        {currentPage === "organizations" && <OrganizationsPage />}
        {currentPage === "departments" && <DepartmentsPage />}
        {currentPage === "roles" && <RolesPage />}
        {currentPage === "users" && <UsersPage />}
        {currentPage === "settings" && <SettingsPage />}
      </div>
    </div>
    </>
  );
};

export default Index;
