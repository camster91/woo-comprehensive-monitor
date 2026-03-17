import { useState } from "react";
import { LayoutDashboard, Mail, KeyRound, Lock, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

const MODE = { SELECT: "select", ADMIN: "admin", ADMIN_CODE: "admin_code", CLIENT: "client", DONE: "done" };

export default function Login({ onAdminLogin, onClientLogin }) {
  const [mode, setMode] = useState(MODE.SELECT);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Admin: request email code
  async function requestCode(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setMode(MODE.ADMIN_CODE);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Admin: verify code
  async function verifyCode(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid or expired code");
      setMode(MODE.DONE);
      setTimeout(() => onAdminLogin(data.token), 400);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Client: password login
  async function clientLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid credentials");
      setMode(MODE.DONE);
      setTimeout(() => onClientLogin(data.token, data.user), 400);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg mb-3">
            <LayoutDashboard size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Influencers Link</h1>
          <p className="text-slate-500 text-sm mt-1">Store Management Platform</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {/* Role selection */}
          {mode === MODE.SELECT && (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-4 text-center">Sign in</h2>
              <div className="space-y-3">
                <button onClick={() => setMode(MODE.ADMIN)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-left group">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-100">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">Admin</p>
                    <p className="text-xs text-slate-400">Sign in with email code</p>
                  </div>
                </button>
                <button onClick={() => setMode(MODE.CLIENT)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-left group">
                  <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center text-violet-500 group-hover:bg-violet-100">
                    <Lock size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">Store Owner</p>
                    <p className="text-xs text-slate-400">Sign in with password</p>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* Admin: enter email */}
          {mode === MODE.ADMIN && (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Admin sign in</h2>
              <p className="text-slate-500 text-sm mb-5">We'll send a 6-digit login code to your email.</p>
              <form onSubmit={requestCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cameron@ashbi.ca" required autoFocus
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400" />
                  </div>
                </div>
                {error && <ErrorBanner msg={error} />}
                <button type="submit" disabled={loading || !email}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                  {loading ? "Sending\u2026" : "Send login code"}
                </button>
                <BackButton onClick={() => { setMode(MODE.SELECT); setError(""); }} />
              </form>
            </>
          )}

          {/* Admin: enter code */}
          {mode === MODE.ADMIN_CODE && (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Check your email</h2>
              <p className="text-slate-500 text-sm mb-5">Code sent to <span className="font-medium text-slate-700">{email}</span></p>
              <form onSubmit={verifyCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">6-digit code</label>
                  <div className="relative">
                    <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" maxLength={6} required autoFocus
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400" />
                  </div>
                </div>
                {error && <ErrorBanner msg={error} />}
                <button type="submit" disabled={loading || code.length !== 6}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                  {loading ? "Verifying\u2026" : "Sign in"}
                </button>
                <BackButton onClick={() => { setMode(MODE.ADMIN); setCode(""); setError(""); }} label="\u2190 Resend code" />
              </form>
            </>
          )}

          {/* Client: email + password */}
          {mode === MODE.CLIENT && (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Store owner sign in</h2>
              <p className="text-slate-500 text-sm mb-5">Use your store portal credentials.</p>
              <form onSubmit={clientLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@yourstore.com" required autoFocus
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" required
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400" />
                  </div>
                </div>
                {error && <ErrorBanner msg={error} />}
                <button type="submit" disabled={loading || !email || !password}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                  {loading ? "Signing in\u2026" : "Sign in"}
                </button>
                <BackButton onClick={() => { setMode(MODE.SELECT); setError(""); setPassword(""); }} />
              </form>
            </>
          )}

          {/* Success */}
          {mode === MODE.DONE && (
            <div className="flex flex-col items-center py-4 gap-3 text-center">
              <CheckCircle2 size={40} className="text-green-500" />
              <p className="font-medium text-slate-800">Signed in!</p>
              <p className="text-slate-500 text-sm">Loading your dashboard\u2026</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BackButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
      {label || "\u2190 Back"}
    </button>
  );
}

function ErrorBanner({ msg }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
      <AlertCircle size={15} className="mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}
