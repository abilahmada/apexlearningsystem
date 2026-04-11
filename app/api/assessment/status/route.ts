import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";
import { CALIBRATION_DIMENSIONS, thetaToLevel } from "@/lib/calibration/engine";
import {
  resolvePlacementProductPhase,
  continuousReviewDaysUntilDue,
  type AssessmentSessionStatus,
} from "@/lib/assessment/placement-lifecycle";

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonPrivateNoStore({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });

    const supabase = auth.supabase;

    // Ambil assessment session
    const { data: session, error: sErr } = await supabase
      .from("assessment_sessions")
      .select(
        "id, status, calibration_ends_at, intake_theta, intake_ci, parent_validated_at, sessions_completed",
      )
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (sErr) return jsonPrivateNoStore({ message: sErr.message }, { status: 500 });

    // Belum ada sesi → status PENDING
    if (!session) {
      return jsonPrivateNoStore({
        status: "PENDING",
        productPhase: "L1_INTAKE",
        sessionsCompleted: 0,
        nextContinuousReviewInDays: null,
        provisionalProfile: {},
      });
    }

    const sessionStatus = String(session.status ?? "PENDING").toUpperCase() as AssessmentSessionStatus;
    const sessionsCompleted = Number(session.sessions_completed ?? 0);

    const productPhase = resolvePlacementProductPhase({
      sessionStatus,
      sessionsCompleted,
      parentValidatedAt: session.parent_validated_at ? String(session.parent_validated_at) : null,
      placementLockedAt: null,
    });

    const nextContinuousReviewInDays = continuousReviewDaysUntilDue(
      null,
      session.parent_validated_at ? String(session.parent_validated_at) : null,
    );

    // Baca competency_profiles (sumber placements saat ini)
    const { data: profiles } = await supabase
      .from("competency_profiles")
      .select("dimension, theta, ci, level")
      .eq("user_id", auth.userId);

    const provisionalProfile: Record<string, { level: string; confidenceBand?: "narrow" | "moderate" | "wide" }> = {};

    for (const dim of CALIBRATION_DIMENSIONS) {
      const row = (profiles ?? []).find((p) => p.dimension === dim);
      if (row) {
        const ci = typeof row.ci === "number" ? row.ci : 2.4;
        const band: "narrow" | "moderate" | "wide" =
          ci < 0.6 ? "narrow" : ci < 1.2 ? "moderate" : "wide";
        provisionalProfile[dim] = {
          level: String(row.level ?? thetaToLevel(Number(row.theta ?? 5))),
          confidenceBand: band,
        };
      } else {
        // Fallback dari intake_theta jika belum ada competency_profile
        const intakeTheta = session.intake_theta as Record<string, unknown> | null;
        if (intakeTheta && typeof intakeTheta[dim] === "number") {
          provisionalProfile[dim] = {
            level: thetaToLevel(Number(intakeTheta[dim])),
            confidenceBand: "wide",
          };
        }
      }
    }

    return jsonPrivateNoStore({
      status: sessionStatus,
      productPhase,
      sessionsCompleted,
      nextContinuousReviewInDays,
      provisionalProfile,
    });
  } catch (e) {
    return jsonPrivateNoStore(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
