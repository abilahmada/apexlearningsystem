import {
  buildLiveCalibrationRows,
  KNOWN_LEARNING_EVENT_NAMES,
  type LiveLearningEventPayload,
} from "@/lib/assessment/learning-events";
import { CALIBRATION_DIMENSIONS, type CalibrationDimension } from "@/lib/calibration/engine";
import { getBearerToken, requireStudentSession, ensureAssessmentSession } from "@/lib/assessment/require-student";

function parseDimension(raw: unknown): CalibrationDimension | undefined {
  if (typeof raw !== "string") return undefined;
  return CALIBRATION_DIMENSIONS.includes(raw as CalibrationDimension) ? (raw as CalibrationDimension) : undefined;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) {
      const code = auth.status;
      return Response.json({ message: auth.message }, { status: code });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const event = typeof body.event === "string" ? body.event.trim() : "";
    if (!event) {
      return Response.json({ message: "event is required" }, { status: 400 });
    }
    if (!KNOWN_LEARNING_EVENT_NAMES.has(event)) {
      return Response.json(
        { message: `Unknown event. Use one of: ${[...KNOWN_LEARNING_EVENT_NAMES].join(", ")}` },
        { status: 400 },
      );
    }

    const payload: LiveLearningEventPayload = {
      event,
      dimension: parseDimension(body.dimension),
      moduleId: typeof body.moduleId === "string" ? body.moduleId : null,
      lessonId: typeof body.lessonId === "string" ? body.lessonId : null,
      scorePct:
        typeof body.scorePct === "number" && Number.isFinite(body.scorePct)
          ? Math.max(0, Math.min(100, body.scorePct))
          : null,
      conceptKey: typeof body.conceptKey === "string" ? body.conceptKey : null,
      durationSeconds:
        typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
          ? Math.max(0, Math.min(3600 * 8, Math.round(body.durationSeconds)))
          : null,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : null,
    };

    const { supabase, userId } = auth;
    const session = await ensureAssessmentSession(supabase, userId);
    const rows = buildLiveCalibrationRows(userId, session.id, payload);

    const { error: insertError } = await supabase.from("calibration_signals").insert(rows);
    if (insertError) {
      return Response.json({ message: insertError.message }, { status: 500 });
    }

    return Response.json({
      ok: true,
      inserted: rows.length,
      sessionId: session.id,
      signalTypes: [...new Set(rows.map((r) => r.signal_type))],
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
