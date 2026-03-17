import { Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";

export default function PortalLayout({ user, onLogout }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-100 h-14 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm">W</div>
          <span className="text-sm font-bold text-slate-900">Client Portal</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400">{user?.email}</span>
          <button onClick={onLogout} className="text-slate-400 hover:text-red-500 transition-colors"><LogOut size={16} /></button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
