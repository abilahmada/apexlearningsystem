import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  CALIBRATION_DIMENSIONS,
  calculateFinalPlacement,
  thetaToLevel,
  calcCI,
  type CalibrationDimension,
  type AggregatedSignals,
} from "@/lib/calibration/engine";

/**
 * GET /api/cron/nightly-calibration
 * Vercel Cron: runs daily at 17:00 UTC (see vercel.json).
 * For every ACTIVE/CALIBRATING session with calibration_signals,
 * re-aggregates signals and updates competency_profiles.
 */
export async function GET(req: Request) {
  // Protect against unauthorized calls in production
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createSupabaseAdminClient();

  // 1. Find all sessions eligible for calibration update
  const { data: sessions, error: sErr } = await supabase
    .from("assessment_sessions")
    .select("id, user_id, status, sessions_completed, intake_theta, intake_ci")
    .in("status", ["ACTIVE", "CALIBRATING"]);
  if (sErr) return Response.json({ message: sErr.message }, { status: 500 });

  if (!sessions?.length) {
    return Response.json({ ok: true, processed: 0, message: "No eligible sessions." });
  }

  const userIds = sessions.map((s) => String(s.user_id));

  // 2. Aggregate calibration signals per user+dimension
  const { data: signals } = await supabase
    .from("calibration_signals")
    .select("user_id, signal_type, dimension, normalized_value")
    .in("user_id", userIds)
    .in("signal_type", ["MASTERY_VELOCITY", "ERROR_PATTERN", "ENGAGEMENT"]);

  type SigAccum = { velocitySum: number; velocityCount: number; errorSum: number; errorCount: number };
  const sigMap = new Map<string, Map<string, SigAccum>>();
  for (const sig of signals ?? []) {
    const uid = String(sig.user_id);
    const dim = String(sig.dimension);
    if (!sigMap.has(uid)) sigMap.set(uid, new Map());
    const dimMap = sigMap.get(uid)!;
    if (!dimMap.has(dim)) dimMap.set(dim, { velocitySum: 0, velocityCount: 0, errorSum: 0, errorCount: 0 });
    const acc = dimMap.get(dim)!;
    const val = Number(sig.normalized_value ?? 5);
    if (sig.signal_type === "MASTERY_VELOCITY") { acc.velocitySum += val; acc.velocityCount += 1; }
    if (sig.signal_type === "ERROR_PATTERN")   { acc.errorSum += val; acc.errorCount += 1; }
  }

  // 3. Engagement: use global signals per user
  const engagementMap = new Map<string, number>();
  for (const [uid, dimMap] of sigMap.entries()) {
    const globalAcc = dimMap.get("global");
    if (globalAcc && globalAcc.velocityCount > 0) {
      engagementMap.set(uid, globalAcc.velocitySum / globalAcc.velocityCount);
    } else {
      engagementMap.set(uid, 5);
    }
  }

  const now = new Date().toISOString();
  let processed = 0;
  let errors = 0;

  for (const session of sessions) {
    try {
      const uid = String(session.user_id);
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

      // Build aggregated signals for calculateFinalPlacement
      const aggregated: AggregatedSignals = {};
      const dimMap = sigMap.get(uid);
      for (const dim of CALIBRATION_DIMENSIONS) {
        const acc = dimMap?.get(dim);
        if (acc) {
          aggregated[dim] = {
            velocity: acc.velocityCount > 0 ? acc.velocitySum / acc.velocityCount : 1.0,
            systematicRate: acc.errorCount > 0 ? 1 - (acc.errorSum / acc.errorCount) / 10 : 0,
          };
        }
      }

      const engagement = engagementMap.get(uid) ?? 5;
      const result = calculateFinalPlacement({
        sessionsCompleted,
        intakeCI,
        intakeTheta: intakeThetaMap,
        signals: aggregated,
        engagement,
        continuousReviewMode: true,
      });

      if (result.dimensions.length === 0) continue;

      const upsertRows = result.dimensions.map((d) => ({
        user_id: uid,
        dimension: d.dim,
        theta: d.finalTheta,
        ci: calcCI(sessionsCompleted, engagement, intakeCI),
        level: thetaToLevel(d.finalTheta),
        source: "CALIBRATION" as const,
        updated_at: now,
      }));

      const { error: upErr } = await supabase
        .from("competency_profiles")
        .upsert(upsertRows, { onConflict: "user_id,dimension" });
      if (upErr) { console.error("[nightly-calibration] upsert:", upErr.message); errors++; }
      else processed++;
    } catch (e) {
      console.error("[nightly-calibration] session error:", e instanceof Error ? e.message : e);
      errors++;
    }
  }

  return Response.json({ ok: true, processed, errors, total: sessions.length });
}
