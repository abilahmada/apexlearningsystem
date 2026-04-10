import type { AssessmentType } from "@/lib/learning/lesson-assessment";

export const PRE_REQUIRED_REASON = "PRE_REQUIRED" as const;

export function hasCompletedPretest(pretestScore: number | null | undefined): boolean {
  return typeof pretestScore === "number" && Number.isFinite(pretestScore);
}

export function shouldBlockPostAssessment(
  assessmentType: AssessmentType,
  pretestScore: number | null | undefined,
): boolean {
  if (assessmentType !== "POST") return false;
  return !hasCompletedPretest(pretestScore);
}

