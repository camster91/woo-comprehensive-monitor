import { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import AlertTrendsChart from "../components/AlertTrendsChart";
import HealthDistribution from "../components/HealthDistribution";
import ActivityFeed from "../components/ActivityFeed";
import StatCard from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import { SkeletonCard, SkeletonRow } from "../components/Skeleton";
import { timeAgo, seenStatus } from "../utils/time";
import {
  Store, AlertTriangle, Activity, TrendingUp, Clock,
  DollarSign, ShoppingCart, ArrowRight,
} from "lucide-react";

export default function Overview() {
  const [data, setData] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [error, setError] = useState(null);
  const { refresh: layoutRefresh } = useOutletContext() || {};
  const navigate = useNavigate();

  useEffect(() => {
    api("/api/dashboard").then(setData).catch((e) => setError(e.message));
    api("/api/revenue?period=today").then(setRevenue).catch(() => {});
    const t = setInterval(() => {
      api("/api/dashboard").then(setData).catch(() => {});
      api("/api/revenue?period=today").then(setRevenue).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, []);

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 flex items-center gap-3">
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
    </div>
  );

  const o = data.overview;

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle="Multi-store monitoring at a glance" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Stores" value={o.totalSites}
          icon={<Store size={18} />} variant="hero"
          sub="monitored"
        />
        <StatCard
          label="Total Alerts" value={o.totalAlerts}
          icon={<Activity size={18} />} sub="all time"
        />
        <StatCard
          label="Critical" value={o.criticalAlerts}
          icon={<AlertTriangle size={18} />}
          sub={o.criticalAlerts > 0 ? "needs attention" : "all clear"}
          pulse={o.criticalAlerts > 0}
        />
        <StatCard
          label="High" value={o.highAlerts}
          icon={<TrendingUp size={18} />}
          sub={o.highAlerts > 0 ? "review soon" : "all clear"}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-indigo-500" />
            <span className="text-xs font-medium text-slate-400 uppercase">Today's Revenue</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {revenue ? `$${(revenue.totalRevenue || 0).toLocaleString()}` : "\u2014"}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart size={14} className="text-indigo-500" />
            <span className="text-xs font-medium text-slate-400 uppercase">Orders Today</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {revenue ? (revenue.totalOrders || 0).toLocaleString() : "\u2014"}
          </p>
        </div>
        <button
          onClick={() => navigate("/revenue")}
          className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors text-left group"
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-indigo-500" />
            <span className="text-xs font-medium text-slate-400 uppercase">Revenue</span>
          </div>
          <p className="text-sm font-medium text-indigo-600 flex items-center gap-1">
            View Dashboard <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </p>
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <Activity size={15} className="text-indigo-500" /> Alert Trends (7 days)
          </h2>
          <AlertTrendsChart trends={o.alertTrends} />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <Store size={15} className="text-indigo-500" /> Store Health
          </h2>
          <HealthDistribution distribution={o.healthDistribution} />
        </div>
      </div>

      {/* Activity Feed — replaces static Recent Alerts */}
      <ActivityFeed />

      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Store size={15} className="text-slate-400" /> Stores
        </h2>
        {data.stores.length === 0
          ? <p className="text-slate-400 text-sm text-center py-6">No stores connected.</p>
          : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.stores.map((s) => <StoreChip key={s.id} store={s} />)}
            </div>
        }
      </div>
    </div>
  );
}

function StoreChip({ store }) {
  const status = seenStatus(store.last_seen);
  const dotColors = { good: "bg-emerald-400", warning: "bg-amber-400", stale: "bg-red-400", never: "bg-gray-300" };

  return (
    <div className="border border-gray-100 dark:border-slate-700 rounded-xl p-4 flex items-start gap-3 bg-white dark:bg-slate-900 hover:border-gray-200 transition-colors">
      <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${dotColors[status]}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{store.name}</p>
        <p className="text-xs text-slate-400 truncate">{store.url}</p>
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
          <Clock size={10} />
          {store.last_seen ? timeAgo(store.last_seen) : "Never seen"}
          {store.hasApiCredentials && (
            <span className="ml-1 bg-indigo-50 text-indigo-600 px-1.5 rounded text-[10px]">API</span>
          )}
        </p>
      </div>
    </div>
  );
}
