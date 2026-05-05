import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "./ConfirmDialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Trash2, Edit, Database, X, Copy, Clock } from "lucide-react";

export const ExternalKnowledgePage = () => {
  const [collections, setCollections] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [formData, setFormData] = useState({ name: "", description: "", organizationIds: [] as string[] });
  const confirm = useConfirm();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [cols, orgs] = await Promise.all([api.getExternalCollections(), api.getAllOrganizations()]);
      setCollections(cols);
      setOrganizations((orgs.organizations || []).filter((o: any) => o.type === 'organization'));
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await api.updateExternalCollection(editing._id, formData);
      else await api.createExternalCollection(formData);
      setShowForm(false); setEditing(null); setFormData({ name: "", description: "", organizationIds: [] }); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = (col: any) => {
    setEditing(col);
    setFormData({ name: col.name, description: col.description || "", organizationIds: (col.organizationIds || []).map((id: any) => id.toString ? id.toString() : id) });
    setShowForm(true);
  };

  const handleDelete = async (col: any) => {
    if (await confirm(`Delete "${col.name}"? This will also remove all ${col.recordCount || 0} vectors from Qdrant.`)) {
      try { await api.deleteExternalCollection(col._id); load(); } catch (e: any) { toast.error(e.message); }
    }
  };

  const copyEndpoint = (id: string) => {
    const example = `POST /api/ingest\n{\n  "collectionId": "${id}",\n  "records": [\n    { "id": 1, "name": "Example" }\n  ]\n}`;
    navigator.clipboard.writeText(example);
    toast.success("Ingest example copied to clipboard");
  };

  const toggleOrg = (orgId: string) => {
    setFormData(prev => ({
      ...prev,
      organizationIds: prev.organizationIds.includes(orgId)
        ? prev.organizationIds.filter(id => id !== orgId)
        : [...prev.organizationIds, orgId]
    }));
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Developer</p>
            <h1 className="text-xl font-semibold">External Knowledge</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage external data collections for AI knowledge base.</p>
          </div>
          <Button size="sm" onClick={() => { setShowForm(true); setEditing(null); setFormData({ name: "", description: "", organizationIds: [] }); }} className="text-xs h-8 rounded-lg">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Collection
          </Button>
        </div>

        {/* Collections */}
        <div className="space-y-3">
          {collections.length === 0 ? (
            <div className="border rounded-lg px-4 py-12 text-center text-sm text-muted-foreground">
              No external collections yet. Create one and use the Ingest API from Node-RED.
            </div>
          ) : collections.map(col => (
            <div key={col._id} className="border rounded-lg overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{col.name}</p>
                    {col.description && <p className="text-[11px] text-muted-foreground">{col.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => copyEndpoint(col._id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Copy ingest example"><Copy className="w-4 h-4" /></button>
                  <button onClick={() => handleEdit(col)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(col)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="px-4 py-2 border-t bg-muted/30 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span>{col.recordCount || 0} records</span>
                <span>Orgs: {col.organizationIds?.length || 0}</span>
                {col.lastIngestAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last ingest: {new Date(col.lastIngestAt).toLocaleString()}</span>}
                <span className="font-mono text-[10px] ml-auto select-all">ID: {col._id}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Ingest API Docs */}
        <div className="border rounded-lg overflow-hidden mt-5">
          <div className="px-4 py-2.5 border-b"><p className="text-xs font-medium">Ingest API</p></div>
          <div className="p-4 space-y-3">
            <div><p className="text-[11px] text-muted-foreground mb-1">Endpoint</p><code className="block text-xs bg-muted px-3 py-2 rounded">POST /api/ingest</code></div>
            <div><p className="text-[11px] text-muted-foreground mb-1">Auth (any one)</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`x-internal-key: YOUR_INTERNAL_KEY\nx-api-key: YOUR_API_KEY\nAuthorization: Bearer JWT_TOKEN`}</pre></div>
            <div><p className="text-[11px] text-muted-foreground mb-1">Body</p><pre className="text-xs bg-muted px-3 py-2 rounded whitespace-pre-wrap">{`{
  "collectionId": "collection_id_here",
  "records": [
    {
      "content": "PO-001, Customer: ABC, RM5000",
      "metadata": {
        "externalUserId": "ali_123",
        "company": "ABC Sdn Bhd",
        "type": "purchase_order"
      }
    }
  ]
}`}</pre></div>
            <div className="pt-1">
              <p className="text-[11px] text-muted-foreground mb-1">Notes</p>
              <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc pl-4">
                <li><code className="text-[10px]">content</code> — text to embed (or auto-generated from record fields)</li>
                <li><code className="text-[10px]">metadata</code> — optional, stored in Qdrant payload for filtering</li>
                <li><code className="text-[10px]">externalUserId</code> — restricts access to this external user only</li>
                <li>Records without <code className="text-[10px]">externalUserId</code> are accessible to all users in assigned orgs</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
            <div className="bg-background border rounded-xl p-5 w-[480px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">{editing ? 'Edit Collection' : 'Create Collection'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-[11px] text-muted-foreground">Name</label>
                  <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="e.g. Diagnosis Data" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Description</label>
                  <input value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Optional description" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-2 block">Assign to Organizations</label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {organizations.map(org => (
                      <label key={org._id} className="flex items-center gap-2 cursor-pointer text-xs">
                        <input type="checkbox" checked={formData.organizationIds.includes(org._id)} onChange={() => toggleOrg(org._id)} className="rounded" />
                        {org.name}
                      </label>
                    ))}
                    {organizations.length === 0 && <p className="text-[11px] text-muted-foreground">No organizations found</p>}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" size="sm" className="text-xs h-8 flex-1">{editing ? 'Update' : 'Create'}</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)} className="text-xs h-8">Cancel</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
