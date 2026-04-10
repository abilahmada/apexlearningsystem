export type CalibrationDimension =
  | "kognitif"
  | "bahasa"
  | "digital"
  | "karakter"
  | "spiritual"
  | "leadership";

export const CALIBRATION_DIMENSIONS: CalibrationDimension[] = [
  "kognitif",
  "bahasa",
  "digital",
  "karakter",
  "spiritual",
  "leadership",
];

const WEIGHTS: Record<CalibrationDimension, { w1: number; w2: number; w3: number; w4: number }> = {
  kognitif: { w1: 0.35, w2: 0.35, w3: 0.2, w4: 0.1 },
  bahasa: { w1: 0.3, w2: 0.25, w3: 0.3, w4: 0.15 },
  digital: { w1: 0.4, w2: 0.35, w3: 0.15, w4: 0.1 },
  karakter: { w1: 0.2, w2: 0.2, w3: 0.15, w4: 0.45 },
  spiritual: { w1: 0.1, w2: 0.1, w3: 0.1, w4: 0.7 },
  leadership: { w1: 0.25, w2: 0.2, w3: 0.2, w4: 0.35 },
};

export type ParentAdjustmentMap = Partial<Record<CalibrationDimension, number>>;

export type AggregatedSignals = Partial<
  Record<CalibrationDimension, { velocity: number; systematicRate: number }>
>;

export type PlacementDimensionResult = {
  dim: CalibrationDimension;
  intake: number;
  finalTheta: number;
  ci: number;
  delta: number;
  velNorm: number;
  errNorm: number;
  parNorm: number;
};

export type PlacementFlag = {
  type: "MISMATCH" | "PARENT_DISAGREEMENT";
  dimension?: CalibrationDimension;
  severity: "LOW" | "MEDIUM" | "HIGH";
  payload?: Record<string, unknown>;
};

export type PlacementCalculationResult = {
  status: "insufficient_data" | "pending_review" | "ready_to_lock";
  dimensions: PlacementDimensionResult[];
  flags: PlacementFlag[];
  canLock: boolean;
};

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

export function normalizeVelocity(v: number) {
  return clamp(Math.tanh(v - 1.0) * 3.0 + 5.0, 1, 10);
}

export function normalizeError(systematicRate: number) {
  return clamp(5.0 - systematicRate * 4.0, 1, 10);
}

export function normalizeParent(theta: number, adj: number) {
  return clamp(theta * (1 + adj * 0.15), 1, 10);
}

export function calcCI(sessions: number, engagement: number, intakeCI = 2.4) {
  const coverage = Math.min(sessions / 10, 1.0);
  const engMult = 0.7 + (engagement / 10) * 0.3;
  return clamp(intakeCI * (1 - coverage * engMult), 0.2, intakeCI);
}

export function thetaToLevel(theta: number): "DEVELOPING" | "SOLID" | "PROFICIENT" | "ADVANCED" {
  if (theta < 4) return "DEVELOPING";
  if (theta < 6) return "SOLID";
  if (theta < 8) return "PROFICIENT";
  return "ADVANCED";
}

/** Band 0–100 for UX (radar, bars) derived only from level — not raw theta. */
export function levelToDisplayBand(level: string): number {
  switch (level) {
    case "DEVELOPING":
      return 25;
    case "SOLID":
      return 50;
    case "PROFICIENT":
      return 75;
    case "ADVANCED":
      return 100;
    default:
      return 50;
  }
}

export function ciToConfidenceBand(ci: number): "narrow" | "moderate" | "wide" {
  if (ci <= 0.8) return "narrow";
  if (ci <= 1.5) return "moderate";
  return "wide";
}

export function placementTrend(intakeTheta: number, finalTheta: number): "up" | "down" | "stable" {
  const d = finalTheta - intakeTheta;
  if (Math.abs(d) < 0.35) return "stable";
  return d > 0 ? "up" : "down";
}

export function calculateFinalPlacement(params: {
  sessionsCompleted: number;
  intakeCI?: number;
  intakeTheta: Partial<Record<CalibrationDimension, number>>;
  signals: AggregatedSignals;
  engagement: number;
  parentAdjustments?: ParentAdjustmentMap;
  parentAgreedWithProfile?: boolean;
  /** Review berkala: lewati gate data minimum awal kalibrasi. */
  continuousReviewMode?: boolean;
}): PlacementCalculationResult {
  const {
    sessionsCompleted,
    intakeCI = 2.4,
    intakeTheta,
    signals,
    engagement,
    parentAdjustments,
    parentAgreedWithProfile,
    continuousReviewMode,
  } = params;

  if (!continuousReviewMode && sessionsCompleted < 5) {
    return { status: "insufficient_data", dimensions: [], flags: [], canLock: false };
  }

  const useCalibrationSignals = sessionsCompleted >= 3;

  const dimensions: PlacementDimensionResult[] = CALIBRATION_DIMENSIONS.map((dim) => {
    const w = WEIGHTS[dim];
    const intake = intakeTheta[dim] ?? 5;
    const velNorm = useCalibrationSignals
      ? normalizeVelocity(signals[dim]?.velocity ?? 1.0)
      : normalizeVelocity(1.0);
    const errNorm = useCalibrationSignals
      ? normalizeError(signals[dim]?.systematicRate ?? 0)
      : 5.0;
    const parNorm = normalizeParent(intake, parentAdjustments?.[dim] ?? 0);
    const finalTheta = clamp(w.w1 * intake + w.w2 * velNorm + w.w3 * errNorm + w.w4 * parNorm, 1, 10);
    const safeTheta = Math.max(finalTheta, intake - 2.0);
    const ci = calcCI(sessionsCompleted, engagement, intakeCI);
    const delta = Math.abs(safeTheta - intake);
    return { dim, intake, finalTheta: safeTheta, ci, delta, velNorm, errNorm, parNorm };
  });

  const flags: PlacementFlag[] = [];
  for (const d of dimensions) {
    if (d.delta > 1.5) {
      flags.push({
        type: "MISMATCH",
        dimension: d.dim,
        severity: d.delta > 2 ? "HIGH" : "MEDIUM",
        payload: { intake: d.intake, finalTheta: d.finalTheta, delta: d.delta },
      });
    }
  }

  if (parentAgreedWithProfile === false && !continuousReviewMode) {
    flags.push({ type: "PARENT_DISAGREEMENT", severity: "MEDIUM" });
  }

  const pending = flags.some((f) => f.type === "MISMATCH" || f.type === "PARENT_DISAGREEMENT");
  return {
    status: pending ? "pending_review" : "ready_to_lock",
    dimensions,
    flags,
    canLock: !pending && dimensions.every((d) => d.ci < 0.8),
  };
}

