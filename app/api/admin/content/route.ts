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
        .select("id, title, grade_level, created_at")
        .order("created_at", { ascending: false })
        .limit(safeLimit);
      data = res.data;
      error = res.error;
    } else if (typeParam === "modules") {
      let query = supabase
        .from("modules")
        .select("id, course_id, title, sequence_order, mastery_threshold, metadata, created_at")
        .order("created_at", { ascending: false })
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
        .select("id, module_id, title, type, content_url, metadata, created_at")
        .order("created_at", { ascending: false })
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
        .select("id, lesson_id, questions, created_at")
        .order("created_at", { ascending: false })
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
      const { data, error } = await supabase
        .from("modules")
        .insert({
          course_id: courseId,
          title,
          sequence_order: sequenceOrder,
          mastery_threshold: masteryThreshold,
          metadata,
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
      return Response.json(data, { status: 201 });
    }

    if (body.type === "quizzes") {
      const lessonId = String(body.payload.lesson_id ?? "").trim();
      const questions = body.payload.questions;
      if (!lessonId || !questions || typeof questions !== "object") {
        return Response.json({ message: "Invalid quiz payload" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("quizzes")
        .insert({
          lesson_id: lessonId,
          questions,
        })
        .select("id, lesson_id")
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
      const { data, error } = await supabase
        .from("modules")
        .update({
          course_id: courseId,
          title,
          sequence_order: sequenceOrder,
          mastery_threshold: masteryThreshold,
          metadata,
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
      const questions = body.payload.questions;
      if (!lessonId || !questions || typeof questions !== "object") {
        return Response.json({ message: "Invalid quiz payload" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("quizzes")
        .update({
          lesson_id: lessonId,
          questions,
        })
        .eq("id", body.id)
        .select("id, lesson_id")
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
