import type { CalibrationDimension } from "@/lib/calibration/engine";
import { CALIBRATION_DIMENSIONS } from "@/lib/calibration/engine";

export type IntakeAttemptRow = {
  dimension: string;
  scored_points: number | null;
  max_points: number | null;
};

/** Level penempatan modul (1–3) dari kinerja CAT per dimensi. */
export type IntakePlacementLevel = 1 | 2 | 3;

/**
 * Ambang rasio per jenjang.
 * SD lebih longgar (siswa masih berkembang), SMA/SMK lebih ketat.
 */
const GRADE_THRESHOLDS: Record<string, { l1Max: number; l2Max: number }> = {
  SD:  { l1Max: 0.38, l2Max: 0.65 },
  SMP: { l1Max: 0.42, l2Max: 0.72 },
  SMA: { l1Max: 0.48, l2Max: 0.78 },
  SMK: { l1Max: 0.48, l2Max: 0.78 },
};

/**
 * Rasio benar/skor → level penempatan (1 fondasi, 2 sesuai jenjang, 3 kuat).
 * Ambang disesuaikan per jenjang sehingga standar SD lebih longgar dari SMA/SMK.
 */
export function ratioToPlacementLevel(ratio: number, gradeLabel?: string): IntakePlacementLevel {
  const r = Math.max(0, Math.min(1, ratio));
  const grade = (gradeLabel ?? "SMP").trim().toUpperCase();
  const { l1Max, l2Max } = GRADE_THRESHOLDS[grade] ?? GRADE_THRESHOLDS.SMP;
  if (r < l1Max) return 1;
  if (r < l2Max) return 2;
  return 3;
}

/** Theta 1–10 untuk kompatibilitas engine kalibrasi + competency_profiles. */
export function placementLevelToTheta(level: IntakePlacementLevel): number {
  switch (level) {
    case 1: return 3.6;
    case 2: return 6.0;
    case 3: return 8.2;
    default: return 5.0;
  }
}

/**
 * Narasi singkat penempatan per dimensi — ditampilkan ke siswa & orang tua.
 * Bilingual (id / en) dikembalikan sebagai objek.
 */
export function getPlacementNarrative(
  dimension: CalibrationDimension,
  level: IntakePlacementLevel,
  gradeLabel?: string,
): { id: string; en: string } {
  const grade = (gradeLabel ?? "SMP").toUpperCase();

  const narratives: Record<
    CalibrationDimension,
    Record<IntakePlacementLevel, { id: string; en: string }>
  > = {
    kognitif: {
      1: {
        id: `Kemampuan nalar dan logika masih membutuhkan penguatan fondasi. Kurikulum akan dimulai dari konsep dasar yang konkret${grade === "SD" ? "" : " sesuai jenjangmu"}.`,
        en: "Reasoning and logic foundations need strengthening. Curriculum will start from concrete basics.",
      },
      2: {
        id: `Kemampuan kognitif sesuai jenjang ${grade}. Kamu siap mengikuti kurikulum standar dengan dukungan latihan rutin.`,
        en: `Cognitive ability is on track for ${grade} level. You are ready for the standard curriculum with regular practice.`,
      },
      3: {
        id: `Kemampuan nalar dan pemecahan masalah sangat baik untuk jenjang ${grade}. Materi pengayaan akan disediakan.`,
        en: `Strong reasoning and problem-solving for ${grade} level. Enrichment materials will be provided.`,
      },
    },
    bahasa: {
      1: {
        id: "Pemahaman bacaan dan ekspresi bahasa perlu diperkuat. Latihan kosakata dan kalimat dasar akan menjadi fokus awal.",
        en: "Reading comprehension and language expression need strengthening. Vocabulary and basic sentence practice will be the initial focus.",
      },
      2: {
        id: "Kemampuan bahasa Indonesia sesuai jenjang. Kamu dapat mengikuti teks dan diskusi kelas standar.",
        en: "Bahasa Indonesia ability is on track. You can follow standard class texts and discussions.",
      },
      3: {
        id: "Kemampuan bahasa sangat baik — pemahaman teks, kosakata, dan ekspresi berada di atas rata-rata jenjang.",
        en: "Strong language ability — text comprehension, vocabulary, and expression are above grade average.",
      },
    },
    digital: {
      1: {
        id: "Literasi digital masih perlu penguatan dasar: penggunaan perangkat, keamanan akun, dan etika online akan diperkenalkan secara bertahap.",
        en: "Digital literacy needs foundational strengthening: device use, account security, and online ethics will be introduced gradually.",
      },
      2: {
        id: "Literasi digital sesuai jenjang. Kamu sudah memahami dasar penggunaan teknologi dan keamanan digital.",
        en: "Digital literacy is on track. You understand basic technology use and digital safety.",
      },
      3: {
        id: "Kemampuan digital dan berpikir komputasional sangat baik. Proyek kreatif berbasis teknologi dapat segera dimulai.",
        en: "Strong digital and computational thinking ability. Creative technology-based projects can begin soon.",
      },
    },
    karakter: {
      1: {
        id: "Karakter belajar sedang berkembang — terutama dalam ketekunan dan tanggung jawab. Program mentoring karakter akan mendampingi proses belajarmu.",
        en: "Learning character is developing — especially in perseverance and responsibility. A character mentoring program will support your learning.",
      },
      2: {
        id: "Karakter belajar cukup baik. Kamu menunjukkan ketekunan dan tanggung jawab yang konsisten untuk jenjangmu.",
        en: "Learning character is solid. You show consistent perseverance and responsibility for your grade level.",
      },
      3: {
        id: "Karakter belajar sangat kuat — ketekunan, kejujuran, dan tanggung jawab berada di level tinggi. Kamu adalah contoh baik bagi teman-teman.",
        en: "Very strong learning character — perseverance, honesty, and responsibility are at a high level. You are a positive example for peers.",
      },
    },
    spiritual: {
      1: {
        id: "Motivasi dan disiplin belajar masih perlu dikuatkan. Program refleksi dan penetapan tujuan belajar akan membantu menumbuhkan semangat dari dalam.",
        en: "Learning motivation and discipline need strengthening. Reflection and goal-setting programs will help build intrinsic motivation.",
      },
      2: {
        id: "Motivasi dan nilai belajar cukup baik. Kamu menunjukkan disiplin dan integritas yang memadai dalam proses belajar.",
        en: "Learning motivation and values are solid. You show adequate discipline and integrity in the learning process.",
      },
      3: {
        id: "Motivasi intrinsik dan nilai belajar sangat tinggi. Semangat, integritas, dan disiplinmu menjadi modal besar untuk berkembang.",
        en: "Very high intrinsic motivation and learning values. Your drive, integrity, and discipline are a strong foundation for growth.",
      },
    },
    leadership: {
      1: {
        id: "Kemampuan kerja sama dan kepemimpinan masih berkembang. Kegiatan kolaboratif dan latihan komunikasi akan menjadi bagian dari programmu.",
        en: "Teamwork and leadership skills are still developing. Collaborative activities and communication practice will be part of your program.",
      },
      2: {
        id: "Kemampuan kepemimpinan dan kerja sama cukup baik. Kamu dapat berpartisipasi aktif dalam kegiatan kelompok.",
        en: "Leadership and teamwork ability is solid. You can actively participate in group activities.",
      },
      3: {
        id: "Kemampuan kepemimpinan sangat baik — inisiatif, komunikasi, dan kolaborasi berada di level tinggi. Kamu cocok untuk peran pemimpin kelompok.",
        en: "Strong leadership ability — initiative, communication, and collaboration are at a high level. You are well-suited for group leadership roles.",
      },
    },
  };

  return narratives[dimension][level];
}

/** Label level singkat untuk tampilan UI. */
export const PLACEMENT_LEVEL_LABELS: Record<
  IntakePlacementLevel,
  { id: string; en: string; color: "amber" | "blue" | "emerald" }
> = {
  1: { id: "Perlu Fondasi", en: "Needs Foundation", color: "amber" },
  2: { id: "Sesuai Jenjang", en: "On Track",         color: "blue" },
  3: { id: "Sangat Kuat",   en: "Strong",             color: "emerald" },
};

export function aggregatePlacementFromAttempts(
  attempts: IntakeAttemptRow[],
  gradeLabel?: string,
): {
  placementLevels: Record<CalibrationDimension, IntakePlacementLevel>;
  intakeTheta: Record<CalibrationDimension, number>;
  ratios: Record<CalibrationDimension, number>;
  narratives: Record<CalibrationDimension, { id: string; en: string }>;
} {
  const byDim = new Map<string, { score: number; max: number }>();
  for (const d of CALIBRATION_DIMENSIONS) byDim.set(d, { score: 0, max: 0 });

  for (const a of attempts) {
    const dim = String(a.dimension ?? "").toLowerCase().trim();
    if (!CALIBRATION_DIMENSIONS.includes(dim as CalibrationDimension)) continue;
    const cur = byDim.get(dim) ?? { score: 0, max: 0 };
    const max = typeof a.max_points === "number" && a.max_points > 0 ? a.max_points : 1;
    const sc  = typeof a.scored_points === "number" && Number.isFinite(a.scored_points) ? a.scored_points : 0;
    cur.score += sc;
    cur.max   += max;
    byDim.set(dim, cur);
  }

  const placementLevels = {} as Record<CalibrationDimension, IntakePlacementLevel>;
  const intakeTheta     = {} as Record<CalibrationDimension, number>;
  const ratios          = {} as Record<CalibrationDimension, number>;
  const narratives      = {} as Record<CalibrationDimension, { id: string; en: string }>;

  for (const d of CALIBRATION_DIMENSIONS) {
    const { score, max } = byDim.get(d) ?? { score: 0, max: 0 };
    // Jika belum ada attempt untuk dimensi ini, default ke 0.5 (level 2 / on-track)
    const ratio      = max > 0 ? score / max : 0.5;
    ratios[d]        = ratio;
    const level      = ratioToPlacementLevel(ratio, gradeLabel);
    placementLevels[d] = level;
    intakeTheta[d]   = placementLevelToTheta(level);
    narratives[d]    = getPlacementNarrative(d, level, gradeLabel);
  }

  return { placementLevels, intakeTheta, ratios, narratives };
}
