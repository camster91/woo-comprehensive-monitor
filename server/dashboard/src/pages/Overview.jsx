import { useEffect, useState } from "react";
import { api } from "../api/client";
import AlertTrendsChart from "../components/AlertTrendsChart";
import HealthDistribution from "../components/HealthDistribution";

export default function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/api/dashboard").then(setData).catch(e => setError(e.message));
    const interval = setInterval(() => {
      api("/api/dashboard").then(setData).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!data) return <div className="text-gray-500">Loading...</div>;

  const o = data.overview;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Stores" value={o.totalSites} />
        <StatCard label="Total Alerts" value={o.totalAlerts} />
        <StatCard label="Critical" value={o.criticalAlerts} color={o.criticalAlerts > 0 ? "red" : "green"} />
        <StatCard label="High" value={o.highAlerts} color={o.highAlerts > 0 ? "orange" : "green"} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Alert Trends (7 days)</h2>
          <AlertTrendsChart trends={o.alertTrends} />
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Store Health</h2>
          <HealthDistribution distribution={o.healthDistribution} />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Stores</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {data.stores.map(s => (
            <div key={s.id} className="border rounded-lg p-4 hover:border-blue-400 transition-colors">
              <h3 className="font-medium">{s.name}</h3>
              <p className="text-sm text-gray-500 truncate">{s.url}</p>
              <div className="mt-2 flex gap-2 flex-wrap">
                <HealthBadge status={s.health_status} />
                {s.hasApiCredentials && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">API</span>}
                <span className="text-xs text-gray-400">v{s.plugin_version}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.recentAlerts.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Recent Alerts</h2>
          <div className="space-y-2">
            {data.recentAlerts.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                <SeverityDot severity={a.severity} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{a.subject}</p>
                  <p className="text-xs text-gray-500">{new Date(a.timestamp).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color = "blue" }) {
  const colors = {
    blue: "text-blue-600", red: "text-red-600", green: "text-green-600", orange: "text-orange-600",
  };
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

function HealthBadge({ status }) {
  const styles = {
    excellent: "bg-green-100 text-green-700",
    good: "bg-blue-100 text-blue-700",
    warning: "bg-yellow-100 text-yellow-700",
    critical: "bg-red-100 text-red-700",
    unknown: "bg-gray-100 text-gray-700",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] || styles.unknown}`}>{status}</span>;
}

function SeverityDot({ severity }) {
  const colors = {
    critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500",
    success: "bg-green-500", warning: "bg-yellow-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full mt-1.5 ${colors[severity] || "bg-gray-400"}`} />;
}
