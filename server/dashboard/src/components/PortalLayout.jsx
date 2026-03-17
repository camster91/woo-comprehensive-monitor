import { Outlet, NavLink } from "react-router-dom";
import { LogOut, LayoutDashboard, MessageSquare, DollarSign, ShoppingCart, AlertTriangle, Bell } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

const navItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/revenue", label: "Revenue", icon: DollarSign },
  { to: "/orders", label: "Orders", icon: ShoppingCart },
  { to: "/alerts", label: "Alerts", icon: AlertTriangle },
  { to: "/tickets", label: "Tickets", icon: MessageSquare },
];

export default function PortalLayout({ user, onLogout, token }) {
  const [unread, setUnread] = useState(0);

  const fetchUnread = useCallback(() => {
    if (!token) return;
    fetch("/api/portal/notifications/count", { headers: { "x-portal-token": token } })
      .then(r => r.json())
      .then(d => setUnread(d.unread || 0))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    fetchUnread();
    const t = setInterval(fetchUnread, 30000);
    return () => clearInterval(t);
  }, [fetchUnread]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-3">
            <img src="/favicon-192.png" alt="IL" className="w-8 h-8 rounded-lg" />
            <span className="text-sm font-bold text-slate-900 dark:text-white">Influencers Link</span>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700"
                  }`
                }
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {unread > 0 && (
              <span className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                <Bell size={12} /> {unread}
              </span>
            )}
            <span className="text-xs text-slate-400 hidden sm:inline">{user?.email}</span>
            <button onClick={onLogout} className="text-slate-400 hover:text-red-500 transition-colors p-2"><LogOut size={16} /></button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
