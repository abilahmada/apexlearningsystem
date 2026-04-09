import { requireAdminFromRequest } from "@/lib/auth/admin-request";

export async function GET(req: Request) {
  try {
    const auth = await requireAdminFromRequest(req);
    if (!auth.ok) {
      return Response.json({ message: auth.message }, { status: auth.status });
    }

    const { data, error } = await auth.supabase
      .from("registration_verifications")
      .select("id, user_id, email, role, status, payload, expires_at, created_at")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ message: error.message }, { status: 500 });
    }

    return Response.json({ items: data ?? [] });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
