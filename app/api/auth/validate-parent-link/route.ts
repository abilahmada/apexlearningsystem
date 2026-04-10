import { createSupabaseAdminClient } from "@/lib/supabase/server";

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

  // Fallback when RPC is unavailable or schema cache lags.
  const fallback = await supabase
    .from("parent_profiles")
    .select("id")
    .ilike("parent_link_code", code)
    .limit(1)
    .maybeSingle();
  if (fallback.error) return { exists: false, error: fallback.error.message };
  return { exists: Boolean(fallback.data?.id), error: null };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = String(url.searchParams.get("code") ?? "")
      .trim()
      .toUpperCase();
    if (!code) {
      return Response.json({ valid: false, message: "ID Orang Tua wajib diisi." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const result = await hasParentLinkCode(supabase, code);
    if (result.error) return Response.json({ valid: false, message: result.error }, { status: 500 });

    if (!result.exists) {
      return Response.json({
        valid: false,
        message: "ID tidak ditemukan. Minta orang tua membuka Portal Orang Tua dan menyalin ID mereka.",
      });
    }

    return Response.json({ valid: true });
  } catch (error) {
    return Response.json(
      { valid: false, message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
