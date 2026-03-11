import { useEffect, useState } from "react";
import { api, apiPost } from "../api/client";

export default function System() {
  const [config, setConfig] = useState(null);
  const [actionResult, setActionResult] = useState(null);
  const [running, setRunning] = useState(null);

  useEffect(() => {
    api("/api/system/config").then(setConfig);
  }, []);

  const runAction = async (name, fn) => {
    setRunning(name);
    setActionResult(null);
    try {
      const res = await fn();
      setActionResult({ success: true, message: JSON.stringify(res, null, 2) });
    } catch (err) {
      setActionResult({ success: false, message: err.message });
    }
    setRunning(null);
  };

  if (!config) return <div className="text-gray-500">Loading...</div>;

  const formatUptime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatBytes = (bytes) => {
    const mb = (bytes / 1024 / 1024).toFixed(1);
    return `${mb} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold mb-3">Server Info</h3>
          <div className="space-y-2 text-sm">
            <Row label="Version" value={config.server_version} />
            <Row label="Node.js" value={config.node_version} />
            <Row label="Environment" value={config.environment} />
            <Row label="Uptime" value={formatUptime(config.uptime)} />
            <Row label="Memory (RSS)" value={formatBytes(config.memory.rss)} />
            <Row label="Heap Used" value={formatBytes(config.memory.heapUsed)} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold mb-3">Configuration</h3>
          <div className="space-y-2 text-sm">
            <Row label="Auth Required" value={config.require_auth ? "Yes" : "No"} />
            <Row label="Allowed Emails" value={config.allowed_emails.join(", ")} />
            <Row label="Mailgun" value={config.mailgun_configured ? "Configured" : "Not configured"} />
            <Row label="DeepSeek AI" value={config.deepseek_configured ? "Configured" : "Not configured"} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold mb-3">Actions</h3>
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Run Health Checks" running={running === "health"}
            onClick={() => runAction("health", () => apiPost("/api/health-check-all", {}))} />
          <ActionButton label="Clear Old Alerts (30d)" running={running === "clear"}
            onClick={() => runAction("clear", () => apiPost("/api/dashboard/clear-old-alerts", { days: 30 }))} />
          <ActionButton label="Test All Connections" running={running === "test"}
            onClick={() => runAction("test", () => apiPost("/api/test-connections", {}))} />
          <ActionButton label="Export Data" running={running === "export"}
            onClick={() => runAction("export", () => api("/api/export/all"))} />
        </div>

        {actionResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${actionResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            <pre className="whitespace-pre-wrap overflow-auto max-h-60 text-xs">{actionResult.message}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-1 border-b border-gray-100">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ActionButton({ label, onClick, running }) {
  return (
    <button onClick={onClick} disabled={running}
      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50">
      {running ? "Running..." : label}
    </button>
  );
}
