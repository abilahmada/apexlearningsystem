/**
 * CAT ringan untuk intake: jejak ability pada skala logit sederhana + pilihan item berikutnya
 * berdasarkan jarak ke difficulty_logit di bank (selaras skema intake_item_attempts).
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

const DEFAULT_MAX_ITEMS = 12;

/** Perbarui estimasi kemampuan setelah satu item (skala ~logit -2.5..2.5). */
export function thetaAfterItemAttempt(
  prevTheta: number,
  scoredPoints: number,
  maxPoints: number,
): number {
  const max = Math.max(0.01, maxPoints);
  const ratio = scoredPoints / max;
  let step: number;
  if (ratio >= 0.85) step = 0.55;
  else if (ratio >= 0.55) step = 0.15;
  else if (ratio >= 0.25) step = -0.25;
  else step = -0.5;
  return Math.max(-2.5, Math.min(2.5, prevTheta + step));
}

/** Runtutkan theta dari riwayat attempt (pakai theta_estimate_after jika ada). */
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
    const max = maxPointsByBankId.get(a.bank_item_id) ?? 1;
    const scored = typeof a.scored_points === "number" ? a.scored_points : 0;
    theta = thetaAfterItemAttempt(theta, scored, max);
  }
  return theta;
}

/**
 * Pilih item bank berikutnya: belum dicoba, dimensi cocok, difficulty terdekat theta saat ini.
 */
export function selectNextCatItemId(
  bank: CatBankItem[],
  attempts: CatAttemptRow[],
  options?: { maxItems?: number; focusDimension?: string | null },
): { nextId: string | null; thetaEstimate: number; attemptCount: number } {
  const maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;
  const dim = options?.focusDimension?.trim() || null;

  const maxById = new Map<string, number>();
  for (const b of bank) {
    maxById.set(b.id, maxPointsFromRubric(b.scoring_rubric));
  }

  const tried = new Set(
    attempts.map((a) => a.bank_item_id).filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  if (tried.size >= maxItems) {
    const theta = foldThetaFromAttempts(attempts, maxById);
    return { nextId: null, thetaEstimate: theta, attemptCount: attempts.length };
  }

  const theta = foldThetaFromAttempts(attempts, maxById);

  const pool = bank.filter((b) => {
    if (tried.has(b.id)) return false;
    if (dim && b.dimension !== dim) return false;
    return true;
  });

  if (pool.length === 0) {
    return { nextId: null, thetaEstimate: theta, attemptCount: attempts.length };
  }

  let best = pool[0]!;
  let bestDist = Infinity;
  for (const row of pool) {
    const d = row.difficulty_logit ?? 0;
    const dist = Math.abs(d - theta);
    if (dist < bestDist) {
      bestDist = dist;
      best = row;
    }
  }

  return { nextId: best.id, thetaEstimate: theta, attemptCount: attempts.length };
}

export function maxPointsFromRubric(rubric: unknown): number {
  if (!rubric || typeof rubric !== "object") return 1;
  const r = rubric as { maxPoints?: number; points?: number };
  if (typeof r.maxPoints === "number" && Number.isFinite(r.maxPoints) && r.maxPoints > 0) return r.maxPoints;
  if (typeof r.points === "number" && Number.isFinite(r.points) && r.points > 0) return r.points;
  return 1;
}
