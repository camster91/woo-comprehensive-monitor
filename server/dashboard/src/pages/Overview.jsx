import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../api/client";
import AlertTrendsChart from "../components/AlertTrendsChart";
import HealthDistribution from "../components/HealthDistribution";
import { SkeletonCard, SkeletonRow } from "../components/Skeleton";
import { timeAgo, seenStatus } from "../utils/time";
import {
  Store, AlertTriangle, CheckCircle, Activity,
  TrendingUp, Clock, Wifi,
} from "lucide-react";

export default function Overview() {
  const [data, setData]   = useState(null);
  const [error, setError] = useState(null);
  const { refresh: layoutRefresh } = useOutletContext() || {};

  useEffect(() => {
    api("/api/dashboard").then(setData).catch((e) => setError(e.message));
    const t = setInterval(() => api("/api/dashboard").then(setData).catch(() => {}), 60000);
    return () => clearInterval(t);
  }, []);

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 flex items-center gap-3">
      <AlertTriangle size={18} /> {error}
    </div>
  );

  if (!data) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <SkeletonCard className="h-56" />
        <SkeletonCard className="h-56" />
      </div>
      <div className="space-y-2">{[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}</div>
    </div>
  );

  const o = data.overview;

  return (
    <div className="space-y-6">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Stores" value={o.totalSites}
          icon={<Store size={18} />}
          color="blue" sub="monitored"
        />
        <StatCard
          label="Total Alerts" value={o.totalAlerts}
          icon={<Activity size={18} />}
          color="slate" sub="all time"
        />
        <StatCard
          label="Critical" value={o.criticalAlerts}
          icon={<AlertTriangle size={18} />}
          color={o.criticalAlerts > 0 ? "red" : "green"}
          sub={o.criticalAlerts > 0 ? "needs attention" : "all clear"}
          pulse={o.criticalAlerts > 0}
        />
        <StatCard
          label="High" value={o.highAlerts}
          icon={<TrendingUp size={18} />}
          color={o.highAlerts > 0 ? "orange" : "green"}
          sub={o.highAlerts > 0 ? "review soon" : "all clear"}
        />
      </div>

      {/* ── Charts ── */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Activity size={15} className="text-blue-500" /> Alert Trends (7 days)
          </h2>
          <AlertTrendsChart trends={o.alertTrends} />
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <CheckCircle size={15} className="text-green-500" /> Store Health
          </h2>
          <HealthDistribution distribution={o.healthDistribution} />
        </div>
      </div>

      {/* ── Stores grid ── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Store size={15} className="text-slate-400" /> Stores
        </h2>
        {data.stores.length === 0
          ? <p className="text-slate-400 text-sm text-center py-6">No stores connected.</p>
          : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.stores.map((s) => <StoreChip key={s.id} store={s} />)}
            </div>
        }
      </div>

      {/* ── Recent alerts ── */}
      {data.recentAlerts.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Clock size={15} className="text-slate-400" /> Recent Alerts
          </h2>
          <div className="space-y-2">
            {data.recentAlerts.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                <SeverityDot severity={a.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{a.subject}</p>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                    {timeAgo(a.timestamp)}
                    {a.type && <span className="bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[10px]">{a.type}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color, sub, pulse }) {
  const palettes = {
    blue:   { bg: "bg-blue-50",   icon: "text-blue-500",   val: "text-blue-700"   },
    green:  { bg: "bg-green-50",  icon: "text-green-500",  val: "text-green-700"  },
    red:    { bg: "bg-red-50",    icon: "text-red-500",    val: "text-red-700"    },
    orange: { bg: "bg-orange-50", icon: "text-orange-500", val: "text-orange-700" },
    slate:  { bg: "bg-slate-50",  icon: "text-slate-400",  val: "text-slate-700"  },
  };
  const p = palettes[color] || palettes.slate;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
      {pulse && (
        <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
      )}
      <div className={`inline-flex p-2 rounded-xl ${p.bg} ${p.icon} mb-3`}>{icon}</div>
      <p className={`text-3xl font-bold ${p.val}`}>{value ?? "—"}</p>
      <p className="text-xs text-slate-400 mt-1">{label} · {sub}</p>
    </div>
  );
}

function StoreChip({ store }) {
  const status = seenStatus(store.last_seen);
  const ringColors = { good: "ring-green-400", warning: "ring-yellow-400", stale: "ring-red-400", never: "ring-gray-300" };
  const dotColors  = { good: "bg-green-400",   warning: "bg-yellow-400",   stale: "bg-red-400",   never: "bg-gray-300" };

  return (
    <div className={`border rounded-xl p-4 flex items-start gap-3 ring-1 ${ringColors[status]} bg-white`}>
      <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${dotColors[status]}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{store.name}</p>
        <p className="text-xs text-slate-400 truncate">{store.url}</p>
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
          <Clock size={10} />
          {store.last_seen ? timeAgo(store.last_seen) : "Never seen"}
          {store.hasApiCredentials && (
            <span className="ml-1 bg-purple-100 text-purple-600 px-1.5 rounded text-[10px]">API</span>
          )}
        </p>
      </div>
    </div>
  );
}

function SeverityDot({ severity }) {
  const colors = {
    critical: "bg-red-500", high: "bg-orange-500",
    medium: "bg-yellow-400", success: "bg-green-500", warning: "bg-yellow-400",
  };
  return <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${colors[severity] || "bg-slate-300"}`} />;
}
