/**
 * Lightweight checks for SM-2 scheduler.
 * Run: npm run test:srs
 */

import assert from "node:assert/strict";

const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;
const EF_DELTA_BASE = 0.1;
const EF_DELTA_LINEAR = 0.08;
const EF_DELTA_QUADRATIC = 0.02;

function clampQuality(q) {
  const n = Math.round(Number(q));
  return Math.min(5, Math.max(0, n));
}

function roundIntervalDays(days) {
  return Math.max(1, Math.round(days));
}

function calculateNextReview(quality, previousInterval, previousEaseFactor = DEFAULT_EASE_FACTOR, repetitions) {
  const q = clampQuality(quality);
  const prevInterval = Math.max(1, Math.round(Number(previousInterval)) || 1);
  let ef = Number(previousEaseFactor);
  if (!Number.isFinite(ef) || ef < MIN_EASE_FACTOR) {
    ef = DEFAULT_EASE_FACTOR;
  }

  const penalty = 5 - q;
  const efDelta = EF_DELTA_BASE - penalty * (EF_DELTA_LINEAR + penalty * EF_DELTA_QUADRATIC);
  let newEaseFactor = ef + efDelta;
  if (newEaseFactor < MIN_EASE_FACTOR) newEaseFactor = MIN_EASE_FACTOR;

  if (q < 3) {
    return {
      nextInterval: 1,
      newEaseFactor: Math.round(newEaseFactor * 1000) / 1000,
      nextRepetitionCount: 0,
    };
  }

  const nextRepetitionCount = repetitions + 1;
  let nextInterval;
  if (nextRepetitionCount === 1) nextInterval = 1;
  else if (nextRepetitionCount === 2) nextInterval = 6;
  else nextInterval = prevInterval * newEaseFactor;

  return {
    nextInterval: roundIntervalDays(nextInterval),
    newEaseFactor: Math.round(newEaseFactor * 1000) / 1000,
    nextRepetitionCount,
  };
}

function run() {
  // Clamp / normalize inputs
  assert.equal(calculateNextReview(7, 0, 2.5, 0).nextRepetitionCount, 1);
  assert.equal(calculateNextReview(-1, 0, 2.5, 3).nextRepetitionCount, 0);

  // Lapse branch (q < 3): interval reset + repetition reset
  const lapse = calculateNextReview(2, 10, 2.5, 4);
  assert.equal(lapse.nextInterval, 1);
  assert.equal(lapse.nextRepetitionCount, 0);

  // Success progression (SM-2 classic)
  const rep1 = calculateNextReview(4, 1, 2.5, 0);
  assert.equal(rep1.nextInterval, 1);
  assert.equal(rep1.nextRepetitionCount, 1);

  const rep2 = calculateNextReview(4, 1, 2.5, 1);
  assert.equal(rep2.nextInterval, 6);
  assert.equal(rep2.nextRepetitionCount, 2);

  const rep3 = calculateNextReview(4, 6, 2.5, 2);
  assert.ok(rep3.nextInterval >= 6, "third successful review should keep growing interval");
  assert.equal(rep3.nextRepetitionCount, 3);

  // Ease factor floor
  const lowEf = calculateNextReview(0, 8, 1.1, 5);
  assert.ok(lowEf.newEaseFactor >= 1.3, "EF should never fall below 1.3");

  // Quality ordering: better quality should produce >= EF than poorer quality
  const bad = calculateNextReview(3, 6, 2.5, 2);
  const good = calculateNextReview(5, 6, 2.5, 2);
  assert.ok(good.newEaseFactor >= bad.newEaseFactor);

  console.log("SM-2 checks passed.");
}

run();
