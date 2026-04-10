import { requireAppUserFromRequest } from "@/lib/auth/request-user";
import {
  CALIBRATION_DIMENSIONS,
  thetaToLevel,
  calcCI,
  type CalibrationDimension,
} from "@/lib/calibration/engine";

/**
 * POST /api/assessment/mentor-override
 * Auth: MENTOR or ADMIN.
 * Applies a manual theta override for one dimension of a student's competency profile.
 * Creates a MENTOR_OVERRIDE calibration_flag and, if all dims have narrow CI,
 * locks the placement (sets placement_locked_at).
 *
 * Body: { userId, dimension, overrideTheta, reason }
 * Returns: { ok, level, autoLocked }
 */
export async function POST(req: Request) {
  try {
    const auth = await requireAppUserFromRequest(req);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });
    if (auth.role !== "MENTOR" && auth.role !== "ADMIN") {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }

    const { supabase, userId: mentorUserId } = auth;

    const body = (await req.json()) as {
      userId?: string;
      dimension?: string;
      overrideTheta?: number;
      reason?: string;
    };

    const studentUserId = typeof body.userId === "string" ? body.userId.trim() : "";
    const dimension = typeof body.dimension === "string" ? body.dimension.trim().toLowerCase() : "";
    const overrideTheta = Number(body.overrideTheta);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!studentUserId) return Response.json({ message: "userId wajib." }, { status: 400 });
    if (!CALIBRATION_DIMENSIONS.includes(dimension as CalibrationDimension)) {
      return Response.json({ message: `Dimensi tidak valid: ${dimension}` }, { status: 400 });
    }
    if (!Number.isFinite(overrideTheta) || overrideTheta < 1 || overrideTheta > 10) {
      return Response.json({ message: "overrideTheta harus angka antara 1 dan 10." }, { status: 400 });
    }
    if (!reason) return Response.json({ message: "reason wajib." }, { status: 400 });

    // Fetch existing session for CI calculation
    const { data: session } = await supabase
      .from("assessment_sessions")
      .select("intake_ci, sessions_completed")
      .eq("user_id", studentUserId)
      .maybeSingle();

    const intakeCI = typeof session?.intake_ci === "number" ? session.intake_ci : 2.4;
    const sessionsCompleted = Number(session?.sessions_completed ?? 0);
    const ci = calcCI(sessionsCompleted, 5, intakeCI);
    const level = thetaToLevel(overrideTheta);
    const now = new Date().toISOString();

    // Upsert competency_profiles for this dimension
    const { error: upErr } = await supabase
      .from("competency_profiles")
      .upsert(
        {
          user_id: studentUserId,
          dimension,
          theta: overrideTheta,
          ci,
          level,
          source: "MENTOR_OVERRIDE",
          updated_at: now,
        },
        { onConflict: "user_id,dimension" },
      );
    if (upErr) return Response.json({ message: upErr.message }, { status: 500 });

    // Resolve previous MENTOR_OVERRIDE or MISMATCH flags for this dimension
    await supabase
      .from("calibration_flags")
      .update({ resolved: true })
      .eq("user_id", studentUserId)
      .eq("dimension", dimension)
      .in("flag_type", ["MISMATCH", "MENTOR_OVERRIDE" as never])
      .eq("resolved", false);

    // Create new EARLY_ALERT flag recording the override
    await supabase.from("calibration_flags").insert({
      user_id: studentUserId,
      flag_type: "EARLY_ALERT",
      dimension,
      severity: "LOW",
      payload: {
        overrideTheta,
        reason,
        mentorUserId,
        source: "mentor_override",
      },
    });

    // Check if all dims now have competency_profiles → decide auto-lock
    const { data: allProfiles } = await supabase
      .from("competency_profiles")
      .select("dimension, ci")
      .eq("user_id", studentUserId);

    const coveredDims = new Set((allProfiles ?? []).map((p) => String(p.dimension)));
    const allCovered = CALIBRATION_DIMENSIONS.every((d) => coveredDims.has(d));
    const allNarrow = (allProfiles ?? []).every((p) => Number(p.ci ?? 2.4) < 0.8);
    const autoLocked = allCovered && allNarrow;

    if (autoLocked) {
      await supabase
        .from("assessment_sessions")
        .update({ placement_locked_at: now, updated_at: now })
        .eq("user_id", studentUserId)
        .is("placement_locked_at", null);
    }

    return Response.json({ ok: true, level, autoLocked });
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
