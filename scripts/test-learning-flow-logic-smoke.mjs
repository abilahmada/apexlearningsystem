import assert from "node:assert/strict";

function placementBaselinePhaseFromProductPhase(phase) {
  switch (phase) {
    case "L1_INTAKE":
      return 1;
    case "L2_CALIBRATION":
    case "L3_RADAR_PROVISIONAL":
      return 2;
    case "L4_PARENT_VALIDATION_PENDING":
    case "PLACEMENT_STABLE":
    case "CONTINUOUS_REVIEW_DUE":
      return 3;
    default:
      return 1;
  }
}

function computeLessonUnlockMap(lessons, progressMap) {
  const unlockMap = new Map();
  for (let i = 0; i < lessons.length; i += 1) {
    const lesson = lessons[i];
    if (i === 0) {
      unlockMap.set(lesson.id, true);
      continue;
    }
    const prev = lessons[i - 1];
    const prevProgress = progressMap.get(prev.id);
    unlockMap.set(lesson.id, Boolean(prevProgress?.posttest_passed));
  }
  return unlockMap;
}

function run() {
  // E1 baseline placement smoke
  assert.equal(placementBaselinePhaseFromProductPhase("L1_INTAKE"), 1);
  assert.equal(placementBaselinePhaseFromProductPhase("L2_CALIBRATION"), 2);
  assert.equal(placementBaselinePhaseFromProductPhase("L3_RADAR_PROVISIONAL"), 2);
  assert.equal(placementBaselinePhaseFromProductPhase("L4_PARENT_VALIDATION_PENDING"), 3);
  assert.equal(placementBaselinePhaseFromProductPhase("PLACEMENT_STABLE"), 3);
  assert.equal(placementBaselinePhaseFromProductPhase("CONTINUOUS_REVIEW_DUE"), 3);

  // E2 progression unlock smoke
  const lessons = [{ id: "L1" }, { id: "L2" }, { id: "L3" }];

  const nonePassed = new Map();
  let unlock = computeLessonUnlockMap(lessons, nonePassed);
  assert.equal(unlock.get("L1"), true);
  assert.equal(unlock.get("L2"), false);
  assert.equal(unlock.get("L3"), false);

  const l1Passed = new Map([["L1", { posttest_passed: true }]]);
  unlock = computeLessonUnlockMap(lessons, l1Passed);
  assert.equal(unlock.get("L1"), true);
  assert.equal(unlock.get("L2"), true);
  assert.equal(unlock.get("L3"), false);

  const l1l2Passed = new Map([
    ["L1", { posttest_passed: true }],
    ["L2", { posttest_passed: true }],
  ]);
  unlock = computeLessonUnlockMap(lessons, l1l2Passed);
  assert.equal(unlock.get("L1"), true);
  assert.equal(unlock.get("L2"), true);
  assert.equal(unlock.get("L3"), true);

  const l1PassedL2Failed = new Map([
    ["L1", { posttest_passed: true }],
    ["L2", { posttest_passed: false }],
  ]);
  unlock = computeLessonUnlockMap(lessons, l1PassedL2Failed);
  assert.equal(unlock.get("L3"), false);

  console.log("Learning flow logic smoke passed.");
}

run();

