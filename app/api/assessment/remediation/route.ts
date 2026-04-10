import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const { data, error } = await auth.supabase
      .from("assessment_remediation_queue")
      .select("id, dimension, concept_key, reason, priority, status, metadata, created_at, resolved_at")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return Response.json({ message: error.message }, { status: 500 });

    const items = (data ?? []).map((row) => ({
      id: String(row.id),
      dimension: String(row.dimension ?? ""),
      conceptKey: String(row.concept_key ?? ""),
      reason: String(row.reason ?? ""),
      priority: String(row.priority ?? "MEDIUM"),
      status: String(row.status ?? "PENDING"),
      metadata: (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>,
      createdAt: String(row.created_at ?? ""),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    }));

    return Response.json({ items });
  } catch (e) {
    return Response.json(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
