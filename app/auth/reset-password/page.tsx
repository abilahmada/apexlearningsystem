"use client";

import { useEffect, useState } from "react";
import { ApexProvider, useApex } from "@/components/apex/apex-context";
import { ApexLogo } from "@/components/apex/apex-logo";
import { LanguageToggle } from "@/components/apex/language-toggle";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function ResetPasswordInner() {
  const { t, appName } = useApex();
  const [loadingSession, setLoadingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const href = window.location.href;
        const url = new URL(href);
        if (url.searchParams.get("code")) {
          await supabase.auth.exchangeCodeForSession(href);
        }
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setHasRecoverySession(!!data.session);
      } finally {
        if (active) setLoadingSession(false);
      }
    };
    void init();
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (password.length < 6) {
      setError(t("Password minimal 6 karakter.", "Password must be at least 6 characters."));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("Konfirmasi password tidak sama.", "Password confirmation does not match."));
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSuccess(
        t(
          "Password berhasil diperbarui. Silakan masuk dengan password baru.",
          "Password updated successfully. Please sign in with your new password.",
        ),
      );
      await supabase.auth.signOut();
      setTimeout(() => {
        window.location.replace("/");
      }, 1200);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-shadow";
  const labelClass = "block text-sm font-semibold text-slate-700 mb-1.5";

  return (
    <div className="min-h-screen bg-[#EFF2F6] flex items-center justify-center p-4 sm:p-6 relative">
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

        <h2 className="text-xl font-bold text-slate-900 mb-2 leading-snug">
          {t("Atur Password Baru", "Set New Password")}
        </h2>
        <p className="text-sm text-slate-600 mb-5 leading-relaxed">
          {t(
            "Masukkan password baru untuk akunmu.",
            "Enter a new password for your account.",
          )}
        </p>

        {loadingSession ? (
          <p className="text-sm text-slate-500">{t("Memuat…", "Loading…")}</p>
        ) : !hasRecoverySession ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {t(
              "Link reset tidak valid atau sudah kedaluwarsa. Silakan ulangi dari tombol Lupa Password.",
              "The reset link is invalid or expired. Please request a new one from Forgot Password.",
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>{t("Password Baru", "New Password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className={labelClass}>{t("Ulangi Password", "Confirm Password")}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={fieldClass}
                autoComplete="new-password"
              />
            </div>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={submitting}
              className="w-full rounded-xl py-3 text-base font-bold text-white disabled:opacity-60 min-h-[48px] shadow-sm shadow-blue-600/20"
              style={{ background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)" }}
            >
              {submitting
                ? t("Memproses…", "Processing…")
                : t("Simpan Password Baru", "Save New Password")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <ApexProvider>
      <ResetPasswordInner />
    </ApexProvider>
  );
}

