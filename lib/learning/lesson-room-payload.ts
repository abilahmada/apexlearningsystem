export type LessonFormatTab = "ARTICLE" | "VIDEO" | "INTERACTIVE";

export type LessonRoomTab = {
  id: LessonFormatTab;
  available: boolean;
  mode: "url" | "inline" | "iframe" | "none";
  url: string | null;
};

const META_TEXT_KEYS = ["body", "summary", "text", "article", "content", "description"] as const;

function hasInlineArticleText(metadata: Record<string, unknown> | null): boolean {
  if (!metadata) return false;
  for (const k of META_TEXT_KEYS) {
    const v = metadata[k];
    if (typeof v === "string" && v.trim().length > 20) return true;
  }
  return false;
}

function readFormatsUrl(
  metadata: Record<string, unknown> | null,
  key: "article" | "video" | "interactive",
): string | null {
  if (!metadata) return null;
  const raw = metadata.formats;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const slot = (raw as Record<string, unknown>)[key];
  if (!slot || typeof slot !== "object") return null;
  const url = (slot as Record<string, unknown>).url ?? (slot as Record<string, unknown>).entry;
  if (typeof url !== "string" || !url.trim()) return null;
  return url.trim();
}

export function isProbablyVideoUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("youtube.com") ||
    u.includes("youtu.be") ||
    u.includes("vimeo.com") ||
    u.endsWith(".mp4") ||
    u.includes("/video/")
  );
}

export function buildLessonRoomTabs(input: {
  type: string | null;
  contentUrl: string | null;
  metadata: Record<string, unknown> | null;
}): { tabs: LessonRoomTab[]; defaultTab: LessonFormatTab } {
  const primaryRaw = String(input.type ?? "ARTICLE").toUpperCase();
  const primary: LessonFormatTab = ["ARTICLE", "VIDEO", "INTERACTIVE"].includes(primaryRaw)
    ? (primaryRaw as LessonFormatTab)
    : "ARTICLE";
  const rawUrl = typeof input.contentUrl === "string" && input.contentUrl.trim() ? input.contentUrl.trim() : null;
  const meta = input.metadata;

  const fmtArticle = readFormatsUrl(meta, "article");
  const fmtVideo = readFormatsUrl(meta, "video");
  const fmtInteractive = readFormatsUrl(meta, "interactive");

  let articleUrl: string | null = fmtArticle;
  let videoUrl: string | null = fmtVideo;
  let interactiveUrl: string | null = fmtInteractive;

  if (rawUrl) {
    if (primary === "VIDEO" || isProbablyVideoUrl(rawUrl)) {
      videoUrl = videoUrl ?? rawUrl;
    } else if (primary === "INTERACTIVE") {
      interactiveUrl = interactiveUrl ?? rawUrl;
    } else {
      articleUrl = articleUrl ?? rawUrl;
    }
  }

  const inlineArticle = hasInlineArticleText(meta);

  const articleTab: LessonRoomTab = {
    id: "ARTICLE",
    available: primary === "ARTICLE" || Boolean(articleUrl) || inlineArticle,
    mode: "none",
    url: articleUrl,
  };
  if (articleTab.available) {
    if (articleUrl) articleTab.mode = "url";
    else if (inlineArticle) articleTab.mode = "inline";
    else if (primary === "ARTICLE") articleTab.mode = "inline";
  }

  const videoTab: LessonRoomTab = {
    id: "VIDEO",
    available: primary === "VIDEO" || Boolean(videoUrl),
    mode: "none",
    url: videoUrl,
  };
  if (videoTab.available && videoUrl) {
    videoTab.mode = isProbablyVideoUrl(videoUrl) ? "iframe" : "url";
  }

  const interactiveTab: LessonRoomTab = {
    id: "INTERACTIVE",
    available: primary === "INTERACTIVE" || Boolean(interactiveUrl),
    mode: "none",
    url: interactiveUrl,
  };
  if (interactiveTab.available && interactiveUrl) {
    interactiveTab.mode = "iframe";
  }

  const tabs = [articleTab, videoTab, interactiveTab];
  const firstAvail = tabs.find((t) => t.available)?.id ?? "ARTICLE";
  const defaultTab = tabs.find((t) => t.id === primary && t.available)?.id ?? firstAvail;

  return { tabs, defaultTab };
}

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id && /^[\w-]{6,}$/.test(id) ? id : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{6,}$/.test(v)) return v;
      const m = u.pathname.match(/\/embed\/([\w-]+)/);
      if (m?.[1]) return m[1];
    }
  } catch {
    return null;
  }
  return null;
}

export function stripHtmlToPlain(html: string, maxLen: number): string {
  const plain = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen)}…`;
}
