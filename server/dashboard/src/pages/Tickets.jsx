import { useEffect, useState } from "react";
import { api, apiPost, apiPatch } from "../api/client";
import PageHeader from "../components/PageHeader";
import { SkeletonCard } from "../components/Skeleton";
import {
  MessageSquare, ChevronDown, ChevronRight, Send, CheckCircle,
  Clock, AlertTriangle, Filter,
} from "lucide-react";

const STATUS_STYLES = {
  open: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Open" },
  replied: { bg: "bg-green-50", text: "text-green-700", label: "Replied" },
  closed: { bg: "bg-slate-100", text: "text-slate-500", label: "Closed" },
};

const PRIORITY_STYLES = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  normal: "bg-slate-100 text-slate-600",
  low: "bg-slate-50 text-slate-400",
};

export default function Tickets() {
  const [data, setData] = useState({ tickets: [], total: 0 });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [filter, setFilter] = useState("");

  const fetchAll = () => {
    setLoading(true);
    const params = filter ? `?status=${filter}` : "";
    Promise.all([
      api(`/api/tickets${params}`),
      api("/api/tickets/stats"),
    ]).then(([t, s]) => {
      setData(t);
      setStats(s);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [filter]);

  const handleReply = async (ticketId) => {
    if (!reply.trim()) return;
    setReplying(true);
    await apiPost(`/api/tickets/${ticketId}/reply`, { reply });
    setReply("");
    setReplying(false);
    fetchAll();
  };

  const handleClose = async (ticketId) => {
    await apiPatch(`/api/tickets/${ticketId}`, { status: "closed" });
    fetchAll();
  };

  const handleReopen = async (ticketId) => {
    await apiPatch(`/api/tickets/${ticketId}`, { status: "open" });
    fetchAll();
  };

  if (loading && !stats) return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Support Tickets" subtitle="Client support requests" />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Total" value={stats.total} icon={<MessageSquare size={14} />} />
          <MiniStat label="Open" value={stats.open} icon={<AlertTriangle size={14} />} color="yellow" />
          <MiniStat label="Replied" value={stats.replied} icon={<CheckCircle size={14} />} color="green" />
          <MiniStat label="Closed" value={stats.closed} icon={<Clock size={14} />} />
        </div>
      )}

      <div className="flex gap-2 items-center">
        <Filter size={14} className="text-slate-400" />
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">All Tickets</option>
          <option value="open">Open</option>
          <option value="replied">Replied</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="space-y-3">
        {data.tickets.map(t => {
          const st = STATUS_STYLES[t.status] || STATUS_STYLES.open;
          const isOpen = expanded === t.id;
          return (
            <div key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => { setExpanded(isOpen ? null : t.id); setReply(""); }}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors">
                <span className="text-slate-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{t.subject}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t.store_name || "Unknown store"} {"\u00b7"} {t.user_name || t.user_email || "Unknown"} {"\u00b7"} {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.normal}`}>{t.priority}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${st.bg} ${st.text}`}>{st.label}</span>
              </button>

              {isOpen && (
                <div className="px-5 pb-4 border-t border-gray-50 space-y-3">
                  <div className="bg-slate-50 rounded-lg p-3 mt-3">
                    <p className="text-xs font-medium text-slate-500 mb-1">Client Message</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.message}</p>
                  </div>

                  {t.admin_reply && (
                    <div className="bg-indigo-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-indigo-600 mb-1">Your Reply ({t.replied_at ? new Date(t.replied_at).toLocaleDateString() : ""})</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.admin_reply}</p>
                    </div>
                  )}

                  {t.status !== "closed" && (
                    <div className="space-y-2">
                      <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none"
                        placeholder="Type your reply..." />
                      <div className="flex gap-2">
                        <button onClick={() => handleReply(t.id)} disabled={replying || !reply.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors">
                          <Send size={12} /> {replying ? "Sending..." : "Reply"}
                        </button>
                        <button onClick={() => handleClose(t.id)}
                          className="px-3 py-1.5 border border-slate-200 text-slate-500 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors">
                          Close Ticket
                        </button>
                      </div>
                    </div>
                  )}

                  {t.status === "closed" && (
                    <button onClick={() => handleReopen(t.id)}
                      className="px-3 py-1.5 border border-slate-200 text-slate-500 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors">
                      Reopen Ticket
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {data.tickets.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <MessageSquare size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">No tickets</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon, color }) {
  const colors = { yellow: "text-yellow-600", green: "text-green-600" };
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">{icon}{label}</div>
      <p className={`text-xl font-bold ${colors[color] || "text-slate-700"}`}>{value}</p>
    </div>
  );
}
