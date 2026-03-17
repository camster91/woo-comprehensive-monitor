import { useEffect, useState } from "react";
import { api, apiPost } from "../api/client";
import { Line, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler, ArcElement,
} from "chart.js";
import { DollarSign, ShoppingCart, AlertCircle, ShoppingBag, X } from "lucide-react";
import StatCard from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import TimeRangeSelector from "../components/TimeRangeSelector";
import DataTable from "../components/DataTable";
import { SkeletonCard } from "../components/Skeleton";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement);

const PERIOD_TO_DAYS = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

export default function Revenue() {
  const [period, setPeriod] = useState("7d");
  const [summary, setSummary] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [stores, setStores] = useState(null);
  const [filterStore, setFilterStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function fetchData(p, storeId) {
    setLoading(true);
    const days = PERIOD_TO_DAYS[p] || 7;
    const storeParam = storeId ? `&store=${storeId}` : "";
    Promise.all([
      api(`/api/revenue?period=${p}${storeParam}`),
      api(`/api/revenue/timeline?days=${days}${storeParam}`),
      api(`/api/revenue/stores?period=${p}`),
    ])
      .then(([sum, tl, st]) => {
        setSummary(sum);
        setTimeline(tl.timeline);
        setStores(st.stores);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(period, filterStore); }, [period, filterStore]);
  useEffect(() => { const t = setInterval(() => fetchData(period, filterStore), 60000); return () => clearInterval(t); }, [period, filterStore]);

  function handlePeriod(p) { setPeriod(p); setFilterStore(null); }
  function handleStoreClick(row) {
    setFilterStore(filterStore === row.store_id ? null : row.store_id);
  }

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 flex items-center gap-3">
      <AlertCircle size={18} /> {error}
    </div>
  );

  if (!loading && summary && summary.totalOrders === 0 && (!stores || stores.length === 0)) {
    return (
      <div>
        <PageHeader title="Revenue" subtitle="Revenue data across all stores">
          <TimeRangeSelector value={period} onChange={handlePeriod} />
        </PageHeader>
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <DollarSign size={40} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Revenue data is syncing</h3>
          <p className="text-sm text-slate-400 mb-4">First sync may take a few minutes for all stores.</p>
          <button
            onClick={() => apiPost("/api/revenue/sync", {}).then(() => fetchData(period, null))}
            className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors"
          >
            Sync Now
          </button>
        </div>
      </div>
    );
  }

  const chartData = timeline ? {
    labels: timeline.map((t) => {
      const d = new Date(t.date + "T00:00:00Z");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }),
    datasets: [
      {
        label: "Revenue",
        data: timeline.map((t) => t.revenue),
        borderColor: "#6366f1",
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, "rgba(99, 102, 241, 0.15)");
          gradient.addColorStop(1, "rgba(99, 102, 241, 0)");
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#6366f1",
        borderWidth: 2,
      },
    ],
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1e293b",
        titleColor: "#94a3b8",
        bodyColor: "#f1f5f9",
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => ` $${ctx.parsed.y.toLocaleString()}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#94a3b8" } },
      y: {
        beginAtZero: true,
        ticks: {
          font: { size: 11 },
          color: "#94a3b8",
          callback: (v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`,
        },
        grid: { color: "#f1f5f9" },
      },
    },
  };

  const statusData = summary ? {
    labels: ["Completed", "Processing", "Pending", "Failed", "Refunded"],
    datasets: [{
      data: [
        summary.completedCount || 0,
        summary.processingCount || 0,
        summary.pendingCount || 0,
        summary.failedCount || 0,
        summary.refundedCount || 0,
      ],
      backgroundColor: ["#34d399", "#6366f1", "#fbbf24", "#94a3b8", "#f87171"],
      borderWidth: 0,
    }],
  } : null;

  const storeColumns = [
    { key: "store_name", label: "Store", sortable: true },
    { key: "revenue", label: "Revenue", sortable: true, render: (v) => `$${(v || 0).toLocaleString()}` },
    { key: "orders", label: "Orders", sortable: true },
    { key: "failed", label: "Failed", sortable: true },
    { key: "avg_order_value", label: "Avg Order", sortable: true, render: (v) => `$${(v || 0).toFixed(2)}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue" subtitle="Revenue data across all stores">
        <TimeRangeSelector value={period} onChange={handlePeriod} />
      </PageHeader>

      {loading && !summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Revenue" value={`$${(summary.totalRevenue || 0).toLocaleString()}`}
            icon={<DollarSign size={18} />} variant="hero"
            change={summary.revenueChange}
          />
          <StatCard
            label="Total Orders" value={summary.totalOrders?.toLocaleString() || "0"}
            icon={<ShoppingCart size={18} />}
            change={summary.ordersChange}
          />
          <StatCard
            label="Failed Payments" value={summary.failedCount || 0}
            icon={<AlertCircle size={18} />} sub="informational"
          />
          <StatCard
            label="Abandoned Carts" value={summary.abandonedCarts || "N/A"}
            icon={<ShoppingBag size={18} />} sub="from cart tracking"
          />
        </div>
      )}

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Revenue Trend</h2>
          {filterStore && (
            <button
              onClick={() => setFilterStore(null)}
              className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100"
            >
              {stores?.find(s => s.store_id === filterStore)?.store_name || "Store"} <X size={12} />
            </button>
          )}
        </div>
        <div style={{ height: 280 }}>
          {chartData ? <Line data={chartData} options={chartOptions} /> : <SkeletonCard className="h-full" />}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Revenue by Store</h2>
          {stores ? (
            <DataTable columns={storeColumns} data={stores} onRowClick={handleStoreClick} />
          ) : (
            <SkeletonCard className="h-48" />
          )}
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Orders by Status</h2>
          {statusData ? (
            <Doughnut
              data={statusData}
              options={{
                responsive: true,
                plugins: {
                  legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } },
                },
                cutout: "65%",
              }}
            />
          ) : (
            <SkeletonCard className="h-48" />
          )}
        </div>
      </div>
    </div>
  );
}
