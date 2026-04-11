import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";
import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import {
  effectiveModuleScheduleDayKeys,
  todayScheduleKeyFromDate,
} from "@/lib/learning/module-schedule-days";
import { fetchStudentScheduleSlots, slotsForDay } from "@/lib/learning/student-learning-schedule";
import {
  fetchStudentModulePhaseContext,
  isModuleUnlockedByPhaseEntry,
  parseModulePhaseNumber,
  parseStudentGrade,
} from "@/lib/learning/student-module-phase-context";

function parseBool(raw: string | null): boolean {
  if (!raw) return false;
  const t = raw.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

function formatSubjectDisplay(metadata: Record<string, unknown>): string {
  const s = String(metadata.subject ?? "").trim();
  if (!s) return "";
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function lessonPosttestAggregates(
  lessons: Array<{ posttestScore: number | null; posttestPassed: boolean }>,
): { avgPosttestPct: number | null; studyPointsTotal: number } {
  let sum = 0;
  let n = 0;
  let pointsSum = 0;
  for (const le of lessons) {
    const sc = le.posttestScore;
    if (typeof sc === "number" && Number.isFinite(sc)) {
      sum += sc;
      n += 1;
      if (le.posttestPassed) pointsSum += Math.round(sc);
    }
  }
  const avgPosttestPct = n > 0 ? Math.round((sum / n) * 10) / 10 : null;
  const studyPointsTotal = Math.max(0, Math.round(pointsSum));
  return { avgPosttestPct, studyPointsTotal };
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

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonPrivateNoStore({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });

    const url = new URL(req.url);
    const requestedGrade = parseStudentGrade(url.searchParams.get("grade"));
    const includeLessons = parseBool(url.searchParams.get("withLessons"));
    const todayOnly = parseBool(url.searchParams.get("todayOnly"));
    const catalogMode = parseBool(url.searchParams.get("catalog"));
    const mode = parseViewMode(url.searchParams.get("mode"));

    const phaseRes = await fetchStudentModulePhaseContext(auth.supabase, auth.userId, {
      catalogMode,
    });
    if (!phaseRes.ok) {
      return jsonPrivateNoStore({ message: phaseRes.message }, { status: phaseRes.status });
    }
    const ctx = phaseRes.context;
    const { studentProfile, dbGrade, enriched, phaseGatedItems, phaseProgress, productPhase } = ctx;

    if (requestedGrade && requestedGrade !== dbGrade) {
      return jsonPrivateNoStore(
        {
          message: "Akses modul dibatasi sesuai jenjang siswa di profil.",
          effectiveGrade: dbGrade,
        },
        { status: 403 },
      );
    }

    if (ctx.moduleIds.length === 0) {
      return jsonPrivateNoStore({ items: [] });
    }

    const confirmationByModule = new Map<string, string>();
    const confRes = await auth.supabase
      .from("student_module_study_confirmations")
      .select("module_id, confirmed_at")
      .eq("student_id", String(studentProfile.id))
      .in(
        "module_id",
        ctx.moduleIds.length > 0 ? ctx.moduleIds : ["00000000-0000-0000-0000-000000000000"],
      );
    if (!confRes.error && confRes.data) {
      for (const row of confRes.data) {
        confirmationByModule.set(String(row.module_id), String(row.confirmed_at ?? ""));
      }
    }

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

    for (const lesson of ctx.lessons) {
      const moduleId = String(lesson.module_id);
      const prog = ctx.lessonProgressByLesson.get(String(lesson.id));
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
        .in(
          "module_id",
          ctx.moduleIds.length > 0 ? ctx.moduleIds : ["00000000-0000-0000-0000-000000000000"],
        )
        .order("title", { ascending: true })
        .order("id", { ascending: true });
      if (lessonRowsErr) return jsonPrivateNoStore({ message: lessonRowsErr.message }, { status: 500 });
      for (const row of lessonRows ?? []) {
        const moduleId = String(row.module_id);
        const arr = lessonByModule.get(moduleId) ?? [];
        const idx = arr.findIndex((x) => x.id === String(row.id));
        const progRow = ctx.lessonProgressByLesson.get(String(row.id));
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

    const effectiveTodayKey = todayScheduleKeyFromDate(new Date());
    const scheduleOnly =
      !catalogMode && (mode === "todayOnly" || (mode === "default" && todayOnly));

    const slotLoad = await fetchStudentScheduleSlots(auth.supabase, String(studentProfile.id));
    const customSlotsToday =
      slotLoad.ok && slotLoad.rows.length > 0 ? slotsForDay(slotLoad.rows, effectiveTodayKey) : [];

    const lessonsAllPassed = (moduleId: string) => {
      const total = totalCountByModule.get(moduleId) ?? 0;
      const passed = passedCountByModule.get(moduleId) ?? 0;
      return total > 0 && passed >= total;
    };

    const studyConfirmedAt = (moduleId: string) => confirmationByModule.get(moduleId) ?? null;

    const isHubArchiveCompleted = (moduleId: string) =>
      Boolean(studyConfirmedAt(moduleId)) && lessonsAllPassed(moduleId);

    const baseItemsForVisibility = enriched;

    let visibleItems = baseItemsForVisibility.filter((x) => {
      if (!scheduleOnly) return true;
      const moduleId = String(x.row.id);
      if (!isModuleUnlockedByPhaseEntry(x, phaseGatedItems)) return false;
      if (isHubArchiveCompleted(moduleId)) return false;
      if (customSlotsToday.length > 0) {
        return customSlotsToday.some((s) => s.module_id === moduleId);
      }
      const days = effectiveModuleScheduleDayKeys(x.metadata, Number(x.row.sequence_order ?? 0));
      return days.includes(effectiveTodayKey);
    });

    if (scheduleOnly && customSlotsToday.length > 0) {
      const order = new Map<string, number>();
      for (let i = 0; i < customSlotsToday.length; i += 1) {
        order.set(String(customSlotsToday[i].module_id), customSlotsToday[i].slot_order ?? i);
      }
      visibleItems = [...visibleItems].sort(
        (a, b) =>
          (order.get(String(a.row.id)) ?? 999) - (order.get(String(b.row.id)) ?? 999),
      );
    }

    if (scheduleOnly && visibleItems.length === 0) {
      const filler = [...baseItemsForVisibility]
        .filter((x) => {
          const id = String(x.row.id);
          if (!isModuleUnlockedByPhaseEntry(x, phaseGatedItems)) return false;
          if (isHubArchiveCompleted(id)) return false;
          return true;
        })
        .sort((a, b) => Number(a.row.sequence_order ?? 0) - Number(b.row.sequence_order ?? 0))[0];
      if (filler) visibleItems = [filler];
    }

    const uniqueCourseIds = [...new Set(visibleItems.map((x) => String(x.row.course_id)))];
    const { data: courseRows, error: courseRowErr } = await auth.supabase
      .from("courses")
      .select("id, title")
      .in(
        "id",
        uniqueCourseIds.length > 0 ? uniqueCourseIds : ["00000000-0000-0000-0000-000000000000"],
      );
    if (courseRowErr) return jsonPrivateNoStore({ message: courseRowErr.message }, { status: 500 });
    const courseTitleById = new Map<string, string>(
      (courseRows ?? []).map((c) => [String(c.id), String(c.title ?? "")]),
    );

    return jsonPrivateNoStore({
      effectiveGrade: dbGrade,
      assessmentPhase: productPhase,
      assessmentLayer: ctx.assessmentLayer,
      placementBaselinePhase: ctx.placementBaselinePhase,
      placementBaselineSource:
        ctx.placementPhaseFromProfile != null ? "student_profile" : "assessment_session",
      todayKey: effectiveTodayKey,
      catalogMode,
      viewMode: mode === "default" ? (scheduleOnly ? "todayOnly" : "progression-only") : mode,
      phaseProgress,
      items: visibleItems.map((m) => {
        const moduleId = String(m.row.id);
        const phaseUnlocked = isModuleUnlockedByPhaseEntry(m, phaseGatedItems);
        const unlocked = phaseUnlocked;
        const lockReason = unlocked ? null : "PHASE_LOCKED";
        const totalL = totalCountByModule.get(moduleId) ?? 0;
        const passedL = passedCountByModule.get(moduleId) ?? 0;
        const allPassed = totalL > 0 && passedL >= totalL;
        const confirmedIso = studyConfirmedAt(moduleId);
        const completed = Boolean(confirmedIso) && allPassed;
        const courseTitle = courseTitleById.get(String(m.row.course_id)) ?? "";
        const subjectFmt = formatSubjectDisplay(m.metadata);
        const subjectDisplay = subjectFmt || courseTitle;
        const lessonsList = includeLessons ? lessonByModule.get(moduleId) ?? [] : [];
        const { avgPosttestPct, studyPointsTotal } = lessonPosttestAggregates(lessonsList);
        const phaseLevel = parseModulePhaseNumber(m.metadata);
        return {
          id: moduleId,
          courseId: String(m.row.course_id),
          courseTitle,
          subjectDisplay,
          phaseLevel,
          title: String(m.row.title ?? ""),
          sequenceOrder: Number(m.row.sequence_order ?? 0),
          masteryThreshold: Number(m.row.mastery_threshold ?? 80),
          metadata: m.metadata,
          unlocked,
          lockReason,
          lessonsAllPassed: allPassed,
          studyConfirmedAt: confirmedIso,
          completed,
          avgPosttestPct,
          studyPointsTotal,
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
          lessons: includeLessons ? lessonsList : undefined,
        };
      }),
    });
  } catch (error) {
    return jsonPrivateNoStore(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
