import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Store, AlertTriangle, Shield, MessageSquare, X } from "lucide-react";
import { api } from "../api/client";

const typeIcons = {
  store: Store,
  alert: AlertTriangle,
  dispute: Shield,
  ticket: MessageSquare,
};

const typeLabels = {
  store: "Store",
  alert: "Alert",
  dispute: "Dispute",
  ticket: "Ticket",
};

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      api(`/api/search?q=${encodeURIComponent(query)}`)
        .then(d => { setResults(d.results || []); setOpen(true); })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(result) {
    setOpen(false);
    setQuery("");
    navigate(result.link);
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
        <Search size={14} className="text-slate-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search stores, alerts, disputes..."
          className="bg-transparent text-sm text-slate-700 outline-none w-40 sm:w-56 placeholder:text-slate-400"
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); setOpen(false); }} className="text-slate-400 hover:text-slate-600">
            <X size={12} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-2 left-0 w-80 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50 max-h-96 overflow-y-auto">
          {results.map((r, i) => {
            const Icon = typeIcons[r.result_type] || Search;
            return (
              <button
                key={`${r.result_type}-${r.id}-${i}`}
                onClick={() => handleSelect(r)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-gray-50 last:border-0"
              >
                <Icon size={14} className="text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700 truncate">{r.name}</p>
                  {r.detail && <p className="text-xs text-slate-400 truncate">{r.detail}</p>}
                </div>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                  {typeLabels[r.result_type] || r.result_type}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full mt-2 left-0 w-80 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50">
          <p className="text-sm text-slate-400 text-center">No results for "{query}"</p>
        </div>
      )}
    </div>
  );
}
