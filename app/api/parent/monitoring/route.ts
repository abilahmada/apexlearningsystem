import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getBearerToken } from "@/lib/assessment/require-student";
import { CALIBRATION_DIMENSIONS, thetaToLevel } from "@/lib/calibration/engine";

async function requireParent(token: string) {
  const supabase = createSupabaseAdminClient();
  const { data: authData } = await supabase.auth.getUser(token);
  const authUser = authData.user;
  if (!authUser?.email) return { ok: false as const, status: 401, message: "Invalid token" };

  const { data: appUser, error: uErr } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", authUser.email)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (uErr || !appUser) return { ok: false as const, status: 404, message: "User not found" };
  if (String(appUser.role) !== "PARENT") return { ok: false as const, status: 403, message: "Forbidden" };

  const { data: parentProfile, error: pErr } = await supabase
    .from("parent_profiles")
    .select("id, full_name, parent_link_code")
    .eq("user_id", appUser.id)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pErr || !parentProfile) return { ok: false as const, status: 404, message: "Profil orang tua tidak ditemukan." };

  return { ok: true as const, supabase, appUserId: String(appUser.id), parentProfile };
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireParent(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const { supabase, appUserId, parentProfile } = auth;

    // 1. Students linked to this parent
    const { data: studentRows, error: sErr } = await supabase
      .from("student_profiles")
      .select("id, user_id, full_name, grade_level")
      .eq("parent_id", parentProfile.id)
      .order("id", { ascending: true });
    if (sErr) return Response.json({ message: sErr.message }, { status: 500 });

    const students = studentRows ?? [];
    const studentUserIds = students.map((s) => String(s.user_id));
    const studentProfileIds = students.map((s) => String(s.id));

    // 2. Assessment sessions + competency profiles for all students (parallel)
    const [sessionsRes, profilesRes, validationsRes, progressRes] = await Promise.all([
      studentUserIds.length > 0
        ? supabase
            .from("assessment_sessions")
            .select("user_id, status, intake_theta, intake_ci, sessions_completed, parent_validated_at")
            .in("user_id", studentUserIds)
        : Promise.resolve({ data: [], error: null }),

      studentUserIds.length > 0
        ? supabase
            .from("competency_profiles")
            .select("user_id, dimension, theta, ci, level")
            .in("user_id", studentUserIds)
        : Promise.resolve({ data: [], error: null }),

      studentUserIds.length > 0
        ? supabase
            .from("parent_validations")
            .select("user_id, agreed_with_profile, adjustments, observations, submitted_at")
            .in("user_id", studentUserIds)
        : Promise.resolve({ data: [], error: null }),

      studentProfileIds.length > 0
        ? supabase
            .from("lesson_progress")
            .select("student_id, posttest_score, posttest_passed")
            .in("student_id", studentProfileIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const sessionMap = new Map<string, typeof sessionsRes.data extends Array<infer T> | null ? T : never>();
    for (const s of sessionsRes.data ?? []) sessionMap.set(String(s.user_id), s);

    const profileMap = new Map<string, Record<string, string>>();
    for (const p of profilesRes.data ?? []) {
      const key = String(p.user_id);
      if (!profileMap.has(key)) profileMap.set(key, {});
      const lvl = String(p.level ?? thetaToLevel(Number(p.theta ?? 5)));
      profileMap.get(key)![String(p.dimension)] = lvl;
    }

    const validationMap = new Map<string, typeof validationsRes.data extends Array<infer T> | null ? T : never>();
    for (const v of validationsRes.data ?? []) validationMap.set(String(v.user_id), v);

    // Group progress by student_id (student_profiles.id)
    const progressByStudent = new Map<string, { totalScore: number; count: number; passed: number }>();
    for (const lp of progressRes.data ?? []) {
      const sid = String(lp.student_id);
      const cur = progressByStudent.get(sid) ?? { totalScore: 0, count: 0, passed: 0 };
      if (typeof lp.posttest_score === "number") {
        cur.totalScore += lp.posttest_score;
        cur.count += 1;
      }
      if (lp.posttest_passed) cur.passed += 1;
      progressByStudent.set(sid, cur);
    }

    // 3. Parent alerts
    const { data: alertRows } = await supabase
      .from("parent_alerts")
      .select("id, student_id, type, message_content, is_read, created_at")
      .eq("parent_id", appUserId)
      .order("created_at", { ascending: false })
      .limit(100);

    // 4. Build response
    const studentsOut = students.map((s) => {
      const sUserId = String(s.user_id);
      const sProfileId = String(s.id);
      const session = sessionMap.get(sUserId);
      const validation = validationMap.get(sUserId);
      const prog = progressByStudent.get(sProfileId);
      const avgScore = prog && prog.count > 0 ? Math.round(prog.totalScore / prog.count) : 0;
      const completedModules = prog?.passed ?? 0;

      // assessmentProfile: prefer competency_profiles, fallback to intake_theta in session
      const assessmentProfile: Record<string, { level: string }> = {};
      const cpByDim = profileMap.get(sUserId);
      const intakeThetaRaw = session?.intake_theta as Record<string, unknown> | null;

      for (const dim of CALIBRATION_DIMENSIONS) {
        if (cpByDim?.[dim]) {
          assessmentProfile[dim] = { level: cpByDim[dim] };
        } else if (intakeThetaRaw && typeof intakeThetaRaw[dim] === "number") {
          assessmentProfile[dim] = { level: thetaToLevel(Number(intakeThetaRaw[dim])) };
        }
      }

      return {
        studentProfileId: sProfileId,
        studentUserId: sUserId,
        studentName: String(s.full_name ?? "") || "—",
        gradeLevel: String(s.grade_level ?? "SMP"),
        currentGradeClass: 0,
        avgScore,
        completedModules,
        latestConfusedTopic: null,
        latestValidation: validation
          ? {
              agreedWithProfile: Boolean(validation.agreed_with_profile),
              adjustments: (validation.adjustments && typeof validation.adjustments === "object"
                ? validation.adjustments
                : {}) as Record<string, number>,
              observations: validation.observations ? String(validation.observations) : null,
              submittedAt: String(validation.submitted_at ?? ""),
            }
          : null,
        assessmentProfile,
      };
    });

    return Response.json({
      parent: {
        id: String(parentProfile.id),
        name: String(parentProfile.full_name ?? ""),
        parentLinkCode: parentProfile.parent_link_code ? String(parentProfile.parent_link_code) : null,
      },
      students: studentsOut,
      alerts: (alertRows ?? []).map((a) => ({
        id: String(a.id),
        student_id: String(a.student_id),
        type: String(a.type ?? "INFO"),
        message_content: String(a.message_content ?? ""),
        is_read: Boolean(a.is_read),
        created_at: String(a.created_at ?? ""),
      })),
    });
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await requireParent(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const { supabase, appUserId } = auth;

    const body = (await req.json()) as {
      alertId?: string;
      markAllForStudent?: boolean;
      studentId?: string;
      isRead?: boolean;
    };

    if (body.markAllForStudent && body.studentId) {
      await supabase
        .from("parent_alerts")
        .update({ is_read: true })
        .eq("parent_id", appUserId)
        .eq("student_id", body.studentId);
    } else if (body.alertId) {
      await supabase
        .from("parent_alerts")
        .update({ is_read: body.isRead ?? true })
        .eq("id", body.alertId)
        .eq("parent_id", appUserId);
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
