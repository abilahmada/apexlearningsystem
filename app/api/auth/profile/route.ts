import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AppRole = "student" | "parent" | "mentor" | "admin";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function mapDbRole(role: string): AppRole | null {
  if (role === "STUDENT") return "student";
  if (role === "PARENT") return "parent";
  if (role === "MENTOR") return "mentor";
  if (role === "ADMIN") return "admin";
  return null;
}

async function resolveAuthAndUserRow(token: string) {
  const supabase = createSupabaseAdminClient();
  const authRes = await supabase.auth.getUser(token);
  const authUser = authRes.data.user;
  if (!authUser?.email) {
    return { ok: false as const, status: 401, message: "Invalid token" };
  }

  const { data: userRow, error } = await supabase
    .from("users")
    .select("id, email, role, avatar_url")
    .eq("email", authUser.email)
    .single();
  if (error || !userRow) {
    return {
      ok: false as const,
      status: 403,
      message: "User profile tidak ditemukan di tabel users.",
    };
  }
  const appRole = mapDbRole(String(userRow.role));
  if (!appRole) {
    return { ok: false as const, status: 403, message: "Role user tidak valid." };
  }
  return { ok: true as const, supabase, userRow, appRole };
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const auth = await resolveAuthAndUserRow(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });

    const { supabase, userRow, appRole } = auth;

    if (appRole === "student") {
      const { data, error } = await supabase
        .from("student_profiles")
        .select(
          "full_name, grade_level, learning_vision, birth_date, school_origin, grade_class_start, grade_class_max, grade_class_start_year, parent_profiles!student_profiles_parent_id_fkey(full_name, parent_link_code)",
        )
        .eq("user_id", userRow.id)
        .maybeSingle();
      if (error) return Response.json({ message: error.message }, { status: 500 });
      const parentObj =
        data && typeof data === "object"
          ? (data as Record<string, unknown>).parent_profiles
          : null;
      const parent =
        parentObj && typeof parentObj === "object"
          ? (parentObj as Record<string, unknown>)
          : null;
      const normalizedProfile = {
        ...(data ?? {}),
        parent_full_name: typeof parent?.full_name === "string" ? parent.full_name : null,
        parent_link_code: typeof parent?.parent_link_code === "string" ? parent.parent_link_code : null,
      };
      return Response.json({
        role: appRole,
        userId: userRow.id,
        email: userRow.email,
        avatarUrl: userRow.avatar_url ?? null,
        profile: normalizedProfile,
      });
    }

    if (appRole === "parent") {
      const { data, error } = await supabase
        .from("parent_profiles")
        .select(
          "full_name, phone_number, parent_link_code, address_line, province, city, district",
        )
        .eq("user_id", userRow.id)
        .maybeSingle();
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json({
        role: appRole,
        userId: userRow.id,
        email: userRow.email,
        avatarUrl: userRow.avatar_url ?? null,
        profile: data ?? {},
      });
    }

    if (appRole === "mentor") {
      const { data, error } = await supabase
        .from("mentor_profiles")
        .select("expertise_area")
        .eq("user_id", userRow.id)
        .maybeSingle();
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json({
        role: appRole,
        userId: userRow.id,
        email: userRow.email,
        avatarUrl: userRow.avatar_url ?? null,
        profile: data ?? {},
      });
    }

    return Response.json({
      role: appRole,
      userId: userRow.id,
      email: userRow.email,
      avatarUrl: userRow.avatar_url ?? null,
      profile: {},
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

    const auth = await resolveAuthAndUserRow(token);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });
    const { supabase, userRow, appRole } = auth;
    const body = (await req.json()) as Record<string, unknown>;

    if (appRole === "student") {
      const patch: Record<string, unknown> = {};
      if (typeof body.full_name === "string") patch.full_name = body.full_name.trim();
      if (typeof body.learning_vision === "string") patch.learning_vision = body.learning_vision.trim();
      if (typeof body.school_origin === "string") patch.school_origin = body.school_origin.trim();
      if (typeof body.birth_date === "string") patch.birth_date = body.birth_date || null;
      if (typeof body.grade_level === "string") patch.grade_level = body.grade_level.toUpperCase();
      if (typeof body.grade_class_start === "number") patch.grade_class_start = Math.max(1, Math.round(body.grade_class_start));
      if (typeof body.grade_class_max === "number") patch.grade_class_max = Math.max(1, Math.round(body.grade_class_max));

      const { error } = await supabase.from("student_profiles").update(patch).eq("user_id", userRow.id);
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (appRole === "parent") {
      const patch: Record<string, unknown> = {};
      if (typeof body.full_name === "string") patch.full_name = body.full_name.trim();
      if (typeof body.phone_number === "string") patch.phone_number = body.phone_number.trim();
      if (typeof body.address_line === "string") patch.address_line = body.address_line.trim();
      if (typeof body.province === "string") patch.province = body.province.trim();
      if (typeof body.city === "string") patch.city = body.city.trim();
      if (typeof body.district === "string") patch.district = body.district.trim();
      if (Object.prototype.hasOwnProperty.call(body, "parent_link_code")) {
        return Response.json(
          {
            message:
              "Parent ID dikunci untuk mencegah relink tidak sengaja. Hubungi admin jika perlu perubahan.",
          },
          { status: 400 },
        );
      }

      const { error } = await supabase.from("parent_profiles").update(patch).eq("user_id", userRow.id);
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (appRole === "mentor") {
      const patch: Record<string, unknown> = {};
      if (typeof body.expertise_area === "string") patch.expertise_area = body.expertise_area.trim();

      const { error } = await supabase.from("mentor_profiles").update(patch).eq("user_id", userRow.id);
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json(
      { message: "Role ini belum memiliki editable profile fields." },
      { status: 400 },
    );
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

