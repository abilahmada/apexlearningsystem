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

function normTitle(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hasText(v) {
  return String(v ?? "").trim().length > 0;
}

await hydrateEnvFromFiles();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const writeMode = /^(1|true|yes)$/i.test(process.env.APEX_DEDUP_CONTENT_WRITE ?? "");

if (!url || !key) {
  console.error("Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function countRows(table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { head: true, count: "exact" })
    .eq(column, value);
  if (error) throw error;
  return Number(count ?? 0);
}

async function run() {
  const stats = {
    moduleDuplicateGroups: 0,
    moduleCandidatesToDelete: 0,
    moduleLessonsToMove: 0,
    moduleMovedLessons: 0,
    moduleDeleted: 0,
    lessonDuplicateGroups: 0,
    lessonCandidatesToDelete: 0,
    lessonDeleted: 0,
  };

  // 1) MODULE DEDUP (same course_id + normalized title)
  const { data: modules, error: modErr } = await supabase
    .from("modules")
    .select("id, course_id, title")
    .order("id", { ascending: true });
  if (modErr) throw modErr;

  const lessonsByModule = new Map();
  const { data: allLessons, error: lesErr } = await supabase
    .from("lessons")
    .select("id, module_id, title, content_url, metadata")
    .order("id", { ascending: true });
  if (lesErr) throw lesErr;
  for (const l of allLessons ?? []) {
    const mid = String(l.module_id);
    const arr = lessonsByModule.get(mid) ?? [];
    arr.push(l);
    lessonsByModule.set(mid, arr);
  }

  const modulesGrouped = new Map();
  for (const m of modules ?? []) {
    const key = `${String(m.course_id)}::${normTitle(m.title)}`;
    const arr = modulesGrouped.get(key) ?? [];
    arr.push(m);
    modulesGrouped.set(key, arr);
  }

  console.log(`Mode: ${writeMode ? "WRITE" : "DRY-RUN"}`);
  console.log("== Module dedup ==");
  for (const [groupKey, group] of modulesGrouped.entries()) {
    if (group.length <= 1) continue;
    stats.moduleDuplicateGroups += 1;

    const scored = group.map((m) => {
      const lessons = lessonsByModule.get(String(m.id)) ?? [];
      return { m, lessonCount: lessons.length };
    });
    scored.sort(
      (a, b) =>
        b.lessonCount - a.lessonCount ||
        String(a.m.id).localeCompare(String(b.m.id)),
    );
    const canonical = scored[0].m;
    const duplicates = scored.slice(1).map((x) => x.m);

    console.log(`\nGroup ${groupKey}`);
    console.log(`- keep module: ${canonical.id} (${canonical.title})`);
    for (const dup of duplicates) {
      const movedLessons = lessonsByModule.get(String(dup.id)) ?? [];
      stats.moduleCandidatesToDelete += 1;
      stats.moduleLessonsToMove += movedLessons.length;
      console.log(`- drop module: ${dup.id} | move lessons: ${movedLessons.length}`);

      if (!writeMode) continue;

      if (movedLessons.length > 0) {
        const { error: moveErr } = await supabase
          .from("lessons")
          .update({ module_id: canonical.id })
          .eq("module_id", dup.id);
        if (moveErr) throw moveErr;
        stats.moduleMovedLessons += movedLessons.length;
      }

      const remLessonCount = await countRows("lessons", "module_id", dup.id);
      if (remLessonCount === 0) {
        const { error: delErr } = await supabase.from("modules").delete().eq("id", dup.id);
        if (delErr) throw delErr;
        stats.moduleDeleted += 1;
      } else {
        console.log(`  ! skip delete module ${dup.id}; remaining lessons=${remLessonCount}`);
      }
    }
  }

  // 2) LESSON DEDUP SAFE DELETE (same module_id + normalized title)
  // only delete duplicate lesson that has NO dependencies and no content_url/metadata.
  console.log("\n== Lesson dedup (safe delete only) ==");
  const refreshedLessons = writeMode
    ? (await supabase.from("lessons").select("id, module_id, title, content_url, metadata").order("id", { ascending: true })).data ?? []
    : (allLessons ?? []);

  const lessonGroups = new Map();
  for (const l of refreshedLessons) {
    const key = `${String(l.module_id)}::${normTitle(l.title)}`;
    const arr = lessonGroups.get(key) ?? [];
    arr.push(l);
    lessonGroups.set(key, arr);
  }

  for (const [groupKey, group] of lessonGroups.entries()) {
    if (group.length <= 1) continue;
    stats.lessonDuplicateGroups += 1;

    const scored = group.map((l) => ({
      l,
      richScore:
        (hasText(l.content_url) ? 10 : 0) +
        (l.metadata && typeof l.metadata === "object" && Object.keys(l.metadata).length > 0 ? 5 : 0),
    }));
    scored.sort((a, b) => b.richScore - a.richScore || String(a.l.id).localeCompare(String(b.l.id)));
    const keep = scored[0].l;
    const drops = scored.slice(1).map((x) => x.l);
    console.log(`\nGroup ${groupKey}`);
    console.log(`- keep lesson: ${keep.id} (${keep.title})`);

    for (const drop of drops) {
      const lessonId = String(drop.id);
      const quizCount = await countRows("quizzes", "lesson_id", lessonId);
      const progressCount = await countRows("lesson_progress", "lesson_id", lessonId);
      const attemptCount = await countRows("lesson_assessment_attempts", "lesson_id", lessonId);
      const hasPayload =
        hasText(drop.content_url) ||
        (drop.metadata && typeof drop.metadata === "object" && Object.keys(drop.metadata).length > 0);
      const canDelete = quizCount === 0 && progressCount === 0 && attemptCount === 0 && !hasPayload;

      if (canDelete) {
        stats.lessonCandidatesToDelete += 1;
        console.log(`- drop lesson: ${lessonId} (safe)`);
        if (writeMode) {
          const { error: delErr } = await supabase.from("lessons").delete().eq("id", lessonId);
          if (delErr) throw delErr;
          stats.lessonDeleted += 1;
        }
      } else {
        console.log(
          `- keep duplicate lesson ${lessonId} (unsafe: quizzes=${quizCount}, progress=${progressCount}, attempts=${attemptCount}, hasPayload=${hasPayload})`,
        );
      }
    }
  }

  console.log("\nSummary:");
  console.log(stats);
}

run().catch((error) => {
  console.error("dedup-content-tree-safe failed:", error.message);
  process.exit(1);
});

