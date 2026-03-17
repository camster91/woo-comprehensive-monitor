import { useEffect, useState } from "react";
import { api, apiPost, apiDelete } from "../api/client";
import PageHeader from "../components/PageHeader";
import DataTable from "../components/DataTable";
import { SkeletonCard } from "../components/Skeleton";
import { Users, Plus, Trash2, X } from "lucide-react";

export default function PortalUsers() {
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ storeId: "", email: "", name: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const fetchUsers = () => {
    api("/api/portal-users").then(r => setUsers(r.users || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
    api("/api/stores").then(r => setStores(r.stores || [])).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/portal-users", form);
      setShowForm(false);
      setForm({ storeId: "", email: "", name: "", password: "" });
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this portal user?")) return;
    await apiDelete(`/api/portal-users/${id}`);
    fetchUsers();
  };

  const columns = [
    { key: "name", label: "Name", sortable: true, render: (v) => v || "\u2014" },
    { key: "email", label: "Email", sortable: true },
    { key: "store_name", label: "Store", sortable: true },
    { key: "created_at", label: "Created", sortable: true, render: (v) => v ? new Date(v).toLocaleDateString() : "\u2014" },
    { key: "id", label: "", sortable: false, render: (v) => (
      <button onClick={() => handleDelete(v)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
    )},
  ];

  if (loading) return <div className="space-y-6"><SkeletonCard className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Client Portal" subtitle="Manage portal access for store owners">
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors">
          {showForm ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Add User</>}
        </button>
      </PageHeader>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Store</label>
              <select value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))} required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none">
                <option value="">Select store...</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" placeholder="Client name" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" placeholder="client@example.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Password</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" placeholder="Set password" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors">
            {saving ? "Creating..." : "Create Portal User"}
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Users size={15} className="text-indigo-500" /> Portal Users ({users.length})
        </h2>
        {users.length > 0 ? (
          <DataTable columns={columns} data={users} />
        ) : (
          <div className="text-center py-8">
            <Users size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">No portal users yet</p>
            <p className="text-xs text-slate-300 mt-1">Click "Add User" to create portal access for a store owner</p>
          </div>
        )}
      </div>
    </div>
  );
}
