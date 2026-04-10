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
const writeMode = /^(1|true|yes)$/i.test(process.env.APEX_SUBJECT_BACKFILL_WRITE ?? "");
const targetGrade = String(process.env.APEX_SUBJECT_BACKFILL_GRADE ?? "").trim().toUpperCase();

if (!url || !serviceRoleKey) {
  console.error("Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (targetGrade && !["SD", "SMP", "SMK"].includes(targetGrade)) {
  console.error("APEX_SUBJECT_BACKFILL_GRADE must be SD/SMP/SMK when provided.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function inferSubject(title, existingSubject = "") {
  const keep = String(existingSubject).trim().toLowerCase();
  if (keep) return keep;
  const t = String(title ?? "").toLowerCase();
  if (t.includes("matematika") || t.includes("math")) return "matematika";
  if (t.includes("english") || t.includes("inggris")) return "english";
  if (t.includes("coding") || t.includes("cs") || t.includes("computer")) return "coding";
  if (t.includes("sains") || t.includes("ipa") || t.includes("fisika") || t.includes("biologi")) return "sains";
  if (t.includes("islamic") || t.includes("aqidah") || t.includes("fiqih") || t.includes("quran")) return "islamic";
  if (t.includes("ekonomi") || t.includes("wirausaha") || t.includes("finance")) return "ekonomi";
  return "umum";
}

async function run() {
  let query = supabase
    .from("modules")
    .select("id, title, metadata, courses!inner(grade_level)")
    .order("id", { ascending: true });

  if (targetGrade) query = query.eq("courses.grade_level", targetGrade);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const updates = [];
  for (const row of rows) {
    const metadata = row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {};
    const nextSubject = inferSubject(row.title, metadata.subject);
    const current = String(metadata.subject ?? "").trim().toLowerCase();
    if (current === nextSubject && current.length > 0) continue;
    metadata.subject = nextSubject;
    updates.push({ id: String(row.id), title: String(row.title ?? ""), subject: nextSubject, metadata });
  }

  console.log(`Mode: ${writeMode ? "WRITE" : "DRY-RUN"}`);
  console.log(`Target grade: ${targetGrade || "ALL"}`);
  console.log(`Planned subject metadata updates: ${updates.length}`);
  for (const row of updates.slice(0, 20)) {
    console.log(`~ ${row.subject} | ${row.title}`);
  }
  if (updates.length > 20) console.log(`... ${updates.length - 20} more rows`);

  if (!writeMode) {
    console.log("Dry-run only. Set APEX_SUBJECT_BACKFILL_WRITE=1 to apply updates.");
    return;
  }
  let updated = 0;
  for (const row of updates) {
    const { error: updateErr } = await supabase.from("modules").update({ metadata: row.metadata }).eq("id", row.id);
    if (updateErr) throw updateErr;
    updated += 1;
  }
  console.log(`Updated modules: ${updated}`);
}

run().catch((error) => {
  console.error("Backfill module subjects failed:", error.message);
  process.exit(1);
});

