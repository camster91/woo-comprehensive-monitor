import { useEffect, useState } from "react";
import { api, apiPost } from "../api/client";
import StatCard from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import DataTable from "../components/DataTable";
import { SkeletonCard } from "../components/Skeleton";
import { Package, AlertTriangle, TrendingDown, DollarSign, RefreshCw } from "lucide-react";

export default function Inventory() {
  const [summary, setSummary] = useState(null);
  const [outOfStock, setOutOfStock] = useState(null);
  const [lowStock, setLowStock] = useState(null);
  const [priceChanges, setPriceChanges] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  function fetchAll() {
    setLoading(true);
    Promise.all([
      api("/api/inventory"),
      api("/api/inventory/out-of-stock"),
      api("/api/inventory/low-stock"),
      api("/api/inventory/price-changes?days=7"),
    ]).then(([sum, oos, ls, pc]) => {
      setSummary(sum);
      setOutOfStock(oos.products || []);
      setLowStock(ls.products || []);
      setPriceChanges(pc.changes || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { fetchAll(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try { await apiPost("/api/inventory/sync", {}); fetchAll(); }
    catch (err) { console.error(err); }
    setSyncing(false);
  };

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
    </div>
  );

  const oosColumns = [
    { key: "store_name", label: "Store", sortable: true },
    { key: "name", label: "Product", sortable: true },
    { key: "sku", label: "SKU", sortable: true, render: (v) => v || "\u2014" },
    { key: "price", label: "Price", sortable: true, render: (v) => `$${(v || 0).toFixed(2)}` },
  ];

  const lowColumns = [
    { key: "store_name", label: "Store", sortable: true },
    { key: "name", label: "Product", sortable: true },
    { key: "sku", label: "SKU", sortable: true, render: (v) => v || "\u2014" },
    { key: "stock_quantity", label: "Qty Left", sortable: true, render: (v) => (
      <span className={`text-xs font-bold px-2 py-0.5 rounded ${v <= 2 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{v}</span>
    )},
    { key: "price", label: "Price", sortable: true, render: (v) => `$${(v || 0).toFixed(2)}` },
  ];

  const priceColumns = [
    { key: "store_id", label: "Store", sortable: false, render: (v, row) => row.subject?.split(" on ")[1] || "\u2014" },
    { key: "subject", label: "Product", sortable: true, render: (v) => v?.replace("Price Change: ", "").split(" on ")[0] || "\u2014" },
    { key: "message", label: "Change", sortable: false, render: (v) => {
      const match = v?.match(/from \$([0-9.]+) to \$([0-9.]+)/);
      if (!match) return v || "\u2014";
      const [, old_price, new_price] = match;
      const increased = parseFloat(new_price) > parseFloat(old_price);
      return (
        <span>
          <span className="text-slate-400">${old_price}</span>
          <span className="mx-1">{"\u2192"}</span>
          <span className={increased ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>${new_price}</span>
        </span>
      );
    }},
    { key: "timestamp", label: "Date", sortable: true, render: (v) => v ? new Date(v).toLocaleDateString() : "\u2014" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" subtitle="Stock levels and price tracking across stores">
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors">
          {syncing ? <><RefreshCw size={13} className="animate-spin" /> Syncing...</> : <><RefreshCw size={13} /> Sync Now</>}
        </button>
      </PageHeader>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Products" value={summary.total} icon={<Package size={18} />} variant="hero" />
          <StatCard label="Out of Stock" value={summary.outOfStock} icon={<AlertTriangle size={18} />}
            pulse={summary.outOfStock > 0} sub={summary.outOfStock > 0 ? "needs restock" : "all stocked"} />
          <StatCard label="Low Stock" value={summary.lowStock} icon={<TrendingDown size={18} />}
            sub="5 or fewer units" />
          <StatCard label="Price Changes" value={priceChanges?.length || 0} icon={<DollarSign size={18} />}
            sub="last 7 days" />
        </div>
      )}

      {outOfStock && outOfStock.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-500" /> Out of Stock ({outOfStock.length})
          </h2>
          <DataTable columns={oosColumns} data={outOfStock} />
        </div>
      )}

      {lowStock && lowStock.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingDown size={15} className="text-yellow-500" /> Low Stock ({lowStock.length})
          </h2>
          <DataTable columns={lowColumns} data={lowStock} />
        </div>
      )}

      {priceChanges && priceChanges.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <DollarSign size={15} className="text-indigo-500" /> Recent Price Changes
          </h2>
          <DataTable columns={priceColumns} data={priceChanges} />
        </div>
      )}

      {(!outOfStock || outOfStock.length === 0) && (!lowStock || lowStock.length === 0) && (!priceChanges || priceChanges.length === 0) && summary && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Package size={40} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Inventory data is syncing</h3>
          <p className="text-sm text-slate-400">Click "Sync Now" to pull product data from your stores.</p>
        </div>
      )}
    </div>
  );
}
