import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { randomUUID } from "crypto";
import type { CalibrationDimension } from "@/lib/calibration/engine";
import { CALIBRATION_DIMENSIONS } from "@/lib/calibration/engine";
import { buildFallbackIntakeBank, type IntakeBankItemJson } from "@/lib/intake/fallback-intake-bank";

const DIM_DESC: Record<CalibrationDimension, string> = {
  kognitif: "Nalar, numerasi ringkas, pola & pemecahan masalah sederhana (bukan olimpiade).",
  bahasa: "Pemahaman bacaan singkat & ungkapan sopan dalam Bahasa Indonesia (boleh satu soal nuansa Inggris sangat dasar jika jenjang menengah).",
  digital: "Literasi digital & pola berpikir komputasional dasar (bukan coding penuh kecuali jenjang atas).",
  karakter: "Sikap belajar: ketekunan, menghadapi gagal, tanggung jawab.",
  spiritual: "Motivasi belajar, adab, dan nilai kerja keras (bukan ujian teologi mendalam).",
  leadership: "Kerja sama tim, komunikasi singkat, inisiatif positif.",
};

function extractJsonArray(raw: string): unknown {
  const t = raw.trim();
  const unfenced = t
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("[");
  const end = unfenced.lastIndexOf("]");
  if (start < 0 || end <= start) {
    throw new Error("Respons AI bukan array JSON.");
  }
  return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
}

function isCalibrationDimension(s: string): s is CalibrationDimension {
  return CALIBRATION_DIMENSIONS.includes(s as CalibrationDimension);
}

function normalizeItem(raw: unknown, idx: number): IntakeBankItemJson | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const dimension = String(o.dimension ?? "").toLowerCase().trim();
  if (!isCalibrationDimension(dimension)) return null;
  const stem = String(o.stem ?? o.question ?? "").trim();
  const optionsRaw = o.options;
  const rawOpts: Array<{ id: string; label: string }> = [];
  if (Array.isArray(optionsRaw)) {
    for (const x of optionsRaw) {
      if (x && typeof x === "object" && "label" in x) {
        rawOpts.push({
          id: String((x as { id?: unknown }).id ?? "").toUpperCase().slice(0, 1) || "?",
          label: String((x as { label: unknown }).label).trim(),
        });
      }
    }
  }
  const letters = ["A", "B", "C", "D"] as const;
  const opts: Array<{ id: string; label: string }> = [];
  for (let i = 0; i < 4; i += 1) {
    const letter = letters[i]!;
    const src = rawOpts[i];
    opts.push({
      id: letter,
      label: src?.label?.length ? src.label : `(pilihan ${i + 1})`,
    });
  }
  const rubric = o.scoring_rubric;
  let correctOptionId = "A";
  if (rubric && typeof rubric === "object" && "correctOptionId" in rubric) {
    correctOptionId = String((rubric as { correctOptionId: unknown }).correctOptionId)
      .toUpperCase()
      .slice(0, 1);
  }
  if (!["A", "B", "C", "D"].includes(correctOptionId)) correctOptionId = "A";
  const points =
    rubric && typeof rubric === "object" && "points" in rubric && typeof (rubric as { points: unknown }).points === "number"
      ? Math.min(5, Math.max(1, Number((rubric as { points: number }).points)))
      : 1;
  const difficulty = Number(o.difficulty_logit);
  const difficulty_logit = Number.isFinite(difficulty) ? Math.max(-2, Math.min(2, difficulty)) : 0;
  const subject = String(o.subject ?? DIM_DESC[dimension].slice(0, 40)).trim() || dimension;
  if (stem.length < 8) return null;
  return {
    id: randomUUID(),
    slug: `ai-intake-${idx}-${dimension}`,
    dimension,
    subject,
    item_type: "MULTIPLE_CHOICE",
    stem,
    options: opts.slice(0, 4),
    scoring_rubric: { correctOptionId, points },
    difficulty_logit,
  };
}

/**
 * Generate 12 soal MCQ (2 per dimensi × 6 aspek), disesuaikan jenjang.
 * Tanpa API key → fallback statis.
 */
export async function generateIntakeCatBank(params: { gradeLabel: string }): Promise<IntakeBankItemJson[]> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return buildFallbackIntakeBank();
  }

  const grade = params.gradeLabel.trim().toUpperCase() || "SMP";
  const dimBlock = CALIBRATION_DIMENSIONS.map((d) => `- ${d}: ${DIM_DESC[d]}`).join("\n");

  const modelId = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const prompt = `Anda penilai pendidikan Indonesia. Buat bank soal INTAKE adaptif (CAT) untuk penempatan awal siswa.
Jenjang siswa: ${grade} (sesuaikan kosakata dan kedalaman: SD paling konkret, SMP menengah, SMK/SMA lebih abstrak ringan).

Enam aspek penilaian (wajib 2 soal per aspek = 12 soal total):
${dimBlock}

Aturan:
- Hanya pilihan ganda 4 opsi (A–D), satu jawaban benar.
- Bahasa Indonesia netral dan sopan.
- Tidak meminta data pribadi; tidak konten tidak pantas.
- Setiap objek soal punya: dimension (salah satu key di atas), stem, options [{id:"A",label:"..."},...], scoring_rubric { correctOptionId: "A"|"B"|"C"|"D", points: 1 }, difficulty_logit antara -1.2 dan 1.2 (lebih sulit untuk jenjang lebih tinggi).

Output HANYA array JSON valid (tanpa markdown), contoh bentuk elemen:
{"dimension":"kognitif","stem":"...","options":[{"id":"A","label":"..."},...],"scoring_rubric":{"correctOptionId":"A","points":1},"difficulty_logit":0.1,"subject":"..."}`;

  try {
    const { text } = await generateText({
      model: anthropic(modelId),
      prompt,
      maxOutputTokens: 8192,
    });
    const arr = extractJsonArray(text);
    if (!Array.isArray(arr)) throw new Error("Bukan array");
    const out: IntakeBankItemJson[] = [];
    for (let i = 0; i < arr.length; i += 1) {
      const it = normalizeItem(arr[i], i);
      if (it) out.push(it);
    }
    const byDim = new Map<CalibrationDimension, number>();
    for (const d of CALIBRATION_DIMENSIONS) byDim.set(d, 0);
    for (const it of out) {
      byDim.set(it.dimension, (byDim.get(it.dimension) ?? 0) + 1);
    }
    const missing = CALIBRATION_DIMENSIONS.filter((d) => (byDim.get(d) ?? 0) < 2);
    if (missing.length > 0 || out.length < 12) {
      return buildFallbackIntakeBank();
    }
    return out.slice(0, 12);
  } catch {
    return buildFallbackIntakeBank();
  }
}
