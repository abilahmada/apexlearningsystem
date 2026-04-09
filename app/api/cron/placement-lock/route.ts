import { createSupabaseAdminClient } from "@/lib/supabase/server";
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
    const { data: sessions, error: sessionsError } = await supabase
      .from("assessment_sessions")
      .select("id, user_id, sessions_completed, intake_ci, intake_theta, extension_count")
      .in("status", ["CALIBRATING", "EXTENDED"])
      .lt("calibration_ends_at", nowIso);

    if (sessionsError) {
      return Response.json({ message: sessionsError.message }, { status: 500 });
    }

    let locked = 0;
    let pendingReview = 0;
    let extended = 0;
    let forced = 0;

    for (const session of sessions ?? []) {
      const [{ data: signals }, { data: parentValidation }] = await Promise.all([
        supabase
          .from("calibration_signals")
          .select("signal_type, dimension, raw_value")
          .eq("session_id", session.id)
          .gte("recorded_at", addDays(new Date(), -14)),
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

      const result = calculateFinalPlacement({
        sessionsCompleted: Number(session.sessions_completed ?? 0),
        intakeCI: Number(session.intake_ci ?? 2.4),
        intakeTheta: parseThetaMap(session.intake_theta),
        signals: byDim,
        engagement,
        parentAdjustments: parseThetaMap(parentValidation?.adjustments),
        parentAgreedWithProfile: parentValidation?.agreed_with_profile ?? undefined,
      });

      if (result.status === "insufficient_data") {
        if (Number(session.extension_count ?? 0) < 2) {
          await supabase
            .from("assessment_sessions")
            .update({
              status: "EXTENDED",
              calibration_ends_at: addDays(new Date(), 7),
              extension_count: Number(session.extension_count ?? 0) + 1,
              updated_at: nowIso,
            })
            .eq("id", session.id);
          extended += 1;
        } else {
          const intake = parseThetaMap(session.intake_theta);
          for (const dim of CALIBRATION_DIMENSIONS) {
            const theta = intake[dim] ?? 5;
            await supabase.from("competency_profiles").upsert(
              {
                user_id: session.user_id,
                dimension: dim,
                theta,
                ci: Number(session.intake_ci ?? 2.4),
                level: thetaToLevel(theta),
                source: "INTAKE",
                locked_at: nowIso,
                updated_at: nowIso,
              },
              { onConflict: "user_id,dimension" },
            );
          }
          await supabase
            .from("assessment_sessions")
            .update({
              status: "PLACED",
              placement_locked_at: nowIso,
              final_theta: session.intake_theta,
              updated_at: nowIso,
            })
            .eq("id", session.id);
          forced += 1;
        }
        continue;
      }

      await supabase.from("calibration_flags").delete().eq("user_id", session.user_id).eq("resolved", false);
      if (result.flags.length > 0) {
        await supabase.from("calibration_flags").insert(
          result.flags.map((f) => ({
            user_id: session.user_id,
            flag_type: f.type,
            dimension: f.dimension ?? null,
            severity: f.severity,
            payload: f.payload ?? {},
            resolved: false,
          })),
        );
      }

      if (result.status === "pending_review" || !result.canLock) {
        pendingReview += 1;
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
            source: "CALIBRATION",
            locked_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: "user_id,dimension" },
        );
      }

      await supabase
        .from("assessment_sessions")
        .update({
          status: "PLACED",
          placement_locked_at: nowIso,
          final_theta: finalThetaMap,
          updated_at: nowIso,
        })
        .eq("id", session.id);

      locked += 1;
    }

    return Response.json({
      totalExpired: (sessions ?? []).length,
      locked,
      pendingReview,
      extended,
      forcedIntakeOnly: forced,
      ts: nowIso,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

