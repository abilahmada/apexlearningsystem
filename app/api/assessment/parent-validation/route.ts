import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getBearerToken } from "@/lib/assessment/require-student";
import {
  CALIBRATION_DIMENSIONS,
  calculateFinalPlacement,
  thetaToLevel,
  calcCI,
  type CalibrationDimension,
} from "@/lib/calibration/engine";

/**
 * Orang tua menyimpan validasi singkat terhadap profil/assessment anak.
 * `user_id` di parent_validations = user id siswa (auth.users).
 */
export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonPrivateNoStore({ message: "Missing token" }, { status: 401 });

    const supabase = createSupabaseAdminClient();
    const authRes = await supabase.auth.getUser(token);
    const authUser = authRes.data.user;
    if (!authUser?.email) return jsonPrivateNoStore({ message: "Invalid token" }, { status: 401 });

    const { data: appUser, error: uErr } = await supabase
      .from("users")
      .select("id, role")
      .eq("email", authUser.email)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (uErr || !appUser) return jsonPrivateNoStore({ message: "User not found" }, { status: 404 });
    if (String(appUser.role) !== "PARENT") {
      return jsonPrivateNoStore({ message: "Forbidden" }, { status: 403 });
    }

    const { data: parentProfile, error: pErr } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", appUser.id)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pErr || !parentProfile) {
      return jsonPrivateNoStore({ message: "Profil orang tua tidak ditemukan." }, { status: 404 });
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
      return jsonPrivateNoStore({ message: "studentUserId wajib." }, { status: 400 });
    }

    const { data: studentRow, error: sErr } = await supabase
      .from("student_profiles")
      .select("id, user_id, parent_id")
      .eq("user_id", studentUserId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (sErr || !studentRow) {
      return jsonPrivateNoStore({ message: "Profil siswa tidak ditemukan." }, { status: 404 });
    }
    if (String(studentRow.parent_id) !== String(parentProfile.id)) {
      return jsonPrivateNoStore({ message: "Siswa tidak terhubung dengan akun orang tua ini." }, { status: 403 });
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
    if (upsertErr) return jsonPrivateNoStore({ message: upsertErr.message }, { status: 500 });

    // Update session: mark parent_validated_at and advance to PLACED
    const { data: sessionRow, error: sessErr } = await supabase
      .from("assessment_sessions")
      .update({
        parent_validated_at: new Date().toISOString(),
        status: "PLACED",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", studentUserId)
      .select("intake_theta, intake_ci, sessions_completed")
      .maybeSingle();
    if (sessErr) {
      return jsonPrivateNoStore({ message: sessErr.message }, { status: 500 });
    }

    // Run final placement and persist to competency_profiles
    if (sessionRow) {
      try {
        const intakeThetaRaw = sessionRow.intake_theta as Record<string, unknown> | null;
        const intakeThetaMap: Partial<Record<CalibrationDimension, number>> = {};
        if (intakeThetaRaw && typeof intakeThetaRaw === "object") {
          for (const dim of CALIBRATION_DIMENSIONS) {
            if (typeof intakeThetaRaw[dim] === "number") {
              intakeThetaMap[dim] = Number(intakeThetaRaw[dim]);
            }
          }
        }

        const sessionsCompleted = Number(sessionRow.sessions_completed ?? 0);
        const intakeCI = typeof sessionRow.intake_ci === "number" ? sessionRow.intake_ci : 2.4;

        const result = calculateFinalPlacement({
          sessionsCompleted,
          intakeCI,
          intakeTheta: intakeThetaMap,
          signals: {},
          engagement: 5,
          parentAdjustments: adjustments as Record<CalibrationDimension, number>,
          parentAgreedWithProfile: agreed,
          continuousReviewMode: true,
        });

        if (result.dimensions.length > 0) {
          const now = new Date().toISOString();
          const upsertRows = result.dimensions.map((d) => ({
            user_id: studentUserId,
            dimension: d.dim,
            theta: d.finalTheta,
            ci: calcCI(sessionsCompleted, 5, intakeCI),
            level: thetaToLevel(d.finalTheta),
            source: "CALIBRATION" as const,
            updated_at: now,
          }));
          await supabase
            .from("competency_profiles")
            .upsert(upsertRows, { onConflict: "user_id,dimension" });

          // Persist calibration flags from placement result
          if (result.flags.length > 0) {
            const flagRows = result.flags.map((f) => ({
              user_id: studentUserId,
              flag_type: f.type,
              dimension: f.dimension ?? null,
              severity: f.severity,
              payload: f.payload ?? {},
            }));
            await supabase.from("calibration_flags").insert(flagRows);

            // Create parent_alert for each flag so the parent sees it in the portal
            const { data: parentLink } = await supabase
              .from("student_profiles")
              .select("id, parent_id")
              .eq("user_id", studentUserId)
              .maybeSingle();
            if (parentLink?.parent_id) {
              const { data: parentProfileRow } = await supabase
                .from("parent_profiles")
                .select("user_id")
                .eq("id", parentLink.parent_id)
                .maybeSingle();
              if (parentProfileRow?.user_id) {
                const alertRows = result.flags.map((f) => ({
                  parent_id: String(parentProfileRow.user_id),
                  student_id: String(parentLink.id),
                  type: f.type,
                  message_content:
                    f.type === "MISMATCH"
                      ? `Perbedaan signifikan ditemukan pada dimensi ${String(f.dimension ?? "")} (delta ${String((f.payload as { delta?: number } | undefined)?.delta?.toFixed(1) ?? "")}).`
                      : "Orang tua tidak setuju dengan profil assessment. Mentor akan meninjau.",
                  is_read: false,
                }));
                await supabase.from("parent_alerts").insert(alertRows);
              }
            }
          }
        }
      } catch {
        // Non-fatal: log but don't fail the validation save
        console.warn("[parent-validation] placement calculation error");
      }
    }

    return jsonPrivateNoStore({ ok: true });
  } catch (e) {
    return jsonPrivateNoStore(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
