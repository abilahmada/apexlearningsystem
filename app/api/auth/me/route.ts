import { requireAppUserFromRequest } from "@/lib/auth/request-user";
import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";

export async function GET(req: Request) {
  const auth = await requireAppUserFromRequest(req);
  if (!auth.ok) {
    return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });
  }

  return jsonPrivateNoStore({
    id: auth.userId,
    email: auth.email,
    role: String(auth.role).toLowerCase(),
  });
}

