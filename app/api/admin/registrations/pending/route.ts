import { isAdminRequest } from "@/lib/auth/admin-request";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const ok = await isAdminRequest(req);
    if (!ok) return Response.json({ message: "Forbidden" }, { status: 403 });

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("registration_verifications")
      .select("id, user_id, email, role, status, payload, expires_at, created_at")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return Response.json({ message: error.message }, { status: 500 });

    return Response.json({ items: data ?? [] });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
