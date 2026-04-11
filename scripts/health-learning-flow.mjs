import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseEnvText(text) {
  const pairs = {};
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    pairs[key] = value;
  }
  return pairs;
}

async function hydrateEnvFromFiles() {
  const files = [".env.local", ".env", ".env.learning-flow.smoke", ".env.learning-flow.smoke.local"];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.resolve(process.cwd(), file), "utf-8");
      const parsed = parseEnvText(raw);
      for (const [k, v] of Object.entries(parsed)) {
        if (!process.env[k] || String(process.env[k]).trim() === "") process.env[k] = String(v);
      }
    } catch {
      // ignore missing files
    }
  }
}

function env(name) {
  return String(process.env[name] ?? "").trim();
}

function parseQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object");
}

async function callJson(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Fetch failed for ${url}: ${reason}`);
  }
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

const allowedLessonLockReasons = new Set([
  "PHASE_LOCKED",
  "LESSON_LOCKED_PREVIOUS_POST_NOT_PASSED",
  "PRE_REQUIRED",
  "LESSON_LOCKED",
]);

async function run() {
  await hydrateEnvFromFiles();

  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    console.error("Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // DB checks
  const { data: modules, error: modulesErr } = await supabase
    .from("modules")
    .select("id, title, course_id")
    .order("id", { ascending: true });
  if (modulesErr) throw modulesErr;

  const { data: lessons, error: lessonsErr } = await supabase
    .from("lessons")
    .select("id, title, module_id")
    .order("id", { ascending: true });
  if (lessonsErr) throw lessonsErr;

  const { data: quizzes, error: quizzesErr } = await supabase
    .from("quizzes")
    .select("id, lesson_id, questions_pre, questions_post")
    .order("id", { ascending: true });
  if (quizzesErr) throw quizzesErr;

  const { error: studyConfErr } = await supabase.from("student_module_study_confirmations").select("id").limit(1);
  const studyConfirmationsTableOk = !studyConfErr;
  const studyConfirmationsError = studyConfErr ? String(studyConfErr.message ?? studyConfErr) : null;

  const { error: scheduleSlotsErr } = await supabase.from("student_learning_schedule_slots").select("id").limit(1);
  const studentScheduleSlotsTableOk = !scheduleSlotsErr;
  const studentScheduleSlotsError = scheduleSlotsErr ? String(scheduleSlotsErr.message ?? scheduleSlotsErr) : null;

  const lessonsByModule = new Map();
  for (const l of lessons ?? []) {
    const key = String(l.module_id);
    const arr = lessonsByModule.get(key) ?? [];
    arr.push(l);
    lessonsByModule.set(key, arr);
  }

  const quizByLesson = new Map();
  for (const q of quizzes ?? []) {
    const key = String(q.lesson_id);
    if (!quizByLesson.has(key)) quizByLesson.set(key, []);
    quizByLesson.get(key).push(q);
  }

  const modulesWithoutLesson = [];
  for (const m of modules ?? []) {
    if ((lessonsByModule.get(String(m.id)) ?? []).length === 0) {
      modulesWithoutLesson.push({ id: m.id, title: m.title });
    }
  }

  const quizEmptyIssues = [];
  for (const l of lessons ?? []) {
    const rows = quizByLesson.get(String(l.id)) ?? [];
    if (rows.length === 0) {
      quizEmptyIssues.push({
        lessonId: l.id,
        lessonTitle: l.title,
        moduleId: l.module_id,
        issue: "MISSING_QUIZ_ROW",
      });
      continue;
    }
    const hasValid = rows.some((q) => {
      const preCount = parseQuestions(q.questions_pre).length;
      const postCount = parseQuestions(q.questions_post).length;
      return preCount > 0 && postCount > 0;
    });
    if (!hasValid) {
      quizEmptyIssues.push({
        lessonId: l.id,
        lessonTitle: l.title,
        moduleId: l.module_id,
        issue: "EMPTY_PRE_OR_POST",
      });
    }
  }

  const report = {
    totalModules: (modules ?? []).length,
    totalLessons: (lessons ?? []).length,
    totalQuizzes: (quizzes ?? []).length,
    modulesWithoutLessonCount: modulesWithoutLesson.length,
    quizEmptyIssueCount: quizEmptyIssues.length,
    lockReasonMismatchCount: 0,
    lockReasonMismatches: [],
    studyConfirmationsTableOk,
    studyConfirmationsError,
    studentScheduleSlotsTableOk,
    studentScheduleSlotsError,
    modulesWithoutLessonSample: modulesWithoutLesson.slice(0, 20),
    quizEmptyIssueSample: quizEmptyIssues.slice(0, 30),
  };

  // Optional API lock-reason consistency checks
  const baseUrl = env("APEX_FLOW_SMOKE_BASE_URL");
  const token = env("APEX_FLOW_SMOKE_TOKEN");
  if (baseUrl && token) {
    const cleanBase = baseUrl.replace(/\/+$/, "");
    const authHeaders = { authorization: `Bearer ${token}` };
    const modulesRes = await callJson(`${cleanBase}/api/learning/modules`, {
      method: "GET",
      headers: authHeaders,
    });
    if (modulesRes.res.status === 200) {
      const items = Array.isArray(modulesRes.body.items) ? modulesRes.body.items : [];

      for (const m of items) {
        if (m?.unlocked === false && String(m?.lockReason ?? "") !== "PHASE_LOCKED") {
          report.lockReasonMismatches.push({
            scope: "module",
            moduleId: m.id,
            lockReason: m.lockReason ?? null,
            issue: "LOCKED_MODULE_WITHOUT_PHASE_LOCKED_REASON",
          });
        }
      }

      for (const m of items.slice(0, 10)) {
        const moduleId = String(m?.id ?? "");
        if (!moduleId) continue;
        // eslint-disable-next-line no-await-in-loop
        const listRes = await callJson(
          `${cleanBase}/api/learning/lesson-assessment?moduleId=${encodeURIComponent(moduleId)}`,
          { method: "GET", headers: authHeaders },
        );
        if (listRes.res.status !== 200) continue;
        const lessonItems = Array.isArray(listRes.body.items) ? listRes.body.items : [];
        for (const lesson of lessonItems) {
          if (lesson?.unlocked === false) {
            const reason = String(lesson?.lockReason ?? "");
            if (!reason || !allowedLessonLockReasons.has(reason)) {
              report.lockReasonMismatches.push({
                scope: "lesson",
                moduleId,
                lessonId: lesson?.id ?? null,
                lockReason: lesson?.lockReason ?? null,
                issue: "LOCKED_LESSON_WITH_INVALID_REASON",
              });
            }
          }
        }
      }
    }
  } else {
    report.lockReasonMismatches.push({
      scope: "api-check",
      issue: "SKIPPED_NO_APEX_FLOW_SMOKE_BASE_URL_OR_TOKEN",
    });
  }

  report.lockReasonMismatchCount = report.lockReasonMismatches.filter(
    (x) => !String(x.issue).startsWith("SKIPPED_"),
  ).length;

  console.log("Learning flow health report:");
  console.log(JSON.stringify(report, null, 2));

  if (
    report.modulesWithoutLessonCount > 0 ||
    report.quizEmptyIssueCount > 0 ||
    report.lockReasonMismatchCount > 0 ||
    report.studyConfirmationsTableOk !== true ||
    report.studentScheduleSlotsTableOk !== true
  ) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("[FAIL] health-learning-flow", error?.message ?? error);
  process.exitCode = 1;
});

