const MAX_CHARS = 24_000;

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ambil teks materi untuk prompt AI: judul + URL konten (dibatasi panjang).
 */
export async function buildLessonMaterialContext(input: {
  lessonTitle: string;
  moduleTitle: string;
  contentUrl: string | null;
}): Promise<string> {
  const parts: string[] = [];
  parts.push(`Judul modul: ${input.moduleTitle}`);
  parts.push(`Judul lesson: ${input.lessonTitle}`);
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
  } else {
    parts.push("(Tidak ada content_url — hanya judul dipakai sebagai konteks.)");
  }
  return parts.join("\n\n");
}
