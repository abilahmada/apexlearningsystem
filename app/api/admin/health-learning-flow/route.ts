import { requireAdminFromRequest } from "@/lib/auth/admin-request";

type HealthIssue = {
  id: string;
  title: string;
  issue: string;
  moduleId?: string;
};

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const supabase = auth.supabase;

  const [{ data: modules, error: modulesErr }, { data: lessons, error: lessonsErr }, { data: quizzes, error: quizzesErr }] =
    await Promise.all([
      supabase.from("modules").select("id, title"),
      supabase.from("lessons").select("id, title, module_id"),
      supabase.from("quizzes").select("lesson_id, questions_pre, questions_post"),
    ]);

  if (modulesErr) return Response.json({ message: modulesErr.message }, { status: 500 });
  if (lessonsErr) return Response.json({ message: lessonsErr.message }, { status: 500 });
  if (quizzesErr) return Response.json({ message: quizzesErr.message }, { status: 500 });

  const lessonsByModule = new Map<string, Array<{ id: string; title: string }>>();
  for (const l of lessons ?? []) {
    const key = String(l.module_id ?? "");
    const arr = lessonsByModule.get(key) ?? [];
    arr.push({ id: String(l.id), title: String(l.title ?? "") });
    lessonsByModule.set(key, arr);
  }

  const quizByLesson = new Map<string, Array<{ questions_pre: unknown; questions_post: unknown }>>();
  for (const q of quizzes ?? []) {
    const key = String(q.lesson_id ?? "");
    const arr = quizByLesson.get(key) ?? [];
    arr.push({ questions_pre: q.questions_pre, questions_post: q.questions_post });
    quizByLesson.set(key, arr);
  }

  const modulesWithoutLesson: HealthIssue[] = [];
  for (const m of modules ?? []) {
    const moduleId = String(m.id);
    const rows = lessonsByModule.get(moduleId) ?? [];
    if (rows.length === 0) {
      modulesWithoutLesson.push({
        id: moduleId,
        title: String(m.title ?? ""),
        issue: "MODULE_WITHOUT_LESSON",
      });
    }
  }

  const quizEmptyIssues: HealthIssue[] = [];
  for (const l of lessons ?? []) {
    const lessonId = String(l.id);
    const rows = quizByLesson.get(lessonId) ?? [];
    if (rows.length === 0) {
      quizEmptyIssues.push({
        id: lessonId,
        title: String(l.title ?? ""),
        moduleId: String(l.module_id ?? ""),
        issue: "MISSING_QUIZ_ROW",
      });
      continue;
    }
    const hasValid = rows.some((row) => {
      const preCount = Array.isArray(row.questions_pre) ? row.questions_pre.length : 0;
      const postCount = Array.isArray(row.questions_post) ? row.questions_post.length : 0;
      return preCount > 0 && postCount > 0;
    });
    if (!hasValid) {
      quizEmptyIssues.push({
        id: lessonId,
        title: String(l.title ?? ""),
        moduleId: String(l.module_id ?? ""),
        issue: "EMPTY_PRE_OR_POST",
      });
    }
  }

  return Response.json({
    ok: true,
    summary: {
      modulesWithoutLesson: modulesWithoutLesson.length,
      quizEmptyIssues: quizEmptyIssues.length,
      lockReasonMismatch: null,
      checkedAt: new Date().toISOString(),
    },
    samples: {
      modulesWithoutLesson: modulesWithoutLesson.slice(0, 8),
      quizEmptyIssues: quizEmptyIssues.slice(0, 8),
    },
  });
}

