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
  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch (e) {
    return {
      ok: false,
      status: 503,
      message: e instanceof Error ? e.message : "Konfigurasi server tidak lengkap.",
    };
  }
  const authRes = await supabase.auth.getUser(token);
  if (authRes.error) {
    return {
      ok: false,
      status: 401,
      message: authRes.error.message?.trim() || "Invalid token",
    };
  }
  const authUser = authRes.data.user;
  if (!authUser?.email) return { ok: false, status: 401, message: "Invalid token" };

  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", authUser.email)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (appUserError || !appUser) return { ok: false, status: 404, message: "User not found" };
  if (String(appUser.role) !== "STUDENT") return { ok: false, status: 403, message: "Forbidden" };

  const { data: studentProfile, error: studentError } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("user_id", appUser.id)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
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

const SESSION_SELECT = "id, user_id, status, calibration_ends_at, intake_theta, started_at, intake_ci, parent_validated_at, sessions_completed" as const;

/**
 * Returns existing assessment session or creates PENDING session.
 * Race-condition safe: jika INSERT gagal dengan duplicate-key (constraint assessment_sessions_user_id_key),
 * langsung re-fetch baris yang sudah ada.
 */
export async function ensureAssessmentSession(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
) {
  // 1. Coba ambil yang sudah ada
  const { data: existing, error: selErr } = await supabase
    .from("assessment_sessions")
    .select(SESSION_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) return existing;

  // 2. Buat baru; jika terjadi race-condition (duplicate key), re-fetch
  const { data: created, error: insErr } = await supabase
    .from("assessment_sessions")
    .insert({
      user_id: userId,
      status: "PENDING",
      calibration_ends_at: addDays(new Date(), 365),
      intake_theta: {},
    })
    .select(SESSION_SELECT)
    .single();

  if (insErr) {
    // Unique constraint violation — sesi sudah dibuat oleh request paralel
    const isDuplicate =
      insErr.code === "23505" ||
      insErr.message?.includes("duplicate key") ||
      insErr.message?.includes("unique constraint");
    if (isDuplicate) {
      const { data: retried, error: retryErr } = await supabase
        .from("assessment_sessions")
        .select(SESSION_SELECT)
        .eq("user_id", userId)
        .single();
      if (retryErr) throw new Error(retryErr.message);
      return retried;
    }
    throw new Error(insErr.message);
  }

  return created;
}
