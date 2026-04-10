const MAX_CHARS = 24_000;
const MAX_METADATA_CHARS = 12_000;

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const METADATA_TEXT_KEYS = [
  "body",
  "summary",
  "text",
  "article",
  "content",
  "description",
  "notes",
  "transcript",
  "outline",
  "learningObjectives",
  "objectives",
] as const;

function extractLessonMetadataText(meta: unknown): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  const o = meta as Record<string, unknown>;
  const chunks: string[] = [];
  for (const k of METADATA_TEXT_KEYS) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) {
      chunks.push(`${String(k)}:\n${v.trim()}`);
    }
  }
  if (typeof o.topic === "string" && o.topic.trim()) {
    chunks.push(`topik: ${o.topic.trim()}`);
  }
  if (typeof o.benchmark === "string" && o.benchmark.trim()) {
    chunks.push(`benchmark: ${o.benchmark.trim()}`);
  }
  let out = chunks.join("\n\n");
  if (out.length > MAX_METADATA_CHARS) {
    out = `${out.slice(0, MAX_METADATA_CHARS)}\n\n[…metadata dipotong…]`;
  }
  return out;
}

function moduleContextLine(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  const bits: string[] = [];
  if (m.grade != null && String(m.grade).trim()) bits.push(`jenjang: ${String(m.grade).trim()}`);
  if (m.subject != null && String(m.subject).trim()) bits.push(`mapel: ${String(m.subject).trim()}`);
  if (m.phase != null && String(m.phase).trim()) bits.push(`level/fase: ${String(m.phase).trim()}`);
  if (m.track != null && String(m.track).trim()) bits.push(`track: ${String(m.track).trim()}`);
  return bits.length ? bits.join(" · ") : null;
}

export type LessonMaterialContextInput = {
  lessonTitle: string;
  moduleTitle: string;
  contentUrl: string | null;
  lessonMetadata?: Record<string, unknown> | null;
  moduleMetadata?: Record<string, unknown> | null;
};

/**
 * Rangkai teks untuk prompt generator quiz AI: judul modul/lesson, ringkasan metadata modul,
 * teks panjang dari metadata lesson (body/summary/…), lalu fetch URL content_url jika ada.
 * Ini khusus pipeline quiz kurikulum — tidak memakai chat Socrates.
 */
export async function buildLessonMaterialContext(input: LessonMaterialContextInput): Promise<string> {
  const parts: string[] = [];
  parts.push(`Judul modul: ${input.moduleTitle}`);
  const modLine = moduleContextLine(input.moduleMetadata ?? null);
  if (modLine) {
    parts.push(`Konteks kurikulum modul: ${modLine}`);
  }
  parts.push(`Judul lesson: ${input.lessonTitle}`);

  const metaText = extractLessonMetadataText(input.lessonMetadata ?? null);
  if (metaText) {
    parts.push("Materi dari metadata lesson (dipakai jika tidak ada URL atau sebagai pelengkap):\n" + metaText);
  }

  if (input.contentUrl?.trim()) {
    const url = input.contentUrl.trim();
    parts.push(`URL materi: ${url}`);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(18_000),
        headers: {
          "user-agent": "APEX-LessonQuizBot/1.0 (curriculum preview)",
          accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.8",
        },
      });
      if (res.ok) {
        const ct = (res.headers.get("content-type") ?? "").toLowerCase();
        const raw = await res.text();
        let body = raw;
        if (ct.includes("html")) body = stripHtml(raw);
        if (body.length > MAX_CHARS) body = `${body.slice(0, MAX_CHARS)}\n\n[…dipotong…]`;
        parts.push("Isi ringkas dari URL:\n" + body);
      } else {
        parts.push(`(Gagal mengambil URL: HTTP ${res.status})`);
      }
    } catch {
      parts.push("(Gagal mengambil URL: timeout atau jaringan.)");
    }
  } else if (!metaText) {
    parts.push(
      "(Tidak ada content_url dan tidak ada teks panjang di metadata lesson — hanya judul + konteks modul dipakai.)",
    );
  }

  return parts.join("\n\n");
}
