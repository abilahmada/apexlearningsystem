import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import {
  assessmentLayerForPhase,
  resolvePlacementProductPhase,
  type AssessmentSessionStatus,
  type PlacementProductPhase,
} from "@/lib/assessment/placement-lifecycle";

type GradeApi = "SD" | "SMP" | "SMK";

function parseGrade(raw: string | null): GradeApi | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  if (t === "SD" || t === "SMP" || t === "SMK") return t;
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
      // Backward compatibility untuk metadata lama.
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

function parseModulePhaseNumber(metadata: Record<string, unknown>): number {
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
  const rounded = Math.max(1, Math.round(n));
  return Number.isFinite(rounded) ? rounded : null;
}

function parseBool(raw: string | null): boolean {
  if (!raw) return false;
  const t = raw.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

type ModulesViewMode = "default" | "todayOnly" | "progression-only";

function parseViewMode(raw: string | null): ModulesViewMode {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (t === "todayonly" || t === "today_only" || t === "today-only") return "todayOnly";
  if (t === "progression-only" || t === "progression_only" || t === "progressiononly") {
    return "progression-only";
  }
  return "default";
}

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

function normalizeDayKey(raw: unknown): DayKey | null {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === "mon" || t === "monday" || t === "senin") return "mon";
  if (t === "tue" || t === "tuesday" || t === "selasa") return "tue";
  if (t === "wed" || t === "wednesday" || t === "rabu") return "wed";
  if (t === "thu" || t === "thursday" || t === "kamis") return "thu";
  if (t === "fri" || t === "friday" || t === "jumat" || t === "jum'at") return "fri";
  if (t === "sat" || t === "saturday" || t === "sabtu") return "sat";
  if (t === "sun" || t === "sunday" || t === "minggu") return "sun";
  return null;
}

function normalizeScheduleDays(raw: unknown): DayKey[] {
  if (!Array.isArray(raw)) return [];
  const out: DayKey[] = [];
  for (const item of raw) {
    const key = normalizeDayKey(item);
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

function todayKeyFromDate(d: Date): DayKey {
  const day = d.getDay(); // 0=Sun .. 6=Sat
  return DAY_KEYS[(day + 6) % 7];
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const url = new URL(req.url);
    const requestedGrade = parseGrade(url.searchParams.get("grade"));
    const includeLessons = parseBool(url.searchParams.get("withLessons"));
    const todayOnly = parseBool(url.searchParams.get("todayOnly"));
    const mode = parseViewMode(url.searchParams.get("mode"));

    const { data: studentProfile, error: studentErr } = await auth.supabase
      .from("student_profiles")
      .select("id, grade_level, placement_phase")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (studentErr || !studentProfile) {
      return Response.json({ message: "Student profile tidak ditemukan." }, { status: 404 });
    }
    const dbGrade = parseGrade(String(studentProfile.grade_level ?? ""));
    if (!dbGrade) {
      return Response.json({ message: "grade_level student tidak valid." }, { status: 400 });
    }
    if (requestedGrade && requestedGrade !== dbGrade) {
      return Response.json(
        {
          message: "Akses modul dibatasi sesuai jenjang siswa di profil.",
          effectiveGrade: dbGrade,
        },
        { status: 403 },
      );
    }

    const { data: session } = await auth.supabase
      .from("assessment_sessions")
      .select("status, sessions_completed, parent_validated_at, placement_locked_at, last_continuous_review_at")
      .eq("user_id", auth.userId)
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

    const { data: courses, error: courseErr } = await auth.supabase
      .from("courses")
      .select("id, title, grade_level")
      .eq("grade_level", dbGrade)
      .order("title", { ascending: true });
    if (courseErr) return Response.json({ message: courseErr.message }, { status: 500 });
    const courseIds = (courses ?? []).map((c) => String(c.id));

    if (courseIds.length === 0) return Response.json({ items: [] });

    const { data: modules, error: moduleErr } = await auth.supabase
      .from("modules")
      .select("id, course_id, title, sequence_order, mastery_threshold, metadata")
      .in("course_id", courseIds)
      .order("sequence_order", { ascending: true });
    if (moduleErr) return Response.json({ message: moduleErr.message }, { status: 500 });

    const assessmentFiltered = (modules ?? []).filter((m) => {
      const meta =
        m.metadata && typeof m.metadata === "object"
          ? (m.metadata as Record<string, unknown>)
          : {};
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
    const enriched = assessmentFiltered.map((m, idx) => {
      const metadata =
        m.metadata && typeof m.metadata === "object"
          ? (m.metadata as Record<string, unknown>)
          : {};
      const phaseKey = String(metadata.phase ?? "Phase 1").trim() || "Phase 1";
      const phaseOrder = parseModulePhaseNumber(metadata);
      if (!phaseFirstSeen.has(phaseKey)) phaseFirstSeen.set(phaseKey, idx);
      return {
        row: m,
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
    const { data: lessons, error: lessonErr } = await auth.supabase
      .from("lessons")
      .select("id, module_id")
      .in("module_id", moduleIds.length > 0 ? moduleIds : ["00000000-0000-0000-0000-000000000000"]);
    if (lessonErr) return Response.json({ message: lessonErr.message }, { status: 500 });

    const lessonIds = (lessons ?? []).map((l) => String(l.id));
    const { data: progressRows, error: progressErr } = await auth.supabase
      .from("lesson_progress")
      .select("lesson_id, pretest_score, posttest_score, posttest_passed")
      .eq("student_id", String(studentProfile.id))
      .in("lesson_id", lessonIds.length > 0 ? lessonIds : ["00000000-0000-0000-0000-000000000000"]);
    if (progressErr) return Response.json({ message: progressErr.message }, { status: 500 });

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
    const phaseProgress: Array<{
      phase: string;
      unlocked: boolean;
      avgPosttestScore: number;
      totalLessons: number;
      scoredLessons: number;
      passedForNext: boolean;
    }> = [];

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
      const passedForNext =
        stats.totalLessons === 0 || stats.passedCount === stats.totalLessons;
      const phaseNumber = phaseOrderByKey.get(phase) ?? i + 1;
      const isBaselineUnlocked = phaseNumber <= placementBaselinePhase;
      const unlocked: boolean = isBaselineUnlocked || previousPassed;
      if (unlocked) unlockedPhaseSet.add(phase);
      phaseProgress.push({
        phase,
        unlocked,
        avgPosttestScore: avg,
        totalLessons: stats.totalLessons,
        scoredLessons: stats.scoredLessons,
        passedForNext,
      });
      previousPassed = unlocked && passedForNext;
    }

    const phaseGatedItems = enriched.filter((x) => unlockedPhaseSet.has(x.phaseKey));
    const baseItemsForVisibility = enriched;

    const lessonByModule = new Map<
      string,
      Array<{
        id: string;
        title: string;
        pretestScore: number | null;
        posttestScore: number | null;
        posttestPassed: boolean;
      }>
    >();
    const passedCountByModule = new Map<string, number>();
    const totalCountByModule = new Map<string, number>();
    for (const lesson of lessons ?? []) {
      const moduleId = String(lesson.module_id);
      const prog = lessonProgressByLesson.get(String(lesson.id));
      const score = prog?.posttestScore ?? null;
      const preScore = prog?.pretestScore ?? null;
      const passed = Boolean(prog?.posttestPassed);
      const arr = lessonByModule.get(moduleId) ?? [];
      arr.push({
        id: String(lesson.id),
        title: "",
        pretestScore: typeof preScore === "number" ? preScore : null,
        posttestScore: typeof score === "number" ? score : null,
        posttestPassed: passed,
      });
      lessonByModule.set(moduleId, arr);
      totalCountByModule.set(moduleId, (totalCountByModule.get(moduleId) ?? 0) + 1);
      if (passed) passedCountByModule.set(moduleId, (passedCountByModule.get(moduleId) ?? 0) + 1);
    }

    if (includeLessons) {
      const { data: lessonRows, error: lessonRowsErr } = await auth.supabase
        .from("lessons")
        .select("id, module_id, title")
        .in("module_id", moduleIds.length > 0 ? moduleIds : ["00000000-0000-0000-0000-000000000000"])
        .order("title", { ascending: true })
        .order("id", { ascending: true });
      if (lessonRowsErr) return Response.json({ message: lessonRowsErr.message }, { status: 500 });
      for (const row of lessonRows ?? []) {
        const moduleId = String(row.module_id);
        const arr = lessonByModule.get(moduleId) ?? [];
        const idx = arr.findIndex((x) => x.id === String(row.id));
        const progRow = lessonProgressByLesson.get(String(row.id));
        const base = {
          id: String(row.id),
          title: String(row.title ?? ""),
          pretestScore: typeof progRow?.pretestScore === "number" ? progRow.pretestScore : null,
          posttestScore: typeof progRow?.posttestScore === "number" ? progRow.posttestScore : null,
          posttestPassed: Boolean(progRow?.posttestPassed),
        };
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], title: base.title };
        } else {
          arr.push(base);
          totalCountByModule.set(moduleId, (totalCountByModule.get(moduleId) ?? 0) + 1);
        }
        lessonByModule.set(moduleId, arr);
      }
    }

    const effectiveTodayKey = todayKeyFromDate(new Date());
    const scheduleOnly = mode === "todayOnly" || (mode === "default" && todayOnly);
    const visibleItems = baseItemsForVisibility.filter((x) => {
      if (!scheduleOnly) return true;
      const days = normalizeScheduleDays(x.metadata.scheduleDays);
      // todayOnly mode is strict: module must explicitly include today's day key.
      return days.length > 0 && days.includes(effectiveTodayKey);
    });

    return Response.json({
      effectiveGrade: dbGrade,
      assessmentPhase: productPhase,
      assessmentLayer,
      placementBaselinePhase,
      placementBaselineSource: placementPhaseFromProfile != null ? "student_profile" : "assessment_session",
      todayKey: effectiveTodayKey,
      viewMode: mode === "default" ? (scheduleOnly ? "todayOnly" : "progression-only") : mode,
      phaseProgress,
      items: visibleItems.map((m) => ({
        id: String(m.row.id),
        courseId: String(m.row.course_id),
        title: String(m.row.title ?? ""),
        sequenceOrder: Number(m.row.sequence_order ?? 0),
        masteryThreshold: Number(m.row.mastery_threshold ?? 80),
        metadata: m.metadata,
        unlocked: phaseGatedItems.some((x) => String(x.row.id) === String(m.row.id)),
        lockReason: phaseGatedItems.some((x) => String(x.row.id) === String(m.row.id))
          ? null
          : "PHASE_LOCKED",
        progress: {
          totalLessons: totalCountByModule.get(String(m.row.id)) ?? 0,
          passedLessons: passedCountByModule.get(String(m.row.id)) ?? 0,
          completionPct:
            (totalCountByModule.get(String(m.row.id)) ?? 0) > 0
              ? Math.round(
                  (((passedCountByModule.get(String(m.row.id)) ?? 0) /
                    (totalCountByModule.get(String(m.row.id)) ?? 1)) *
                    100 +
                    Number.EPSILON) *
                    100,
                ) / 100
              : 0,
        },
        lessons: includeLessons ? lessonByModule.get(String(m.row.id)) ?? [] : undefined,
      })),
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
