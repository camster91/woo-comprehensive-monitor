import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/dashboard", label: "Overview" },
  { to: "/dashboard/stores", label: "Stores" },
  { to: "/dashboard/alerts", label: "Alerts" },
  { to: "/dashboard/chat", label: "AI Chat" },
  { to: "/dashboard/system", label: "System" },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gradient-to-r from-slate-800 to-blue-600 text-white p-6 rounded-b-xl">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">WooCommerce Monitor</h1>
            <p className="text-white/70 text-sm">Multi-store monitoring & dispute protection</p>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto mt-4 flex gap-2">
          {tabs.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === "/dashboard"}
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-white text-slate-800" : "text-white/80 hover:bg-white/10"
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
