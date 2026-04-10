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
const moduleId = String(process.env.APEX_INSPECT_MODULE_ID ?? "").trim();

if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
if (!moduleId) throw new Error("Set APEX_INSPECT_MODULE_ID");

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: lessons, error } = await supabase
  .from("lessons")
  .select("id,title")
  .eq("module_id", moduleId)
  .order("id", { ascending: true });
if (error) throw error;

console.log(`moduleId=${moduleId}`);
for (const lesson of lessons ?? []) {
  const { data: q, error: qe } = await supabase
    .from("quizzes")
    .select("id, questions_pre, questions_post")
    .eq("lesson_id", lesson.id)
    .maybeSingle();
  if (qe) throw qe;
  const pre = Array.isArray(q?.questions_pre) ? q.questions_pre.length : 0;
  const post = Array.isArray(q?.questions_post) ? q.questions_post.length : 0;
  console.log(`${lesson.id} | ${lesson.title} | pre=${pre} post=${post}`);
}

