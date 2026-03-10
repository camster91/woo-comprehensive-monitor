import { useEffect, useState } from "react";
import { api, apiPost, apiPatch, apiDelete } from "../api/client";

export default function Stores() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);

  const loadStores = () => {
    api("/api/stores").then(d => { setStores(d.stores || []); setLoading(false); });
  };

  useEffect(() => { loadStores(); }, []);

  if (loading) return <div className="text-gray-500">Loading stores...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Stores ({stores.length})</h2>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          Add Store
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.map(s => (
          <StoreCard key={s.id} store={s} onClick={() => setSelected(s)} />
        ))}
      </div>

      {showAdd && <AddStoreModal onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); loadStores(); }} />}
      {selected && <StoreDetailModal storeId={selected.id} onClose={() => setSelected(null)} onUpdate={loadStores} />}
    </div>
  );
}

function StoreCard({ store, onClick }) {
  const healthColors = {
    excellent: "bg-green-100 text-green-700",
    good: "bg-blue-100 text-blue-700",
    warning: "bg-yellow-100 text-yellow-700",
    critical: "bg-red-100 text-red-700",
    unknown: "bg-gray-100 text-gray-700",
  };

  return (
    <div onClick={onClick} className="bg-white rounded-xl p-5 shadow-sm border hover:border-blue-400 cursor-pointer transition-colors">
      <h3 className="font-medium text-lg">{store.name}</h3>
      <p className="text-sm text-gray-500 truncate">{store.url}</p>
      <div className="mt-3 flex gap-2 flex-wrap">
        {store.hasApiCredentials && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">API Connected</span>}
        <span className="text-xs text-gray-400">Plugin v{store.plugin_version || "?"}</span>
        <span className="text-xs text-gray-400">WC {store.woocommerce_version || "?"}</span>
      </div>
      {store.last_seen && (
        <p className="text-xs text-gray-400 mt-2">Last seen: {new Date(store.last_seen).toLocaleString()}</p>
      )}
    </div>
  );
}

function AddStoreModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ name: "", url: "", consumerKey: "", consumerSecret: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/stores", form);
      onSuccess();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Add Store</h3>
        <form onSubmit={submit} className="space-y-3">
          <input placeholder="Store Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="Store URL (https://...)" required value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="Consumer Key (optional)" value={form.consumerKey} onChange={e => setForm({ ...form, consumerKey: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="Consumer Secret (optional)" value={form.consumerSecret} onChange={e => setForm({ ...form, consumerSecret: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm" type="password" />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
              {saving ? "Adding..." : "Add Store"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StoreDetailModal({ storeId, onClose, onUpdate }) {
  const [store, setStore] = useState(null);
  const [tab, setTab] = useState("info");
  const [testResult, setTestResult] = useState(null);
  const [creds, setCreds] = useState({ consumerKey: "", consumerSecret: "" });
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api(`/api/stores/${storeId}`).then(setStore);
  }, [storeId]);

  if (!store) return null;

  const testConnection = async () => {
    setTestResult(null);
    try {
      const res = await apiPost(`/api/stores/${storeId}/test-api`, {});
      setTestResult({ success: true, message: res.message, version: res.woocommerce_version });
    } catch {
      setTestResult({ success: false, message: "Connection failed" });
    }
  };

  const saveCreds = async () => {
    await apiPost(`/api/stores/${storeId}/credentials`, creds);
    setMessage("Credentials saved");
    api(`/api/stores/${storeId}`).then(setStore);
    onUpdate();
  };

  const clearCreds = async () => {
    await apiDelete(`/api/stores/${storeId}/credentials`);
    setMessage("Credentials cleared");
    api(`/api/stores/${storeId}`).then(setStore);
    onUpdate();
  };

  const removeStore = async () => {
    if (!confirm(`Remove "${store.name}"? This cannot be undone.`)) return;
    await apiPost("/api/stores/remove", { storeId });
    onUpdate();
    onClose();
  };

  const tabs = ["info", "credentials", "settings"];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">{store.name}</h3>
            <p className="text-sm text-gray-500">{store.url}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="flex gap-1 mb-4">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize ${tab === t ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>
              {t}
            </button>
          ))}
        </div>

        {message && <p className="text-green-600 text-sm mb-3">{message}</p>}

        {tab === "info" && (
          <div className="space-y-2 text-sm">
            <InfoRow label="Store ID" value={store.id} />
            <InfoRow label="Plugin Version" value={store.plugin_version || "Unknown"} />
            <InfoRow label="WooCommerce" value={store.woocommerce_version || "Unknown"} />
            <InfoRow label="WordPress" value={store.wordpress_version || "Unknown"} />
            <InfoRow label="PHP" value={store.php_version || "Unknown"} />
            <InfoRow label="API Credentials" value={store.consumer_key ? "Configured" : "Not set"} />
            <InfoRow label="Last Seen" value={store.last_seen ? new Date(store.last_seen).toLocaleString() : "Never"} />

            <div className="pt-3 flex gap-2">
              <button onClick={testConnection} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                Test Connection
              </button>
              <button onClick={removeStore} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
                Remove Store
              </button>
            </div>
            {testResult && (
              <p className={`text-sm ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                {testResult.message} {testResult.version && `(WC ${testResult.version})`}
              </p>
            )}
          </div>
        )}

        {tab === "credentials" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Current: {store.consumer_key || "Not set"}</p>
            <input placeholder="Consumer Key" value={creds.consumerKey} onChange={e => setCreds({ ...creds, consumerKey: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="Consumer Secret" type="password" value={creds.consumerSecret} onChange={e => setCreds({ ...creds, consumerSecret: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
            <div className="flex gap-2">
              <button onClick={saveCreds} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">Save</button>
              <button onClick={clearCreds} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm">Clear</button>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="text-sm text-gray-500">
            <pre className="bg-gray-50 p-3 rounded-lg overflow-auto text-xs">
              {JSON.stringify(store.settings || {}, null, 2)}
            </pre>
            <pre className="bg-gray-50 p-3 rounded-lg overflow-auto text-xs mt-2">
              Sync: {JSON.stringify(store.sync_config || {}, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-1 border-b border-gray-100">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
