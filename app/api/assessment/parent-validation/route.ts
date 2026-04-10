import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getBearerToken } from "@/lib/assessment/require-student";

/**
 * Orang tua menyimpan validasi singkat terhadap profil/assessment anak.
 * `user_id` di parent_validations = user id siswa (auth.users).
 */
export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const supabase = createSupabaseAdminClient();
    const authRes = await supabase.auth.getUser(token);
    const authUser = authRes.data.user;
    if (!authUser?.email) return Response.json({ message: "Invalid token" }, { status: 401 });

    const { data: appUser, error: uErr } = await supabase
      .from("users")
      .select("id, role")
      .eq("email", authUser.email)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (uErr || !appUser) return Response.json({ message: "User not found" }, { status: 404 });
    if (String(appUser.role) !== "PARENT") {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }

    const { data: parentProfile, error: pErr } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", appUser.id)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pErr || !parentProfile) {
      return Response.json({ message: "Profil orang tua tidak ditemukan." }, { status: 404 });
    }

    const body = (await req.json()) as {
      studentUserId?: string;
      agreedWithProfile?: boolean;
      adjustments?: Record<string, number>;
      observations?: string;
      specialConditions?: string[];
      structuredSession?: Record<string, unknown>;
    };

    const studentUserId = String(body.studentUserId ?? "").trim();
    if (!studentUserId) {
      return Response.json({ message: "studentUserId wajib." }, { status: 400 });
    }

    const { data: studentRow, error: sErr } = await supabase
      .from("student_profiles")
      .select("id, user_id, parent_id")
      .eq("user_id", studentUserId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (sErr || !studentRow) {
      return Response.json({ message: "Profil siswa tidak ditemukan." }, { status: 404 });
    }
    if (String(studentRow.parent_id) !== String(parentProfile.id)) {
      return Response.json({ message: "Siswa tidak terhubung dengan akun orang tua ini." }, { status: 403 });
    }

    const agreed = body.agreedWithProfile !== false;
    const adjustments = body.adjustments && typeof body.adjustments === "object" ? body.adjustments : {};
    const observations = typeof body.observations === "string" ? body.observations.slice(0, 8000) : null;
    const special = Array.isArray(body.specialConditions) ? body.specialConditions.map(String) : [];

    const { error: upsertErr } = await supabase.from("parent_validations").upsert(
      {
        user_id: studentUserId,
        agreed_with_profile: agreed,
        adjustments,
        observations,
        special_conditions: special,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (upsertErr) return Response.json({ message: upsertErr.message }, { status: 500 });

    const { error: sessErr } = await supabase
      .from("assessment_sessions")
      .update({
        parent_validated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", studentUserId);
    if (sessErr) {
      return Response.json({ message: sessErr.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
