import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const writeMode = /^(1|true|yes)$/i.test(process.env.APEX_DEDUP_WRITE ?? "");

if (!url || !serviceRoleKey) {
  console.error(
    "Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchCourses() {
  const { data, error } = await supabase
    .from("courses")
    .select("id, title, grade_level")
    .order("id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchModulesByCourseId(courseId) {
  const { data, error } = await supabase
    .from("modules")
    .select("id, course_id, title")
    .eq("course_id", courseId);
  if (error) throw error;
  return data ?? [];
}

async function moveModules(moduleIds, canonicalCourseId) {
  if (moduleIds.length === 0) return;
  const { error } = await supabase
    .from("modules")
    .update({ course_id: canonicalCourseId })
    .in("id", moduleIds);
  if (error) throw error;
}

async function deleteCourse(courseId) {
  const { error } = await supabase.from("courses").delete().eq("id", courseId);
  if (error) throw error;
}

async function run() {
  const courses = await fetchCourses();
  const grouped = new Map();

  for (const course of courses) {
    const key = `${String(course.grade_level)}::${String(course.title)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(course);
  }

  const duplicates = [];
  for (const [key, group] of grouped.entries()) {
    if (group.length > 1) duplicates.push({ key, group });
  }

  if (duplicates.length === 0) {
    console.log("No duplicate courses found.");
    return;
  }

  const stats = {
    duplicate_groups: duplicates.length,
    courses_to_delete: 0,
    modules_to_move: 0,
    moved: 0,
    deleted: 0,
  };

  console.log(`Mode: ${writeMode ? "WRITE" : "DRY-RUN"}`);
  console.log(`Duplicate groups: ${duplicates.length}`);

  for (const dup of duplicates) {
    const sorted = [...dup.group].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const [canonical, ...rest] = sorted;
    console.log(
      `\nGroup: ${dup.key}\n- canonical: ${canonical.id}`,
    );

    for (const duplicateCourse of rest) {
      const modules = await fetchModulesByCourseId(duplicateCourse.id);
      const moduleIds = modules.map((m) => m.id);
      stats.courses_to_delete += 1;
      stats.modules_to_move += moduleIds.length;

      console.log(
        `- duplicate: ${duplicateCourse.id} -> move modules: ${moduleIds.length} -> delete`,
      );

      if (writeMode) {
        await moveModules(moduleIds, canonical.id);
        stats.moved += moduleIds.length;
        await deleteCourse(duplicateCourse.id);
        stats.deleted += 1;
      }
    }
  }

  console.log("\nSummary:");
  console.log(stats);
}

run().catch((error) => {
  console.error("Dedup failed:", error.message);
  process.exit(1);
});
