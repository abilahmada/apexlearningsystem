import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CALIBRATION_DIMENSIONS, CalibrationDimension } from "@/lib/calibration/engine";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function getParentContextFromToken(token: string) {
  const supabase = createSupabaseAdminClient();
  const authRes = await supabase.auth.getUser(token);
  const authUser = authRes.data.user;
  if (!authUser?.email) return { error: "Invalid token" as const };

  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", authUser.email)
    .single();
  if (appUserError || !appUser) return { error: "User not found" as const };
  if (String(appUser.role) !== "PARENT") return { error: "Forbidden" as const };

  return { supabase, appUser } as const;
}

type ParentValidationPayload = {
  studentUserId: string;
  agreedWithProfile: boolean;
  adjustments?: Partial<Record<CalibrationDimension, number>>;
  observations?: string;
  specialConditions?: string[];
  /**
   * Jawaban field terstruktur dari form web (basis observasi, keyakinan, dll.).
   * Validasi orang tua tidak memakai video wawancara — hanya form di aplikasi.
   */
  structuredSession?: Record<string, unknown>;
};

function sanitizeAdjustments(
  adjustments: ParentValidationPayload["adjustments"],
): Record<CalibrationDimension, number> {
  const output = {} as Record<CalibrationDimension, number>;
  for (const dim of CALIBRATION_DIMENSIONS) {
    const raw = adjustments?.[dim];
    const numeric = typeof raw === "number" ? raw : 0;
    output[dim] = Math.max(-2, Math.min(2, Math.round(numeric)));
  }
  return output;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await getParentContextFromToken(token);
    if ("error" in auth) {
      const code = auth.error === "Invalid token" ? 401 : auth.error === "Forbidden" ? 403 : 404;
      return Response.json({ message: auth.error }, { status: code });
    }
    const { supabase } = auth;

    const body = (await req.json()) as ParentValidationPayload;
    if (!body.studentUserId || typeof body.agreedWithProfile !== "boolean") {
      return Response.json(
        { message: "studentUserId dan agreedWithProfile wajib diisi." },
        { status: 400 },
      );
    }

    const { data: studentProfile, error: studentError } = await supabase
      .from("student_profiles")
      .select("id, user_id, parent_id")
      .eq("user_id", body.studentUserId)
      .single();
    if (studentError || !studentProfile) {
      return Response.json({ message: "Student profile tidak ditemukan." }, { status: 404 });
    }

    const { data: parentProfile, error: parentError } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", auth.appUser.id)
      .single();
    if (parentError || !parentProfile) {
      return Response.json({ message: "Parent profile tidak ditemukan." }, { status: 404 });
    }
    if (String(studentProfile.parent_id) !== String(parentProfile.id)) {
      return Response.json({ message: "Siswa ini tidak terhubung ke akun parent ini." }, { status: 403 });
    }

    const adjustmentMap = sanitizeAdjustments(body.adjustments);
    const conditions = Array.isArray(body.specialConditions)
      ? body.specialConditions
          .map((c) => String(c).trim())
          .filter((c) => c.length > 0)
          .slice(0, 20)
      : [];

    const rawStructured = body.structuredSession;
    const structuredSession =
      rawStructured && typeof rawStructured === "object" && !Array.isArray(rawStructured)
        ? { ...(rawStructured as Record<string, unknown>), mode: "structured_web_form" as const, version: 1 }
        : { mode: "structured_web_form" as const, version: 1 };

    const { error: upsertValidationError } = await supabase.from("parent_validations").upsert(
      {
        user_id: body.studentUserId,
        agreed_with_profile: body.agreedWithProfile,
        adjustments: adjustmentMap,
        observations: body.observations?.trim() || null,
        special_conditions: conditions,
        submitted_at: new Date().toISOString(),
        validation_channel: "FORM",
        async_video_url: null,
        session_duration_minutes: null,
        structured_session: structuredSession,
      },
      { onConflict: "user_id" },
    );

    if (upsertValidationError) {
      return Response.json({ message: upsertValidationError.message }, { status: 500 });
    }

    const { error: updateSessionError } = await supabase
      .from("assessment_sessions")
      .update({ parent_validated_at: new Date().toISOString() })
      .eq("user_id", body.studentUserId);
    if (updateSessionError) {
      return Response.json({ message: updateSessionError.message }, { status: 500 });
    }

    return Response.json({
      ok: true,
      studentUserId: body.studentUserId,
      agreedWithProfile: body.agreedWithProfile,
      adjustments: adjustmentMap,
      specialConditions: conditions,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

