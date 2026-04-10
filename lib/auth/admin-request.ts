import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminSupabase = ReturnType<typeof createSupabaseAdminClient>;

export function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

/** Satu baris role untuk email (toleran duplikat email di public.users — ambil id terkecil). */
async function fetchUserRoleByEmail(supabase: AdminSupabase, email: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("email", email)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return String(data.role ?? "");
}

/**
 * Cek admin (403-style): tanpa token / bukan admin → false.
 * Dipakai route yang memetakan semua ke HTTP 403.
 */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const token = getBearerToken(req);
  if (!token) return false;

  const supabase = createSupabaseAdminClient();
  const authRes = await supabase.auth.getUser(token);
  const authUser = authRes.data.user;
  if (!authUser?.email) return false;

  const role = await fetchUserRoleByEmail(supabase, authUser.email);
  return role === "ADMIN";
}

export type AdminAuthResult =
  | { ok: true; supabase: AdminSupabase }
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

  const role = await fetchUserRoleByEmail(supabase, authUser.email);
  if (!role || role !== "ADMIN") {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return { ok: true, supabase };
}
