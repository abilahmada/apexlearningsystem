import type { AssessmentType } from "@/lib/learning/lesson-assessment";

export type QuizRowShape = {
  questions?: unknown;
  questions_pre?: unknown;
  questions_post?: unknown;
};

/**
 * PRE memakai questions_pre jika ada isi; POST memakai questions_post jika ada.
 * Selain itu fallback ke kolom legacy `questions` (kompatibel data lama).
 */
export function pickQuestionsForAssessment(
  row: QuizRowShape,
  assessmentType: AssessmentType,
): Array<Record<string, unknown>> {
  if (assessmentType === "PRE") {
    const pre = row.questions_pre;
    if (Array.isArray(pre) && pre.length > 0) return pre as Array<Record<string, unknown>>;
  } else {
    const post = row.questions_post;
    if (Array.isArray(post) && post.length > 0) return post as Array<Record<string, unknown>>;
  }
  const legacy = row.questions;
  return Array.isArray(legacy) ? (legacy as Array<Record<string, unknown>>) : [];
}
