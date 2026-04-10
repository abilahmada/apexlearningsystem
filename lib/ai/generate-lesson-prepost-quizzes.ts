import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { buildLessonMaterialContext } from "@/lib/learning/fetch-lesson-material-text";

export type NormalizedMcq = {
  question: string;
  options: string[];
  answer: string;
  hint: string;
};

function extractJsonObject(raw: string): unknown {
  const t = raw.trim();
  const unfenced = t
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Respons AI bukan objek JSON.");
  }
  return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
}

function normalizeList(raw: unknown, exact: number, label: string): NormalizedMcq[] {
  if (!Array.isArray(raw)) {
    throw new Error(`Field "${label}" harus array.`);
  }
  const out: NormalizedMcq[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const question = String(o.question ?? "").trim();
    let options = Array.isArray(o.options) ? o.options.map((x) => String(x).trim()) : [];
    options = options.filter(Boolean).slice(0, 4);
    while (options.length < 4) options.push(`(isi pilihan ${options.length + 1})`);
    let answer = String(o.answer ?? "A")
      .trim()
      .toUpperCase();
    if (!/^[ABCD]$/.test(answer)) {
      answer = "A";
    }
    const hint = String(o.hint ?? "").trim();
    if (question.length < 4) continue;
    out.push({ question, options, answer, hint });
  }
  if (out.length !== exact) {
    throw new Error(`${label}: harus tepat ${exact} soal, dapat ${out.length}.`);
  }
  return out;
}

export type GenerateResult = {
  pre: NormalizedMcq[];
  post: NormalizedMcq[];
  usage: { inputTokens: number; outputTokens: number };
};

const PRE_COUNT = 5;
const POST_COUNT = 10;

/**
 * Generate PRE (5) dan POST (10) MCQ bahasa Indonesia dari konteks materi lesson.
 */
export async function generatePrePostQuizzesFromMaterial(materialText: string): Promise<GenerateResult> {
  const modelId = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

  const prompt = `Anda penulis soal pilihan ganda untuk siswa sekolah Indonesia (SD/SMP/SMK).
Gunakan HANYA informasi dari konteks materi di bawah. Jika materi tipis, tetap buat soal yang masuk akal terkait judul/topik.

KONTEKS MATERI:
---
${materialText}
---

Tugas: buat JSON valid (tanpa markdown, tanpa komentar) dengan struktur persis:
{
  "pre": [ ${PRE_COUNT} objek soal ],
  "post": [ ${POST_COUNT} objek soal ]
}

Setiap objek soal:
{
  "question": "string",
  "options": ["teks pilihan 1","teks pilihan 2","teks pilihan 3","teks pilihan 4"],
  "answer": "A" | "B" | "C" | "D",
  "hint": "string petunjuk singkat"
}

Aturan:
- "answer" adalah huruf A/B/C/D yang menunjuk pilihan benar sesuai urutan options (A=indeks 0).
- Soal PRE: diagnosa pemahaman awal, relatif lebih ringan.
- Soal POST: lebih mendalam, tetap dari materi yang sama.
- Bahasa Indonesia, tanpa LaTeX berat; gunakan notasi sederhana jika perlu.`;

  const { text, usage } = await generateText({
    model: anthropic(modelId),
    temperature: 0.35,
    maxOutputTokens: 12_000,
    prompt,
  });

  const parsed = extractJsonObject(text) as Record<string, unknown>;
  const pre = normalizeList(parsed.pre, PRE_COUNT, "pre");
  const post = normalizeList(parsed.post, POST_COUNT, "post");

  return {
    pre,
    post,
    usage: {
      inputTokens: Number(usage?.inputTokens ?? 0),
      outputTokens: Number(usage?.outputTokens ?? 0),
    },
  };
}

export async function generateQuizzesForLessonRow(input: {
  lessonTitle: string;
  moduleTitle: string;
  contentUrl: string | null;
  lessonMetadata?: Record<string, unknown> | null;
  moduleMetadata?: Record<string, unknown> | null;
}): Promise<GenerateResult> {
  const material = await buildLessonMaterialContext(input);
  return generatePrePostQuizzesFromMaterial(material);
}
