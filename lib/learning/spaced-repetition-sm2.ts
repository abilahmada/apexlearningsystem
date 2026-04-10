/**
 * SuperMemo-2 (SM-2) spaced repetition — interval & ease factor update.
 *
 * Quality scale (0–5): 0 = complete blackout, 5 = perfect recall.
 * Bobot bisa kamu sesuaikan lewat konstanta di bawah (EF delta formula, min EF, interval awal).
 */

/** Minimum ease factor (SM-2 classic floor; jangan terlalu rendah agar interval tidak “stuck”). */
const MIN_EASE_FACTOR = 1.3;

/** Default ease factor untuk kartu baru (SuperMemo default). */
export const DEFAULT_EASE_FACTOR = 2.5;

/**
 * Koefisien dalam rumus update EF asli SM-2:
 * EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 * Ubah angka ini jika ingin respons yang lebih/menos agresif terhadap kualitas jawaban.
 */
const EF_DELTA_BASE = 0.1;
const EF_DELTA_LINEAR = 0.08;
const EF_DELTA_QUADRATIC = 0.02;

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

export type NextReviewResult = {
  nextInterval: number;
  newEaseFactor: number;
  nextRepetitionCount: number;
};

function clampQuality(q: number): ReviewQuality {
  const n = Math.round(Number(q));
  return Math.min(5, Math.max(0, n)) as ReviewQuality;
}

function roundIntervalDays(days: number): number {
  return Math.max(1, Math.round(days));
}

/**
 * Hitung jadwal review berikutnya (SM-2).
 *
 * @param quality — 0–5 (ingat sempurna = 5)
 * @param previousInterval — interval sebelum review ini (hari), min 1 untuk konsistensi
 * @param previousEaseFactor — EF sebelum review (default 2.5)
 * @param repetitions — berapa kali **berhasil** berturut-turut sebelum review ini (0 = baru / setelah lapse)
 */
export function calculateNextReview(
  quality: number,
  previousInterval: number,
  previousEaseFactor: number = DEFAULT_EASE_FACTOR,
  repetitions: number,
): NextReviewResult {
  const q = clampQuality(quality);
  const prevInterval = Math.max(1, Math.round(Number(previousInterval)) || 1);
  let ef = Number(previousEaseFactor);
  if (!Number.isFinite(ef) || ef < MIN_EASE_FACTOR) {
    ef = DEFAULT_EASE_FACTOR;
  }

  // ── Langkah 1: update ease factor (selalu, sesuai variasi SM-2 yang umum dipakai di SRS open source)
  // Semakin rendah q, semakin besar penalti → EF turun → interval masa depan lebih pendek.
  const penalty = 5 - q;
  const efDelta = EF_DELTA_BASE - penalty * (EF_DELTA_LINEAR + penalty * EF_DELTA_QUADRATIC);
  let newEaseFactor = ef + efDelta;
  if (newEaseFactor < MIN_EASE_FACTOR) {
    newEaseFactor = MIN_EASE_FACTOR;
  }

  // ── Langkah 2: jika ingat buruk (q < 3), anggap “lapse” — reset rantai sukses, review lagi segera
  if (q < 3) {
    return {
      nextInterval: 1,
      newEaseFactor,
      nextRepetitionCount: 0,
    };
  }

  // ── Langkah 3: sukses — naikkan repetition count
  const nextRepetitionCount = repetitions + 1;

  // ── Langkah 4: interval berikutnya (SM-2 klasik)
  // Rep 1 → 1 hari, Rep 2 → 6 hari, selanjutnya: interval_lama * EF
  let nextInterval: number;
  if (nextRepetitionCount === 1) {
    nextInterval = 1;
  } else if (nextRepetitionCount === 2) {
    nextInterval = 6;
  } else {
    nextInterval = prevInterval * newEaseFactor;
  }

  return {
    nextInterval: roundIntervalDays(nextInterval),
    newEaseFactor: Math.round(newEaseFactor * 1000) / 1000,
    nextRepetitionCount,
  };
}
