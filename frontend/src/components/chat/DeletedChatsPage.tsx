import { useState, useEffect } from "react";
import { MessageSquare, Trash2, Search } from "lucide-react";

export const DeletedChatsPage = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { loadDeletedSessions(); }, []);

  useEffect(() => {
    if (!searchQuery.trim()) setFilteredSessions(sessions);
    else {
      const q = searchQuery.toLowerCase();
      setFilteredSessions(sessions.filter(s => s.title.toLowerCase().includes(q) || s.startedBy?.toLowerCase().includes(q) || s.deletedBy?.toLowerCase().includes(q)));
    }
  }, [searchQuery, sessions]);

  const loadDeletedSessions = async () => {
    try {
      const res = await fetch('/api/deleted-sessions', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setSessions(data); setFilteredSessions(data);
    } catch (e) { console.error(e); }
  };

  const loadDeletedMessages = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/deleted-messages?sessionId=${sessionId}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) throw new Error('Failed');
      setMessages(await res.json()); setSelectedSession(sessionId);
    } catch (e) { console.error(e); }
  };

  const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Audit</p>
          <h1 className="text-xl font-semibold">Deleted Chats</h1>
          <p className="text-xs text-muted-foreground mt-0.5">View deleted chat history for audit purposes.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Deleted Sessions</p>
            <p className="text-2xl font-semibold mt-0.5">{sessions.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Messages</p>
            <p className="text-2xl font-semibold mt-0.5">{totalMessages}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Filtered Results</p>
            <p className="text-2xl font-semibold mt-0.5">{filteredSessions.length}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search by title, started by, or deleted by..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Sessions List */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b">
              <p className="text-xs font-medium flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Deleted Sessions ({filteredSessions.length})</p>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {filteredSessions.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Trash2 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{searchQuery ? "No matching deleted chats" : "No deleted chats"}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredSessions.map((session) => (
                    <div key={session.id} onClick={() => loadDeletedMessages(session.id)}
                      className={`px-4 py-3 cursor-pointer transition-colors ${selectedSession === session.id ? 'bg-muted' : 'hover:bg-muted/50'}`}>
                      <p className="text-[13px] font-medium truncate">{session.title}</p>
                      <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                        <p>Started by: {session.startedBy}</p>
                        <p>Deleted by: {session.deletedBy}</p>
                        <p>Deleted: {new Date(session.deletedAt).toLocaleString()}</p>
                        <p>{session.messageCount} messages</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Messages View */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b">
              <p className="text-xs font-medium flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Messages</p>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {selectedSession ? (
                <div className="p-4 space-y-3">
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`p-3 rounded-lg ${msg.role === 'user' ? 'bg-muted ml-8' : 'bg-muted/50 mr-8'}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-semibold uppercase">{msg.role}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(msg.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-10 text-center">
                  <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Select a session to view messages</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
