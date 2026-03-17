import { useEffect, useState } from "react";
import { api } from "../api/client";
import StatCard from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import DataTable from "../components/DataTable";
import { SkeletonCard } from "../components/Skeleton";
import { Globe, Wifi, WifiOff, Shield, Clock, AlertTriangle } from "lucide-react";

export default function Uptime() {
  const [data, setData] = useState(null);
  const [ssl, setSsl] = useState(null);
  const [versions, setVersions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api("/api/uptime"),
      api("/api/uptime/ssl"),
      api("/api/uptime/versions"),
    ]).then(([u, s, v]) => {
      setData(u);
      setSsl(s.stores || []);
      setVersions(v.versions || []);
    }).catch(() => {}).finally(() => setLoading(false));

    const t = setInterval(() => {
      api("/api/uptime").then(setData).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, []);

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Uptime & Performance" subtitle="Site availability and SSL monitoring" />

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Sites Up" value={data.up} icon={<Wifi size={18} />} variant="hero" />
          <StatCard label="Sites Down" value={data.down} icon={<WifiOff size={18} />}
            pulse={data.down > 0} sub={data.down > 0 ? "check now" : "all clear"} />
          <StatCard label="Avg Response" value={`${data.avgResponse}ms`} icon={<Clock size={18} />}
            sub={data.avgResponse > 3000 ? "slow" : "healthy"} />
          <StatCard label="SSL Warnings" value={data.sslWarnings} icon={<Shield size={18} />}
            sub={data.sslWarnings > 0 ? "expiring soon" : "all valid"} />
        </div>
      )}

      {/* Store Status Grid */}
      {data?.stores && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Globe size={15} className="text-indigo-500" /> Store Status
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.stores.map(s => {
              const isUp = s.status_code && s.status_code >= 200 && s.status_code < 400;
              const isDown = s.status_code === 0 || (s.status_code && s.status_code >= 500);
              return (
                <div key={s.store_id} className={`border rounded-xl p-4 flex items-start gap-3 transition-colors ${
                  isDown ? "border-red-200 bg-red-50/50" : isUp ? "border-gray-100 bg-white" : "border-yellow-200 bg-yellow-50/50"
                }`}>
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                    isDown ? "bg-red-500" : isUp ? "bg-emerald-400" : "bg-yellow-400"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{s.store_name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-slate-400">{s.response_time_ms ? `${s.response_time_ms}ms` : "—"}</span>
                      {s.uptime_24h != null && (
                        <span className={`text-xs font-medium ${s.uptime_24h >= 99 ? "text-emerald-600" : s.uptime_24h >= 95 ? "text-yellow-600" : "text-red-600"}`}>
                          {s.uptime_24h}% uptime
                        </span>
                      )}
                      {s.status_code ? (
                        <span className="text-xs text-slate-400">{s.status_code}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SSL Expiry Table */}
      {ssl && ssl.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Shield size={15} className="text-indigo-500" /> SSL Certificates
          </h2>
          <DataTable
            columns={[
              { key: "store_name", label: "Store", sortable: true },
              { key: "ssl_expiry_date", label: "Expires", sortable: true },
              { key: "ssl_days_remaining", label: "Days Left", sortable: true, render: (v) => {
                if (v == null) return "—";
                const color = v < 14 ? "text-red-600 bg-red-50" : v < 30 ? "text-yellow-600 bg-yellow-50" : "text-emerald-600 bg-emerald-50";
                return <span className={`text-xs font-medium px-2 py-0.5 rounded ${color}`}>{v}d</span>;
              }},
            ]}
            data={ssl}
          />
        </div>
      )}

      {/* Version Table */}
      {versions && versions.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <AlertTriangle size={15} className="text-indigo-500" /> Software Versions
          </h2>
          <DataTable
            columns={[
              { key: "store_name", label: "Store", sortable: true },
              { key: "wp_version", label: "WordPress", sortable: true },
              { key: "wc_version", label: "WooCommerce", sortable: true },
              { key: "plugin_version", label: "WCM Plugin", sortable: true },
            ]}
            data={versions}
          />
        </div>
      )}
    </div>
  );
}
