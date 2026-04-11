"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Redirect target setelah verifikasi email daftar (resend / konfirmasi).
 * Menukar ?code= PKCE bila ada, lalu mengarahkan ke beranda.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Menyelesaikan login… / Finishing sign in…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const href = typeof window !== "undefined" ? window.location.href : "";
        if (href.includes("code=")) {
          const { error } = await supabase.auth.exchangeCodeForSession(href);
          if (error) {
            if (!cancelled) setMessage(error.message);
            return;
          }
        }
        await supabase.auth.getSession();
        if (!cancelled) router.replace("/");
      } catch (e) {
        if (!cancelled) setMessage(e instanceof Error ? e.message : "Gagal.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm text-slate-600">
      {message}
    </div>
  );
}
