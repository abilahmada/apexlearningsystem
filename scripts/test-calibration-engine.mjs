/**
 * Lightweight calibration engine checks (no external test runner required).
 * Mirrors lib/calibration/engine.ts — keep in sync when formulas change.
 * Run: npm run test:calibration
 */

import assert from "node:assert/strict";

const CALIBRATION_DIMENSIONS = [
  "kognitif",
  "bahasa",
  "digital",
  "karakter",
  "spiritual",
  "leadership",
];

const WEIGHTS = {
  kognitif: { w1: 0.35, w2: 0.35, w3: 0.2, w4: 0.1 },
  bahasa: { w1: 0.3, w2: 0.25, w3: 0.3, w4: 0.15 },
  digital: { w1: 0.4, w2: 0.35, w3: 0.15, w4: 0.1 },
  karakter: { w1: 0.2, w2: 0.2, w3: 0.15, w4: 0.45 },
  spiritual: { w1: 0.1, w2: 0.1, w3: 0.1, w4: 0.7 },
  leadership: { w1: 0.25, w2: 0.2, w3: 0.2, w4: 0.35 },
};

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function normalizeVelocity(v) {
  return clamp(Math.tanh(v - 1.0) * 3.0 + 5.0, 1, 10);
}

function normalizeError(systematicRate) {
  return clamp(5.0 - systematicRate * 4.0, 1, 10);
}

function normalizeParent(theta, adj) {
  return clamp(theta * (1 + adj * 0.15), 1, 10);
}

function calcCI(sessions, engagement, intakeCI = 2.4) {
  const coverage = Math.min(sessions / 10, 1.0);
  const engMult = 0.7 + (engagement / 10) * 0.3;
  return clamp(intakeCI * (1 - coverage * engMult), 0.2, intakeCI);
}

function levelToDisplayBand(level) {
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

function ciToConfidenceBand(ci) {
  if (ci <= 0.8) return "narrow";
  if (ci <= 1.5) return "moderate";
  return "wide";
}

function placementTrend(intakeTheta, finalTheta) {
  const d = finalTheta - intakeTheta;
  if (Math.abs(d) < 0.35) return "stable";
  return d > 0 ? "up" : "down";
}

function calculateFinalPlacement({
  sessionsCompleted,
  intakeCI = 2.4,
  intakeTheta,
  signals,
  engagement,
  parentAdjustments,
  parentAgreedWithProfile,
}) {
  if (sessionsCompleted < 5) {
    return { status: "insufficient_data", dimensions: [], flags: [], canLock: false };
  }

  const useCalibrationSignals = sessionsCompleted >= 3;

  const dimensions = CALIBRATION_DIMENSIONS.map((dim) => {
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

  const flags = [];
  for (const d of dimensions) {
    if (d.delta > 1.5) {
      flags.push({
        type: "MISMATCH",
        dimension: d.dim,
        severity: d.delta > 2 ? "HIGH" : "MEDIUM",
      });
    }
  }

  if (parentAgreedWithProfile === false) {
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

function run() {
  // normalizeVelocity checks
  assert.ok(Math.abs(normalizeVelocity(1.0) - 5.0) < 0.2, "velocity 1.0 should be around 5.0");
  assert.ok(normalizeVelocity(0.01) >= 1, "velocity should never go below 1");
  assert.ok(normalizeVelocity(10) <= 10, "velocity should never exceed 10");

  // calcCI checks
  assert.ok(calcCI(10, 8) < 0.8, "10 sessions + engagement 8 should tighten CI");
  assert.ok(calcCI(5, 2) >= 0.8, "5 sessions + low engagement should not over-tighten CI");

  // Public UX helpers (privacy / spec alignment)
  assert.equal(levelToDisplayBand("DEVELOPING"), 25);
  assert.equal(levelToDisplayBand("ADVANCED"), 100);
  assert.equal(ciToConfidenceBand(0.5), "narrow");
  assert.equal(ciToConfidenceBand(1.2), "moderate");
  assert.equal(ciToConfidenceBand(2.0), "wide");
  assert.equal(placementTrend(5, 5.1), "stable");
  assert.equal(placementTrend(5, 6), "up");
  assert.equal(placementTrend(6, 5), "down");

  // insufficient data
  const insufficient = calculateFinalPlacement({
    sessionsCompleted: 3,
    intakeTheta: {},
    signals: {},
    engagement: 5,
  });
  assert.equal(insufficient.status, "insufficient_data", "sessions < 5 must return insufficient_data");

  // parent adjustment influence
  const noAdj = calculateFinalPlacement({
    sessionsCompleted: 8,
    intakeTheta: { spiritual: 5 },
    signals: { spiritual: { velocity: 1, systematicRate: 0 } },
    engagement: 8,
    parentAdjustments: { spiritual: 0 },
  });
  const plusAdj = calculateFinalPlacement({
    sessionsCompleted: 8,
    intakeTheta: { spiritual: 5 },
    signals: { spiritual: { velocity: 1, systematicRate: 0 } },
    engagement: 8,
    parentAdjustments: { spiritual: 2 },
  });
  const noAdjSpiritual = noAdj.dimensions.find((d) => d.dim === "spiritual").finalTheta;
  const plusAdjSpiritual = plusAdj.dimensions.find((d) => d.dim === "spiritual").finalTheta;
  assert.ok(plusAdjSpiritual > noAdjSpiritual, "positive parent adjustment should increase spiritual theta");

  // safety floor check
  const severeDrop = calculateFinalPlacement({
    sessionsCompleted: 9,
    intakeTheta: { kognitif: 7.5 },
    signals: { kognitif: { velocity: 0.1, systematicRate: 1 } },
    engagement: 8,
    parentAdjustments: { kognitif: -2 },
  });
  const kognitif = severeDrop.dimensions.find((d) => d.dim === "kognitif");
  assert.ok(
    kognitif.finalTheta >= kognitif.intake - 2.0,
    "theta must not drop more than 2 points from intake",
  );

  // parent disagreement -> pending_review
  const disagree = calculateFinalPlacement({
    sessionsCompleted: 8,
    intakeTheta: {},
    signals: {},
    engagement: 8,
    parentAgreedWithProfile: false,
  });
  assert.equal(disagree.status, "pending_review");
  assert.ok(disagree.flags.some((f) => f.type === "PARENT_DISAGREEMENT"));

  console.log("Calibration checks passed.");
}

run();
