/**
 * Satu sumber kebenaran untuk unlock modul per fase (level 1 + progression + rata-rata post ≥ 80).
 * Dipakai GET /api/learning/modules dan /api/learning/lesson-assessment.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assessmentLayerForPhase,
  resolvePlacementProductPhase,
  type AssessmentSessionStatus,
  type PlacementProductPhase,
} from "@/lib/assessment/placement-lifecycle";

export const PHASE_PROGRESS_AVG_POST_THRESHOLD = 80;

type GradeApi = "SD" | "SMP" | "SMA" | "SMK";

export function parseStudentGrade(raw: string | null): GradeApi | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  if (t === "SD" || t === "SMP" || t === "SMA" || t === "SMK") return t;
  return null;
}

type ModuleAllowedPhase =
  | "BASELINE"
  | "CALIBRATION_ACTIVE"
  | "PARENT_VALIDATION_PENDING"
  | "PLACEMENT_STABLE"
  | "CONTINUOUS_REVIEW_DUE"
  | "L1_INTAKE"
  | "L2_CALIBRATION"
  | "L3_RADAR_PROVISIONAL"
  | "L4_PARENT_VALIDATION_PENDING";

function normalizePhaseList(raw: unknown): ModuleAllowedPhase[] {
  if (!Array.isArray(raw)) return [];
  const out: ModuleAllowedPhase[] = [];
  for (const x of raw) {
    const t = String(x ?? "").trim().toUpperCase();
    if (
      t === "BASELINE" ||
      t === "CALIBRATION_ACTIVE" ||
      t === "PARENT_VALIDATION_PENDING" ||
      t === "PLACEMENT_STABLE" ||
      t === "CONTINUOUS_REVIEW_DUE" ||
      t === "L1_INTAKE" ||
      t === "L2_CALIBRATION" ||
      t === "L3_RADAR_PROVISIONAL" ||
      t === "L4_PARENT_VALIDATION_PENDING"
    ) {
      out.push(t as ModuleAllowedPhase);
    }
  }
  return out;
}

function normalizeCurrentPhaseForMetadata(phase: PlacementProductPhase): ModuleAllowedPhase {
  switch (phase) {
    case "L1_INTAKE":
      return "L1_INTAKE";
    case "L2_CALIBRATION":
    case "L3_RADAR_PROVISIONAL":
      return "CALIBRATION_ACTIVE";
    case "L4_PARENT_VALIDATION_PENDING":
      return "PARENT_VALIDATION_PENDING";
    case "PLACEMENT_STABLE":
      return "PLACEMENT_STABLE";
    case "CONTINUOUS_REVIEW_DUE":
      return "CONTINUOUS_REVIEW_DUE";
  }
}

function parsePhaseOrder(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.round(n));
}

export function parseModulePhaseNumber(metadata: Record<string, unknown>): number {
  const numeric =
    parsePhaseOrder(metadata.phaseOrder) ??
    parsePhaseOrder(metadata.phase_order) ??
    parsePhaseOrder(metadata.phase);
  if (numeric) return numeric;
  const phaseText = String(metadata.phase ?? "").trim();
  const m = phaseText.match(/(\d+)/);
  if (m) return Math.max(1, Number(m[1]));
  return 1;
}

export function isPhaseOneModule(metadata: Record<string, unknown>): boolean {
  return parseModulePhaseNumber(metadata) <= 1;
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

function parsePlacementPhase(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.round(n));
}

function isMissingColumnError(message: string | undefined, column: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  const col = column.toLowerCase();
  return (
    m.includes(col) &&
    (m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find"))
  );
}

export type StudentProfileRow = {
  id: string;
  grade_level: unknown;
  placement_phase?: unknown;
};

export type EnrichedModuleRow = {
  row: {
    id: string;
    course_id: string;
    title: string;
    sequence_order: number | null;
    mastery_threshold: number | null;
    metadata: unknown;
  };
  metadata: Record<string, unknown>;
  phaseKey: string;
  phaseOrder: number;
  phaseSeenIndex: number;
};

export type StudentLearningModulePhaseContext = {
  studentProfile: StudentProfileRow;
  dbGrade: GradeApi;
  productPhase: PlacementProductPhase;
  assessmentLayer: number;
  placementBaselinePhase: number;
  placementPhaseFromProfile: number | null;
  metadataCurrentPhase: ModuleAllowedPhase;
  enriched: EnrichedModuleRow[];
  phaseGatedItems: EnrichedModuleRow[];
  phaseProgress: Array<{
    phase: string;
    unlocked: boolean;
    avgPosttestScore: number;
    totalLessons: number;
    scoredLessons: number;
    passedForNext: boolean;
  }>;
  lessonProgressByLesson: Map<
    string,
    { pretestScore: number | null; posttestScore: number | null; posttestPassed: boolean }
  >;
  lessons: Array<{ id: string; module_id: string }>;
  moduleIds: string[];
  unlockedModuleIds: Set<string>;
};

export function isModuleUnlockedByPhaseEntry(
  entry: EnrichedModuleRow,
  phaseGatedItems: EnrichedModuleRow[],
): boolean {
  return (
    isPhaseOneModule(entry.metadata) ||
    phaseGatedItems.some((g) => String(g.row.id) === String(entry.row.id))
  );
}

export function buildUnlockedModuleIdSet(
  enriched: EnrichedModuleRow[],
  phaseGatedItems: EnrichedModuleRow[],
): Set<string> {
  const s = new Set<string>();
  for (const e of enriched) {
    if (isModuleUnlockedByPhaseEntry(e, phaseGatedItems)) {
      s.add(String(e.row.id));
    }
  }
  return s;
}

export async function fetchStudentModulePhaseContext(
  supabase: SupabaseClient,
  userId: string,
  options: { catalogMode: boolean },
): Promise<
  | { ok: true; context: StudentLearningModulePhaseContext }
  | { ok: false; message: string; status: number }
> {
  const catalogMode = options.catalogMode;

  let studentProfile: StudentProfileRow | null = null;
  let studentErr: { message?: string } | null = null;
  const full = await supabase
    .from("student_profiles")
    .select("id, grade_level, placement_phase")
    .eq("user_id", userId)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (full.error && isMissingColumnError(full.error.message, "placement_phase")) {
    const minimal = await supabase
      .from("student_profiles")
      .select("id, grade_level")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    studentProfile = minimal.data as StudentProfileRow | null;
    studentErr = minimal.error;
  } else {
    studentProfile = full.data as StudentProfileRow | null;
    studentErr = full.error;
  }
  if (studentErr || !studentProfile) {
    return { ok: false, message: "Student profile tidak ditemukan.", status: 404 };
  }
  const dbGrade = parseStudentGrade(String(studentProfile.grade_level ?? ""));
  if (!dbGrade) {
    return { ok: false, message: "grade_level student tidak valid.", status: 400 };
  }

  const { data: session } = await supabase
    .from("assessment_sessions")
    .select("status, sessions_completed, parent_validated_at, placement_locked_at, last_continuous_review_at")
    .eq("user_id", userId)
    .maybeSingle();

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
  const metadataCurrentPhase = normalizeCurrentPhaseForMetadata(productPhase);
  const assessmentLayer = assessmentLayerForPhase(productPhase);
  const placementPhaseFromProfile = parsePlacementPhase(studentProfile.placement_phase);
  const placementBaselinePhase =
    placementPhaseFromProfile ?? placementBaselinePhaseFromProductPhase(productPhase);

  const { data: courses, error: courseErr } = await supabase
    .from("courses")
    .select("id, title, grade_level")
    .eq("grade_level", dbGrade)
    .order("title", { ascending: true });
  if (courseErr) return { ok: false, message: courseErr.message, status: 500 };
  const courseIds = (courses ?? []).map((c) => String(c.id));
  if (courseIds.length === 0) {
    return {
      ok: true,
      context: {
        studentProfile,
        dbGrade,
        productPhase,
        assessmentLayer,
        placementBaselinePhase,
        placementPhaseFromProfile,
        metadataCurrentPhase,
        enriched: [],
        phaseGatedItems: [],
        phaseProgress: [],
        lessonProgressByLesson: new Map(),
        lessons: [],
        moduleIds: [],
        unlockedModuleIds: new Set(),
      },
    };
  }

  const { data: modules, error: moduleErr } = await supabase
    .from("modules")
    .select("id, course_id, title, sequence_order, mastery_threshold, metadata")
    .in("course_id", courseIds)
    .order("sequence_order", { ascending: true });
  if (moduleErr) return { ok: false, message: moduleErr.message, status: 500 };

  const assessmentFiltered = (modules ?? []).filter((m) => {
    if (catalogMode) return true;
    const meta =
      m.metadata && typeof m.metadata === "object" ? (m.metadata as Record<string, unknown>) : {};
    const minLayer = Number(meta.minAssessmentLayer ?? 0);
    if (Number.isFinite(minLayer) && minLayer > 0 && assessmentLayer < minLayer) {
      return false;
    }
    const allowedPhases = normalizePhaseList(meta.allowedProductPhases);
    if (allowedPhases.length > 0 && !allowedPhases.includes(metadataCurrentPhase)) {
      return false;
    }
    return true;
  });

  const phaseFirstSeen = new Map<string, number>();
  const enriched: EnrichedModuleRow[] = assessmentFiltered.map((m, idx) => {
    const metadata =
      m.metadata && typeof m.metadata === "object" ? (m.metadata as Record<string, unknown>) : {};
    const phaseKey = String(metadata.phase ?? "Phase 1").trim() || "Phase 1";
    const phaseOrder = parseModulePhaseNumber(metadata);
    if (!phaseFirstSeen.has(phaseKey)) phaseFirstSeen.set(phaseKey, idx);
    return {
      row: {
        id: String(m.id),
        course_id: String(m.course_id),
        title: String(m.title ?? ""),
        sequence_order: m.sequence_order as number | null,
        mastery_threshold: m.mastery_threshold as number | null,
        metadata: m.metadata,
      },
      metadata,
      phaseKey,
      phaseOrder,
      phaseSeenIndex: phaseFirstSeen.get(phaseKey) ?? idx,
    };
  });

  enriched.sort((a, b) => {
    const ao = a.phaseOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.phaseOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    if (a.phaseSeenIndex !== b.phaseSeenIndex) return a.phaseSeenIndex - b.phaseSeenIndex;
    const as = Number(a.row.sequence_order ?? 0);
    const bs = Number(b.row.sequence_order ?? 0);
    if (as !== bs) return as - bs;
    return String(a.row.title ?? "").localeCompare(String(b.row.title ?? ""));
  });

  const moduleIds = enriched.map((x) => String(x.row.id));
  const { data: lessons, error: lessonErr } = await supabase
    .from("lessons")
    .select("id, module_id")
    .in("module_id", moduleIds.length > 0 ? moduleIds : ["00000000-0000-0000-0000-000000000000"]);
  if (lessonErr) return { ok: false, message: lessonErr.message, status: 500 };

  const lessonIds = (lessons ?? []).map((l) => String(l.id));
  const { data: progressRows, error: progressErr } = await supabase
    .from("lesson_progress")
    .select("lesson_id, pretest_score, posttest_score, posttest_passed")
    .eq("student_id", String(studentProfile.id))
    .in("lesson_id", lessonIds.length > 0 ? lessonIds : ["00000000-0000-0000-0000-000000000000"]);
  if (progressErr) return { ok: false, message: progressErr.message, status: 500 };

  const lessonProgressByLesson = new Map<
    string,
    { pretestScore: number | null; posttestScore: number | null; posttestPassed: boolean }
  >();
  for (const p of progressRows ?? []) {
    const lid = String(p.lesson_id);
    lessonProgressByLesson.set(lid, {
      pretestScore: typeof p.pretest_score === "number" ? Number(p.pretest_score) : null,
      posttestScore: typeof p.posttest_score === "number" ? Number(p.posttest_score) : null,
      posttestPassed: Boolean(p.posttest_passed),
    });
  }

  const moduleToPhase = new Map<string, string>();
  for (const m of enriched) moduleToPhase.set(String(m.row.id), m.phaseKey);

  const phaseStats = new Map<
    string,
    { totalLessons: number; scoredLessons: number; scoreSum: number; passedCount: number }
  >();
  for (const lesson of lessons ?? []) {
    const phaseKey = moduleToPhase.get(String(lesson.module_id));
    if (!phaseKey) continue;
    const current = phaseStats.get(phaseKey) ?? {
      totalLessons: 0,
      scoredLessons: 0,
      scoreSum: 0,
      passedCount: 0,
    };
    current.totalLessons += 1;
    const prog = lessonProgressByLesson.get(String(lesson.id));
    const score = prog?.posttestScore ?? null;
    if (typeof score === "number") {
      current.scoredLessons += 1;
      current.scoreSum += score;
    }
    if (prog?.posttestPassed) current.passedCount += 1;
    phaseStats.set(phaseKey, current);
  }

  const orderedPhases: string[] = [];
  const phaseOrderByKey = new Map<string, number>();
  for (const m of enriched) {
    if (!orderedPhases.includes(m.phaseKey)) orderedPhases.push(m.phaseKey);
    if (!phaseOrderByKey.has(m.phaseKey)) {
      phaseOrderByKey.set(m.phaseKey, m.phaseOrder ?? 1);
    }
  }

  const unlockedPhaseSet = new Set<string>();
  const phaseProgress: StudentLearningModulePhaseContext["phaseProgress"] = [];

  let previousPassed: boolean = true;
  for (let i = 0; i < orderedPhases.length; i += 1) {
    const phase = orderedPhases[i];
    const stats = phaseStats.get(phase) ?? {
      totalLessons: 0,
      scoredLessons: 0,
      scoreSum: 0,
      passedCount: 0,
    };
    const avg =
      stats.scoredLessons > 0 ? Math.round((stats.scoreSum / stats.scoredLessons) * 100) / 100 : 0;
    const allLessonsPostPassed =
      stats.totalLessons === 0 || stats.passedCount === stats.totalLessons;
    const allLessonsHavePostScore =
      stats.totalLessons === 0 || stats.scoredLessons >= stats.totalLessons;
    const averageMeetsPhaseThreshold =
      stats.totalLessons === 0 ||
      (allLessonsHavePostScore && avg >= PHASE_PROGRESS_AVG_POST_THRESHOLD);
    const passedForNext = allLessonsPostPassed && averageMeetsPhaseThreshold;
    const phaseNumber = phaseOrderByKey.get(phase) ?? i + 1;
    const isBaselineUnlocked = phaseNumber <= placementBaselinePhase;
    const phaseRowUnlocked: boolean = isBaselineUnlocked || previousPassed;
    if (phaseRowUnlocked) unlockedPhaseSet.add(phase);
    phaseProgress.push({
      phase,
      unlocked: phaseRowUnlocked,
      avgPosttestScore: avg,
      totalLessons: stats.totalLessons,
      scoredLessons: stats.scoredLessons,
      passedForNext,
    });
    previousPassed = phaseRowUnlocked && passedForNext;
  }

  const phaseGatedItems = enriched.filter((x) => unlockedPhaseSet.has(x.phaseKey));
  const unlockedModuleIds = buildUnlockedModuleIdSet(enriched, phaseGatedItems);

  return {
    ok: true,
    context: {
      studentProfile,
      dbGrade,
      productPhase,
      assessmentLayer,
      placementBaselinePhase,
      placementPhaseFromProfile,
      metadataCurrentPhase,
      enriched,
      phaseGatedItems,
      phaseProgress,
      lessonProgressByLesson,
      lessons: (lessons ?? []).map((l) => ({ id: String(l.id), module_id: String(l.module_id) })),
      moduleIds,
      unlockedModuleIds,
    },
  };
}
