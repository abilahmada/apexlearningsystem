"use client";

import { useEffect, useState } from "react";
import { ApexProvider, useApex } from "@/components/apex/apex-context";
import { ApexLogo } from "@/components/apex/apex-logo";
import { LanguageToggle } from "@/components/apex/language-toggle";

function ResetSentInner() {
  const { t, appName, requestPasswordReset } = useApex();
  const [email, setEmail] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get("email")?.trim() ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const onResend = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError(t("Email wajib diisi.", "Email is required."));
      return;
    }
    setBusy(true);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(
      t(
        "Email reset berhasil dikirim ulang. Silakan cek inbox/spam.",
        "Reset email was resent successfully. Please check inbox/spam.",
      ),
    );
    setCooldown(60);
  };

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
          {t("Email reset terkirim", "Reset email sent")}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          {t(
            "Jika email terdaftar, kamu akan menerima tautan untuk membuat password baru. Cek folder Inbox, Spam, dan Promotions.",
            "If the email is registered, you will receive a link to set a new password. Check Inbox, Spam, and Promotions.",
          )}
        </p>
        <p className="text-xs text-slate-500 leading-relaxed mb-5">
          {t(
            "Jika belum masuk dalam 2-5 menit, ulangi dari tombol Lupa password dan pastikan alamat email benar.",
            "If it does not arrive within 2-5 minutes, try Forgot password again and confirm the email address is correct.",
          )}
        </p>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-4 space-y-3">
          <label className="block text-sm font-semibold text-slate-700">
            {t("Email Tujuan", "Target Email")}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            placeholder={t("nama@email.com", "name@email.com")}
          />
          <button
            type="button"
            onClick={() => void onResend()}
            disabled={busy || cooldown > 0}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 min-h-[44px]"
          >
            {busy
              ? t("Mengirim…", "Sending…")
              : cooldown > 0
                ? t(`Kirim ulang (${cooldown}s)`, `Resend (${cooldown}s)`)
                : t("Kirim ulang email reset", "Resend reset email")}
          </button>
          {notice ? <p className="text-xs text-emerald-600">{notice}</p> : null}
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>

        <button
          type="button"
          onClick={() => window.location.replace("/")}
          className="w-full rounded-xl py-3 text-base font-bold text-white min-h-[48px] shadow-sm shadow-blue-600/20"
          style={{ background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)" }}
        >
          {t("Kembali ke Masuk", "Back to Sign in")}
        </button>
      </div>
    </div>
  );
}

export default function ResetSentPage() {
  return (
    <ApexProvider>
      <ResetSentInner />
    </ApexProvider>
  );
}

