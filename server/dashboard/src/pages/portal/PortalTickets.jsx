import { useEffect, useState } from "react";
import { SkeletonCard } from "../../components/Skeleton";
import { MessageSquare, Plus, X, Clock, CheckCircle, Send } from "lucide-react";

export default function PortalTickets({ token }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: "", message: "", priority: "normal" });
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const portalFetch = (url, opts = {}) => fetch(url, {
    ...opts,
    headers: { "x-portal-token": token, "Content-Type": "application/json", ...opts.headers },
  }).then(r => r.json());

  const fetchTickets = () => {
    setLoading(true);
    portalFetch("/api/portal/tickets")
      .then(r => setTickets(r.tickets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTickets(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await portalFetch("/api/portal/tickets", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setForm({ subject: "", message: "", priority: "normal" });
    setShowForm(false);
    setSubmitting(false);
    fetchTickets();
  };

  const statusBadge = (status) => {
    const styles = {
      open: "bg-yellow-50 text-yellow-700",
      replied: "bg-green-50 text-green-700",
      closed: "bg-slate-100 text-slate-500",
    };
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${styles[status] || styles.open}`}>{status}</span>;
  };

  if (loading) return <SkeletonCard className="h-64" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Support Tickets</h2>
          <p className="text-sm text-slate-400 mt-0.5">Submit and track support requests</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors">
          {showForm ? <><X size={13} /> Cancel</> : <><Plus size={13} /> New Ticket</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Subject</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
              placeholder="Brief description of your issue" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Message</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} required rows={4}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none"
              placeholder="Describe your issue in detail..." />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Priority</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <button type="submit" disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors">
            <Send size={14} /> {submitting ? "Submitting..." : "Submit Ticket"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {tickets.map(t => (
          <div key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button onClick={() => setExpanded(expanded === t.id ? null : t.id)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors">
              <MessageSquare size={16} className="text-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{t.subject}</p>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                  <Clock size={10} /> {new Date(t.created_at).toLocaleDateString()}
                </p>
              </div>
              {statusBadge(t.status)}
            </button>
            {expanded === t.id && (
              <div className="px-5 pb-4 border-t border-gray-50 space-y-3">
                <div className="bg-slate-50 rounded-lg p-3 mt-3">
                  <p className="text-xs font-medium text-slate-500 mb-1">Your message</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.message}</p>
                </div>
                {t.admin_reply && (
                  <div className="bg-indigo-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-indigo-600 mb-1 flex items-center gap-1">
                      <CheckCircle size={10} /> Admin Reply {t.replied_at && <span className="text-indigo-400">({new Date(t.replied_at).toLocaleDateString()})</span>}
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.admin_reply}</p>
                  </div>
                )}
                {!t.admin_reply && t.status === "open" && (
                  <p className="text-xs text-slate-400 italic">Awaiting admin response...</p>
                )}
              </div>
            )}
          </div>
        ))}
        {tickets.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <MessageSquare size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">No tickets yet</p>
            <p className="text-xs text-slate-300 mt-1">Click "New Ticket" to submit a support request</p>
          </div>
        )}
      </div>
    </div>
  );
}
