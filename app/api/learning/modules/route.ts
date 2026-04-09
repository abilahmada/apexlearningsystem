import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import {
  assessmentLayerForPhase,
  resolvePlacementProductPhase,
  type AssessmentSessionStatus,
} from "@/lib/assessment/placement-lifecycle";

type GradeApi = "SD" | "SMP" | "SMK";

function parseGrade(raw: string | null): GradeApi | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  if (t === "SD" || t === "SMP" || t === "SMK") return t;
  return null;
}

type ProductPhase =
  | "BASELINE"
  | "CALIBRATION_ACTIVE"
  | "PARENT_VALIDATION_PENDING"
  | "PLACEMENT_STABLE"
  | "CONTINUOUS_REVIEW_DUE";

function normalizePhaseList(raw: unknown): ProductPhase[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductPhase[] = [];
  for (const x of raw) {
    const t = String(x ?? "").trim().toUpperCase();
    if (
      t === "BASELINE" ||
      t === "CALIBRATION_ACTIVE" ||
      t === "PARENT_VALIDATION_PENDING" ||
      t === "PLACEMENT_STABLE" ||
      t === "CONTINUOUS_REVIEW_DUE"
    ) {
      out.push(t);
    }
  }
  return out;
}

function parsePhaseOrder(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.round(n));
}

function parseBool(raw: string | null): boolean {
  if (!raw) return false;
  const t = raw.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
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

    const { data: studentProfile, error: studentErr } = await auth.supabase
      .from("student_profiles")
      .select("id, grade_level")
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
    }) as ProductPhase;
    const assessmentLayer = assessmentLayerForPhase(productPhase);

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
      if (allowedPhases.length > 0 && !allowedPhases.includes(productPhase)) {
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
      const phaseOrder =
        parsePhaseOrder(metadata.phaseOrder) ?? parsePhaseOrder(metadata.phase_order);
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
      .select("lesson_id, posttest_score")
      .eq("student_id", String(studentProfile.id))
      .in("lesson_id", lessonIds.length > 0 ? lessonIds : ["00000000-0000-0000-0000-000000000000"]);
    if (progressErr) return Response.json({ message: progressErr.message }, { status: 500 });

    const posttestScoreByLesson = new Map<string, number>();
    for (const p of progressRows ?? []) {
      if (typeof p.posttest_score === "number") {
        posttestScoreByLesson.set(String(p.lesson_id), Number(p.posttest_score));
      }
    }

    const moduleToPhase = new Map<string, string>();
    for (const m of enriched) moduleToPhase.set(String(m.row.id), m.phaseKey);

    const phaseStats = new Map<string, { totalLessons: number; scoredLessons: number; scoreSum: number }>();
    for (const lesson of lessons ?? []) {
      const phaseKey = moduleToPhase.get(String(lesson.module_id));
      if (!phaseKey) continue;
      const current = phaseStats.get(phaseKey) ?? { totalLessons: 0, scoredLessons: 0, scoreSum: 0 };
      current.totalLessons += 1;
      const score = posttestScoreByLesson.get(String(lesson.id));
      if (typeof score === "number") {
        current.scoredLessons += 1;
        current.scoreSum += score;
      }
      phaseStats.set(phaseKey, current);
    }

    const orderedPhases: string[] = [];
    for (const m of enriched) {
      if (!orderedPhases.includes(m.phaseKey)) orderedPhases.push(m.phaseKey);
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

    let previousPassed = true;
    for (let i = 0; i < orderedPhases.length; i += 1) {
      const phase = orderedPhases[i];
      const stats = phaseStats.get(phase) ?? { totalLessons: 0, scoredLessons: 0, scoreSum: 0 };
      const avg =
        stats.scoredLessons > 0 ? Math.round((stats.scoreSum / stats.scoredLessons) * 100) / 100 : 0;
      const passedForNext =
        stats.totalLessons === 0 || (stats.scoredLessons === stats.totalLessons && avg >= 80);
      const unlocked = i === 0 ? true : previousPassed;
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

    const lessonByModule = new Map<
      string,
      Array<{ id: string; title: string; posttestScore: number | null; posttestPassed: boolean }>
    >();
    const passedCountByModule = new Map<string, number>();
    const totalCountByModule = new Map<string, number>();
    for (const lesson of lessons ?? []) {
      const moduleId = String(lesson.module_id);
      const score = posttestScoreByLesson.get(String(lesson.id));
      const passed = typeof score === "number" && score >= 80;
      const arr = lessonByModule.get(moduleId) ?? [];
      arr.push({
        id: String(lesson.id),
        title: "",
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
        .select("id, module_id, title, created_at")
        .in("module_id", moduleIds.length > 0 ? moduleIds : ["00000000-0000-0000-0000-000000000000"])
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (lessonRowsErr) return Response.json({ message: lessonRowsErr.message }, { status: 500 });
      for (const row of lessonRows ?? []) {
        const moduleId = String(row.module_id);
        const arr = lessonByModule.get(moduleId) ?? [];
        const idx = arr.findIndex((x) => x.id === String(row.id));
        const base = {
          id: String(row.id),
          title: String(row.title ?? ""),
          posttestScore: null as number | null,
          posttestPassed: false,
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
    const visibleBySchedule = phaseGatedItems.filter((x) => {
      if (!todayOnly) return true;
      const days = normalizeScheduleDays(x.metadata.scheduleDays);
      if (days.length === 0) return true;
      return days.includes(effectiveTodayKey);
    });

    return Response.json({
      effectiveGrade: dbGrade,
      assessmentPhase: productPhase,
      assessmentLayer,
      todayKey: effectiveTodayKey,
      phaseProgress,
      items: visibleBySchedule.map((m) => ({
        id: String(m.row.id),
        courseId: String(m.row.course_id),
        title: String(m.row.title ?? ""),
        sequenceOrder: Number(m.row.sequence_order ?? 0),
        masteryThreshold: Number(m.row.mastery_threshold ?? 80),
        metadata: m.metadata,
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
