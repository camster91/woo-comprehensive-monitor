import { useEffect, useState, useMemo } from "react";
import { api, apiPost } from "../api/client";
import { useToast } from "../components/Toast";
import StatCard from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import { SkeletonCard } from "../components/Skeleton";
import {
  RefreshCw, Search, Filter, X, ChevronDown, ChevronRight,
  DollarSign, Users, Pause, Play, XCircle, AlertTriangle,
  Clock, CreditCard, ShoppingCart, ExternalLink, Loader,
  CalendarDays, Mail, User, Package, Store, ArrowUpDown,
} from "lucide-react";

const STATUS_STYLES = {
  active:           { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Active" },
  "on-hold":        { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500",   label: "On Hold" },
  cancelled:        { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500",     label: "Cancelled" },
  "pending-cancel": { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500",  label: "Pending Cancel" },
  expired:          { bg: "bg-slate-100",  text: "text-slate-500",   dot: "bg-slate-400",   label: "Expired" },
  pending:          { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500",    label: "Pending" },
  "switched":       { bg: "bg-purple-50",  text: "text-purple-700",  dot: "bg-purple-500",  label: "Switched" },
};

const STATUS_FILTERS = [
  { value: "any",             label: "All Statuses" },
  { value: "active",          label: "Active" },
  { value: "on-hold",         label: "On Hold" },
  { value: "cancelled",       label: "Cancelled" },
  { value: "pending-cancel",  label: "Pending Cancel" },
  { value: "expired",         label: "Expired" },
];

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatInterval(period, interval) {
  const n = parseInt(interval) || 1;
  const labels = { day: "day", week: "week", month: "month", year: "year" };
  const label = labels[period] || period;
  if (n === 1) return `/ ${label}`;
  return `/ ${n} ${label}s`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.ceil((d - Date.now()) / 86400000);
}

export default function Subscriptions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("any");
  const [storeFilter, setStoreFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [sortField, setSortField] = useState("next_payment");
  const [sortDir, setSortDir] = useState("asc");
  const toast = useToast();

  const fetchSubs = (showLoading = true) => {
    if (showLoading) setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "any") params.set("status", statusFilter);
    if (storeFilter) params.set("storeId", storeFilter);
    api(`/api/subscriptions?${params}`)
      .then(setData)
      .catch(err => toast?.(`Failed to load: ${err.message}`, "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSubs(); }, [statusFilter, storeFilter]);

  const stores = useMemo(() => {
    if (!data?.subscriptions) return [];
    const map = {};
    data.subscriptions.forEach(s => { map[s.store_id] = s.store_name; });
    return Object.entries(map).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.subscriptions) return [];
    let subs = data.subscriptions;
    if (searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase();
      subs = subs.filter(s =>
        s.customer.name.toLowerCase().includes(q) ||
        s.customer.email.toLowerCase().includes(q) ||
        String(s.id).includes(q) ||
        s.items.some(i => i.name.toLowerCase().includes(q))
      );
    }
    // Sort
    subs = [...subs].sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case "customer": va = a.customer.name; vb = b.customer.name; break;
        case "total": va = parseFloat(a.total) || 0; vb = parseFloat(b.total) || 0; break;
        case "store": va = a.store_name; vb = b.store_name; break;
        case "start_date": va = a.start_date || ""; vb = b.start_date || ""; break;
        case "next_payment":
        default: va = a.next_payment || "9999"; vb = b.next_payment || "9999"; break;
      }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return subs;
  }, [data, searchQuery, sortField, sortDir]);

  const handleAction = async (sub, action) => {
    const key = `${sub.store_id}:${sub.id}:${action}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));
    try {
      await apiPost(`/api/subscriptions/${sub.store_id}/${sub.id}/${action}`);
      toast?.(`Subscription #${sub.id} ${action === "cancel" ? "cancelled" : action === "hold" ? "paused" : "reactivated"}`);
      setConfirmCancel(null);
      fetchSubs(false);
    } catch (err) {
      toast?.(`Failed: ${err.message}`, "error");
    }
    setActionLoading(prev => ({ ...prev, [key]: false }));
  };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortHeader = ({ field, children, className = "" }) => (
    <button onClick={() => toggleSort(field)}
      className={`flex items-center gap-1 text-xs font-medium text-slate-500 uppercase hover:text-slate-700 transition-colors ${className}`}>
      {children}
      {sortField === field && <ArrowUpDown size={10} className="text-indigo-500" />}
    </button>
  );

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
      <SkeletonCard className="h-96" />
    </div>
  );

  const stats = data?.stats || {};

  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" subtitle={`${stats.total || 0} subscriptions across ${stats.storesWithSubs || 0} stores`}>
        <button onClick={() => fetchSubs()}
          className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
          <RefreshCw size={13} /> Refresh
        </button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Active" value={stats.active || 0} icon={<Play size={18} />} variant="hero" sub="subscriptions" />
        <StatCard label="On Hold" value={stats.onHold || 0} icon={<Pause size={18} />} sub="paused" />
        <StatCard label="Cancelled" value={stats.cancelled || 0} icon={<XCircle size={18} />} sub="total" />
        <StatCard label="MRR" value={`$${Math.round(stats.monthlyRevenue || 0).toLocaleString()}`} icon={<DollarSign size={18} />} sub="estimated" />
        <StatCard label="Stores" value={stats.storesWithSubs || 0} icon={<Store size={18} />} sub="with subs" />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-600 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by customer, email, product, or ID..."
              className="bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none w-full placeholder:text-slate-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Filter size={13} className="text-slate-400" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              {STATUS_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
            <option value="">All Stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <span className="text-xs text-slate-400">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Subscription list */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700 p-12 text-center">
          <CreditCard size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-400">
            {data?.subscriptions?.length === 0 ? "No subscriptions found across your stores" : "No subscriptions match your filters"}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table header */}
          <div className="hidden lg:grid lg:grid-cols-[2fr_1.5fr_1fr_1fr_1fr_140px] gap-4 px-5 py-2">
            <SortHeader field="customer">Customer</SortHeader>
            <SortHeader field="store">Store / Product</SortHeader>
            <SortHeader field="total">Amount</SortHeader>
            <SortHeader field="next_payment">Next Payment</SortHeader>
            <div className="text-xs font-medium text-slate-500 uppercase">Status</div>
            <div className="text-xs font-medium text-slate-500 uppercase text-right">Actions</div>
          </div>

          <div className="space-y-2">
            {filtered.map(sub => {
              const isExpanded = expanded === `${sub.store_id}-${sub.id}`;
              const daysToPayment = daysUntil(sub.next_payment);
              const cancelKey = `${sub.store_id}:${sub.id}:cancel`;
              const holdKey = `${sub.store_id}:${sub.id}:hold`;
              const reactivateKey = `${sub.store_id}:${sub.id}:reactivate`;
              const isConfirming = confirmCancel === `${sub.store_id}-${sub.id}`;

              return (
                <div key={`${sub.store_id}-${sub.id}`}
                  className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden hover:border-gray-200 dark:hover:border-slate-600 transition-colors">

                  {/* Main row */}
                  <div className="grid grid-cols-1 lg:grid-cols-[2fr_1.5fr_1fr_1fr_1fr_140px] gap-3 lg:gap-4 px-5 py-4 items-center">
                    {/* Customer */}
                    <button onClick={() => setExpanded(isExpanded ? null : `${sub.store_id}-${sub.id}`)}
                      className="flex items-center gap-3 text-left min-w-0">
                      <span className="text-slate-400 shrink-0 hidden lg:block">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {sub.customer.name || "Unknown"}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{sub.customer.email}</p>
                      </div>
                    </button>

                    {/* Store / Product */}
                    <div className="min-w-0">
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium truncate">{sub.store_name}</p>
                      <p className="text-xs text-slate-400 truncate">{sub.items.map(i => i.name).join(", ") || "—"}</p>
                    </div>

                    {/* Amount */}
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        ${parseFloat(sub.total || 0).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-slate-400">{formatInterval(sub.billing_period, sub.billing_interval)}</p>
                    </div>

                    {/* Next Payment */}
                    <div>
                      {sub.next_payment ? (
                        <>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{formatDate(sub.next_payment)}</p>
                          {daysToPayment !== null && daysToPayment >= 0 && (
                            <p className={`text-[10px] font-medium ${
                              daysToPayment <= 3 ? "text-amber-600" : "text-slate-400"
                            }`}>
                              {daysToPayment === 0 ? "Today" : daysToPayment === 1 ? "Tomorrow" : `${daysToPayment} days`}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>

                    {/* Status */}
                    <div>
                      <StatusBadge status={sub.status} />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 justify-end">
                      {sub.status === "active" && (
                        <>
                          <button
                            onClick={() => handleAction(sub, "hold")}
                            disabled={actionLoading[holdKey]}
                            className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
                            title="Pause subscription"
                          >
                            {actionLoading[holdKey] ? <Loader size={14} className="animate-spin" /> : <Pause size={14} />}
                          </button>
                          <button
                            onClick={() => setConfirmCancel(isConfirming ? null : `${sub.store_id}-${sub.id}`)}
                            disabled={actionLoading[cancelKey]}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                            title="Cancel subscription"
                          >
                            {actionLoading[cancelKey] ? <Loader size={14} className="animate-spin" /> : <XCircle size={14} />}
                          </button>
                        </>
                      )}
                      {(sub.status === "on-hold" || sub.status === "cancelled") && (
                        <button
                          onClick={() => handleAction(sub, "reactivate")}
                          disabled={actionLoading[reactivateKey]}
                          className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                          title="Reactivate subscription"
                        >
                          {actionLoading[reactivateKey] ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
                        </button>
                      )}
                      <a href={`${sub.store_url}/wp-admin/post.php?post=${sub.id}&action=edit`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                        title="Open in WP Admin"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>

                  {/* Cancel confirmation */}
                  {isConfirming && (
                    <div className="px-5 py-3 bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/20">
                      <div className="flex items-center gap-3">
                        <AlertTriangle size={16} className="text-red-500 shrink-0" />
                        <p className="text-sm text-red-700 dark:text-red-400 flex-1">
                          Cancel <strong>{sub.customer.name}</strong>'s subscription to{" "}
                          <strong>{sub.items.map(i => i.name).join(", ")}</strong> on {sub.store_name}?
                          This stops all future payments.
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => setConfirmCancel(null)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                            Keep Active
                          </button>
                          <button
                            onClick={() => handleAction(sub, "cancel")}
                            disabled={actionLoading[cancelKey]}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                            {actionLoading[cancelKey] ? <Loader size={12} className="animate-spin" /> : <XCircle size={12} />}
                            Cancel Subscription
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 border-t border-gray-50 dark:border-slate-700">
                      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <DetailItem icon={User} label="Customer" value={sub.customer.name || "Unknown"} sub={sub.customer.email} />
                        <DetailItem icon={CalendarDays} label="Started" value={formatDate(sub.start_date)} sub={sub.last_payment ? `Last paid: ${formatDate(sub.last_payment)}` : null} />
                        <DetailItem icon={CreditCard} label="Payment Method" value={sub.payment_method || "—"} sub={`$${parseFloat(sub.total || 0).toFixed(2)} ${formatInterval(sub.billing_period, sub.billing_interval)}`} />
                        <DetailItem icon={Clock} label="Next Payment" value={sub.next_payment ? formatDate(sub.next_payment) : "None scheduled"}
                          sub={sub.end_date ? `Ends: ${formatDate(sub.end_date)}` : sub.trial_end ? `Trial ends: ${formatDate(sub.trial_end)}` : null} />
                      </div>

                      {sub.items.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-medium text-slate-500 uppercase mb-2">Items</p>
                          <div className="space-y-1.5">
                            {sub.items.map((item, j) => (
                              <div key={j} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                                <Package size={13} className="text-slate-400 shrink-0" />
                                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{item.name}</span>
                                <span className="text-xs text-slate-400">x{item.quantity}</span>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">${parseFloat(item.total || 0).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">#{sub.id}</span>
                        <span className="text-[10px] text-slate-300">|</span>
                        <a href={`${sub.store_url}/wp-admin/post.php?post=${sub.id}&action=edit`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
                          Open in {sub.store_name} <ExternalLink size={9} />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function DetailItem({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} className="text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-slate-400 uppercase">{label}</p>
        <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{value}</p>
        {sub && <p className="text-[10px] text-slate-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}
