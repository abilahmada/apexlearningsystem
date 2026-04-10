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
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const writeMode = /^(1|true|yes)$/i.test(process.env.APEX_DEDUP_QUIZ_WRITE ?? "");
const targetModuleId = String(process.env.APEX_DEDUP_QUIZ_MODULE_ID ?? "").trim().toLowerCase();

if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

function bankLen(v) {
  return Array.isArray(v) ? v.length : 0;
}

function scoreQuizRow(row) {
  return bankLen(row.questions_pre) * 100 + bankLen(row.questions_post) * 100 + bankLen(row.questions);
}

async function run() {
  let lessonIds = null;
  if (targetModuleId) {
    const { data: lessons, error: le } = await supabase.from("lessons").select("id").eq("module_id", targetModuleId);
    if (le) throw le;
    lessonIds = (lessons ?? []).map((x) => String(x.id));
  }

  let query = supabase
    .from("quizzes")
    .select("id, lesson_id, questions, questions_pre, questions_post")
    .order("id", { ascending: true });
  if (lessonIds && lessonIds.length > 0) query = query.in("lesson_id", lessonIds);
  const { data, error } = await query;
  if (error) throw error;

  const byLesson = new Map();
  for (const row of data ?? []) {
    const lid = String(row.lesson_id);
    const arr = byLesson.get(lid) ?? [];
    arr.push(row);
    byLesson.set(lid, arr);
  }

  const toDelete = [];
  for (const [lessonId, rows] of byLesson.entries()) {
    if (rows.length <= 1) continue;
    const sorted = [...rows].sort((a, b) => scoreQuizRow(b) - scoreQuizRow(a) || String(b.id).localeCompare(String(a.id)));
    const keep = String(sorted[0].id);
    for (const r of rows) {
      const id = String(r.id);
      if (id !== keep) toDelete.push({ id, lessonId });
    }
  }

  console.log(`Mode: ${writeMode ? "WRITE" : "DRY-RUN"}`);
  console.log(`Target module: ${targetModuleId || "ALL"}`);
  console.log(`Duplicate quiz rows to delete: ${toDelete.length}`);
  for (const row of toDelete.slice(0, 20)) {
    console.log(`- delete quiz ${row.id} (lesson ${row.lessonId})`);
  }
  if (toDelete.length > 20) console.log(`... ${toDelete.length - 20} more`);

  if (!writeMode) return;

  let deleted = 0;
  for (const row of toDelete) {
    const { error: de } = await supabase.from("quizzes").delete().eq("id", row.id);
    if (de) throw de;
    deleted += 1;
  }
  console.log(`Deleted quiz rows: ${deleted}`);
}

run().catch((error) => {
  console.error("dedup-quizzes-by-lesson failed:", error.message);
  process.exit(1);
});

