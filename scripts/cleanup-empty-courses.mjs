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
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = await fs.readFile(path.resolve(process.cwd(), file), "utf-8");
      const parsed = parseEnvText(raw);
      for (const [k, v] of Object.entries(parsed)) {
        if (!process.env[k] || String(process.env[k]).trim() === "") process.env[k] = String(v);
      }
    } catch {
      // ignore
    }
  }
}

await hydrateEnvFromFiles();

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
