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
 * Rasio benar/skor → level: 1 fondasi, 2 sesuai jenjang, 3 kuat.
 * Ambang disesuaikan agar tidak terlalu keras untuk intake singkat.
 */
export function ratioToPlacementLevel(ratio: number): IntakePlacementLevel {
  const r = Math.max(0, Math.min(1, ratio));
  if (r < 0.42) return 1;
  if (r < 0.72) return 2;
  return 3;
}

/** Theta 1–10 untuk kompatibilitas engine kalibrasi + competency_profiles. */
export function placementLevelToTheta(level: IntakePlacementLevel): number {
  switch (level) {
    case 1:
      return 3.6;
    case 2:
      return 6;
    case 3:
      return 8.2;
    default:
      return 5;
  }
}

export function aggregatePlacementFromAttempts(
  attempts: IntakeAttemptRow[],
): {
  placementLevels: Record<CalibrationDimension, IntakePlacementLevel>;
  intakeTheta: Record<CalibrationDimension, number>;
  ratios: Record<CalibrationDimension, number>;
} {
  const byDim = new Map<string, { score: number; max: number }>();
  for (const d of CALIBRATION_DIMENSIONS) {
    byDim.set(d, { score: 0, max: 0 });
  }
  for (const a of attempts) {
    const dim = String(a.dimension ?? "").toLowerCase().trim();
    if (!CALIBRATION_DIMENSIONS.includes(dim as CalibrationDimension)) continue;
    const cur = byDim.get(dim) ?? { score: 0, max: 0 };
    const max = typeof a.max_points === "number" && a.max_points > 0 ? a.max_points : 1;
    const sc = typeof a.scored_points === "number" && Number.isFinite(a.scored_points) ? a.scored_points : 0;
    cur.score += sc;
    cur.max += max;
    byDim.set(dim, cur);
  }

  const placementLevels = {} as Record<CalibrationDimension, IntakePlacementLevel>;
  const intakeTheta = {} as Record<CalibrationDimension, number>;
  const ratios = {} as Record<CalibrationDimension, number>;

  for (const d of CALIBRATION_DIMENSIONS) {
    const { score, max } = byDim.get(d) ?? { score: 0, max: 0 };
    const ratio = max > 0 ? score / max : 0.5;
    ratios[d] = ratio;
    const level = ratioToPlacementLevel(ratio);
    placementLevels[d] = level;
    intakeTheta[d] = placementLevelToTheta(level);
  }

  return { placementLevels, intakeTheta, ratios };
}
