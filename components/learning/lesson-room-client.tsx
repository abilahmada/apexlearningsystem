"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, Loader2, MonitorPlay } from "lucide-react";
import { ApexProvider, useApex } from "@/components/apex/apex-context";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { extractYoutubeVideoId, type LessonFormatTab, type LessonRoomTab } from "@/lib/learning/lesson-room-payload";

type RoomPayload = {
  lessonId: string;
  moduleId: string;
  lessonTitle: string;
  moduleTitle: string;
  primaryType: string | null;
  articlePreview: string | null;
  tabs: LessonRoomTab[];
  defaultTab: LessonFormatTab;
  message?: string;
};

function tabLabel(t: (id: string, en: string) => string, id: LessonFormatTab): string {
  if (id === "ARTICLE") return t("Artikel", "Article");
  if (id === "VIDEO") return t("Video", "Video");
  return t("Interaktif", "Interactive");
}

function ArticlePanel({
  t,
  tab,
  articlePreview,
}: {
  t: (id: string, en: string) => string;
  tab: LessonRoomTab;
  articlePreview: string | null;
}) {
  if (tab.mode === "url" && tab.url) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {t("Buka materi artikel di tab baru.", "Open the article in a new tab.")}
        </p>
        <a
          href={tab.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <BookOpen size={18} />
          {t("Buka artikel", "Open article")}
        </a>
      </div>
    );
  }
  if (tab.mode === "inline" && articlePreview) {
    return (
      <article className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4">
        {articlePreview}
      </article>
    );
  }
  return (
    <p className="text-sm text-slate-500">
      {t("Belum ada teks artikel untuk lesson ini.", "No article text is available for this lesson yet.")}
    </p>
  );
}

function VideoPanel({ t, tab }: { t: (id: string, en: string) => string; tab: LessonRoomTab }) {
  const [play, setPlay] = useState(false);
  if (!tab.url) {
    return <p className="text-sm text-slate-500">{t("URL video belum diatur.", "Video URL is not set yet.")}</p>;
  }
  const yt = extractYoutubeVideoId(tab.url);
  if (yt && play) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-black">
        <iframe
          title="YouTube"
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (yt && !play) {
    return (
      <button
        type="button"
        onClick={() => setPlay(true)}
        className="flex w-full max-w-md flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center hover:bg-slate-100"
      >
        <MonitorPlay className="text-slate-600" size={36} />
        <span className="text-sm font-semibold text-slate-800">{t("Putar video", "Play video")}</span>
      </button>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t("Buka video di tab baru.", "Open the video in a new tab.")}</p>
      <a
        href={tab.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
      >
        <MonitorPlay size={18} />
        {t("Buka video", "Open video")}
      </a>
    </div>
  );
}

function InteractivePanel({ t, tab }: { t: (id: string, en: string) => string; tab: LessonRoomTab }) {
  if (!tab.url) {
    return (
      <p className="text-sm text-slate-500">{t("URL aktivitas interaktif belum diatur.", "Interactive activity URL is not set yet.")}</p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        {t("Konten pihak ketiga dimuat dalam bingkai aman.", "Third-party content loads in a sandboxed frame.")}
      </p>
      <a
        href={tab.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs font-semibold text-sky-600 hover:underline"
      >
        {t("Buka di tab baru", "Open in new tab")}
      </a>
      <iframe
        title="interactive"
        src={tab.url}
        className="min-h-[min(70vh,560px)] w-full rounded-xl border border-slate-200 bg-white"
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
      />
    </div>
  );
}

function LessonRoomInner() {
  const { t } = useApex();
  const router = useRouter();
  const params = useParams<{ moduleId: string; lessonId: string }>();
  const searchParams = useSearchParams();
  const moduleId = String(params.moduleId ?? "");
  const lessonId = String(params.lessonId ?? "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [data, setData] = useState<RoomPayload | null>(null);
  const [activeTab, setActiveTab] = useState<LessonFormatTab | null>(null);

  const tabFromQuery = useMemo(() => {
    const raw = searchParams.get("tab");
    if (!raw) return null;
    const u = raw.trim().toUpperCase();
    if (u === "ARTICLE" || u === "VIDEO" || u === "INTERACTIVE") return u as LessonFormatTab;
    return null;
  }, [searchParams]);

  const load = useCallback(async () => {
    if (!lessonId || !moduleId) return;
    setLoading(true);
    setError(null);
    setErrorReason(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: s } = await supabase.auth.getSession();
      const token = s.session?.access_token;
      if (!token) {
        setError(t("Perlu masuk untuk membuka materi.", "Please sign in to open materials."));
        setData(null);
        setErrorReason(null);
        return;
      }
      const q = new URLSearchParams({ lessonId, moduleId });
      if (tabFromQuery) q.set("tab", tabFromQuery);
      const res = await fetch(`/api/learning/lesson-room?${q.toString()}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = (await res.json()) as RoomPayload & { message?: string; reason?: string };
      if (!res.ok) {
        setErrorReason(typeof json.reason === "string" ? json.reason : null);
        if (json.reason === "PRE_REQUIRED") {
          setError(
            t(
              "Materi dibuka setelah Pre-test selesai. Kerjakan Pre-test dari Hub belajar terlebih dahulu.",
              "Materials unlock after you finish the Pre-test. Complete the Pre-test from the Learning Hub first.",
            ),
          );
        } else {
          setError(json.message ?? t("Gagal memuat room.", "Failed to load room."));
        }
        setData(null);
        return;
      }
      setErrorReason(null);
      setData(json);
      const start =
        tabFromQuery && json.tabs.some((x) => x.id === tabFromQuery && x.available) ? tabFromQuery : json.defaultTab;
      setActiveTab(start);
    } catch (e) {
      setErrorReason(null);
      setError(e instanceof Error ? e.message : t("Gagal memuat room.", "Failed to load room."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [lessonId, moduleId, tabFromQuery, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleTabs = data?.tabs.filter((x) => x.available) ?? [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            {t("Hub", "Hub")}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              {data?.moduleTitle || "…"}
            </p>
            <h1 className="truncate text-sm font-bold text-slate-900">{data?.lessonTitle || t("Materi", "Material")}</h1>
          </div>
          <Link href="/" className="text-[11px] font-semibold text-sky-600 hover:underline">
            APEX
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="animate-spin" size={18} />
            {t("Memuat materi…", "Loading materials…")}
          </div>
        ) : error ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{error}</p>
            {errorReason === "PRE_REQUIRED" ? (
              <button
                type="button"
                onClick={() => router.push("/")}
                className="rounded-lg bg-amber-800 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-900"
              >
                {t("Buka Hub untuk Pre-test", "Open Hub for Pre-test")}
              </button>
            ) : null}
          </div>
        ) : !data ? null : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    activeTab === tab.id ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {tabLabel(t, tab.id)}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {!activeTab ? null : activeTab === "ARTICLE" ? (
                <ArticlePanel
                  t={t}
                  tab={data.tabs.find((x) => x.id === "ARTICLE") ?? { id: "ARTICLE", available: false, mode: "none", url: null }}
                  articlePreview={data.articlePreview}
                />
              ) : activeTab === "VIDEO" ? (
                <VideoPanel
                  t={t}
                  tab={data.tabs.find((x) => x.id === "VIDEO") ?? { id: "VIDEO", available: false, mode: "none", url: null }}
                />
              ) : (
                <InteractivePanel
                  t={t}
                  tab={
                    data.tabs.find((x) => x.id === "INTERACTIVE") ?? {
                      id: "INTERACTIVE",
                      available: false,
                      mode: "none",
                      url: null,
                    }
                  }
                />
              )}
            </div>

            <p className="text-center text-[11px] text-slate-500">
              {t("Pre/Post-test tetap dari Hub Belajar.", "Pre/post tests remain in the Learning Hub.")}{" "}
              <button type="button" onClick={() => router.push("/")} className="font-semibold text-sky-600 hover:underline">
                {t("Buka Hub", "Open Hub")}
              </button>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export function LessonRoomClient() {
  return (
    <ApexProvider>
      <LessonRoomInner />
    </ApexProvider>
  );
}
