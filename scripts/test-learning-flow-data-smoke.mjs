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
      // Ignore missing env files.
    }
  }
}

function todayKey() {
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return keys[new Date().getDay()];
}

await hydrateEnvFromFiles();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const { data, error } = await supabase
    .from("modules")
    .select("id, metadata, courses!inner(grade_level)");
  if (error) throw error;

  const requiredDay = todayKey();
  const missing = {
    grade: 0,
    phase: 0,
    subject: 0,
    scheduleDays: 0,
  };
  const scheduledTodayByGrade = { SD: 0, SMP: 0, SMK: 0 };
  let total = 0;

  for (const row of data ?? []) {
    total += 1;
    const md = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const grade = String(md.grade ?? "").trim().toUpperCase();
    if (!["SD", "SMP", "SMK", "SMA"].includes(grade)) missing.grade += 1;
    const phase = Number(md.phase);
    if (!Number.isFinite(phase) || phase < 1) missing.phase += 1;
    const subject = String(md.subject ?? "").trim().toLowerCase();
    if (!subject) missing.subject += 1;
    const days = Array.isArray(md.scheduleDays) ? md.scheduleDays.map((d) => String(d).toLowerCase()) : [];
    if (days.length === 0) missing.scheduleDays += 1;
    const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
    const courseGrade = String(course?.grade_level ?? "").toUpperCase();
    if (days.includes(requiredDay) && ["SD", "SMP", "SMK"].includes(courseGrade)) {
      scheduledTodayByGrade[courseGrade] += 1;
    }
  }

  console.log(`Learning flow data smoke (${requiredDay}):`);
  console.log({ total, missing, scheduledTodayByGrade });

  const hasTodayEachGrade =
    scheduledTodayByGrade.SD > 0 &&
    scheduledTodayByGrade.SMP > 0 &&
    scheduledTodayByGrade.SMK > 0;
  const hasNoMissing =
    missing.grade === 0 &&
    missing.phase === 0 &&
    missing.subject === 0 &&
    missing.scheduleDays === 0;

  if (!hasNoMissing || !hasTodayEachGrade) {
    throw new Error("Learning flow data smoke failed.");
  }
}

run()
  .then(() => {
    console.log("Learning flow data smoke passed.");
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });

