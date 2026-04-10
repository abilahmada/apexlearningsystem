import { isAdminRequest } from "@/lib/auth/admin-request";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  processRegistrationVerification,
  type RegistrationVerificationRow,
} from "@/lib/registration/process-verification";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function getAppBaseUrl(req: Request) {
  const envBase = process.env.APP_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req: Request) {
  try {
    const ok = await isAdminRequest(req);
    if (!ok) return Response.json({ message: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as { verificationId?: string; action?: "approve" | "reject" };
    const verificationId = String(body.verificationId ?? "").trim();
    const action = body.action;
    if (!isUuid(verificationId) || (action !== "approve" && action !== "reject")) {
      return Response.json({ message: "Invalid payload." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: verification, error: verErr } = await supabase
      .from("registration_verifications")
      .select("id, user_id, email, role, status, expires_at, payload")
      .eq("id", verificationId)
      .maybeSingle();
    if (verErr) return Response.json({ message: verErr.message }, { status: 500 });
    if (!verification) return Response.json({ message: "Data verifikasi tidak ditemukan." }, { status: 404 });

    const result = await processRegistrationVerification(
      supabase,
      verification as RegistrationVerificationRow,
      action,
      getAppBaseUrl(req),
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
