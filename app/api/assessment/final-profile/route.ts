import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  CALIBRATION_DIMENSIONS,
  ciToConfidenceBand,
  placementTrend,
  thetaToLevel,
} from "@/lib/calibration/engine";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

type NumericProfileDim = {
  finalTheta: number;
  intakeTheta: number;
  delta: number;
  level: string;
  ci: number;
};

type PublicProfileDim = {
  level: string;
  trend: "up" | "down" | "stable";
  confidenceBand: "narrow" | "moderate" | "wide";
};

function buildNumericProfile(
  intake: Record<string, number>,
  thetaSource: Record<string, number>,
  ci: number,
): Record<string, NumericProfileDim> {
  const profile: Record<string, NumericProfileDim> = {};
  for (const dim of CALIBRATION_DIMENSIONS) {
    const finalTheta = Number(thetaSource[dim] ?? 5);
    const intakeTheta = Number(intake[dim] ?? 5);
    profile[dim] = {
      finalTheta: Math.round(finalTheta * 10) / 10,
      intakeTheta: Math.round(intakeTheta * 10) / 10,
      delta: Math.round((finalTheta - intakeTheta) * 10) / 10,
      level: thetaToLevel(finalTheta),
      ci: Math.round(ci * 10) / 10,
    };
  }
  return profile;
}

function buildPublicProfile(
  intake: Record<string, number>,
  thetaSource: Record<string, number>,
  ci: number,
): Record<string, PublicProfileDim> {
  const band = ciToConfidenceBand(ci);
  const profile: Record<string, PublicProfileDim> = {};
  for (const dim of CALIBRATION_DIMENSIONS) {
    const finalTheta = Number(thetaSource[dim] ?? 5);
    const intakeTheta = Number(intake[dim] ?? 5);
    profile[dim] = {
      level: thetaToLevel(finalTheta),
      trend: placementTrend(intakeTheta, finalTheta),
      confidenceBand: band,
    };
  }
  return profile;
}

async function recommendedModulesForUser(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("assessment_remediation_queue")
    .select("dimension, concept_key, priority, created_at")
    .eq("user_id", userId)
    .in("status", ["PENDING", "IN_PROGRESS"])
    .order("created_at", { ascending: false });

  const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const sorted = [...(data ?? [])].sort(
    (a, b) =>
      (priorityOrder[String(a.priority)] ?? 9) - (priorityOrder[String(b.priority)] ?? 9),
  );

  const out: Record<string, string> = {};
  for (const row of sorted) {
    const d = String(row.dimension);
    if (out[d]) continue;
    const raw = String(row.concept_key ?? "remediation")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    out[d] = raw || "remediation";
  }
  return out;
}

async function loadPlacedSession(supabase: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const { data: session, error: sessionError } = await supabase
    .from("assessment_sessions")
    .select("status, placement_locked_at, intake_theta, final_theta, intake_ci")
    .eq("user_id", userId)
    .maybeSingle();
  if (sessionError) return { error: sessionError.message as string };
  if (!session) return { error: "Assessment session not found" as const };
  if (String(session.status) !== "PLACED") return { error: "Final profile not ready yet" as const };

  const thetaSource = ((session.final_theta as Record<string, number> | null) ??
    (session.intake_theta as Record<string, number> | null) ??
    {}) as Record<string, number>;
  const intake = (session.intake_theta as Record<string, number> | null) ?? {};
  const ci = Number(session.intake_ci ?? 2.4);

  return {
    session,
    thetaSource,
    intake,
    ci,
  } as const;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const supabase = createSupabaseAdminClient();
    const authRes = await supabase.auth.getUser(token);
    const authUser = authRes.data.user;
    if (!authUser?.email) return Response.json({ message: "Invalid token" }, { status: 401 });

    const { data: appUser, error: userErr } = await supabase
      .from("users")
      .select("id, role")
      .eq("email", authUser.email)
      .single();
    if (userErr || !appUser) return Response.json({ message: "User not found" }, { status: 404 });

    const role = String(appUser.role);

    if (role === "STUDENT") {
      const loaded = await loadPlacedSession(supabase, String(appUser.id));
      if ("error" in loaded) {
        const msg = loaded.error;
        const code =
          msg === "Final profile not ready yet" ? 409 : msg === "Assessment session not found" ? 404 : 500;
        return Response.json({ message: msg }, { status: code });
      }
      const { session, thetaSource, intake, ci } = loaded;
      const recommendedStartModules = await recommendedModulesForUser(supabase, String(appUser.id));
      return Response.json({
        placedAt: session.placement_locked_at,
        profile: buildPublicProfile(intake, thetaSource, ci),
        flags: [],
        recommendedStartModules,
      });
    }

    if (role === "MENTOR" || role === "ADMIN") {
      const url = new URL(req.url);
      const targetUserId = url.searchParams.get("userId")?.trim();
      if (!targetUserId) {
        return Response.json({ message: "Untuk mentor/admin, sertakan ?userId=<student_user_uuid>" }, { status: 400 });
      }
      const loaded = await loadPlacedSession(supabase, targetUserId);
      if ("error" in loaded) {
        const msg = loaded.error;
        const code =
          msg === "Final profile not ready yet" ? 409 : msg === "Assessment session not found" ? 404 : 500;
        return Response.json({ message: msg }, { status: code });
      }
      const { session, thetaSource, intake, ci } = loaded;
      const recommendedStartModules = await recommendedModulesForUser(supabase, targetUserId);
      return Response.json({
        userId: targetUserId,
        placedAt: session.placement_locked_at,
        profile: buildNumericProfile(intake, thetaSource, ci),
        flags: [],
        recommendedStartModules,
      });
    }

    if (role !== "PARENT") {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const targetUserIdParam = url.searchParams.get("userId")?.trim();
    const targetStudentProfileId = url.searchParams.get("studentProfileId")?.trim();
    if (!targetUserIdParam && !targetStudentProfileId) {
      return Response.json(
        { message: "Untuk parent, sertakan query ?userId=<student_user_id> atau ?studentProfileId=<student_profile_id>" },
        { status: 400 },
      );
    }

    const { data: parentProfile, error: parentProfileErr } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", appUser.id)
      .single();
    if (parentProfileErr || !parentProfile) {
      return Response.json({ message: "Parent profile not found" }, { status: 404 });
    }

    let studentQuery = supabase.from("student_profiles").select("id, user_id, parent_id");
    if (targetUserIdParam) {
      studentQuery = studentQuery.eq("user_id", targetUserIdParam);
    } else {
      studentQuery = studentQuery.eq("id", targetStudentProfileId);
    }
    const { data: studentProfile, error: studentErr } = await studentQuery.single();
    if (studentErr || !studentProfile) {
      return Response.json({ message: "Student profile not found" }, { status: 404 });
    }
    if (String(studentProfile.parent_id) !== String(parentProfile.id)) {
      return Response.json({ message: "Student is not linked to this parent" }, { status: 403 });
    }
    const targetUserId = String(studentProfile.user_id);

    const loaded = await loadPlacedSession(supabase, targetUserId);
    if ("error" in loaded) {
      const msg = loaded.error;
      const code =
        msg === "Final profile not ready yet" ? 409 : msg === "Assessment session not found" ? 404 : 500;
      return Response.json({ message: msg }, { status: code });
    }
    const { session, thetaSource, intake, ci } = loaded;
    const recommendedStartModules = await recommendedModulesForUser(supabase, targetUserId);

    return Response.json({
      userId: targetUserId,
      studentProfileId: String(studentProfile.id),
      placedAt: session.placement_locked_at,
      profile: buildPublicProfile(intake, thetaSource, ci),
      flags: [],
      recommendedStartModules,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
