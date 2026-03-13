const STATUS_CONFIG = {
  excellent: { bar: "bg-emerald-500", label: "Excellent", text: "text-emerald-600" },
  good:      { bar: "bg-blue-500",    label: "Good",      text: "text-blue-600" },
  warning:   { bar: "bg-amber-400",   label: "Warning",   text: "text-amber-600" },
  critical:  { bar: "bg-red-500",     label: "Critical",  text: "text-red-600" },
  unknown:   { bar: "bg-slate-300",   label: "Unknown",   text: "text-slate-500" },
};

export default function HealthDistribution({ distribution }) {
  if (!distribution) return null;

  const total = Object.values(distribution).reduce((a, b) => a + b, 0);

  if (total === 0) return (
    <div className="flex items-center justify-center h-24 text-slate-300 text-sm">
      No stores with health data
    </div>
  );

  return (
    <div className="space-y-3">
      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
        const count = distribution[key] || 0;
        if (count === 0) return null;
        const pct = Math.round((count / total) * 100);
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
              <span className="text-xs text-slate-400">{count} store{count !== 1 ? "s" : ""} · {pct}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
