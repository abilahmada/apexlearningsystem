import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { buildLiveCalibrationRows } from "@/lib/assessment/learning-events";
import {
  APEX_LEARNING_EVENTS,
  CONTINUOUS_REVIEW_INTERVAL_DAYS,
  continuousReviewDaysUntilDue,
} from "@/lib/assessment/placement-lifecycle";
import {
  calculateFinalPlacement,
  CALIBRATION_DIMENSIONS,
  CalibrationDimension,
  thetaToLevel,
} from "@/lib/calibration/engine";

function isAuthorized(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "";
  return !!expected && auth === expected;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function parseThetaMap(value: unknown): Partial<Record<CalibrationDimension, number>> {
  if (!value || typeof value !== "object") return {};
  const src = value as Record<string, unknown>;
  const out: Partial<Record<CalibrationDimension, number>> = {};
  for (const dim of CALIBRATION_DIMENSIONS) {
    const v = src[dim];
    if (typeof v === "number") out[dim] = v;
  }
  return out;
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const nowIso = new Date().toISOString();
    const now = new Date();

    const { data: candidates, error: listErr } = await supabase
      .from("assessment_sessions")
      .select(
        "id, user_id, sessions_completed, intake_ci, intake_theta, final_theta, placement_locked_at, parent_validated_at, last_continuous_review_at",
      )
      .eq("status", "PLACED")
      .not("parent_validated_at", "is", null);

    if (listErr) {
      return Response.json({ message: listErr.message }, { status: 500 });
    }

    let reviewed = 0;
    let skipped = 0;
    let failed = 0;

    for (const session of candidates ?? []) {
      try {
        const placementLockedAt = session.placement_locked_at ? String(session.placement_locked_at) : null;
        const parentValidatedAt = session.parent_validated_at ? String(session.parent_validated_at) : null;
        const lastContinuousReviewAt = session.last_continuous_review_at
          ? String(session.last_continuous_review_at)
          : null;

        const daysLeft = continuousReviewDaysUntilDue(
          placementLockedAt,
          parentValidatedAt,
          now,
          CONTINUOUS_REVIEW_INTERVAL_DAYS,
          lastContinuousReviewAt,
        );
        if (daysLeft === null || daysLeft > 0) {
          skipped += 1;
          continue;
        }

        const [{ data: signals }, { data: parentValidation }] = await Promise.all([
          supabase
            .from("calibration_signals")
            .select("signal_type, dimension, raw_value")
            .eq("session_id", session.id)
            .gte("recorded_at", addDays(new Date(), -CONTINUOUS_REVIEW_INTERVAL_DAYS)),
          supabase
            .from("parent_validations")
            .select("agreed_with_profile, adjustments")
            .eq("user_id", session.user_id)
            .maybeSingle(),
        ]);

        const byDim: Partial<Record<CalibrationDimension, { velocity: number; systematicRate: number }>> = {};
        const engagementRows = (signals ?? []).filter((s) => s.signal_type === "ENGAGEMENT");
        const engagement =
          engagementRows.length > 0
            ? engagementRows.reduce((acc, row) => acc + Number(row.raw_value ?? 0), 0) / engagementRows.length
            : 5;

        for (const dim of CALIBRATION_DIMENSIONS) {
          const velRows = (signals ?? []).filter(
            (s) => s.dimension === dim && s.signal_type === "MASTERY_VELOCITY",
          );
          const errRows = (signals ?? []).filter((s) => s.dimension === dim && s.signal_type === "ERROR_PATTERN");
          byDim[dim] = {
            velocity:
              velRows.length > 0
                ? velRows.reduce((acc, row) => acc + Number(row.raw_value ?? 0), 0) / velRows.length
                : 1.0,
            systematicRate:
              errRows.length > 0
                ? errRows.reduce((acc, row) => acc + Number(row.raw_value ?? 0), 0) / errRows.length
                : 0,
          };
        }

        const intakeTheta = parseThetaMap(session.final_theta ?? session.intake_theta);
        const sc = Math.max(5, Number(session.sessions_completed ?? 5));

        const result = calculateFinalPlacement({
          sessionsCompleted: sc,
          intakeCI: Number(session.intake_ci ?? 2.4),
          intakeTheta,
          signals: byDim,
          engagement,
          parentAdjustments: parseThetaMap(parentValidation?.adjustments),
          parentAgreedWithProfile: parentValidation?.agreed_with_profile ?? true,
          continuousReviewMode: true,
        });

        if (result.dimensions.length === 0) {
          failed += 1;
          continue;
        }

        const finalThetaMap: Record<string, number> = {};
        for (const dimResult of result.dimensions) {
          finalThetaMap[dimResult.dim] = dimResult.finalTheta;
          await supabase.from("competency_profiles").upsert(
            {
              user_id: session.user_id,
              dimension: dimResult.dim,
              theta: dimResult.finalTheta,
              ci: dimResult.ci,
              level: thetaToLevel(dimResult.finalTheta),
              source: "CONTINUOUS_REVIEW",
              locked_at: nowIso,
              updated_at: nowIso,
            },
            { onConflict: "user_id,dimension" },
          );
        }

        await supabase
          .from("assessment_sessions")
          .update({
            final_theta: finalThetaMap,
            last_continuous_review_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", session.id);

        const liveRows = buildLiveCalibrationRows(String(session.user_id), String(session.id), {
          event: APEX_LEARNING_EVENTS.PLACEMENT_REVIEW_COMPLETED,
          metadata: {
            reviewedDimensions: result.dimensions.map((d) => d.dim),
            avgDelta:
              result.dimensions.reduce((a, d) => a + Math.abs(d.finalTheta - d.intake), 0) / result.dimensions.length,
          },
        });
        await supabase.from("calibration_signals").insert(liveRows);

        for (const dimResult of result.dimensions) {
          if (dimResult.velNorm > 7.5 && byDim[dimResult.dim]?.velocity && byDim[dimResult.dim]!.velocity > 2.2) {
            await supabase.from("calibration_flags").insert({
              user_id: session.user_id,
              flag_type: "ACCELERATION",
              dimension: dimResult.dim,
              severity: "LOW",
              payload: {
                velocity: byDim[dimResult.dim]?.velocity,
                from: "continuous-placement-review",
              },
              resolved: false,
            });
          }
        }

        reviewed += 1;
      } catch {
        failed += 1;
      }
    }

    return Response.json({
      candidates: (candidates ?? []).length,
      reviewed,
      skipped,
      failed,
      ts: nowIso,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
