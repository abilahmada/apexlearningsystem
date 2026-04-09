import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type StudentAuthOk = {
  ok: true;
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
};

export type StudentAuthErr = { ok: false; status: number; message: string };

/**
 * Verifies Supabase bearer token and ensures app user is STUDENT with student_profiles row.
 */
export async function requireStudentSession(token: string): Promise<StudentAuthOk | StudentAuthErr> {
  const supabase = createSupabaseAdminClient();
  const authRes = await supabase.auth.getUser(token);
  const authUser = authRes.data.user;
  if (!authUser?.email) return { ok: false, status: 401, message: "Invalid token" };

  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", authUser.email)
    .single();
  if (appUserError || !appUser) return { ok: false, status: 404, message: "User not found" };
  if (String(appUser.role) !== "STUDENT") return { ok: false, status: 403, message: "Forbidden" };

  const { data: studentProfile, error: studentError } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("user_id", appUser.id)
    .single();
  if (studentError || !studentProfile) {
    return { ok: false, status: 404, message: "Student profile not found" };
  }

  return { ok: true, supabase, userId: String(appUser.id) };
}

export function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function addDays(iso: string | Date, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Returns existing assessment session or creates PENDING session (14-day window starts after intake completion).
 */
export async function ensureAssessmentSession(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
) {
  const { data: existing, error: selErr } = await supabase
    .from("assessment_sessions")
    .select("id, user_id, status, calibration_ends_at, intake_theta, started_at, intake_ci")
    .eq("user_id", userId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) return existing;

  const { data: created, error: insErr } = await supabase
    .from("assessment_sessions")
    .insert({
      user_id: userId,
      status: "PENDING",
      calibration_ends_at: addDays(new Date(), 365),
      intake_theta: {},
    })
    .select("id, user_id, status, calibration_ends_at, intake_theta, started_at, intake_ci")
    .single();
  if (insErr) throw new Error(insErr.message);
  return created;
}
