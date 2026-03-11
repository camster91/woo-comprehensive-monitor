const statusConfig = {
  excellent: { color: "bg-green-500", label: "Excellent" },
  good: { color: "bg-blue-500", label: "Good" },
  warning: { color: "bg-yellow-500", label: "Warning" },
  critical: { color: "bg-red-500", label: "Critical" },
  unknown: { color: "bg-gray-400", label: "Unknown" },
};

export default function HealthDistribution({ distribution }) {
  if (!distribution) return null;

  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="text-gray-400 text-sm">No stores</p>;

  return (
    <div className="space-y-2">
      {Object.entries(statusConfig).map(([key, config]) => {
        const count = distribution[key] || 0;
        if (count === 0) return null;
        const pct = Math.round((count / total) * 100);
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-20">{config.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
              <div className={`${config.color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-medium w-12 text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
