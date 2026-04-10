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

const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const today = dayKeys[new Date().getDay()];

async function run() {
  const { data, error } = await supabase
    .from("modules")
    .select("id, title, sequence_order, metadata, courses!inner(grade_level)")
    .order("sequence_order", { ascending: true });
  if (error) throw error;

  const candidates = { SD: null, SMP: null, SMK: null };
  for (const row of data ?? []) {
    const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
    const grade = String(course?.grade_level ?? "").toUpperCase();
    if (!["SD", "SMP", "SMK"].includes(grade)) continue;
    const md = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const days = Array.isArray(md.scheduleDays) ? md.scheduleDays.map((d) => String(d).toLowerCase()) : [];
    if (!days.includes(today)) continue;
    if (!candidates[grade]) {
      candidates[grade] = {
        id: String(row.id),
        title: String(row.title ?? ""),
        phase: Number(md.phase ?? 1),
        scheduleDays: days,
      };
    }
  }

  console.log(JSON.stringify({ today, candidates }, null, 2));
}

run().catch((error) => {
  console.error("Failed to get learning-flow smoke candidates:", error.message);
  process.exit(1);
});

