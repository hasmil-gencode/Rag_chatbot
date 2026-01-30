import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageSquare, Trash2, Search } from "lucide-react";

export const DeletedChatsPage = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadDeletedSessions();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredSessions(sessions);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = sessions.filter(s => 
        s.title.toLowerCase().includes(query) ||
        s.startedBy?.toLowerCase().includes(query) ||
        s.deletedBy?.toLowerCase().includes(query)
      );
      setFilteredSessions(filtered);
    }
  }, [searchQuery, sessions]);

  const loadDeletedSessions = async () => {
    try {
      const response = await fetch('/api/deleted-sessions', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to load deleted sessions');
      const data = await response.json();
      setSessions(data);
      setFilteredSessions(data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadDeletedMessages = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/deleted-messages?sessionId=${sessionId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to load deleted messages');
      const data = await response.json();
      setMessages(data);
      setSelectedSession(sessionId);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Deleted Chats</h1>
        <p className="text-muted-foreground">View deleted chat history for audit purposes</p>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, started by, or deleted by..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sessions List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              <span>Deleted Sessions ({filteredSessions.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => loadDeletedMessages(session.id)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedSession === session.id
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-secondary'
                  }`}
                >
                  <p className="font-medium truncate">{session.title}</p>
                  <div className="text-sm text-muted-foreground mt-1">
                    <p>Started by: {session.startedBy}</p>
                    <p>Deleted by: {session.deletedBy}</p>
                    <p>Deleted: {new Date(session.deletedAt).toLocaleString()}</p>
                    <p>{session.messageCount} messages</p>
                  </div>
                </div>
              ))}
              {filteredSessions.length === 0 && (
                <div className="text-center py-12">
                  <Trash2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    {searchQuery ? "No matching deleted chats" : "No deleted chats"}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Messages View */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              <span>Messages</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedSession ? (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-primary/10 ml-8'
                        : 'bg-secondary mr-8'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold uppercase">
                        {msg.role}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Select a session to view messages</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
