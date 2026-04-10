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

  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("email", authUser.email)
    .single();

  if (error || !data) return false;
  return String(data.role) === "ADMIN";
}

type QuizBank = "legacy" | "pre" | "post";

type QuizRow = {
  lesson_id: string;
  question: string;
  options: string[];
  answer: string;
  hint?: string;
  /** legacy (default) → `questions`; pre → `questions_pre`; post → `questions_post` */
  bank?: string;
};

function normalizeBank(value: unknown): QuizBank {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (s === "pre" || s === "pretest" || s === "questions_pre") return "pre";
  if (s === "post" || s === "posttest" || s === "questions_post") return "post";
  return "legacy";
}

function rowToMcq(r: QuizRow) {
  return {
    question: r.question,
    options: r.options,
    answer: r.answer,
    hint: r.hint ?? "",
  };
}

export async function POST(req: Request) {
  try {
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) return Response.json({ message: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as { rows?: QuizRow[] };
    if (!body.rows || body.rows.length === 0) {
      return Response.json({ message: "rows is required" }, { status: 400 });
    }

    type LessonBuckets = { legacy: QuizRow[]; pre: QuizRow[]; post: QuizRow[] };
    const grouped = new Map<string, LessonBuckets>();

    for (const row of body.rows) {
      if (
        !row.lesson_id ||
        !row.question ||
        !Array.isArray(row.options) ||
        row.options.length < 2
      ) {
        return Response.json({ message: "Invalid quiz row payload" }, { status: 400 });
      }
      const lessonId = String(row.lesson_id).trim();
      const bank = normalizeBank(row.bank);
      if (!grouped.has(lessonId)) {
        grouped.set(lessonId, { legacy: [], pre: [], post: [] });
      }
      grouped.get(lessonId)![bank].push(row);
    }

    const supabase = createSupabaseAdminClient();
    const results: Array<{ lesson_id: string; quiz_id: string }> = [];

    for (const [lessonId, buckets] of grouped.entries()) {
      const hasLegacy = buckets.legacy.length > 0;
      const hasPre = buckets.pre.length > 0;
      const hasPost = buckets.post.length > 0;
      if (!hasLegacy && !hasPre && !hasPost) continue;

      const { data: existing } = await supabase
        .from("quizzes")
        .select("id")
        .eq("lesson_id", lessonId)
        .maybeSingle();

      if (existing?.id) {
        const patch: Record<string, unknown> = {};
        if (hasLegacy) patch.questions = buckets.legacy.map(rowToMcq);
        if (hasPre) patch.questions_pre = buckets.pre.map(rowToMcq);
        if (hasPost) patch.questions_post = buckets.post.map(rowToMcq);
        const { data, error } = await supabase
          .from("quizzes")
          .update(patch)
          .eq("id", existing.id)
          .select("id, lesson_id")
          .single();
        if (error) return Response.json({ message: error.message }, { status: 500 });
        results.push({ lesson_id: String(data.lesson_id), quiz_id: String(data.id) });
      } else {
        const insert: Record<string, unknown> = {
          lesson_id: lessonId,
          questions: hasLegacy ? buckets.legacy.map(rowToMcq) : [],
        };
        if (hasPre) insert.questions_pre = buckets.pre.map(rowToMcq);
        if (hasPost) insert.questions_post = buckets.post.map(rowToMcq);
        const { data, error } = await supabase
          .from("quizzes")
          .insert(insert)
          .select("id, lesson_id")
          .single();
        if (error) return Response.json({ message: error.message }, { status: 500 });
        results.push({ lesson_id: String(data.lesson_id), quiz_id: String(data.id) });
      }
    }

    return Response.json({ ok: true, processed_lessons: results.length, results });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
