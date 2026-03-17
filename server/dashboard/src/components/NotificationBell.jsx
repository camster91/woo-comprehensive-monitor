import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";
import { api, apiPost } from "../api/client";

const typeIcons = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  success: CheckCircle,
};

const typeColors = {
  info: "text-blue-500",
  warning: "text-amber-500",
  error: "text-red-500",
  success: "text-emerald-500",
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr + "Z").getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const fetchCount = useCallback(() => {
    api("/api/notifications/count").then(d => setUnread(d.unread || 0)).catch(() => {});
  }, []);

  const fetchNotifications = useCallback(() => {
    api("/api/notifications?limit=20").then(d => {
      setNotifications(d.notifications || []);
      setUnread(d.unread || 0);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, [fetchCount]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleRead(id) {
    apiPost(`/api/notifications/${id}/read`).then(() => {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n));
      setUnread(prev => Math.max(0, prev - 1));
    }).catch(() => {});
  }

  function handleReadAll() {
    apiPost("/api/notifications/read-all").then(() => {
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
      setUnread(0);
    }).catch(() => {});
  }

  function handleClick(n) {
    if (!n.read) handleRead(n.id);
    if (n.link) { navigate(n.link); setOpen(false); }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
        title="Notifications"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 text-[9px] font-bold rounded-full bg-red-500 text-white flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-slate-700">Notifications</h3>
            {unread > 0 && (
              <button onClick={handleReadAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center">
                <Bell size={24} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">No notifications</p>
              </div>
            ) : (
              notifications.map(n => {
                const Icon = typeIcons[n.type] || Info;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50 last:border-0 ${
                      n.read ? "bg-white hover:bg-slate-50" : "bg-indigo-50/30 hover:bg-indigo-50/50"
                    }`}
                  >
                    <Icon size={14} className={`mt-0.5 shrink-0 ${typeColors[n.type] || "text-slate-400"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${n.read ? "text-slate-600" : "font-medium text-slate-800"}`}>{n.title}</p>
                      {n.message && <p className="text-xs text-slate-400 truncate mt-0.5">{n.message}</p>}
                      <p className="text-[10px] text-slate-300 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
