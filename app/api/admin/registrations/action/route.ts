import { requireAdminFromRequest } from "@/lib/auth/admin-request";
import { processRegistrationVerification } from "@/lib/registration/process-verification";

function getAppBaseUrl(req: Request) {
  const envBase = process.env.APP_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

type Body = {
  verificationId?: string;
  action?: string;
};

export async function POST(req: Request) {
  try {
    const auth = await requireAdminFromRequest(req);
    if (!auth.ok) {
      return Response.json({ message: auth.message }, { status: auth.status });
    }

    const body = (await req.json()) as Body;
    const verificationId = String(body.verificationId ?? "").trim();
    const action = String(body.action ?? "").trim().toLowerCase();
    if (!verificationId || (action !== "approve" && action !== "reject")) {
      return Response.json({ message: "verificationId dan action (approve|reject) wajib." }, { status: 400 });
    }

    const { data: ver, error: verErr } = await auth.supabase
      .from("registration_verifications")
      .select("id, user_id, email, role, status, expires_at, payload")
      .eq("id", verificationId)
      .maybeSingle();

    if (verErr || !ver) {
      return Response.json({ message: "Permintaan verifikasi tidak ditemukan." }, { status: 404 });
    }

    const baseUrl = getAppBaseUrl(req);
    const result = await processRegistrationVerification(
      auth.supabase,
      {
        id: ver.id,
        user_id: ver.user_id,
        email: ver.email,
        role: String(ver.role),
        status: String(ver.status),
        expires_at: ver.expires_at,
        payload: ver.payload,
      },
      action === "reject" ? "reject" : "approve",
      baseUrl,
    );

    if (!result.ok) {
      return Response.json({ message: result.message }, { status: result.status });
    }
    return Response.json({ ok: true, message: result.message });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
