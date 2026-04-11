import { jsonPrivateNoStore } from "@/lib/http/json-private-no-store";
import { getBearerToken, requireStudentSession } from "@/lib/assessment/require-student";
import { fetchStudentModulePhaseContext } from "@/lib/learning/student-module-phase-context";
import {
  computeLessonUnlockMap,
  fetchLessonProgressMap,
  fetchModuleLessons,
  fetchStudentProfileId,
} from "@/lib/learning/lesson-assessment";
import { buildLessonRoomTabs, stripHtmlToPlain, type LessonFormatTab } from "@/lib/learning/lesson-room-payload";

function parseUuid(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
  return t.toLowerCase();
}

function parseTab(raw: string | null): LessonFormatTab | null {
  if (!raw) return null;
  const u = raw.trim().toUpperCase();
  if (u === "ARTICLE" || u === "VIDEO" || u === "INTERACTIVE") return u;
  return null;
}

const META_TEXT_KEYS = ["body", "summary", "text", "article", "content", "description"] as const;

function buildArticleInlinePreview(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const chunks: string[] = [];
  for (const k of META_TEXT_KEYS) {
    const v = metadata[k];
    if (typeof v === "string" && v.trim()) chunks.push(v.trim());
  }
  if (chunks.length === 0) return null;
  const joined = chunks.join("\n\n");
  return stripHtmlToPlain(joined, 12_000);
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonPrivateNoStore({ message: "Missing token" }, { status: 401 });

    const auth = await requireStudentSession(token);
    if (!auth.ok) return jsonPrivateNoStore({ message: auth.message }, { status: auth.status });

    const phaseRes = await fetchStudentModulePhaseContext(auth.supabase, auth.userId, {
      catalogMode: false,
    });
    if (!phaseRes.ok) {
      return jsonPrivateNoStore({ message: phaseRes.message }, { status: phaseRes.status });
    }
    const unlockedModuleIds = phaseRes.context.unlockedModuleIds;

    const url = new URL(req.url);
    const lessonId = parseUuid(url.searchParams.get("lessonId"));
    const moduleIdParam = parseUuid(url.searchParams.get("moduleId"));
    const tabParam = parseTab(url.searchParams.get("tab"));

    if (!lessonId) {
      return jsonPrivateNoStore({ message: "lessonId wajib (UUID)." }, { status: 400 });
    }

    const { data: row, error } = await auth.supabase
      .from("lessons")
      .select("id, module_id, title, type, content_url, metadata")
      .eq("id", lessonId)
      .maybeSingle();

    if (error) return jsonPrivateNoStore({ message: error.message }, { status: 500 });
    if (!row) return jsonPrivateNoStore({ message: "Lesson tidak ditemukan." }, { status: 404 });

    const moduleId = String(row.module_id);
    if (moduleIdParam && moduleIdParam !== moduleId) {
      return jsonPrivateNoStore({ message: "moduleId tidak cocok dengan lesson." }, { status: 400 });
    }

    if (!unlockedModuleIds.has(moduleId)) {
      return jsonPrivateNoStore(
        { message: "Level modul ini masih terkunci untuk levelmu saat ini.", reason: "PHASE_LOCKED" },
        { status: 403 },
      );
    }

    const studentProfileId = await fetchStudentProfileId(auth.supabase, auth.userId);
    const lessons = await fetchModuleLessons(auth.supabase, moduleId);
    const lessonIds = lessons.map((l) => l.id);
    const progressMap = await fetchLessonProgressMap(auth.supabase, studentProfileId, lessonIds);
    const unlockMap = computeLessonUnlockMap(lessons, progressMap);
    if (!unlockMap.get(lessonId)) {
      return jsonPrivateNoStore(
        {
          message: "Lesson terkunci: selesaikan Post-test lesson sebelumnya terlebih dahulu.",
          reason: "LESSON_LOCKED",
        },
        { status: 403 },
      );
    }

    const progress = progressMap.get(lessonId);
    const preDone = typeof progress?.pretest_score === "number";
    if (!preDone) {
      return jsonPrivateNoStore(
        {
          message: "Kerjakan Pre-test terlebih dahulu untuk membuka materi lesson ini.",
          reason: "PRE_REQUIRED",
        },
        { status: 403 },
      );
    }

    const { data: modRow } = await auth.supabase.from("modules").select("title").eq("id", moduleId).maybeSingle();
    const moduleTitle = modRow?.title != null ? String(modRow.title) : "";

    const metadata = (row.metadata as Record<string, unknown> | null) ?? null;
    const lessonType = row.type != null ? String(row.type) : null;
    const contentUrl = row.content_url != null ? String(row.content_url) : null;

    const { tabs, defaultTab } = buildLessonRoomTabs({
      type: lessonType,
      contentUrl,
      metadata,
    });

    const effectiveTab =
      tabParam && tabs.some((t) => t.id === tabParam && t.available) ? tabParam : defaultTab;

    const articlePreview = buildArticleInlinePreview(metadata);

    return jsonPrivateNoStore({
      lessonId: String(row.id),
      moduleId,
      lessonTitle: String(row.title ?? ""),
      moduleTitle,
      primaryType: lessonType,
      articlePreview,
      tabs,
      defaultTab: effectiveTab,
    });
  } catch (e) {
    return jsonPrivateNoStore(
      { message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
