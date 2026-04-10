import { requireAppUserFromRequest } from "@/lib/auth/request-user";

export async function GET(req: Request) {
  const auth = await requireAppUserFromRequest(req);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  return Response.json({
    id: auth.userId,
    email: auth.email,
    role: String(auth.role).toLowerCase(),
  });
}

