import { createClient } from "@supabase/supabase-js";

function getSupabaseServerEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env belum lengkap. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return { url, anonKey, serviceRoleKey };
}

export function createSupabaseServerClient() {
  const { url, anonKey } = getSupabaseServerEnv();
  return createClient(url, anonKey);
}

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = getSupabaseServerEnv();

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY belum di-set. Wajib untuk operasi admin/backend.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
