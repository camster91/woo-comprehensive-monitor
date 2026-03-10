import { useEffect, useState, useRef } from "react";
import { api, apiPost } from "../api/client";

export default function Chat() {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [storeData, setStoreData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEnd = useRef(null);

  useEffect(() => {
    api("/api/stores").then(d => setStores(d.stores || []));
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadStoreData = async () => {
    if (!selectedStore) return;
    const [storeDetail, alerts] = await Promise.all([
      api(`/api/stores/${selectedStore}`),
      api(`/api/dashboard/alerts?storeId=${selectedStore}&limit=10`),
    ]);
    setStoreData({ store: storeDetail, recentAlerts: alerts.alerts });
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await apiPost("/api/chat/deepseek", { question, storeData, chatHistory });
      setMessages(prev => [...prev, { role: "assistant", content: res.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
      <div className="p-4 border-b flex gap-2 items-center flex-wrap">
        <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white">
          <option value="">Select a store...</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={loadStoreData} disabled={!selectedStore}
          className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm disabled:opacity-50">
          Load Store Data
        </button>
        {storeData && <span className="text-xs text-green-600">Store data loaded</span>}
        <button onClick={() => { setMessages([]); setStoreData(null); }}
          className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm ml-auto">
          Clear Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-8">
            <p className="text-lg">AI Store Assistant</p>
            <p className="text-sm mt-1">Ask about your WooCommerce stores, diagnose issues, or get recommendations.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-400">Thinking...</div>
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      <div className="p-4 border-t">
        <div className="flex gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Ask about your stores..." rows={1}
            className="flex-1 px-3 py-2 border rounded-lg text-sm resize-none" />
          <button onClick={send} disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
