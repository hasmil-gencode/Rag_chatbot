import { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const role = localStorage.getItem('userRole') || 'user';

  useEffect(() => {
    if (role === 'user') return;
    const load = () => fetch('/api/notifications/unread-count', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json()).then(d => setCount(d.count || 0)).catch(() => {});
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadNotifs = async () => {
    const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    setNotifs(await res.json());
  };

  const toggle = () => { if (!open) loadNotifs(); setOpen(!open); };

  const markAllRead = async () => {
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({}) });
    setCount(0);
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  };

  if (role === 'user') return null;

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative p-1.5 rounded-lg hover:bg-accent text-sidebar-muted hover:text-sidebar-foreground transition-all" title="Notifications">
        <Bell className="w-4 h-4" />
        {count > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-background border rounded-xl shadow-lg z-50 max-h-80 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <p className="text-xs font-semibold">Notifications</p>
            {count > 0 && <button onClick={markAllRead} className="text-[10px] text-muted-foreground hover:text-foreground">Mark all read</button>}
          </div>
          <div className="overflow-y-auto max-h-64">
            {notifs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No notifications</p>
            ) : notifs.map(n => (
              <div key={n._id} className={`px-3 py-2 border-b last:border-0 text-xs ${n.read ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.read ? 'bg-muted' : n.type === 'storage' ? 'bg-orange-500' : 'bg-yellow-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(n.createdAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
