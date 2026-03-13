import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import {
  LayoutDashboard, Store, Bell, MessageSquare, Settings,
  RefreshCw, Wifi, WifiOff, Menu, X,
} from "lucide-react";

const tabs = [
  { to: "/dashboard",         label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/stores",  label: "Stores",   icon: Store },
  { to: "/dashboard/alerts",  label: "Alerts",   icon: Bell },
  { to: "/dashboard/chat",    label: "AI Chat",  icon: MessageSquare },
  { to: "/dashboard/system",  label: "System",   icon: Settings },
];

export default function Layout() {
  const [overview, setOverview] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [online, setOnline] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    api("/api/dashboard")
      .then((d) => { setOverview(d.overview); setLastUpdated(Date.now()); setOnline(true); })
      .catch(() => setOnline(false));
  }, []);

  // Initial load + 60s auto-refresh
  useEffect(() => { refresh(); const t = setInterval(refresh, 60000); return () => clearInterval(t); }, [refresh]);

  // Tick "X seconds ago" counter
  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdated) setSecondsAgo(Math.round((Date.now() - lastUpdated) / 1000));
    }, 5000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  // Tab title — show critical count
  useEffect(() => {
    const crit = overview?.criticalAlerts || 0;
    document.title = crit > 0 ? `(${crit}) WooCommerce Monitor` : "WooCommerce Monitor";
  }, [overview?.criticalAlerts]);

  const critCount   = overview?.criticalAlerts || 0;
  const highCount   = overview?.highAlerts || 0;
  const badgeCount  = critCount + highCount;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-700 text-white shadow-lg z-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shadow-sm">
                <LayoutDashboard size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight">WooCommerce Monitor</h1>
                <p className="text-white/50 text-[10px] leading-tight hidden sm:block">
                  Multi-store monitoring
                </p>
              </div>
            </div>

            {/* Right side: live indicator + refresh */}
            <div className="flex items-center gap-3">
              {/* Online/offline */}
              <div className={`flex items-center gap-1.5 text-xs ${online ? "text-green-400" : "text-red-400"}`}>
                {online
                  ? <><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="hidden sm:inline">
                        {secondsAgo < 10 ? "Live" : `${secondsAgo}s ago`}
                      </span></>
                  : <><WifiOff size={12} /><span>Offline</span></>
                }
              </div>

              {/* Refresh button */}
              <button onClick={refresh}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
                title="Refresh now">
                <RefreshCw size={14} />
              </button>

              {/* Mobile hamburger */}
              <button className="sm:hidden p-1.5 hover:bg-white/10 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>

          {/* ── Desktop nav ── */}
          <nav className="hidden sm:flex gap-1 pb-1">
            {tabs.map((t) => (
              <TabLink key={t.to} tab={t} badge={t.label === "Alerts" ? badgeCount : 0} />
            ))}
          </nav>
        </div>

        {/* ── Mobile nav (dropdown) ── */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-white/10 px-4 py-2 flex flex-col gap-1">
            {tabs.map((t) => (
              <TabLink
                key={t.to} tab={t}
                badge={t.label === "Alerts" ? badgeCount : 0}
                mobile
                onClick={() => setMobileOpen(false)}
              />
            ))}
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <Outlet context={{ overview, refresh }} />
      </main>
    </div>
  );
}

function TabLink({ tab, badge, mobile, onClick }) {
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      onClick={onClick}
      className={({ isActive }) =>
        mobile
          ? `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
             ${isActive ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`
          : `flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors relative
             ${isActive
               ? "bg-white/15 text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-400"
               : "text-white/65 hover:bg-white/10 hover:text-white"}`
      }
    >
      <Icon size={15} />
      <span>{tab.label}</span>
      {badge > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-red-500 text-white flex items-center justify-center">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}
