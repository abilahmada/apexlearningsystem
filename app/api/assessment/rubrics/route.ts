import { requireAppUserFromRequest } from "@/lib/auth/request-user";

function toBool(raw: string | null, fallback: boolean) {
  if (raw == null) return fallback;
  const t = raw.trim().toLowerCase();
  if (t === "1" || t === "true" || t === "yes") return true;
  if (t === "0" || t === "false" || t === "no") return false;
  return fallback;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAppUserFromRequest(req);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const url = new URL(req.url);
    const code = (url.searchParams.get("code") ?? "").trim();
    const gradeLevel = (url.searchParams.get("gradeLevel") ?? "").trim();
    const activeOnly = toBool(url.searchParams.get("activeOnly"), true);

    let q = auth.supabase.from("rubrics").select("*").order("created_at", { ascending: false });
    if (code) q = q.eq("code", code);
    if (gradeLevel) q = q.eq("grade_level", gradeLevel);
    if (activeOnly) q = q.eq("is_active", true);

    const { data: rubrics, error } = await q;
    if (error) return Response.json({ message: error.message }, { status: 500 });

    const rubricIds = (rubrics ?? []).map((x) => String(x.id));
    if (rubricIds.length === 0) return Response.json({ items: [] });

    const { data: criteriaRows, error: criteriaErr } = await auth.supabase
      .from("rubric_criteria")
      .select("*")
      .in("rubric_id", rubricIds)
      .order("sort_order", { ascending: true });
    if (criteriaErr) return Response.json({ message: criteriaErr.message }, { status: 500 });

    const criterionIds = (criteriaRows ?? []).map((x) => String(x.id));
    const { data: levelRows, error: levelErr } = await auth.supabase
      .from("rubric_levels")
      .select("*")
      .in("criterion_id", criterionIds.length > 0 ? criterionIds : ["00000000-0000-0000-0000-000000000000"])
      .order("level", { ascending: true });
    if (levelErr) return Response.json({ message: levelErr.message }, { status: 500 });

    const levelsByCriterion = new Map<string, Array<Record<string, unknown>>>();
    for (const lvl of levelRows ?? []) {
      const criterionId = String(lvl.criterion_id);
      const arr = levelsByCriterion.get(criterionId) ?? [];
      arr.push({
        id: lvl.id,
        level: lvl.level,
        label: lvl.level_label,
        descriptor: lvl.descriptor,
      });
      levelsByCriterion.set(criterionId, arr);
    }

    const criteriaByRubric = new Map<string, Array<Record<string, unknown>>>();
    for (const criterion of criteriaRows ?? []) {
      const rubricId = String(criterion.rubric_id);
      const arr = criteriaByRubric.get(rubricId) ?? [];
      arr.push({
        id: criterion.id,
        code: criterion.criterion_code,
        name: criterion.criterion_name,
        weightPct: Number(criterion.weight_pct ?? 0),
        sortOrder: Number(criterion.sort_order ?? 0),
        levels: levelsByCriterion.get(String(criterion.id)) ?? [],
      });
      criteriaByRubric.set(rubricId, arr);
    }

    const items = (rubrics ?? []).map((rubric) => ({
      id: rubric.id,
      code: rubric.code,
      name: rubric.name,
      framework: rubric.framework,
      gradeLevel: rubric.grade_level,
      taskTitle: rubric.task_title,
      maxPoints: rubric.max_points,
      isActive: rubric.is_active,
      metadata: rubric.metadata ?? {},
      criteria: criteriaByRubric.get(String(rubric.id)) ?? [],
    }));

    return Response.json({ items });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
