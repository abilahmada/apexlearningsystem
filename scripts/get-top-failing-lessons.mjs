import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const topNRaw = Number(process.env.APEX_TOP_FAILING_LESSONS ?? "5");
const topN = Math.min(Math.max(Number.isFinite(topNRaw) ? topNRaw : 5, 1), 50);
const gradeFilter = String(process.env.APEX_TOP_FAILING_GRADE_LEVEL ?? "").trim();

if (!url || !serviceRoleKey) {
  console.error(
    "Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  let query = supabase
    .from("lesson_assessment_attempts")
    .select(
      "lesson_id, passed, score_pct, student_id, lessons!inner(id, title, module_id, modules!inner(id, title, course_id, courses!inner(id, grade_level)))",
    )
    .eq("assessment_type", "POST");

  if (gradeFilter) {
    query = query.eq("lessons.modules.courses.grade_level", gradeFilter);
  }

  const { data, error } = await query.limit(200000);
  if (error) throw error;

  const statsByLesson = new Map();
  for (const row of data ?? []) {
    const lessonId = String(row.lesson_id ?? "").trim();
    if (!lessonId) continue;

    const lessonRow = Array.isArray(row.lessons) ? row.lessons[0] : row.lessons;
    const moduleRow = Array.isArray(lessonRow?.modules) ? lessonRow.modules[0] : lessonRow?.modules;
    const courseRow = Array.isArray(moduleRow?.courses) ? moduleRow.courses[0] : moduleRow?.courses;

    const current =
      statsByLesson.get(lessonId) ??
      {
        lessonId,
        lessonTitle: String(lessonRow?.title ?? ""),
        moduleTitle: String(moduleRow?.title ?? ""),
        gradeLevel: String(courseRow?.grade_level ?? ""),
        failures: 0,
        failedStudents: new Set(),
        failedScoreSum: 0,
        failedScoreCount: 0,
      };

    const passed = Boolean(row.passed);
    if (!passed) {
      current.failures += 1;
      current.failedStudents.add(String(row.student_id ?? ""));
      const score = Number(row.score_pct ?? 0);
      if (Number.isFinite(score)) {
        current.failedScoreSum += score;
        current.failedScoreCount += 1;
      }
    }
    statsByLesson.set(lessonId, current);
  }

  const ranked = Array.from(statsByLesson.values())
    .filter((x) => x.failures > 0)
    .map((x) => ({
      lessonId: x.lessonId,
      lessonTitle: x.lessonTitle,
      moduleTitle: x.moduleTitle,
      gradeLevel: x.gradeLevel,
      totalFailures: x.failures,
      uniqueStudentsFailed: x.failedStudents.size,
      avgFailedScorePct:
        x.failedScoreCount > 0 ? Number((x.failedScoreSum / x.failedScoreCount).toFixed(2)) : null,
    }))
    .sort((a, b) => {
      if (b.totalFailures !== a.totalFailures) return b.totalFailures - a.totalFailures;
      if (b.uniqueStudentsFailed !== a.uniqueStudentsFailed) {
        return b.uniqueStudentsFailed - a.uniqueStudentsFailed;
      }
      const aScore = a.avgFailedScorePct ?? Number.POSITIVE_INFINITY;
      const bScore = b.avgFailedScorePct ?? Number.POSITIVE_INFINITY;
      if (aScore !== bScore) return aScore - bScore;
      return a.lessonTitle.localeCompare(b.lessonTitle);
    })
    .slice(0, topN);

  if (ranked.length === 0) {
    console.log("No failing POST attempts found.");
    return;
  }

  console.table(
    ranked.map((x) => ({
      lesson_id: x.lessonId,
      lesson_title: x.lessonTitle,
      module_title: x.moduleTitle,
      grade_level: x.gradeLevel,
      total_failures: x.totalFailures,
      unique_students_failed: x.uniqueStudentsFailed,
      avg_failed_score_pct: x.avgFailedScorePct,
    })),
  );

  const idCsv = ranked.map((x) => x.lessonId).join(",");
  console.log("\nPowerShell ready:");
  console.log(`$env:APEX_QUIZ_TARGET_LESSON_IDS = "${idCsv}"`);
}

run().catch((error) => {
  console.error("Failed to get top failing lessons:", error.message);
  process.exit(1);
});
