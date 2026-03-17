import { useEffect, useState } from "react";
import StatCard from "../../components/StatCard";
import PageHeader from "../../components/PageHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { DollarSign, ShoppingCart, Shield, Bell } from "lucide-react";

export default function PortalOverview({ token, user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const portalFetch = (url) => fetch(url, { headers: { "x-portal-token": token } }).then(r => r.json());

  useEffect(() => {
    portalFetch("/api/portal/dashboard")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
    </div>
  );

  if (!data) return <p className="text-slate-400 text-center py-12">Unable to load dashboard</p>;

  return (
    <div className="space-y-6">
      <PageHeader title={data.store?.name || "Your Store"} subtitle={`Welcome, ${data.user?.name || data.user?.email}`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Revenue (7d)" value={`$${(data.revenue?.totalRevenue || 0).toLocaleString()}`}
          icon={<DollarSign size={18} />} variant="hero" change={data.revenue?.revenueChange} />
        <StatCard label="Orders (7d)" value={data.revenue?.totalOrders || 0}
          icon={<ShoppingCart size={18} />} change={data.revenue?.ordersChange} />
        <StatCard label="Disputes" value={data.disputes?.total || 0}
          icon={<Shield size={18} />} sub="total" />
        <StatCard label="Failed Payments" value={data.revenue?.failedCount || 0}
          icon={<Bell size={18} />} sub="last 7 days" />
      </div>

      {data.disputes?.items?.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Disputes</h2>
          <div className="space-y-2">
            {data.disputes.items.slice(0, 5).map(d => (
              <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-700">{d.customer_name || d.customer_email || "Unknown"}</p>
                  <p className="text-xs text-slate-400">{d.reason} {"\u00b7"} {d.status}</p>
                </div>
                <span className="text-sm font-medium text-slate-700">${d.amount?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
