import { createSupabaseAdminClient } from "@/lib/supabase/server";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function isAdminRequest(req: Request) {
  const token = getBearerToken(req);
  if (!token) return false;

  const supabase = createSupabaseAdminClient();
  const authRes = await supabase.auth.getUser(token);
  const authUser = authRes.data.user;
  if (!authUser?.email) return false;

  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("email", authUser.email)
    .single();

  if (error || !data) return false;
  return String(data.role) === "ADMIN";
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
    if (error) return Response.json({ message: error.message }, { status: 500 });

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
