import { requireAppUserFromRequest } from "@/lib/auth/request-user";
import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";

/**
 * GET /api/assessment/mentor-flags?userId=<studentUserId>
 * Auth: MENTOR or ADMIN.
 * Returns unresolved calibration_flags for a student.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireAppUserFromRequest(req);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });
    if (auth.role !== "MENTOR" && auth.role !== "ADMIN") {
      return jsonPrivateNoStore({ message: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") ?? "";
    if (!userId) return jsonPrivateNoStore({ message: "userId wajib." }, { status: 400 });

    const { supabase } = auth;

    const { data, error } = await supabase
      .from("calibration_flags")
      .select("id, flag_type, dimension, severity, payload, resolved, created_at")
      .eq("user_id", userId)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return jsonPrivateNoStore({ message: error.message }, { status: 500 });

    const flags = (data ?? []).map((f) => ({
      id: String(f.id),
      type: String(f.flag_type ?? ""),
      dimension: f.dimension ? String(f.dimension) : null,
      severity: String(f.severity ?? "LOW"),
      payload: (f.payload && typeof f.payload === "object" ? f.payload : {}) as Record<string, unknown>,
      createdAt: String(f.created_at ?? ""),
    }));

    return jsonPrivateNoStore({ flags });
  } catch (e) {
    return jsonPrivateNoStore({ message: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
