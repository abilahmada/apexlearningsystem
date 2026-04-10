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
      // ignore missing env files
    }
  }
}

await hydrateEnvFromFiles();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

function hasBank(v) {
  return Array.isArray(v) && v.length > 0;
}

const { data: modules, error: me } = await supabase
  .from("modules")
  .select("id,title,sequence_order")
  .order("sequence_order", { ascending: true });
if (me) throw me;

for (const m of modules ?? []) {
  const { data: lessons, error: le } = await supabase
    .from("lessons")
    .select("id,title")
    .eq("module_id", m.id)
    .order("id", { ascending: true });
  if (le) throw le;
  if (!lessons || lessons.length < 2) continue;

  let readyCount = 0;
  for (const l of lessons) {
    const { data: q, error: qe } = await supabase
      .from("quizzes")
      .select("questions_pre, questions_post")
      .eq("lesson_id", l.id)
      .maybeSingle();
    if (qe) throw qe;
    if (hasBank(q?.questions_pre) && hasBank(q?.questions_post)) readyCount += 1;
  }
  if (readyCount >= 2) {
    console.log(`moduleId=${m.id}`);
    console.log(`title=${m.title}`);
    console.log(`lessons=${lessons.length}, prepost_ready=${readyCount}`);
    process.exit(0);
  }
}

console.log("No module found with >=2 lessons having pre/post banks.");
process.exit(1);

