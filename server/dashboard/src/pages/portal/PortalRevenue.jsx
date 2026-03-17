import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from "chart.js";
import StatCard from "../../components/StatCard";
import PageHeader from "../../components/PageHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { DollarSign, ShoppingCart, TrendingUp, TrendingDown } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const PERIODS = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
];

export default function PortalRevenue({ token }) {
  const [data, setData] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [period, setPeriod] = useState("7d");
  const [loading, setLoading] = useState(true);

  const portalFetch = (url) => fetch(url, { headers: { "x-portal-token": token } }).then(r => r.json());

  useEffect(() => {
    setLoading(true);
    portalFetch(`/api/portal/revenue?period=${period}`)
      .then(d => { setData(d); setTimeline(d.timeline || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
      <SkeletonCard className="h-64" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue" subtitle="Your store's revenue and order metrics">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                period === p.value ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Revenue" value={`$${(data.totalRevenue || 0).toLocaleString()}`}
            icon={<DollarSign size={18} />} variant="hero"
            change={data.revenueChange} />
          <StatCard label="Orders" value={data.totalOrders || 0}
            icon={<ShoppingCart size={18} />}
            change={data.ordersChange} />
          <StatCard label="Avg Order" value={data.totalOrders > 0 ? `$${(data.totalRevenue / data.totalOrders).toFixed(2)}` : "$0"}
            icon={<TrendingUp size={18} />} />
          <StatCard label="Failed" value={data.failedCount || 0}
            icon={<TrendingDown size={18} />} sub="payments" />
        </div>
      )}

      {timeline.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Revenue Timeline</h2>
          <Line
            data={{
              labels: timeline.map(t => t.date),
              datasets: [{
                label: "Revenue",
                data: timeline.map(t => t.revenue),
                borderColor: "#6366f1",
                backgroundColor: "rgba(99, 102, 241, 0.1)",
                fill: true,
                tension: 0.3,
              }],
            }}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, ticks: { callback: v => `$${v}` } },
              },
            }}
          />
        </div>
      )}
    </div>
  );
}
