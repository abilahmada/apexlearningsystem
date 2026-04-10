import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/placement-lock
 * Vercel Cron: runs daily at 18:00 UTC (see vercel.json).
 * Finds sessions whose 14-day calibration window has expired and advances
 * them to status=PLACED so the parent validation step can begin.
 *
 * Flow: CALIBRATING/ACTIVE → (calibration_ends_at passed) → PLACED
 *   → resolvePlacementProductPhase returns L4_PARENT_VALIDATION_PENDING
 *   → parent validates → status stays PLACED, parentValidatedAt set
 *   → phase becomes PLACEMENT_STABLE
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  // Find sessions where calibration window has expired but status is not yet PLACED
  const { data: expiredSessions, error: fetchErr } = await supabase
    .from("assessment_sessions")
    .select("id, user_id, status, calibration_ends_at, sessions_completed")
    .in("status", ["CALIBRATING", "ACTIVE"])
    .lt("calibration_ends_at", now);
  if (fetchErr) return Response.json({ message: fetchErr.message }, { status: 500 });

  if (!expiredSessions?.length) {
    return Response.json({ ok: true, locked: 0, message: "No expired sessions." });
  }

  let locked = 0;
  let errors = 0;

  for (const session of expiredSessions) {
    try {
      const { error: upErr } = await supabase
        .from("assessment_sessions")
        .update({
          status: "PLACED",
          placement_locked_at: now,
          updated_at: now,
        })
        .eq("id", session.id)
        .in("status", ["CALIBRATING", "ACTIVE"]); // guard against concurrent updates
      if (upErr) {
        console.error("[placement-lock] update:", session.id, upErr.message);
        errors++;
      } else {
        locked++;
      }
    } catch (e) {
      console.error("[placement-lock] session:", e instanceof Error ? e.message : e);
      errors++;
    }
  }

  return Response.json({ ok: true, locked, errors, total: expiredSessions.length });
}
