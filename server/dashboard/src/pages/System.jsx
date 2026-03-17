import { useEffect, useState } from "react";
import { api, apiPost } from "../api/client";
import { useToast } from "../components/Toast";
import { formatUptime, formatBytes } from "../utils/time";
import {
  Server, Settings, Play, CheckCircle, XCircle, RefreshCw,
  Cpu, Clock, Shield, Mail, Bot, Download, Package,
} from "lucide-react";

export default function System({ onLogout }) {
  const [config, setConfig]   = useState(null);
  const [plugin, setPlugin]   = useState(null);
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(null);
  const toast = useToast();

  useEffect(() => {
    api("/api/system/config").then(setConfig);
    api("/api/plugin/latest").then(setPlugin).catch(() => {});
  }, []);

  const runAction = async (key, label, fn, formatter) => {
    setRunning(key);
    try {
      const res = await fn();
      setResults((prev) => ({ ...prev, [key]: { success: true, data: res, formatted: formatter ? formatter(res) : null } }));
      toast(`${label} complete`);
    } catch (err) {
      setResults((prev) => ({ ...prev, [key]: { success: false, data: err.message } }));
      toast(err.message, "error");
    }
    setRunning(null);
  };

  if (!config) return (
    <div className="space-y-4 animate-pulse">
      <div className="grid md:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-6 h-48 border border-gray-100" />
        ))}
      </div>
    </div>
  );

  const heapPct = Math.round((config.memory.heapUsed / config.memory.heapTotal) * 100);
  const rssMb   = (config.memory.rss / 1024 / 1024).toFixed(1);

  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-2 gap-5">
        {/* Server info */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <Server size={15} className="text-slate-400" /> Server Info
          </h3>
          <div className="space-y-3">
            <InfoRow icon={<Settings size={13} />} label="Version"     value={config.server_version} chip />
            <InfoRow icon={<Server size={13} />}   label="Node.js"     value={config.node_version} />
            <InfoRow icon={<Shield size={13} />}   label="Environment" value={config.environment}
              chipColor={config.environment === "production" ? "green" : "yellow"} chip />
            <InfoRow icon={<Clock size={13} />}    label="Uptime"      value={formatUptime(config.uptime)} />

            {/* Memory bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span className="flex items-center gap-1"><Cpu size={12} /> Heap</span>
                <span>{formatBytes(config.memory.heapUsed)} / {formatBytes(config.memory.heapTotal)} ({heapPct}%)</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${heapPct > 80 ? "bg-red-400" : heapPct > 60 ? "bg-yellow-400" : "bg-indigo-400"}`}
                  style={{ width: `${heapPct}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">RSS: {rssMb} MB total process memory</p>
            </div>
          </div>
        </div>

        {/* Config */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <Settings size={15} className="text-slate-400" /> Configuration
          </h3>
          <div className="space-y-3">
            <InfoRow icon={<Shield size={13} />} label="Auth Required"
              value={config.require_auth ? "Yes" : "No"}
              chipColor={config.require_auth ? "green" : "red"} chip />
            <InfoRow icon={<Mail size={13} />}   label="Mailgun"
              value={config.mailgun_configured ? "Configured" : "Not set"}
              chipColor={config.mailgun_configured ? "green" : "gray"} chip />
            <InfoRow icon={<Bot size={13} />}    label="DeepSeek AI"
              value={config.deepseek_configured ? "Configured" : "Not set"}
              chipColor={config.deepseek_configured ? "green" : "gray"} chip />
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-slate-400 mb-1">Allowed emails</p>
              <div className="flex flex-wrap gap-1">
                {config.allowed_emails.map((e) => (
                  <span key={e} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg">{e}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Plugin Download */}
      {plugin && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <Package size={15} className="text-slate-400" /> WordPress Plugin
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-700 font-medium">
                WooCommerce Comprehensive Monitor <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg ml-1">v{plugin.version}</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {plugin.filename}{plugin.size ? ` · ${(plugin.size / 1024).toFixed(0)} KB` : ""}
                {plugin.published_at ? ` · Released ${new Date(plugin.published_at).toLocaleDateString()}` : ""}
              </p>
            </div>
            <a href={`/api/plugin/download?authToken=${localStorage.getItem("authToken")}`}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors">
              <Download size={14} /> Download ZIP
            </a>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <Play size={15} className="text-slate-400" /> Actions
        </h3>
        <div className="flex flex-wrap gap-2 mb-4">
          <ActionBtn label="Run Health Checks"    running={running === "health"}
            onClick={() => runAction("health", "Health check", () => apiPost("/api/health-check-all", {}), formatHealthResult)} />
          <ActionBtn label="Clear Old Alerts (30d)" running={running === "clear"}
            onClick={() => runAction("clear", "Cleanup", () => apiPost("/api/dashboard/clear-old-alerts", { days: 30 }), (r) => `Cleared ${r.cleared} alerts`)} />
          <ActionBtn label="Test Connections" running={running === "test"}
            onClick={() => runAction("test", "Connection test", () => apiPost("/api/test-connections", {}), formatConnResults)} />
          <ActionBtn label="Export All Data" running={running === "export"}
            onClick={() => runAction("export", "Export", () => api("/api/export/all"), (r) => `Exported ${r.stores?.length || 0} stores, ${r.alerts?.length || 0} alerts`)} />
        </div>

        {/* Action results */}
        {Object.entries(results).map(([key, result]) => (
          <div key={key} className={`mt-2 rounded-xl p-4 text-sm border ${result.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.success
                ? <CheckCircle size={14} className="text-green-600" />
                : <XCircle size={14} className="text-red-600" />}
              <span className={`font-medium text-xs uppercase tracking-wide ${result.success ? "text-green-700" : "text-red-700"}`}>{key}</span>
            </div>
            {result.formatted
              ? <p className="text-slate-700 text-sm">{result.formatted}</p>
              : <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap overflow-auto max-h-48 bg-white/60 rounded-lg p-3">
                  {typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2)}
                </pre>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

function formatHealthResult(res) {
  if (!Array.isArray(res.results)) return JSON.stringify(res);
  const checked = res.results.filter((r) => r.status === "checked").length;
  const errors  = res.results.filter((r) => r.status === "error").length;
  const skipped = res.results.filter((r) => r.status === "skipped").length;
  const issues  = res.results.filter((r) => r.issues > 0).length;
  return `Checked ${checked} store(s). ${issues > 0 ? `${issues} with issues.` : "All healthy."} Skipped: ${skipped}, Errors: ${errors}`;
}

function formatConnResults(res) {
  if (!Array.isArray(res.results)) return JSON.stringify(res);
  const ok   = res.results.filter((r) => r.status === "checked").length;
  const fail = res.results.filter((r) => r.status === "error").length;
  return `${ok} connected, ${fail} failed`;
}

function InfoRow({ icon, label, value, chip, chipColor }) {
  const chipColors = {
    green: "bg-green-100 text-green-700", yellow: "bg-yellow-100 text-yellow-700",
    red: "bg-red-100 text-red-700", gray: "bg-gray-100 text-gray-600", blue: "bg-indigo-100 text-indigo-700",
  };
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="flex items-center gap-2 text-xs text-slate-400">{icon}{label}</span>
      {chip
        ? <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${chipColors[chipColor || "blue"]}`}>{value}</span>
        : <span className="text-sm font-medium text-slate-700">{value}</span>
      }
    </div>
  );
}

function ActionBtn({ label, onClick, running }) {
  return (
    <button onClick={onClick} disabled={!!running}
      className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-100 disabled:opacity-50 transition-colors">
      {running ? <><RefreshCw size={13} className="animate-spin" /> Running…</> : <><Play size={13} />{label}</>}
    </button>
  );
}


