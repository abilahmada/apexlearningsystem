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

type QuizRow = {
  lesson_id: string;
  question: string;
  options: string[];
  answer: string;
  hint?: string;
};

export async function POST(req: Request) {
  try {
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) return Response.json({ message: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as { rows?: QuizRow[] };
    if (!body.rows || body.rows.length === 0) {
      return Response.json({ message: "rows is required" }, { status: 400 });
    }

    const grouped = new Map<string, QuizRow[]>();
    for (const row of body.rows) {
      if (
        !row.lesson_id ||
        !row.question ||
        !Array.isArray(row.options) ||
        row.options.length < 2
      ) {
        return Response.json({ message: "Invalid quiz row payload" }, { status: 400 });
      }
      if (!grouped.has(row.lesson_id)) grouped.set(row.lesson_id, []);
      grouped.get(row.lesson_id)?.push(row);
    }

    const supabase = createSupabaseAdminClient();
    const results: Array<{ lesson_id: string; quiz_id: string }> = [];

    for (const [lessonId, rows] of grouped.entries()) {
      const questions = rows.map((r) => ({
        question: r.question,
        options: r.options,
        answer: r.answer,
        hint: r.hint ?? "",
      }));

      const { data: existing } = await supabase
        .from("quizzes")
        .select("id")
        .eq("lesson_id", lessonId)
        .maybeSingle();

      if (existing?.id) {
        const { data, error } = await supabase
          .from("quizzes")
          .update({ questions })
          .eq("id", existing.id)
          .select("id, lesson_id")
          .single();
        if (error) return Response.json({ message: error.message }, { status: 500 });
        results.push({ lesson_id: String(data.lesson_id), quiz_id: String(data.id) });
      } else {
        const { data, error } = await supabase
          .from("quizzes")
          .insert({ lesson_id: lessonId, questions })
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
