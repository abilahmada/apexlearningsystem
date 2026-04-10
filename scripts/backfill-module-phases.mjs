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
const writeMode = /^(1|true|yes)$/i.test(process.env.APEX_PHASE_BACKFILL_WRITE ?? "");
const targetGrade = String(process.env.APEX_PHASE_BACKFILL_GRADE ?? "").trim().toUpperCase();

if (!url || !serviceRoleKey) {
  console.error("Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (targetGrade && !["SD", "SMP", "SMK"].includes(targetGrade)) {
  console.error("APEX_PHASE_BACKFILL_GRADE must be SD/SMP/SMK when provided.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizePhase(value) {
  const text = String(value ?? "").trim();
  return text || "Phase 1";
}

async function run() {
  let query = supabase
    .from("modules")
    .select("id, title, sequence_order, metadata, courses!inner(id, grade_level)")
    .order("sequence_order", { ascending: true })
    .order("id", { ascending: true });

  if (targetGrade) {
    query = query.eq("courses.grade_level", targetGrade);
  }

  const { data, error } = await query;
  if (error) throw error;

  const modules = data ?? [];
  const byGrade = new Map();
  for (const moduleRow of modules) {
    const course = Array.isArray(moduleRow.courses) ? moduleRow.courses[0] : moduleRow.courses;
    const grade = String(course?.grade_level ?? "UNKNOWN");
    const arr = byGrade.get(grade) ?? [];
    arr.push(moduleRow);
    byGrade.set(grade, arr);
  }

  const updates = [];
  for (const [grade, rows] of byGrade.entries()) {
    const phaseOrderMap = new Map();
    for (const moduleRow of rows) {
      const metadata =
        moduleRow.metadata && typeof moduleRow.metadata === "object"
          ? { ...moduleRow.metadata }
          : {};
      const phase = normalizePhase(metadata.phase);
      if (!phaseOrderMap.has(phase)) {
        phaseOrderMap.set(phase, phaseOrderMap.size + 1);
      }
      const inferredOrder = phaseOrderMap.get(phase);
      const existingPhaseNum = Number(metadata.phase);
      const existingOrder = Number(metadata.phaseOrder ?? metadata.phase_order ?? 0);
      const existingGrade = String(metadata.grade ?? "").trim().toUpperCase();
      const needUpdate =
        !Number.isFinite(existingPhaseNum) ||
        existingPhaseNum < 1 ||
        !Number.isFinite(existingOrder) ||
        existingOrder < 1 ||
        existingOrder !== inferredOrder ||
        existingGrade !== grade ||
        metadata.phaseLabel !== phase ||
        metadata.phase_order !== undefined;

      if (!needUpdate) continue;
      metadata.grade = grade;
      metadata.phase = inferredOrder;
      metadata.phaseLabel = phase;
      metadata.phaseOrder = inferredOrder;
      delete metadata.phase_order;

      updates.push({
        id: String(moduleRow.id),
        grade,
        title: String(moduleRow.title ?? ""),
        phase,
        phaseOrder: inferredOrder,
        metadata,
      });
    }
  }

  if (updates.length === 0) {
    console.log("No module phase metadata changes needed.");
    return;
  }

  console.log(`Mode: ${writeMode ? "WRITE" : "DRY-RUN"}`);
  console.log(`Target grade: ${targetGrade || "ALL"}`);
  console.log(`Planned updates: ${updates.length}`);

  for (const row of updates.slice(0, 20)) {
    console.log(
      `~ ${row.grade} | #${row.phaseOrder} ${row.phase} | ${row.title} (${row.id})`,
    );
  }
  if (updates.length > 20) {
    console.log(`... ${updates.length - 20} more rows`);
  }

  if (!writeMode) {
    console.log("Dry-run only. Set APEX_PHASE_BACKFILL_WRITE=1 to apply updates.");
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
  console.error("Backfill module phases failed:", error.message);
  process.exit(1);
});
