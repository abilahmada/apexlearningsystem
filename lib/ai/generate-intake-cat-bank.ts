import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { randomUUID } from "crypto";
import type { CalibrationDimension } from "@/lib/calibration/engine";
import { CALIBRATION_DIMENSIONS } from "@/lib/calibration/engine";
import { buildFallbackIntakeBank, type IntakeBankItemJson } from "@/lib/intake/fallback-intake-bank";

/** Deskripsi singkat tiap dimensi 6 Prisma untuk prompt AI. */
export const DIM_DESC: Record<CalibrationDimension, string> = {
  kognitif:
    "Kemampuan nalar, numerasi, pola logika, dan pemecahan masalah sederhana (bukan olimpiade). Contoh: urutan angka, silogisme ringkas, perbandingan.",
  bahasa:
    "Pemahaman bacaan singkat, ungkapan sopan, dan tata bahasa Indonesia yang baik. Boleh satu soal dengan nuansa kosakata Inggris sangat dasar untuk jenjang menengah ke atas.",
  digital:
    "Literasi digital (keamanan siber, etika online) dan pola berpikir komputasional dasar (urutan langkah/algoritma). Bukan coding penuh kecuali jenjang atas.",
  karakter:
    "Sikap belajar: ketekunan, menghadapi kegagalan, tanggung jawab, kejujuran dalam konteks sekolah.",
  spiritual:
    "Motivasi belajar, adab, integritas, dan nilai kerja keras. BUKAN ujian teologi—fokus pada niat baik, disiplin, dan kejujuran.",
  leadership:
    "Kerja sama tim, komunikasi positif, pengambilan inisiatif, dan penyelesaian konflik ringan di lingkungan belajar.",
};

/** Panduan kosakata & kedalaman per jenjang. */
const GRADE_GUIDE: Record<string, string> = {
  SD: "Kosakata sangat sederhana, kalimat pendek, konteks konkret (rumah, kelas, teman sebaya). Soal 1 langkah. Hindari abstraksi.",
  SMP:
    "Kosakata menengah, konteks kehidupan remaja dan sekolah, kalimat lebih panjang. Soal 1–2 langkah. Boleh sedikit abstrak.",
  SMA:
    "Kosakata lebih kaya, konteks sosial dan akademik, abstraksi ringan. Soal 2 langkah. Boleh ada nuansa analitis.",
  SMK:
    "Kosakata praktis-vokasional, konteks dunia kerja dan tim. Soal situasional dan praktis. Setara kesulitan SMA.",
};

/** Distribusi difficulty_logit untuk 5 soal per dimensi. */
const DIFFICULTY_SPREAD = [-1.0, -0.4, 0.1, 0.6, 1.2];

function extractJsonArray(raw: string): unknown {
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("[");
  const end = unfenced.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("Respons AI bukan array JSON.");
  return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
}

function isCalibrationDimension(s: string): s is CalibrationDimension {
  return CALIBRATION_DIMENSIONS.includes(s as CalibrationDimension);
}

function normalizeItem(raw: unknown, idx: number, grade: string): IntakeBankItemJson | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const dimension = String(o.dimension ?? "").toLowerCase().trim();
  if (!isCalibrationDimension(dimension)) return null;

  const stem = String(o.stem ?? o.question ?? "").trim();
  if (stem.length < 8) return null;

  const rawOpts: Array<{ id: string; label: string }> = [];
  if (Array.isArray(o.options)) {
    for (const x of o.options) {
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
    opts.push({
      id: letters[i]!,
      label: rawOpts[i]?.label?.length ? rawOpts[i]!.label : `(pilihan ${i + 1})`,
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
    rubric && typeof rubric === "object" && "points" in rubric &&
    typeof (rubric as { points: unknown }).points === "number"
      ? Math.min(5, Math.max(1, Number((rubric as { points: number }).points)))
      : 1;

  const rawDiff = Number(o.difficulty_logit);
  const difficulty_logit = Number.isFinite(rawDiff) ? Math.max(-2, Math.min(2, rawDiff)) : 0;

  const subject = String(o.subject ?? DIM_DESC[dimension].slice(0, 40)).trim() || dimension;

  return {
    id: randomUUID(),
    slug: `ai-${grade.toLowerCase()}-${idx}-${dimension}`,
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
 * Generate 30 soal MCQ (5 per dimensi × 6 aspek) disesuaikan jenjang siswa.
 * Distribusi kesulitan: −1.0, −0.4, 0.1, 0.6, 1.2 per dimensi.
 * Tanpa API key → fallback statis 30 soal.
 */
export async function generateIntakeCatBank(params: { gradeLabel: string }): Promise<IntakeBankItemJson[]> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return buildFallbackIntakeBank();
  }

  const grade = params.gradeLabel.trim().toUpperCase() || "SMP";
  const gradeGuide = GRADE_GUIDE[grade] ?? GRADE_GUIDE.SMP;
  const modelId = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const dimBlock = CALIBRATION_DIMENSIONS.map(
    (d, i) => `${i + 1}. ${d}: ${DIM_DESC[d]}`,
  ).join("\n");

  const diffBlock = DIFFICULTY_SPREAD.map(
    (v, i) => `  soal ke-${i + 1}: difficulty_logit = ${v} (${i === 0 ? "termudah" : i === 4 ? "tersulit" : "menengah"})`,
  ).join("\n");

  const prompt = `Anda adalah asesor pendidikan Indonesia yang membuat bank soal CAT (Computerized Adaptive Testing) untuk penempatan awal siswa.

JENJANG SISWA: ${grade}
PANDUAN KOSAKATA & KEDALAMAN: ${gradeGuide}

6 ASPEK PENILAIAN (6 Prisma APEX):
${dimBlock}

TUGAS: Buat tepat 30 soal pilihan ganda — 5 soal per aspek (6 aspek × 5 = 30).
Setiap kelompok 5 soal dalam satu aspek harus mencakup distribusi kesulitan:
${diffBlock}

ATURAN WAJIB:
- Hanya pilihan ganda 4 opsi (A–D), satu jawaban benar.
- Bahasa Indonesia yang baik, netral, dan sopan.
- Setiap soal harus memiliki konteks yang BERBEDA dalam dimensi yang sama (jangan mengulang topik).
- Tidak meminta data pribadi; tidak ada konten tidak pantas.
- Soal untuk aspek karakter, spiritual, dan leadership harus berbasis situasi/skenario nyata.
- Soal untuk aspek kognitif, bahasa, dan digital harus berbasis kemampuan terukur.

FORMAT SETIAP ELEMEN JSON:
{
  "dimension": "<salah satu: kognitif|bahasa|digital|karakter|spiritual|leadership>",
  "subject": "<topik spesifik soal, maks 50 karakter>",
  "stem": "<pertanyaan lengkap>",
  "options": [{"id":"A","label":"..."},{"id":"B","label":"..."},{"id":"C","label":"..."},{"id":"D","label":"..."}],
  "scoring_rubric": {"correctOptionId":"<A|B|C|D>","points":1},
  "difficulty_logit": <angka sesuai distribusi>
}

Output HANYA array JSON valid, 30 elemen, tanpa markdown atau teks lain.`;

  try {
    const { text } = await generateText({
      model: anthropic(modelId),
      prompt,
      maxOutputTokens: 12000,
    });

    const arr = extractJsonArray(text);
    if (!Array.isArray(arr)) throw new Error("Bukan array");

    const normalized: IntakeBankItemJson[] = [];
    for (let i = 0; i < arr.length; i += 1) {
      const item = normalizeItem(arr[i], i, grade);
      if (item) normalized.push(item);
    }

    // Validasi: harus ada minimal 5 soal per dimensi
    const byDim = new Map<CalibrationDimension, IntakeBankItemJson[]>();
    for (const d of CALIBRATION_DIMENSIONS) byDim.set(d, []);
    for (const item of normalized) {
      byDim.get(item.dimension)?.push(item);
    }

    const missing = CALIBRATION_DIMENSIONS.filter((d) => (byDim.get(d)?.length ?? 0) < 5);
    if (missing.length > 0) {
      console.warn(`[generateIntakeCatBank] Kurang soal untuk: ${missing.join(", ")}. Fallback.`);
      return buildFallbackIntakeBank();
    }

    // Ambil tepat 5 per dimensi, urutkan berdasarkan difficulty_logit
    const out: IntakeBankItemJson[] = [];
    for (const d of CALIBRATION_DIMENSIONS) {
      const items = (byDim.get(d) ?? []).sort((a, b) => a.difficulty_logit - b.difficulty_logit);
      out.push(...items.slice(0, 5));
    }

    return out; // 30 soal total
  } catch (err) {
    console.warn("[generateIntakeCatBank] Error AI, fallback:", err instanceof Error ? err.message : err);
    return buildFallbackIntakeBank();
  }
}
