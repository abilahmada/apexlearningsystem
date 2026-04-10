import { createSupabaseAdminClient } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof createSupabaseAdminClient>;

export type AssessmentType = "PRE" | "POST";

/** Ambang lulus post-test modul: 0–100, default 80 jika tidak valid. */
export function clampModuleMasteryThreshold(raw: number): number {
  if (!Number.isFinite(raw)) return 80;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export async function fetchModuleMasteryThreshold(supabase: Supabase, moduleId: string): Promise<number> {
  const { data, error } = await supabase
    .from("modules")
    .select("mastery_threshold")
    .eq("id", moduleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return clampModuleMasteryThreshold(Number(data?.mastery_threshold ?? 80));
}

export type LessonRow = {
  id: string;
  module_id: string;
  title: string;
  metadata?: Record<string, unknown> | null;
};

export type LessonProgressRow = {
  lesson_id: string;
  pretest_score: number | null;
  posttest_score: number | null;
  posttest_passed: boolean | null;
  unlocked_at: string | null;
  completed_at: string | null;
};

export function normalizeAnswer(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String.fromCharCode(65 + Math.max(0, Math.min(25, Math.round(raw))));
  }
  const t = String(raw ?? "").trim().toUpperCase();
  if (!t) return "";
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return String.fromCharCode(65 + Math.max(0, Math.min(25, n)));
  }
  return t.slice(0, 1);
}

function expectedAnswer(question: Record<string, unknown>): string {
  const answer = question.answer;
  if (typeof answer === "string" && answer.trim()) return normalizeAnswer(answer);
  const idx = Number(question.answerIndex);
  if (Number.isFinite(idx)) return normalizeAnswer(idx);
  return "";
}

export function scoreQuiz(
  questions: Array<Record<string, unknown>>,
  answers: unknown[],
): { scorePct: number; correct: number; total: number } {
  const total = questions.length;
  if (total === 0) return { scorePct: 0, correct: 0, total: 0 };
  let correct = 0;
  for (let i = 0; i < total; i += 1) {
    const exp = expectedAnswer(questions[i]);
    const got = normalizeAnswer(answers[i]);
    if (exp && got && exp === got) correct += 1;
  }
  const scorePct = Math.round((correct / total) * 100);
  return { scorePct, correct, total };
}

export async function fetchStudentProfileId(supabase: Supabase, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("Student profile tidak ditemukan.");
  return String(data.id);
}

export async function fetchLessonWithModule(
  supabase: Supabase,
  lessonId: string,
): Promise<{ id: string; module_id: string; title: string; module_mastery_threshold: number } | null> {
  const { data, error } = await supabase
    .from("lessons")
    .select("id, module_id, title, modules!inner(mastery_threshold)")
    .eq("id", lessonId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const mod = Array.isArray(data.modules) ? data.modules[0] : data.modules;
  const threshold = clampModuleMasteryThreshold(Number(mod?.mastery_threshold ?? 80));
  return {
    id: String(data.id),
    module_id: String(data.module_id),
    title: String(data.title ?? ""),
    module_mastery_threshold: threshold,
  };
}

export async function fetchModuleLessons(
  supabase: Supabase,
  moduleId: string,
): Promise<LessonRow[]> {
  const { data, error } = await supabase
    .from("lessons")
    .select("id, module_id, title, metadata")
    .eq("module_id", moduleId)
    .order("title", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    module_id: String(r.module_id),
    title: String(r.title ?? ""),
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  }));
}

export async function fetchLessonProgressMap(
  supabase: Supabase,
  studentProfileId: string,
  lessonIds: string[],
): Promise<Map<string, LessonProgressRow>> {
  if (lessonIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("lesson_progress")
    .select("lesson_id, pretest_score, posttest_score, posttest_passed, unlocked_at, completed_at")
    .eq("student_id", studentProfileId)
    .in("lesson_id", lessonIds);
  if (error) throw new Error(error.message);
  const map = new Map<string, LessonProgressRow>();
  for (const row of data ?? []) {
    map.set(String(row.lesson_id), {
      lesson_id: String(row.lesson_id),
      pretest_score: typeof row.pretest_score === "number" ? row.pretest_score : null,
      posttest_score: typeof row.posttest_score === "number" ? row.posttest_score : null,
      posttest_passed: Boolean(row.posttest_passed),
      unlocked_at: (row.unlocked_at as string | null) ?? null,
      completed_at: (row.completed_at as string | null) ?? null,
    });
  }
  return map;
}

export function computeLessonUnlockMap(
  lessons: LessonRow[],
  progressMap: Map<string, LessonProgressRow>,
): Map<string, boolean> {
  const unlockMap = new Map<string, boolean>();
  for (let i = 0; i < lessons.length; i += 1) {
    const lesson = lessons[i];
    if (i === 0) {
      unlockMap.set(lesson.id, true);
      continue;
    }
    const prevLesson = lessons[i - 1];
    const prevProgress = progressMap.get(prevLesson.id);
    unlockMap.set(lesson.id, Boolean(prevProgress?.posttest_passed));
  }
  return unlockMap;
}

export async function upsertLessonProgress(
  supabase: Supabase,
  studentProfileId: string,
  lessonId: string,
  assessmentType: AssessmentType,
  scorePct: number,
  passed: boolean,
  pretestScoreForPost?: number | null,
) {
  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    student_id: studentProfileId,
    lesson_id: lessonId,
    updated_at: nowIso,
  };
  if (assessmentType === "PRE") {
    payload.pretest_score = scorePct;
  } else {
    if (typeof pretestScoreForPost === "number" && Number.isFinite(pretestScoreForPost)) {
      payload.pretest_score = pretestScoreForPost;
    }
    payload.posttest_score = scorePct;
    payload.posttest_passed = passed;
    if (passed) payload.completed_at = nowIso;
  }
  const { error } = await supabase
    .from("lesson_progress")
    .upsert(payload, { onConflict: "student_id,lesson_id" });
  if (error) throw new Error(error.message);
}

export async function insertLessonAttempt(
  supabase: Supabase,
  studentProfileId: string,
  lessonId: string,
  assessmentType: AssessmentType,
  scorePct: number,
  passed: boolean,
  answers: unknown[],
  metadata?: Record<string, unknown>,
) {
  const { error } = await supabase.from("lesson_assessment_attempts").insert({
    student_id: studentProfileId,
    lesson_id: lessonId,
    assessment_type: assessmentType,
    score_pct: scorePct,
    passed,
    answers,
    metadata: metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

export type LatestLessonAttempt = {
  createdAt: string | null;
  metadata: Record<string, unknown>;
};

export async function fetchLatestLessonAttempt(
  supabase: Supabase,
  studentProfileId: string,
  lessonId: string,
  assessmentType: AssessmentType,
): Promise<LatestLessonAttempt | null> {
  const { data, error } = await supabase
    .from("lesson_assessment_attempts")
    .select("created_at, metadata")
    .eq("student_id", studentProfileId)
    .eq("lesson_id", lessonId)
    .eq("assessment_type", assessmentType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    createdAt: (data.created_at as string | null) ?? null,
    metadata: (data.metadata as Record<string, unknown> | null) ?? {},
  };
}
