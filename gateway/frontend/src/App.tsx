import { useState, useEffect } from 'react';
import { api } from './lib/api';
import { DashboardPage } from './components/DashboardPage';
import { ServersPage } from './components/ServersPage';
import { TenantsPage } from './components/TenantsPage';
import { PackagesPage } from './components/PackagesPage';
import { LayoutDashboard, Server, Users, Package, LogOut, Eye, EyeOff } from 'lucide-react';
import { Toaster } from 'sonner';

type Page = 'dashboard' | 'servers' | 'tenants' | 'packages';

export function App() {
  const [token, setToken] = useState(localStorage.getItem('gw_token'));
  const [page, setPage] = useState<Page>('dashboard');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [devName, setDevName] = useState('');

  useEffect(() => { if (token) api.me().then(u => setDevName(u.name)).catch(() => logout()); }, [token]);

  const login = async () => {
    setIsLoading(true); setError('');
    try {
      const r = await api.login(email, password);
      localStorage.setItem('gw_token', r.token);
      setToken(r.token); setDevName(r.user.name);
    } catch {
      try {
        const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid credentials');
        // Tenant user — stay on gateway, cookie already set by server
        if (data.mustChangePassword) {
          window.location.href = `/?mustChange=1&tempToken=${data.tempToken}&email=${encodeURIComponent(data.email)}&gateway=${encodeURIComponent(window.location.origin)}`;
          return;
        }
        if (data.token) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('userId', data.user?.id || '');
          localStorage.setItem('userEmail', data.user?.email || email);
          localStorage.setItem('userRole', data.user?.role || 'user');
          localStorage.setItem('gatewayUrl', window.location.origin);
          window.location.reload();
        }
      } catch (e: any) { setError(e.message); }
    }
    setIsLoading(false);
  };

  const logout = () => { localStorage.removeItem('gw_token'); setToken(null); setDevName(''); };

  if (!token) return (
    <div className="min-h-screen flex bg-white">
      <div className="hidden lg:flex lg:w-[60%] p-9 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0" style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80")', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0 bg-black/50" />
        </div>
        <div className="relative z-10 flex items-center">
          <img src="/logos/g14_white_long_2.svg" alt="Logo" className="h-8 object-contain" />
        </div>
        <div className="relative z-10">
          <p className="text-slate-400 text-sm uppercase tracking-widest mb-4">AI Operations Suite</p>
          <h1 className="text-4xl font-bold text-slate-300 leading-tight">Streamline your<br /><span className="text-white">knowledge workflows.</span></h1>
          <p className="text-white text-lg mb-6 mt-4 leading-relaxed">Intelligent AI-powered conversations for your business. Streamline workflows, enhance productivity, and unlock insights with advanced RAG technology.</p>
        </div>
        <div className="relative z-10"><p className="text-slate-500 text-sm">© 2026 Gencode Sdn Bhd. All rights reserved.</p></div>
      </div>
      <div className="w-full lg:w-[40%] flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome back</h2>
            <p className="text-slate-600">Please sign in to your dashboard</p>
          </div>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></div>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. admin@example.com" className="w-full pl-10 h-12 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg></div>
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && login()} className="w-full pl-10 pr-10 h-12 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">{showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button onClick={login} disabled={isLoading} className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {isLoading ? 'Signing in...' : 'Sign In'}<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </button>
          </div>
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500 flex items-center justify-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>Protected by GenCode Secure Access</p>
            <div className="mt-4 flex justify-center"><img src="/powerbygencode.png" alt="Powered by GenCode" className="h-12 object-contain" /></div>
          </div>
        </div>
      </div>
    </div>
  );

  const nav: { id: Page; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'servers', label: 'Servers', icon: Server },
    { id: 'tenants', label: 'Tenants', icon: Users },
    { id: 'packages', label: 'Packages', icon: Package },
  ];

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Toaster position="top-right" />
      <div className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="px-4 py-5 border-b border-sidebar-border">
          <p className="text-sm font-semibold text-sidebar-foreground">Genia Gateway</p>
          <p className="text-[11px] text-sidebar-muted mt-0.5">{devName}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)} className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-colors ${page === n.id ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}`}>
              <n.icon className="w-4 h-4" />{n.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-sidebar-muted hover:text-sidebar-foreground rounded-lg hover:bg-sidebar-accent/50 transition-colors">
            <LogOut className="w-4 h-4" />Logout
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {page === 'dashboard' && <DashboardPage />}
        {page === 'servers' && <ServersPage />}
        {page === 'tenants' && <TenantsPage />}
        {page === 'packages' && <PackagesPage />}
      </div>
    </div>
  );
}
