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
  const files = [".env.local", ".env"];
  for (const file of files) {
    try {
      const full = path.resolve(process.cwd(), file);
      const raw = await fs.readFile(full, "utf-8");
      const parsed = parseEnvText(raw);
      for (const [k, v] of Object.entries(parsed)) {
        if (!process.env[k] || String(process.env[k]).trim() === "") {
          process.env[k] = String(v);
        }
      }
    } catch {
      // Ignore missing env files.
    }
  }
}

await hydrateEnvFromFiles();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const writeMode = /^(1|true|yes)$/i.test(process.env.APEX_SCHEDULE_BACKFILL_WRITE ?? "");
const targetGrade = String(process.env.APEX_SCHEDULE_BACKFILL_GRADE ?? "").trim().toUpperCase();

if (!url || !serviceRoleKey) {
  console.error("Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (targetGrade && !["SD", "SMP", "SMK"].includes(targetGrade)) {
  console.error("APEX_SCHEDULE_BACKFILL_GRADE must be SD/SMP/SMK when provided.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const dayPatterns = {
  SD: [
    ["mon", "wed"],
    ["tue", "thu"],
    ["fri"],
    ["sat"],
  ],
  SMP: [
    ["mon", "thu"],
    ["tue", "fri"],
    ["wed"],
    ["sat"],
  ],
  SMK: [
    ["mon", "wed"],
    ["tue", "thu"],
    ["fri"],
    ["sat"],
  ],
};

function inferScheduleType(moduleTitle, seq) {
  const lower = String(moduleTitle ?? "").toLowerCase();
  if (lower.includes("project") || lower.includes("pbl") || lower.includes("proyek")) return "project";
  if (seq % 3 === 0) return "review";
  return "core";
}

function inferDurationByType(type) {
  if (type === "project") return 120;
  if (type === "review") return 60;
  return 90;
}

function inferTimeBySeq(seq) {
  const slot = (Math.max(1, Number(seq)) - 1) % 3;
  if (slot === 0) return "08:00";
  if (slot === 1) return "10:00";
  return "13:30";
}

async function run() {
  let query = supabase
    .from("modules")
    .select("id, title, sequence_order, metadata, courses!inner(id, grade_level)")
    .order("sequence_order", { ascending: true })
    .order("id", { ascending: true });

  if (targetGrade) query = query.eq("courses.grade_level", targetGrade);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const updates = [];

  for (const row of rows) {
    const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
    const grade = String(course?.grade_level ?? "SMP");
    const patterns = dayPatterns[grade] ?? dayPatterns.SMP;

    const metadata =
      row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {};

    const seq = Math.max(1, Number(row.sequence_order ?? 1));
    const suggestedDays = patterns[(seq - 1) % patterns.length];
    const suggestedType = inferScheduleType(row.title, seq);
    const suggestedDuration = inferDurationByType(suggestedType);
    const suggestedTime = inferTimeBySeq(seq);

    const existingDays = Array.isArray(metadata.scheduleDays) ? metadata.scheduleDays : [];
    const existingTime = String(metadata.scheduleTime ?? "").trim();
    const existingDuration = Number(metadata.scheduleDuration ?? 0);
    const existingType = String(metadata.scheduleType ?? "").trim().toLowerCase();

    const needUpdate =
      existingDays.length === 0 ||
      !existingTime ||
      !Number.isFinite(existingDuration) ||
      existingDuration <= 0 ||
      !["core", "review", "project"].includes(existingType);

    if (!needUpdate) continue;

    metadata.scheduleDays = existingDays.length > 0 ? existingDays : suggestedDays;
    metadata.scheduleTime = existingTime || suggestedTime;
    metadata.scheduleDuration =
      Number.isFinite(existingDuration) && existingDuration > 0 ? existingDuration : suggestedDuration;
    metadata.scheduleType = ["core", "review", "project"].includes(existingType)
      ? existingType
      : suggestedType;

    updates.push({
      id: String(row.id),
      title: String(row.title ?? ""),
      grade,
      metadata,
      preview: {
        days: metadata.scheduleDays,
        time: metadata.scheduleTime,
        duration: metadata.scheduleDuration,
        type: metadata.scheduleType,
      },
    });
  }

  console.log(`Mode: ${writeMode ? "WRITE" : "DRY-RUN"}`);
  console.log(`Target grade: ${targetGrade || "ALL"}`);
  console.log(`Planned schedule metadata updates: ${updates.length}`);

  for (const row of updates.slice(0, 20)) {
    console.log(
      `~ ${row.grade} | ${row.title} | ${JSON.stringify(row.preview)}`,
    );
  }
  if (updates.length > 20) console.log(`... ${updates.length - 20} more rows`);

  if (!writeMode) {
    console.log("Dry-run only. Set APEX_SCHEDULE_BACKFILL_WRITE=1 to apply updates.");
    return;
  }

  let updated = 0;
  for (const row of updates) {
    const { error: updateErr } = await supabase
      .from("modules")
      .update({ metadata: row.metadata })
      .eq("id", row.id);
    if (updateErr) throw updateErr;
    updated += 1;
  }

  console.log(`Updated modules: ${updated}`);
}

run().catch((error) => {
  console.error("Backfill module schedule failed:", error.message);
  process.exit(1);
});
