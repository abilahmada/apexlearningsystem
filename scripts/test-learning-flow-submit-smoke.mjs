/**
 * Live submit smoke test for PRE/POST progression behavior.
 *
 * Required env vars:
 * - APEX_FLOW_SMOKE_BASE_URL
 * - APEX_FLOW_SMOKE_TOKEN
 *
 * Optional:
 * - APEX_FLOW_SMOKE_MODULE_ID
 * - APEX_FLOW_SMOKE_LESSON_ID
 *
 * Run:
 *   npm run test:learning-flow:submit
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

function randomKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function answersOfA(len) {
  return Array.from({ length: Math.max(0, len) }, () => "A");
}

async function run() {
  await hydrateEnvFromFiles();
  const baseUrl = env("APEX_FLOW_SMOKE_BASE_URL");
  const token = env("APEX_FLOW_SMOKE_TOKEN");
  let moduleId = env("APEX_FLOW_SMOKE_MODULE_ID");
  const targetLessonId = env("APEX_FLOW_SMOKE_LESSON_ID");

  if (!baseUrl || !token) {
    console.log("[SKIP] test:learning-flow:submit — set APEX_FLOW_SMOKE_BASE_URL and APEX_FLOW_SMOKE_TOKEN");
    return;
  }

  const cleanBase = baseUrl.replace(/\/+$/, "");
  const authHeaders = { authorization: `Bearer ${token}` };
  const getLessonItems = async (candidateModuleId) => {
    const res = await callJson(
      `${cleanBase}/api/learning/lesson-assessment?moduleId=${encodeURIComponent(candidateModuleId)}`,
      { method: "GET", headers: authHeaders },
    );
    if (res.res.status !== 200) return [];
    return Array.isArray(res.body.items) ? res.body.items : [];
  };
  const hasEligiblePreLesson = async (candidateModuleId) => {
    const items = await getLessonItems(candidateModuleId);
    if (items.length === 0) return false;
    for (const it of items) {
      if (!it?.unlocked) continue;
      const lid = String(it.lessonId ?? "");
      if (!lid) continue;
      // eslint-disable-next-line no-await-in-loop
      const pre = await callJson(
        `${cleanBase}/api/learning/lesson-assessment?lessonId=${encodeURIComponent(lid)}&assessmentType=PRE`,
        { method: "GET", headers: authHeaders },
      );
      if (pre.res.status === 200) return true;
    }
    return false;
  };

  // Pick module automatically if not provided.
  if (!moduleId) {
    const modulesRes = await callJson(`${cleanBase}/api/learning/modules`, {
      method: "GET",
      headers: authHeaders,
    });
    assert.equal(modulesRes.res.status, 200, "GET /learning/modules should return 200");
    const items = Array.isArray(modulesRes.body.items) ? modulesRes.body.items : [];
    const unlocked = items.filter((x) => Boolean(x?.unlocked));
    let picked = null;
    for (const item of unlocked) {
      const id = String(item?.id ?? "");
      if (!id) continue;
      // Pick unlocked module that has at least one unlocked lesson with PRE bank.
      // eslint-disable-next-line no-await-in-loop
      if (await hasEligiblePreLesson(id)) {
        picked = id;
        break;
      }
    }
    if (!picked) {
      throw new Error("No unlocked module with PRE-ready lesson found. Set APEX_FLOW_SMOKE_MODULE_ID manually.");
    }
    moduleId = picked;
    console.log(`[INFO] Auto-picked moduleId: ${moduleId}`);
  }

  const listBeforeRes = await callJson(
    `${cleanBase}/api/learning/lesson-assessment?moduleId=${encodeURIComponent(moduleId)}`,
    { method: "GET", headers: authHeaders },
  );
  assert.equal(listBeforeRes.res.status, 200, "GET lesson list should return 200");
  const beforeItems = Array.isArray(listBeforeRes.body.items) ? listBeforeRes.body.items : [];
  assert.ok(beforeItems.length > 0, "Module must have at least one lesson");

  // Choose target lesson: provided one, else first unlocked lesson with PRE bank available.
  const candidates = targetLessonId
    ? beforeItems.filter((x) => String(x.lessonId) === targetLessonId)
    : beforeItems.filter((x) => Boolean(x.unlocked));
  let lessonId = "";
  let lessonIndex = -1;
  let preBankRes = null;
  for (const c of candidates.length > 0 ? candidates : beforeItems) {
    const lid = String(c.lessonId ?? "");
    if (!lid) continue;
    // eslint-disable-next-line no-await-in-loop
    const tryPre = await callJson(
      `${cleanBase}/api/learning/lesson-assessment?lessonId=${encodeURIComponent(lid)}&assessmentType=PRE`,
      { method: "GET", headers: authHeaders },
    );
    if (tryPre.res.status === 200) {
      lessonId = lid;
      lessonIndex = beforeItems.findIndex((x) => String(x.lessonId) === lid);
      preBankRes = tryPre;
      break;
    }
  }
  assert.ok(lessonId, "No eligible lesson with PRE bank found in selected module");
  const nextLesson = lessonIndex >= 0 ? beforeItems[lessonIndex + 1] : null;
  const preQuestions = Array.isArray(preBankRes?.body?.questions) ? preBankRes.body.questions : [];
  assert.ok(preQuestions.length > 0, "PRE bank should contain questions");

  // 2) Submit PRE.
  const preSubmitRes = await callJson(`${cleanBase}/api/learning/lesson-assessment`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      lessonId,
      assessmentType: "PRE",
      submitKey: randomKey("smoke-pre"),
      answers: answersOfA(preQuestions.length),
    }),
  });
  assert.equal(preSubmitRes.res.status, 200, "POST PRE submit should return 200");

  // 3) After PRE, POST bank should be accessible (not PRE_REQUIRED).
  const postBankRes = await callJson(
    `${cleanBase}/api/learning/lesson-assessment?lessonId=${encodeURIComponent(lessonId)}&assessmentType=POST`,
    { method: "GET", headers: authHeaders },
  );
  assert.notEqual(postBankRes.res.status, 403, "GET POST bank should not be blocked after PRE");
  assert.notEqual(String(postBankRes.body.reason ?? ""), "PRE_REQUIRED", "POST bank should not return PRE_REQUIRED after PRE");
  assert.equal(postBankRes.res.status, 200, "GET POST bank should return 200");
  const postQuestions = Array.isArray(postBankRes.body.questions) ? postBankRes.body.questions : [];
  assert.ok(postQuestions.length > 0, "POST bank should contain questions");

  // 4) Submit POST and verify next lesson unlock follows pass result.
  const postSubmitRes = await callJson(`${cleanBase}/api/learning/lesson-assessment`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      lessonId,
      assessmentType: "POST",
      submitKey: randomKey("smoke-post"),
      answers: answersOfA(postQuestions.length),
    }),
  });
  if (postSubmitRes.res.status !== 200) {
    throw new Error(
      `POST POST-test submit should return 200, got ${postSubmitRes.res.status}. body=${JSON.stringify(
        postSubmitRes.body ?? {},
      )}`,
    );
  }
  const passed = Boolean(postSubmitRes.body.passed);

  if (nextLesson?.lessonId) {
    const listAfterRes = await callJson(
      `${cleanBase}/api/learning/lesson-assessment?moduleId=${encodeURIComponent(moduleId)}`,
      { method: "GET", headers: authHeaders },
    );
    assert.equal(listAfterRes.res.status, 200, "GET lesson list after submit should return 200");
    const afterItems = Array.isArray(listAfterRes.body.items) ? listAfterRes.body.items : [];
    const nextAfter = afterItems.find((x) => String(x.lessonId) === String(nextLesson.lessonId));
    assert.ok(nextAfter, "Next lesson should exist in refreshed lesson list");
    assert.equal(
      Boolean(nextAfter.unlocked),
      passed,
      "Next lesson unlocked should follow current lesson POST pass result",
    );
  } else {
    console.log("[INFO] Target lesson has no next lesson; skipped next-lesson unlock assertion.");
  }

  console.log("Learning flow submit smoke passed.");
}

run().catch((err) => {
  console.error("[FAIL] test:learning-flow:submit", err?.message ?? err);
  process.exitCode = 1;
});

