import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

type APEXGlobal = typeof globalThis & {
  __apexSupabase?: SupabaseClient;
};

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env belum lengkap. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return { url, anonKey };
}

export function createSupabaseBrowserClient() {
  const g = globalThis as APEXGlobal;
  // Reuse one browser client instance to avoid multiple GoTrueClient warnings
  // and unexpected auth state behavior across components.
  if (g.__apexSupabase) {
    return g.__apexSupabase;
  }
  const { url, anonKey } = getSupabaseEnv();
  const client = createClient(url, anonKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
  g.__apexSupabase = client;
  return client;
}

/** Hapus instance singleton agar client baru dibuat setelah storage dibersihkan. */
export function resetSupabaseBrowserClientSingleton() {
  (globalThis as APEXGlobal).__apexSupabase = undefined;
}

/** Hapus kunci auth Supabase dari localStorage (token rusak / refresh gagal). */
export function purgeStaleSupabaseAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("sb-") && key.includes("auth-token")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

export function isRefreshTokenAuthError(message: string | undefined) {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("refresh token") ||
    m.includes("invalid refresh") ||
    m.includes("refresh token not found")
  );
}
