import { useEffect, useState } from "react";
import { api, apiPost } from "../api/client";
import StatCard from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import DataTable from "../components/DataTable";
import { SkeletonCard } from "../components/Skeleton";
import {
  Package, RefreshCw, Download, ChevronDown, ChevronRight,
  Check, AlertTriangle, Loader, Power, PowerOff,
} from "lucide-react";
import WpLoginButton from "../components/WpLoginButton";

export default function Manage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [storePlugins, setStorePlugins] = useState({});
  const [storeThemes, setStoreThemes] = useState({});
  const [updating, setUpdating] = useState({});
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const fetchSummary = () => {
    setLoading(true);
    api("/api/manage/updates-summary")
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSummary(); }, []);

  const loadStoreDetails = async (storeId) => {
    if (storePlugins[storeId]) return;
    try {
      const [plugins, themes] = await Promise.all([
        api(`/api/manage/${storeId}/plugins`),
        api(`/api/manage/${storeId}/themes`),
      ]);
      setStorePlugins(prev => ({ ...prev, [storeId]: plugins.plugins || [] }));
      setStoreThemes(prev => ({ ...prev, [storeId]: themes.themes || [] }));
    } catch (err) {
      console.error(err);
    }
  };

  const toggleStore = (storeId) => {
    if (expanded === storeId) {
      setExpanded(null);
    } else {
      setExpanded(storeId);
      loadStoreDetails(storeId);
    }
  };

  const updatePlugin = async (storeId, pluginFile) => {
    const key = `${storeId}:${pluginFile}`;
    setUpdating(prev => ({ ...prev, [key]: true }));
    try {
      await apiPost(`/api/manage/${storeId}/plugins/update`, { plugin: pluginFile });
      // Refresh store details
      const plugins = await api(`/api/manage/${storeId}/plugins`);
      setStorePlugins(prev => ({ ...prev, [storeId]: plugins.plugins || [] }));
    } catch (err) { console.error(err); }
    setUpdating(prev => ({ ...prev, [key]: false }));
  };

  const updateAllPlugins = async (storeId) => {
    const key = `${storeId}:all`;
    setUpdating(prev => ({ ...prev, [key]: true }));
    try {
      await apiPost(`/api/manage/${storeId}/plugins/update-all`);
      const plugins = await api(`/api/manage/${storeId}/plugins`);
      setStorePlugins(prev => ({ ...prev, [storeId]: plugins.plugins || [] }));
      fetchSummary();
    } catch (err) { console.error(err); }
    setUpdating(prev => ({ ...prev, [key]: false }));
  };

  const togglePlugin = async (storeId, pluginFile, action) => {
    const key = `${storeId}:toggle:${pluginFile}`;
    setUpdating(prev => ({ ...prev, [key]: true }));
    try {
      await apiPost(`/api/manage/${storeId}/plugins/toggle`, { plugin: pluginFile, action });
      const plugins = await api(`/api/manage/${storeId}/plugins`);
      setStorePlugins(prev => ({ ...prev, [storeId]: plugins.plugins || [] }));
    } catch (err) { console.error(err); }
    setUpdating(prev => ({ ...prev, [key]: false }));
  };

  const updateTheme = async (storeId, themeSlug) => {
    const key = `${storeId}:theme:${themeSlug}`;
    setUpdating(prev => ({ ...prev, [key]: true }));
    try {
      await apiPost(`/api/manage/${storeId}/themes/update`, { theme: themeSlug });
      const themes = await api(`/api/manage/${storeId}/themes`);
      setStoreThemes(prev => ({ ...prev, [storeId]: themes.themes || [] }));
      fetchSummary();
    } catch (err) { console.error(err); }
    setUpdating(prev => ({ ...prev, [key]: false }));
  };

  const bulkUpdateAll = async () => {
    if (!confirm("Update ALL plugins on ALL stores? This may take several minutes.")) return;
    setBulkUpdating(true);
    try {
      await apiPost("/api/manage/bulk-update-all");
      setStorePlugins({});
      fetchSummary();
    } catch (err) { console.error(err); }
    setBulkUpdating(false);
  };

  const toggleSelect = (storeId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId); else next.add(storeId);
      return next;
    });
  };

  const selectAll = () => {
    if (!summary?.stores) return;
    const withUpdates = summary.stores.filter(s => (s.plugin_updates || 0) + (s.theme_updates || 0) > 0);
    if (selected.size === withUpdates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(withUpdates.map(s => s.store_id)));
    }
  };

  const bulkUpdateSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Update all plugins on ${selected.size} selected store${selected.size > 1 ? "s" : ""}?`)) return;
    setBulkUpdating(true);
    try {
      for (const storeId of selected) {
        await apiPost(`/api/manage/${storeId}/plugins/update-all`).catch(() => {});
      }
      setStorePlugins({});
      setSelected(new Set());
      fetchSummary();
    } catch (err) { console.error(err); }
    setBulkUpdating(false);
  };

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
      <SkeletonCard className="h-64" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Site Manager" subtitle="Plugin, theme, and WordPress updates across all stores">
        <div className="flex gap-2">
          <button onClick={fetchSummary}
            className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            <RefreshCw size={13} /> Refresh
          </button>
          {selected.size > 0 && (
            <button onClick={bulkUpdateSelected} disabled={bulkUpdating}
              className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors">
              {bulkUpdating ? <><Loader size={13} className="animate-spin" /> Updating...</> : <><Download size={13} /> Update {selected.size} Selected</>}
            </button>
          )}
          {summary && summary.totalPluginUpdates > 0 && selected.size === 0 && (
            <button onClick={bulkUpdateAll} disabled={bulkUpdating}
              className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors">
              {bulkUpdating ? <><Loader size={13} className="animate-spin" /> Updating All...</> : <><Download size={13} /> Update All Stores</>}
            </button>
          )}
        </div>
      </PageHeader>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Plugin Updates" value={summary.totalPluginUpdates} icon={<Package size={18} />}
            variant={summary.totalPluginUpdates > 0 ? "default" : "default"}
            pulse={summary.totalPluginUpdates > 5}
            sub={summary.totalPluginUpdates > 0 ? "available" : "all current"} />
          <StatCard label="Theme Updates" value={summary.totalThemeUpdates} icon={<Package size={18} />}
            sub={summary.totalThemeUpdates > 0 ? "available" : "all current"} />
          <StatCard label="Core Updates" value={summary.coreUpdates} icon={<AlertTriangle size={18} />}
            sub={summary.coreUpdates > 0 ? "stores need WP update" : "all current"} />
          <StatCard label="Stores" value={summary.stores?.length || 0} icon={<Check size={18} />} variant="hero" sub="monitored" />
        </div>
      )}

      {/* Store list */}
      {summary?.stores?.some(s => (s.plugin_updates || 0) + (s.theme_updates || 0) > 0) && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer hover:text-slate-700">
            <input type="checkbox" onChange={selectAll}
              checked={selected.size > 0 && selected.size === summary?.stores?.filter(s => (s.plugin_updates || 0) + (s.theme_updates || 0) > 0).length}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            Select all with updates
          </label>
          {selected.size > 0 && <span className="text-xs text-indigo-600 font-medium">{selected.size} selected</span>}
        </div>
      )}
      <div className="space-y-3">
        {summary?.stores?.map(store => {
          const isOpen = expanded === store.store_id;
          const hasUpdates = (store.plugin_updates || 0) + (store.theme_updates || 0) + (store.core_update ? 1 : 0);
          const plugins = storePlugins[store.store_id] || [];
          const themes = storeThemes[store.store_id] || [];
          const updatablePlugins = plugins.filter(p => p.has_update);
          const updatableThemes = themes.filter(t => t.has_update);

          return (
            <div key={store.store_id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors">
                {hasUpdates > 0 && (
                  <input type="checkbox" checked={selected.has(store.store_id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelect(store.store_id); }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0" />
                )}
                <button onClick={() => toggleStore(store.store_id)} className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-slate-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{store.store_name}</p>
                  <p className="text-xs text-slate-400">WP {store.wp_version} {"\u00b7"} {store.active_plugins}/{store.total_plugins} plugins active</p>
                </div>
                <WpLoginButton storeId={store.store_id} />
                {store.error ? (
                  <span className="text-xs text-red-500">Error</span>
                ) : hasUpdates > 0 ? (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700">{hasUpdates} update{hasUpdates > 1 ? "s" : ""}</span>
                ) : (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-green-50 text-green-700">Up to date</span>
                )}
              </button></div>

              {isOpen && (
                <div className="px-5 pb-4 border-t border-gray-50 space-y-4">
                  {/* Plugin updates */}
                  {updatablePlugins.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase">Plugin Updates ({updatablePlugins.length})</p>
                        <button onClick={() => updateAllPlugins(store.store_id)}
                          disabled={updating[`${store.store_id}:all`]}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50">
                          {updating[`${store.store_id}:all`] ? "Updating..." : "Update All"}
                        </button>
                      </div>
                      {updatablePlugins.map(p => (
                        <div key={p.file} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                          <div>
                            <p className="text-sm text-slate-700">{p.name}</p>
                            <p className="text-xs text-slate-400">{p.version} {"\u2192"} {p.new_version}</p>
                          </div>
                          <button onClick={() => updatePlugin(store.store_id, p.file)}
                            disabled={updating[`${store.store_id}:${p.file}`]}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 disabled:opacity-50">
                            {updating[`${store.store_id}:${p.file}`] ? <Loader size={10} className="animate-spin" /> : <Download size={10} />} Update
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Theme updates */}
                  {updatableThemes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Theme Updates ({updatableThemes.length})</p>
                      {updatableThemes.map(t => (
                        <div key={t.slug} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                          <div>
                            <p className="text-sm text-slate-700">{t.name}</p>
                            <p className="text-xs text-slate-400">{t.version} {"\u2192"} {t.new_version}</p>
                          </div>
                          <button onClick={() => updateTheme(store.store_id, t.slug)}
                            disabled={updating[`${store.store_id}:theme:${t.slug}`]}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 disabled:opacity-50">
                            {updating[`${store.store_id}:theme:${t.slug}`] ? <Loader size={10} className="animate-spin" /> : <Download size={10} />} Update
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* All plugins list */}
                  {plugins.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">All Plugins ({plugins.length})</p>
                      <div className="max-h-64 overflow-y-auto">
                        {plugins.map(p => (
                          <div key={p.file} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.active ? "bg-emerald-400" : "bg-slate-300"}`} />
                              <p className="text-xs text-slate-700 truncate">{p.name}</p>
                              <span className="text-xs text-slate-400 shrink-0">v{p.version}</span>
                            </div>
                            <button
                              onClick={() => togglePlugin(store.store_id, p.file, p.active ? "deactivate" : "activate")}
                              disabled={updating[`${store.store_id}:toggle:${p.file}`]}
                              className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded disabled:opacity-50 ${
                                p.active ? "text-red-500 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"
                              }`}>
                              {updating[`${store.store_id}:toggle:${p.file}`] ? (
                                <Loader size={10} className="animate-spin" />
                              ) : p.active ? (
                                <><PowerOff size={10} /> Deactivate</>
                              ) : (
                                <><Power size={10} /> Activate</>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {plugins.length === 0 && !store.error && (
                    <div className="flex items-center justify-center py-6">
                      <Loader size={16} className="animate-spin text-slate-300" />
                      <span className="text-sm text-slate-400 ml-2">Loading plugins...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
