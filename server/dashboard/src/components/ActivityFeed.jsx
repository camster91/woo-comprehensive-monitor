import { useState, useEffect } from "react";
import { api } from "../api/client";
import {
  ShoppingCart, Shield, Wifi, MessageSquare, DollarSign,
  AlertTriangle, Package, Activity, Filter,
} from "lucide-react";

const eventIcons = {
  order: ShoppingCart,
  dispute: Shield,
  uptime: Wifi,
  ticket: MessageSquare,
  revenue: DollarSign,
  alert: AlertTriangle,
  inventory: Package,
};

const severityColors = {
  info: "bg-blue-100 text-blue-600",
  warning: "bg-amber-100 text-amber-600",
  error: "bg-red-100 text-red-600",
  success: "bg-emerald-100 text-emerald-600",
};

const EVENT_TYPES = [
  { value: "", label: "All Events" },
  { value: "alert", label: "Alerts" },
  { value: "dispute", label: "Disputes" },
  { value: "ticket", label: "Tickets" },
  { value: "uptime", label: "Uptime" },
  { value: "order", label: "Orders" },
  { value: "revenue", label: "Revenue" },
  { value: "inventory", label: "Inventory" },
];

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr + "Z").getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "30" });
    if (filter) params.set("eventType", filter);
    api(`/api/activity?${params}`)
      .then(d => setActivities(d.activities || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(() => {
      const params = new URLSearchParams({ limit: "30" });
      if (filter) params.set("eventType", filter);
      api(`/api/activity?${params}`)
        .then(d => setActivities(d.activities || []))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [filter]);

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Activity size={15} className="text-indigo-500" /> Activity Feed
        </h2>
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-slate-400" />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600"
          >
            {EVENT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-start gap-3 p-2">
              <div className="w-7 h-7 rounded-lg bg-slate-100 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-slate-100 rounded w-3/4" />
                <div className="h-2 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : activities.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No activity yet. Events will appear here as they happen.</p>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {activities.map(a => {
            const Icon = eventIcons[a.event_type] || Activity;
            const colorClass = severityColors[a.severity] || severityColors.info;
            return (
              <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                  <Icon size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 truncate">{a.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-400">{timeAgo(a.created_at)}</span>
                    {a.store_name && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{a.store_name}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
