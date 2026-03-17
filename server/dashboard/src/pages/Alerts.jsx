import { useEffect, useState, useCallback } from "react";
import { api, apiPost, apiDelete } from "../api/client";
import { useToast } from "../components/Toast";
import { SkeletonRow } from "../components/Skeleton";
import { timeAgo } from "../utils/time";
import {
  Filter, Download, Trash2, ChevronDown, ChevronUp,
  Bell, AlertTriangle, Info, CheckCircle,
} from "lucide-react";

const PAGE_SIZE = 50;

const SEVERITY_STYLES = {
  critical: { badge: "bg-red-100 text-red-700 border-red-200",    dot: "bg-red-500",    icon: <AlertTriangle size={12} /> },
  high:     { badge: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500", icon: <AlertTriangle size={12} /> },
  medium:   { badge: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-500", icon: <Info size={12} /> },
  success:  { badge: "bg-green-100 text-green-700 border-green-200",  dot: "bg-green-500",  icon: <CheckCircle size={12} /> },
  warning:  { badge: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-500", icon: <Info size={12} /> },
};

export default function Alerts() {
  const toast = useToast();
  const [data, setData]       = useState({ alerts: [], total: 0 });
  const [stores, setStores]   = useState([]);
  const [filters, setFilters] = useState({ storeId: "", severity: "", type: "" });
  const [loading, setLoading] = useState(true);
  const [offset, setOffset]   = useState(0);
  const [expanded, setExpanded] = useState(new Set());

  const loadAlerts = useCallback((off = 0) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.storeId)  params.set("storeId",  filters.storeId);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.type)     params.set("type",      filters.type);
    params.set("limit",  PAGE_SIZE);
    params.set("offset", off);
    api(`/api/dashboard/alerts?${params}`)
      .then((d) => {
        setData((prev) => off === 0
          ? d
          : { alerts: [...prev.alerts, ...d.alerts], total: d.total }
        );
        setOffset(off);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filters]);

  useEffect(() => { api("/api/stores").then((d) => setStores(d.stores || [])); }, []);
  useEffect(() => { loadAlerts(0); }, [filters]);
  useEffect(() => {
    const t = setInterval(() => loadAlerts(0), 60000);
    return () => clearInterval(t);
  }, [loadAlerts]);

  const deleteAlert = async (id) => {
    await apiDelete(`/api/dashboard/alerts/${id}`);
    setData((prev) => ({ alerts: prev.alerts.filter((a) => a.id !== id), total: prev.total - 1 }));
    toast("Alert deleted");
  };

  const clearAll = async () => {
    if (!confirm(`Clear ${data.total} alert(s)?`)) return;
    await apiPost("/api/dashboard/clear-alerts", filters);
    loadAlerts(0);
    toast("Alerts cleared");
  };

  const clearOld = async () => {
    const res = await apiPost("/api/dashboard/clear-old-alerts", { days: 30 });
    loadAlerts(0);
    toast(`Pruned ${res.cleared} alerts older than 30 days`);
  };

  const exportCsv = () => {
    const headers = ["ID", "Timestamp", "Severity", "Type", "Subject", "Message"];
    const rows = data.alerts.map((a) => [
      a.id, a.timestamp, a.severity, a.type || "",
      `"${(a.subject || "").replace(/"/g, '""')}"`,
      `"${(a.message || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const url  = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `alerts-${new Date().toISOString().slice(0,10)}.csv` }).click();
    URL.revokeObjectURL(url);
    toast("CSV exported");
  };

  const toggleExpand = (id) =>
    setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const hasMore = data.alerts.length < data.total;

  const activeFilters = [filters.storeId, filters.severity, filters.type].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Bell size={16} className="text-slate-400" />
            Alerts
          </h2>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
            {data.total.toLocaleString()}
          </span>
          {activeFilters > 0 && (
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
              {activeFilters} filter{activeFilters > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn icon={<Download size={13} />} label="CSV"      onClick={exportCsv} />
          <Btn icon={<Trash2 size={13} />}   label="Clear 30d" onClick={clearOld} variant="ghost" />
          <Btn icon={<Trash2 size={13} />}   label="Clear all" onClick={clearAll} variant="danger" />
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-2 flex-wrap items-center">
        <Filter size={14} className="text-slate-400" />
        <FilterSelect
          value={filters.storeId}
          onChange={(v) => setFilters({ ...filters, storeId: v })}
          placeholder="All Stores"
          options={stores.map((s) => ({ value: s.id, label: s.name }))}
        />
        <FilterSelect
          value={filters.severity}
          onChange={(v) => setFilters({ ...filters, severity: v })}
          placeholder="All Severities"
          options={["critical","high","medium","success","warning"].map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          value={filters.type}
          onChange={(v) => setFilters({ ...filters, type: v })}
          placeholder="All Types"
          options={["error","dispute","health","lifecycle","subscription","admin_notice","silent"].map((t) => ({ value: t, label: t }))}
        />
        {activeFilters > 0 && (
          <button
            onClick={() => setFilters({ storeId: "", severity: "", type: "" })}
            className="text-xs text-indigo-600 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Alert list ── */}
      {loading && data.alerts.length === 0
        ? <div className="space-y-2">{[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}</div>
        : data.alerts.length === 0
          ? <EmptyState />
          : <>
              <div className="space-y-2">
                {data.alerts.map((a) => (
                  <AlertRow
                    key={a.id}
                    alert={a}
                    expanded={expanded.has(a.id)}
                    onToggle={() => toggleExpand(a.id)}
                    onDelete={() => deleteAlert(a.id)}
                  />
                ))}
              </div>
              {hasMore && (
                <button
                  onClick={() => loadAlerts(offset + PAGE_SIZE)}
                  disabled={loading}
                  className="w-full py-3 text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors disabled:opacity-50"
                >
                  {loading ? "Loading..." : `Load more (${data.total - data.alerts.length} remaining)`}
                </button>
              )}
            </>
      }
    </div>
  );
}

function AlertRow({ alert: a, expanded, onToggle, onDelete }) {
  const style = SEVERITY_STYLES[a.severity] || { badge: "bg-gray-100 text-gray-700 border-gray-200", dot: "bg-gray-400", icon: null };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Row header — always visible */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={onToggle}
      >
        <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border ${style.badge} shrink-0 mt-0.5`}>
          {style.icon}
          {a.severity}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 leading-snug">{a.subject}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-slate-400">{timeAgo(a.timestamp)}</span>
            <span className="text-xs text-slate-300">·</span>
            <span className="text-xs text-slate-400">{new Date(a.timestamp + (a.timestamp.endsWith("Z") ? "" : "Z")).toLocaleString()}</span>
            {a.type && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{a.type}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded message */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100">
          <pre className="text-xs text-slate-600 font-sans whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg p-3 mt-2 max-h-72 overflow-y-auto">
            {a.message}
          </pre>
          <p className="text-[10px] text-slate-400 mt-2">Alert ID: {a.id}</p>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20 text-slate-400">
      <CheckCircle size={40} className="mx-auto mb-3 text-green-300" />
      <p className="font-medium text-slate-500">No alerts found</p>
      <p className="text-sm mt-1">All clear — nothing matches your current filters.</p>
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-slate-700 hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Btn({ icon, label, onClick, variant = "default" }) {
  const styles = {
    default: "bg-white border border-gray-200 text-slate-700 hover:bg-gray-50",
    ghost:   "bg-white border border-gray-200 text-slate-600 hover:bg-gray-50",
    danger:  "bg-red-50 border border-red-200 text-red-700 hover:bg-red-100",
  };
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${styles[variant]}`}>
      {icon}{label}
    </button>
  );
}
