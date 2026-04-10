import { NextRequest, NextResponse } from "next/server";

function hasBearerToken(req: NextRequest) {
  const auth = req.headers.get("authorization");
  return Boolean(auth && auth.startsWith("Bearer ") && auth.length > 7);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/api/auth/me" ||
    (pathname === "/api/admin/settings" && req.method === "PUT") ||
    pathname === "/api/admin/content" ||
    pathname === "/api/admin/content/bulk-quiz" ||
    pathname === "/api/admin/lesson-quiz/generate-from-lesson"
  ) {
    if (!hasBearerToken(req)) {
      return NextResponse.json(
        { message: "Unauthorized: missing bearer token" },
        { status: 401 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/auth/me",
    "/api/admin/settings",
    "/api/admin/content",
    "/api/admin/content/bulk-quiz",
    "/api/admin/lesson-quiz/generate-from-lesson",
  ],
};
