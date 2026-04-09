import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CALIBRATION_AGGREGATION_NIGHTLY } from "@/lib/assessment/learning-events";
import { CALIBRATION_DIMENSIONS, normalizeError, normalizeVelocity } from "@/lib/calibration/engine";

function isAuthorized(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "";
  return !!expected && auth === expected;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function getCohortVelocityMedian(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gradeLevel: string,
  fallback: number,
) {
  const { data: cohortStudents } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("grade_level", gradeLevel)
    .limit(100);
  const cohortIds = (cohortStudents ?? []).map((s) => s.id);
  if (cohortIds.length === 0) return fallback;

  const { data: cohortProgress } = await supabase
    .from("student_progress")
    .select("student_id, status, updated_at")
    .in("student_id", cohortIds)
    .gte("updated_at", daysAgo(14));
  if (!cohortProgress?.length) return fallback;

  const ratioByStudent = new Map<string, { total: number; mastered: number }>();
  for (const row of cohortProgress) {
    const key = String(row.student_id);
    const cur = ratioByStudent.get(key) ?? { total: 0, mastered: 0 };
    cur.total += 1;
    if (String(row.status) === "MASTERED") cur.mastered += 1;
    ratioByStudent.set(key, cur);
  }
  const ratios = Array.from(ratioByStudent.values())
    .map((v) => (v.total > 0 ? v.mastered / v.total : 0))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!ratios.length) return fallback;

  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 === 0 ? (ratios[mid - 1] + ratios[mid]) / 2 : ratios[mid];
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const nowIso = new Date().toISOString();

    const { data: sessions, error: sessionsError } = await supabase
      .from("assessment_sessions")
      .select("id, user_id, status, sessions_completed")
      .in("status", ["CALIBRATING", "EXTENDED"])
      .gte("calibration_ends_at", nowIso);

    if (sessionsError) {
      return Response.json({ message: sessionsError.message }, { status: 500 });
    }

    let processed = 0;
    let failed = 0;

    for (const session of sessions ?? []) {
      try {
        const { data: student, error: studentError } = await supabase
          .from("student_profiles")
          .select("id, grade_level")
          .eq("user_id", session.user_id)
          .single();
        if (studentError || !student) {
          failed += 1;
          continue;
        }

        const [progressRes, journalsRes] = await Promise.all([
          supabase
            .from("student_progress")
            .select("status, highest_score, updated_at")
            .eq("student_id", student.id)
            .gte("updated_at", daysAgo(14)),
          supabase
            .from("metacognition_journals")
            .select("weekly_confused, created_at")
            .eq("student_id", student.id)
            .gte("created_at", daysAgo(14)),
        ]);

        if (progressRes.error || journalsRes.error) {
          failed += 1;
          continue;
        }

        const progress = progressRes.data ?? [];
        const journals = journalsRes.data ?? [];
        const totalProgress = progress.length;
        const mastered = progress.filter((p) => p.status === "MASTERED").length;
        const learnerMasteryRatio = totalProgress > 0 ? mastered / totalProgress : 0;
        const cohortMedian = await getCohortVelocityMedian(supabase, String(student.grade_level), 0.5);
        const velocityRaw = Math.max(0.1, Math.min(3.0, cohortMedian > 0 ? learnerMasteryRatio / cohortMedian : 1.0));

        const confusionTexts = journals
          .map((j) => String(j.weekly_confused ?? "").trim().toLowerCase())
          .filter((s) => s.length > 0);
        const confusionCount = confusionTexts.length;
        const tokenCounts: Record<string, number> = {};
        for (const text of confusionTexts) {
          for (const token of text.split(/[,.;\n]/g).map((x) => x.trim()).filter(Boolean)) {
            tokenCounts[token] = (tokenCounts[token] ?? 0) + 1;
          }
        }
        const systematicConcepts = Object.entries(tokenCounts)
          .filter(([, count]) => count >= 2)
          .map(([concept, count]) => ({ concept, count }))
          .slice(0, 8);
        const systematicRate = journals.length > 0 ? confusionCount / journals.length : 0;

        const inactivityPenalty = totalProgress === 0 ? 0.35 : 0;
        const engagementRaw =
          Math.min(totalProgress / 10, 1) * 4 +
          Math.min(journals.length / 6, 1) * 3 +
          3 -
          inactivityPenalty;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayIso = todayStart.toISOString();

        await supabase
          .from("calibration_signals")
          .delete()
          .eq("session_id", session.id)
          .gte("recorded_at", todayIso)
          .contains("metadata", { aggregationSource: CALIBRATION_AGGREGATION_NIGHTLY });

        const sessionsCompleted = Number(session.sessions_completed ?? 0);
        const sparseCoverage = sessionsCompleted < 3;

        const engagementRow = {
          user_id: session.user_id,
          session_id: session.id,
          signal_type: "ENGAGEMENT" as const,
          dimension: "global",
          raw_value: Math.max(1, Math.min(10, engagementRaw)),
          normalized_value: Math.max(1, Math.min(10, engagementRaw)),
          metadata: {
            aggregationSource: CALIBRATION_AGGREGATION_NIGHTLY,
            totalProgress,
            journals: journals.length,
            ...(sparseCoverage ? { sparseCalibrationDays: true } : {}),
          },
          recorded_at: nowIso,
        };

        const rows = sparseCoverage
          ? [engagementRow]
          : [
              ...CALIBRATION_DIMENSIONS.map((dim) => ({
                user_id: session.user_id,
                session_id: session.id,
                signal_type: "MASTERY_VELOCITY" as const,
                dimension: dim,
                raw_value: velocityRaw,
                normalized_value: normalizeVelocity(velocityRaw),
                metadata: {
                  aggregationSource: CALIBRATION_AGGREGATION_NIGHTLY,
                  totalProgress,
                  mastered,
                  learnerMasteryRatio,
                  cohortMedian,
                  gradeLevel: student.grade_level,
                },
                recorded_at: nowIso,
              })),
              ...CALIBRATION_DIMENSIONS.map((dim) => ({
                user_id: session.user_id,
                session_id: session.id,
                signal_type: "ERROR_PATTERN" as const,
                dimension: dim,
                raw_value: systematicRate,
                normalized_value: normalizeError(systematicRate),
                metadata: {
                  aggregationSource: CALIBRATION_AGGREGATION_NIGHTLY,
                  journals: journals.length,
                  confusionCount,
                  systematicConcepts,
                },
                recorded_at: nowIso,
              })),
              engagementRow,
            ];

        const { error: insertError } = await supabase.from("calibration_signals").insert(rows);
        if (insertError) {
          failed += 1;
          continue;
        }

        if (!sparseCoverage) {
          for (const dim of CALIBRATION_DIMENSIONS) {
            for (const concept of systematicConcepts) {
              const { data: existing } = await supabase
                .from("assessment_remediation_queue")
                .select("id")
                .eq("user_id", session.user_id)
                .eq("dimension", dim)
                .eq("concept_key", concept.concept)
                .in("status", ["PENDING", "IN_PROGRESS"])
                .limit(1)
                .maybeSingle();

              if (existing?.id) continue;

              await supabase.from("assessment_remediation_queue").insert({
                user_id: session.user_id,
                session_id: session.id,
                dimension: dim,
                concept_key: concept.concept,
                reason: "Repeated confusion detected during calibration period",
                priority: concept.count >= 3 ? "HIGH" : "MEDIUM",
                source_signal: "ERROR_PATTERN",
                status: "PENDING",
                metadata: {
                  count: concept.count,
                  from: "nightly-calibration",
                  date: nowIso,
                },
              });
            }
          }
        }

        const { data: dailySignals } = await supabase
          .from("calibration_signals")
          .select("recorded_at")
          .eq("session_id", session.id)
          .eq("signal_type", "ENGAGEMENT");

        const daySet = new Set(
          (dailySignals ?? []).map((s) => new Date(String(s.recorded_at)).toISOString().slice(0, 10)),
        );

        await supabase
          .from("assessment_sessions")
          .update({
            sessions_completed: daySet.size,
            status: session.status === "EXTENDED" ? "CALIBRATING" : session.status,
            updated_at: nowIso,
          })
          .eq("id", session.id);

        processed += 1;
      } catch {
        failed += 1;
      }
    }

    return Response.json({ processed, failed, ts: nowIso });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

