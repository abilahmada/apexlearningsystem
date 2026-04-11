import { generateQuizzesForLessonRow } from "@/lib/ai/generate-lesson-prepost-quizzes";
import { isAdminRequest } from "@/lib/auth/admin-request";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function parseUuid(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
  return t.toLowerCase();
}

function toRecordMeta(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
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

    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return Response.json(
        {
          message:
            "ANTHROPIC_API_KEY belum diset di server. Generator quiz PRE/POST memakai Claude (Anthropic), bukan chat Socrates.",
        },
        { status: 503 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: lesson, error: leErr } = await supabase
      .from("lessons")
      .select("id, title, content_url, metadata, modules!inner(title, metadata)")
      .eq("id", lessonId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (leErr) return Response.json({ message: leErr.message }, { status: 500 });
    if (!lesson) return Response.json({ message: "Lesson tidak ditemukan." }, { status: 404 });

    const mod = Array.isArray(lesson.modules) ? lesson.modules[0] : lesson.modules;
    const moduleTitle = String((mod as { title?: string } | null)?.title ?? "");
    const moduleMetadata = toRecordMeta((mod as { metadata?: unknown } | null)?.metadata ?? null);

    const { data: existing, error: exErr } = await supabase
      .from("quizzes")
      .select("id")
      .eq("lesson_id", lessonId)
      .order("id", { ascending: true })
      .limit(1)
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
        lessonMetadata: toRecordMeta((lesson as { metadata?: unknown }).metadata ?? null),
        moduleMetadata,
      });

      const questionsLegacy = post;
      const row = {
        lesson_id: lessonId,
        questions: questionsLegacy,
        questions_pre: pre,
        questions_post: post,
      };

      // Satu lesson = satu quiz (uq_quizzes_lesson_id). Upsert menghindari duplikat + race insert.
      const { error: saveErr } = await supabase.from("quizzes").upsert(row, { onConflict: "lesson_id" });
      if (saveErr) return Response.json({ message: saveErr.message }, { status: 500 });

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
