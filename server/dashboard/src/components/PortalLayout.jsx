import { Outlet, NavLink } from "react-router-dom";
import { LogOut, LayoutDashboard, MessageSquare } from "lucide-react";

const navItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/tickets", label: "Tickets", icon: MessageSquare },
];

export default function PortalLayout({ user, onLogout }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-3">
            <img src="/favicon-192.png" alt="IL" className="w-8 h-8 rounded-lg" />
            <span className="text-sm font-bold text-slate-900">Influencers Link</span>
          </div>
          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  }`
                }
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
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
