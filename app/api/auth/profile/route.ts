import { requireAppUserFromRequest } from "@/lib/auth/request-user";
import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";

type ParentEmbed = {
  full_name?: string | null;
  parent_link_code?: string | null;
} | null;

function normalizeParentEmbed(raw: unknown): ParentEmbed {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0] as ParentEmbed;
    return first ?? null;
  }
  return raw as ParentEmbed;
}

function flattenStudentProfile(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  const parent = normalizeParentEmbed(row.parent_profiles);
  const { parent_profiles: _p, ...rest } = row;
  return {
    ...rest,
    parent_full_name: parent?.full_name ?? null,
    parent_link_code: parent?.parent_link_code ?? null,
  };
}

export async function GET(req: Request) {
  const auth = await requireAppUserFromRequest(req);
  if (!auth.ok) {
    return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });
  }

  let profile: Record<string, unknown> | null = null;
  let linkedStudents: Record<string, unknown>[] | undefined;

  if (auth.role === "STUDENT") {
    const { data, error } = await auth.supabase
      .from("student_profiles")
      .select(
        `
        grade_level,
        full_name,
        learning_vision,
        school_origin,
        birth_date,
        grade_class_start,
        grade_class_max,
        grade_class_start_year,
        parent_id,
        parent_profiles ( full_name, parent_link_code )
      `,
      )
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (error) {
      return jsonPrivateNoStore({ message: error.message }, { status: 500 });
    }
    profile = flattenStudentProfile((data as Record<string, unknown> | null) ?? null);
  } else if (auth.role === "PARENT") {
    const { data: parentRow, error: parentErr } = await auth.supabase
      .from("parent_profiles")
      .select("id, full_name, phone_number, parent_link_code, address_line, province, city, district")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (parentErr) {
      return jsonPrivateNoStore({ message: parentErr.message }, { status: 500 });
    }
    const row = parentRow as Record<string, unknown> | null;
    linkedStudents = [];
    if (row) {
      const { id: parentProfileId, ...rest } = row;
      profile = rest;
      const { data: students, error: stErr } = await auth.supabase
        .from("student_profiles")
        .select(
          "user_id, full_name, grade_level, birth_date, school_origin, learning_vision, grade_class_start, grade_class_max, grade_class_start_year",
        )
        .eq("parent_id", parentProfileId as string)
        .order("full_name", { ascending: true });
      if (stErr) {
        return jsonPrivateNoStore({ message: stErr.message }, { status: 500 });
      }
      linkedStudents = (students as Record<string, unknown>[]) ?? [];
    } else {
      profile = null;
    }
  } else if (auth.role === "MENTOR") {
    const { data } = await auth.supabase
      .from("mentor_profiles")
      .select("expertise_area")
      .eq("user_id", auth.userId)
      .maybeSingle();
    profile = (data as Record<string, unknown> | null) ?? null;
  }

  const { data: userAvatarRow, error: userAvatarErr } = await auth.supabase
    .from("users")
    .select("avatar_url")
    .eq("id", auth.userId)
    .maybeSingle();
  if (userAvatarErr) {
    return jsonPrivateNoStore({ message: userAvatarErr.message }, { status: 500 });
  }
  const avatarUrl =
    (userAvatarRow as { avatar_url?: string | null } | null)?.avatar_url ?? null;

  const roleLower = String(auth.role).toLowerCase();
  const base = {
    id: auth.userId,
    userId: auth.userId,
    email: auth.email,
    role: roleLower,
    profile,
    avatarUrl,
  };

  if (auth.role === "PARENT") {
    return jsonPrivateNoStore({ ...base, linkedStudents: linkedStudents ?? [] });
  }

  return jsonPrivateNoStore(base);
}

export async function PATCH(req: Request) {
  const auth = await requireAppUserFromRequest(req);
  if (!auth.ok) {
    return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });
  }
  if (auth.role === "ADMIN") {
    return jsonPrivateNoStore({ message: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (auth.role === "STUDENT") {
    const patch: Record<string, unknown> = {};
    for (const k of ["full_name", "learning_vision", "school_origin", "birth_date"] as const) {
      if (k in body) patch[k] = body[k];
    }
    const { error } = await auth.supabase.from("student_profiles").update(patch).eq("user_id", auth.userId);
    if (error) return jsonPrivateNoStore({ message: error.message }, { status: 400 });
    return jsonPrivateNoStore({ ok: true });
  }

  if (auth.role === "PARENT") {
    const patch: Record<string, unknown> = {};
    for (const k of [
      "full_name",
      "phone_number",
      "address_line",
      "province",
      "city",
      "district",
    ] as const) {
      if (k in body) patch[k] = body[k];
    }
    const { error } = await auth.supabase.from("parent_profiles").update(patch).eq("user_id", auth.userId);
    if (error) return jsonPrivateNoStore({ message: error.message }, { status: 400 });
    return jsonPrivateNoStore({ ok: true });
  }

  if (auth.role === "MENTOR") {
    const patch: Record<string, unknown> = {};
    if ("expertise_area" in body) patch.expertise_area = body.expertise_area;
    const { error } = await auth.supabase.from("mentor_profiles").update(patch).eq("user_id", auth.userId);
    if (error) return jsonPrivateNoStore({ message: error.message }, { status: 400 });
    return jsonPrivateNoStore({ ok: true });
  }

  return jsonPrivateNoStore({ message: "Forbidden" }, { status: 403 });
}
