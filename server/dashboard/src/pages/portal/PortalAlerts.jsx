import { useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { AlertTriangle, Clock, Filter } from "lucide-react";

const severityStyles = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr + "Z").getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PortalAlerts({ token }) {
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState("");

  const portalFetch = (url) => fetch(url, { headers: { "x-portal-token": token } }).then(r => r.json());

  useEffect(() => {
    setLoading(true);
    portalFetch(`/api/portal/alerts?limit=50`)
      .then(d => { setAlerts(d.alerts || []); setTotal(d.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = severity ? alerts.filter(a => a.severity === severity) : alerts;

  if (loading) return <SkeletonCard className="h-64" />;

  return (
    <div className="space-y-6">
      <PageHeader title="Alerts" subtitle={`${total} total alerts for your store`}>
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-slate-400" />
          <select value={severity} onChange={e => setSeverity(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white">
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>
        </div>
      </PageHeader>

      <div className="space-y-2">
        {filtered.map(a => (
          <div key={a.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-start gap-3">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${severityStyles[a.severity] || "bg-slate-100 text-slate-600"}`}>
                {a.severity}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700">{a.subject}</p>
                {a.message && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{a.message}</p>}
                <p className="text-[10px] text-slate-300 mt-2 flex items-center gap-1">
                  <Clock size={10} /> {timeAgo(a.timestamp)}
                  {a.type && <span className="ml-2 bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{a.type}</span>}
                </p>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <AlertTriangle size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">No alerts</p>
          </div>
        )}
      </div>
    </div>
  );
}
