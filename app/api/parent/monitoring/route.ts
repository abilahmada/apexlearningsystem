import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { thetaToLevel } from "@/lib/calibration/engine";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

type ParentStudentSummary = {
  studentProfileId: string;
  studentUserId: string;
  studentName: string;
  gradeLevel: string;
  currentGradeClass: number;
  avgScore: number;
  completedModules: number;
  latestConfusedTopic: string | null;
  latestValidation: {
    agreedWithProfile: boolean;
    adjustments: Record<string, number>;
    observations: string | null;
    submittedAt: string;
  } | null;
  /** Descriptive level per dimension — no raw theta exposed to parents. */
  assessmentProfile: Record<string, { level: string }>;
};

async function getParentProfileIdFromToken(token: string) {
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

  const { data: parentProfile, error: parentProfileError } = await supabase
    .from("parent_profiles")
    .select("id, full_name, parent_link_code")
    .eq("user_id", appUser.id)
    .single();
  if (parentProfileError || !parentProfile) {
    return { error: "Parent profile not found" as const };
  }

  return { supabase, parentProfile } as const;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await getParentProfileIdFromToken(token);
    if ("error" in auth) {
      const code =
        auth.error === "Invalid token"
          ? 401
          : auth.error === "Parent profile not found"
            ? 404
            : 403;
      return Response.json({ message: auth.error }, { status: code });
    }
    const { supabase, parentProfile } = auth;

    const { data: students, error: studentsError } = await supabase
      .from("student_profiles")
      .select("id, user_id, full_name, grade_level, grade_class_start, grade_class_max, grade_class_start_year")
      .eq("parent_id", parentProfile.id)
      .order("created_at", { ascending: false });
    if (studentsError) {
      return Response.json({ message: studentsError.message }, { status: 500 });
    }

    const studentIds = (students ?? []).map((s) => s.id);
    const studentUserIds = (students ?? []).map((s) => String(s.user_id));
    let progressRows: Array<{ student_id: string; highest_score: number; status: string }> = [];
    let journalRows: Array<{ student_id: string; weekly_confused: string | null; created_at: string }> = [];
    let validationRows: Array<{
      user_id: string;
      agreed_with_profile: boolean;
      adjustments: Record<string, number> | null;
      observations: string | null;
      submitted_at: string;
    }> = [];
    let competencyRows: Array<{ user_id: string; dimension: string; theta: number }> = [];
    let assessmentRows: Array<{ user_id: string; intake_theta: Record<string, number> | null; final_theta: Record<string, number> | null }> = [];

    if (studentIds.length > 0) {
      const { data: progressData } = await supabase
        .from("student_progress")
        .select("student_id, highest_score, status")
        .in("student_id", studentIds);
      progressRows = progressData ?? [];

      const { data: journalData } = await supabase
        .from("metacognition_journals")
        .select("student_id, weekly_confused, created_at")
        .in("student_id", studentIds)
        .order("created_at", { ascending: false });
      journalRows = journalData ?? [];

      const { data: validationData } = await supabase
        .from("parent_validations")
        .select("user_id, agreed_with_profile, adjustments, observations, submitted_at")
        .in("user_id", studentUserIds);
      validationRows = (validationData as typeof validationRows) ?? [];

      const { data: competencyData } = await supabase
        .from("competency_profiles")
        .select("user_id, dimension, theta")
        .in("user_id", studentUserIds);
      competencyRows = (competencyData as typeof competencyRows) ?? [];

      const { data: assessmentData } = await supabase
        .from("assessment_sessions")
        .select("user_id, intake_theta, final_theta")
        .in("user_id", studentUserIds);
      assessmentRows = (assessmentData as typeof assessmentRows) ?? [];
    }

    const latestJournalByStudent = new Map<string, string | null>();
    for (const row of journalRows) {
      if (!latestJournalByStudent.has(row.student_id)) {
        latestJournalByStudent.set(row.student_id, row.weekly_confused ?? null);
      }
    }
    const latestValidationByUser = new Map<
      string,
      {
        agreedWithProfile: boolean;
        adjustments: Record<string, number>;
        observations: string | null;
        submittedAt: string;
      }
    >();
    for (const row of validationRows) {
      latestValidationByUser.set(String(row.user_id), {
        agreedWithProfile: Boolean(row.agreed_with_profile),
        adjustments: row.adjustments ?? {},
        observations: row.observations ?? null,
        submittedAt: String(row.submitted_at),
      });
    }
    const competencyByUser = new Map<string, Record<string, number>>();
    for (const row of competencyRows) {
      const userId = String(row.user_id);
      const current = competencyByUser.get(userId) ?? {};
      current[String(row.dimension)] = Number(row.theta ?? 5);
      competencyByUser.set(userId, current);
    }
    const assessmentThetaByUser = new Map<string, Record<string, number>>();
    for (const row of assessmentRows) {
      const userId = String(row.user_id);
      const finalTheta = row.final_theta ?? {};
      const intakeTheta = row.intake_theta ?? {};
      assessmentThetaByUser.set(userId, Object.keys(finalTheta).length > 0 ? finalTheta : intakeTheta);
    }

    const summary: ParentStudentSummary[] = (students ?? []).map((student) => {
      const studentProgress = progressRows.filter((p) => p.student_id === student.id);
      const avgScore =
        studentProgress.length > 0
          ? Math.round(
              (studentProgress.reduce((acc, p) => acc + Number(p.highest_score ?? 0), 0) /
                studentProgress.length) *
                10,
            ) / 10
          : 0;
      const completedModules = studentProgress.filter((p) => p.status === "MASTERED").length;

      const startClass = Number(student.grade_class_start ?? 1);
      const maxClass = Number(student.grade_class_max ?? (String(student.grade_level) === "SD" ? 6 : 3));
      const startYear = Number(student.grade_class_start_year ?? new Date().getFullYear());
      const currentYear = new Date().getFullYear();
      const progressedClass = startClass + Math.max(0, currentYear - startYear);
      const currentGradeClass = Math.min(Math.max(1, progressedClass), Math.max(1, maxClass));

      return {
        studentProfileId: student.id,
        studentUserId: String(student.user_id),
        studentName: String(student.full_name),
        gradeLevel: String(student.grade_level),
        currentGradeClass,
        avgScore,
        completedModules,
        latestConfusedTopic: latestJournalByStudent.get(student.id) ?? null,
        latestValidation: latestValidationByUser.get(String(student.user_id)) ?? null,
        assessmentProfile: (() => {
          const source = competencyByUser.get(String(student.user_id)) ?? assessmentThetaByUser.get(String(student.user_id)) ?? {};
          const dimKeys = [
            "kognitif",
            "bahasa",
            "digital",
            "karakter",
            "spiritual",
            "leadership",
          ] as const;
          const out: Record<string, { level: string }> = {};
          for (const k of dimKeys) {
            out[k] = { level: thetaToLevel(Number(source[k as keyof typeof source] ?? 5)) };
          }
          return out;
        })(),
      };
    });

    const { data: alerts } = await supabase
      .from("smart_alerts")
      .select("id, student_id, type, message_content, is_read, created_at")
      .eq("parent_id", parentProfile.id)
      .order("created_at", { ascending: false })
      .limit(10);

    return Response.json({
      parent: {
        id: parentProfile.id,
        name: parentProfile.full_name,
        parentLinkCode: parentProfile.parent_link_code ?? null,
      },
      students: summary,
      alerts: alerts ?? [],
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await getParentProfileIdFromToken(token);
    if ("error" in auth) {
      const code =
        auth.error === "Invalid token"
          ? 401
          : auth.error === "Parent profile not found"
            ? 404
            : 403;
      return Response.json({ message: auth.error }, { status: code });
    }
    const { supabase, parentProfile } = auth;

    const body = (await req.json()) as {
      alertId?: string;
      studentId?: string;
      markAllForStudent?: boolean;
      isRead?: boolean;
    };
    if (!body.alertId && !(body.markAllForStudent && body.studentId)) {
      return Response.json(
        { message: "alertId is required, or use markAllForStudent + studentId" },
        { status: 400 },
      );
    }

    if (body.markAllForStudent && body.studentId) {
      const { error } = await supabase
        .from("smart_alerts")
        .update({ is_read: body.isRead ?? true })
        .eq("parent_id", parentProfile.id)
        .eq("student_id", body.studentId)
        .eq("is_read", false);
      if (error) return Response.json({ message: error.message }, { status: 500 });

      return Response.json({ ok: true, updated: "bulk" });
    }

    const { data, error } = await supabase
      .from("smart_alerts")
      .update({ is_read: body.isRead ?? true })
      .eq("id", body.alertId)
      .eq("parent_id", parentProfile.id)
      .select("id, is_read")
      .single();
    if (error) return Response.json({ message: error.message }, { status: 500 });
    if (!data) return Response.json({ message: "Alert not found" }, { status: 404 });

    return Response.json({ ok: true, alert: data });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

