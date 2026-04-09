import { requireAdminFromRequest } from "@/lib/auth/admin-request";

type DbRole = "STUDENT" | "PARENT" | "MENTOR" | "ADMIN" | "ALL";

function parseRole(v: string | null): DbRole {
  const u = (v ?? "ALL").toUpperCase();
  if (u === "STUDENT" || u === "PARENT" || u === "MENTOR" || u === "ADMIN") return u;
  return "ALL";
}

function parseApproval(v: string | null): "all" | "approved" | "pending" {
  const x = (v ?? "all").toLowerCase();
  if (x === "approved" || x === "pending") return x;
  return "all";
}

function parseSort(v: string | null): "created_at" | "email" | "role" {
  const x = (v ?? "created_at").toLowerCase();
  if (x === "email" || x === "role") return x;
  return "created_at";
}

function parseOrder(v: string | null): boolean {
  return (v ?? "desc").toLowerCase() === "asc";
}

type ParentProfileRow = {
  id?: string;
  full_name?: string;
  parent_link_code?: string | null;
  user_id?: string;
};

type StudentProfileRow = {
  user_id?: string;
  full_name?: string;
  grade_level?: string;
};

type MemberPatchPayload = {
  id?: string;
  email?: string;
  registrationApproved?: boolean;
  student?: {
    fullName?: string;
    gradeLevel?: string;
    learningVision?: string;
    schoolOrigin?: string;
    birthDate?: string | null;
  };
  parent?: {
    fullName?: string;
    phoneNumber?: string;
    parentLinkCode?: string;
  };
  mentor?: {
    expertiseArea?: string;
  };
};

export async function GET(req: Request) {
  try {
    const auth = await requireAdminFromRequest(req);
    if (!auth.ok) {
      return Response.json({ message: auth.message }, { status: auth.status });
    }

    const url = new URL(req.url);
    const roleFilter = parseRole(url.searchParams.get("role"));
    const approval = parseApproval(url.searchParams.get("approval"));
    const search = (url.searchParams.get("q") ?? "").trim();
    const sort = parseSort(url.searchParams.get("sort"));
    const ascending = parseOrder(url.searchParams.get("order"));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    const supabase = auth.supabase;

    let userIdsFromSearch: string[] | null = null;
    if (search.length > 0) {
      const like = `%${search}%`;
      const [stu, par, usr] = await Promise.all([
        supabase.from("student_profiles").select("user_id").ilike("full_name", like),
        supabase.from("parent_profiles").select("user_id").ilike("full_name", like),
        supabase.from("users").select("id").ilike("email", like),
      ]);
      const ids = new Set<string>();
      for (const r of stu.data ?? []) {
        if (r.user_id) ids.add(String(r.user_id));
      }
      for (const r of par.data ?? []) {
        if (r.user_id) ids.add(String(r.user_id));
      }
      for (const r of usr.data ?? []) {
        if (r.id) ids.add(String(r.id));
      }
      userIdsFromSearch = [...ids];
      if (userIdsFromSearch.length === 0) {
        return Response.json({
          items: [],
          total: 0,
          limit,
          offset,
        });
      }
    }

    let q = supabase.from("users").select(
      `
        id,
        email,
        role,
        created_at,
        registration_approved,
        registration_approved_at,
        student_profiles (
          full_name,
          grade_level,
          learning_vision,
          school_origin,
          birth_date,
          parent_id,
          parent_profiles (
            id,
            full_name,
            parent_link_code,
            user_id
          )
        ),
        parent_profiles (
          id,
          full_name,
          parent_link_code,
          phone_number,
          student_profiles (
            user_id,
            full_name,
            grade_level
          )
        ),
        mentor_profiles (
          expertise_area
        )
      `,
      { count: "exact" },
    );

    if (roleFilter !== "ALL") {
      q = q.eq("role", roleFilter);
    }
    if (approval === "approved") {
      q = q.eq("registration_approved", true);
    } else if (approval === "pending") {
      q = q.eq("registration_approved", false);
    }
    if (userIdsFromSearch) {
      q = q.in("id", userIdsFromSearch);
    }

    q = q.order(sort, { ascending, nullsFirst: false });
    q = q.range(offset, offset + limit - 1);

    const { data: rows, error, count } = await q;

    if (error) {
      return Response.json({ message: error.message, hint: error.hint }, { status: 500 });
    }

    const extraUserIds = new Set<string>();
    for (const row of rows ?? []) {
      const sp = row.student_profiles as Array<{
        parent_profiles?: ParentProfileRow | ParentProfileRow[] | null;
      }> | null;
      const studentRow = Array.isArray(sp) && sp[0] ? sp[0] : null;
      const rawP = studentRow?.parent_profiles;
      const p = Array.isArray(rawP) ? rawP[0] : rawP;
      if (p?.user_id) extraUserIds.add(String(p.user_id));

      const pp = row.parent_profiles as
        | Array<{
            student_profiles?: StudentProfileRow[] | null;
          }>
        | null;
      const parentRow = Array.isArray(pp) && pp[0] ? pp[0] : null;
      for (const k of parentRow?.student_profiles ?? []) {
        if (k.user_id) extraUserIds.add(String(k.user_id));
      }
    }

    const emailByUserId = new Map<string, string>();
    const extraIds = [...extraUserIds].filter(Boolean);
    if (extraIds.length > 0) {
      const { data: emailRows } = await supabase.from("users").select("id, email").in("id", extraIds);
      for (const u of emailRows ?? []) {
        if (u.id && u.email) emailByUserId.set(String(u.id), String(u.email));
      }
    }

    const items = (rows ?? []).map((row: Record<string, unknown>) => {
      const sp = row.student_profiles as
        | Array<{
            full_name?: string;
            grade_level?: string;
            learning_vision?: string | null;
            school_origin?: string | null;
            birth_date?: string | null;
            parent_id?: string | null;
            parent_profiles?: ParentProfileRow | ParentProfileRow[] | null;
          }>
        | null;
      const pp = row.parent_profiles as
        | Array<{
            id?: string;
            full_name?: string;
            parent_link_code?: string | null;
            phone_number?: string | null;
            student_profiles?: StudentProfileRow[] | null;
          }>
        | null;
      const mp = row.mentor_profiles as Array<{ expertise_area?: string }> | null;

      const studentRow = Array.isArray(sp) && sp[0] ? sp[0] : null;
      const parentRow = Array.isArray(pp) && pp[0] ? pp[0] : null;
      const mentorRow = Array.isArray(mp) && mp[0] ? mp[0] : null;

      const parentOfStudent = (() => {
        const raw = studentRow?.parent_profiles;
        const p = Array.isArray(raw) ? raw[0] : raw;
        if (!p) return null;
        const uid = p.user_id ? String(p.user_id) : null;
        return {
          profileId: p.id ?? null,
          userId: uid,
          fullName: p.full_name ?? null,
          parentLinkCode: p.parent_link_code ?? null,
          email: uid ? emailByUserId.get(uid) ?? null : null,
        };
      })();

      const childrenOfParent = (parentRow?.student_profiles ?? []).map((k) => {
        const uid = k.user_id ? String(k.user_id) : null;
        return {
          userId: uid,
          fullName: k.full_name ?? null,
          gradeLevel: k.grade_level ?? null,
          email: uid ? emailByUserId.get(uid) ?? null : null,
        };
      });

      const parentSelf = parentRow
        ? {
            profileId: parentRow.id ?? null,
            fullName: parentRow.full_name ?? null,
            parentLinkCode: parentRow.parent_link_code ?? null,
            phoneNumber: parentRow.phone_number ?? null,
            email: String(row.email),
            linkedStudents: childrenOfParent,
          }
        : null;

      return {
        id: row.id,
        email: row.email,
        role: row.role,
        createdAt: row.created_at,
        registrationApproved: row.registration_approved,
        registrationApprovedAt: row.registration_approved_at,
        displayName:
          studentRow?.full_name ??
          parentRow?.full_name ??
          (mentorRow ? `Mentor: ${mentorRow.expertise_area ?? ""}` : null) ??
          null,
        student: studentRow
          ? {
              fullName: studentRow.full_name ?? null,
              gradeLevel: studentRow.grade_level ?? null,
              learningVision: studentRow.learning_vision ?? null,
              schoolOrigin: studentRow.school_origin ?? null,
              birthDate: studentRow.birth_date ?? null,
              parentId: studentRow.parent_id ?? null,
              linkedParent: parentOfStudent,
            }
          : null,
        parent: parentSelf,
        mentor: mentorRow
          ? {
              expertiseArea: mentorRow.expertise_area ?? null,
            }
          : null,
      };
    });

    return Response.json({
      items,
      total: count ?? items.length,
      limit,
      offset,
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
    const auth = await requireAdminFromRequest(req);
    if (!auth.ok) {
      return Response.json({ message: auth.message }, { status: auth.status });
    }
    const body = (await req.json()) as MemberPatchPayload;
    const id = String(body.id ?? "").trim();
    if (!id) return Response.json({ message: "id wajib diisi." }, { status: 400 });

    const supabase = auth.supabase;
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", id)
      .maybeSingle();
    if (userErr || !userRow) {
      return Response.json({ message: "Member tidak ditemukan." }, { status: 404 });
    }

    const userPatch: Record<string, unknown> = {};
    if (typeof body.email === "string" && body.email.trim()) {
      userPatch.email = body.email.trim().toLowerCase();
    }
    if (typeof body.registrationApproved === "boolean") {
      userPatch.registration_approved = body.registrationApproved;
      userPatch.registration_approved_at = body.registrationApproved ? new Date().toISOString() : null;
    }
    if (Object.keys(userPatch).length > 0) {
      const { error } = await supabase.from("users").update(userPatch).eq("id", id);
      if (error) return Response.json({ message: error.message }, { status: 500 });
    }

    const role = String(userRow.role);
    if (role === "STUDENT" && body.student) {
      const patch: Record<string, unknown> = {};
      if (typeof body.student.fullName === "string") patch.full_name = body.student.fullName.trim();
      if (typeof body.student.gradeLevel === "string") patch.grade_level = body.student.gradeLevel.toUpperCase();
      if (typeof body.student.learningVision === "string") patch.learning_vision = body.student.learningVision.trim();
      if (typeof body.student.schoolOrigin === "string") patch.school_origin = body.student.schoolOrigin.trim();
      if (typeof body.student.birthDate === "string" || body.student.birthDate === null) {
        patch.birth_date = body.student.birthDate || null;
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("student_profiles").update(patch).eq("user_id", id);
        if (error) return Response.json({ message: error.message }, { status: 500 });
      }
    }

    if (role === "PARENT" && body.parent) {
      const patch: Record<string, unknown> = {};
      if (typeof body.parent.fullName === "string") patch.full_name = body.parent.fullName.trim();
      if (typeof body.parent.phoneNumber === "string") patch.phone_number = body.parent.phoneNumber.trim();
      if (typeof body.parent.parentLinkCode === "string" && body.parent.parentLinkCode.trim()) {
        patch.parent_link_code = body.parent.parentLinkCode.trim().toUpperCase();
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("parent_profiles").update(patch).eq("user_id", id);
        if (error) return Response.json({ message: error.message }, { status: 500 });
      }
    }

    if (role === "MENTOR" && body.mentor) {
      const patch: Record<string, unknown> = {};
      if (typeof body.mentor.expertiseArea === "string") patch.expertise_area = body.mentor.expertiseArea.trim();
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("mentor_profiles").update(patch).eq("user_id", id);
        if (error) return Response.json({ message: error.message }, { status: 500 });
      }
    }

    return Response.json({ ok: true, message: "Data member berhasil diperbarui." });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAdminFromRequest(req);
    if (!auth.ok) {
      return Response.json({ message: auth.message }, { status: auth.status });
    }

    const url = new URL(req.url);
    const id = (url.searchParams.get("id") ?? "").trim();
    if (!id) return Response.json({ message: "id wajib diisi." }, { status: 400 });

    const supabase = auth.supabase;

    // Attempt to remove auth account; continue even if already missing.
    const authDelete = await supabase.auth.admin.deleteUser(id);
    if (authDelete.error && !/not found/i.test(authDelete.error.message)) {
      return Response.json({ message: authDelete.error.message }, { status: 500 });
    }

    const { error } = await supabase.from("users").delete().eq("id", id);
    if (error) return Response.json({ message: error.message }, { status: 500 });

    return Response.json({ ok: true, message: "Member berhasil dihapus." });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
