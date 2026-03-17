import { TrendingUp, TrendingDown } from "lucide-react";

export default function StatCard({ label, value, icon, sub, change, variant = "default", pulse }) {
  if (variant === "hero") {
    return (
      <div className="bg-gradient-to-br from-indigo-500 to-violet-500 rounded-xl p-5 text-white relative overflow-hidden">
        {pulse && (
          <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
        )}
        {icon && <div className="inline-flex p-2 rounded-lg bg-white/20 mb-3">{icon}</div>}
        <p className="text-3xl font-bold">{value ?? "\u2014"}</p>
        <p className="text-sm text-white/70 mt-1">{label}{sub ? ` \u00b7 ${sub}` : ""}</p>
        {change != null && (
          <div className={`flex items-center gap-1 mt-2 text-xs ${change >= 0 ? "text-emerald-200" : "text-red-200"}`}>
            {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{change >= 0 ? "+" : ""}{change}%</span>
            <span className="text-white/50">vs prev</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
      {pulse && (
        <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
      )}
      {icon && <div className="inline-flex p-2 rounded-lg bg-slate-50 text-slate-500 mb-3">{icon}</div>}
      <p className="text-3xl font-bold text-slate-900">{value ?? "\u2014"}</p>
      <p className="text-xs text-slate-400 mt-1">{label}{sub ? ` \u00b7 ${sub}` : ""}</p>
      {change != null && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
          {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{change >= 0 ? "+" : ""}{change}%</span>
          <span className="text-slate-400">vs prev</span>
        </div>
      )}
    </div>
  );
}
