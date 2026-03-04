import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Edit2, Save, X, Trash2 } from "lucide-react";

interface RobotSetting {
  _id: string;
  name: string;
  description: string;
  navigation: NavigationEntry[];
  motion: MotionEntry[];
  emotion: EmotionEntry[];
  createdAt: string;
  updatedAt: string;
}

interface NavigationEntry {
  id: string;
  title: string;
  description: string;
}

interface MotionEntry {
  id: string;
  name: string;
}

interface EmotionEntry {
  id: string;
  name: string;
}

export const RobotSettingsPage = () => {
  const [robots, setRobots] = useState<RobotSetting[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [selectedRobot, setSelectedRobot] = useState<RobotSetting | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRobotName, setNewRobotName] = useState("");
  const [newRobotDesc, setNewRobotDesc] = useState("");

  // Editing states
  const [editingNav, setEditingNav] = useState<string | null>(null);
  const [editingMotion, setEditingMotion] = useState<string | null>(null);
  const [editingEmotion, setEditingEmotion] = useState<string | null>(null);
  const [addingNav, setAddingNav] = useState(false);
  const [addingMotion, setAddingMotion] = useState(false);
  const [addingEmotion, setAddingEmotion] = useState(false);

  // Form states
  const [navForm, setNavForm] = useState({ id: "", title: "", description: "" });
  const [motionForm, setMotionForm] = useState({ id: "", name: "" });
  const [emotionForm, setEmotionForm] = useState({ id: "", name: "" });

  useEffect(() => {
    loadRobots();
  }, []);

  useEffect(() => {
    if (selectedRobotId) {
      loadRobot(selectedRobotId);
    }
  }, [selectedRobotId]);

  const loadRobots = async () => {
    try {
      const data = await api.getRobotSettings();
      setRobots(data);
      if (data.length > 0 && !selectedRobotId) {
        setSelectedRobotId(data[0]._id);
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const loadRobot = async (id: string) => {
    try {
      const data = await api.getRobotSetting(id);
      setSelectedRobot(data);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCreateRobot = async () => {
    if (!newRobotName) {
      toast.error("Please enter robot name");
      return;
    }
    try {
      await api.createRobotSetting(newRobotName, newRobotDesc);
      setShowCreateModal(false);
      setNewRobotName("");
      setNewRobotDesc("");
      loadRobots();
      toast.success("Robot created");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteRobot = async (id: string) => {
    if (!confirm("Are you sure you want to delete this robot?")) return;
    try {
      await api.deleteRobotSetting(id);
      loadRobots();
      if (selectedRobotId === id) {
        setSelectedRobotId(null);
        setSelectedRobot(null);
      }
      toast.success("Robot deleted");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const saveRobot = async () => {
    if (!selectedRobot) return;
    try {
      await api.updateRobotSetting(selectedRobot._id, {
        name: selectedRobot.name,
        description: selectedRobot.description,
        navigation: selectedRobot.navigation,
        motion: selectedRobot.motion,
        emotion: selectedRobot.emotion,
      });
      toast.success("Saved");
      loadRobots();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Navigation handlers
  const addNavEntry = () => {
    if (!selectedRobot || !navForm.id || !navForm.title) {
      toast.error("Please fill all fields");
      return;
    }
    if (selectedRobot.navigation.some(n => n.id === navForm.id)) {
      toast.error("ID already exists");
      return;
    }
    setSelectedRobot({
      ...selectedRobot,
      navigation: [...selectedRobot.navigation, navForm]
    });
    setNavForm({ id: "", title: "", description: "" });
    setAddingNav(false);
  };

  const updateNavEntry = (oldId: string) => {
    if (!selectedRobot || !navForm.id || !navForm.title) {
      toast.error("Please fill all fields");
      return;
    }
    if (oldId !== navForm.id && selectedRobot.navigation.some(n => n.id === navForm.id)) {
      toast.error("ID already exists");
      return;
    }
    setSelectedRobot({
      ...selectedRobot,
      navigation: selectedRobot.navigation.map(n => n.id === oldId ? navForm : n)
    });
    setEditingNav(null);
    setNavForm({ id: "", title: "", description: "" });
  };

  const deleteNavEntry = (id: string) => {
    if (!selectedRobot) return;
    setSelectedRobot({
      ...selectedRobot,
      navigation: selectedRobot.navigation.filter(n => n.id !== id)
    });
  };

  // Motion handlers
  const addMotionEntry = () => {
    if (!selectedRobot || !motionForm.id || !motionForm.name) {
      toast.error("Please fill all fields");
      return;
    }
    if (selectedRobot.motion.some(m => m.id === motionForm.id)) {
      toast.error("ID already exists");
      return;
    }
    setSelectedRobot({
      ...selectedRobot,
      motion: [...selectedRobot.motion, motionForm]
    });
    setMotionForm({ id: "", name: "" });
    setAddingMotion(false);
  };

  const updateMotionEntry = (oldId: string) => {
    if (!selectedRobot || !motionForm.id || !motionForm.name) {
      toast.error("Please fill all fields");
      return;
    }
    if (oldId !== motionForm.id && selectedRobot.motion.some(m => m.id === motionForm.id)) {
      toast.error("ID already exists");
      return;
    }
    setSelectedRobot({
      ...selectedRobot,
      motion: selectedRobot.motion.map(m => m.id === oldId ? motionForm : m)
    });
    setEditingMotion(null);
    setMotionForm({ id: "", name: "" });
  };

  const deleteMotionEntry = (id: string) => {
    if (!selectedRobot) return;
    setSelectedRobot({
      ...selectedRobot,
      motion: selectedRobot.motion.filter(m => m.id !== id)
    });
  };

  // Emotion handlers
  const addEmotionEntry = () => {
    if (!selectedRobot || !emotionForm.id || !emotionForm.name) {
      toast.error("Please fill all fields");
      return;
    }
    if (selectedRobot.emotion.some(e => e.id === emotionForm.id)) {
      toast.error("ID already exists");
      return;
    }
    setSelectedRobot({
      ...selectedRobot,
      emotion: [...selectedRobot.emotion, emotionForm]
    });
    setEmotionForm({ id: "", name: "" });
    setAddingEmotion(false);
  };

  const updateEmotionEntry = (oldId: string) => {
    if (!selectedRobot || !emotionForm.id || !emotionForm.name) {
      toast.error("Please fill all fields");
      return;
    }
    if (oldId !== emotionForm.id && selectedRobot.emotion.some(e => e.id === emotionForm.id)) {
      toast.error("ID already exists");
      return;
    }
    setSelectedRobot({
      ...selectedRobot,
      emotion: selectedRobot.emotion.map(e => e.id === oldId ? emotionForm : e)
    });
    setEditingEmotion(null);
    setEmotionForm({ id: "", name: "" });
  };

  const deleteEmotionEntry = (id: string) => {
    if (!selectedRobot) return;
    setSelectedRobot({
      ...selectedRobot,
      emotion: selectedRobot.emotion.filter(e => e.id !== id)
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Robot Settings</h1>
            <p className="text-muted-foreground">Manage robot navigation, motion, and emotion data</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Robot
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-6">
          {/* Robot List Sidebar */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Robots</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {robots.map((robot) => (
                  <div
                    key={robot._id}
                    className={`p-3 rounded-lg cursor-pointer flex justify-between items-center ${
                      selectedRobotId === robot._id ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                    }`}
                    onClick={() => setSelectedRobotId(robot._id)}
                  >
                    <span className="font-medium">{robot.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRobot(robot._id);
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Robot Details */}
          <div className="col-span-3 space-y-6">
            {selectedRobot ? (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>{selectedRobot.name}</CardTitle>
                      <Button onClick={saveRobot}>
                        <Save className="w-4 h-4 mr-2" />
                        Save All Changes
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{selectedRobot.description}</p>
                  </CardContent>
                </Card>

                {/* Navigation Table */}
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>📍 Navigation</CardTitle>
                      <Button size="sm" onClick={() => setAddingNav(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">ID</th>
                          <th className="text-left p-2">Title</th>
                          <th className="text-left p-2">Description</th>
                          <th className="text-right p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRobot.navigation.map((nav) => (
                          <tr key={nav.id} className="border-b">
                            {editingNav === nav.id ? (
                              <>
                                <td className="p-2"><Input value={navForm.id} onChange={(e) => setNavForm({...navForm, id: e.target.value})} /></td>
                                <td className="p-2"><Input value={navForm.title} onChange={(e) => setNavForm({...navForm, title: e.target.value})} /></td>
                                <td className="p-2"><Input value={navForm.description} onChange={(e) => setNavForm({...navForm, description: e.target.value})} /></td>
                                <td className="p-2 text-right space-x-2">
                                  <Button size="sm" onClick={() => updateNavEntry(nav.id)}><Save className="w-4 h-4" /></Button>
                                  <Button size="sm" variant="outline" onClick={() => { setEditingNav(null); setNavForm({ id: "", title: "", description: "" }); }}><X className="w-4 h-4" /></Button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="p-2">{nav.id}</td>
                                <td className="p-2">{nav.title}</td>
                                <td className="p-2">{nav.description}</td>
                                <td className="p-2 text-right space-x-2">
                                  <Button size="sm" variant="outline" onClick={() => { setEditingNav(nav.id); setNavForm(nav); }}><Edit2 className="w-4 h-4" /></Button>
                                  <Button size="sm" variant="outline" onClick={() => deleteNavEntry(nav.id)}><Trash2 className="w-4 h-4" /></Button>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                        {addingNav && (
                          <tr className="border-b bg-muted">
                            <td className="p-2"><Input placeholder="ID" value={navForm.id} onChange={(e) => setNavForm({...navForm, id: e.target.value})} /></td>
                            <td className="p-2"><Input placeholder="Title" value={navForm.title} onChange={(e) => setNavForm({...navForm, title: e.target.value})} /></td>
                            <td className="p-2"><Input placeholder="Description" value={navForm.description} onChange={(e) => setNavForm({...navForm, description: e.target.value})} /></td>
                            <td className="p-2 text-right space-x-2">
                              <Button size="sm" onClick={addNavEntry}><Save className="w-4 h-4" /></Button>
                              <Button size="sm" variant="outline" onClick={() => { setAddingNav(false); setNavForm({ id: "", title: "", description: "" }); }}><X className="w-4 h-4" /></Button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Motion Table */}
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>🏃 Motion</CardTitle>
                      <Button size="sm" onClick={() => setAddingMotion(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">ID</th>
                          <th className="text-left p-2">Name</th>
                          <th className="text-right p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRobot.motion.map((motion) => (
                          <tr key={motion.id} className="border-b">
                            {editingMotion === motion.id ? (
                              <>
                                <td className="p-2"><Input value={motionForm.id} onChange={(e) => setMotionForm({...motionForm, id: e.target.value})} /></td>
                                <td className="p-2"><Input value={motionForm.name} onChange={(e) => setMotionForm({...motionForm, name: e.target.value})} /></td>
                                <td className="p-2 text-right space-x-2">
                                  <Button size="sm" onClick={() => updateMotionEntry(motion.id)}><Save className="w-4 h-4" /></Button>
                                  <Button size="sm" variant="outline" onClick={() => { setEditingMotion(null); setMotionForm({ id: "", name: "" }); }}><X className="w-4 h-4" /></Button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="p-2">{motion.id}</td>
                                <td className="p-2">{motion.name}</td>
                                <td className="p-2 text-right space-x-2">
                                  <Button size="sm" variant="outline" onClick={() => { setEditingMotion(motion.id); setMotionForm(motion); }}><Edit2 className="w-4 h-4" /></Button>
                                  <Button size="sm" variant="outline" onClick={() => deleteMotionEntry(motion.id)}><Trash2 className="w-4 h-4" /></Button>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                        {addingMotion && (
                          <tr className="border-b bg-muted">
                            <td className="p-2"><Input placeholder="ID" value={motionForm.id} onChange={(e) => setMotionForm({...motionForm, id: e.target.value})} /></td>
                            <td className="p-2"><Input placeholder="Name" value={motionForm.name} onChange={(e) => setMotionForm({...motionForm, name: e.target.value})} /></td>
                            <td className="p-2 text-right space-x-2">
                              <Button size="sm" onClick={addMotionEntry}><Save className="w-4 h-4" /></Button>
                              <Button size="sm" variant="outline" onClick={() => { setAddingMotion(false); setMotionForm({ id: "", name: "" }); }}><X className="w-4 h-4" /></Button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Emotion Table */}
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>😊 Emotion</CardTitle>
                      <Button size="sm" onClick={() => setAddingEmotion(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">ID</th>
                          <th className="text-left p-2">Name</th>
                          <th className="text-right p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRobot.emotion.map((emotion) => (
                          <tr key={emotion.id} className="border-b">
                            {editingEmotion === emotion.id ? (
                              <>
                                <td className="p-2"><Input value={emotionForm.id} onChange={(e) => setEmotionForm({...emotionForm, id: e.target.value})} /></td>
                                <td className="p-2"><Input value={emotionForm.name} onChange={(e) => setEmotionForm({...emotionForm, name: e.target.value})} /></td>
                                <td className="p-2 text-right space-x-2">
                                  <Button size="sm" onClick={() => updateEmotionEntry(emotion.id)}><Save className="w-4 h-4" /></Button>
                                  <Button size="sm" variant="outline" onClick={() => { setEditingEmotion(null); setEmotionForm({ id: "", name: "" }); }}><X className="w-4 h-4" /></Button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="p-2">{emotion.id}</td>
                                <td className="p-2">{emotion.name}</td>
                                <td className="p-2 text-right space-x-2">
                                  <Button size="sm" variant="outline" onClick={() => { setEditingEmotion(emotion.id); setEmotionForm(emotion); }}><Edit2 className="w-4 h-4" /></Button>
                                  <Button size="sm" variant="outline" onClick={() => deleteEmotionEntry(emotion.id)}><Trash2 className="w-4 h-4" /></Button>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                        {addingEmotion && (
                          <tr className="border-b bg-muted">
                            <td className="p-2"><Input placeholder="ID" value={emotionForm.id} onChange={(e) => setEmotionForm({...emotionForm, id: e.target.value})} /></td>
                            <td className="p-2"><Input placeholder="Name" value={emotionForm.name} onChange={(e) => setEmotionForm({...emotionForm, name: e.target.value})} /></td>
                            <td className="p-2 text-right space-x-2">
                              <Button size="sm" onClick={addEmotionEntry}><Save className="w-4 h-4" /></Button>
                              <Button size="sm" variant="outline" onClick={() => { setAddingEmotion(false); setEmotionForm({ id: "", name: "" }); }}><X className="w-4 h-4" /></Button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground">
                  Select a robot or create a new one
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Create Robot Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Add Robot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Robot Name</Label>
                  <Input
                    placeholder="e.g., Robot Alpha"
                    value={newRobotName}
                    onChange={(e) => setNewRobotName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    placeholder="e.g., Main lobby robot"
                    value={newRobotDesc}
                    onChange={(e) => setNewRobotDesc(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateRobot} disabled={!newRobotName}>Create</Button>
                  <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
