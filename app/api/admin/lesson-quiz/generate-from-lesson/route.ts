import { generateQuizzesForLessonRow } from "@/lib/ai/generate-lesson-prepost-quizzes";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function isAdminRequest(req: Request) {
  const token = getBearerToken(req);
  if (!token) return false;

  const supabase = createSupabaseAdminClient();
  const authRes = await supabase.auth.getUser(token);
  const authUser = authRes.data.user;
  if (!authUser?.email) return false;

  const { data, error } = await supabase.from("users").select("role").eq("email", authUser.email).single();

  if (error || !data) return false;
  return String(data.role) === "ADMIN";
}

function parseUuid(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
  return t.toLowerCase();
}

export async function POST(req: Request) {
  try {
    const ok = await isAdminRequest(req);
    if (!ok) return Response.json({ message: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as Record<string, unknown>;
    const lessonId = parseUuid(body.lessonId);
    const overwrite = body.overwrite === true || body.overwrite === "true";
    if (!lessonId) {
      return Response.json({ message: "lessonId (UUID) wajib." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: lesson, error: leErr } = await supabase
      .from("lessons")
      .select("id, title, content_url, modules!inner(title)")
      .eq("id", lessonId)
      .maybeSingle();

    if (leErr) return Response.json({ message: leErr.message }, { status: 500 });
    if (!lesson) return Response.json({ message: "Lesson tidak ditemukan." }, { status: 404 });

    const mod = Array.isArray(lesson.modules) ? lesson.modules[0] : lesson.modules;
    const moduleTitle = String((mod as { title?: string } | null)?.title ?? "");

    const { data: existing, error: exErr } = await supabase
      .from("quizzes")
      .select("id")
      .eq("lesson_id", lessonId)
      .maybeSingle();
    if (exErr) return Response.json({ message: exErr.message }, { status: 500 });
    if (existing?.id && !overwrite) {
      return Response.json(
        {
          message:
            "Quiz untuk lesson ini sudah ada. Kirim { \"overwrite\": true } untuk menimpa soal pre/post.",
        },
        { status: 409 },
      );
    }

    try {
      const { pre, post, usage } = await generateQuizzesForLessonRow({
        lessonTitle: String(lesson.title ?? ""),
        moduleTitle,
        contentUrl: lesson.content_url ? String(lesson.content_url) : null,
      });

      const questionsLegacy = post;
      const row = {
        lesson_id: lessonId,
        questions: questionsLegacy,
        questions_pre: pre,
        questions_post: post,
      };

      if (existing?.id) {
        const { error: upErr } = await supabase.from("quizzes").update(row).eq("id", existing.id);
        if (upErr) return Response.json({ message: upErr.message }, { status: 500 });
      } else {
        const { error: insErr } = await supabase.from("quizzes").insert(row);
        if (insErr) return Response.json({ message: insErr.message }, { status: 500 });
      }

      return Response.json({
        ok: true,
        lessonId,
        preCount: pre.length,
        postCount: post.length,
        usage,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ message: msg }, { status: 502 });
    }
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
