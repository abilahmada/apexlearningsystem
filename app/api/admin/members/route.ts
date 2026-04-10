import { isAdminRequest } from "@/lib/auth/admin-request";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type UserRole = "STUDENT" | "PARENT" | "MENTOR" | "ADMIN";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function parseRole(raw: unknown): UserRole | null {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (t === "STUDENT" || t === "PARENT" || t === "MENTOR" || t === "ADMIN") return t;
  return null;
}

function parseBool(raw: string | null): boolean {
  if (!raw) return false;
  const t = raw.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 25;
  return Math.min(100, Math.max(1, Math.round(n)));
}

function parseOffset(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

async function resolveSearchUserIds(supabase: ReturnType<typeof createSupabaseAdminClient>, q: string) {
  const term = `%${q}%`;
  const ids = new Set<string>();

  const [{ data: students }, { data: parents }] = await Promise.all([
    supabase.from("student_profiles").select("user_id").ilike("full_name", term).limit(500),
    supabase.from("parent_profiles").select("user_id").ilike("full_name", term).limit(500),
  ]);

  for (const row of students ?? []) {
    const id = String(row.user_id ?? "");
    if (isUuid(id)) ids.add(id);
  }
  for (const row of parents ?? []) {
    const id = String(row.user_id ?? "");
    if (isUuid(id)) ids.add(id);
  }
  return [...ids];
}

function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeText(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  return v.length > 0 ? v : null;
}

function normalizeGradeLevel(raw: unknown): "SD" | "SMP" | "SMK" {
  const v = String(raw ?? "SMP")
    .trim()
    .toUpperCase();
  if (v === "SD" || v === "SMP" || v === "SMK") return v;
  return "SMP";
}

export async function POST(req: Request) {
  try {
    const ok = await isAdminRequest(req);
    if (!ok) return Response.json({ message: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    const role = parseRole(body.role);
    const registrationApproved = body.registrationApproved == null ? true : Boolean(body.registrationApproved);
    if (!isValidEmail(email)) {
      return Response.json({ message: "Email tidak valid." }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json({ message: "Password minimal 6 karakter." }, { status: 400 });
    }
    if (!role) {
      return Response.json({ message: "Role tidak valid." }, { status: 400 });
    }

    const profile = (body.profile as Record<string, unknown> | undefined) ?? {};
    const fullName = safeText(profile.fullName);
    const metadata: Record<string, string> = { role };
    if (fullName) metadata.full_name = fullName;

    const supabase = createSupabaseAdminClient();
    const createRes = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (createRes.error || !createRes.data.user?.id) {
      return Response.json({ message: createRes.error?.message ?? "Gagal membuat akun auth." }, { status: 400 });
    }
    const userId = createRes.data.user.id;

    const { error: patchErr } = await supabase
      .from("users")
      .update({
        email,
        role,
        registration_approved: registrationApproved,
        registration_approved_at: registrationApproved ? new Date().toISOString() : null,
      })
      .eq("id", userId);
    if (patchErr) return Response.json({ message: patchErr.message }, { status: 500 });

    if (role === "STUDENT") {
      const parentLinkCode = safeText(profile.parentLinkCode)?.toUpperCase() ?? null;
      let parentId: string | null = null;
      if (parentLinkCode) {
        const { data: parent } = await supabase
          .from("parent_profiles")
          .select("id")
          .eq("parent_link_code", parentLinkCode)
          .maybeSingle();
        parentId = parent?.id ? String(parent.id) : null;
      }
      const { error } = await supabase.from("student_profiles").upsert(
        {
          user_id: userId,
          full_name: fullName,
          grade_level: normalizeGradeLevel(profile.gradeLevel),
          learning_vision: safeText(profile.learningVision),
          school_origin: safeText(profile.schoolOrigin),
          birth_date: safeText(profile.birthDate),
          parent_id: parentId,
        },
        { onConflict: "user_id" },
      );
      if (error) return Response.json({ message: error.message }, { status: 500 });
    } else if (role === "PARENT") {
      const { error } = await supabase.from("parent_profiles").upsert(
        {
          user_id: userId,
          full_name: fullName,
          phone_number: safeText(profile.phoneNumber),
          parent_link_code: safeText(profile.parentLinkCode)?.toUpperCase() ?? null,
        },
        { onConflict: "user_id" },
      );
      if (error) return Response.json({ message: error.message }, { status: 500 });
    } else if (role === "MENTOR") {
      const { error } = await supabase.from("mentor_profiles").upsert(
        {
          user_id: userId,
          expertise_area: safeText(profile.expertiseArea),
        },
        { onConflict: "user_id" },
      );
      if (error) return Response.json({ message: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, message: "Member baru berhasil dibuat dan disinkronkan." });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const ok = await isAdminRequest(req);
    if (!ok) return Response.json({ message: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const offset = parseOffset(url.searchParams.get("offset"));
    const role = parseRole(url.searchParams.get("role"));
    const approval = String(url.searchParams.get("approval") ?? "all")
      .trim()
      .toLowerCase();
    const q = String(url.searchParams.get("q") ?? "").trim();
    const sort = String(url.searchParams.get("sort") ?? "created_at");
    const order = String(url.searchParams.get("order") ?? "desc")
      .trim()
      .toLowerCase();
    const asc = order === "asc";
    const sortColumn = sort === "email" || sort === "role" ? sort : "created_at";

    const supabase = createSupabaseAdminClient();
    let query = supabase.from("users").select("id, email, role, created_at, registration_approved, registration_approved_at", {
      count: "exact",
    });

    if (role) query = query.eq("role", role);
    if (approval === "approved") query = query.eq("registration_approved", true);
    if (approval === "pending") query = query.eq("registration_approved", false);

    if (q) {
      const ids = await resolveSearchUserIds(supabase, q);
      if (ids.length > 0) {
        const inList = ids.join(",");
        query = query.or(`email.ilike.%${q}%,id.in.(${inList})`);
      } else {
        query = query.ilike("email", `%${q}%`);
      }
    }

    const { data: users, error, count } = await query
      .order(sortColumn, { ascending: asc })
      .range(offset, offset + limit - 1);
    if (error) return Response.json({ message: error.message }, { status: 500 });

    const userIds = (users ?? []).map((u) => String(u.id));
    if (userIds.length === 0) return Response.json({ items: [], total: count ?? 0 });

    const [{ data: students }, { data: parents }, { data: mentors }] = await Promise.all([
      supabase
        .from("student_profiles")
        .select("id, user_id, parent_id, full_name, grade_level, learning_vision, school_origin, birth_date")
        .in("user_id", userIds),
      supabase
        .from("parent_profiles")
        .select("id, user_id, full_name, parent_link_code, phone_number")
        .in("user_id", userIds),
      supabase.from("mentor_profiles").select("user_id, expertise_area").in("user_id", userIds),
    ]);

    const parentByProfileId = new Map<string, Record<string, unknown>>();
    for (const p of parents ?? []) parentByProfileId.set(String(p.id), p as Record<string, unknown>);

    const studentByUserId = new Map<string, Record<string, unknown>>();
    const linkedStudentByParentProfile = new Map<string, Array<Record<string, unknown>>>();
    for (const s of students ?? []) {
      const row = s as Record<string, unknown>;
      const uid = String(row.user_id ?? "");
      if (uid) studentByUserId.set(uid, row);
      const parentId = String(row.parent_id ?? "");
      if (!parentId) continue;
      const arr = linkedStudentByParentProfile.get(parentId) ?? [];
      arr.push(row);
      linkedStudentByParentProfile.set(parentId, arr);
    }

    const parentByUserId = new Map<string, Record<string, unknown>>();
    for (const p of parents ?? []) parentByUserId.set(String(p.user_id ?? ""), p as Record<string, unknown>);

    const mentorByUserId = new Map<string, Record<string, unknown>>();
    for (const m of mentors ?? []) mentorByUserId.set(String(m.user_id ?? ""), m as Record<string, unknown>);

    const userEmailById = new Map<string, string>();
    for (const u of users ?? []) userEmailById.set(String(u.id), String(u.email ?? ""));

    const items = (users ?? []).map((u) => {
      const userId = String(u.id);
      const roleText = String(u.role ?? "");
      const student = studentByUserId.get(userId) ?? null;
      const parent = parentByUserId.get(userId) ?? null;
      const mentor = mentorByUserId.get(userId) ?? null;

      const linkedParentProfile =
        student && String(student.parent_id ?? "") ? parentByProfileId.get(String(student.parent_id)) : null;
      const linkedParent = linkedParentProfile
        ? {
            profileId: String(linkedParentProfile.id ?? ""),
            userId: String(linkedParentProfile.user_id ?? ""),
            fullName: String(linkedParentProfile.full_name ?? "") || null,
            parentLinkCode: String(linkedParentProfile.parent_link_code ?? "") || null,
            email: userEmailById.get(String(linkedParentProfile.user_id ?? "")) ?? null,
          }
        : null;

      const linkedStudents = parent
        ? (linkedStudentByParentProfile.get(String(parent.id ?? "")) ?? []).map((s) => ({
            userId: String(s.user_id ?? "") || null,
            fullName: String(s.full_name ?? "") || null,
            gradeLevel: String(s.grade_level ?? "") || null,
            email: userEmailById.get(String(s.user_id ?? "")) ?? null,
          }))
        : [];

      return {
        id: userId,
        email: String(u.email ?? ""),
        role: roleText,
        createdAt: String(u.created_at ?? ""),
        registrationApproved: Boolean(u.registration_approved),
        registrationApprovedAt: (u.registration_approved_at as string | null) ?? null,
        displayName:
          roleText === "STUDENT"
            ? (String(student?.full_name ?? "") || null)
            : roleText === "PARENT"
              ? (String(parent?.full_name ?? "") || null)
              : roleText === "MENTOR"
                ? (String(mentor?.expertise_area ?? "") || null)
                : null,
        student:
          roleText === "STUDENT"
            ? {
                fullName: String(student?.full_name ?? "") || null,
                gradeLevel: String(student?.grade_level ?? "") || null,
                learningVision: String(student?.learning_vision ?? "") || null,
                schoolOrigin: String(student?.school_origin ?? "") || null,
                birthDate: String(student?.birth_date ?? "") || null,
                parentId: String(student?.parent_id ?? "") || null,
                linkedParent,
              }
            : null,
        parent:
          roleText === "PARENT"
            ? {
                profileId: String(parent?.id ?? "") || null,
                fullName: String(parent?.full_name ?? "") || null,
                parentLinkCode: String(parent?.parent_link_code ?? "") || null,
                phoneNumber: String(parent?.phone_number ?? "") || null,
                email: String(u.email ?? ""),
                linkedStudents,
              }
            : null,
        mentor:
          roleText === "MENTOR"
            ? {
                expertiseArea: String(mentor?.expertise_area ?? "") || null,
              }
            : null,
      };
    });

    return Response.json({ items, total: count ?? 0 });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const ok = await isAdminRequest(req);
    if (!ok) return Response.json({ message: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as Record<string, unknown>;
    const id = String(body.id ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const registrationApproved = Boolean(body.registrationApproved);
    if (!isUuid(id) || !email) {
      return Response.json({ message: "Invalid payload: id and email are required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: userRow, error: userErr } = await supabase.from("users").select("id, role").eq("id", id).maybeSingle();
    if (userErr) return Response.json({ message: userErr.message }, { status: 500 });
    if (!userRow) return Response.json({ message: "User tidak ditemukan." }, { status: 404 });
    const role = String(userRow.role ?? "");

    const patchUser: Record<string, unknown> = {
      email,
      registration_approved: registrationApproved,
      registration_approved_at: registrationApproved ? new Date().toISOString() : null,
    };
    const { error: patchErr } = await supabase.from("users").update(patchUser).eq("id", id);
    if (patchErr) return Response.json({ message: patchErr.message }, { status: 500 });

    if (role === "STUDENT") {
      const student = (body.student as Record<string, unknown> | undefined) ?? {};
      const row = {
        user_id: id,
        full_name: String(student.fullName ?? "").trim() || null,
        grade_level: String(student.gradeLevel ?? "SMP").trim().toUpperCase(),
        learning_vision: String(student.learningVision ?? "").trim() || null,
        school_origin: String(student.schoolOrigin ?? "").trim() || null,
        birth_date: student.birthDate ? String(student.birthDate) : null,
      };
      const { error } = await supabase.from("student_profiles").upsert(row, { onConflict: "user_id" });
      if (error) return Response.json({ message: error.message }, { status: 500 });
    } else if (role === "PARENT") {
      const parent = (body.parent as Record<string, unknown> | undefined) ?? {};
      const row = {
        user_id: id,
        full_name: String(parent.fullName ?? "").trim() || null,
        phone_number: String(parent.phoneNumber ?? "").trim() || null,
        parent_link_code: String(parent.parentLinkCode ?? "").trim() || null,
      };
      const { error } = await supabase.from("parent_profiles").upsert(row, { onConflict: "user_id" });
      if (error) return Response.json({ message: error.message }, { status: 500 });
    } else if (role === "MENTOR") {
      const mentor = (body.mentor as Record<string, unknown> | undefined) ?? {};
      const row = {
        user_id: id,
        expertise_area: String(mentor.expertiseArea ?? "").trim() || null,
      };
      const { error } = await supabase.from("mentor_profiles").upsert(row, { onConflict: "user_id" });
      if (error) return Response.json({ message: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, message: "Perubahan member berhasil disimpan dan disinkronkan." });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const ok = await isAdminRequest(req);
    if (!ok) return Response.json({ message: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const id = String(url.searchParams.get("id") ?? "").trim();
    if (!isUuid(id)) return Response.json({ message: "Invalid id" }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { data: userRow, error: userErr } = await supabase.from("users").select("id, role").eq("id", id).maybeSingle();
    if (userErr) return Response.json({ message: userErr.message }, { status: 500 });
    if (!userRow) return Response.json({ message: "User tidak ditemukan." }, { status: 404 });

    const role = String(userRow.role ?? "");

    if (role === "STUDENT") {
      const { data: student } = await supabase.from("student_profiles").select("id").eq("user_id", id).maybeSingle();
      if (student?.id) {
        await supabase.from("lesson_assessment_attempts").delete().eq("student_id", String(student.id));
        await supabase.from("lesson_progress").delete().eq("student_id", String(student.id));
      }
      await supabase.from("student_profiles").delete().eq("user_id", id);
    } else if (role === "PARENT") {
      const { data: parent } = await supabase.from("parent_profiles").select("id").eq("user_id", id).maybeSingle();
      if (parent?.id) {
        await supabase.from("student_profiles").update({ parent_id: null }).eq("parent_id", String(parent.id));
      }
      await supabase.from("parent_profiles").delete().eq("user_id", id);
    } else if (role === "MENTOR") {
      await supabase.from("mentor_profiles").delete().eq("user_id", id);
    }

    const { error: delUserErr } = await supabase.from("users").delete().eq("id", id);
    if (delUserErr) return Response.json({ message: delUserErr.message }, { status: 500 });

    const authDelete = await supabase.auth.admin.deleteUser(id);
    if (authDelete.error) {
      return Response.json({
        ok: true,
        partial: true,
        authDeleted: false,
        message:
          "Data member di database aplikasi berhasil dihapus, tetapi akun auth gagal dihapus. Email bisa tetap terbaca sudah terdaftar sampai auth user dihapus.",
        authError: authDelete.error.message,
      });
    }

    return Response.json({
      ok: true,
      partial: false,
      authDeleted: true,
      message: "Member berhasil dihapus dan relasi terkait disinkronkan.",
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
