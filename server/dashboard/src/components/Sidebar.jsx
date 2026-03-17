import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, DollarSign, Store, Bell, Shield,
  MessageSquare, Settings, PanelLeftClose, PanelLeft, LogOut, Globe, Package,
} from "lucide-react";

const navItems = [
  { to: "/dashboard",          label: "Overview",  icon: LayoutDashboard, end: true },
  { to: "/dashboard/revenue",  label: "Revenue",   icon: DollarSign },
  { to: "/dashboard/stores",   label: "Stores",    icon: Store },
  { to: "/dashboard/alerts",   label: "Alerts",    icon: Bell },
  { to: "/dashboard/disputes", label: "Disputes",  icon: Shield },
  { to: "/dashboard/uptime",   label: "Uptime",    icon: Globe },
  { to: "/dashboard/inventory", label: "Inventory", icon: Package },
  { to: "/dashboard/chat",     label: "AI Chat",   icon: MessageSquare },
  { to: "/dashboard/system",   label: "System",    icon: Settings },
];

export default function Sidebar({ collapsed, onToggle, onLogout, badgeCount }) {
  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-30 flex flex-col transition-all duration-200 ${
        collapsed ? "w-[60px]" : "w-[200px]"
      }`}
    >
      <div className="flex items-center gap-2.5 px-3 h-14 border-b border-gray-100 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
          W
        </div>
        {!collapsed && (
          <span className="text-sm font-bold text-slate-900 truncate">WCM</span>
        )}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const showBadge = item.label === "Alerts" && badgeCount > 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                  isActive
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {showBadge && (
                <span className={`min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-red-500 text-white flex items-center justify-center ${
                  collapsed ? "absolute -top-0.5 -right-0.5" : "ml-auto"
                }`}>
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-gray-100 p-2 space-y-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600 w-full transition-colors"
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-slate-400 hover:bg-red-50 hover:text-red-500 w-full transition-colors"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
