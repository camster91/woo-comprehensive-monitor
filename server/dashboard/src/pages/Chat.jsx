import { useEffect, useState, useRef } from "react";
import { api, apiPost } from "../api/client";
import { renderMarkdown } from "../utils/markdown";
import { timeAgo } from "../utils/time";
import { Send, RefreshCw, Store, Sparkles, Bot, User } from "lucide-react";

const SUGGESTIONS = [
  "What are the most recent critical alerts and what caused them?",
  "Summarize the health status of all stores.",
  "Are there any dispute patterns I should be worried about?",
  "Which store has the most errors this week?",
  "What should I do about the latest checkout error?",
];

export default function Chat() {
  const [stores, setStores]         = useState([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [storeData, setStoreData]   = useState(null);
  const [loadingStore, setLoadingStore] = useState(false);
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const messagesEnd = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { api("/api/stores").then((d) => setStores(d.stores || [])); }, []);

  // Auto-scroll to bottom
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Auto-load store data when selection changes
  useEffect(() => {
    if (!selectedStore) { setStoreData(null); return; }
    setLoadingStore(true);
    Promise.all([
      api(`/api/stores/${selectedStore}`),
      api(`/api/dashboard/alerts?storeId=${selectedStore}&limit=20`),
    ]).then(([storeDetail, alertData]) => {
      setStoreData({ store: storeDetail, recentAlerts: alertData.alerts });
      setLoadingStore(false);
    }).catch(() => setLoadingStore(false));
  }, [selectedStore]);

  const send = async (text) => {
    const question = (text || input).trim();
    if (!question || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);
    try {
      const chatHistory = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await apiPost("/api/chat/deepseek", { question, storeData, chatHistory });
      setMessages((prev) => [...prev, { role: "assistant", content: res.response }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message}`, error: true }]);
    }
    setLoading(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearChat = () => { setMessages([]); setStoreData(null); setSelectedStore(""); };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col" style={{ height: "calc(100vh - 180px)", minHeight: "300px" }}>
      {/* ── Toolbar ── */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <Bot size={16} className="text-indigo-500 shrink-0" />
        <span className="text-sm font-semibold text-slate-700">AI Store Assistant</span>

        {/* Store selector */}
        <div className="flex items-center gap-2 ml-2">
          <Store size={13} className="text-slate-400" />
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
          >
            <option value="">All stores (no context)</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {loadingStore && <RefreshCw size={13} className="text-slate-400 animate-spin" />}
          {storeData && !loadingStore && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              ✓ Context loaded
              {storeData.recentAlerts?.length > 0 && (
                <span className="bg-orange-100 text-orange-600 px-1.5 rounded text-[10px]">
                  {storeData.recentAlerts.length} alerts
                </span>
              )}
            </span>
          )}
        </div>

        <button onClick={clearChat} className="ml-auto text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-2 py-1.5 rounded-lg transition-colors">
          Clear
        </button>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 ? (
          <EmptyState suggestions={SUGGESTIONS} onSuggest={send} storeData={storeData} />
        ) : (
          messages.map((m, i) => <MessageBubble key={i} msg={m} />)
        )}
        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <Bot size={14} className="text-indigo-600" />
            </div>
            <div className="bg-slate-100 rounded-xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <span className="text-xs text-slate-400">Thinking</span>
              <span className="flex gap-1">
                {[0,1,2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      {/* ── Input ── */}
      <div className="px-5 py-4 border-t border-gray-100">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your stores, diagnose issues, get recommendations… (Enter to send)"
            rows={1}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 leading-relaxed"
            style={{ minHeight: "44px", maxHeight: "120px" }}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="text-[10px] text-slate-300 mt-1.5 text-center">
          Shift+Enter for new line · responses powered by DeepSeek
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isUser ? "bg-indigo-600" : "bg-indigo-100"}`}>
        {isUser ? <User size={13} className="text-white" /> : <Bot size={13} className="text-indigo-600" />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[82%] rounded-xl px-4 py-3 text-sm leading-relaxed
        ${isUser
          ? "bg-indigo-600 text-white rounded-tr-sm"
          : msg.error
            ? "bg-red-50 text-red-700 border border-red-200 rounded-tl-sm"
            : "bg-slate-100 text-slate-800 rounded-tl-sm"}`}
      >
        {isUser
          ? <p className="whitespace-pre-wrap">{msg.content}</p>
          : <div
              className="prose-sm prose-code:text-indigo-700"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
        }
      </div>
    </div>
  );
}

function EmptyState({ suggestions, onSuggest, storeData }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
      <div className="w-14 h-14 rounded-xl bg-indigo-50 flex items-center justify-center mb-4">
        <Sparkles size={24} className="text-indigo-500" />
      </div>
      <h3 className="font-semibold text-slate-700 mb-1">AI Store Assistant</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-xs">
        {storeData
          ? `Store context loaded. Ask anything about ${storeData.store?.name || "this store"}.`
          : "Ask questions about your WooCommerce stores. Select a store above for detailed context."}
      </p>

      <div className="grid gap-2 w-full max-w-sm">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggest(s)}
            className="text-left text-xs px-4 py-3 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-gray-100 hover:border-indigo-200 rounded-xl transition-colors text-slate-600"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
