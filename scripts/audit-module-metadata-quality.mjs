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

const dayKeys = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const scheduleTypes = new Set(["core", "review", "project"]);

function isTime(v) {
  return /^\d{2}:\d{2}$/.test(String(v ?? "").trim());
}

async function run() {
  const { data, error } = await supabase
    .from("modules")
    .select("id, title, metadata, courses!inner(grade_level)")
    .order("id", { ascending: true });
  if (error) throw error;

  const counts = {
    total: 0,
    missingGrade: 0,
    missingPhase: 0,
    missingSubject: 0,
    invalidScheduleDays: 0,
    invalidScheduleTime: 0,
    invalidScheduleDuration: 0,
    invalidScheduleType: 0,
  };

  for (const row of data ?? []) {
    counts.total += 1;
    const md = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const grade = String(md.grade ?? "").trim().toUpperCase();
    if (!["SD", "SMP", "SMK", "SMA"].includes(grade)) counts.missingGrade += 1;
    const phase = Number(md.phase ?? md.phaseOrder ?? md.phase_order);
    if (!Number.isFinite(phase) || phase < 1) counts.missingPhase += 1;
    const subject = String(md.subject ?? "").trim().toLowerCase();
    if (!subject) counts.missingSubject += 1;
    const days = Array.isArray(md.scheduleDays) ? md.scheduleDays : [];
    if (days.length === 0 || days.some((d) => !dayKeys.has(String(d).trim().toLowerCase()))) {
      counts.invalidScheduleDays += 1;
    }
    if (!isTime(md.scheduleTime)) counts.invalidScheduleTime += 1;
    const duration = Number(md.scheduleDuration);
    if (!Number.isFinite(duration) || duration <= 0) counts.invalidScheduleDuration += 1;
    const type = String(md.scheduleType ?? "").trim().toLowerCase();
    if (!scheduleTypes.has(type)) counts.invalidScheduleType += 1;
  }

  console.log("Module metadata quality audit:");
  console.log(counts);
}

run().catch((error) => {
  console.error("Audit module metadata quality failed:", error.message);
  process.exit(1);
});

