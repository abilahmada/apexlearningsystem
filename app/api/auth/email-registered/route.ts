import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Cek apakah email sudah ada di public.users (mirror dari Auth).
 * Hanya dipanggil dari app saat sign-up; memerlukan SUPABASE_SERVICE_ROLE_KEY.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("email")?.trim();
  if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return Response.json({ registered: false, message: "Email tidak valid." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("apex_email_registered_for_signup", { p_email: raw });

    if (error) {
      if (error.message.includes("does not exist") || error.code === "42883") {
        return Response.json(
          {
            registered: false,
            message:
              "Fungsi apex_email_registered_for_signup belum ada. Jalankan migrasi database terbaru.",
          },
          { status: 503 },
        );
      }
      return Response.json({ registered: false, message: error.message }, { status: 500 });
    }

    return Response.json({ registered: data === true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return Response.json(
        {
          registered: false,
          message:
            "Backend belum mengatur SUPABASE_SERVICE_ROLE_KEY — pengecekan email ganda tidak aktif.",
        },
        { status: 503 },
      );
    }
    return Response.json({ registered: false, message: msg }, { status: 500 });
  }
}
