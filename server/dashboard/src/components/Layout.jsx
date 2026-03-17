import { Outlet } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { api, apiPost } from "../api/client";
import { RefreshCw, WifiOff, Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";

export default function Layout({ onLogout }) {
  const [overview, setOverview] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [online, setOnline] = useState(true);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    try { await apiPost("/api/auth/logout", {}); } catch (_) {}
    onLogout?.();
  }

  const refresh = useCallback(() => {
    api("/api/dashboard")
      .then((d) => { setOverview(d.overview); setLastUpdated(Date.now()); setOnline(true); })
      .catch(() => setOnline(false));
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 60000); return () => clearInterval(t); }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdated) setSecondsAgo(Math.round((Date.now() - lastUpdated) / 1000));
    }, 5000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  useEffect(() => {
    const crit = overview?.criticalAlerts || 0;
    document.title = crit > 0 ? `(${crit}) Influencers Link` : "Influencers Link";
  }, [overview?.criticalAlerts]);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  const badgeCount = (overview?.criticalAlerts || 0) + (overview?.highAlerts || 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden sm:block">
        <Sidebar
          collapsed={collapsed}
          onToggle={toggleCollapse}
          onLogout={handleLogout}
          badgeCount={badgeCount}
        />
      </div>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-20 sm:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed left-0 top-0 h-full z-30 sm:hidden">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              onLogout={handleLogout}
              badgeCount={badgeCount}
            />
          </div>
        </>
      )}

      {/* Main content area */}
      <div className={`transition-all duration-200 ${collapsed ? "sm:ml-[60px]" : "sm:ml-[200px]"}`}>
        <header className="sticky top-0 bg-white/80 backdrop-blur-sm border-b border-gray-100 z-10 h-14 flex items-center justify-between px-4 sm:px-6">
          <button className="sm:hidden p-2 hover:bg-slate-100 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} className="text-slate-600" />}
          </button>

          <div className="hidden sm:block" />

          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 text-xs ${online ? "text-emerald-500" : "text-red-400"}`}>
              {online
                ? <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{secondsAgo < 10 ? "Live" : `${secondsAgo}s ago`}</span>
                  </>
                : <><WifiOff size={12} /><span>Offline</span></>
              }
            </div>
            <button
              onClick={refresh}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
              title="Refresh now"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6">
          <Outlet context={{ overview, refresh }} />
        </main>
      </div>
    </div>
  );
}
