import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const GRADES = ["SD", "SMP", "SMK"];

async function getCoursesByGrade(gradeLevel) {
  const { data, error } = await supabase
    .from("courses")
    .select("id, title, grade_level")
    .eq("grade_level", gradeLevel);
  if (error) throw error;
  return data ?? [];
}

async function getModulesByCourseIds(courseIds) {
  if (courseIds.length === 0) return [];
  const { data, error } = await supabase
    .from("modules")
    .select("id, course_id, title")
    .in("course_id", courseIds);
  if (error) throw error;
  return data ?? [];
}

async function getLessonsByModuleIds(moduleIds) {
  if (moduleIds.length === 0) return [];
  const { data, error } = await supabase
    .from("lessons")
    .select("id, module_id, title")
    .in("module_id", moduleIds);
  if (error) throw error;
  return data ?? [];
}

async function getQuizzesByLessonIds(lessonIds) {
  if (lessonIds.length === 0) return [];
  const { data, error } = await supabase
    .from("quizzes")
    .select("id, lesson_id")
    .in("lesson_id", lessonIds);
  if (error) throw error;
  return data ?? [];
}

async function run() {
  const summary = {};

  for (const grade of GRADES) {
    const courses = await getCoursesByGrade(grade);
    const courseIds = courses.map((c) => c.id);

    const modules = await getModulesByCourseIds(courseIds);
    const moduleIds = modules.map((m) => m.id);

    const lessons = await getLessonsByModuleIds(moduleIds);
    const lessonIds = lessons.map((l) => l.id);

    const quizzes = await getQuizzesByLessonIds(lessonIds);

    summary[grade] = {
      courses: courses.length,
      modules: modules.length,
      lessons: lessons.length,
      quizzes: quizzes.length,
    };
  }

  const totals = GRADES.reduce(
    (acc, grade) => {
      acc.courses += summary[grade].courses;
      acc.modules += summary[grade].modules;
      acc.lessons += summary[grade].lessons;
      acc.quizzes += summary[grade].quizzes;
      return acc;
    },
    { courses: 0, modules: 0, lessons: 0, quizzes: 0 },
  );

  console.log("Curriculum audit counts by grade:");
  for (const grade of GRADES) {
    console.log(`- ${grade}:`, summary[grade]);
  }
  console.log("Totals:", totals);
}

run().catch((error) => {
  console.error("Audit failed:", error.message);
  process.exit(1);
});
