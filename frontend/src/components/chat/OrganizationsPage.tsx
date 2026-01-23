import { useState, useEffect } from 'react';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';

interface Organization {
  _id: string;
  name: string;
}

export function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      const data = await api.getOrganizations();
      setOrganizations(data);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleCreate = async () => {
    if (!newOrgName.trim()) return;
    setLoading(true);
    try {
      await api.createOrganization(newOrgName);
      setNewOrgName('');
      await loadOrganizations();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this organization?')) return;
    try {
      await api.deleteOrganization(id);
      await loadOrganizations();
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Organizations</h2>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Organization name"
              className="flex-1 px-4 py-2 border rounded-lg"
            />
            <button
              onClick={handleCreate}
              disabled={loading || !newOrgName.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {organizations.map((org) => (
            <div key={org._id} className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-gray-500" />
                <span className="font-medium">{org.name}</span>
              </div>
              <button
                onClick={() => handleDelete(org._id)}
                className="p-2 text-red-500 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
