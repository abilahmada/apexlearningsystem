import { createSupabaseAdminClient } from "@/lib/supabase/server";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const supabase = createSupabaseAdminClient();
    const authRes = await supabase.auth.getUser(token);
    const authUser = authRes.data.user;
    if (!authUser?.email) return Response.json({ message: "Invalid token" }, { status: 401 });

    const { data: appUser, error: appUserErr } = await supabase
      .from("users")
      .select("id, role")
      .eq("email", authUser.email)
      .single();
    if (appUserErr || !appUser) return Response.json({ message: "User not found" }, { status: 404 });
    if (String(appUser.role) !== "STUDENT") return Response.json({ message: "Forbidden" }, { status: 403 });

    const { data, error } = await supabase
      .from("assessment_remediation_queue")
      .select("id, dimension, concept_key, reason, priority, status, metadata, created_at, resolved_at")
      .eq("user_id", appUser.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return Response.json({ message: error.message }, { status: 500 });

    return Response.json({
      items: (data ?? []).map((row) => ({
        id: String(row.id),
        dimension: String(row.dimension),
        conceptKey: String(row.concept_key),
        reason: String(row.reason),
        priority: String(row.priority),
        status: String(row.status),
        metadata: row.metadata ?? {},
        createdAt: String(row.created_at),
        resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      })),
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

