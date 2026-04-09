import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CALIBRATION_DIMENSIONS, ciToConfidenceBand, thetaToLevel } from "@/lib/calibration/engine";
import {
  assessmentLayerForPhase,
  continuousReviewDaysUntilDue,
  resolvePlacementProductPhase,
  type AssessmentSessionStatus,
  type PlacementProductPhase,
} from "@/lib/assessment/placement-lifecycle";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function getStudentContextFromToken(token: string) {
  const supabase = createSupabaseAdminClient();
  const authRes = await supabase.auth.getUser(token);
  const authUser = authRes.data.user;
  if (!authUser?.email) return { error: "Invalid token" as const };

  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", authUser.email)
    .single();
  if (appUserError || !appUser) return { error: "User not found" as const };
  if (String(appUser.role) !== "STUDENT") return { error: "Forbidden" as const };

  const { data: studentProfile, error: studentError } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("user_id", appUser.id)
    .single();
  if (studentError || !studentProfile) return { error: "Student profile not found" as const };

  return { supabase, appUser, studentProfile } as const;
}

type StatusResponse = {
  status: "pending" | "active" | "calibrating" | "placed" | "extended";
  /** Fase produk terintegrasi (empat lapis + review berkala). */
  productPhase: PlacementProductPhase;
  /** Peta pedagogik 1–4 untuk copy / analytics. */
  assessmentLayer: number;
  /**
   * Hari hingga jadwal review penempatan berkala (≈4–6 minggu setelah kunci + validasi).
   * Null jika belum relevan. Nilai ≤0 berarti sudah waktunya review.
   */
  nextContinuousReviewInDays: number | null;
  daysRemaining: number;
  sessionsCompleted: number;
  /** Level + confidence band only — raw theta is not exposed (safety spec). */
  provisionalProfile: Record<string, { level: string; confidenceBand: "narrow" | "moderate" | "wide" }>;
  flags: Array<{ type: string; dimension: string | null; severity: string; createdAt: string }>;
  isPlacementFinal: boolean;
};

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await getStudentContextFromToken(token);
    if ("error" in auth) {
      const code =
        auth.error === "Invalid token"
          ? 401
          : auth.error === "Student profile not found"
            ? 404
            : auth.error === "Forbidden"
              ? 403
              : 404;
      return Response.json({ message: auth.error }, { status: code });
    }

    const { supabase, appUser } = auth;
    const { data: session, error: sessionError } = await supabase
      .from("assessment_sessions")
      .select(
        "id, status, started_at, calibration_ends_at, sessions_completed, intake_ci, intake_theta, final_theta, placement_locked_at, parent_validated_at, last_continuous_review_at",
      )
      .eq("user_id", appUser.id)
      .maybeSingle();

    if (sessionError) return Response.json({ message: sessionError.message }, { status: 500 });
    if (!session) return Response.json({ message: "Assessment session not found" }, { status: 404 });

    const now = new Date();
    const end = session.calibration_ends_at ? new Date(String(session.calibration_ends_at)) : now;
    const daysRemaining = Math.max(
      0,
      Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    );

    const thetaSource = (session.status === "PLACED" ? session.final_theta : session.intake_theta) ?? {};
    const intakeCI = Number(session.intake_ci ?? 2.4);
    const confidenceBand = ciToConfidenceBand(intakeCI);
    const provisionalProfile: StatusResponse["provisionalProfile"] = {};
    for (const dim of CALIBRATION_DIMENSIONS) {
      const thetaValue =
        typeof (thetaSource as Record<string, unknown>)[dim] === "number"
          ? Number((thetaSource as Record<string, unknown>)[dim])
          : 5;
      provisionalProfile[dim] = {
        level: thetaToLevel(thetaValue),
        confidenceBand,
      };
    }

    const { data: flags, error: flagError } = await supabase
      .from("calibration_flags")
      .select("flag_type, dimension, severity, created_at")
      .eq("user_id", appUser.id)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(10);
    if (flagError) return Response.json({ message: flagError.message }, { status: 500 });

    const sessionStatus = String(session.status).toUpperCase() as AssessmentSessionStatus;
    const sessionsCompleted = Number(session.sessions_completed ?? 0);
    const parentValidatedAt = session.parent_validated_at ? String(session.parent_validated_at) : null;
    const placementLockedAt = session.placement_locked_at ? String(session.placement_locked_at) : null;
    const lastContinuousReviewAt = session.last_continuous_review_at
      ? String(session.last_continuous_review_at)
      : null;

    const productPhase = resolvePlacementProductPhase({
      sessionStatus,
      sessionsCompleted,
      parentValidatedAt,
      placementLockedAt,
      lastContinuousReviewAt,
      now,
    });

    const nextContinuousReviewInDays =
      productPhase === "PLACEMENT_STABLE" || productPhase === "CONTINUOUS_REVIEW_DUE"
        ? continuousReviewDaysUntilDue(
            placementLockedAt,
            parentValidatedAt,
            now,
            undefined,
            lastContinuousReviewAt,
          )
        : null;

    const payload: StatusResponse = {
      status: String(session.status).toLowerCase() as StatusResponse["status"],
      productPhase,
      assessmentLayer: assessmentLayerForPhase(productPhase),
      nextContinuousReviewInDays,
      daysRemaining,
      sessionsCompleted,
      provisionalProfile,
      flags: (flags ?? []).map((f) => ({
        type: String(f.flag_type),
        dimension: f.dimension ? String(f.dimension) : null,
        severity: String(f.severity),
        createdAt: String(f.created_at),
      })),
      isPlacementFinal: String(session.status) === "PLACED" && !!session.placement_locked_at,
    };

    return Response.json(payload);
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

