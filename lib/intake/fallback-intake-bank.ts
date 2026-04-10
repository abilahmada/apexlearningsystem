import type { CalibrationDimension } from "@/lib/calibration/engine";
import { CALIBRATION_DIMENSIONS } from "@/lib/calibration/engine";

/**
 * Item bank intake untuk dev / tanpa ANTHROPIC_API_KEY.
 * Satu soal per dimensi (12 slot diisi dengan 2 putaran pola yang sama) agar CAT punya cukup pool.
 */
export type IntakeBankItemJson = {
  id: string;
  slug: string;
  dimension: CalibrationDimension;
  subject: string;
  item_type: "MULTIPLE_CHOICE";
  stem: string;
  options: Array<{ id: string; label: string }>;
  scoring_rubric: { correctOptionId: string; points: number };
  difficulty_logit: number;
};

const STEMS: Record<
  CalibrationDimension,
  { stem: string; subject: string; correct: string; wrong: string[] }
> = {
  kognitif: {
    subject: "Logika",
    stem: "Jika semua A adalah B, dan X adalah A, maka X adalah…",
    correct: "B",
    wrong: ["Tidak bisa disimpulkan", "Bukan A", "Bukan B"],
  },
  bahasa: {
    subject: "Bahasa",
    stem: "Pilih kalimat yang paling sopan untuk meminta bantuan guru:",
    correct: "Permisi, boleh saya bertanya?",
    wrong: ["Cepat jawab!", "Saya tidak peduli.", "Guru salah."],
  },
  digital: {
    subject: "Literasi digital",
    stem: "Yang termasuk contoh sandi yang lebih kuat adalah:",
    correct: "Kombinasi huruf, angka, dan simbol panjang",
    wrong: ["nama hewan peliharaan saja", "tanggal lahir saja", "123456"],
  },
  karakter: {
    subject: "Karakter belajar",
    stem: "Saat gagal mengerjakan soal, sikap terbaik adalah:",
    correct: "Mencoba lagi dan meminta petunjuk jika perlu",
    wrong: ["Menyerah permanen", "Menyalahkan orang lain", "Menolak belajar topik itu"],
  },
  spiritual: {
    subject: "Motivasi & adab",
    stem: "Belajar dengan niat baik dan disiplin termasuk bentuk:",
    correct: "Menghargai ilmu dan waktu",
    wrong: ["Menghindari tanggung jawab", "Menunda tanpa batas", "Menipu hasil"],
  },
  leadership: {
    subject: "Kolaborasi",
    stem: "Dalam kelompok, peran yang membantu tim mencapai tujuan adalah:",
    correct: "Mendengar ide teman dan menyepakati langkah",
    wrong: ["Memaksakan pendapat sendiri", "Tidak ikut berkontribusi", "Menghindari diskusi"],
  },
};

function mcqForDim(dim: CalibrationDimension, suffix: number): IntakeBankItemJson {
  const s = STEMS[dim];
  const opts = [
    { id: "A", label: s.correct },
    { id: "B", label: s.wrong[0]! },
    { id: "C", label: s.wrong[1]! },
    { id: "D", label: s.wrong[2]! },
  ];
  return {
    id: `fb-${dim}-${suffix}`,
    slug: `fallback-${dim}-${suffix}`,
    dimension: dim,
    subject: s.subject,
    item_type: "MULTIPLE_CHOICE",
    stem: s.stem,
    options: opts,
    scoring_rubric: { correctOptionId: "A", points: 1 },
    difficulty_logit: suffix === 1 ? -0.3 : 0.3,
  };
}

export function buildFallbackIntakeBank(): IntakeBankItemJson[] {
  const out: IntakeBankItemJson[] = [];
  for (const dim of CALIBRATION_DIMENSIONS) {
    out.push(mcqForDim(dim, 1));
    out.push(mcqForDim(dim, 2));
  }
  return out;
}
