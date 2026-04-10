import { isAdminRequest } from "@/lib/auth/admin-request";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function isMissingArchiveTableError(error: unknown): boolean {
  const e = (error ?? {}) as { code?: string; message?: string; details?: string; hint?: string };
  const text = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`.toLowerCase();
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  return (
    text.includes("student_progress_grade_archives") &&
    (text.includes("does not exist") || text.includes("schema cache") || text.includes("could not find"))
  );
}

export async function GET(req: Request) {
  try {
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) return Response.json({ message: "Forbidden" }, { status: 403 });

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("student_progress_grade_archives")
      .select("id, student_profile_id, user_id, from_grade, to_grade, archived_at, lesson_progress_count, assessment_attempt_count")
      .order("archived_at", { ascending: false })
      .limit(20);
    if (error) {
      if (isMissingArchiveTableError(error)) {
        return Response.json({
          summary: {
            totalArchives: 0,
            archivedLessonProgress: 0,
            archivedAssessmentAttempts: 0,
            checkedAt: new Date().toISOString(),
          },
          items: [],
          unavailable: true,
          message:
            "Tabel arsip perubahan jenjang belum tersedia di database ini. Jalankan migration grade archive lalu refresh panel admin.",
        });
      }
      return Response.json({ message: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const totalArchives = rows.length;
    const archivedLessonProgress = rows.reduce(
      (sum, row) => sum + Math.max(0, Number(row.lesson_progress_count ?? 0)),
      0,
    );
    const archivedAssessmentAttempts = rows.reduce(
      (sum, row) => sum + Math.max(0, Number(row.assessment_attempt_count ?? 0)),
      0,
    );

    return Response.json({
      summary: {
        totalArchives,
        archivedLessonProgress,
        archivedAssessmentAttempts,
        checkedAt: new Date().toISOString(),
      },
      items: rows,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
