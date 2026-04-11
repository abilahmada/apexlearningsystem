import { requireAppUserFromRequest } from "@/lib/auth/request-user";
import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";

/**
 * GET /api/assessment/mentor-students
 * Auth: MENTOR or ADMIN.
 * Returns all student profiles for the mentor override panel.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireAppUserFromRequest(req);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });
    if (auth.role !== "MENTOR" && auth.role !== "ADMIN") {
      return jsonPrivateNoStore({ message: "Forbidden" }, { status: 403 });
    }

    const { supabase } = auth;

    const { data, error } = await supabase
      .from("student_profiles")
      .select("id, user_id, full_name, grade_level")
      .order("full_name", { ascending: true })
      .limit(500);
    if (error) return jsonPrivateNoStore({ message: error.message }, { status: 500 });

    const students = (data ?? []).map((s) => ({
      studentProfileId: String(s.id),
      studentUserId: String(s.user_id),
      fullName: String(s.full_name ?? ""),
      gradeLevel: String(s.grade_level ?? "SMP"),
    }));

    return jsonPrivateNoStore({ students });
  } catch (e) {
    return jsonPrivateNoStore({ message: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
