import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

const MAX_CHARS = 24_000;
const PRE_COUNT = 5;
const POST_COUNT = 10;

function parseEnvText(text) {
  const pairs = {};
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    pairs[key] = value;
  }
  return pairs;
}

async function hydrateEnvFromFiles() {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = await fs.readFile(path.resolve(process.cwd(), file), "utf-8");
      const parsed = parseEnvText(raw);
      for (const [k, v] of Object.entries(parsed)) {
        if (!process.env[k] || String(process.env[k]).trim() === "") {
          process.env[k] = String(v);
        }
      }
    } catch {
      // Ignore missing env files.
    }
  }
}

function stripHtml(html) {
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function buildLessonMaterialContext({ lessonTitle, moduleTitle, contentUrl }) {
  const parts = [];
  parts.push(`Judul modul: ${moduleTitle}`);
  parts.push(`Judul lesson: ${lessonTitle}`);
  if (contentUrl?.trim()) {
    const url = contentUrl.trim();
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

function extractJsonObject(raw) {
  const t = String(raw ?? "").trim();
  const unfenced = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Respons AI bukan objek JSON.");
  return JSON.parse(unfenced.slice(start, end + 1));
}

function normalizeList(raw, exact, label) {
  if (!Array.isArray(raw)) throw new Error(`Field "${label}" harus array.`);
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const question = String(item.question ?? "").trim();
    let options = Array.isArray(item.options) ? item.options.map((x) => String(x).trim()) : [];
    options = options.filter(Boolean).slice(0, 4);
    while (options.length < 4) options.push(`(isi pilihan ${options.length + 1})`);
    let answer = String(item.answer ?? "A").trim().toUpperCase();
    if (!/^[ABCD]$/.test(answer)) answer = "A";
    const hint = String(item.hint ?? "").trim();
    if (question.length < 4) continue;
    out.push({ question, options, answer, hint });
  }
  if (out.length !== exact) throw new Error(`${label}: harus tepat ${exact} soal, dapat ${out.length}.`);
  return out;
}

async function generatePrePostFromMaterial(materialText, modelId) {
  const prompt = `Anda penulis soal pilihan ganda untuk siswa sekolah Indonesia (SD/SMP/SMK).
Gunakan HANYA informasi dari konteks materi di bawah.
PENTING: Ini generator berbasis materi lesson (bukan socrates).

KONTEKS MATERI:
---
${materialText}
---

Tugas: buat JSON valid (tanpa markdown, tanpa komentar) dengan struktur persis:
{
  "pre": [${PRE_COUNT} objek soal],
  "post": [${POST_COUNT} objek soal]
}

Setiap objek soal:
{
  "question": "string",
  "options": ["opsi1","opsi2","opsi3","opsi4"],
  "answer": "A" | "B" | "C" | "D",
  "hint": "string petunjuk singkat"
}

Aturan:
- Soal PRE lebih ringan untuk diagnosis awal.
- Soal POST lebih mendalam dari materi yang sama.
- Bahasa Indonesia.
- "answer" harus sesuai urutan options.`;

  const { text } = await generateText({
    model: anthropic(modelId),
    temperature: 0.35,
    maxOutputTokens: 12_000,
    prompt,
  });
  const parsed = extractJsonObject(text);
  return {
    pre: normalizeList(parsed.pre, PRE_COUNT, "pre"),
    post: normalizeList(parsed.post, POST_COUNT, "post"),
  };
}

function hasBank(value) {
  return Array.isArray(value) && value.length > 0;
}

async function run() {
  await hydrateEnvFromFiles();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const modelId = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  const writeMode = /^(1|true|yes)$/i.test(process.env.APEX_AI_FILL_WRITE ?? "");
  const overwrite = /^(1|true|yes)$/i.test(process.env.APEX_AI_FILL_OVERWRITE ?? "");
  const limitRaw = Number(process.env.APEX_AI_FILL_LIMIT ?? "0");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.round(limitRaw) : 0;
  const targetModuleId = String(process.env.APEX_AI_FILL_MODULE_ID ?? "").trim().toLowerCase();

  if (!url || !serviceRoleKey) {
    throw new Error("Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Missing env. Required: ANTHROPIC_API_KEY");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: lessons, error: lessonsErr } = await supabase
    .from("lessons")
    .select("id, title, content_url, module_id, modules!inner(title)")
    .order("id", { ascending: true });
  if (lessonsErr) throw new Error(lessonsErr.message);

  const { data: quizzes, error: quizErr } = await supabase
    .from("quizzes")
    .select("id, lesson_id, questions, questions_pre, questions_post");
  if (quizErr) throw new Error(quizErr.message);
  const quizByLesson = new Map((quizzes ?? []).map((q) => [String(q.lesson_id), q]));

  const targets = [];
  for (const l of lessons ?? []) {
    const lessonModuleId = String(l.module_id ?? "").toLowerCase();
    if (targetModuleId && lessonModuleId !== targetModuleId) continue;
    const lessonId = String(l.id);
    const q = quizByLesson.get(lessonId);
    const hasPre = hasBank(q?.questions_pre);
    const hasPost = hasBank(q?.questions_post);
    if (!overwrite && hasPre && hasPost) continue;
    targets.push({
      lessonId,
      lessonTitle: String(l.title ?? ""),
      moduleTitle: String((Array.isArray(l.modules) ? l.modules[0] : l.modules)?.title ?? ""),
      contentUrl: l.content_url ? String(l.content_url) : null,
      quizId: q?.id ? String(q.id) : null,
      existing: q ?? null,
      missingPre: overwrite ? true : !hasPre,
      missingPost: overwrite ? true : !hasPost,
    });
  }

  const queue = limit > 0 ? targets.slice(0, limit) : targets;
  console.log(`Mode: ${writeMode ? "WRITE" : "DRY-RUN"}`);
  console.log(`Overwrite existing banks: ${overwrite ? "YES" : "NO"}`);
  console.log(`Target module: ${targetModuleId || "ALL"}`);
  console.log(`Total lessons: ${lessons?.length ?? 0}`);
  console.log(`Targets (missing pre/post): ${targets.length}`);
  console.log(`Process queue: ${queue.length}`);

  if (!writeMode) {
    for (const row of queue.slice(0, 20)) {
      console.log(
        `~ ${row.lessonTitle} | missing PRE=${row.missingPre ? "Y" : "N"} POST=${row.missingPost ? "Y" : "N"}`,
      );
    }
    if (queue.length > 20) console.log(`... ${queue.length - 20} more`);
    console.log("Dry-run only. Set APEX_AI_FILL_WRITE=1 to apply.");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const row of queue) {
    try {
      const material = await buildLessonMaterialContext({
        lessonTitle: row.lessonTitle,
        moduleTitle: row.moduleTitle,
        contentUrl: row.contentUrl,
      });
      const { pre, post } = await generatePrePostFromMaterial(material, modelId);
      const patch = {
        lesson_id: row.lessonId,
        questions: hasBank(row.existing?.questions) && !overwrite ? row.existing.questions : post,
        questions_pre: row.missingPre ? pre : row.existing?.questions_pre,
        questions_post: row.missingPost ? post : row.existing?.questions_post,
      };

      if (row.quizId) {
        const { error: upErr } = await supabase.from("quizzes").update(patch).eq("id", row.quizId);
        if (upErr) throw new Error(upErr.message);
      } else {
        const { error: insErr } = await supabase.from("quizzes").insert(patch);
        if (insErr) throw new Error(insErr.message);
      }
      ok += 1;
      console.log(`+ Filled AI PRE/POST: ${row.lessonTitle}`);
    } catch (error) {
      fail += 1;
      console.log(`! Failed ${row.lessonTitle}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`Done. success=${ok}, failed=${fail}`);
}

run().catch((error) => {
  console.error("fill-missing-prepost-ai failed:", error.message);
  process.exit(1);
});

