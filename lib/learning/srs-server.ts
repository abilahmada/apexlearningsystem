import type { SupabaseClient } from "@supabase/supabase-js";

export type SrsScope = {
  studentProfileId: string;
  gradeLevel: string;
  moduleIds: string[];
  flashcards: Array<{
    id: string;
    module_id: string;
    question: string;
    answer: string;
    moduleTitle: string | null;
  }>;
};

/**
 * Resolve flashcards visible to the student: same curriculum grade as student_profiles.grade_level.
 */
export async function fetchStudentSrsScope(
  supabase: SupabaseClient,
  appUserId: string,
): Promise<{ ok: true; scope: SrsScope } | { ok: false; status: number; message: string }> {
  const { data: profile, error: pErr } = await supabase
    .from("student_profiles")
    .select("id, grade_level")
    .eq("user_id", appUserId)
    .single();
  if (pErr || !profile) {
    return { ok: false, status: 404, message: "Student profile tidak ditemukan." };
  }

  const gradeLevel = String(profile.grade_level ?? "").toUpperCase();
  if (!["SD", "SMP", "SMK"].includes(gradeLevel)) {
    return { ok: false, status: 400, message: "grade_level profil tidak valid." };
  }

  const { data: courses, error: cErr } = await supabase.from("courses").select("id").eq("grade_level", gradeLevel);
  if (cErr) {
    return { ok: false, status: 500, message: cErr.message };
  }
  const courseIds = (courses ?? []).map((c) => String(c.id));
  if (courseIds.length === 0) {
    return {
      ok: true,
      scope: {
        studentProfileId: String(profile.id),
        gradeLevel,
        moduleIds: [],
        flashcards: [],
      },
    };
  }

  const { data: modules, error: mErr } = await supabase.from("modules").select("id").in("course_id", courseIds);
  if (mErr) {
    return { ok: false, status: 500, message: mErr.message };
  }
  const moduleIds = (modules ?? []).map((m) => String(m.id));
  if (moduleIds.length === 0) {
    return {
      ok: true,
      scope: {
        studentProfileId: String(profile.id),
        gradeLevel,
        moduleIds: [],
        flashcards: [],
      },
    };
  }

  const { data: rows, error: fErr } = await supabase
    .from("srs_flashcards")
    .select("id, module_id, question, answer, modules(title)")
    .in("module_id", moduleIds);
  if (fErr) {
    return { ok: false, status: 500, message: fErr.message };
  }

  const flashcards = (rows ?? []).map((row: Record<string, unknown>) => {
    const mod = row.modules as { title?: string } | null;
    return {
      id: String(row.id),
      module_id: String(row.module_id),
      question: String(row.question ?? ""),
      answer: String(row.answer ?? ""),
      moduleTitle: mod?.title != null ? String(mod.title) : null,
    };
  });

  return {
    ok: true,
    scope: {
      studentProfileId: String(profile.id),
      gradeLevel,
      moduleIds,
      flashcards,
    },
  };
}

export function flashcardIdSet(scope: SrsScope): Set<string> {
  return new Set(scope.flashcards.map((f) => f.id));
}
