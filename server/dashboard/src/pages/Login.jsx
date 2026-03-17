import { useState } from "react";
import { Mail, KeyRound, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

const STEP = { EMAIL: "email", CODE: "code", DONE: "done" };

export default function Login({ onAdminLogin, onClientLogin }) {
  const [step, setStep] = useState(STEP.EMAIL);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestCode(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Try admin first, then portal
    try {
      const adminRes = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (adminRes.ok) {
        setStep(STEP.CODE);
        setLoading(false);
        return;
      }

      // Not an admin — try portal
      const portalRes = await fetch("/api/portal/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (portalRes.ok) {
        setStep(STEP.CODE);
        setLoading(false);
        return;
      }

      const data = await portalRes.json();
      throw new Error(data.error || "No account found for this email");
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
      // Try admin verify first
      const adminRes = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      if (adminRes.ok) {
        const data = await adminRes.json();
        setStep(STEP.DONE);
        setTimeout(() => onAdminLogin(data.token), 400);
        return;
      }

      // Try portal verify
      const portalRes = await fetch("/api/portal/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      if (portalRes.ok) {
        const data = await portalRes.json();
        setStep(STEP.DONE);
        setTimeout(() => onClientLogin(data.token, data.user), 400);
        return;
      }

      const data = await portalRes.json();
      throw new Error(data.error || "Invalid or expired code");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F6F0] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="https://influencerslink.com/wp-content/uploads/2025/09/IL-logo-bw-3.png"
            alt="Influencers Link"
            className="h-12 mb-4"
          />
          <p className="text-[#63694D] text-sm">Store Management Platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#C9D3C9] p-6">
          {step === STEP.EMAIL && (
            <>
              <h2 className="text-base font-semibold text-[#32373c] mb-1">Sign in</h2>
              <p className="text-[#8D9671] text-sm mb-5">
                Enter your email and we'll send you a login code.
              </p>
              <form onSubmit={requestCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#63694D] mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D9671]" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoFocus
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[#C9D3C9] text-sm
                                 focus:outline-none focus:ring-2 focus:ring-[#8D9671] focus:border-transparent
                                 placeholder:text-[#C9D3C9]"
                    />
                  </div>
                </div>
                {error && <ErrorBanner msg={error} />}
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#63694D] hover:bg-[#4a4f39] disabled:bg-[#C9D3C9]
                             text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                  {loading ? "Sending\u2026" : "Send login code"}
                </button>
              </form>
            </>
          )}

          {step === STEP.CODE && (
            <>
              <h2 className="text-base font-semibold text-[#32373c] mb-1">Check your email</h2>
              <p className="text-[#8D9671] text-sm mb-5">
                We sent a 6-digit code to <span className="font-medium text-[#63694D]">{email}</span>
              </p>
              <form onSubmit={verifyCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#63694D] mb-1.5">
                    6-digit code
                  </label>
                  <div className="relative">
                    <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D9671]" />
                    <input
                      type="text"
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456"
                      maxLength={6}
                      required
                      autoFocus
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[#C9D3C9] text-sm tracking-widest
                                 focus:outline-none focus:ring-2 focus:ring-[#8D9671] focus:border-transparent
                                 placeholder:text-[#C9D3C9]"
                    />
                  </div>
                </div>
                {error && <ErrorBanner msg={error} />}
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#63694D] hover:bg-[#4a4f39] disabled:bg-[#C9D3C9]
                             text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                  {loading ? "Verifying\u2026" : "Sign in"}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep(STEP.EMAIL); setCode(""); setError(""); }}
                  className="w-full py-2 text-sm text-[#8D9671] hover:text-[#63694D] transition-colors"
                >
                  {"\u2190"} Use a different email
                </button>
              </form>
            </>
          )}

          {step === STEP.DONE && (
            <div className="flex flex-col items-center py-4 gap-3 text-center">
              <CheckCircle2 size={40} className="text-[#8D9671]" />
              <p className="font-medium text-[#32373c]">Signed in!</p>
              <p className="text-[#8D9671] text-sm">Loading your dashboard{"\u2026"}</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-[#C9D3C9] mt-6">
          Influencers Link {"\u00b7"} Store Management
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
