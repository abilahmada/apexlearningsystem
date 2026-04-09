import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Preflight: cek apakah kode ID orang tua ada di parent_profiles (tanpa data sensitif).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("code")?.trim();
  if (!raw) {
    return Response.json(
      { valid: false, message: "Parameter code wajib diisi." },
      { status: 400 },
    );
  }

  const code = raw.toUpperCase();
  if (code.length < 4 || code.length > 32) {
    return Response.json({ valid: false, message: "Format ID orang tua tidak valid." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("apex_parent_link_code_exists", { p_code: code });

    if (error) {
      return Response.json(
        {
          valid: false,
          message:
            error.message.includes("function") && error.message.includes("does not exist")
              ? "Validasi belum tersedia di server. Jalankan migrasi database terbaru."
              : error.message,
        },
        { status: 503 },
      );
    }

    const exists = data === true;
    if (!exists) {
      return Response.json({
        valid: false,
        message: "ID Orang Tua tidak ditemukan. Pastikan kode sama persis dengan di akun orang tua.",
      });
    }

    return Response.json({ valid: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return Response.json({ valid: false, message: msg }, { status: 500 });
  }
}
