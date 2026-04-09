import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const inputPath =
  process.env.APEX_CURRICULUM_FILE ?? "data/curriculum/smp-master-full.json";
const perModuleRaw = Number(process.env.APEX_QUIZ_PER_MODULE ?? "1");
const perModule = Math.min(Math.max(Number.isFinite(perModuleRaw) ? perModuleRaw : 1, 1), 3);
const dryRun = /^(1|true|yes)$/i.test(process.env.APEX_CURRICULUM_DRY_RUN ?? "");
const overwriteExisting = /^(1|true|yes)$/i.test(process.env.APEX_QUIZ_OVERWRITE ?? "");
const targetLessonIds = new Set(
  String(process.env.APEX_QUIZ_TARGET_LESSON_IDS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

if (!url || !serviceRoleKey) {
  console.error(
    "Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function assert(value, message) {
  if (!value) throw new Error(message);
}

function pickTopic(lesson) {
  const meta = lesson?.meta && typeof lesson.meta === "object" ? lesson.meta : {};
  const topic = String(meta.topic ?? "").trim();
  const title = String(lesson?.title ?? "").trim();
  return topic || title || "materi ini";
}

function getCode(lesson) {
  const meta = lesson?.meta && typeof lesson.meta === "object" ? lesson.meta : {};
  return String(meta.code ?? "").trim();
}

function inferSubject(moduleTitle = "", code = "") {
  const moduleLower = moduleTitle.toLowerCase();
  if (moduleLower.includes("matematika") || code.includes("M.")) return "matematika";
  if (moduleLower.includes("english") || code.includes("E.")) return "english";
  if (moduleLower.includes("coding") || moduleLower.includes("cs") || code.includes("C.")) return "coding";
  if (moduleLower.includes("sains") || moduleLower.includes("ipa") || code.includes("S.") || code.includes("F.") || code.includes("K.") || code.includes("B.")) return "sains";
  if (moduleLower.includes("ekonomi") || moduleLower.includes("wirausaha") || code.includes("W.") || code.startsWith("FIN")) return "ekonomi";
  return "umum";
}

function buildQuestions(lesson, moduleTitle, gradeLevel) {
  const topic = pickTopic(lesson);
  const code = getCode(lesson);
  const subject = inferSubject(moduleTitle, code);
  const common = {
    tags: [gradeLevel, subject, code || "no-code"].filter(Boolean),
  };

  const questions = [
    {
      question: `Apa fokus utama dari materi "${topic}"?`,
      options: [
        "Memahami konsep inti materi",
        "Menghafal tanpa memahami konteks",
        "Melewati latihan dan refleksi",
        "Menghindari diskusi serta umpan balik",
      ],
      answer: "A",
      hint: "Cari jawaban yang menekankan pemahaman konsep, bukan hafalan.",
      explanation: "Pembelajaran efektif berfokus pada pemahaman konsep dan penerapan.",
      difficulty: "easy",
      ...common,
    },
    {
      question: `Strategi belajar terbaik untuk topik "${topic}" adalah ...`,
      options: [
        "Membaca ringkas, latihan terarah, lalu refleksi kesalahan",
        "Mengerjakan soal tanpa cek jawaban",
        "Menghafal semua istilah tanpa contoh",
        "Menunda latihan sampai mendekati ujian",
      ],
      answer: "A",
      hint: "Pilih strategi yang mencakup pemahaman, praktik, dan evaluasi diri.",
      explanation: "Siklus belajar efektif: pahami konsep, praktikkan, lalu evaluasi.",
      difficulty: "medium",
      ...common,
    },
    {
      question: `Setelah mempelajari "${topic}", indikator penguasaan paling kuat adalah ...`,
      options: [
        "Mampu menjelaskan konsep dan menyelesaikan variasi soal baru",
        "Mampu mengulang definisi kata demi kata",
        "Hanya bisa menjawab contoh soal yang sama",
        "Menghindari soal cerita karena lebih sulit",
      ],
      answer: "A",
      hint: "Penguasaan terlihat dari transfer konsep ke konteks baru.",
      explanation: "Mastery berarti mampu transfer konsep, bukan sekadar hafalan.",
      difficulty: "hard",
      ...common,
    },
  ];

  if (subject === "matematika") {
    questions[1] = {
      ...questions[1],
      question: `Untuk topik "${topic}", langkah pertama saat mengerjakan soal cerita matematika adalah ...`,
      options: [
        "Menentukan informasi diketahui/ditanya dan model matematikanya",
        "Langsung menebak operasi paling cepat",
        "Menghafal jawaban soal serupa",
        "Mengabaikan satuan agar perhitungan cepat",
      ],
      explanation: "Pemodelan masalah membantu memilih operasi dan strategi tepat.",
      tags: [...common.tags, "word-problem"],
    };
  } else if (subject === "english") {
    questions[1] = {
      ...questions[1],
      question: `Pada materi "${topic}", cara terbaik meningkatkan kemampuan bahasa adalah ...`,
      options: [
        "Practice aktif: read, speak, write, lalu perbaiki feedback",
        "Fokus grammar saja tanpa praktik",
        "Hafal kosakata tanpa konteks",
        "Melewati latihan speaking",
      ],
      explanation: "Bahasa meningkat lewat praktik aktif lintas skill.",
      tags: [...common.tags, "language-practice"],
    };
  } else if (subject === "coding") {
    questions[1] = {
      ...questions[1],
      question: `Saat belajar "${topic}", pendekatan debugging yang paling tepat adalah ...`,
      options: [
        "Uji bertahap, cek output, dan isolasi sumber error",
        "Ubah banyak bagian sekaligus tanpa verifikasi",
        "Menyalin kode tanpa memahami alur",
        "Menghindari test karena memakan waktu",
      ],
      explanation: "Debugging efektif dilakukan iteratif dan terukur.",
      tags: [...common.tags, "debugging"],
    };
  }

  return questions;
}

async function readCurriculumFile(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  const text = await fs.readFile(resolved, "utf-8");
  const doc = JSON.parse(text);
  assert(doc && typeof doc === "object", "Curriculum file must be an object");
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

async function findLesson(moduleId, lesson) {
  const meta = lesson?.meta && typeof lesson.meta === "object" ? lesson.meta : {};
  const code = String(meta.code ?? "").trim();
  const title = String(lesson?.title ?? "").trim();

  if (code) {
    const { data, error } = await supabase
      .from("lessons")
      .select("id, title, metadata")
      .eq("module_id", moduleId)
      .contains("metadata", { code })
      .limit(1);
    if (error) throw error;
    if (data?.[0]) return data[0];
  }

  return getOne("lessons", { module_id: moduleId, title });
}

async function planQuizWrite(lessonId) {
  const existingQuiz = await getOne("quizzes", { lesson_id: lessonId });
  if (!existingQuiz) return { action: "create" };
  if (!overwriteExisting) return { action: "skip" };
  return { action: "update", id: existingQuiz.id };
}

async function writeQuiz(plan, lessonId, questions) {
  if (plan.action === "create") {
    const { error } = await supabase.from("quizzes").insert({
      lesson_id: lessonId,
      questions,
    });
    if (error) throw error;
    return;
  }

  if (plan.action === "update") {
    const { error } = await supabase
      .from("quizzes")
      .update({ questions })
      .eq("id", plan.id);
    if (error) throw error;
  }
}

async function run() {
  const doc = await readCurriculumFile(inputPath);
  const gradeLevel = String(doc.gradeLevel ?? "").trim();
  const stats = { created: 0, updated: 0, exists: 0, missing: 0, modules: 0, filteredOut: 0 };

  for (const course of doc.courses) {
    const courseTitle = String(course.title ?? "").trim();
    const dbCourse = await getOne("courses", { title: courseTitle, grade_level: gradeLevel });
    if (!dbCourse) {
      console.log(`! Course not found in DB: ${courseTitle}`);
      stats.missing += 1;
      continue;
    }

    const modules = Array.isArray(course.modules) ? course.modules : [];
    for (const moduleItem of modules) {
      stats.modules += 1;
      const moduleTitle = String(moduleItem.title ?? "").trim();
      const dbModule = await getOne("modules", { course_id: dbCourse.id, title: moduleTitle });
      if (!dbModule) {
        console.log(`! Module not found in DB: ${moduleTitle}`);
        stats.missing += 1;
        continue;
      }

      const lessons = Array.isArray(moduleItem.lessons)
        ? moduleItem.lessons.slice(0, perModule)
        : [];
      for (const lesson of lessons) {
        const lessonTitle = String(lesson?.title ?? "").trim();
        const dbLesson = await findLesson(dbModule.id, lesson);
        if (!dbLesson) {
          console.log(`! Lesson not found in DB: ${lessonTitle}`);
          stats.missing += 1;
          continue;
        }

        const questions = buildQuestions(lesson, moduleTitle, gradeLevel);
        const plan = await planQuizWrite(dbLesson.id);
        const lessonIdKey = String(dbLesson.id ?? "").trim().toLowerCase();
        if (targetLessonIds.size > 0 && !targetLessonIds.has(lessonIdKey)) {
          stats.filteredOut += 1;
          console.log(`- Filtered out by APEX_QUIZ_TARGET_LESSON_IDS: ${lessonTitle}`);
          continue;
        }
        if (plan.action === "skip") {
          stats.exists += 1;
          console.log(`= Quiz exists (skip): ${lessonTitle}`);
          continue;
        }

        if (dryRun) {
          if (plan.action === "create") {
            stats.created += 1;
            console.log(`+ [dry-run] Quiz create planned: ${lessonTitle}`);
          } else {
            stats.updated += 1;
            console.log(`~ [dry-run] Quiz update planned: ${lessonTitle}`);
          }
          continue;
        }

        await writeQuiz(plan, dbLesson.id, questions);
        if (plan.action === "create") {
          stats.created += 1;
          console.log(`+ Quiz created: ${lessonTitle}`);
        } else {
          stats.updated += 1;
          console.log(`~ Quiz updated: ${lessonTitle}`);
        }
      }
    }
  }

  console.log(`Seed minimal quizzes completed from: ${inputPath}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN" : "WRITE"}`);
  console.log(`Overwrite existing: ${overwriteExisting ? "YES" : "NO"}`);
  console.log(`Targeted lesson IDs: ${targetLessonIds.size > 0 ? targetLessonIds.size : "ALL"}`);
  console.log("Stats:", stats);
}

run().catch((error) => {
  console.error("Seed minimal quizzes failed:", error.message);
  process.exit(1);
});
