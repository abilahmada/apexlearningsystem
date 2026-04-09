"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Menyelesaikan verifikasi email Supabase (PKCE ?code=...) atau memuat sesi dari hash token.
 * Tambahkan URL ini ke Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.
 */
export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Memverifikasi akun…");

  useEffect(() => {
    const run = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const href = window.location.href;
        const u = new URL(href);
        const err = u.searchParams.get("error");
        const errDesc = u.searchParams.get("error_description");
        if (err) {
          setMessage(errDesc?.replace(/\+/g, " ") ?? err);
          return;
        }

        const code = u.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(href);
          if (error) {
            setMessage(error.message);
            return;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setMessage(
            "Tidak ada sesi dari link ini. Buka ulang tautan dari email atau coba masuk manual. Pastikan Redirect URL di Supabase mencakup /auth/callback.",
          );
          return;
        }

        const role = String(session.user.user_metadata?.role ?? "").toUpperCase();
        if (role === "STUDENT") {
          try {
            sessionStorage.setItem("apex-open-assessment", "1");
          } catch {
            /* ignore */
          }
        }

        const origin = window.location.origin;
        window.location.replace(`${origin}/auth/verified`);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Verifikasi gagal");
      }
    };

    void run();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-[#EFF2F6]">
      <p className="text-slate-700 text-center max-w-md">{message}</p>
    </div>
  );
}
