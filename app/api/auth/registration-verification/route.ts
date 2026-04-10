import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  processRegistrationVerification,
  type RegistrationVerificationRow,
} from "@/lib/registration/process-verification";

function getAppBaseUrl(req: Request) {
  const envBase = process.env.APP_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const actionRaw = String(url.searchParams.get("action") ?? "").toLowerCase();
    const token = String(url.searchParams.get("token") ?? "").trim();
    if ((actionRaw !== "approve" && actionRaw !== "reject") || !token) {
      return new Response("Parameter action (approve|reject) dan token wajib diisi.", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    const action = actionRaw as "approve" | "reject";

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const supabase = createSupabaseAdminClient();
    const { data: ver, error: verErr } = await supabase
      .from("registration_verifications")
      .select("id, user_id, email, role, status, expires_at, payload")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (verErr) {
      return new Response(verErr.message, {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (!ver) {
      return new Response("Tautan tidak valid atau sudah tidak berlaku.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const result = await processRegistrationVerification(
      supabase,
      ver as RegistrationVerificationRow,
      action,
      getAppBaseUrl(req),
    );

    if (!result.ok) {
      return new Response(result.message, {
        status: result.status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const title = action === "approve" ? "Berhasil disetujui" : "Berhasil diproses";
    const html = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/><title>APEX — ${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:36rem;margin:2rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.25rem">${title}</h1><p>${escapeHtml(result.message)}</p><p><a href="${escapeHtml(getAppBaseUrl(req))}">Kembali ke beranda APEX</a></p></body></html>`;
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unknown error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
