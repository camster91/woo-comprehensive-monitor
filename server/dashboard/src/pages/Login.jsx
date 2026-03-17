import { useState } from "react";
import { LayoutDashboard, Mail, KeyRound, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

const STEP = { EMAIL: "email", CODE: "code", DONE: "done" };

export default function Login({ onLogin }) {
  const [step, setStep]   = useState(STEP.EMAIL);
  const [email, setEmail] = useState("");
  const [code, setCode]   = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      setStep(STEP.CODE);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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
      localStorage.setItem("authToken", data.token);
      setStep(STEP.DONE);
      setTimeout(() => onLogin(data.token), 400);
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
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg mb-3">
            <LayoutDashboard size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">WooCommerce Monitor</h1>
          <p className="text-slate-500 text-sm mt-1">Multi-store monitoring</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {step === STEP.EMAIL && (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Sign in</h2>
              <p className="text-slate-500 text-sm mb-5">
                Enter your email and we'll send a 6-digit login code.
              </p>
              <form onSubmit={requestCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                                 placeholder:text-slate-400"
                    />
                  </div>
                </div>
                {error && <ErrorBanner msg={error} />}
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300
                             text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                  {loading ? "Sending…" : "Send login code"}
                </button>
              </form>
            </>
          )}

          {step === STEP.CODE && (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Check your email</h2>
              <p className="text-slate-500 text-sm mb-5">
                We sent a 6-digit code to <span className="font-medium text-slate-700">{email}</span>.
                It expires in 10 minutes.
              </p>
              <form onSubmit={verifyCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    6-digit code
                  </label>
                  <div className="relative">
                    <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456"
                      maxLength={6}
                      required
                      autoFocus
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm tracking-widest
                                 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                                 placeholder:text-slate-400"
                    />
                  </div>
                </div>
                {error && <ErrorBanner msg={error} />}
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300
                             text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                  {loading ? "Verifying…" : "Sign in"}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep(STEP.EMAIL); setCode(""); setError(""); }}
                  className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                >
                  ← Use a different email
                </button>
              </form>
            </>
          )}

          {step === STEP.DONE && (
            <div className="flex flex-col items-center py-4 gap-3 text-center">
              <CheckCircle2 size={40} className="text-green-500" />
              <p className="font-medium text-slate-800">Signed in!</p>
              <p className="text-slate-500 text-sm">Redirecting to dashboard…</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          WooCommerce Monitor · v3.1.0
        </p>
      </div>
    </div>
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
