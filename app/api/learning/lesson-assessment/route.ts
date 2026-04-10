import { ensureAssessmentSession, getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import { buildLiveCalibrationRows } from "@/lib/assessment/learning-events";
import {
  APEX_LEARNING_EVENTS,
  resolvePlacementProductPhase,
  type AssessmentSessionStatus,
  type PlacementProductPhase,
} from "@/lib/assessment/placement-lifecycle";
import {
  computeLessonUnlockMap,
  fetchLatestLessonAttempt,
  fetchLessonProgressMap,
  fetchLessonWithModule,
  fetchModuleLessons,
  fetchModuleMasteryThreshold,
  fetchStudentProfileId,
  insertLessonAttempt,
  normalizeAnswer,
  scoreQuiz,
  upsertLessonProgress,
  type AssessmentType,
} from "@/lib/learning/lesson-assessment";
import {
  PRE_REQUIRED_REASON,
  shouldBlockPostAssessment,
} from "@/lib/learning/lesson-assessment-guards";
import { pickQuestionsForAssessment } from "@/lib/learning/quiz-assessment-pick";

const MIN_SUBMIT_INTERVAL_MS = 8_000;
const IDEMPOTENCY_WINDOW_MS = 60_000;

function logAssessmentReason(reason: string, detail: Record<string, unknown>) {
  console.warn("[lesson-assessment][reason]", {
    reason,
    ...detail,
  });
}

function parseUuid(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
  return t.toLowerCase();
}

function parseAssessmentType(raw: unknown): AssessmentType | null {
  if (raw === "PRE" || raw === "POST") return raw;
  return null;
}

function parseSubmitKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.length > 128) return t.slice(0, 128);
  return t;
}

function parseModulePhaseNumber(metadata: Record<string, unknown>): number {
  const fromNumber = Number(metadata.phase ?? metadata.phaseOrder ?? metadata.phase_order);
  if (Number.isFinite(fromNumber)) return Math.max(1, Math.round(fromNumber));
  const phaseText = String(metadata.phase ?? "").trim();
  const m = phaseText.match(/(\d+)/);
  if (m) return Math.max(1, Number(m[1]));
  return 1;
}

function placementBaselinePhaseFromProductPhase(phase: PlacementProductPhase): number {
  switch (phase) {
    case "L1_INTAKE":
      return 1;
    case "L2_CALIBRATION":
    case "L3_RADAR_PROVISIONAL":
      return 2;
    case "L4_PARENT_VALIDATION_PENDING":
    case "PLACEMENT_STABLE":
    case "CONTINUOUS_REVIEW_DUE":
      return 3;
  }
}

async function isModulePhaseLocked(
  supabase: Awaited<ReturnType<typeof requireStudentSession>> extends { ok: true; supabase: infer S }
    ? S
    : never,
  userId: string,
  moduleId: string,
): Promise<boolean> {
  const [{ data: session }, { data: moduleRow, error: moduleErr }] = await Promise.all([
    supabase
      .from("assessment_sessions")
      .select("status, sessions_completed, parent_validated_at, placement_locked_at, last_continuous_review_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("modules").select("metadata").eq("id", moduleId).maybeSingle(),
  ]);
  if (moduleErr) throw new Error(moduleErr.message);
  const productPhase = resolvePlacementProductPhase({
    sessionStatus: String(session?.status ?? "ACTIVE").toUpperCase() as AssessmentSessionStatus,
    sessionsCompleted: Number(session?.sessions_completed ?? 0),
    parentValidatedAt: session?.parent_validated_at ? String(session.parent_validated_at) : null,
    placementLockedAt: session?.placement_locked_at ? String(session.placement_locked_at) : null,
    lastContinuousReviewAt: session?.last_continuous_review_at
      ? String(session.last_continuous_review_at)
      : null,
    now: new Date(),
  });
  const baseline = placementBaselinePhaseFromProductPhase(productPhase);
  const metadata =
    moduleRow?.metadata && typeof moduleRow.metadata === "object"
      ? (moduleRow.metadata as Record<string, unknown>)
      : {};
  const modulePhase = parseModulePhaseNumber(metadata);
  return modulePhase > baseline;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const url = new URL(req.url);
    const moduleId = parseUuid(url.searchParams.get("moduleId"));
    const lessonId = parseUuid(url.searchParams.get("lessonId"));

    if (lessonId) {
      const assessmentParam = url.searchParams.get("assessmentType");
      const forAssessment: AssessmentType =
        assessmentParam === "PRE" || assessmentParam === "POST" ? assessmentParam : "POST";
      const lessonMeta = await fetchLessonWithModule(auth.supabase, lessonId);
      if (!lessonMeta) return Response.json({ message: "Lesson tidak ditemukan." }, { status: 404 });
      const phaseLocked = await isModulePhaseLocked(auth.supabase, auth.userId, lessonMeta.module_id);
      if (phaseLocked) {
        return Response.json(
          {
            message: "Level modul ini masih terkunci untuk levelmu saat ini.",
            reason: "PHASE_LOCKED",
          },
          { status: 403 },
        );
      }
      if (forAssessment === "POST") {
        const studentProfileId = await fetchStudentProfileId(auth.supabase, auth.userId);
        const { data: progressRow, error: progressErr } = await auth.supabase
          .from("lesson_progress")
          .select("pretest_score")
          .eq("student_id", studentProfileId)
          .eq("lesson_id", lessonId)
          .maybeSingle();
        if (progressErr) return Response.json({ message: progressErr.message }, { status: 500 });
        if (shouldBlockPostAssessment(forAssessment, progressRow?.pretest_score)) {
          logAssessmentReason(PRE_REQUIRED_REASON, {
            route: "GET",
            lessonId,
            assessmentType: forAssessment,
            userId: auth.userId,
          });
          return Response.json(
            {
              message: "Kerjakan Pre-test terlebih dahulu sebelum membuka Post-test.",
              reason: PRE_REQUIRED_REASON,
            },
            { status: 403 },
          );
        }
      }

      const { data: quizRow, error: quizErr } = await auth.supabase
        .from("quizzes")
        .select("lesson_id, questions, questions_pre, questions_post")
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (quizErr) return Response.json({ message: quizErr.message }, { status: 500 });
      if (!quizRow) return Response.json({ message: "Quiz tidak ditemukan." }, { status: 404 });
      const rawList = pickQuestionsForAssessment(quizRow, forAssessment);
      const questions = rawList.map((q) => ({
        question: q.question,
        options: q.options,
        hint: q.hint ?? q.explanation ?? null,
        difficulty: q.difficulty ?? null,
        tags: q.tags ?? [],
      }));
      return Response.json({ lessonId, assessmentType: forAssessment, questions });
    }

    if (!moduleId) return Response.json({ message: "moduleId (UUID) wajib." }, { status: 400 });

    const studentProfileId = await fetchStudentProfileId(auth.supabase, auth.userId);
    const lessons = await fetchModuleLessons(auth.supabase, moduleId);
    const modulePhaseLocked = await isModulePhaseLocked(auth.supabase, auth.userId, moduleId);
    const lessonIds = lessons.map((l) => l.id);
    const progressMap = await fetchLessonProgressMap(auth.supabase, studentProfileId, lessonIds);
    const unlockMap = computeLessonUnlockMap(lessons, progressMap);
    const postPassThreshold = await fetchModuleMasteryThreshold(auth.supabase, moduleId);

    const items = lessons.map((lesson) => {
      const progress = progressMap.get(lesson.id);
      const sequenceUnlocked = Boolean(unlockMap.get(lesson.id));
      const unlocked = !modulePhaseLocked && sequenceUnlocked;
      return {
        lessonId: lesson.id,
        title: lesson.title,
        metadata: lesson.metadata ?? {},
        unlocked,
        pretestScore: progress?.pretest_score ?? null,
        posttestScore: progress?.posttest_score ?? null,
        posttestPassed: progress?.posttest_passed ?? false,
        canProceedNext: progress?.posttest_passed ?? false,
        lockReason: unlocked
          ? null
          : modulePhaseLocked
            ? "PHASE_LOCKED"
            : "LESSON_LOCKED_PREVIOUS_POST_NOT_PASSED",
      };
    });

    return Response.json({ items, postPassThreshold });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const body = (await req.json()) as Record<string, unknown>;
    const lessonId = parseUuid(body.lessonId);
    const assessmentType = parseAssessmentType(body.assessmentType);
    const submitKey = parseSubmitKey(body.submitKey);
    const answersRaw = Array.isArray(body.answers) ? body.answers : [];

    if (!lessonId) return Response.json({ message: "lessonId (UUID) wajib." }, { status: 400 });
    if (!assessmentType) {
      return Response.json({ message: "assessmentType harus PRE atau POST." }, { status: 400 });
    }

    const lesson = await fetchLessonWithModule(auth.supabase, lessonId);
    if (!lesson) return Response.json({ message: "Lesson tidak ditemukan." }, { status: 404 });

    const studentProfileId = await fetchStudentProfileId(auth.supabase, auth.userId);
    const latestAttempt = await fetchLatestLessonAttempt(
      auth.supabase,
      studentProfileId,
      lessonId,
      assessmentType,
    );
    if (latestAttempt?.createdAt) {
      const elapsedMs = Date.now() - new Date(latestAttempt.createdAt).getTime();
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < MIN_SUBMIT_INTERVAL_MS) {
        const retryAfterMs = Math.max(0, MIN_SUBMIT_INTERVAL_MS - elapsedMs);
        return Response.json(
          {
            message: "Terlalu cepat submit. Tunggu sebentar sebelum coba lagi.",
            reason: "RATE_LIMITED_MIN_INTERVAL",
            retryAfterMs,
          },
          { status: 429 },
        );
      }

      const previousSubmitKey = String(latestAttempt.metadata.submitKey ?? "");
      const inIdempotencyWindow = elapsedMs >= 0 && elapsedMs <= IDEMPOTENCY_WINDOW_MS;
      if (submitKey && previousSubmitKey && submitKey === previousSubmitKey && inIdempotencyWindow) {
        return Response.json(
          {
            message: "Submit duplikat terdeteksi. Percobaan sebelumnya sudah tercatat.",
            reason: "DUPLICATE_SUBMIT_KEY",
          },
          { status: 409 },
        );
      }
    }

    const lessons = await fetchModuleLessons(auth.supabase, lesson.module_id);
    const lessonIds = lessons.map((l) => l.id);
    const progressMap = await fetchLessonProgressMap(auth.supabase, studentProfileId, lessonIds);
    const unlockMap = computeLessonUnlockMap(lessons, progressMap);
    const unlocked = Boolean(unlockMap.get(lessonId));
    const phaseLocked = await isModulePhaseLocked(auth.supabase, auth.userId, lesson.module_id);
    if (phaseLocked) {
      logAssessmentReason("PHASE_LOCKED", {
        route: "POST",
        lessonId,
        assessmentType,
        userId: auth.userId,
      });
      return Response.json(
        {
          message: "Level modul ini masih terkunci untuk levelmu saat ini.",
          reason: "PHASE_LOCKED",
        },
        { status: 403 },
      );
    }
    if (!unlocked) {
      logAssessmentReason("LESSON_LOCKED", {
        route: "POST",
        lessonId,
        assessmentType,
        userId: auth.userId,
      });
      return Response.json(
        {
          message:
            "Lesson masih terkunci. Lulus post-test lesson sebelumnya sesuai ambang modul (mastery_threshold).",
          reason: "LESSON_LOCKED",
        },
        { status: 403 },
      );
    }

    const passThreshold = lesson.module_mastery_threshold;

    if (assessmentType === "POST") {
      const progNow = progressMap.get(lessonId);
      if (shouldBlockPostAssessment(assessmentType, progNow?.pretest_score)) {
        logAssessmentReason(PRE_REQUIRED_REASON, {
          route: "POST",
          lessonId,
          assessmentType,
          userId: auth.userId,
        });
        return Response.json(
          {
            message: "Kerjakan Pre-test terlebih dahulu sebelum Post-test.",
            reason: PRE_REQUIRED_REASON,
          },
          { status: 403 },
        );
      }
    }
    const progNow = progressMap.get(lessonId);

    const { data: quizRow, error: quizErr } = await auth.supabase
      .from("quizzes")
      .select("id, questions, questions_pre, questions_post")
      .eq("lesson_id", lessonId)
      .maybeSingle();
    if (quizErr) return Response.json({ message: quizErr.message }, { status: 500 });
    if (!quizRow) return Response.json({ message: "Quiz untuk lesson ini belum tersedia." }, { status: 404 });

    const questions = pickQuestionsForAssessment(quizRow, assessmentType);
    if (questions.length === 0) {
      return Response.json({ message: "Pertanyaan quiz kosong." }, { status: 400 });
    }

    const answers = answersRaw.map((x) => normalizeAnswer(x));
    const scored = scoreQuiz(questions, answers);
    const passed = assessmentType === "POST" ? scored.scorePct >= passThreshold : false;

    await upsertLessonProgress(
      auth.supabase,
      studentProfileId,
      lessonId,
      assessmentType,
      scored.scorePct,
      passed,
      assessmentType === "POST" ? (progNow?.pretest_score ?? null) : null,
    );

    await insertLessonAttempt(
      auth.supabase,
      studentProfileId,
      lessonId,
      assessmentType,
      scored.scorePct,
      passed,
      answers,
      {
        attemptReason: "STUDENT_SUBMIT",
        submitKey: submitKey ?? null,
        submittedAt: new Date().toISOString(),
        totalQuestions: scored.total,
        correctAnswers: scored.correct,
        passThreshold,
      },
    );

    let calibrationSignalsInserted = 0;
    try {
      const session = await ensureAssessmentSession(auth.supabase, auth.userId);
      const eventName =
        assessmentType === "PRE"
          ? APEX_LEARNING_EVENTS.ITEM_RESPONSE
          : passed
            ? APEX_LEARNING_EVENTS.MASTERY_THRESHOLD
            : APEX_LEARNING_EVENTS.ITEM_RESPONSE;
      const calRows = buildLiveCalibrationRows(auth.userId, session.id, {
        event: eventName,
        moduleId: lesson.module_id,
        lessonId,
        scorePct: scored.scorePct,
        metadata: {
          source: "lesson_assessment",
          assessmentType,
          passed,
          passThreshold,
        },
      });
      const { error: calErr } = await auth.supabase.from("calibration_signals").insert(calRows);
      if (!calErr) calibrationSignalsInserted = calRows.length;
      else console.error("[lesson-assessment] calibration_signals:", calErr.message);
    } catch (calibrationErr) {
      console.error("[lesson-assessment] calibration:", calibrationErr);
    }

    const refreshedProgressMap = await fetchLessonProgressMap(
      auth.supabase,
      studentProfileId,
      lessonIds,
    );
    const refreshedUnlockMap = computeLessonUnlockMap(lessons, refreshedProgressMap);
    const lessonIndex = lessons.findIndex((x) => x.id === lessonId);
    const nextLesson = lessonIndex >= 0 ? lessons[lessonIndex + 1] : null;

    return Response.json({
      ok: true,
      lessonId,
      assessmentType,
      scorePct: scored.scorePct,
      correctAnswers: scored.correct,
      totalQuestions: scored.total,
      passed,
      passThreshold,
      nextLesson: nextLesson
        ? {
            lessonId: nextLesson.id,
            title: nextLesson.title,
            unlocked: Boolean(refreshedUnlockMap.get(nextLesson.id)),
          }
        : null,
      calibrationSignalsInserted,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
