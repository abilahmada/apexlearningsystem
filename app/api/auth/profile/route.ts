import { requireAppUserFromRequest } from "@/lib/auth/request-user";

export async function GET(req: Request) {
  const auth = await requireAppUserFromRequest(req);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let profile: Record<string, unknown> | null = null;

  if (auth.role === "STUDENT") {
    const { data } = await auth.supabase
      .from("student_profiles")
      .select("grade_level, full_name, learning_vision, school_origin")
      .eq("user_id", auth.userId)
      .maybeSingle();
    profile = (data as Record<string, unknown> | null) ?? null;
  } else if (auth.role === "PARENT") {
    const { data } = await auth.supabase
      .from("parent_profiles")
      .select("full_name, phone_number, parent_link_code")
      .eq("user_id", auth.userId)
      .maybeSingle();
    profile = (data as Record<string, unknown> | null) ?? null;
  } else if (auth.role === "MENTOR") {
    const { data } = await auth.supabase
      .from("mentor_profiles")
      .select("expertise_area")
      .eq("user_id", auth.userId)
      .maybeSingle();
    profile = (data as Record<string, unknown> | null) ?? null;
  }

  return Response.json({
    id: auth.userId,
    email: auth.email,
    role: String(auth.role).toLowerCase(),
    profile,
  });
}

