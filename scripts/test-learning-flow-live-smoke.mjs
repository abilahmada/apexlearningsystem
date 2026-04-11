/**
 * Live HTTP smoke test for learning-flow baseline + progression.
 *
 * Required env vars:
 * - APEX_FLOW_SMOKE_BASE_URL
 * - APEX_FLOW_SMOKE_TOKEN
 * - APEX_FLOW_SMOKE_MODULE_ID
 *
 * Optional env vars:
 * - APEX_FLOW_SMOKE_EXPECT_BASELINE_PHASE   (1|2|3)
 * - APEX_FLOW_SMOKE_EXPECT_BASELINE_SOURCE  (student_profile|assessment_session)
 * - APEX_FLOW_SMOKE_EXPECT_UNLOCKED_MODULE_ID
 * - APEX_FLOW_SMOKE_EXPECT_LOCKED_MODULE_ID
 *
 * Also asserts: setiap item modul memuat `lessonsAllPassed`, `studyConfirmedAt`, `completed`;
 * `POST /api/learning/module-complete` tanpa body valid mengembalikan 400.
 *
 * Run:
 *   npm run test:learning-flow:live
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

function env(name) {
  return String(process.env[name] ?? "").trim();
}

function parseEnvText(text) {
  const pairs = {};
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    pairs[key] = value;
  }
  return pairs;
}

async function hydrateEnvFromFiles() {
  const files = [".env.local", ".env", ".env.learning-flow.smoke", ".env.learning-flow.smoke.local"];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.resolve(process.cwd(), file), "utf-8");
      const parsed = parseEnvText(raw);
      for (const [k, v] of Object.entries(parsed)) {
        if (!process.env[k] || String(process.env[k]).trim() === "") process.env[k] = String(v);
      }
    } catch {
      // Ignore missing env files.
    }
  }
}

async function callJson(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Fetch failed for ${url}: ${reason}`);
  }
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeExpectedBaselinePhase(v) {
  const n = toNum(v);
  if (n == null) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 3) return null;
  return rounded;
}

function normalizeBaselineSource(v) {
  const t = String(v ?? "")
    .trim()
    .toLowerCase();
  if (t === "student_profile" || t === "assessment_session") return t;
  return null;
}

async function run() {
  await hydrateEnvFromFiles();
  const baseUrl = env("APEX_FLOW_SMOKE_BASE_URL");
  const token = env("APEX_FLOW_SMOKE_TOKEN");
  let moduleId = env("APEX_FLOW_SMOKE_MODULE_ID");
  const expectedBaselinePhase = normalizeExpectedBaselinePhase(
    env("APEX_FLOW_SMOKE_EXPECT_BASELINE_PHASE"),
  );
  const expectedBaselineSource = normalizeBaselineSource(
    env("APEX_FLOW_SMOKE_EXPECT_BASELINE_SOURCE"),
  );
  const expectUnlockedModuleId = env("APEX_FLOW_SMOKE_EXPECT_UNLOCKED_MODULE_ID");
  const expectLockedModuleId = env("APEX_FLOW_SMOKE_EXPECT_LOCKED_MODULE_ID");

  if (!baseUrl || !token) {
    console.log(
      "[SKIP] test:learning-flow:live — set APEX_FLOW_SMOKE_BASE_URL and APEX_FLOW_SMOKE_TOKEN",
    );
    return;
  }

  const cleanBase = baseUrl.replace(/\/+$/, "");
  const authHeaders = { authorization: `Bearer ${token}` };
  const hasLessons = async (candidateModuleId) => {
    const url = `${cleanBase}/api/learning/lesson-assessment?moduleId=${encodeURIComponent(candidateModuleId)}`;
    const res = await callJson(url, { method: "GET", headers: authHeaders });
    if (res.res.status !== 200) return false;
    const items = Array.isArray(res.body.items) ? res.body.items : [];
    return items.length > 0;
  };

  const assertModuleStudyCompletionFields = (items, label) => {
    const slice = (Array.isArray(items) ? items : []).slice(0, 30);
    for (let idx = 0; idx < slice.length; idx += 1) {
      const m = slice[idx];
      assert.ok(m && typeof m === "object", `${label}[${idx}] should be an object`);
      assert.ok("lessonsAllPassed" in m, `${label}[${idx}] should expose lessonsAllPassed`);
      assert.ok("studyConfirmedAt" in m, `${label}[${idx}] should expose studyConfirmedAt`);
      assert.ok("completed" in m, `${label}[${idx}] should expose completed`);
      assert.equal(typeof m.lessonsAllPassed, "boolean", `${label}[${idx}] lessonsAllPassed should be boolean`);
      assert.equal(typeof m.completed, "boolean", `${label}[${idx}] completed should be boolean`);
      if (m.studyConfirmedAt != null) {
        assert.equal(typeof m.studyConfirmedAt, "string", `${label}[${idx}] studyConfirmedAt should be string or null`);
      }
    }
  };

  // 1) Validate module visibility + baseline phase from modules endpoint.
  const modulesUrl = `${cleanBase}/api/learning/modules?todayOnly=1`;
  const modulesRes = await callJson(modulesUrl, { method: "GET", headers: authHeaders });
  assert.equal(modulesRes.res.status, 200, "GET /learning/modules should return 200");
  const moduleItems = Array.isArray(modulesRes.body.items) ? modulesRes.body.items : [];
  assertModuleStudyCompletionFields(moduleItems, "GET /api/learning/modules?todayOnly=1 items");

  const mcBad = await callJson(`${cleanBase}/api/learning/module-complete`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(mcBad.res.status, 400, "POST /api/learning/module-complete without moduleId should return 400");

  if (expectedBaselinePhase != null) {
    assert.equal(
      Number(modulesRes.body.placementBaselinePhase),
      expectedBaselinePhase,
      "placementBaselinePhase should match expected value",
    );
  }
  if (expectedBaselineSource) {
    assert.equal(
      String(modulesRes.body.placementBaselineSource ?? ""),
      expectedBaselineSource,
      "placementBaselineSource should match expected value",
    );
  }

  if (expectUnlockedModuleId) {
    const found = moduleItems.find((x) => String(x.id) === expectUnlockedModuleId);
    assert.ok(found, "Expected unlocked module should exist in todayOnly response");
    assert.equal(Boolean(found.unlocked), true, "Expected unlocked module should be unlocked");
  }
  if (expectLockedModuleId) {
    // Locked module may not appear in todayOnly if not scheduled today; this check is best-effort.
    const found = moduleItems.find((x) => String(x.id) === expectLockedModuleId);
    if (found) {
      assert.equal(Boolean(found.unlocked), false, "Expected locked module should be locked");
      assert.equal(String(found.lockReason ?? ""), "PHASE_LOCKED", "Expected lock reason PHASE_LOCKED");
    } else {
      console.log("[WARN] expected locked module not present in todayOnly list (possibly not scheduled today).");
    }
  }

  if (!moduleId) {
    const unlockedToday = moduleItems.filter((x) => Boolean(x?.unlocked));
    let selectedFromToday = null;
    for (const item of unlockedToday) {
      const id = String(item.id ?? "");
      if (!id) continue;
      // Pick first unlocked module that actually has lessons.
      // Some legacy modules may exist without lesson rows.
      // eslint-disable-next-line no-await-in-loop
      if (await hasLessons(id)) {
        selectedFromToday = id;
        break;
      }
    }
    if (selectedFromToday) {
      moduleId = selectedFromToday;
      console.log(`[INFO] Auto-picked today unlocked moduleId with lessons: ${moduleId}`);
    } else {
      // Fallback: not all students have unlocked modules scheduled today.
      const fallbackModulesUrl = `${cleanBase}/api/learning/modules`;
      const fallbackModulesRes = await callJson(fallbackModulesUrl, {
        method: "GET",
        headers: authHeaders,
      });
      assert.equal(fallbackModulesRes.res.status, 200, "GET /learning/modules (fallback) should return 200");
      const fallbackItems = Array.isArray(fallbackModulesRes.body.items) ? fallbackModulesRes.body.items : [];
      assertModuleStudyCompletionFields(fallbackItems, "GET /api/learning/modules (fallback) items");
      const fallbackUnlocked = fallbackItems.filter((x) => Boolean(x?.unlocked));
      let selectedFallback = null;
      for (const item of fallbackUnlocked) {
        const id = String(item.id ?? "");
        if (!id) continue;
        // eslint-disable-next-line no-await-in-loop
        if (await hasLessons(id)) {
          selectedFallback = id;
          break;
        }
      }
      if (!selectedFallback) {
        throw new Error(
          "APEX_FLOW_SMOKE_MODULE_ID is empty and no unlocked module with lessons found (todayOnly and fallback).",
        );
      }
      moduleId = selectedFallback;
      console.log(`[INFO] Auto-picked fallback unlocked moduleId with lessons: ${moduleId}`);
    }
  }

  // 2) Validate progression invariants from module lesson-assessment list.
  const lessonListUrl = `${cleanBase}/api/learning/lesson-assessment?moduleId=${encodeURIComponent(moduleId)}`;
  const lessonListRes = await callJson(lessonListUrl, { method: "GET", headers: authHeaders });
  assert.equal(lessonListRes.res.status, 200, "GET /lesson-assessment?moduleId should return 200");
  const lessons = Array.isArray(lessonListRes.body.items) ? lessonListRes.body.items : [];
  assert.ok(lessons.length > 0, "Module should contain at least one lesson");

  // First lesson in unlocked module should be unlocked (sequence gate rule).
  assert.equal(Boolean(lessons[0].unlocked), true, "First lesson should be unlocked");

  // Progression invariant: lesson[i] unlock depends on previous lesson post-test pass.
  for (let i = 1; i < lessons.length; i += 1) {
    const prevPassed = Boolean(lessons[i - 1]?.posttestPassed);
    const unlocked = Boolean(lessons[i]?.unlocked);
    assert.equal(
      unlocked,
      prevPassed,
      `Lesson progression mismatch at index ${i}: unlock should follow previous posttestPassed`,
    );
  }

  console.log("Learning flow live smoke passed.");
}

run().catch((err) => {
  console.error("[FAIL] test:learning-flow:live", err?.message ?? err);
  process.exitCode = 1;
});

