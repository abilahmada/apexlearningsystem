/**
 * Integration smoke test (real HTTP) for lesson-assessment PRE gating.
 *
 * Required env vars:
 * - APEX_SMOKE_BASE_URL   (e.g. http://localhost:3000)
 * - APEX_SMOKE_TOKEN      (student bearer token)
 * - APEX_SMOKE_LESSON_ID  (lesson UUID with no pretest submitted for this student)
 *
 * Optional:
 * - APEX_SMOKE_SUBMIT_KEY (default: smoke-pre-required)
 *
 * Run:
 *   npm run test:lesson-assessment:smoke
 */

import assert from "node:assert/strict";

function env(name) {
  return String(process.env[name] ?? "").trim();
}

async function callJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function run() {
  const baseUrl = env("APEX_SMOKE_BASE_URL");
  const token = env("APEX_SMOKE_TOKEN");
  const lessonId = env("APEX_SMOKE_LESSON_ID");
  const submitKey = env("APEX_SMOKE_SUBMIT_KEY") || "smoke-pre-required";

  if (!baseUrl || !token || !lessonId) {
    console.log(
      "[SKIP] test:lesson-assessment:smoke — set APEX_SMOKE_BASE_URL, APEX_SMOKE_TOKEN, APEX_SMOKE_LESSON_ID",
    );
    return;
  }

  const authHeaders = {
    authorization: `Bearer ${token}`,
  };

  // 1) GET POST bank should be blocked before PRE.
  const getUrl = `${baseUrl.replace(/\/+$/, "")}/api/learning/lesson-assessment?lessonId=${encodeURIComponent(
    lessonId,
  )}&assessmentType=POST`;
  const getRes = await callJson(getUrl, { method: "GET", headers: authHeaders });
  assert.equal(getRes.res.status, 403, "GET POST bank should return 403 before pretest");
  assert.equal(getRes.body.reason, "PRE_REQUIRED", "GET should return reason PRE_REQUIRED");

  // 2) POST assessmentType=POST should also be blocked before PRE.
  const postUrl = `${baseUrl.replace(/\/+$/, "")}/api/learning/lesson-assessment`;
  const postRes = await callJson(postUrl, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      lessonId,
      assessmentType: "POST",
      submitKey,
      answers: [],
    }),
  });
  assert.equal(postRes.res.status, 403, "POST POST-test should return 403 before pretest");
  assert.equal(postRes.body.reason, "PRE_REQUIRED", "POST should return reason PRE_REQUIRED");

  console.log("Lesson-assessment integration smoke passed.");
}

run().catch((err) => {
  console.error("[FAIL] test:lesson-assessment:smoke", err?.message ?? err);
  process.exitCode = 1;
});

