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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBank(value: unknown): QuizBank {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (s === "pre" || s === "pretest" || s === "questions_pre") return "pre";
  if (s === "post" || s === "posttest" || s === "questions_post") return "post";
  return "legacy";
}

function normalizeAnswerLetter(answerRaw: unknown, options: string[]): string | null {
  const raw = String(answerRaw ?? "")
    .trim()
    .toUpperCase();
  if (!raw) return null;
  if (["A", "B", "C", "D"].includes(raw)) return raw;
  const idx = options.findIndex((opt) => opt.trim().toUpperCase() === raw);
  if (idx < 0 || idx > 3) return null;
  return ["A", "B", "C", "D"][idx];
}

function validateQuizRow(row: QuizRow, index: number): string | null {
  const lessonId = String(row.lesson_id ?? "").trim();
  const question = String(row.question ?? "").trim();
  const options = Array.isArray(row.options) ? row.options.map((x) => String(x ?? "").trim()) : [];
  if (!UUID_RE.test(lessonId)) return `Row ${index + 1}: lesson_id harus UUID valid.`;
  if (question.length < 10) return `Row ${index + 1}: question minimal 10 karakter.`;
  if (options.length !== 4) return `Row ${index + 1}: options harus tepat 4 pilihan (A-D).`;
  if (options.some((opt) => opt.length < 1)) {
    return `Row ${index + 1}: semua opsi A-D wajib terisi.`;
  }
  if (new Set(options.map((opt) => opt.toLowerCase())).size < 4) {
    return `Row ${index + 1}: opsi A-D tidak boleh duplikat.`;
  }
  const answerLetter = normalizeAnswerLetter(row.answer, options);
  if (!answerLetter) return `Row ${index + 1}: answer harus A/B/C/D atau sama dengan teks salah satu opsi.`;
  return null;
}

function rowToMcq(r: QuizRow) {
  const options = r.options.map((x) => String(x ?? "").trim());
  const answer = normalizeAnswerLetter(r.answer, options) ?? "A";
  return {
    question: String(r.question ?? "").trim(),
    options,
    answer,
    hint: String(r.hint ?? "").trim(),
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

    for (let i = 0; i < body.rows.length; i += 1) {
      const row = body.rows[i];
      const validationError = validateQuizRow(row, i);
      if (validationError) {
        return Response.json({ message: validationError }, { status: 400 });
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
