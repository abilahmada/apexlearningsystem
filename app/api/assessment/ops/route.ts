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

    const { data: appUser, error: userErr } = await supabase
      .from("users")
      .select("id, role")
      .eq("email", authUser.email)
      .single();
    if (userErr || !appUser) return Response.json({ message: "User not found" }, { status: 404 });
    if (!["ADMIN", "MENTOR"].includes(String(appUser.role))) {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const [sessionsRes, unresolvedRes, placedMissingRes, signalRes] = await Promise.all([
      supabase.from("assessment_sessions").select("status, updated_at"),
      supabase.from("calibration_flags").select("id").eq("resolved", false),
      supabase
        .from("assessment_sessions")
        .select("id")
        .eq("status", "PLACED")
        .is("final_theta", null),
      supabase
        .from("calibration_signals")
        .select("id, recorded_at")
        .gte("recorded_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);

    if (sessionsRes.error || unresolvedRes.error || placedMissingRes.error || signalRes.error) {
      return Response.json(
        {
          message:
            sessionsRes.error?.message ??
            unresolvedRes.error?.message ??
            placedMissingRes.error?.message ??
            signalRes.error?.message ??
            "Unknown query error",
        },
        { status: 500 },
      );
    }

    const sessions = sessionsRes.data ?? [];
    const byStatus: Record<string, number> = {};
    for (const s of sessions) {
      const key = String(s.status);
      byStatus[key] = (byStatus[key] ?? 0) + 1;
    }

    return Response.json({
      ts: now,
      sessionsTotal: sessions.length,
      sessionsByStatus: byStatus,
      unresolvedFlags: (unresolvedRes.data ?? []).length,
      placedMissingFinalTheta: (placedMissingRes.data ?? []).length,
      signalsLast24h: (signalRes.data ?? []).length,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

