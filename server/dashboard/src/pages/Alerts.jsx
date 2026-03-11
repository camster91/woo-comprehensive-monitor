import { useEffect, useState } from "react";
import { api, apiPost, apiDelete } from "../api/client";

export default function Alerts() {
  const [data, setData] = useState({ alerts: [], total: 0 });
  const [stores, setStores] = useState([]);
  const [filters, setFilters] = useState({ storeId: "", severity: "", type: "" });
  const [loading, setLoading] = useState(true);

  const loadAlerts = () => {
    const params = new URLSearchParams();
    if (filters.storeId) params.set("storeId", filters.storeId);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.type) params.set("type", filters.type);
    api(`/api/dashboard/alerts?${params}`).then(d => { setData(d); setLoading(false); });
  };

  useEffect(() => { api("/api/stores").then(d => setStores(d.stores || [])); }, []);
  useEffect(() => { loadAlerts(); }, [filters]);
  useEffect(() => {
    const interval = setInterval(loadAlerts, 60000);
    return () => clearInterval(interval);
  }, [filters]);

  const deleteAlert = async (id) => {
    await apiDelete(`/api/dashboard/alerts/${id}`);
    loadAlerts();
  };

  const clearAll = async () => {
    if (!confirm("Clear all displayed alerts?")) return;
    await apiPost("/api/dashboard/clear-alerts", filters);
    loadAlerts();
  };

  const exportCsv = () => {
    const headers = ["ID", "Timestamp", "Severity", "Type", "Subject", "Message"];
    const rows = data.alerts.map(a => [a.id, a.timestamp, a.severity, a.type, `"${(a.subject || "").replace(/"/g, '""')}"`, `"${(a.message || "").replace(/"/g, '""').replace(/\n/g, " ")}"`]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alerts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const severityColors = {
    critical: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    medium: "bg-yellow-100 text-yellow-700",
    success: "bg-green-100 text-green-700",
    warning: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-lg font-semibold">Alerts ({data.total})</h2>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">Export CSV</button>
          <button onClick={clearAll} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200">Clear All</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <select value={filters.storeId} onChange={e => setFilters({ ...filters, storeId: e.target.value })}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white">
          <option value="">All Stores</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.severity} onChange={e => setFilters({ ...filters, severity: e.target.value })}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white">
          <option value="">All Severities</option>
          {["critical", "high", "medium", "success", "warning"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white">
          <option value="">All Types</option>
          {["error", "dispute", "health", "lifecycle", "subscription", "admin_notice"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="space-y-2">
          {data.alerts.length === 0 && <p className="text-gray-400 text-center py-8">No alerts found.</p>}
          {data.alerts.map(a => (
            <div key={a.id} className="bg-white rounded-lg p-4 shadow-sm flex items-start gap-3">
              <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${severityColors[a.severity] || "bg-gray-100 text-gray-700"}`}>
                {a.severity}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{a.subject}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.message}</p>
                <div className="flex gap-3 mt-1 text-xs text-gray-400">
                  <span>{new Date(a.timestamp).toLocaleString()}</span>
                  {a.type && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{a.type}</span>}
                </div>
              </div>
              <button onClick={() => deleteAlert(a.id)} className="text-gray-400 hover:text-red-600 text-sm shrink-0">&times;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
