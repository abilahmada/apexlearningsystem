import { getBearerToken, requireStudentSession, ensureAssessmentSession } from "@/lib/assessment/require-student";
import { CALIBRATION_DIMENSIONS, type CalibrationDimension } from "@/lib/calibration/engine";
import {
  computeModuleSessionOutcome,
  fetchModuleForSession,
  fetchStudentProgressRow,
  persistStudentProgress,
} from "@/lib/learning/module-session";

function parseUuid(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
  return t.toLowerCase();
}

function parseDimension(raw: unknown): CalibrationDimension {
  if (typeof raw !== "string") return "kognitif";
  return CALIBRATION_DIMENSIONS.includes(raw as CalibrationDimension) ? (raw as CalibrationDimension) : "kognitif";
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) {
      return Response.json({ message: auth.message }, { status: auth.status });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const moduleId = parseUuid(body.moduleId);
    if (!moduleId) {
      return Response.json({ message: "moduleId (UUID) wajib." }, { status: 400 });
    }

    const scorePct = Number(body.scorePct);
    if (!Number.isFinite(scorePct)) {
      return Response.json({ message: "scorePct (angka) wajib." }, { status: 400 });
    }

    const dimension = parseDimension(body.dimension);
    const lessonId = typeof body.lessonId === "string" ? body.lessonId : null;
    const extraMetadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : undefined;

    const { supabase, userId } = auth;

    const { data: studentProfile, error: spErr } = await supabase
      .from("student_profiles")
      .select("id")
      .eq("user_id", userId)
      .single();
    if (spErr || !studentProfile) {
      return Response.json({ message: "Student profile tidak ditemukan." }, { status: 404 });
    }

    const studentProfileId = String(studentProfile.id);

    const mod = await fetchModuleForSession(supabase, moduleId);
    if (!mod) {
      return Response.json({ message: "Modul tidak ditemukan." }, { status: 404 });
    }

    const existing = await fetchStudentProgressRow(supabase, studentProfileId, moduleId);

    const assessmentSession = await ensureAssessmentSession(supabase, userId);

    const masteryThreshold = Number(mod.mastery_threshold ?? 80);
    const outcome = computeModuleSessionOutcome(
      {
        userId,
        studentProfileId,
        assessmentSessionId: assessmentSession.id,
        moduleId,
        moduleTitle: String(mod.title ?? ""),
        masteryThreshold,
        scorePct,
        lessonId,
        dimension,
        extraMetadata,
      },
      existing,
    );

    await persistStudentProgress(supabase, studentProfileId, moduleId, outcome.highestScore, outcome.newStatus);

    const { error: sigErr } = await supabase.from("calibration_signals").insert(outcome.calibrationRows);
    if (sigErr) {
      return Response.json({ message: sigErr.message }, { status: 500 });
    }

    return Response.json({
      ok: true,
      progress: {
        previousStatus: outcome.previousStatus,
        status: outcome.newStatus,
        highestScore: outcome.highestScore,
        masteredJustNow: outcome.masteredJustNow,
        masteryThreshold,
      },
      calibrationSignalsInserted: outcome.calibrationRows.length,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
