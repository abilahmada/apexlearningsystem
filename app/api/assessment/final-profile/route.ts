import { requireAppUserFromRequest } from "@/lib/auth/request-user";
import {
  CALIBRATION_DIMENSIONS,
  calculateFinalPlacement,
  thetaToLevel,
  ciToConfidenceBand,
  placementTrend,
  calcCI,
  type CalibrationDimension,
} from "@/lib/calibration/engine";

/**
 * GET /api/assessment/final-profile
 *
 * Two access modes:
 *   ?studentProfileId=<uuid>  — PARENT: verifies the student belongs to this parent
 *   ?userId=<uuid>            — MENTOR / ADMIN: any student by user_id
 *
 * Response (superset used by both parent portal and mentor portal):
 *   profile: Record<dim, { level, trend, confidenceBand, finalTheta, intakeTheta, delta, ci }>
 */
export async function GET(req: Request) {
  try {
    const auth = await requireAppUserFromRequest(req);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const { supabase, userId: callerUserId, role } = auth;
    const url = new URL(req.url);
    const studentProfileId = url.searchParams.get("studentProfileId") ?? "";
    const directUserId = url.searchParams.get("userId") ?? "";

    let studentUserId: string;

    if (role === "MENTOR" || role === "ADMIN") {
      // Mentor/Admin: look up by userId directly
      if (!directUserId) return Response.json({ message: "userId wajib untuk mentor/admin." }, { status: 400 });
      studentUserId = directUserId;
    } else if (role === "PARENT") {
      // Parent: verify ownership via studentProfileId
      if (!studentProfileId) return Response.json({ message: "studentProfileId wajib." }, { status: 400 });
      const { data: parentProfile } = await supabase
        .from("parent_profiles")
        .select("id")
        .eq("user_id", callerUserId)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!parentProfile) return Response.json({ message: "Profil orang tua tidak ditemukan." }, { status: 404 });

      const { data: studentRow } = await supabase
        .from("student_profiles")
        .select("user_id")
        .eq("id", studentProfileId)
        .eq("parent_id", parentProfile.id)
        .maybeSingle();
      if (!studentRow) return Response.json({ message: "Siswa tidak ditemukan atau bukan milik akun ini." }, { status: 404 });
      studentUserId = String(studentRow.user_id);
    } else {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }

    const [sessionRes, cpRes, validationRes] = await Promise.all([
      supabase
        .from("assessment_sessions")
        .select("intake_theta, intake_ci, sessions_completed")
        .eq("user_id", studentUserId)
        .maybeSingle(),
      supabase
        .from("competency_profiles")
        .select("dimension, theta, ci, level")
        .eq("user_id", studentUserId),
      supabase
        .from("parent_validations")
        .select("adjustments, agreed_with_profile")
        .eq("user_id", studentUserId)
        .maybeSingle(),
    ]);

    if (!sessionRes.data) {
      return Response.json({ message: "Belum ada data assessment." }, { status: 404 });
    }

    const session = sessionRes.data;
    const sessionsCompleted = Number(session.sessions_completed ?? 0);
    const intakeCI = typeof session.intake_ci === "number" ? session.intake_ci : 2.4;
    const intakeThetaRaw = session.intake_theta as Record<string, unknown> | null;

    const intakeThetaMap: Partial<Record<CalibrationDimension, number>> = {};
    if (intakeThetaRaw && typeof intakeThetaRaw === "object") {
      for (const dim of CALIBRATION_DIMENSIONS) {
        if (typeof intakeThetaRaw[dim] === "number") {
          intakeThetaMap[dim] = Number(intakeThetaRaw[dim]);
        }
      }
    }

    const adjustments = (
      validationRes.data?.adjustments && typeof validationRes.data.adjustments === "object"
        ? validationRes.data.adjustments
        : {}
    ) as Record<string, number>;
    const agreedWithProfile = validationRes.data?.agreed_with_profile !== false;

    const result = calculateFinalPlacement({
      sessionsCompleted,
      intakeCI,
      intakeTheta: intakeThetaMap,
      signals: {},
      engagement: 5,
      parentAdjustments: adjustments,
      parentAgreedWithProfile: agreedWithProfile,
      continuousReviewMode: true,
    });

    const cpByDim = new Map<string, { theta: number; ci: number; level: string }>();
    for (const row of cpRes.data ?? []) {
      cpByDim.set(String(row.dimension), {
        theta: Number(row.theta ?? 5),
        ci: Number(row.ci ?? 2.4),
        level: String(row.level ?? "SOLID"),
      });
    }

    const ci = calcCI(sessionsCompleted, 5, intakeCI);

    // Superset response used by both parent portal and mentor portal
    const profile: Record<string, {
      level: string;
      trend: "up" | "down" | "stable";
      confidenceBand: "narrow" | "moderate" | "wide";
      finalTheta: number;
      intakeTheta: number;
      delta: number;
      ci: number;
    }> = {};

    for (const dim of CALIBRATION_DIMENSIONS) {
      const cp = cpByDim.get(dim);
      const calcDim = result.dimensions.find((d) => d.dim === dim);
      const intakeVal = Number(intakeThetaMap[dim] ?? 5);
      const finalTheta = cp?.theta ?? calcDim?.finalTheta ?? intakeVal;
      const dimCi = cp?.ci ?? ci;
      const level = cp?.level ?? thetaToLevel(finalTheta);
      profile[dim] = {
        level,
        trend: placementTrend(intakeVal, finalTheta),
        confidenceBand: ciToConfidenceBand(dimCi),
        finalTheta,
        intakeTheta: intakeVal,
        delta: finalTheta - intakeVal,
        ci: dimCi,
      };
    }

    return Response.json({ profile });
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
