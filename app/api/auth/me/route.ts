import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AppRole = "student" | "parent" | "mentor" | "admin";

function mapDbRole(role: string): AppRole | null {
  if (role === "STUDENT") return "student";
  if (role === "PARENT") return "parent";
  if (role === "MENTOR") return "mentor";
  if (role === "ADMIN") return "admin";
  return null;
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return Response.json({ message: "Missing token" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const authRes = await supabase.auth.getUser(token);
    const authUser = authRes.data.user;

    if (!authUser?.email) {
      return Response.json({ message: "Invalid token" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("users")
      .select("id, email, role, registration_approved")
      .eq("email", authUser.email)
      .single();

    if (error || !data) {
      return Response.json(
        { message: "User profile tidak ditemukan di tabel users." },
        { status: 403 },
      );
    }

    const appRole = mapDbRole(String(data.role));
    if (!appRole) {
      return Response.json({ message: "Role user tidak valid." }, { status: 403 });
    }

    if (data.registration_approved !== true) {
      return Response.json(
        {
          message:
            "Akun menunggu verifikasi admin APEX. Anda akan menerima email konfirmasi setelah diverifikasi.",
        },
        { status: 403 },
      );
    }

    return Response.json({
      id: data.id,
      email: data.email,
      role: appRole,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
