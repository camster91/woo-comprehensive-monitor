import { useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { ShoppingCart, Clock, DollarSign, Package } from "lucide-react";

const statusStyles = {
  processing: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  "on-hold": "bg-yellow-50 text-yellow-700",
  pending: "bg-yellow-50 text-yellow-700",
  cancelled: "bg-red-50 text-red-700",
  refunded: "bg-gray-50 text-gray-600",
  failed: "bg-red-50 text-red-700",
};

export default function PortalOrders({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const portalFetch = (url) => fetch(url, { headers: { "x-portal-token": token } }).then(r => r.json());

  useEffect(() => {
    portalFetch("/api/portal/revenue?period=30d")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonCard className="h-64" />;

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" subtitle="Recent order activity for your store" />

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart size={14} className="text-indigo-500" />
              <span className="text-xs font-medium text-slate-400 uppercase">Total Orders</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{data.totalOrders || 0}</p>
            <p className="text-xs text-slate-400 mt-1">Last 30 days</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Package size={14} className="text-emerald-500" />
              <span className="text-xs font-medium text-slate-400 uppercase">Completed</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{data.completedCount || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={14} className="text-blue-500" />
              <span className="text-xs font-medium text-slate-400 uppercase">Processing</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{data.processingCount || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={14} className="text-red-500" />
              <span className="text-xs font-medium text-slate-400 uppercase">Refunded</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{data.refundedCount || 0}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Order Summary</h2>
        <p className="text-sm text-slate-500">
          Your store processed {data?.totalOrders || 0} orders totaling ${(data?.totalRevenue || 0).toLocaleString()} over the last 30 days.
          {data?.failedCount > 0 && ` ${data.failedCount} orders failed.`}
          {data?.pendingCount > 0 && ` ${data.pendingCount} orders are pending.`}
        </p>
      </div>
    </div>
  );
}
