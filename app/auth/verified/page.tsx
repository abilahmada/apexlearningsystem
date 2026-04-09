"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ApexProvider, useApex } from "@/components/apex/apex-context";
import { ApexLogo } from "@/components/apex/apex-logo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LanguageToggle } from "@/components/apex/language-toggle";

function VerifiedInner() {
  const { login, t, appName } = useApex();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        setHasSession(!!data.session);
        if (data.session?.user?.email) {
          setEmail(data.session.user.email);
        }
        setChecking(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const goApp = () => {
    window.location.replace("/");
  };

  const onLogin = async () => {
    setLoading(true);
    setError(null);
    const result = await login(email, password);
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }
    window.location.replace("/");
  };

  const fieldClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-shadow";
  const labelClass = "block text-sm font-semibold text-slate-700 mb-1.5";

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EFF2F6] p-6">
        <p className="text-slate-600">{t("Memuat…", "Loading…")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EFF2F6] flex flex-col items-center justify-center p-4 sm:p-6 relative">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-md shadow-slate-200/50">
        <div className="flex items-center gap-2.5 mb-6 pb-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
            <ApexLogo size={24} showWordmark={false} />
          </div>
          <h1 className="text-lg font-bold text-[#0A1128] truncate">{appName}</h1>
        </div>

        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-emerald-100 p-2.5">
            <CheckCircle2 className="size-9 text-emerald-600" aria-hidden />
          </div>
        </div>

        <h2 className="text-xl font-bold text-center text-slate-900 mb-2 leading-snug">
          {t("Verifikasi email berhasil", "Email verified successfully")}
        </h2>

        {hasSession ? (
          <>
            <p className="text-sm text-slate-600 text-center mb-6 leading-relaxed">
              {t(
                "Akunmu sudah aktif. Lanjut ke aplikasi untuk mulai belajar atau membuka portal orang tua.",
                "Your account is active. Continue to the app to learn or open the parent portal.",
              )}
            </p>
            <button
              type="button"
              onClick={() => goApp()}
              className="w-full rounded-xl py-3 text-base font-bold text-white min-h-[48px] shadow-sm shadow-blue-600/20"
              style={{ background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)" }}
            >
              {t("Lanjut ke APEX", "Continue to APEX")}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 text-center mb-5 leading-relaxed">
              {t(
                "Sesi dari tautan tidak terdeteksi di perangkat ini. Masuk dengan email dan password yang kamu daftarkan.",
                "We could not detect a session from the link on this device. Sign in with the email and password you registered.",
              )}
            </p>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("Password", "Password")}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={fieldClass}
                />
              </div>
              {error ? <p className="text-sm text-red-500">{error}</p> : null}
              <button
                type="button"
                disabled={loading}
                onClick={() => void onLogin()}
                className="w-full rounded-xl py-3 text-base font-bold text-white disabled:opacity-60 min-h-[48px] shadow-sm shadow-blue-600/20"
                style={{ background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)" }}
              >
                {loading ? t("Memproses…", "Processing…") : t("Masuk", "Sign in")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthVerifiedPage() {
  return (
    <ApexProvider>
      <VerifiedInner />
    </ApexProvider>
  );
}
