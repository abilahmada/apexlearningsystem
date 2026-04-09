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
    if (String(appUser.role) !== "MENTOR") return Response.json({ message: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId")?.trim();
    if (!userId) return Response.json({ message: "userId is required" }, { status: 400 });

    const { data: flags, error: flagsErr } = await supabase
      .from("calibration_flags")
      .select("id, flag_type, dimension, severity, payload, resolved, created_at")
      .eq("user_id", userId)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(20);
    if (flagsErr) return Response.json({ message: flagsErr.message }, { status: 500 });

    return Response.json({
      userId,
      flags: (flags ?? []).map((f) => ({
        id: String(f.id),
        type: String(f.flag_type),
        dimension: f.dimension ? String(f.dimension) : null,
        severity: String(f.severity),
        createdAt: String(f.created_at),
      })),
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

