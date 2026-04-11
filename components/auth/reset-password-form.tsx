"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Halaman setelah user membuka tautan reset dari email Supabase.
 * Mendukung PKCE (?code=) dan deteksi sesi di URL (detectSessionInUrl pada browser client).
 */
export function ResetPasswordForm() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      setInitError(null);
      try {
        const supabase = createSupabaseBrowserClient();

        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          const code = url.searchParams.get("code");
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
            if (error) {
              if (!cancelled) setInitError(error.message);
              return;
            }
            window.history.replaceState({}, document.title, url.pathname);
          }
        }

        const readSession = () => supabase.auth.getSession();
        let {
          data: { session },
          error: sessionErr,
        } = await readSession();
        if (!session && typeof window !== "undefined") {
          await new Promise((r) => setTimeout(r, 50));
          const again = await readSession();
          session = again.data.session;
          sessionErr = again.error;
        }
        if (sessionErr) {
          if (!cancelled) setInitError(sessionErr.message);
          return;
        }
        if (session) {
          if (!cancelled) setReady(true);
          return;
        }

        const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
          if (cancelled) return;
          if (
            nextSession &&
            (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")
          ) {
            setReady(true);
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();
      } catch (e) {
        if (!cancelled) {
          setInitError(e instanceof Error ? e.message : "Gagal memuat sesi reset.");
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const submit = useCallback(async () => {
    setFormError(null);
    const p = password.trim();
    if (p.length < 8) {
      setFormError("Password minimal 8 karakter. / Password must be at least 8 characters.");
      return;
    }
    if (p !== password2.trim()) {
      setFormError("Password tidak sama. / Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: p });
      if (error) {
        setFormError(error.message);
        return;
      }
      setDone(true);
      await supabase.auth.signOut();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal menyimpan password.");
    } finally {
      setBusy(false);
    }
  }, [password, password2]);

  if (initError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">Tautan tidak valid atau sudah kedaluwarsa</p>
          <p className="mt-2 text-amber-800/90">Invalid or expired link</p>
          <p className="mt-2 text-xs">{initError}</p>
          <Link href="/" className="mt-4 inline-block text-sm font-semibold text-amber-950 underline">
            Minta tautan baru dari halaman login / Request a new link from sign in
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
          <p className="font-semibold">Password berhasil diubah</p>
          <p className="mt-1">Password updated successfully.</p>
          <Link
            href="/"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Masuk / Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm text-slate-600">
        Memverifikasi tautan… / Verifying link…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Password baru / New password</h1>
        <p className="mt-1 text-xs text-slate-500">Minimal 8 karakter. / At least 8 characters.</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Konfirmasi / Confirm</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
        </div>
        {formError ? <p className="mt-3 text-xs text-red-600">{formError}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Menyimpan… / Saving…" : "Simpan password / Save password"}
        </button>
        <Link href="/" className="mt-3 block text-center text-xs font-semibold text-slate-600 underline">
          Batal, kembali ke login / Cancel
        </Link>
      </div>
    </div>
  );
}
