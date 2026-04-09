import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const writeMode = /^(1|true|yes)$/i.test(process.env.APEX_CLEANUP_WRITE ?? "");

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
  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id, title, grade_level");
  if (coursesError) throw coursesError;

  const removable = [];

  for (const course of courses ?? []) {
    const { count, error } = await supabase
      .from("modules")
      .select("id", { count: "exact", head: true })
      .eq("course_id", course.id);
    if (error) throw error;
    if ((count ?? 0) === 0) removable.push(course);
  }

  console.log(`Mode: ${writeMode ? "WRITE" : "DRY-RUN"}`);
  if (removable.length === 0) {
    console.log("No empty courses found.");
    return;
  }

  console.log("Empty courses:");
  for (const row of removable) {
    console.log(`- ${row.grade_level} | ${row.id} | ${row.title}`);
  }

  if (!writeMode) return;

  const ids = removable.map((r) => r.id);
  const { error: deleteError } = await supabase.from("courses").delete().in("id", ids);
  if (deleteError) throw deleteError;
  console.log(`Deleted empty courses: ${ids.length}`);
}

run().catch((error) => {
  console.error("Cleanup failed:", error.message);
  process.exit(1);
});
