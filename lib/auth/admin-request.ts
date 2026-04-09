import { createSupabaseAdminClient } from "@/lib/supabase/server";

export function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

export type AdminAuthResult =
  | { ok: true; supabase: ReturnType<typeof createSupabaseAdminClient> }
  | { ok: false; status: number; message: string };

/**
 * Pastikan Bearer JWT milik user dengan role ADMIN di public.users.
 */
export async function requireAdminFromRequest(req: Request): Promise<AdminAuthResult> {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, message: "Missing token" };
  }

  const supabase = createSupabaseAdminClient();
  const authRes = await supabase.auth.getUser(token);
  const authUser = authRes.data.user;
  if (!authUser?.email) {
    return { ok: false, status: 401, message: "Invalid token" };
  }

  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("email", authUser.email)
    .single();

  if (error || !data || String(data.role) !== "ADMIN") {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return { ok: true, supabase };
}
