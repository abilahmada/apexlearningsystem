import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ContentType = "courses" | "modules" | "lessons" | "quizzes";

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

function isValidType(value: string | null): value is ContentType {
  return value === "courses" || value === "modules" || value === "lessons" || value === "quizzes";
}

function isJsonArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

const VALID_DAY_KEYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

function normalizeDayKey(value: unknown): string | null {
  const t = String(value ?? "").trim().toLowerCase();
  if (t === "mon" || t === "monday" || t === "senin") return "mon";
  if (t === "tue" || t === "tuesday" || t === "selasa") return "tue";
  if (t === "wed" || t === "wednesday" || t === "rabu") return "wed";
  if (t === "thu" || t === "thursday" || t === "kamis") return "thu";
  if (t === "fri" || t === "friday" || t === "jumat" || t === "jum'at") return "fri";
  if (t === "sat" || t === "saturday" || t === "sabtu") return "sat";
  if (t === "sun" || t === "sunday" || t === "minggu") return "sun";
  return null;
}

function validateModuleMetadata(metadata: unknown): { ok: true; normalized: Record<string, unknown> } | { ok: false; message: string } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { ok: false, message: "Invalid module payload: metadata must be an object" };
  }
  const source = { ...(metadata as Record<string, unknown>) };
  const grade = String(source.grade ?? "").trim().toUpperCase();
  if (!["SD", "SMP", "SMK", "SMA"].includes(grade)) {
    return { ok: false, message: "Invalid module metadata: grade must be SD/SMP/SMK/SMA" };
  }
  const subject = String(source.subject ?? "").trim().toLowerCase();
  if (!subject) {
    return { ok: false, message: "Invalid module metadata: subject is required" };
  }
  const phaseRaw = Number(source.phase ?? source.phaseOrder ?? source.phase_order);
  const phase = Number.isFinite(phaseRaw) ? Math.max(1, Math.round(phaseRaw)) : NaN;
  if (!Number.isFinite(phase)) {
    return { ok: false, message: "Invalid module metadata: phase must be a positive number" };
  }
  const rawDays = Array.isArray(source.scheduleDays) ? source.scheduleDays : [];
  const days = Array.from(
    new Set(
      rawDays
        .map((x) => normalizeDayKey(x))
        .filter((x): x is string => Boolean(x) && VALID_DAY_KEYS.has(String(x))),
    ),
  );
  if (days.length === 0) {
    return { ok: false, message: "Invalid module metadata: scheduleDays must include at least one day" };
  }
  const scheduleTime = String(source.scheduleTime ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(scheduleTime)) {
    return { ok: false, message: "Invalid module metadata: scheduleTime must use HH:mm format" };
  }
  const scheduleDurationRaw = Number(source.scheduleDuration ?? 0);
  const scheduleDuration = Number.isFinite(scheduleDurationRaw) ? Math.round(scheduleDurationRaw) : 0;
  if (scheduleDuration <= 0) {
    return { ok: false, message: "Invalid module metadata: scheduleDuration must be greater than 0" };
  }
  const scheduleType = String(source.scheduleType ?? "").trim().toLowerCase();
  if (!["core", "review", "project"].includes(scheduleType)) {
    return { ok: false, message: "Invalid module metadata: scheduleType must be core/review/project" };
  }
  return {
    ok: true,
    normalized: {
      ...source,
      grade,
      subject,
      phase,
      phaseOrder: phase,
      phase_order: phase,
      scheduleDays: days,
      scheduleTime,
      scheduleDuration,
      scheduleType,
    },
  };
}

type SeedQuestion = {
  question: string;
  options: string[];
  answer: string;
  hint: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
};

function buildDefaultLessonQuestions(lessonTitle: string, mode: "PRE" | "POST"): SeedQuestion[] {
  const topic = lessonTitle.trim() || "materi ini";
  const modeLabel = mode === "PRE" ? "diagnostik awal" : "evaluasi akhir";
  return [
    {
      question: `[${mode}] Apa tujuan utama ${modeLabel} untuk topik "${topic}"?`,
      options: [
        "Mengukur pemahaman konsep secara jujur",
        "Menebak jawaban agar cepat selesai",
        "Menghafal tanpa memahami konsep",
        "Menghindari latihan soal",
      ],
      answer: "A",
      hint: "Pilih jawaban yang menekankan pemahaman konsep.",
      explanation: "Assessment yang baik mengukur pemahaman konsep, bukan tebakan.",
      difficulty: "easy",
      tags: [mode.toLowerCase(), "autoseed", "apex"],
    },
    {
      question: `[${mode}] Strategi paling efektif untuk belajar "${topic}" adalah ...`,
      options: [
        "Memahami konsep, berlatih terarah, lalu refleksi",
        "Menghafal contoh tanpa variasi soal",
        "Mengerjakan cepat tanpa cek hasil",
        "Menunda latihan sampai ujian",
      ],
      answer: "A",
      hint: "Cari kombinasi pemahaman, latihan, dan evaluasi.",
      explanation: "Siklus belajar efektif: pahami, praktikkan, evaluasi.",
      difficulty: "medium",
      tags: [mode.toLowerCase(), "learning-strategy", "autoseed"],
    },
    {
      question: `[${mode}] Indikator penguasaan topik "${topic}" adalah ...`,
      options: [
        "Mampu menjelaskan konsep dan menerapkannya pada soal baru",
        "Hanya bisa meniru contoh yang sama persis",
        "Menghafal definisi tanpa aplikasi",
        "Menghindari soal kontekstual",
      ],
      answer: "A",
      hint: "Penguasaan berarti bisa transfer konsep ke konteks baru.",
      explanation: "Mastery ditandai kemampuan menerapkan konsep pada masalah baru.",
      difficulty: "hard",
      tags: [mode.toLowerCase(), "mastery", "autoseed"],
    },
  ];
}

export async function GET(req: Request) {
  try {
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) return Response.json({ message: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const typeParam = url.searchParams.get("type");
    if (!isValidType(typeParam)) {
      return Response.json({ message: "Invalid type" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const courseId = url.searchParams.get("course_id");
    const moduleId = url.searchParams.get("module_id");
    const lessonId = url.searchParams.get("lesson_id");
    const phase = url.searchParams.get("phase");
    const subject = url.searchParams.get("subject");
    const track = url.searchParams.get("track");
    const code = url.searchParams.get("code");
    const benchmark = url.searchParams.get("benchmark");
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const safeLimit = Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 100);

    let data: unknown = null;
    let error: { message: string } | null = null;

    if (typeParam === "courses") {
      const res = await supabase
        .from("courses")
        .select("id, title, grade_level")
        .order("grade_level", { ascending: true })
        .order("title", { ascending: true })
        .limit(safeLimit);
      data = res.data;
      error = res.error;
    } else if (typeParam === "modules") {
      let query = supabase
        .from("modules")
        .select("id, course_id, title, sequence_order, mastery_threshold, metadata")
        .order("sequence_order", { ascending: true })
        .order("title", { ascending: true })
        .limit(safeLimit);
      if (courseId) query = query.eq("course_id", courseId);
      if (phase) query = query.contains("metadata", { phase });
      if (subject) query = query.contains("metadata", { subject });
      if (track) query = query.contains("metadata", { track });
      const res = await query;
      data = res.data;
      error = res.error;
    } else if (typeParam === "lessons") {
      let query = supabase
        .from("lessons")
        .select("id, module_id, title, type, content_url, metadata")
        .order("title", { ascending: true })
        .order("id", { ascending: true })
        .limit(safeLimit);
      if (moduleId) query = query.eq("module_id", moduleId);
      if (code) query = query.contains("metadata", { code });
      if (benchmark) query = query.contains("metadata", { benchmark });
      const res = await query;
      data = res.data;
      error = res.error;
    } else {
      let query = supabase
        .from("quizzes")
        .select("id, lesson_id, questions, questions_pre, questions_post")
        .order("lesson_id", { ascending: true })
        .order("id", { ascending: true })
        .limit(safeLimit);
      if (lessonId) query = query.eq("lesson_id", lessonId);
      const res = await query;
      data = res.data;
      error = res.error;
    }

    if (error) return Response.json({ message: error.message }, { status: 500 });
    return Response.json({ items: (data as unknown[]) ?? [] });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) return Response.json({ message: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as {
      type?: ContentType;
      payload?: Record<string, unknown>;
    };

    if (!body.type || !body.payload) {
      return Response.json({ message: "type and payload are required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    if (body.type === "courses") {
      const title = String(body.payload.title ?? "").trim();
      const gradeLevel = String(body.payload.grade_level ?? "").trim();
      if (!title || !["SD", "SMP", "SMK"].includes(gradeLevel)) {
        return Response.json({ message: "Invalid course payload" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("courses")
        .insert({ title, grade_level: gradeLevel })
        .select("id, title, grade_level")
        .single();
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json(data, { status: 201 });
    }

    if (body.type === "modules") {
      const courseId = String(body.payload.course_id ?? "").trim();
      const title = String(body.payload.title ?? "").trim();
      const sequenceOrder = Number(body.payload.sequence_order ?? 1);
      const masteryThreshold = Number(body.payload.mastery_threshold ?? 80);
      const metadata =
        body.payload.meta && typeof body.payload.meta === "object"
          ? body.payload.meta
          : body.payload.metadata && typeof body.payload.metadata === "object"
            ? body.payload.metadata
            : {};
      if (!courseId || !title || Number.isNaN(sequenceOrder)) {
        return Response.json({ message: "Invalid module payload" }, { status: 400 });
      }
      if (!isUuid(courseId)) {
        return Response.json(
          { message: "Invalid module payload: course_id must be a valid UUID" },
          { status: 400 },
        );
      }
      const metadataCheck = validateModuleMetadata(metadata);
      if (!metadataCheck.ok) {
        return Response.json({ message: metadataCheck.message }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("modules")
        .insert({
          course_id: courseId,
          title,
          sequence_order: sequenceOrder,
          mastery_threshold: masteryThreshold,
          metadata: metadataCheck.normalized,
        })
        .select("id, course_id, title, sequence_order, metadata")
        .single();
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json(data, { status: 201 });
    }

    if (body.type === "lessons") {
      const moduleId = String(body.payload.module_id ?? "").trim();
      const title = String(body.payload.title ?? "").trim();
      const lessonType = String(body.payload.type ?? "").trim();
      const contentUrl = String(body.payload.content_url ?? "").trim();
      const metadata =
        body.payload.meta && typeof body.payload.meta === "object"
          ? body.payload.meta
          : body.payload.metadata && typeof body.payload.metadata === "object"
            ? body.payload.metadata
            : {};
      if (!moduleId || !title || !["VIDEO", "ARTICLE", "INTERACTIVE"].includes(lessonType)) {
        return Response.json({ message: "Invalid lesson payload" }, { status: 400 });
      }
      if (!isUuid(moduleId)) {
        return Response.json(
          { message: "Invalid lesson payload: module_id must be a valid UUID" },
          { status: 400 },
        );
      }
      const { data, error } = await supabase
        .from("lessons")
        .insert({
          module_id: moduleId,
          title,
          type: lessonType,
          content_url: contentUrl || null,
          metadata,
        })
        .select("id, module_id, title, type, metadata")
        .single();
      if (error) return Response.json({ message: error.message }, { status: 500 });

      // Auto-seed quiz PRE/POST for new lesson so student can immediately take tests.
      const preSeed = buildDefaultLessonQuestions(title, "PRE");
      const postSeed = buildDefaultLessonQuestions(title, "POST");
      const { error: quizSeedError } = await supabase.from("quizzes").insert({
        lesson_id: data.id,
        questions: postSeed,
        questions_pre: preSeed,
        questions_post: postSeed,
      });
      if (quizSeedError) {
        return Response.json(
          {
            message: `Lesson created but quiz auto-seed failed: ${quizSeedError.message}`,
            lesson: data,
          },
          { status: 201 },
        );
      }
      return Response.json(data, { status: 201 });
    }

    if (body.type === "quizzes") {
      const lessonId = String(body.payload.lesson_id ?? "").trim();
      const questions = body.payload.questions;
      if (!lessonId || !isJsonArray(questions)) {
        return Response.json(
          { message: "Invalid quiz payload: lesson_id and questions (JSON array) are required" },
          { status: 400 },
        );
      }
      if (!isUuid(lessonId)) {
        return Response.json(
          { message: "Invalid quiz payload: lesson_id must be a valid UUID" },
          { status: 400 },
        );
      }
      const row: Record<string, unknown> = { lesson_id: lessonId, questions };
      if ("questions_pre" in body.payload) {
        const pre = body.payload.questions_pre;
        if (pre != null && !isJsonArray(pre)) {
          return Response.json(
            { message: "Invalid quiz payload: questions_pre must be a JSON array or null" },
            { status: 400 },
          );
        }
        row.questions_pre = pre ?? null;
      }
      if ("questions_post" in body.payload) {
        const post = body.payload.questions_post;
        if (post != null && !isJsonArray(post)) {
          return Response.json(
            { message: "Invalid quiz payload: questions_post must be a JSON array or null" },
            { status: 400 },
          );
        }
        row.questions_post = post ?? null;
      }
      const { data, error } = await supabase
        .from("quizzes")
        .insert(row)
        .select("id, lesson_id, questions, questions_pre, questions_post")
        .single();
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json(data, { status: 201 });
    }

    return Response.json({ message: "Unsupported content type" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) return Response.json({ message: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as {
      type?: ContentType;
      id?: string;
      payload?: Record<string, unknown>;
    };

    if (!body.type || !body.id || !body.payload) {
      return Response.json(
        { message: "type, id and payload are required" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    if (body.type === "courses") {
      const title = String(body.payload.title ?? "").trim();
      const gradeLevel = String(body.payload.grade_level ?? "").trim();
      if (!title || !["SD", "SMP", "SMK"].includes(gradeLevel)) {
        return Response.json({ message: "Invalid course payload" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("courses")
        .update({ title, grade_level: gradeLevel })
        .eq("id", body.id)
        .select("id, title, grade_level")
        .single();
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json(data);
    }

    if (body.type === "modules") {
      const courseId = String(body.payload.course_id ?? "").trim();
      const title = String(body.payload.title ?? "").trim();
      const sequenceOrder = Number(body.payload.sequence_order ?? 1);
      const masteryThreshold = Number(body.payload.mastery_threshold ?? 80);
      const metadata =
        body.payload.meta && typeof body.payload.meta === "object"
          ? body.payload.meta
          : body.payload.metadata && typeof body.payload.metadata === "object"
            ? body.payload.metadata
            : {};
      if (!courseId || !title || Number.isNaN(sequenceOrder)) {
        return Response.json({ message: "Invalid module payload" }, { status: 400 });
      }
      if (!isUuid(courseId)) {
        return Response.json(
          { message: "Invalid module payload: course_id must be a valid UUID" },
          { status: 400 },
        );
      }
      const metadataCheck = validateModuleMetadata(metadata);
      if (!metadataCheck.ok) {
        return Response.json({ message: metadataCheck.message }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("modules")
        .update({
          course_id: courseId,
          title,
          sequence_order: sequenceOrder,
          mastery_threshold: masteryThreshold,
          metadata: metadataCheck.normalized,
        })
        .eq("id", body.id)
        .select("id, course_id, title, sequence_order, metadata")
        .single();
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json(data);
    }

    if (body.type === "lessons") {
      const moduleId = String(body.payload.module_id ?? "").trim();
      const title = String(body.payload.title ?? "").trim();
      const lessonType = String(body.payload.type ?? "").trim();
      const contentUrl = String(body.payload.content_url ?? "").trim();
      const metadata =
        body.payload.meta && typeof body.payload.meta === "object"
          ? body.payload.meta
          : body.payload.metadata && typeof body.payload.metadata === "object"
            ? body.payload.metadata
            : {};
      if (!moduleId || !title || !["VIDEO", "ARTICLE", "INTERACTIVE"].includes(lessonType)) {
        return Response.json({ message: "Invalid lesson payload" }, { status: 400 });
      }
      if (!isUuid(moduleId)) {
        return Response.json(
          { message: "Invalid lesson payload: module_id must be a valid UUID" },
          { status: 400 },
        );
      }
      const { data, error } = await supabase
        .from("lessons")
        .update({
          module_id: moduleId,
          title,
          type: lessonType,
          content_url: contentUrl || null,
          metadata,
        })
        .eq("id", body.id)
        .select("id, module_id, title, type, metadata")
        .single();
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json(data);
    }

    if (body.type === "quizzes") {
      const lessonId = String(body.payload.lesson_id ?? "").trim();
      if (!lessonId) {
        return Response.json({ message: "Invalid quiz payload: lesson_id is required" }, { status: 400 });
      }
      if (!isUuid(lessonId)) {
        return Response.json(
          { message: "Invalid quiz payload: lesson_id must be a valid UUID" },
          { status: 400 },
        );
      }
      const patch: Record<string, unknown> = { lesson_id: lessonId };
      let touched = false;
      if ("questions" in body.payload) {
        const q = body.payload.questions;
        if (!isJsonArray(q)) {
          return Response.json(
            { message: "Invalid quiz payload: questions must be a JSON array" },
            { status: 400 },
          );
        }
        patch.questions = q;
        touched = true;
      }
      if ("questions_pre" in body.payload) {
        const q = body.payload.questions_pre;
        if (q != null && !isJsonArray(q)) {
          return Response.json(
            { message: "Invalid quiz payload: questions_pre must be a JSON array or null" },
            { status: 400 },
          );
        }
        patch.questions_pre = q;
        touched = true;
      }
      if ("questions_post" in body.payload) {
        const q = body.payload.questions_post;
        if (q != null && !isJsonArray(q)) {
          return Response.json(
            { message: "Invalid quiz payload: questions_post must be a JSON array or null" },
            { status: 400 },
          );
        }
        patch.questions_post = q;
        touched = true;
      }
      if (!touched) {
        return Response.json(
          {
            message:
              "Invalid quiz payload: send at least one of questions, questions_pre, questions_post",
          },
          { status: 400 },
        );
      }
      const { data, error } = await supabase
        .from("quizzes")
        .update(patch)
        .eq("id", body.id)
        .select("id, lesson_id, questions, questions_pre, questions_post")
        .single();
      if (error) return Response.json({ message: error.message }, { status: 500 });
      return Response.json(data);
    }

    return Response.json({ message: "Unsupported content type" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) return Response.json({ message: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const typeParam = url.searchParams.get("type");
    const id = url.searchParams.get("id");
    if (!isValidType(typeParam) || !id) {
      return Response.json({ message: "Invalid type or id" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const tableMap: Record<ContentType, string> = {
      courses: "courses",
      modules: "modules",
      lessons: "lessons",
      quizzes: "quizzes",
    };

    const { error } = await supabase.from(tableMap[typeParam]).delete().eq("id", id);
    if (error) return Response.json({ message: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
