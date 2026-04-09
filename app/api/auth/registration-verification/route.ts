import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { processRegistrationVerification } from "@/lib/registration/process-verification";

function getAppBaseUrl(req: Request) {
  const envBase = process.env.APP_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim();
    const action = url.searchParams.get("action")?.trim().toLowerCase();
    if (!token || (action !== "approve" && action !== "reject")) {
      return new Response("Invalid verification link", { status: 400 });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const supabase = createSupabaseAdminClient();

    const { data: ver, error: verErr } = await supabase
      .from("registration_verifications")
      .select("id, user_id, email, role, status, expires_at, payload")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (verErr || !ver) return new Response("Verification request not found", { status: 404 });

    const baseUrl = getAppBaseUrl(req);
    const result = await processRegistrationVerification(
      supabase,
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
      return new Response(result.message, { status: result.status });
    }
    return new Response(result.message, { status: 200 });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unknown error", { status: 500 });
  }
}

