import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const inputPath = process.env.APEX_RUBRIC_FILE ?? "data/rubrics/pbl-ibmyp-grade9.json";

if (!url || !serviceRoleKey) {
  console.error(
    "Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function readRubricFile(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  const text = await fs.readFile(resolved, "utf-8");
  const doc = JSON.parse(text);
  assert(doc && typeof doc === "object", "Rubric file must be an object");
  assert(String(doc.rubricId ?? "").trim(), "rubricId is required");
  assert(String(doc.rubricName ?? "").trim(), "rubricName is required");
  assert(Array.isArray(doc.criteria) && doc.criteria.length > 0, "criteria must be non-empty");
  return doc;
}

async function run() {
  const doc = await readRubricFile(inputPath);
  const code = String(doc.rubricId).trim();
  const name = String(doc.rubricName).trim();
  const framework = String(doc.framework ?? "IB MYP (adapted)").trim();
  const gradeLevel = String(doc.gradeLevel ?? "").trim();
  const taskTitle = String(doc.taskTitle ?? "").trim();
  const maxPoints = Number(doc.maxPoints ?? 16);

  const { data: rubricRow, error: rubricErr } = await supabase
    .from("rubrics")
    .upsert(
      {
        code,
        name,
        framework,
        grade_level: gradeLevel,
        task_title: taskTitle,
        max_points: Number.isFinite(maxPoints) && maxPoints > 0 ? Math.round(maxPoints) : 16,
        is_active: true,
      },
      { onConflict: "code" },
    )
    .select("id, code")
    .single();
  if (rubricErr || !rubricRow) throw new Error(rubricErr?.message ?? "Failed to upsert rubric");

  const rubricId = String(rubricRow.id);
  let criteriaWritten = 0;
  let levelsWritten = 0;

  for (let i = 0; i < doc.criteria.length; i += 1) {
    const criterion = doc.criteria[i];
    const criterionCode = String(criterion.code ?? `C${i + 1}`).trim();
    const criterionName = String(criterion.name ?? "").trim();
    const weightPct = Number(criterion.weightPct ?? 25);

    const { data: criterionRow, error: criterionErr } = await supabase
      .from("rubric_criteria")
      .upsert(
        {
          rubric_id: rubricId,
          criterion_code: criterionCode,
          criterion_name: criterionName,
          weight_pct:
            Number.isFinite(weightPct) && weightPct >= 0 && weightPct <= 100 ? weightPct : 25,
          sort_order: i + 1,
        },
        { onConflict: "rubric_id,criterion_code" },
      )
      .select("id")
      .single();
    if (criterionErr || !criterionRow) {
      throw new Error(criterionErr?.message ?? `Failed to upsert criterion ${criterionCode}`);
    }
    criteriaWritten += 1;

    const levels = criterion.levels ?? {};
    for (let level = 1; level <= 4; level += 1) {
      const descriptor = String(levels[String(level)] ?? "").trim();
      assert(descriptor, `Missing descriptor for ${criterionCode} level ${level}`);

      const levelLabel =
        level === 1
          ? "Beginner"
          : level === 2
            ? "Developing"
            : level === 3
              ? "Proficient"
              : "Mastery";

      const { error: levelErr } = await supabase.from("rubric_levels").upsert(
        {
          criterion_id: criterionRow.id,
          level,
          level_label: levelLabel,
          descriptor,
        },
        { onConflict: "criterion_id,level" },
      );
      if (levelErr) throw new Error(levelErr.message);
      levelsWritten += 1;
    }
  }

  console.log(`Rubric seeded: ${code}`);
  console.log(`Criteria upserted: ${criteriaWritten}`);
  console.log(`Levels upserted: ${levelsWritten}`);
}

run().catch((error) => {
  console.error("Seed rubric failed:", error.message);
  process.exit(1);
});
