const BASE = '/api/gateway';

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('gw_token');
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

async function req(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { headers: headers(), ...opts });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

export const api = {
  login: (email: string, password: string) => fetch('/api/gateway/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }),
  me: () => req('/me'),
  getServers: () => req('/servers'),
  addServer: (data: any) => req('/servers', { method: 'POST', body: JSON.stringify(data) }),
  deleteServer: (id: string) => req(`/servers/${id}`, { method: 'DELETE' }),
  healthCheck: (id: string) => req(`/servers/${id}/health`, { method: 'POST' }),
  syncTenants: (id: string) => req(`/servers/${id}/sync`, { method: 'POST' }),
  manageServer: (id: string) => req(`/servers/${id}/manage`, { method: 'POST' }),
  getTenants: () => req('/tenants'),
  createTenant: (data: any) => req('/tenants', { method: 'POST', body: JSON.stringify(data) }),
  getPackages: () => req('/packages'),
  createPackage: (data: any) => req('/packages', { method: 'POST', body: JSON.stringify(data) }),
  updatePackage: (id: string, data: any) => req(`/packages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePackage: (id: string) => req(`/packages/${id}`, { method: 'DELETE' }),
};
