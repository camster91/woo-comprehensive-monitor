import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, DollarSign, Store, Bell, Shield,
  MessageSquare, Settings, PanelLeftClose, PanelLeft, LogOut, Globe, Package, Users, Wrench,
  Brain, Sliders, Repeat,
} from "lucide-react";

const navItems = [
  { to: "/",          label: "Overview",  icon: LayoutDashboard, end: true },
  { to: "/revenue",   label: "Revenue",   icon: DollarSign },
  { to: "/stores",    label: "Stores",    icon: Store },
  { to: "/alerts",    label: "Alerts",    icon: Bell },
  { to: "/disputes",  label: "Disputes",  icon: Shield },
  { to: "/uptime",    label: "Uptime",    icon: Globe },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/manage",    label: "Manage",    icon: Wrench },
  { to: "/subscriptions", label: "Subs", icon: Repeat },
  { to: "/portal-users", label: "Portal", icon: Users },
  { to: "/tickets",   label: "Tickets",   icon: MessageSquare },
  { to: "/insights",  label: "Insights",  icon: Brain },
  { to: "/chat",      label: "AI Chat",   icon: MessageSquare },
  { to: "/settings",  label: "Settings",  icon: Sliders },
  { to: "/system",    label: "System",    icon: Settings },
];

export default function Sidebar({ collapsed, onToggle, onLogout, badgeCount }) {
  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 z-30 flex flex-col transition-all duration-200 ${
        collapsed ? "w-[60px]" : "w-[200px]"
      }`}
    >
      <div className="flex items-center gap-2.5 px-3 h-14 border-b border-gray-100 dark:border-slate-700 shrink-0">
        <img src="/favicon-192.png" alt="IL" className="w-8 h-8 rounded-lg shrink-0" />
        {!collapsed && (
          <span className="text-sm font-bold text-slate-900 dark:text-white truncate">Influencers Link</span>
        )}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
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
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
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

      <div className="border-t border-gray-100 dark:border-slate-700 p-2 space-y-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 w-full transition-colors"
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 w-full transition-colors"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
