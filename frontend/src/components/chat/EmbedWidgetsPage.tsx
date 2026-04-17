import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useConfirm } from "./ConfirmDialog";
import { api } from "@/lib/api";
import { Plus, Copy, Trash2, X, Edit2, Power, Code, Globe, Lock } from "lucide-react";

interface EmbedWidget {
  _id: string; name: string; shape: string; color: string; position: string;
  logoUrl: string; buttonIconUrl: string; allowedDomains: string[]; welcomeMessage: string;
  headerTitle: string; headerSubtitle: string; headerGradient: string;
  theme: string; bubbleStyle: string; fontSize: string; windowRadius: number;
  inputPlaceholder: string; showPoweredBy: boolean;
  systemPrompt: string; isActive: boolean; createdAt: string;
  accessMode: string; publicChatLimit: number; fallbackMessage: string; organizationId: string;
}

const SHAPES = [
  { id: 'circle', label: 'Circle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'square', label: 'Square' },
];
const THEMES = [
  { id: 'light', label: '☀️ Light' },
  { id: 'dark', label: '🌙 Dark' },
  { id: 'auto', label: '🔄 Auto' },
];
const BUBBLES = [
  { id: 'modern', label: 'Modern' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'sharp', label: 'Sharp' },
  { id: 'pill', label: 'Pill' },
];
const FONT_SIZES = [
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Medium' },
  { id: 'lg', label: 'Large' },
];

const defaultForm = {
  name: '', shape: 'circle', color: '#3B82F6', position: 'bottom-right',
  logoUrl: '', buttonIconUrl: '', allowedDomains: '', welcomeMessage: 'Hi! How can I help you?',
  headerTitle: 'Chat with us', headerSubtitle: '', headerGradient: '',
  theme: 'light', bubbleStyle: 'modern', fontSize: 'md', windowRadius: 16,
  inputPlaceholder: 'Type a message...', showPoweredBy: true, systemPrompt: '',
  accessMode: 'private', publicChatLimit: 5, fallbackMessage: '', organizationId: '',
};

export const EmbedWidgetsPage = () => {
  const [widgets, setWidgets] = useState<EmbedWidget[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState<string | null>(null);
  const [editingWidget, setEditingWidget] = useState<EmbedWidget | null>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [orgs, setOrgs] = useState<any[]>([]);
  const confirm = useConfirm();

  useEffect(() => { loadWidgets(); loadOrgs(); }, []);
  const loadWidgets = async () => { try { setWidgets(await api.getEmbedWidgets()); } catch (e: any) { toast.error(e.message); } };
  const loadOrgs = async () => { try { const data = await api.getAllOrganizations(); setOrgs(Array.isArray(data) ? data : []); } catch {} };

  const openCreate = () => { setEditingWidget(null); setForm({ ...defaultForm }); setShowModal(true); };
  const openEdit = (w: EmbedWidget) => {
    setEditingWidget(w);
    setForm({
      name: w.name, shape: w.shape, color: w.color, position: w.position,
      logoUrl: w.logoUrl || '', buttonIconUrl: w.buttonIconUrl || '', allowedDomains: (w.allowedDomains || []).join(', '),
      welcomeMessage: w.welcomeMessage, headerTitle: w.headerTitle,
      headerSubtitle: w.headerSubtitle || '', headerGradient: w.headerGradient || '',
      theme: w.theme || 'light', bubbleStyle: w.bubbleStyle || 'modern',
      fontSize: w.fontSize || 'md', windowRadius: w.windowRadius || 16,
      inputPlaceholder: w.inputPlaceholder || 'Type a message...',
      showPoweredBy: w.showPoweredBy !== false, systemPrompt: w.systemPrompt || '',
      accessMode: w.accessMode || 'private', publicChatLimit: w.publicChatLimit || 5,
      fallbackMessage: w.fallbackMessage || '', organizationId: w.organizationId || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
    const data = { ...form, allowedDomains: form.allowedDomains.split(',').map(d => d.trim()).filter(Boolean), windowRadius: Number(form.windowRadius) };
    try {
      if (editingWidget) await api.updateEmbedWidget(editingWidget._id, { ...data, isActive: editingWidget.isActive });
      else await api.createEmbedWidget(data);
      setShowModal(false); loadWidgets(); toast.success(editingWidget ? "Updated" : "Created");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleToggle = async (w: EmbedWidget) => { try { await api.updateEmbedWidget(w._id, { ...w, isActive: !w.isActive }); loadWidgets(); } catch (e: any) { toast.error(e.message); } };
  const handleDelete = async (id: string) => { if (!await confirm("Delete this widget?")) return; try { await api.deleteEmbedWidget(id); loadWidgets(); toast.success("Deleted"); } catch (e: any) { toast.error(e.message); } };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'buttonIconUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { const r = await api.uploadWidgetLogo(file); setForm(p => ({ ...p, [field]: r.logoUrl })); toast.success("Uploaded"); }
    catch (err: any) { toast.error(err.message); }
  };

  const getEmbedCode = (id: string) => `<!-- GenBotChat Widget -->\n<script src="${window.location.origin}/embed/widget.js" data-widget-id="${id}" defer><\/script>`;
  const copyCode = (id: string) => { navigator.clipboard.writeText(getEmbedCode(id)); toast.success("Copied!"); };

  const Btn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} className={`px-3 py-1.5 text-[11px] rounded-md border transition-colors ${active ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted'}`}>{children}</button>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Integration</p>
            <h1 className="text-xl font-semibold">Embed Widgets</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Create chat widgets that can be embedded on any website.</p>
          </div>
          <Button size="sm" onClick={openCreate} className="text-xs h-8 rounded-lg"><Plus className="w-3.5 h-3.5 mr-1.5" /> Create Widget</Button>
        </div>

        {widgets.length === 0 ? (
          <div className="border rounded-lg px-4 py-16 text-center text-sm text-muted-foreground">No embed widgets yet.</div>
        ) : (
          <div className="space-y-3">
            {widgets.map((w) => (
              <div key={w._id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 flex items-center justify-center text-white text-sm shadow ${w.shape === 'rounded' ? 'rounded-xl' : w.shape === 'square' ? 'rounded-lg' : 'rounded-full'}`}
                      style={{ background: w.headerGradient ? `linear-gradient(135deg, ${w.color}, ${w.headerGradient})` : w.color }}>
                      {w.logoUrl ? <img src={w.logoUrl} alt="" className="w-6 h-6 rounded-full object-cover" /> :
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium">{w.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${w.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>{w.isActive ? 'Active' : 'Disabled'}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{w.theme || 'light'}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {w.allowedDomains?.length > 0 ? `Domains: ${w.allowedDomains.join(', ')}` : 'All domains'} · {new Date(w.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setShowCodeModal(w._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Embed code"><Code className="w-4 h-4" /></button>
                    <button onClick={() => openEdit(w)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleToggle(w)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Toggle"><Power className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(w._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Embed Code Modal */}
      {showCodeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCodeModal(null)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-lg mx-4 border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Embed Code</h2>
              <button onClick={() => setShowCodeModal(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Paste before <code>&lt;/body&gt;</code> on any website.</p>
            <pre className="text-xs bg-muted px-4 py-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{getEmbedCode(showCodeModal)}</pre>
            <div className="flex gap-2 mt-4">
              <Button size="sm" onClick={() => { copyCode(showCodeModal); setShowCodeModal(null); }} className="text-xs h-8 flex-1"><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Code</Button>
              <Button size="sm" variant="outline" onClick={() => setShowCodeModal(null)} className="text-xs h-8">Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-xl mx-4 border max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">{editingWidget ? 'Edit Widget' : 'Create Widget'}</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">

              {/* Name */}
              <div>
                <label className="text-[11px] text-muted-foreground">Widget Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Website Chat"
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>

              {/* ─── APPEARANCE ─── */}
              <div className="border rounded-lg p-4 space-y-4">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Appearance</p>

                {/* Live Preview */}
                <div className="flex items-center gap-5">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-14 h-14 flex items-center justify-center text-white shadow-lg overflow-hidden ${form.shape === 'rounded' ? 'rounded-xl' : form.shape === 'square' ? 'rounded-lg' : 'rounded-full'}`}
                      style={{ background: form.headerGradient ? `linear-gradient(135deg, ${form.color}, ${form.headerGradient})` : form.color }}>
                      {(form.buttonIconUrl || form.logoUrl) ? <img src={form.buttonIconUrl || form.logoUrl} alt="" className="w-full h-full object-cover" /> :
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>}
                    </div>
                    <span className="text-[10px] text-muted-foreground">Button</span>
                  </div>
                  <div className={`flex-1 overflow-hidden border shadow-sm ${form.theme === 'dark' ? 'bg-[#1e1e2e]' : 'bg-white'}`} style={{ borderRadius: form.windowRadius + 'px' }}>
                    <div className="px-3 py-2 text-white flex items-center gap-2"
                      style={{ background: form.headerGradient ? `linear-gradient(135deg, ${form.color}, ${form.headerGradient})` : form.color }}>
                      {form.logoUrl && <img src={form.logoUrl} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium truncate">{form.headerTitle || 'Chat with us'}</div>
                        {form.headerSubtitle && <div className="text-[9px] opacity-80">{form.headerSubtitle}</div>}
                      </div>
                      <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[8px] font-bold flex-shrink-0">U</div>
                    </div>
                    <div className="px-3 py-2 space-y-1.5">
                      <div className={`inline-block px-2 py-1 ${form.theme === 'dark' ? 'bg-[#2a2a3e] text-gray-300' : 'bg-gray-100 text-gray-600'}`}
                        style={{ fontSize: form.fontSize === 'sm' ? '9px' : form.fontSize === 'lg' ? '12px' : '10px', borderRadius: form.bubbleStyle === 'sharp' ? '4px' : form.bubbleStyle === 'pill' ? '20px' : form.bubbleStyle === 'rounded' ? '12px' : '14px' }}>
                        {form.welcomeMessage?.substring(0, 25) || 'Hi!'}
                      </div>
                      <div className="text-white ml-auto inline-block float-right px-2 py-1"
                        style={{ background: form.color, clear: 'both', fontSize: form.fontSize === 'sm' ? '9px' : form.fontSize === 'lg' ? '12px' : '10px', borderRadius: form.bubbleStyle === 'sharp' ? '4px' : form.bubbleStyle === 'pill' ? '20px' : form.bubbleStyle === 'rounded' ? '12px' : '14px' }}>
                        Hello!
                      </div>
                    </div>
                  </div>
                </div>

                {/* Theme */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground w-20">Theme</label>
                  <div className="flex gap-1.5">{THEMES.map(t => <Btn key={t.id} active={form.theme === t.id} onClick={() => setForm({ ...form, theme: t.id })}>{t.label}</Btn>)}</div>
                </div>

                {/* Colors */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground w-20">Main Color</label>
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0" />
                  <input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-24 h-8 px-2 text-[11px] rounded border bg-transparent" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground w-20">Gradient</label>
                  <input type="color" value={form.headerGradient || form.color} onChange={e => setForm({ ...form, headerGradient: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0" />
                  <input value={form.headerGradient} onChange={e => setForm({ ...form, headerGradient: e.target.value })} placeholder="Optional 2nd color" className="w-24 h-8 px-2 text-[11px] rounded border bg-transparent" />
                  {form.headerGradient && <button onClick={() => setForm({ ...form, headerGradient: '' })} className="text-[10px] text-destructive">Clear</button>}
                </div>

                {/* Button Shape */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground w-20">Button</label>
                  <div className="flex gap-1.5">{SHAPES.map(s => <Btn key={s.id} active={form.shape === s.id} onClick={() => setForm({ ...form, shape: s.id })}>{s.label}</Btn>)}</div>
                </div>

                {/* Bubble Style */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground w-20">Bubbles</label>
                  <div className="flex gap-1.5">{BUBBLES.map(b => <Btn key={b.id} active={form.bubbleStyle === b.id} onClick={() => setForm({ ...form, bubbleStyle: b.id })}>{b.label}</Btn>)}</div>
                </div>

                {/* Font Size */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground w-20">Font Size</label>
                  <div className="flex gap-1.5">{FONT_SIZES.map(f => <Btn key={f.id} active={form.fontSize === f.id} onClick={() => setForm({ ...form, fontSize: f.id })}>{f.label}</Btn>)}</div>
                </div>

                {/* Window Radius */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground w-20">Roundness</label>
                  <input type="range" min="0" max="24" value={form.windowRadius} onChange={e => setForm({ ...form, windowRadius: Number(e.target.value) })} className="flex-1" />
                  <span className="text-[11px] text-muted-foreground w-8">{form.windowRadius}px</span>
                </div>

                {/* Header Logo */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground w-20">Header Logo</label>
                  <label className="px-3 py-1.5 text-[11px] rounded-md border cursor-pointer hover:bg-muted transition-colors">
                    {form.logoUrl ? 'Change' : 'Upload'}
                    <input type="file" accept="image/*" onChange={e => handleLogoUpload(e, 'logoUrl')} className="hidden" />
                  </label>
                  {form.logoUrl && <><img src={form.logoUrl} alt="" className="w-6 h-6 rounded-full object-cover" /><button onClick={() => setForm({ ...form, logoUrl: '' })} className="text-[10px] text-destructive">Remove</button></>}
                </div>

                {/* Button Icon */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground w-20">Button Icon</label>
                  <label className="px-3 py-1.5 text-[11px] rounded-md border cursor-pointer hover:bg-muted transition-colors">
                    {form.buttonIconUrl ? 'Change' : 'Upload'}
                    <input type="file" accept="image/*" onChange={e => handleLogoUpload(e, 'buttonIconUrl')} className="hidden" />
                  </label>
                  {form.buttonIconUrl && <><img src={form.buttonIconUrl} alt="" className="w-6 h-6 rounded-full object-cover" /><button onClick={() => setForm({ ...form, buttonIconUrl: '' })} className="text-[10px] text-destructive">Remove</button></>}
                  {!form.buttonIconUrl && <span className="text-[10px] text-muted-foreground">Falls back to header logo</span>}
                </div>

                {/* Powered By */}
                <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                  <input type="checkbox" checked={form.showPoweredBy} onChange={e => setForm({ ...form, showPoweredBy: e.target.checked })} className="w-3.5 h-3.5 rounded" />
                  Show "Powered by GenBotChat"
                </label>
              </div>

              {/* ─── CONTENT ─── */}
              <div className="border rounded-lg p-4 space-y-3">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Content</p>
                <div>
                  <label className="text-[11px] text-muted-foreground">Header Title</label>
                  <input value={form.headerTitle} onChange={e => setForm({ ...form, headerTitle: e.target.value })} placeholder="Chat with us"
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Header Subtitle</label>
                  <input value={form.headerSubtitle} onChange={e => setForm({ ...form, headerSubtitle: e.target.value })} placeholder="e.g., We typically reply in minutes"
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Welcome Message</label>
                  <input value={form.welcomeMessage} onChange={e => setForm({ ...form, welcomeMessage: e.target.value })} placeholder="Hi! How can I help you?"
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Input Placeholder</label>
                  <input value={form.inputPlaceholder} onChange={e => setForm({ ...form, inputPlaceholder: e.target.value })} placeholder="Type a message..."
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>

              {/* ─── SETTINGS ─── */}
              <div className="border rounded-lg p-4 space-y-3">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Settings</p>
                <div>
                  <label className="text-[11px] text-muted-foreground">Allowed Domains</label>
                  <input value={form.allowedDomains} onChange={e => setForm({ ...form, allowedDomains: e.target.value })} placeholder="example.com, app.example.com"
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-1">Comma-separated. Empty = all domains.</p>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">System Prompt</label>
                  <textarea value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} rows={3}
                    placeholder="Custom AI instructions for this widget..."
                    className="w-full px-3 py-2 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                  <p className="text-[10px] text-muted-foreground mt-1">Leave empty to use global prompt.</p>
                </div>
              </div>

              {/* ─── PUBLIC ACCESS ─── */}
              <div className="border rounded-lg p-4 space-y-3">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Access Mode</p>
                <div>
                  <label className="text-[11px] text-muted-foreground">Organization</label>
                  <select value={form.organizationId} onChange={e => setForm({ ...form, organizationId: e.target.value })}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="">— Select organization —</option>
                    {orgs.filter(o => o.type === 'organization').map(o => (
                      <option key={o._id} value={o._id}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Btn active={form.accessMode === 'private'} onClick={() => setForm({ ...form, accessMode: 'private' })}><Lock className="w-3.5 h-3.5 inline mr-1" />Private</Btn>
                  <Btn active={form.accessMode === 'public'} onClick={() => {
                    const selectedOrg = orgs.find(o => o._id === form.organizationId);
                    if (!selectedOrg?.publicEnabled) { toast.error("Selected organization does not have public access enabled"); return; }
                    setForm({ ...form, accessMode: 'public' });
                  }}><Globe className="w-3.5 h-3.5 inline mr-1" />Public</Btn>
                </div>
                {form.accessMode === 'public' && (
                  <>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Question Limit per Session</label>
                      <input type="number" min={1} max={100} value={form.publicChatLimit} onChange={e => setForm({ ...form, publicChatLimit: parseInt(e.target.value) || 5 })}
                        className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Fallback Message (when limit reached)</label>
                      <textarea value={form.fallbackMessage} onChange={e => setForm({ ...form, fallbackMessage: e.target.value })} rows={3}
                        placeholder="You have reached the question limit. Please contact Ahmad at 03-1234567 for further assistance."
                        className="w-full px-3 py-2 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleSubmit} className="text-xs h-8 flex-1">{editingWidget ? 'Update' : 'Create'}</Button>
                <Button size="sm" variant="outline" onClick={() => setShowModal(false)} className="text-xs h-8">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
