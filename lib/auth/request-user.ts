import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type AppUserRole = "STUDENT" | "PARENT" | "MENTOR" | "ADMIN";

export type AppUserAuthResult =
  | {
      ok: true;
      supabase: ReturnType<typeof createSupabaseAdminClient>;
      userId: string;
      email: string;
      role: AppUserRole;
    }
  | { ok: false; status: number; message: string };

export function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

export async function requireAppUserFromRequest(req: Request): Promise<AppUserAuthResult> {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, message: "Missing token" };

  const supabase = createSupabaseAdminClient();
  const authRes = await supabase.auth.getUser(token);
  const authUser = authRes.data.user;
  if (!authUser?.email) {
    return { ok: false, status: 401, message: "Invalid token" };
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, role, email")
    .eq("email", authUser.email)
    .single();

  if (error || !data?.id || !data.role || !data.email) {
    return { ok: false, status: 404, message: "User not found" };
  }

  const role = String(data.role).toUpperCase() as AppUserRole;
  if (!["STUDENT", "PARENT", "MENTOR", "ADMIN"].includes(role)) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return {
    ok: true,
    supabase,
    userId: String(data.id),
    email: String(data.email),
    role,
  };
}
