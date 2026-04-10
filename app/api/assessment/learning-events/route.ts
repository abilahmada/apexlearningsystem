import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import { buildLiveCalibrationRows, KNOWN_LEARNING_EVENT_NAMES, type LiveLearningEventPayload } from "@/lib/assessment/learning-events";
import { APEX_LEARNING_EVENTS } from "@/lib/assessment/placement-lifecycle";
import { CALIBRATION_DIMENSIONS, type CalibrationDimension } from "@/lib/calibration/engine";

/**
 * POST /api/assessment/learning-events
 * Auth: STUDENT bearer token.
 * Receives a learning event from the UI, persists calibration_signals,
 * and increments sessions_completed on MODULE_SESSION_END events.
 *
 * Body: LiveLearningEventPayload (event, dimension?, moduleId?, lessonId?, scorePct?, durationSeconds?)
 */
export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const { supabase, userId } = auth;

    const body = (await req.json()) as Partial<LiveLearningEventPayload>;
    const event = typeof body.event === "string" ? body.event.trim() : "";
    if (!event) return Response.json({ message: "event wajib." }, { status: 400 });
    if (!KNOWN_LEARNING_EVENT_NAMES.has(event)) {
      return Response.json({ message: `Event tidak dikenal: ${event}` }, { status: 400 });
    }

    const dimension =
      body.dimension && CALIBRATION_DIMENSIONS.includes(body.dimension as CalibrationDimension)
        ? (body.dimension as CalibrationDimension)
        : null;

    // Fetch (or create) assessment session
    const { data: session, error: sErr } = await supabase
      .from("assessment_sessions")
      .select("id, status, sessions_completed")
      .eq("user_id", userId)
      .maybeSingle();
    if (sErr) return Response.json({ message: sErr.message }, { status: 500 });
    if (!session) return Response.json({ message: "Sesi assessment belum dibuat." }, { status: 404 });

    const payload: LiveLearningEventPayload = {
      event,
      dimension: dimension ?? undefined,
      moduleId: typeof body.moduleId === "string" ? body.moduleId : null,
      lessonId: typeof body.lessonId === "string" ? body.lessonId : null,
      scorePct: typeof body.scorePct === "number" ? body.scorePct : null,
      durationSeconds: typeof body.durationSeconds === "number" ? body.durationSeconds : null,
      conceptKey: typeof body.conceptKey === "string" ? body.conceptKey : null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : null,
    };

    const signalRows = buildLiveCalibrationRows(userId, session.id, payload);
    const { error: insErr } = await supabase.from("calibration_signals").insert(signalRows);
    if (insErr) {
      console.error("[learning-events] calibration_signals:", insErr.message);
    }

    // On MODULE_SESSION_END, increment sessions_completed and transition CALIBRATING → ACTIVE
    if (event === APEX_LEARNING_EVENTS.MODULE_SESSION_END) {
      const newCount = Number(session.sessions_completed ?? 0) + 1;
      const sessionStatus = String(session.status ?? "");
      await supabase
        .from("assessment_sessions")
        .update({
          sessions_completed: newCount,
          ...(sessionStatus === "CALIBRATING" ? { status: "ACTIVE" } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }

    return Response.json({ ok: true, signalsInserted: insErr ? 0 : signalRows.length });
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
