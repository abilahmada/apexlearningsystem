import { createSupabaseAdminClient } from "@/lib/supabase/server";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const supabase = createSupabaseAdminClient();
    const authRes = await supabase.auth.getUser(token);
    const authUser = authRes.data.user;
    if (!authUser?.email) return Response.json({ message: "Invalid token" }, { status: 401 });

    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id, email, role")
      .eq("email", authUser.email)
      .single();
    if (userErr || !userRow) {
      return Response.json({ message: "User profile tidak ditemukan." }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ message: "File avatar wajib diisi." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return Response.json({ message: "Avatar harus berupa gambar." }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return Response.json({ message: "Ukuran avatar maksimal 2MB." }, { status: 400 });
    }

    const bucket = "profile-avatars";
    const bucketRes = await supabase.storage.getBucket(bucket);
    if (!bucketRes.data) {
      const createRes = await supabase.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 2 * 1024 * 1024,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
      });
      if (createRes.error && !createRes.error.message.toLowerCase().includes("already exists")) {
        return Response.json({ message: createRes.error.message }, { status: 500 });
      }
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
    const safeExt = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ? ext : "jpg";
    const path = `${String(userRow.role).toLowerCase()}/${userRow.id}/avatar.${safeExt}`;
    const arr = await file.arrayBuffer();
    const bytes = new Uint8Array(arr);

    const uploadRes = await supabase.storage.from(bucket).upload(path, bytes, {
      upsert: true,
      contentType: file.type,
    });
    if (uploadRes.error) {
      return Response.json({ message: uploadRes.error.message }, { status: 500 });
    }

    const publicUrlRes = supabase.storage.from(bucket).getPublicUrl(path);
    const avatarUrl = publicUrlRes.data.publicUrl;

    const { error: upErr } = await supabase
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", userRow.id);
    if (upErr) return Response.json({ message: upErr.message }, { status: 500 });

    return Response.json({ ok: true, avatarUrl });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return Response.json({ message: "Missing token" }, { status: 401 });

    const supabase = createSupabaseAdminClient();
    const authRes = await supabase.auth.getUser(token);
    const authUser = authRes.data.user;
    if (!authUser?.email) return Response.json({ message: "Invalid token" }, { status: 401 });

    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id, email, role")
      .eq("email", authUser.email)
      .single();
    if (userErr || !userRow) {
      return Response.json({ message: "User profile tidak ditemukan." }, { status: 403 });
    }

    const bucket = "profile-avatars";
    const rolePrefix = String(userRow.role).toLowerCase();
    const candidatePaths = [
      `${rolePrefix}/${userRow.id}/avatar.png`,
      `${rolePrefix}/${userRow.id}/avatar.jpg`,
      `${rolePrefix}/${userRow.id}/avatar.jpeg`,
      `${rolePrefix}/${userRow.id}/avatar.webp`,
      `${rolePrefix}/${userRow.id}/avatar.gif`,
    ];
    await supabase.storage.from(bucket).remove(candidatePaths);

    const { error: upErr } = await supabase
      .from("users")
      .update({ avatar_url: null })
      .eq("id", userRow.id);
    if (upErr) return Response.json({ message: upErr.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

