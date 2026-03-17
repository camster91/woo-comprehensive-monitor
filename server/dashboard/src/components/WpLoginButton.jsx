import { useState } from "react";
import { apiPost } from "../api/client";
import { LogIn, Loader, ExternalLink } from "lucide-react";

/**
 * One-click WP Admin login button.
 * Calls the monitor API to generate a one-time login token,
 * then opens the WP admin in a new tab.
 *
 * @param {string} storeId - The store ID
 * @param {string} [label] - Button label (default: "WP Admin")
 * @param {string} [size] - "sm" | "md" (default: "sm")
 * @param {string} [className] - Additional CSS classes
 */
export default function WpLoginButton({ storeId, label = "WP Admin", size = "sm", className = "" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost(`/api/manage/${storeId}/auto-login`);
      if (data.login_url) {
        window.open(data.login_url, "_blank", "noopener,noreferrer");
      } else {
        setError("No login URL returned");
      }
    } catch (err) {
      setError(err.message || "Failed to generate login");
      // Fallback: open wp-admin directly (user will need to log in manually)
      setTimeout(() => setError(null), 3000);
    }
    setLoading(false);
  }

  const sizeClasses = size === "md"
    ? "px-4 py-2 text-sm gap-2"
    : "px-2.5 py-1.5 text-xs gap-1.5";

  return (
    <div className="relative inline-flex">
      <button
        onClick={(e) => { e.stopPropagation(); handleLogin(); }}
        disabled={loading}
        className={`inline-flex items-center font-medium rounded-lg transition-colors disabled:opacity-50
          bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600
          dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400
          ${sizeClasses} ${className}`}
        title={`Login to ${label}`}
      >
        {loading ? (
          <Loader size={size === "md" ? 14 : 12} className="animate-spin" />
        ) : (
          <LogIn size={size === "md" ? 14 : 12} />
        )}
        {label}
        <ExternalLink size={size === "md" ? 12 : 10} className="opacity-50" />
      </button>
      {error && (
        <div className="absolute top-full mt-1 left-0 bg-red-50 text-red-600 text-[10px] px-2 py-1 rounded-lg whitespace-nowrap z-50 shadow-sm border border-red-100">
          {error}
        </div>
      )}
    </div>
  );
}
