/**
 * Lightweight checks for lesson-assessment PRE gating.
 * Run: npm run test:lesson-assessment
 */

import assert from "node:assert/strict";

function hasCompletedPretest(pretestScore) {
  return typeof pretestScore === "number" && Number.isFinite(pretestScore);
}

function shouldBlockPostAssessment(assessmentType, pretestScore) {
  if (assessmentType !== "POST") return false;
  return !hasCompletedPretest(pretestScore);
}

function canOpenPostQuestionBank(pretestScore) {
  return !shouldBlockPostAssessment("POST", pretestScore);
}

function canSubmitPostAssessment(pretestScore) {
  return !shouldBlockPostAssessment("POST", pretestScore);
}

function run() {
  // GET/POST PRE path should never be blocked by pretest guard.
  assert.equal(shouldBlockPostAssessment("PRE", null), false);
  assert.equal(shouldBlockPostAssessment("PRE", 0), false);

  // POST path should be blocked when pretest is not yet recorded.
  assert.equal(shouldBlockPostAssessment("POST", null), true);
  assert.equal(shouldBlockPostAssessment("POST", undefined), true);
  assert.equal(canOpenPostQuestionBank(null), false);
  assert.equal(canSubmitPostAssessment(undefined), false);

  // Pretest recorded as number (including 0) unlocks POST.
  assert.equal(shouldBlockPostAssessment("POST", 0), false);
  assert.equal(shouldBlockPostAssessment("POST", 55), false);
  assert.equal(shouldBlockPostAssessment("POST", 100), false);
  assert.equal(canOpenPostQuestionBank(60), true);
  assert.equal(canSubmitPostAssessment(60), true);

  // Non-number values should still be considered "not done".
  assert.equal(shouldBlockPostAssessment("POST", "90"), true);
  assert.equal(shouldBlockPostAssessment("POST", Number.NaN), true);

  console.log("Lesson-assessment PRE gating checks passed.");
}

run();

