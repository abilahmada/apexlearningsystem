import { requireAppUserFromRequest } from "@/lib/auth/request-user";
import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";

const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024;

function objectPath(userId: string) {
  return `${userId}/avatar.jpg`;
}

export async function POST(req: Request) {
  const auth = await requireAppUserFromRequest(req);
  if (!auth.ok) {
    return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });
  }
  if (auth.role === "ADMIN") {
    return jsonPrivateNoStore({ message: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return jsonPrivateNoStore({ message: "Missing file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return jsonPrivateNoStore({ message: "File too large" }, { status: 400 });
  }
  const ct = (file.type || "").toLowerCase();
  if (!ct.includes("jpeg") && !ct.includes("jpg")) {
    return jsonPrivateNoStore({ message: "Only JPEG images are allowed" }, { status: 400 });
  }

  const path = objectPath(auth.userId);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await auth.supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (upErr) {
    return jsonPrivateNoStore({ message: upErr.message }, { status: 500 });
  }

  const { data: pub } = auth.supabase.storage.from(BUCKET).getPublicUrl(path);
  const avatarUrl = pub.publicUrl;

  const { error: dbErr } = await auth.supabase
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", auth.userId);
  if (dbErr) {
    return jsonPrivateNoStore({ message: dbErr.message }, { status: 500 });
  }

  return jsonPrivateNoStore({ avatarUrl });
}

export async function DELETE(req: Request) {
  const auth = await requireAppUserFromRequest(req);
  if (!auth.ok) {
    return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });
  }
  if (auth.role === "ADMIN") {
    return jsonPrivateNoStore({ message: "Forbidden" }, { status: 403 });
  }

  const path = objectPath(auth.userId);
  await auth.supabase.storage.from(BUCKET).remove([path]);

  const { error: dbErr } = await auth.supabase.from("users").update({ avatar_url: null }).eq("id", auth.userId);
  if (dbErr) {
    return jsonPrivateNoStore({ message: dbErr.message }, { status: 500 });
  }

  return jsonPrivateNoStore({ ok: true });
}
