import { useEffect, useState } from "react";
import { api, apiPost, apiPatch, apiDelete } from "../api/client";
import { useToast } from "../components/Toast";
import { timeAgo, seenStatus } from "../utils/time";
import {
  Plus, Store, ExternalLink, Clock, Wifi, WifiOff,
  AlertTriangle, ChevronRight, ShieldCheck, Trash2,
} from "lucide-react";
import WpLoginButton from "../components/WpLoginButton";

export default function Stores() {
  const [stores, setStores]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const toast = useToast();

  const loadStores = () =>
    api("/api/stores").then((d) => { setStores(d.stores || []); setLoading(false); });

  useEffect(() => { loadStores(); }, []);

  if (loading) return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse h-36">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-3/4 mb-4" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Store size={16} className="text-slate-400" /> Stores
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{stores.length}</span>
        </h2>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus size={15} /> Add Store
        </button>
      </div>

      {stores.length === 0
        ? <EmptyState onAdd={() => setShowAdd(true)} />
        : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stores.map((s) => <StoreCard key={s.id} store={s} onClick={() => setSelected(s)} />)}
          </div>
      }

      {showAdd && (
        <AddStoreModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); loadStores(); toast("Store added"); }}
        />
      )}
      {selected && (
        <StoreDetailModal
          storeId={selected.id}
          onClose={() => setSelected(null)}
          onUpdate={loadStores}
          toast={toast}
        />
      )}
    </div>
  );
}

function StoreCard({ store, onClick }) {
  const status = seenStatus(store.last_seen);
  const config = {
    good:    { bar: "bg-green-500", text: "text-green-600", label: "Active",  bg: "bg-green-50" },
    warning: { bar: "bg-yellow-400", text: "text-yellow-600", label: "Lagging", bg: "bg-yellow-50" },
    stale:   { bar: "bg-red-400",   text: "text-red-600",   label: "Silent",  bg: "bg-red-50" },
    never:   { bar: "bg-gray-300",  text: "text-gray-500",  label: "Never",   bg: "bg-gray-50" },
  }[status];

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all group"
    >
      {/* Top: name + status dot */}
      <div className="flex justify-between items-start mb-1">
        <h3 className="font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors leading-tight">
          {store.name}
        </h3>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>
          {config.label}
        </span>
      </div>

      {/* URL */}
      <p className="text-xs text-slate-400 truncate mb-3">{store.url}</p>

      {/* Colored bar */}
      <div className="h-1 rounded-full bg-gray-100 mb-3">
        <div className={`h-full rounded-full ${config.bar} w-full`} />
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {store.last_seen ? timeAgo(store.last_seen) : "Never seen"}
        </span>
        <div className="flex items-center gap-2">
          {store.hasApiCredentials && (
            <WpLoginButton storeId={store.id} />
          )}
          {store.plugin_version && (
            <span className="text-slate-300">v{store.plugin_version}</span>
          )}
          <ChevronRight size={12} className="text-slate-300 group-hover:text-indigo-400 transition-colors" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="text-center py-20 text-slate-400">
      <Store size={40} className="mx-auto mb-3 text-slate-200" />
      <p className="font-medium text-slate-500">No stores yet</p>
      <p className="text-sm mt-1 mb-4">Add your first WooCommerce store to start monitoring.</p>
      <button onClick={onAdd}
        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
        <Plus size={14} /> Add Store
      </button>
    </div>
  );
}

function AddStoreModal({ onClose, onSuccess }) {
  const [form, setForm]   = useState({ name: "", url: "", consumerKey: "", consumerSecret: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try { await apiPost("/api/stores", form); onSuccess(); }
    catch (err) { setError(err.message); }
    setSaving(false);
  };

  return (
    <Modal title="Add Store" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Store Name" required>
          <input placeholder="My WooCommerce Store" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </Field>
        <Field label="Store URL" required>
          <input placeholder="https://example.com" required value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </Field>
        <Field label="Consumer Key" hint="Optional — for server-side health checks">
          <input placeholder="ck_..." value={form.consumerKey}
            onChange={(e) => setForm({ ...form, consumerKey: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </Field>
        <Field label="Consumer Secret">
          <input type="password" placeholder="cs_..." value={form.consumerSecret}
            onChange={(e) => setForm({ ...form, consumerSecret: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </Field>
        {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? "Adding…" : "Add Store"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StoreDetailModal({ storeId, onClose, onUpdate, toast }) {
  const [store, setStore] = useState(null);
  const [tab, setTab]     = useState("info");
  const [testResult, setTestResult] = useState(null);
  const [creds, setCreds] = useState({ consumerKey: "", consumerSecret: "" });

  useEffect(() => { api(`/api/stores/${storeId}`).then(setStore); }, [storeId]);
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
    toast("Credentials saved");
    api(`/api/stores/${storeId}`).then(setStore);
    onUpdate();
  };

  const clearCreds = async () => {
    await apiDelete(`/api/stores/${storeId}/credentials`);
    toast("Credentials cleared");
    api(`/api/stores/${storeId}`).then(setStore);
    onUpdate();
  };

  const removeStore = async () => {
    if (!confirm(`Remove "${store.name}"? This cannot be undone.`)) return;
    await apiPost("/api/stores/remove", { storeId });
    toast("Store removed");
    onUpdate();
    onClose();
  };

  const status = seenStatus(store.last_seen);
  const statusLabel = { good: "Active", warning: "Lagging", stale: "Silent", never: "Never seen" }[status];
  const statusColor = { good: "text-green-600 bg-green-50", warning: "text-yellow-600 bg-yellow-50", stale: "text-red-600 bg-red-50", never: "text-gray-500 bg-gray-50" }[status];

  return (
    <Modal title={store.name} subtitle={store.url} onClose={onClose} wide>
      {/* Status banner for stale stores */}
      {status === "stale" && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
          <AlertTriangle size={15} /> This store has not reported in {timeAgo(store.last_seen)}. Check if the plugin is active.
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl">
        {["info","credentials","settings"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-sm capitalize font-medium transition-colors
              ${tab === t ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <InfoCard label="Plugin" value={store.plugin_version || "Unknown"} />
            <InfoCard label="WooCommerce" value={store.woocommerce_version || "Unknown"} />
            <InfoCard label="WordPress" value={store.wordpress_version || "Unknown"} />
            <InfoCard label="PHP" value={store.php_version || "Unknown"} />
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-sm">
            <span className="text-slate-500">Last seen</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
              {store.last_seen ? `${statusLabel} · ${timeAgo(store.last_seen)}` : "Never"}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-sm">
            <span className="text-slate-500">API Credentials</span>
            <span className={`flex items-center gap-1 ${store.consumer_key ? "text-green-600" : "text-slate-400"}`}>
              {store.consumer_key ? <><ShieldCheck size={13} /> Configured</> : "Not set"}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1 flex-wrap">
            <button onClick={testConnection}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-xl text-sm hover:bg-green-700 transition-colors">
              <Wifi size={13} /> Test API
            </button>
            <a href={store.url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm hover:bg-slate-200 transition-colors">
              <ExternalLink size={13} /> Visit Store
            </a>
            <button onClick={removeStore}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 rounded-xl text-sm hover:bg-red-100 transition-colors ml-auto">
              <Trash2 size={13} /> Remove
            </button>
          </div>
          {testResult && (
            <p className={`text-sm px-3 py-2 rounded-xl ${testResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {testResult.message} {testResult.version && `(WC ${testResult.version})`}
            </p>
          )}
        </div>
      )}

      {tab === "credentials" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 bg-indigo-50 px-3 py-2 rounded-xl">
            Consumer key and secret are used for server-side WooCommerce API health checks.
            Generate them in WooCommerce → Settings → Advanced → REST API.
          </p>
          <p className="text-xs text-slate-400">Current: {store.consumer_key || "Not set"}</p>
          <input placeholder="ck_..." value={creds.consumerKey}
            onChange={(e) => setCreds({ ...creds, consumerKey: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          <input type="password" placeholder="cs_..." value={creds.consumerSecret}
            onChange={(e) => setCreds({ ...creds, consumerSecret: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          <div className="flex gap-2">
            <button onClick={saveCreds}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700 transition-colors">Save</button>
            <button onClick={clearCreds}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm hover:bg-slate-200 transition-colors">Clear</button>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <pre className="bg-slate-50 p-4 rounded-xl text-xs text-slate-600 overflow-auto max-h-60">
          {JSON.stringify(store.settings || {}, null, 2)}
        </pre>
      )}
    </Modal>
  );
}

function Modal({ title, subtitle, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-xl shadow-2xl w-full max-h-[85vh] overflow-y-auto ${wide ? "max-w-lg" : "max-w-md"}`}
      >
        <div className="sticky top-0 bg-white px-6 pt-5 pb-4 border-b border-gray-100 flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-slate-800">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            ✕
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="font-normal text-slate-400 ml-1">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}
