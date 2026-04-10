import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { buildLiveCalibrationRows, type CalibrationSignalInsert } from "@/lib/assessment/learning-events";
import { APEX_LEARNING_EVENTS } from "@/lib/assessment/placement-lifecycle";
import type { CalibrationDimension } from "@/lib/calibration/engine";

type Supabase = ReturnType<typeof createSupabaseAdminClient>;

export type ModuleSessionParams = {
  userId: string;
  studentProfileId: string;
  assessmentSessionId: string;
  moduleId: string;
  moduleTitle: string;
  masteryThreshold: number;
  scorePct: number;
  lessonId?: string | null;
  dimension: CalibrationDimension;
  extraMetadata?: Record<string, unknown>;
};

export type ModuleSessionOutcome = {
  previousStatus: string;
  newStatus: string;
  highestScore: number;
  masteredJustNow: boolean;
  calibrationRows: CalibrationSignalInsert[];
};

/**
 * Memperbarui `student_progress` dan menghasilkan baris `calibration_signals` (live)
 * untuk MODULE_SESSION_END, MASTERY_THRESHOLD (jika baru mastered), ITEM_RESPONSE (jika lemah).
 */
export function computeModuleSessionOutcome(
  params: ModuleSessionParams,
  existing: { highest_score: number | null; status: string | null } | null,
): ModuleSessionOutcome {
  const threshold = Math.max(1, Math.min(100, Math.round(params.masteryThreshold)));
  const score = Math.max(0, Math.min(100, Math.round(params.scorePct)));
  const prevStatus = String(existing?.status ?? "LOCKED");
  const prevHigh = Math.max(0, Math.min(100, Number(existing?.highest_score ?? 0)));

  const newHigh = Math.max(prevHigh, score);

  let newStatus = prevStatus;
  if (prevStatus === "LOCKED" && score > 0) newStatus = "IN_PROGRESS";
  if (newHigh >= threshold) newStatus = "MASTERED";

  const masteredJustNow = newStatus === "MASTERED" && prevStatus !== "MASTERED";

  const baseMeta = {
    moduleId: params.moduleId,
    moduleTitle: params.moduleTitle,
    ...(params.lessonId ? { lessonId: params.lessonId } : {}),
    ...(params.extraMetadata ?? {}),
  };

  const rows: CalibrationSignalInsert[] = [];

  rows.push(
    ...buildLiveCalibrationRows(params.userId, params.assessmentSessionId, {
      event: APEX_LEARNING_EVENTS.MODULE_SESSION_END,
      dimension: params.dimension,
      moduleId: params.moduleId,
      lessonId: params.lessonId ?? undefined,
      scorePct: score,
      durationSeconds: null,
      metadata: { ...baseMeta, phase: "module_session" },
    }),
  );

  if (masteredJustNow) {
    rows.push(
      ...buildLiveCalibrationRows(params.userId, params.assessmentSessionId, {
        event: APEX_LEARNING_EVENTS.MASTERY_THRESHOLD,
        dimension: params.dimension,
        moduleId: params.moduleId,
        scorePct: newHigh,
        metadata: { ...baseMeta, phase: "mastery_first_pass" },
      }),
    );
  }

  if (score < 55) {
    rows.push(
      ...buildLiveCalibrationRows(params.userId, params.assessmentSessionId, {
        event: APEX_LEARNING_EVENTS.ITEM_RESPONSE,
        dimension: params.dimension,
        moduleId: params.moduleId,
        lessonId: params.lessonId ?? undefined,
        scorePct: score,
        metadata: { ...baseMeta, phase: "weak_attempt" },
      }),
    );
  }

  return {
    previousStatus: prevStatus,
    newStatus,
    highestScore: newHigh,
    masteredJustNow,
    calibrationRows: rows,
  };
}

export async function persistStudentProgress(
  supabase: Supabase,
  studentProfileId: string,
  moduleId: string,
  highestScore: number,
  status: string,
) {
  const { error } = await supabase.from("student_progress").upsert(
    {
      student_id: studentProfileId,
      module_id: moduleId,
      highest_score: highestScore,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,module_id" },
  );
  if (error) throw new Error(error.message);
}

export async function fetchModuleForSession(supabase: Supabase, moduleId: string) {
  const { data, error } = await supabase
    .from("modules")
    .select("id, title, mastery_threshold")
    .eq("id", moduleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchStudentProgressRow(
  supabase: Supabase,
  studentProfileId: string,
  moduleId: string,
) {
  const { data, error } = await supabase
    .from("student_progress")
    .select("highest_score, status")
    .eq("student_id", studentProfileId)
    .eq("module_id", moduleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
