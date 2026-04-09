import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CALIBRATION_DIMENSIONS, thetaToLevel } from "@/lib/calibration/engine";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function getMentorFromToken(token: string) {
  const supabase = createSupabaseAdminClient();
  const authRes = await supabase.auth.getUser(token);
  const authUser = authRes.data.user;
  if (!authUser?.email) return { error: "Invalid token" as const };

  const { data: appUser, error } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", authUser.email)
    .single();
  if (error || !appUser) return { error: "User not found" as const };
  if (String(appUser.role) !== "MENTOR") return { error: "Forbidden" as const };

  return { supabase, appUser } as const;
}

type Body = {
  userId: string;
  dimension: string;
  overrideTheta: number;
  reason: string;
};

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await getMentorFromToken(token);
    if ("error" in auth) {
      const code = auth.error === "Invalid token" ? 401 : auth.error === "Forbidden" ? 403 : 404;
      return Response.json({ message: auth.error }, { status: code });
    }
    const { supabase, appUser } = auth;

    const body = (await req.json()) as Body;
    if (!body.userId || !body.dimension || typeof body.overrideTheta !== "number" || !body.reason?.trim()) {
      return Response.json(
        { message: "userId, dimension, overrideTheta, dan reason wajib diisi." },
        { status: 400 },
      );
    }

    const theta = Math.max(1, Math.min(10, Number(body.overrideTheta)));
    const nowIso = new Date().toISOString();

    const { error: upsertError } = await supabase.from("competency_profiles").upsert(
      {
        user_id: body.userId,
        dimension: body.dimension,
        theta,
        ci: 0.7,
        level: thetaToLevel(theta),
        source: "MENTOR_OVERRIDE",
        locked_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "user_id,dimension" },
    );
    if (upsertError) return Response.json({ message: upsertError.message }, { status: 500 });

    await supabase
      .from("calibration_flags")
      .update({
        resolved: true,
        resolved_by: appUser.id,
      })
      .eq("user_id", body.userId)
      .eq("dimension", body.dimension)
      .eq("resolved", false);

    await supabase.from("calibration_flags").insert({
      user_id: body.userId,
      flag_type: "MISMATCH",
      dimension: body.dimension,
      severity: "LOW",
      payload: {
        type: "mentor_override",
        reason: body.reason.trim(),
        overrideTheta: theta,
        mentorUserId: appUser.id,
      },
      resolved: true,
      resolved_by: appUser.id,
    });

    const { data: unresolvedFlags } = await supabase
      .from("calibration_flags")
      .select("id")
      .eq("user_id", body.userId)
      .eq("resolved", false)
      .limit(1);

    let autoLocked = false;
    if (!unresolvedFlags || unresolvedFlags.length === 0) {
      const { data: profiles } = await supabase
        .from("competency_profiles")
        .select("dimension, theta")
        .eq("user_id", body.userId);

      const finalTheta: Record<string, number> = {};
      for (const dim of CALIBRATION_DIMENSIONS) {
        const row = (profiles ?? []).find((p) => String(p.dimension) === dim);
        finalTheta[dim] = Number(row?.theta ?? 5);
      }

      const nowIso = new Date().toISOString();
      const { error: lockErr } = await supabase
        .from("assessment_sessions")
        .update({
          status: "PLACED",
          placement_locked_at: nowIso,
          final_theta: finalTheta,
          updated_at: nowIso,
        })
        .eq("user_id", body.userId)
        .in("status", ["CALIBRATING", "EXTENDED", "ACTIVE", "PENDING"]);
      autoLocked = !lockErr;
    }

    return Response.json({
      ok: true,
      userId: body.userId,
      dimension: body.dimension,
      overrideTheta: theta,
      level: thetaToLevel(theta),
      autoLocked,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

