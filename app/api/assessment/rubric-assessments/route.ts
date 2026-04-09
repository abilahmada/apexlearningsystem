import { requireAppUserFromRequest } from "@/lib/auth/request-user";

type AssessmentItemPayload = {
  criterionId?: string;
  level?: number;
  mentorNote?: string;
  evidenceLink?: string;
};

type CreateAssessmentPayload = {
  rubricId?: string;
  studentId?: string;
  projectTitle?: string;
  notes?: string;
  items?: AssessmentItemPayload[];
};

function parseUuid(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
  return t.toLowerCase();
}

function scoreBand(totalScore: number): string {
  if (totalScore >= 14) return "Mastery (APEX Standard)";
  if (totalScore >= 10) return "Proficient";
  if (totalScore >= 6) return "Developing";
  return "Beginner";
}

export async function GET(req: Request) {
  try {
    const auth = await requireAppUserFromRequest(req);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const url = new URL(req.url);
    const rubricId = parseUuid(url.searchParams.get("rubricId"));
    const studentId = parseUuid(url.searchParams.get("studentId"));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    let effectiveStudentId: string | null = studentId;
    if (auth.role === "STUDENT") {
      const { data: profile, error: profileErr } = await auth.supabase
        .from("student_profiles")
        .select("id")
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (profileErr || !profile?.id) {
        return Response.json({ message: "Student profile tidak ditemukan." }, { status: 404 });
      }
      effectiveStudentId = String(profile.id);
    } else if (auth.role !== "MENTOR" && auth.role !== "ADMIN") {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }

    let q = auth.supabase
      .from("rubric_assessments")
      .select(
        `
        id,
        rubric_id,
        student_id,
        assessor_user_id,
        project_title,
        total_score,
        band_label,
        notes,
        created_at,
        rubrics (code, name, grade_level, task_title),
        student_profiles (full_name, grade_level),
        users (email)
      `,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (rubricId) q = q.eq("rubric_id", rubricId);
    if (effectiveStudentId) q = q.eq("student_id", effectiveStudentId);

    const { data: assessments, error, count } = await q;
    if (error) return Response.json({ message: error.message }, { status: 500 });

    const assessmentIds = (assessments ?? []).map((x) => String(x.id));
    const { data: itemRows, error: itemErr } = await auth.supabase
      .from("rubric_assessment_items")
      .select(
        `
        assessment_id,
        criterion_id,
        level,
        score,
        mentor_note,
        evidence_link,
        rubric_criteria (criterion_code, criterion_name, sort_order)
      `,
      )
      .in("assessment_id", assessmentIds.length ? assessmentIds : ["00000000-0000-0000-0000-000000000000"]);
    if (itemErr) return Response.json({ message: itemErr.message }, { status: 500 });

    const itemMap = new Map<string, Array<Record<string, unknown>>>();
    for (const row of itemRows ?? []) {
      const key = String(row.assessment_id);
      const arr = itemMap.get(key) ?? [];
      const criterion = Array.isArray(row.rubric_criteria) ? row.rubric_criteria[0] : row.rubric_criteria;
      arr.push({
        criterionId: row.criterion_id,
        criterionCode: criterion?.criterion_code ?? null,
        criterionName: criterion?.criterion_name ?? null,
        sortOrder: criterion?.sort_order ?? null,
        level: row.level,
        score: row.score,
        mentorNote: row.mentor_note ?? null,
        evidenceLink: row.evidence_link ?? null,
      });
      itemMap.set(key, arr);
    }

    const items = (assessments ?? []).map((row) => {
      const rubric = Array.isArray(row.rubrics) ? row.rubrics[0] : row.rubrics;
      const student = Array.isArray(row.student_profiles) ? row.student_profiles[0] : row.student_profiles;
      const assessor = Array.isArray(row.users) ? row.users[0] : row.users;
      const detailItems = (itemMap.get(String(row.id)) ?? []).sort(
        (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0),
      );
      return {
        id: row.id,
        rubricId: row.rubric_id,
        studentId: row.student_id,
        assessorUserId: row.assessor_user_id,
        projectTitle: row.project_title ?? null,
        totalScore: row.total_score,
        bandLabel: row.band_label,
        notes: row.notes ?? null,
        createdAt: row.created_at,
        rubric: rubric
          ? {
              code: rubric.code,
              name: rubric.name,
              gradeLevel: rubric.grade_level,
              taskTitle: rubric.task_title,
            }
          : null,
        student: student ? { fullName: student.full_name, gradeLevel: student.grade_level } : null,
        assessor: assessor ? { email: assessor.email } : null,
        items: detailItems,
      };
    });

    return Response.json({ items, total: count ?? items.length, limit, offset });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAppUserFromRequest(req);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });
    if (auth.role !== "MENTOR" && auth.role !== "ADMIN") {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as CreateAssessmentPayload;
    const rubricId = parseUuid(body.rubricId);
    const studentId = parseUuid(body.studentId);
    const projectTitle = String(body.projectTitle ?? "").trim();
    const notes = String(body.notes ?? "").trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!rubricId) return Response.json({ message: "rubricId (UUID) wajib." }, { status: 400 });
    if (!studentId) return Response.json({ message: "studentId (UUID) wajib." }, { status: 400 });
    if (items.length === 0) return Response.json({ message: "items wajib diisi." }, { status: 400 });

    const { data: rubric, error: rubricErr } = await auth.supabase
      .from("rubrics")
      .select("id, max_points")
      .eq("id", rubricId)
      .eq("is_active", true)
      .maybeSingle();
    if (rubricErr) return Response.json({ message: rubricErr.message }, { status: 500 });
    if (!rubric) return Response.json({ message: "Rubric tidak ditemukan." }, { status: 404 });

    const { data: criteria, error: criteriaErr } = await auth.supabase
      .from("rubric_criteria")
      .select("id")
      .eq("rubric_id", rubricId);
    if (criteriaErr) return Response.json({ message: criteriaErr.message }, { status: 500 });

    const validCriterionIds = new Set((criteria ?? []).map((x) => String(x.id)));
    if (validCriterionIds.size === 0) {
      return Response.json({ message: "Rubric belum punya criteria." }, { status: 400 });
    }

    const normalizedItems: Array<{
      criterionId: string;
      level: number;
      mentorNote: string | null;
      evidenceLink: string | null;
    }> = [];
    const seen = new Set<string>();
    for (const item of items) {
      const criterionId = parseUuid(item.criterionId);
      const level = Number(item.level);
      if (!criterionId || !validCriterionIds.has(criterionId)) {
        return Response.json({ message: "criterionId tidak valid." }, { status: 400 });
      }
      if (!Number.isInteger(level) || level < 1 || level > 4) {
        return Response.json({ message: "level harus 1..4." }, { status: 400 });
      }
      if (seen.has(criterionId)) {
        return Response.json({ message: "criterion duplikat dalam items." }, { status: 400 });
      }
      seen.add(criterionId);
      normalizedItems.push({
        criterionId,
        level,
        mentorNote: typeof item.mentorNote === "string" ? item.mentorNote.trim() : null,
        evidenceLink: typeof item.evidenceLink === "string" ? item.evidenceLink.trim() : null,
      });
    }

    if (seen.size !== validCriterionIds.size) {
      return Response.json(
        { message: "Semua criterion pada rubric harus dinilai sebelum submit." },
        { status: 400 },
      );
    }

    const totalScore = normalizedItems.reduce((sum, x) => sum + x.level, 0);
    const maxPoints = Number(rubric.max_points ?? validCriterionIds.size * 4);
    if (totalScore > maxPoints) {
      return Response.json({ message: "Total score melebihi max rubric." }, { status: 400 });
    }

    const bandLabel = scoreBand(totalScore);
    const { data: created, error: createErr } = await auth.supabase
      .from("rubric_assessments")
      .insert({
        rubric_id: rubricId,
        student_id: studentId,
        assessor_user_id: auth.userId,
        project_title: projectTitle || null,
        total_score: totalScore,
        band_label: bandLabel,
        notes: notes || null,
      })
      .select("id")
      .single();
    if (createErr || !created?.id) {
      return Response.json({ message: createErr?.message ?? "Gagal membuat assessment." }, { status: 500 });
    }

    const rows = normalizedItems.map((x) => ({
      assessment_id: created.id,
      criterion_id: x.criterionId,
      level: x.level,
      score: x.level,
      mentor_note: x.mentorNote,
      evidence_link: x.evidenceLink,
    }));
    const { error: itemInsertErr } = await auth.supabase.from("rubric_assessment_items").insert(rows);
    if (itemInsertErr) return Response.json({ message: itemInsertErr.message }, { status: 500 });

    return Response.json(
      {
        ok: true,
        assessmentId: created.id,
        totalScore,
        maxPoints,
        bandLabel,
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
