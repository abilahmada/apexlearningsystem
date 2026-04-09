import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const inputPath =
  process.env.APEX_CURRICULUM_FILE ?? "data/curriculum/sd-foundation-mvp.json";
const dryRun = /^(1|true|yes)$/i.test(process.env.APEX_CURRICULUM_DRY_RUN ?? "");

if (!url || !serviceRoleKey) {
  console.error(
    "Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stats = {
  created: { courses: 0, modules: 0, lessons: 0, quizzes: 0 },
  updated: { courses: 0, modules: 0, lessons: 0, quizzes: 0 },
  errors: [],
};

function assert(value, message) {
  if (!value) throw new Error(message);
}

function syntheticId(prefix) {
  const random = Math.random().toString(36).slice(2, 10);
  return `dry-${prefix}-${Date.now()}-${random}`;
}

function normalizeQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("quiz.questions must be a non-empty array");
  }

  return questions.map((q, i) => {
    const question = String(q.question ?? "").trim();
    const options = Array.isArray(q.options) ? q.options.map((o) => String(o)) : [];
    const answerIndex = Number(q.answerIndex);

    assert(question, `quiz.questions[${i}].question is required`);
    assert(options.length >= 2, `quiz.questions[${i}].options must have at least 2 items`);
    assert(Number.isInteger(answerIndex), `quiz.questions[${i}].answerIndex must be an integer`);
    assert(
      answerIndex >= 0 && answerIndex < options.length,
      `quiz.questions[${i}].answerIndex is out of options range`,
    );

    return {
      question,
      options,
      answerIndex,
      explanation: String(q.explanation ?? "").trim(),
      tags: Array.isArray(q.tags) ? q.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    };
  });
}

async function readCurriculumFile(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  const text = await fs.readFile(resolved, "utf-8");
  const doc = JSON.parse(text);

  assert(doc && typeof doc === "object", "Curriculum file must be an object");
  assert(["SD", "SMP", "SMK"].includes(doc.gradeLevel), "gradeLevel must be SD/SMP/SMK");
  assert(Array.isArray(doc.courses) && doc.courses.length > 0, "courses must be non-empty");

  return doc;
}

async function getOne(table, match) {
  let query = supabase.from(table).select("*").limit(1);
  for (const [key, value] of Object.entries(match)) {
    query = query.eq(key, value);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] ?? null;
}

async function upsertCourse(course, gradeLevel) {
  const title = String(course.title ?? "").trim();
  assert(title, "course.title is required");

  if (dryRun) {
    stats.created.courses += 1;
    console.log(`+ [dry-run] Course create planned: ${title}`);
    return syntheticId("course");
  }

  const existing = await getOne("courses", { title, grade_level: gradeLevel });
  if (existing) {
    console.log(`= Course exists: ${title}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("courses")
    .insert({ title, grade_level: gradeLevel })
    .select("id")
    .single();
  if (error) throw error;
  stats.created.courses += 1;
  console.log(`+ Course created: ${title}`);
  return data.id;
}

async function upsertModule(module, courseId) {
  const title = String(module.title ?? "").trim();
  const sequenceOrder = Number(module.sequenceOrder ?? 1);
  const masteryThreshold = Number(module.masteryThreshold ?? 80);
  assert(title, "module.title is required");
  assert(Number.isInteger(sequenceOrder) && sequenceOrder >= 1, "module.sequenceOrder invalid");

  if (dryRun) {
    stats.created.modules += 1;
    console.log(`+ [dry-run] Module create planned: ${title}`);
    return syntheticId("module");
  }

  const existing = await getOne("modules", { course_id: courseId, title });
  const moduleMeta =
    module && typeof module.meta === "object" && module.meta !== null ? module.meta : {};
  const payload = {
    course_id: courseId,
    title,
    sequence_order: sequenceOrder,
    mastery_threshold: Number.isFinite(masteryThreshold) ? masteryThreshold : 80,
    metadata: moduleMeta,
  };

  if (existing) {
    if (dryRun) {
      stats.updated.modules += 1;
      console.log(`~ [dry-run] Module update planned: ${title}`);
      return existing.id;
    }
    const { data, error } = await supabase
      .from("modules")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    stats.updated.modules += 1;
    console.log(`~ Module updated: ${title}`);
    return data.id;
  }

  const { data, error } = await supabase.from("modules").insert(payload).select("id").single();
  if (error) throw error;
  stats.created.modules += 1;
  console.log(`+ Module created: ${title}`);
  return data.id;
}

async function upsertLesson(lesson, moduleId) {
  const lessonMeta = lesson && typeof lesson === "object" ? lesson.meta ?? null : null;
  const metaCode =
    lessonMeta && typeof lessonMeta === "object" ? String(lessonMeta.code ?? "").trim() : "";
  const metaTopic =
    lessonMeta && typeof lessonMeta === "object" ? String(lessonMeta.topic ?? "").trim() : "";
  const metaBenchmark =
    lessonMeta && typeof lessonMeta === "object"
      ? String(lessonMeta.benchmark ?? "").trim()
      : "";
  const rawTitle = String(lesson.title ?? "").trim();
  const baseTitle = metaTopic || rawTitle;
  const titlePrefix = metaCode ? `${metaCode} — ` : "";
  const titleSuffix = metaBenchmark ? ` [${metaBenchmark}]` : "";
  const title = `${titlePrefix}${baseTitle}${titleSuffix}`.trim();
  const type = String(lesson.type ?? "").trim().toUpperCase();
  const contentUrl = String(lesson.contentUrl ?? "").trim();
  assert(title, "lesson.title is required");
  assert(["VIDEO", "ARTICLE", "INTERACTIVE"].includes(type), "lesson.type invalid");

  if (dryRun) {
    stats.created.lessons += 1;
    console.log(`+ [dry-run] Lesson create planned: ${title}`);
    return syntheticId("lesson");
  }

  const existing = await getOne("lessons", { module_id: moduleId, title });
  const metadata = {
    code: metaCode || null,
    topic: metaTopic || (rawTitle || null),
    benchmark: metaBenchmark || null,
  };
  const payload = {
    module_id: moduleId,
    title,
    type,
    content_url: contentUrl || null,
    metadata,
  };

  if (existing) {
    if (dryRun) {
      stats.updated.lessons += 1;
      console.log(`~ [dry-run] Lesson update planned: ${title}`);
      return existing.id;
    }
    const { data, error } = await supabase
      .from("lessons")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    stats.updated.lessons += 1;
    console.log(`~ Lesson updated: ${title}`);
    return data.id;
  }

  const { data, error } = await supabase.from("lessons").insert(payload).select("id").single();
  if (error) throw error;
  stats.created.lessons += 1;
  console.log(`+ Lesson created: ${title}`);
  return data.id;
}

async function upsertQuiz(lessonId, quiz) {
  if (!quiz) return;

  const questions = normalizeQuestions(quiz.questions);
  if (dryRun) {
    stats.created.quizzes += 1;
    console.log("+ [dry-run] Quiz create planned");
    return;
  }

  const existing = await getOne("quizzes", { lesson_id: lessonId });

  if (existing) {
    if (dryRun) {
      stats.updated.quizzes += 1;
      console.log("~ [dry-run] Quiz update planned");
      return;
    }
    const { error } = await supabase
      .from("quizzes")
      .update({ questions })
      .eq("id", existing.id);
    if (error) throw error;
    stats.updated.quizzes += 1;
    console.log("~ Quiz updated");
    return;
  }

  const { error } = await supabase.from("quizzes").insert({ lesson_id: lessonId, questions });
  if (error) throw error;
  stats.created.quizzes += 1;
  console.log("+ Quiz created");
}

async function run() {
  const curriculum = await readCurriculumFile(inputPath);
  const gradeLevel = curriculum.gradeLevel;

  for (const course of curriculum.courses) {
    try {
      const courseId = await upsertCourse(course, gradeLevel);

      const modules = Array.isArray(course.modules) ? course.modules : [];
      assert(modules.length > 0, `course "${course.title}" requires modules`);
      for (const moduleItem of modules) {
        try {
          const moduleId = await upsertModule(moduleItem, courseId);

          const lessons = Array.isArray(moduleItem.lessons) ? moduleItem.lessons : [];
          assert(lessons.length > 0, `module "${moduleItem.title}" requires lessons`);
          for (const lesson of lessons) {
            try {
              const lessonId = await upsertLesson(lesson, moduleId);
              await upsertQuiz(lessonId, lesson.quiz);
            } catch (error) {
              stats.errors.push(
                `[lesson:${lesson.title}] ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        } catch (error) {
          stats.errors.push(
            `[module:${moduleItem.title}] ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      stats.errors.push(
        `[course:${course.title}] ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`Import completed from: ${inputPath}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN" : "WRITE"}`);
  console.log("Created:", stats.created);
  console.log("Updated:", stats.updated);
  if (stats.errors.length > 0) {
    console.log("Errors:");
    for (const error of stats.errors) console.log(`- ${error}`);
    throw new Error(`Import finished with ${stats.errors.length} error(s)`);
  }
}

run().catch((error) => {
  console.error("Import failed:", error.message);
  process.exit(1);
});
