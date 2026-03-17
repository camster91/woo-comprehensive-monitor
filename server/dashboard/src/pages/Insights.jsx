import { useEffect, useState } from "react";
import { api } from "../api/client";
import PageHeader from "../components/PageHeader";
import { SkeletonCard } from "../components/Skeleton";
import {
  Brain, Shield, DollarSign, Wifi, Package, AlertTriangle,
  TrendingUp, Lightbulb, RefreshCw,
} from "lucide-react";

const typeIcons = {
  dispute: Shield,
  revenue: DollarSign,
  uptime: Wifi,
  inventory: Package,
};

const severityColors = {
  info: "border-blue-200 bg-blue-50/50",
  warning: "border-amber-200 bg-amber-50/50",
  error: "border-red-200 bg-red-50/50",
  success: "border-emerald-200 bg-emerald-50/50",
};

const severityIcons = {
  info: "text-blue-500",
  warning: "text-amber-500",
  error: "text-red-500",
  success: "text-emerald-500",
};

export default function Insights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInsights = () => {
    setLoading(true);
    api("/api/insights")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchInsights(); }, []);

  if (loading) return (
    <div className="space-y-6">
      {[...Array(4)].map((_, i) => <SkeletonCard key={i} className="h-32" />)}
    </div>
  );

  const insights = data?.insights || [];

  return (
    <div className="space-y-6">
      <PageHeader title="AI Insights" subtitle="Automated analysis of your stores' performance">
        <button onClick={fetchInsights}
          className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
          <RefreshCw size={13} /> Refresh
        </button>
      </PageHeader>

      {insights.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Brain size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-400">Not enough data to generate insights yet.</p>
          <p className="text-xs text-slate-300 mt-1">Insights will appear as more data is collected.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight, i) => {
            const Icon = typeIcons[insight.type] || AlertTriangle;
            const colorClass = severityColors[insight.severity] || severityColors.info;
            const iconColor = severityIcons[insight.severity] || "text-slate-500";

            return (
              <div key={i} className={`rounded-xl p-5 border ${colorClass}`}>
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 mt-0.5 ${iconColor}`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800">{insight.title}</h3>
                    <p className="text-sm text-slate-600 mt-1">{insight.detail}</p>
                    {insight.suggestion && (
                      <div className="flex items-start gap-2 mt-3 bg-white/60 rounded-lg p-3">
                        <Lightbulb size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-600">{insight.suggestion}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data?.generated && (
        <p className="text-xs text-slate-300 text-center">
          Last analyzed: {new Date(data.generated).toLocaleString()}
        </p>
      )}
    </div>
  );
}
