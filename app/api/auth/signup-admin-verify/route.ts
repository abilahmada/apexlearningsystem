import { randomBytes, createHash } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/mailer";

type AppRole = "student" | "parent";

type ReqBody = {
  email?: string;
  password?: string;
  role?: AppRole;
  profile?: Record<string, unknown>;
};

function roleToDb(role: AppRole) {
  return role === "student" ? "STUDENT" : "PARENT";
}

function getAppBaseUrl(req: Request) {
  const envBase = process.env.APP_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function hasParentLinkCode(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  rawCode: string,
): Promise<{ exists: boolean; error: string | null }> {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (!code) return { exists: false, error: null };

  const rpcRes = await supabase.rpc("apex_parent_link_code_exists", { p_code: code });
  if (!rpcRes.error) {
    return { exists: rpcRes.data === true, error: null };
  }

  // Fallback when RPC is unavailable or not synced.
  const fallback = await supabase
    .from("parent_profiles")
    .select("id")
    .ilike("parent_link_code", code)
    .limit(1)
    .maybeSingle();
  if (fallback.error) return { exists: false, error: fallback.error.message };
  return { exists: Boolean(fallback.data?.id), error: null };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReqBody;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = body.role;
    const profile = body.profile ?? {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ message: "Email tidak valid." }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return Response.json({ message: "Password minimal 6 karakter." }, { status: 400 });
    }
    if (role !== "student" && role !== "parent") {
      return Response.json({ message: "Role signup publik hanya student/parent." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    if (role === "student") {
      const code = String(profile.parentLinkCode ?? "").trim().toUpperCase();
      if (!code) {
        return Response.json({ message: "ID Orang Tua wajib diisi untuk akun siswa." }, { status: 400 });
      }
      const parentCheck = await hasParentLinkCode(supabase, code);
      if (parentCheck.error) return Response.json({ message: parentCheck.error }, { status: 500 });
      if (!parentCheck.exists) {
        return Response.json({ message: "ID Orang Tua tidak terdaftar." }, { status: 400 });
      }
    }

    const metadata: Record<string, string> = {
      role: roleToDb(role),
      full_name: String(profile.fullName ?? "").trim(),
    };
    const copy = (from: string, to = from) => {
      const v = String((profile as Record<string, unknown>)[from] ?? "").trim();
      if (v) metadata[to] = v;
    };
    copy("phoneNumber", "phone_number");
    copy("birthDate", "birth_date");
    copy("schoolOrigin", "school_origin");
    copy("learningVision", "learning_vision");
    copy("parentLinkCode", "parent_link_code");
    copy("addressLine", "address_line");
    copy("province");
    copy("city");
    copy("district");
    if (typeof profile.gradeClassStart === "number") metadata.grade_class_start = String(profile.gradeClassStart);
    if (typeof profile.gradeClassMax === "number") metadata.grade_class_max = String(profile.gradeClassMax);
    if (typeof profile.gradeLevel === "string") metadata.grade_level = String(profile.gradeLevel).toUpperCase();

    // Cerminkan ke camelCase: GoTrue / penyimpanan Auth kadang hanya mengekspos satu bentuk kunci di raw_user_meta_data.
    const mirrorMeta = (snake: string, camel: string) => {
      const v = metadata[snake];
      if (v) metadata[camel] = v;
    };
    mirrorMeta("full_name", "fullName");
    mirrorMeta("phone_number", "phoneNumber");
    mirrorMeta("birth_date", "birthDate");
    mirrorMeta("school_origin", "schoolOrigin");
    mirrorMeta("learning_vision", "learningVision");
    mirrorMeta("parent_link_code", "parentLinkCode");
    mirrorMeta("address_line", "addressLine");
    mirrorMeta("grade_level", "gradeLevel");
    mirrorMeta("grade_class_start", "gradeClassStart");
    mirrorMeta("grade_class_max", "gradeClassMax");

    const createRes = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (createRes.error?.message?.includes("AUTH_PUBLIC_USERS_EMAIL_CONFLICT_DIFFERENT_ID")) {
      console.warn("[signup-admin-verify][reason]", {
        reason: "AUTH_PUBLIC_USERS_EMAIL_CONFLICT_DIFFERENT_ID",
        email,
      });
    }
    if (createRes.error) {
      console.error("[signup-admin-verify] auth.admin.createUser failed:", {
        message: createRes.error.message,
        code: "code" in createRes.error ? createRes.error.code : undefined,
        status: "status" in createRes.error ? createRes.error.status : undefined,
      });
    }
    const authUser = createRes.data.user;
    if (createRes.error || !authUser?.id || !authUser.email) {
      const err = createRes.error;
      const msg = err?.message ?? "Signup gagal.";
      return Response.json(
        {
          message: msg,
          ...(err && "code" in err && err.code != null ? { code: String(err.code) } : {}),
          ...(err && "status" in err && err.status != null ? { status: err.status } : {}),
        },
        { status: 400 },
      );
    }

    // Wajib cocok dengan auth.users.id (JWT sub). Jangan ambil baris public.users hanya lewat email —
    // edge case unique_violation lama bisa memetakan email ke UUID berbeda dari auth.
    const { data: userRow, error: userRowErr } = await supabase
      .from("users")
      .select("id, email, role")
      .eq("id", authUser.id)
      .maybeSingle();
    if (userRowErr) {
      return Response.json({ message: userRowErr.message }, { status: 500 });
    }
    const emailMatches =
      String(userRow?.email ?? "")
        .trim()
        .toLowerCase() === email;
    if (!userRow || !emailMatches) {
      return Response.json(
        {
          message:
            "User row tidak ditemukan setelah signup atau ID/email tidak selaras dengan Auth. Cek trigger handle_auth_user_created dan log Postgres.",
        },
        { status: 500 },
      );
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();
    const payload = {
      fullName: metadata.full_name ?? "",
      phoneNumber: metadata.phone_number ?? "",
      parentLinkCode: metadata.parent_link_code ?? "",
      gradeLevel: metadata.grade_level ?? "",
      schoolOrigin: metadata.school_origin ?? "",
      birthDate: metadata.birth_date ?? "",
      address: {
        line: metadata.address_line ?? "",
        province: metadata.province ?? "",
        city: metadata.city ?? "",
        district: metadata.district ?? "",
      },
    };

    const { error: verErr } = await supabase.from("registration_verifications").insert({
      user_id: userRow.id,
      email: userRow.email,
      role: userRow.role,
      payload,
      token_hash: tokenHash,
      expires_at: expiresAt,
      status: "PENDING",
    });
    if (verErr) return Response.json({ message: verErr.message }, { status: 500 });

    const baseUrl = getAppBaseUrl(req);
    const approveUrl = `${baseUrl}/api/auth/registration-verification?action=approve&token=${encodeURIComponent(token)}`;
    const rejectUrl = `${baseUrl}/api/auth/registration-verification?action=reject&token=${encodeURIComponent(token)}`;
    const adminEmail = process.env.ADMIN_APPROVER_EMAIL ?? "admin@apexlearning.web.id";
    const applicantName = metadata.full_name || email;
    const applicantRoleLabel = role === "student" ? "Siswa" : "Orang Tua";

    await sendEmail({
      to: adminEmail,
      subject: `Verifikasi Pendaftar Baru APEX - ${applicantName}`,
      text: [
        "Ada pendaftar baru yang perlu diverifikasi.",
        "",
        `Nama: ${applicantName}`,
        `Email: ${email}`,
        `Role: ${applicantRoleLabel}`,
        `No HP: ${metadata.phone_number ?? "-"}`,
        `Parent ID: ${metadata.parent_link_code ?? "-"}`,
        `Jenjang: ${metadata.grade_level ?? "-"}`,
        `Asal Sekolah: ${metadata.school_origin ?? "-"}`,
        `Tanggal Lahir: ${metadata.birth_date ?? "-"}`,
        "",
        `Approve: ${approveUrl}`,
        `Reject: ${rejectUrl}`,
      ].join("\n"),
    });

    return Response.json({
      ok: true,
      pendingAdminApproval: true,
      message:
        "Registrasi diterima dan menunggu verifikasi admin. Email konfirmasi akan dikirim setelah disetujui.",
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

