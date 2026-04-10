import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getBearerToken } from "@/lib/assessment/require-student";
import {
  CALIBRATION_DIMENSIONS,
  calculateFinalPlacement,
  thetaToLevel,
  ciToConfidenceBand,
  placementTrend,
} from "@/lib/calibration/engine";

/**
 * GET /api/assessment/final-profile?studentProfileId=<uuid>
 * Auth: PARENT — verifies the student belongs to this parent.
 * Returns per-dimension { level, trend, confidenceBand } derived from
 * competency_profiles (or intake_theta fallback) + parent adjustments.
 */
export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const supabase = createSupabaseAdminClient();
    const { data: authData } = await supabase.auth.getUser(token);
    const authUser = authData.user;
    if (!authUser?.email) return Response.json({ message: "Invalid token" }, { status: 401 });

    const { data: appUser, error: uErr } = await supabase
      .from("users")
      .select("id, role")
      .eq("email", authUser.email)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (uErr || !appUser) return Response.json({ message: "User not found" }, { status: 404 });
    if (String(appUser.role) !== "PARENT") return Response.json({ message: "Forbidden" }, { status: 403 });

    const { data: parentProfile, error: pErr } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", appUser.id)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pErr || !parentProfile) return Response.json({ message: "Profil orang tua tidak ditemukan." }, { status: 404 });

    const url = new URL(req.url);
    const studentProfileId = url.searchParams.get("studentProfileId") ?? "";
    if (!studentProfileId) return Response.json({ message: "studentProfileId wajib." }, { status: 400 });

    // Verify ownership
    const { data: studentRow, error: srErr } = await supabase
      .from("student_profiles")
      .select("id, user_id")
      .eq("id", studentProfileId)
      .eq("parent_id", parentProfile.id)
      .maybeSingle();
    if (srErr || !studentRow) return Response.json({ message: "Siswa tidak ditemukan atau bukan milik akun ini." }, { status: 404 });

    const studentUserId = String(studentRow.user_id);

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

    // Extract per-dim intake thetas (1-10 scale)
    const intakeThetaMap: Partial<Record<string, number>> = {};
    if (intakeThetaRaw && typeof intakeThetaRaw === "object") {
      for (const dim of CALIBRATION_DIMENSIONS) {
        if (typeof intakeThetaRaw[dim] === "number") {
          intakeThetaMap[dim] = Number(intakeThetaRaw[dim]);
        }
      }
    }

    const adjustments = (validationRes.data?.adjustments && typeof validationRes.data.adjustments === "object"
      ? validationRes.data.adjustments
      : {}) as Record<string, number>;
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

    // Build profile: prefer competency_profiles rows, fallback to calculated result
    const cpByDim = new Map<string, { theta: number; ci: number; level: string }>();
    for (const row of cpRes.data ?? []) {
      cpByDim.set(String(row.dimension), {
        theta: Number(row.theta ?? 5),
        ci: Number(row.ci ?? 2.4),
        level: String(row.level ?? "SOLID"),
      });
    }

    const profile: Record<string, { level: string; trend: "up" | "down" | "stable"; confidenceBand: "narrow" | "moderate" | "wide" }> = {};

    for (const dim of result.dimensions) {
      const cp = cpByDim.get(dim.dim);
      const finalTheta = cp?.theta ?? dim.finalTheta;
      const ci = cp?.ci ?? dim.ci;
      const level = cp?.level ?? thetaToLevel(finalTheta);
      const intakeTheta = dim.intake;
      profile[dim.dim] = {
        level,
        trend: placementTrend(intakeTheta, finalTheta),
        confidenceBand: ciToConfidenceBand(ci),
      };
    }

    // Fallback for dims not returned by calculateFinalPlacement
    for (const dim of CALIBRATION_DIMENSIONS) {
      if (profile[dim]) continue;
      const cp = cpByDim.get(dim);
      const intakeVal = Number(intakeThetaMap[dim] ?? 5);
      const theta = cp?.theta ?? intakeVal;
      const ci = cp?.ci ?? intakeCI;
      profile[dim] = {
        level: cp?.level ?? thetaToLevel(theta),
        trend: placementTrend(intakeVal, theta),
        confidenceBand: ciToConfidenceBand(ci),
      };
    }

    return Response.json({ profile });
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
