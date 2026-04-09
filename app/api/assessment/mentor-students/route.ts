import { createSupabaseAdminClient } from "@/lib/supabase/server";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const supabase = createSupabaseAdminClient();
    const authRes = await supabase.auth.getUser(token);
    const authUser = authRes.data.user;
    if (!authUser?.email) return Response.json({ message: "Invalid token" }, { status: 401 });

    const { data: appUser, error: appUserErr } = await supabase
      .from("users")
      .select("id, role")
      .eq("email", authUser.email)
      .single();
    if (appUserErr || !appUser) return Response.json({ message: "User not found" }, { status: 404 });
    if (String(appUser.role) !== "MENTOR") return Response.json({ message: "Forbidden" }, { status: 403 });

    const { data: students, error: studentsErr } = await supabase
      .from("student_profiles")
      .select("id, user_id, full_name, grade_level, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (studentsErr) return Response.json({ message: studentsErr.message }, { status: 500 });

    return Response.json({
      students: (students ?? []).map((s) => ({
        studentProfileId: String(s.id),
        studentUserId: String(s.user_id),
        fullName: String(s.full_name ?? "Student"),
        gradeLevel: String(s.grade_level ?? "-"),
      })),
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

