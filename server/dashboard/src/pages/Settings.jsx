import { useEffect, useState } from "react";
import { api, apiPost, apiPatch, apiDelete } from "../api/client";
import { useToast } from "../components/Toast";
import PageHeader from "../components/PageHeader";
import { SkeletonCard } from "../components/Skeleton";
import {
  Settings as SettingsIcon, FileText, Webhook, Plus, Trash2, Edit3, Save, X,
  Slack, MessageSquare, Globe, ChevronDown, ChevronRight,
} from "lucide-react";

const REASONS = [
  { value: "fraudulent", label: "Fraudulent" },
  { value: "product_not_received", label: "Product Not Received" },
  { value: "duplicate", label: "Duplicate" },
  { value: "subscription_canceled", label: "Subscription Cancelled" },
  { value: "unrecognized", label: "Unrecognized" },
  { value: "credit_not_processed", label: "Credit Not Processed" },
  { value: "general", label: "General" },
  { value: "product_unacceptable", label: "Product Unacceptable" },
];

const EVENT_OPTIONS = [
  "alert", "dispute", "uptime", "ticket", "revenue", "inventory",
];

export default function Settings() {
  const [tab, setTab] = useState("templates");
  const toast = useToast();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Manage templates, webhooks, and preferences" />

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {[
          { value: "templates", label: "Dispute Templates", icon: FileText },
          { value: "webhooks", label: "Webhooks", icon: Webhook },
        ].map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.value ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "templates" && <TemplatesSection toast={toast} />}
      {tab === "webhooks" && <WebhooksSection toast={toast} />}
    </div>
  );
}

function TemplatesSection({ toast }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", reason: "general", evidenceText: "" });
  const [showNew, setShowNew] = useState(false);

  const fetch_ = () => {
    setLoading(true);
    api("/api/templates").then(d => setTemplates(d.templates || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch_(); }, []);

  const handleSave = async () => {
    if (!form.name || !form.evidenceText) { toast?.("Name and evidence text required"); return; }
    if (editing) {
      await apiPatch(`/api/templates/${editing}`, form);
      toast?.("Template updated");
    } else {
      await apiPost("/api/templates", form);
      toast?.("Template created");
    }
    setEditing(null);
    setShowNew(false);
    setForm({ name: "", reason: "general", evidenceText: "" });
    fetch_();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this template?")) return;
    await apiDelete(`/api/templates/${id}`);
    toast?.("Template deleted");
    fetch_();
  };

  const startEdit = (t) => {
    setEditing(t.id);
    setForm({ name: t.name, reason: t.reason, evidenceText: t.evidence_text });
    setShowNew(true);
  };

  if (loading) return <SkeletonCard className="h-64" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{templates.length} templates</p>
        <button onClick={() => { setShowNew(!showNew); setEditing(null); setForm({ name: "", reason: "general", evidenceText: "" }); }}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors">
          {showNew ? <><X size={13} /> Cancel</> : <><Plus size={13} /> New Template</>}
        </button>
      </div>

      {showNew && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Template Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="e.g. Fraudulent - Digital Product" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Dispute Reason</label>
              <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
                {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Evidence Text</label>
            <textarea value={form.evidenceText} onChange={e => setForm(f => ({ ...f, evidenceText: e.target.value }))}
              rows={8} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 resize-none font-mono"
              placeholder="Pre-written evidence response..." />
          </div>
          <button onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors">
            <Save size={13} /> {editing ? "Update" : "Create"} Template
          </button>
        </div>
      )}

      {templates.map(t => (
        <div key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-slate-700">{t.name}</h3>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t.reason}</span>
                {t.is_default ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">Default</span> : null}
              </div>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{t.evidence_text}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600">
                <Edit3 size={14} />
              </button>
              {!t.is_default && (
                <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WebhooksSection({ toast }) {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", platform: "slack", events: [] });

  const fetch_ = () => {
    setLoading(true);
    api("/api/webhooks").then(d => setWebhooks(d.webhooks || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch_(); }, []);

  const handleCreate = async () => {
    if (!form.name || !form.url) { toast?.("Name and URL required"); return; }
    await apiPost("/api/webhooks", form);
    toast?.("Webhook created");
    setShowNew(false);
    setForm({ name: "", url: "", platform: "slack", events: [] });
    fetch_();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this webhook?")) return;
    await apiDelete(`/api/webhooks/${id}`);
    toast?.("Webhook deleted");
    fetch_();
  };

  const toggleEvent = (event) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  };

  const platformIcons = { slack: Slack, discord: MessageSquare, custom: Globe };

  if (loading) return <SkeletonCard className="h-64" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{webhooks.length} webhook{webhooks.length !== 1 ? "s" : ""}</p>
        <button onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors">
          {showNew ? <><X size={13} /> Cancel</> : <><Plus size={13} /> New Webhook</>}
        </button>
      </div>

      {showNew && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="e.g. Alerts to Slack" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Platform</label>
              <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Webhook URL</label>
            <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="https://hooks.slack.com/services/..." />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Event Types (empty = all)</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_OPTIONS.map(e => (
                <button key={e} onClick={() => toggleEvent(e)}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                    form.events.includes(e) ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors">
            <Save size={13} /> Create Webhook
          </button>
        </div>
      )}

      {webhooks.map(w => {
        const PlatformIcon = platformIcons[w.platform] || Globe;
        return (
          <div key={w.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <PlatformIcon size={16} className="text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-slate-700">{w.name}</h3>
                  <p className="text-xs text-slate-400 truncate">{w.url}</p>
                  <div className="flex gap-1 mt-1">
                    {(w.events || []).map(e => (
                      <span key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{e}</span>
                    ))}
                    {(!w.events || w.events.length === 0) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">All events</span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => handleDelete(w.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}

      {webhooks.length === 0 && !showNew && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Webhook size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-400">No webhooks configured</p>
          <p className="text-xs text-slate-300 mt-1">Add a Slack or Discord webhook to get notified of events</p>
        </div>
      )}
    </div>
  );
}
