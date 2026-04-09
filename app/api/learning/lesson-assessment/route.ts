import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import {
  computeLessonUnlockMap,
  fetchLatestLessonAttempt,
  fetchLessonProgressMap,
  fetchLessonWithModule,
  fetchModuleLessons,
  fetchStudentProfileId,
  insertLessonAttempt,
  normalizeAnswer,
  scoreQuiz,
  upsertLessonProgress,
  type AssessmentType,
} from "@/lib/learning/lesson-assessment";

const MIN_SUBMIT_INTERVAL_MS = 8_000;
const IDEMPOTENCY_WINDOW_MS = 60_000;

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
      const { data: quizRow, error: quizErr } = await auth.supabase
        .from("quizzes")
        .select("lesson_id, questions")
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (quizErr) return Response.json({ message: quizErr.message }, { status: 500 });
      if (!quizRow) return Response.json({ message: "Quiz tidak ditemukan." }, { status: 404 });
      const questions = Array.isArray(quizRow.questions)
        ? (quizRow.questions as Array<Record<string, unknown>>).map((q) => ({
            question: q.question,
            options: q.options,
            hint: q.hint ?? q.explanation ?? null,
            difficulty: q.difficulty ?? null,
            tags: q.tags ?? [],
          }))
        : [];
      return Response.json({ lessonId, questions });
    }

    if (!moduleId) return Response.json({ message: "moduleId (UUID) wajib." }, { status: 400 });

    const studentProfileId = await fetchStudentProfileId(auth.supabase, auth.userId);
    const lessons = await fetchModuleLessons(auth.supabase, moduleId);
    const lessonIds = lessons.map((l) => l.id);
    const progressMap = await fetchLessonProgressMap(auth.supabase, studentProfileId, lessonIds);
    const unlockMap = computeLessonUnlockMap(lessons, progressMap);

    const items = lessons.map((lesson) => {
      const progress = progressMap.get(lesson.id);
      const unlocked = Boolean(unlockMap.get(lesson.id));
      return {
        lessonId: lesson.id,
        title: lesson.title,
        metadata: lesson.metadata ?? {},
        unlocked,
        pretestScore: progress?.pretest_score ?? null,
        posttestScore: progress?.posttest_score ?? null,
        posttestPassed: progress?.posttest_passed ?? false,
        canProceedNext: progress?.posttest_passed ?? false,
      };
    });

    return Response.json({ items });
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
    if (!unlocked) {
      return Response.json(
        { message: "Lesson masih terkunci. Selesaikan lesson sebelumnya (post-test >= 80)." },
        { status: 403 },
      );
    }

    const { data: quizRow, error: quizErr } = await auth.supabase
      .from("quizzes")
      .select("id, questions")
      .eq("lesson_id", lessonId)
      .maybeSingle();
    if (quizErr) return Response.json({ message: quizErr.message }, { status: 500 });
    if (!quizRow) return Response.json({ message: "Quiz untuk lesson ini belum tersedia." }, { status: 404 });

    const questions = Array.isArray(quizRow.questions)
      ? (quizRow.questions as Array<Record<string, unknown>>)
      : [];
    if (questions.length === 0) {
      return Response.json({ message: "Pertanyaan quiz kosong." }, { status: 400 });
    }

    const answers = answersRaw.map((x) => normalizeAnswer(x));
    const scored = scoreQuiz(questions, answers);
    const passThreshold = 80;
    const passed = assessmentType === "POST" ? scored.scorePct >= passThreshold : false;

    await upsertLessonProgress(
      auth.supabase,
      studentProfileId,
      lessonId,
      assessmentType,
      scored.scorePct,
      passed,
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
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
