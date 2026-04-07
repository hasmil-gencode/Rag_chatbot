import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Edit2, Save, X, Trash2, Bot } from "lucide-react";

interface RobotSetting { _id: string; name: string; description: string; navigation: { id: string; title: string; description: string }[]; motion: { id: string; name: string }[]; emotion: { id: string; name: string }[]; createdAt: string; updatedAt: string; }

export const RobotSettingsPage = () => {
  const [robots, setRobots] = useState<RobotSetting[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [selectedRobot, setSelectedRobot] = useState<RobotSetting | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRobotName, setNewRobotName] = useState("");
  const [newRobotDesc, setNewRobotDesc] = useState("");
  const [editingNav, setEditingNav] = useState<string | null>(null);
  const [editingMotion, setEditingMotion] = useState<string | null>(null);
  const [editingEmotion, setEditingEmotion] = useState<string | null>(null);
  const [addingNav, setAddingNav] = useState(false);
  const [addingMotion, setAddingMotion] = useState(false);
  const [addingEmotion, setAddingEmotion] = useState(false);
  const [navForm, setNavForm] = useState({ id: "", title: "", description: "" });
  const [motionForm, setMotionForm] = useState({ id: "", name: "" });
  const [emotionForm, setEmotionForm] = useState({ id: "", name: "" });

  useEffect(() => { loadRobots(); }, []);
  useEffect(() => { if (selectedRobotId) loadRobot(selectedRobotId); }, [selectedRobotId]);

  const loadRobots = async () => { try { const data = await api.getRobotSettings(); setRobots(data); if (data.length > 0 && !selectedRobotId) setSelectedRobotId(data[0]._id); } catch (e: any) { toast.error(e.message); } };
  const loadRobot = async (id: string) => { try { setSelectedRobot(await api.getRobotSetting(id)); } catch (e: any) { toast.error(e.message); } };

  const handleCreateRobot = async () => {
    if (!newRobotName) { toast.error("Enter robot name"); return; }
    try { await api.createRobotSetting(newRobotName, newRobotDesc); setShowCreateModal(false); setNewRobotName(""); setNewRobotDesc(""); loadRobots(); toast.success("Robot created"); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteRobot = async (id: string) => {
    if (!confirm("Delete this robot?")) return;
    try { await api.deleteRobotSetting(id); loadRobots(); if (selectedRobotId === id) { setSelectedRobotId(null); setSelectedRobot(null); } toast.success("Robot deleted"); }
    catch (e: any) { toast.error(e.message); }
  };

  const saveRobot = async () => {
    if (!selectedRobot) return;
    try { await api.updateRobotSetting(selectedRobot._id, { name: selectedRobot.name, description: selectedRobot.description, navigation: selectedRobot.navigation, motion: selectedRobot.motion, emotion: selectedRobot.emotion }); toast.success("Saved"); loadRobots(); }
    catch (e: any) { toast.error(e.message); }
  };

  // Navigation handlers
  const addNavEntry = () => {
    if (!selectedRobot || !navForm.id || !navForm.title) { toast.error("Fill all fields"); return; }
    if (selectedRobot.navigation.some(n => n.id === navForm.id)) { toast.error("ID exists"); return; }
    setSelectedRobot({ ...selectedRobot, navigation: [...selectedRobot.navigation, navForm] }); setNavForm({ id: "", title: "", description: "" }); setAddingNav(false);
  };
  const updateNavEntry = (oldId: string) => {
    if (!selectedRobot || !navForm.id || !navForm.title) { toast.error("Fill all fields"); return; }
    if (oldId !== navForm.id && selectedRobot.navigation.some(n => n.id === navForm.id)) { toast.error("ID exists"); return; }
    setSelectedRobot({ ...selectedRobot, navigation: selectedRobot.navigation.map(n => n.id === oldId ? navForm : n) }); setEditingNav(null); setNavForm({ id: "", title: "", description: "" });
  };
  const deleteNavEntry = (id: string) => { if (selectedRobot) setSelectedRobot({ ...selectedRobot, navigation: selectedRobot.navigation.filter(n => n.id !== id) }); };

  // Motion handlers
  const addMotionEntry = () => {
    if (!selectedRobot || !motionForm.id || !motionForm.name) { toast.error("Fill all fields"); return; }
    if (selectedRobot.motion.some(m => m.id === motionForm.id)) { toast.error("ID exists"); return; }
    setSelectedRobot({ ...selectedRobot, motion: [...selectedRobot.motion, motionForm] }); setMotionForm({ id: "", name: "" }); setAddingMotion(false);
  };
  const updateMotionEntry = (oldId: string) => {
    if (!selectedRobot || !motionForm.id || !motionForm.name) { toast.error("Fill all fields"); return; }
    if (oldId !== motionForm.id && selectedRobot.motion.some(m => m.id === motionForm.id)) { toast.error("ID exists"); return; }
    setSelectedRobot({ ...selectedRobot, motion: selectedRobot.motion.map(m => m.id === oldId ? motionForm : m) }); setEditingMotion(null); setMotionForm({ id: "", name: "" });
  };
  const deleteMotionEntry = (id: string) => { if (selectedRobot) setSelectedRobot({ ...selectedRobot, motion: selectedRobot.motion.filter(m => m.id !== id) }); };

  // Emotion handlers
  const addEmotionEntry = () => {
    if (!selectedRobot || !emotionForm.id || !emotionForm.name) { toast.error("Fill all fields"); return; }
    if (selectedRobot.emotion.some(e => e.id === emotionForm.id)) { toast.error("ID exists"); return; }
    setSelectedRobot({ ...selectedRobot, emotion: [...selectedRobot.emotion, emotionForm] }); setEmotionForm({ id: "", name: "" }); setAddingEmotion(false);
  };
  const updateEmotionEntry = (oldId: string) => {
    if (!selectedRobot || !emotionForm.id || !emotionForm.name) { toast.error("Fill all fields"); return; }
    if (oldId !== emotionForm.id && selectedRobot.emotion.some(e => e.id === emotionForm.id)) { toast.error("ID exists"); return; }
    setSelectedRobot({ ...selectedRobot, emotion: selectedRobot.emotion.map(e => e.id === oldId ? emotionForm : e) }); setEditingEmotion(null); setEmotionForm({ id: "", name: "" });
  };
  const deleteEmotionEntry = (id: string) => { if (selectedRobot) setSelectedRobot({ ...selectedRobot, emotion: selectedRobot.emotion.filter(e => e.id !== id) }); };

  const renderTable = (title: string, items: any[], type: 'nav' | 'motion' | 'emotion') => {
    const isNav = type === 'nav';
    const editing = type === 'nav' ? editingNav : type === 'motion' ? editingMotion : editingEmotion;
    const adding = type === 'nav' ? addingNav : type === 'motion' ? addingMotion : addingEmotion;
    const form = type === 'nav' ? navForm : type === 'motion' ? motionForm : emotionForm;
    const setForm = type === 'nav' ? setNavForm : type === 'motion' ? setMotionForm : setEmotionForm;
    const setAdding = type === 'nav' ? setAddingNav : type === 'motion' ? setAddingMotion : setAddingEmotion;
    const setEditing = type === 'nav' ? setEditingNav : type === 'motion' ? setEditingMotion : setEditingEmotion;
    const addEntry = type === 'nav' ? addNavEntry : type === 'motion' ? addMotionEntry : addEmotionEntry;
    const updateEntry = type === 'nav' ? updateNavEntry : type === 'motion' ? updateMotionEntry : updateEmotionEntry;
    const deleteEntry = type === 'nav' ? deleteNavEntry : type === 'motion' ? deleteMotionEntry : deleteEmotionEntry;

    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b flex items-center justify-between">
          <p className="text-xs font-medium">{title}</p>
          <button onClick={() => setAdding(true)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">ID</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{isNav ? 'Title' : 'Name'}</th>
              {isNav && <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Description</th>}
              <th className="px-4 py-2.5 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t hover:bg-muted/30 transition-colors">
                {editing === item.id ? (
                  <>
                    <td className="px-4 py-2"><input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value } as any)} className="w-full h-8 px-2 text-xs rounded border bg-transparent" /></td>
                    <td className="px-4 py-2"><input value={isNav ? (form as any).title : (form as any).name} onChange={(e) => setForm(isNav ? { ...form, title: e.target.value } as any : { ...form, name: e.target.value } as any)} className="w-full h-8 px-2 text-xs rounded border bg-transparent" /></td>
                    {isNav && <td className="px-4 py-2"><input value={(form as any).description} onChange={(e) => setForm({ ...form, description: e.target.value } as any)} className="w-full h-8 px-2 text-xs rounded border bg-transparent" /></td>}
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => updateEntry(item.id)} className="p-1 rounded hover:bg-muted text-green-500"><Save className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { setEditing(null); setForm(isNav ? { id: "", title: "", description: "" } as any : { id: "", name: "" } as any); }} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.id}</td>
                    <td className="px-4 py-2.5">{isNav ? item.title : item.name}</td>
                    {isNav && <td className="px-4 py-2.5 text-muted-foreground">{item.description}</td>}
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => { setEditing(item.id); setForm(item as any); }} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteEntry(item.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {adding && (
              <tr className="border-t bg-muted/30">
                <td className="px-4 py-2"><input placeholder="ID" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value } as any)} className="w-full h-8 px-2 text-xs rounded border bg-transparent" /></td>
                <td className="px-4 py-2"><input placeholder={isNav ? "Title" : "Name"} value={isNav ? (form as any).title : (form as any).name} onChange={(e) => setForm(isNav ? { ...form, title: e.target.value } as any : { ...form, name: e.target.value } as any)} className="w-full h-8 px-2 text-xs rounded border bg-transparent" /></td>
                {isNav && <td className="px-4 py-2"><input placeholder="Description" value={(form as any).description} onChange={(e) => setForm({ ...form, description: e.target.value } as any)} className="w-full h-8 px-2 text-xs rounded border bg-transparent" /></td>}
                <td className="px-4 py-2 text-right">
                  <button onClick={addEntry} className="p-1 rounded hover:bg-muted text-green-500"><Save className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setAdding(false); setForm(isNav ? { id: "", title: "", description: "" } as any : { id: "", name: "" } as any); }} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            )}
            {items.length === 0 && !adding && <tr><td colSpan={isNav ? 4 : 3} className="px-4 py-8 text-center text-sm text-muted-foreground">No entries</td></tr>}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Hardware</p>
            <h1 className="text-xl font-semibold">Robot Settings</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage robot navigation, motion, and emotion data.</p>
          </div>
          <Button size="sm" onClick={() => setShowCreateModal(true)} className="text-xs h-8 rounded-lg">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Robot
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Robots</p>
            <p className="text-2xl font-semibold mt-0.5">{robots.length}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Navigation Points</p>
            <p className="text-2xl font-semibold mt-0.5">{selectedRobot?.navigation.length || 0}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Motions</p>
            <p className="text-2xl font-semibold mt-0.5">{selectedRobot?.motion.length || 0}</p>
          </div>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Emotions</p>
            <p className="text-2xl font-semibold mt-0.5">{selectedRobot?.emotion.length || 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-5">
          {/* Robot List */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b">
              <p className="text-xs font-medium flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> Robots</p>
            </div>
            <div className="p-2 space-y-1">
              {robots.map((robot) => (
                <div key={robot._id} onClick={() => setSelectedRobotId(robot._id)}
                  className={`px-3 py-2 rounded-lg cursor-pointer flex justify-between items-center text-[13px] ${selectedRobotId === robot._id ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>
                  <span className="font-medium truncate">{robot.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteRobot(robot._id); }} className={`p-1 rounded ${selectedRobotId === robot._id ? 'hover:bg-background/20' : 'hover:bg-muted'}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {robots.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No robots</p>}
            </div>
          </div>

          {/* Robot Details */}
          <div className="col-span-3 space-y-5">
            {selectedRobot ? (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b flex items-center justify-between">
                    <p className="text-xs font-medium">{selectedRobot.name}</p>
                    <Button size="sm" onClick={saveRobot} className="text-xs h-7"><Save className="w-3.5 h-3.5 mr-1" /> Save All</Button>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-muted-foreground">{selectedRobot.description || 'No description'}</p>
                  </div>
                </div>
                {renderTable('📍 Navigation', selectedRobot.navigation, 'nav')}
                {renderTable('🏃 Motion', selectedRobot.motion, 'motion')}
                {renderTable('😊 Emotion', selectedRobot.emotion, 'emotion')}
              </>
            ) : (
              <div className="border rounded-lg px-4 py-12 text-center text-sm text-muted-foreground">Select a robot or create a new one</div>
            )}
          </div>
        </div>

        {/* API Documentation */}
        <div className="border rounded-lg overflow-hidden mt-5">
          <div className="px-4 py-2.5 border-b">
            <p className="text-xs font-medium">Robot API Documentation</p>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Get Robot Data</p>
              <code className="block text-xs bg-muted px-3 py-2 rounded">GET /api/robot-data</code>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Sync Navigation</p>
              <code className="block text-xs bg-muted px-3 py-2 rounded">POST /api/robot-navigation</code>
            </div>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-background rounded-xl p-5 w-full max-w-md mx-4 border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Add Robot</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground">Robot Name</label>
                <input value={newRobotName} onChange={(e) => setNewRobotName(e.target.value)} placeholder="e.g., Robot Alpha"
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Description</label>
                <input value={newRobotDesc} onChange={(e) => setNewRobotDesc(e.target.value)} placeholder="e.g., Main lobby robot"
                  className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleCreateRobot} disabled={!newRobotName} className="text-xs h-8 flex-1">Create</Button>
                <Button size="sm" variant="outline" onClick={() => setShowCreateModal(false)} className="text-xs h-8">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
