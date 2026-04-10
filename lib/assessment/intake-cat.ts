/**
 * CAT ringan untuk intake: jejak ability pada skala logit sederhana + pilihan item berikutnya.
 * Strategi: pastikan minimal `minPerDimension` item per dimensi sebelum memilih berdasarkan
 * difficulty terdekat dengan theta saat ini — menjamin cakupan semua 6 Prisma.
 */

export type CatBankRow = {
  id: string;
  dimension: string;
  difficulty_logit: number | null;
};

export type CatBankItem = CatBankRow & { scoring_rubric?: unknown };

export type CatAttemptRow = {
  bank_item_id: string | null;
  scored_points: number | null;
  theta_estimate_after: number | null;
};

const DEFAULT_MAX_ITEMS = 20;
const DEFAULT_MIN_PER_DIMENSION = 2;

/** Perbarui estimasi kemampuan setelah satu item (skala logit ~−2.5 … 2.5). */
export function thetaAfterItemAttempt(
  prevTheta: number,
  scoredPoints: number,
  maxPoints: number,
): number {
  const max  = Math.max(0.01, maxPoints);
  const ratio = scoredPoints / max;
  let step: number;
  if      (ratio >= 0.85) step =  0.55;
  else if (ratio >= 0.55) step =  0.15;
  else if (ratio >= 0.25) step = -0.25;
  else                    step = -0.50;
  return Math.max(-2.5, Math.min(2.5, prevTheta + step));
}

/** Runtutkan theta dari riwayat attempt (pakai theta_estimate_after jika tersedia). */
export function foldThetaFromAttempts(
  attempts: CatAttemptRow[],
  maxPointsByBankId: Map<string, number>,
): number {
  let theta = 0;
  for (const a of attempts) {
    if (typeof a.theta_estimate_after === "number" && Number.isFinite(a.theta_estimate_after)) {
      theta = Math.max(-2.5, Math.min(2.5, a.theta_estimate_after));
      continue;
    }
    if (!a.bank_item_id) continue;
    const max    = maxPointsByBankId.get(a.bank_item_id) ?? 1;
    const scored = typeof a.scored_points === "number" ? a.scored_points : 0;
    theta        = thetaAfterItemAttempt(theta, scored, max);
  }
  return theta;
}

/**
 * Pilih item berikutnya dengan strategi dua fase:
 * 1. Fase keseimbangan — jika ada dimensi yang belum mencapai `minPerDimension`,
 *    pilih item terbaik dari dimensi yang paling kekurangan (difficulty terdekat theta).
 * 2. Fase bebas — pilih item dengan difficulty paling dekat theta dari seluruh pool.
 *
 * Mengembalikan null jika bank habis atau sudah mencapai maxItems.
 */
export function selectNextCatItemId(
  bank: CatBankItem[],
  attempts: CatAttemptRow[],
  options?: {
    maxItems?: number;
    focusDimension?: string | null;
    minPerDimension?: number;
  },
): { nextId: string | null; thetaEstimate: number; attemptCount: number } {
  const maxItems    = options?.maxItems        ?? DEFAULT_MAX_ITEMS;
  const minPerDim   = options?.minPerDimension ?? DEFAULT_MIN_PER_DIMENSION;
  const focusDim    = options?.focusDimension?.trim() || null;

  const maxById = new Map<string, number>();
  for (const b of bank) maxById.set(b.id, maxPointsFromRubric(b.scoring_rubric));

  const tried = new Set(
    attempts
      .map((a) => a.bank_item_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  if (tried.size >= maxItems) {
    const theta = foldThetaFromAttempts(attempts, maxById);
    return { nextId: null, thetaEstimate: theta, attemptCount: attempts.length };
  }

  const theta = foldThetaFromAttempts(attempts, maxById);

  // Items yang belum dicoba (dan sesuai focusDimension jika ada)
  const pool = bank.filter((b) => {
    if (tried.has(b.id)) return false;
    if (focusDim && b.dimension !== focusDim) return false;
    return true;
  });

  if (pool.length === 0) {
    return { nextId: null, thetaEstimate: theta, attemptCount: attempts.length };
  }

  // ── Fase 1: dimensi yang belum mencapai minimum ──────────────────────────────
  if (!focusDim) {
    // Hitung jumlah attempt per dimensi
    const dimCounts = new Map<string, number>();
    for (const a of attempts) {
      if (!a.bank_item_id) continue;
      const item = bank.find((b) => b.id === a.bank_item_id);
      if (!item) continue;
      dimCounts.set(item.dimension, (dimCounts.get(item.dimension) ?? 0) + 1);
    }

    // Dimensi unik di bank
    const bankDims = [...new Set(bank.map((b) => b.dimension))];

    // Cari dimensi yang masih di bawah minimum, urutkan dari yang paling kekurangan
    const underCovered = bankDims
      .filter((d) => (dimCounts.get(d) ?? 0) < minPerDim)
      .sort((a, b) => (dimCounts.get(a) ?? 0) - (dimCounts.get(b) ?? 0));

    if (underCovered.length > 0) {
      const targetDim = underCovered[0]!;
      const dimPool   = pool.filter((b) => b.dimension === targetDim);
      if (dimPool.length > 0) {
        const best = closestToDifficulty(dimPool, theta);
        return { nextId: best.id, thetaEstimate: theta, attemptCount: attempts.length };
      }
    }
  }

  // ── Fase 2: pilih item terbaik dari seluruh pool ──────────────────────────────
  const best = closestToDifficulty(pool, theta);
  return { nextId: best.id, thetaEstimate: theta, attemptCount: attempts.length };
}

function closestToDifficulty(pool: CatBankItem[], theta: number): CatBankItem {
  let best = pool[0]!;
  let bestDist = Infinity;
  for (const row of pool) {
    const dist = Math.abs((row.difficulty_logit ?? 0) - theta);
    if (dist < bestDist) {
      bestDist = dist;
      best     = row;
    }
  }
  return best;
}

export function maxPointsFromRubric(rubric: unknown): number {
  if (!rubric || typeof rubric !== "object") return 1;
  const r = rubric as { maxPoints?: number; points?: number };
  if (typeof r.maxPoints === "number" && Number.isFinite(r.maxPoints) && r.maxPoints > 0) return r.maxPoints;
  if (typeof r.points   === "number" && Number.isFinite(r.points)    && r.points    > 0) return r.points;
  return 1;
}
